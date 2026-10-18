// One Portfolio — daily price refresh (Supabase Edge Function, free tier).
// Reads what to price with public.price_refresh_input(), fetches prices from free public sources,
// and writes them with public.apply_price_refresh(), which changes only price fields and keeps a history copy.
// Sources: Yahoo Finance chart API (US, London, NSE, COPX), mfapi.in (mutual fund NAVs),
// INDmoney's CSPX page for the ₹/$ rate it applies (Yahoo INR=X as fallback), screener.in search for missing NSE codes.
import { createClient } from "jsr:@supabase/supabase-js@2";

const UA = { "User-Agent": "Mozilla/5.0 (One Portfolio price refresh)", Accept: "application/json,text/html;q=0.9,*/*;q=0.8" };
const MIN_GAP_MS = 3 * 60 * 60 * 1000; // ignore repeat calls within 3 hours
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" } });

async function get(url: string, ms = 12000): Promise<Response | null> {
  try { const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) }); return r.ok ? r : null; } catch { return null; }
}
function ymdIn(tz: string, unix: number) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(unix * 1000));
}
// last completed daily close from Yahoo's chart API
async function yahoo(sym: string) {
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
async function fxRate(): Promise<number | null> {
  const r = await get("https://www.indmoney.com/ucits/cspx");
  if (r) { const t = await r.text(); const m = t.match(/\$\s*1\s*(?:or|=|≈)\s*₹\s*([\d.]+)/); if (m && +m[1] > 80 && +m[1] < 120) return +m[1]; }
  const y = await yahoo("INR=X"); return y && y.price > 80 && y.price < 120 ? +y.price.toFixed(2) : null;
}
async function mfNav(code: number | string) {
  const r = await get(`https://api.mfapi.in/mf/${code}/latest`); if (!r) return null;
  try { const j = await r.json(), d = j?.data?.[0]; if (!d) return null; const [dd, mm, yy] = String(d.date).split("-"); return { p: +d.nav, at: `${yy}-${mm}-${dd}`, isinG: j?.meta?.isin_growth, isinD: j?.meta?.isin_div_reinvestment, name: j?.meta?.scheme_name }; } catch { return null; }
}
async function mfFind(name: string, isin: string | null) {
  const words = name.replace(/\b(DIRECT|PLAN|GROWTH|OPTION|FUND|THE|-)\b/gi, " ").replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2).slice(0, 4).join(" ");
  const r = await get(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(words)}`); if (!r) return null;
  let list: { schemeCode: number; schemeName: string }[] = []; try { list = await r.json(); } catch { return null; }
  const idcw = /IDCW|DIVIDEND/i.test(name);
  list = list.filter((x) => /direct/i.test(x.schemeName) && (idcw ? /IDCW|DIVIDEND/i.test(x.schemeName) : /growth/i.test(x.schemeName))).slice(0, 8);
  for (const c of list) { const n = await mfNav(c.schemeCode); if (!n) continue; if (fresh(n.at) && (isin ? n.isinG === isin || n.isinD === isin : true)) return { code: c.schemeCode, isin: isin || n.isinG || null, nav: n }; }
  return null;
}
async function nseFind(name: string) {
  const r = await get(`https://www.screener.in/api/company/search/?q=${encodeURIComponent(name)}`); if (!r) return null;
  try { const j = await r.json(); const u = j?.[0]?.url as string | undefined; const m = u && u.match(/\/company\/([^/]+)\//); return m ? m[1] : null; } catch { return null; }
}
const fresh = (d: string | null, days = 10) => !!d && Date.now() - Date.parse(d + "T00:00:00Z") < days * 86400000; // ignore stale quotes (closed schemes, delisted codes)
async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []; let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: input, error } = await sb.rpc("price_refresh_input");
  if (error || !input) return json({ ok: false, error: error?.message || "no portfolio row" }, 500);
  const dry = new URL(req.url).searchParams.get("dry") === "1"; // ?dry=1: fetch and report, write nothing
  const last = input.refreshed_at ? Date.parse(input.refreshed_at) : 0;
  if (!dry && last && Date.now() - last < MIN_GAP_MS) return json({ ok: true, skipped: "refreshed less than 3 hours ago", refreshed_at: input.refreshed_at });

  const skipped: string[] = [], prices: Record<string, { price: number; priceAt: string }> = {};
  // US / London
  await pool(input.holdings || [], 6, async (h: { sym: string; price: number }) => {
    const lse = h.sym.startsWith("LSE~"), y = await yahoo(lse ? h.sym.slice(4) + ".L" : h.sym);
    if (!y || y.currency.toUpperCase() !== "USD" || !fresh(y.at)) { skipped.push(h.sym); return; }
    if (h.price && Math.abs(y.price - h.price) / h.price > 0.25) { skipped.push(`${h.sym} (moved >25%)`); return; }
    prices[h.sym] = { price: y.price, priceAt: y.at };
  });
  const fx = await fxRate();
  const cx = await yahoo("COPX");
  const copx = cx && cx.hi52 && cx.lo52 && cx.price >= cx.lo52 * 0.9 && cx.price <= cx.hi52 * 1.1 ? { ref: "COPX (US-listed, same index)", price: cx.price, lo52: cx.lo52, hi52: cx.hi52, pe: null, at: input.today } : null;
  // India: shares/InvITs (NSE via Yahoo) and mutual funds (mfapi.in)
  const india_px: Record<string, { p: number; at: string }> = {}, india_watch: Record<string, Record<string, unknown>> = {};
  const oldPx = input.india_px || {};
  await pool(input.india_watch || [], 6, async (w: { key: string; kind: string; name: string; isin?: string; nse?: string; mfcode?: number }) => {
    let v: { p: number; at: string } | null = null;
    if (w.kind === "nse") {
      let nse = w.nse || null; if (!nse) { nse = await nseFind(w.name); if (nse) india_watch[w.key] = { nse }; }
      if (nse) { const y = await yahoo(nse + ".NS"); if (y && y.currency.toUpperCase() === "INR") v = { p: y.price, at: y.at }; }
    } else {
      let code = w.mfcode || null;
      if (!code) { const f = await mfFind(w.name, w.isin || null); if (f) { code = f.code; india_watch[w.key] = { mfcode: f.code, isin: w.isin ? null : f.isin }; v = { p: f.nav.p, at: f.nav.at }; } }
      if (code && !v) { const n = await mfNav(code); if (n && n.p > 0) v = { p: n.p, at: n.at }; }
    }
    if (!v || !fresh(v.at)) { skipped.push(w.name); return; }
    const prev = oldPx[w.key]?.p; if (prev && Math.abs(v.p - prev) / prev > 0.4) { skipped.push(`${w.name} (moved >40%)`); return; }
    india_px[w.key] = v;
  });
  const now = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 19) + "+05:30";
  const nUs = Object.keys(prices).length, nIn = Object.keys(india_px).length;
  const log = `Daily price refresh: ${nUs} US/London prices; ₹/$ ${fx ?? "unchanged"}; copper check ${copx ? `${copx.price} (range ${copx.lo52}–${copx.hi52})` : "unchanged"}; India ${nIn} prices; skipped: ${skipped.length ? skipped.slice(0, 12).join(", ") + (skipped.length > 12 ? ` +${skipped.length - 12} more` : "") : "none"}`;
  const payload: Record<string, unknown> = { today: input.today, prices, refreshedAt: now, log };
  if (fx) payload.fx = fx; if (copx) payload.copx = copx;
  if (nIn) payload.india_px = india_px; if (Object.keys(india_watch).length) payload.india_watch = india_watch;
  if (dry) return json({ ok: true, dry: true, us: nUs, india: nIn, fx, copx, skipped, payload });
  const { data: res, error: e2 } = await sb.rpc("apply_price_refresh", { p: payload });
  if (e2) return json({ ok: false, error: e2.message }, 500);
  return json({ ok: true, result: res, us: nUs, india: nIn, fx, copx: !!copx, skipped });
});
