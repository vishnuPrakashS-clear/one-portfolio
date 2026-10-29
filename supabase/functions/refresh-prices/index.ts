// One Portfolio — daily price refresh (Supabase Edge Function, free tier).
// For every user's portfolio row: reads what to price with public.price_refresh_input_row(), fetches prices from
// free public sources (each symbol once, shared across users), and writes them with public.apply_price_refresh(),
// which changes only price fields; the previous version goes to portfolio_history (trimmed to the newest 30 per user).
// Month-end price history is filled separately by the price-history function (it needs more CPU than one call allows).
// Sources: Yahoo Finance chart and search APIs (US, London, NSE, COPX), mfapi.in (mutual fund NAVs),
// INDmoney's CSPX page for the ₹/$ rate it applies (Yahoo INR=X as fallback), screener.in search for missing NSE codes.
import { createClient } from "jsr:@supabase/supabase-js@2";

const UA = { "User-Agent": "Mozilla/5.0 (One Portfolio price refresh)", Accept: "application/json,text/html;q=0.9,*/*;q=0.8" };
const MIN_GAP_MS = 3 * 60 * 60 * 1000; // a row refreshed in the last 3 hours is skipped
const KEEP_VERSIONS = 30;
// NSE codes for ISINs the name searches get wrong
const NSE_BY_ISIN: Record<string, string> = { INE018A01030: "LT", INE736A01011: "CDSL" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" } });

async function get(url: string, ms = 12000): Promise<Response | null> {
  try { const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) }); return r.ok ? r : null; } catch { return null; }
}
function ymdIn(tz: string, unix: number) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(unix * 1000));
}
// last completed daily close from Yahoo's chart API
const memo = new Map<string, Promise<unknown>>();
const once = <T>(k: string, f: () => Promise<T>): Promise<T> => { if (!memo.has(k)) memo.set(k, f()); return memo.get(k) as Promise<T>; };
async function yahoo(sym: string) { return once("y:" + sym, () => yahoo0(sym)); }
async function yahoo0(sym: string) {
  const r = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=10d&interval=1d`);
  if (!r) return null;
  try {
    const j = await r.json(), res = j?.chart?.result?.[0], m = res?.meta; if (!m) return null;
    const ts: number[] = res.timestamp || [], cl: (number | null)[] = res.indicators?.quote?.[0]?.close || [];
    const tz = m.exchangeTimezoneName || "UTC", today = ymdIn(tz, Date.now() / 1000);
    let price: number | null = null, at: string | null = null;
    for (let i = ts.length - 1; i >= 0; i--) { const d = ymdIn(tz, ts[i]); if (cl[i] == null) continue; if (d === today && m.currentTradingPeriod?.regular?.end > Date.now() / 1000) continue; price = cl[i] as number; at = d; break; }
    if (price == null && typeof m.regularMarketPrice === "number") { price = m.regularMarketPrice; at = ymdIn(tz, m.regularMarketTime || Date.now() / 1000); }
    if (price == null || !(price > 0)) return null;
    return { price: +price.toFixed(4), at: at!, currency: String(m.currency || ""), hi52: m.fiftyTwoWeekHigh ?? null, lo52: m.fiftyTwoWeekLow ?? null };
  } catch { return null; }
}
// Yahoo symbol search by ISIN (finds NSE codes the name search misses)
async function yahooIsin(isin: string) { return once("yi:" + isin, async () => {
  const r = await get(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(isin)}&quotesCount=5&newsCount=0`);
  if (!r) return null;
  try { const j = await r.json(); const qs = j?.quotes || []; const q = qs.find((x: { symbol?: string }) => /\.NS$/.test(x.symbol || "")) || qs.find((x: { symbol?: string }) => /\.BO$/.test(x.symbol || "")); return q ? String(q.symbol).replace(/\.(NS|BO)$/, "") : null; } catch { return null; }
}); }
async function fxRate(): Promise<number | null> { return once("fx", fxRate0); }
async function fxRate0(): Promise<number | null> {
  const r = await get("https://www.indmoney.com/ucits/cspx");
  if (r) { const t = await r.text(); const m = t.match(/\$\s*1\s*(?:or|=|≈)\s*₹\s*([\d.]+)/); if (m && +m[1] > 80 && +m[1] < 120) return +m[1]; }
  const y = await yahoo("INR=X"); return y && y.price > 80 && y.price < 120 ? +y.price.toFixed(2) : null;
}
async function mfNav(code: number | string) { return once("m:" + code, () => mfNav0(code)); }
async function mfNav0(code: number | string) {
  const r = await get(`https://api.mfapi.in/mf/${code}/latest`); if (!r) return null;
  try { const j = await r.json(), d = j?.data?.[0]; if (!d) return null; const [dd, mm, yy] = String(d.date).split("-"); return { p: +d.nav, at: `${yy}-${mm}-${dd}`, isinG: j?.meta?.isin_growth, isinD: j?.meta?.isin_div_reinvestment, name: j?.meta?.scheme_name }; } catch { return null; }
}
async function mfFind(name: string, isin: string | null) { return once("f:" + name + "|" + isin, () => mfFind0(name, isin)); }
async function mfFind0(name: string, isin: string | null) {
  const base = name.replace(/\b(DIRECT|PLAN|GROWTH|OPTION|FUND|THE|-)\b/gi, " ").replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2);
  const idcw = /IDCW|DIVIDEND/i.test(name);
  // try the first four words, then the first three, then two: fund houses rename schemes ("Focused 30" became "Focused")
  for (const n of [4, 3, 2]) {
    if (base.length < n && n !== 2) continue;
    const r = await get(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(base.slice(0, n).join(" "))}`); if (!r) continue;
    let list: { schemeCode: number; schemeName: string }[] = []; try { list = await r.json(); } catch { continue; }
    list = list.filter((x) => /direct/i.test(x.schemeName) && (idcw ? /IDCW|DIVIDEND/i.test(x.schemeName) : /growth/i.test(x.schemeName))).slice(0, 8);
    for (const c of list) { const v = await mfNav(c.schemeCode); if (!v) continue; if (fresh(v.at) && (isin ? v.isinG === isin || v.isinD === isin : true)) return { code: c.schemeCode, isin: isin || v.isinG || null, nav: v }; }
  }
  return null;
}
async function nseFind(name: string, isin?: string) { return once("n:" + name + "|" + (isin || ""), () => nseFind0(name, isin)); }
async function nseFind0(name: string, isin?: string) {
  if (isin && NSE_BY_ISIN[isin]) return NSE_BY_ISIN[isin];
  if (isin) { const y = await yahooIsin(isin); if (y) return y; }
  const q = name.replace(/\b(LTD|LIMITED)\b\.?/gi, " ").replace(/\(I\)/gi, " ").replace(/[^A-Za-z0-9& ]/g, " ").replace(/\s+/g, " ").trim();
  const r = await get(`https://www.screener.in/api/company/search/?q=${encodeURIComponent(q)}`); if (!r) return null;
  try { const j = await r.json(); const u = j?.[0]?.url as string | undefined; const m = u && u.match(/\/company\/([^/]+)\//); return m ? m[1] : null; } catch { return null; }
}
const fresh = (d: string | null, days = 10) => !!d && Date.now() - Date.parse(d + "T00:00:00Z") < days * 86400000; // ignore stale quotes (closed schemes, delisted codes)
async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []; let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

type Sb = ReturnType<typeof createClient>;
type Watch = { key: string; kind: string; name: string; isin?: string; nse?: string; mfcode?: number };
// refresh one user's row; returns a summary
async function refreshRow(sb: Sb, rowId: string, dry: boolean) {
  const { data: input, error } = await sb.rpc("price_refresh_input_row", { pid: rowId });
  if (error || !input) return { row: rowId, ok: false, error: error?.message || "no row" };
  const last = input.refreshed_at ? Date.parse(input.refreshed_at) : 0;
  if (!dry && last && Date.now() - last < MIN_GAP_MS) return { row: rowId, ok: true, skipped: "refreshed less than 3 hours ago" };
  const holdings = input.holdings || [], watch: Watch[] = input.india_watch || [];
  if (!holdings.length && !watch.length) return { row: rowId, ok: true, skipped: "nothing to price yet" };

  const skipped: string[] = [], why: Record<string, string> = {}, prices: Record<string, { price: number; priceAt: string }> = {};
  await pool(holdings, 6, async (h: { sym: string; price: number }) => {
    const lse = h.sym.startsWith("LSE~"), y = await yahoo(lse ? h.sym.slice(4) + ".L" : h.sym);
    if (!y || y.currency.toUpperCase() !== "USD" || !fresh(y.at)) { skipped.push(h.sym); return; }
    if (h.price && Math.abs(y.price - h.price) / h.price > 0.25) { skipped.push(`${h.sym} (moved >25%)`); return; }
    prices[h.sym] = { price: y.price, priceAt: y.at };
  });
  const fx = await fxRate();
  const cx = await yahoo("COPX");
  const copx = cx && cx.hi52 && cx.lo52 && cx.price >= cx.lo52 * 0.9 && cx.price <= cx.hi52 * 1.1 ? { ref: "COPX (US-listed, same index)", price: cx.price, lo52: cx.lo52, hi52: cx.hi52, pe: null, at: input.today } : null;
  const india_px: Record<string, { p: number; at: string }> = {}, india_watch: Record<string, Record<string, unknown>> = {};
  const oldPx = input.india_px || {};
  await pool(watch, 6, async (w: Watch) => {
    let v: { p: number; at: string } | null = null;
    if (w.kind === "nse") {
      let nse = (w.isin && NSE_BY_ISIN[w.isin]) || w.nse || null;
      if (nse && nse !== w.nse) india_watch[w.key] = { nse };
      let y = nse ? await yahoo(nse + ".NS") : null;
      if (!y || y.currency.toUpperCase() !== "INR") { const n2 = await nseFind(w.name, w.isin); if (n2 && n2 !== nse) { nse = n2; india_watch[w.key] = { nse }; y = await yahoo(nse + ".NS"); } }
      if (y && y.currency.toUpperCase() === "INR") v = { p: y.price, at: y.at }; else why[w.name] = nse ? `no NSE price for ${nse}` : "no NSE code found";
    } else {
      let code = w.mfcode || null;
      if (!code) { const f = await mfFind(w.name, w.isin || null); if (f) { code = f.code; india_watch[w.key] = { mfcode: f.code, isin: w.isin ? null : f.isin }; v = { p: f.nav.p, at: f.nav.at }; } }
      if (code && !v) { const n = await mfNav(code); if (n && n.p > 0 && fresh(n.at)) v = { p: n.p, at: n.at }; }
      // a stored fund code with no recent NAV (scheme merged or renamed): look the fund up again
      if (code && !v) { const f = await mfFind(w.name, w.isin || null); if (f && f.code !== code) { code = f.code; india_watch[w.key] = { mfcode: f.code }; v = { p: f.nav.p, at: f.nav.at }; } }
      if (!v) why[w.name] = code ? `fund code ${code} has no recent NAV` : "fund not found";
    }
    if (!v || !fresh(v.at)) { skipped.push(w.name); return; }
    const prev = oldPx[w.key]?.p; if (prev && Math.abs(v.p - prev) / prev > 0.4) { skipped.push(`${w.name} (moved >40%)`); return; }
    india_px[w.key] = v;
  });
  const now = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 19) + "+05:30";
  const nUs = Object.keys(prices).length, nIn = Object.keys(india_px).length;
  const log = `Daily price refresh: ${nUs} US/London prices; ₹/$ ${fx ?? "unchanged"}; copper check ${copx ? `${copx.price} (range ${copx.lo52}–${copx.hi52})` : "unchanged"}; India ${nIn} prices; skipped: ${skipped.length ? skipped.slice(0, 12).join(", ") + (skipped.length > 12 ? ` +${skipped.length - 12} more` : "") : "none"}`;
  const payload: Record<string, unknown> = { row_id: rowId, today: input.today, prices, refreshedAt: now, log };
  if (fx) payload.fx = fx; if (copx) payload.copx = copx;
  if (nIn) payload.india_px = india_px; if (Object.keys(india_watch).length) payload.india_watch = india_watch;
  if (dry) return { row: rowId, ok: true, dry: true, us: nUs, india: nIn, fx, copx: !!copx, skipped, why, codes: india_watch };
  const { data: res, error: e2 } = await sb.rpc("apply_price_refresh", { p: payload });
  if (e2) return { row: rowId, ok: false, error: e2.message };
  // keep the newest KEEP_VERSIONS history copies for this row
  const { data: keep } = await sb.from("portfolio_history").select("id").eq("portfolio_id", rowId).order("id", { ascending: false }).range(KEEP_VERSIONS - 1, KEEP_VERSIONS - 1);
  if (keep && keep.length) await sb.from("portfolio_history").delete().eq("portfolio_id", rowId).lt("id", keep[0].id);
  return { row: rowId, ok: true, result: res, us: nUs, india: nIn, fx, copx: !!copx, skipped, why };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const url = new URL(req.url), dry = url.searchParams.get("dry") === "1";
  // a signed-in person pressing "refresh now" refreshes only their own row; the daily schedule refreshes everyone
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  let only: string | null = null;
  if (jwt && jwt.split(".").length === 3) {
    const { data: u } = await sb.auth.getUser(jwt);
    if (u?.user) { const { data: r } = await sb.from("portfolio").select("id").eq("user_id", u.user.id).maybeSingle(); if (!r) return json({ ok: true, us: 0, india: 0, skipped: ["nothing saved yet"] }); only = r.id; }
  }
  if (only) { const r = await refreshRow(sb, only, dry); return json(r, r.ok ? 200 : 500); }
  // refreshing everyone is only for the daily schedule, which sends the job key stored in public.job_keys
  const { data: k } = await sb.from("job_keys").select("secret").eq("name", "refresh-prices").maybeSingle();
  if (!k || req.headers.get("x-job-key") !== k.secret) return json({ ok: false, error: "Sign in to refresh your prices." }, 401);
  const { data: rows, error } = await sb.from("portfolio").select("id").not("user_id", "is", null);
  if (error) return json({ ok: false, error: error.message }, 500);
  const results = [];
  for (const r of rows || []) results.push(await refreshRow(sb, r.id, dry)); // one at a time; prices are shared via memo
  return json({ ok: results.every((x) => x.ok), rows: results.length, results });
});
