// One Portfolio — month-end price history (Supabase Edge Function, free tier).
// The app draws each category's growth over time from month-end prices. Fetching them for every holding at once is
// more CPU than one free-tier call allows, so each call (the schedule runs it every 10 minutes at night) fills the
// next few holdings that have no history yet or are missing last month, and writes them with
// public.apply_price_history(), which touches nothing but data.pxm.
// Sources: Yahoo Finance monthly chart (NSE shares and ETFs, US and London funds) and mfapi.in (mutual fund NAVs).
import { createClient } from "jsr:@supabase/supabase-js@2";

const UA = { "User-Agent": "Mozilla/5.0 (One Portfolio price history)", Accept: "application/json" };
const BATCH = 10, MONTHS = 36;
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
async function get(url: string, ms = 15000): Promise<Response | null> {
  try { const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) }); return r.ok ? r : null; } catch { return null; }
}
const ymNow = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 7);
const ymAdd = (ym: string, n: number) => { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7); };
const ymdIn = (tz: string, unix: number) => new Intl.DateTimeFormat("en-CA", { timeZone: tz || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(unix * 1000));

async function yahooMonthly(sym: string): Promise<Record<string, number> | null> {
  const r = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=5y&interval=1mo`); if (!r) return null;
  try {
    const j = await r.json(), res = j?.chart?.result?.[0], m = res?.meta; if (!m) return null;
    const ts: number[] = res.timestamp || [], cl: (number | null)[] = res.indicators?.adjclose?.[0]?.adjclose || res.indicators?.quote?.[0]?.close || [];
    const tz = m.exchangeTimezoneName || "UTC", cur = ymNow(), from = ymAdd(cur, -MONTHS), out: Record<string, number> = {};
    ts.forEach((t, i) => { const ym = ymdIn(tz, t).slice(0, 7), v = cl[i]; if (v != null && v > 0 && ym >= from && ym < cur) out[ym] = +(+v).toFixed(4); });
    return Object.keys(out).length ? out : null;
  } catch { return null; }
}
async function mfMonthly(code: number | string): Promise<Record<string, number> | null> {
  const r = await get(`https://api.mfapi.in/mf/${code}`); if (!r) return null;
  try {
    const j = await r.json(), cur = ymNow(), from = ymAdd(cur, -MONTHS), out: Record<string, number> = {};
    for (const d of j?.data || []) { // newest first, so the first NAV seen in each month is that month's last
      const s = String(d.date), ym = `${s.slice(6, 10)}-${s.slice(3, 5)}`;
      if (ym < from) break;
      if (ym < cur && !(ym in out)) out[ym] = +d.nav;
    }
    return Object.keys(out).length ? out : null;
  } catch { return null; }
}

type Job = { key: string; src: "y" | "mf"; id: string };
Deno.serve(async (req) => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: k } = await sb.from("job_keys").select("secret").eq("name", "refresh-prices").maybeSingle();
  if (!k || req.headers.get("x-job-key") !== k.secret) return json({ ok: false, error: "not allowed" }, 401);
  const { data: rows, error } = await sb.from("portfolio").select("id").not("user_id", "is", null);
  if (error) return json({ ok: false, error: error.message }, 500);
  const prev = ymAdd(ymNow(), -1), perRow: Record<string, Job[]> = {}, jobs = new Map<string, Job>();
  for (const r of rows || []) {
    const { data: inp } = await sb.rpc("price_refresh_input_row", { pid: r.id }); if (!inp) continue;
    const last: Record<string, string> = inp.pxm_last || {}, need = (key: string) => !last[key] || last[key] < prev;
    const list: Job[] = [];
    for (const h of inp.holdings || []) if (need(h.sym)) list.push({ key: h.sym, src: "y", id: h.sym.startsWith("LSE~") ? h.sym.slice(4) + ".L" : h.sym });
    for (const w of inp.india_watch || []) {
      if (!need(w.key)) continue;
      if (w.kind === "nse" && w.nse) list.push({ key: w.key, src: "y", id: w.nse + ".NS" });
      else if (w.kind !== "nse" && w.mfcode) list.push({ key: w.key, src: "mf", id: String(w.mfcode) });
    }
    perRow[r.id] = list; for (const j of list) if (!jobs.has(j.src + j.id)) jobs.set(j.src + j.id, j);
  }
  const todo = [...jobs.values()].slice(0, BATCH), got = new Map<string, Record<string, number>>(), failed: string[] = [];
  await Promise.all(todo.map(async (j) => { const m = j.src === "mf" ? await mfMonthly(j.id) : await yahooMonthly(j.id); if (m) got.set(j.src + j.id, m); else failed.push(j.id); }));
  const done = new Set(todo.map((j) => j.src + j.id)), results = [];
  for (const [rid, list] of Object.entries(perRow)) {
    const pxm: Record<string, Record<string, number>> = {};
    // a holding with no history to fetch is marked with last month (value null) so it is retried next month, not every call
    for (const j of list) { if (!done.has(j.src + j.id)) continue; const m = got.get(j.src + j.id); pxm[j.key] = m || { [prev]: null as unknown as number }; }
    if (!Object.keys(pxm).length) { results.push({ row: rid, written: 0, left: list.length }); continue; }
    const { data: res, error: e2 } = await sb.rpc("apply_price_history", { rid, pxm });
    results.push({ row: rid, written: Object.keys(pxm).length, left: list.length - Object.keys(pxm).length, result: res, error: e2?.message });
  }
  return json({ ok: true, fetched: got.size, failed, remaining: Math.max(0, jobs.size - todo.length), results });
});
