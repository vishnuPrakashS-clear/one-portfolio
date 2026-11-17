// One Portfolio — live quotes for the sell-order helper (Supabase Edge Function, free tier).
// A signed-in person sends up to 40 symbols they hold abroad (e.g. "AMZN", "LSE~CSPX"); the function returns the latest
// market price from Yahoo Finance's public chart API (real-time or slightly delayed, depending on the exchange), the day's
// range, the previous close, whether the market is open, and the ₹/$ rate. Nothing is saved.
import { createClient } from "jsr:@supabase/supabase-js@2";

const UA = { "User-Agent": "Mozilla/5.0 (One Portfolio live quotes)", Accept: "application/json" };
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...cors } });
const SYM = /^(LSE~)?[A-Z0-9.\-]{1,12}$/;

async function quote(sym: string) {
  const y = sym.startsWith("LSE~") ? sym.slice(4) + ".L" : sym;
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(y)}?range=1d&interval=5m`, {
      headers: UA,
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const m = (await r.json())?.chart?.result?.[0]?.meta;
    if (!m || !(m.regularMarketPrice > 0)) return null;
    const now = Date.now() / 1000,
      reg = m.currentTradingPeriod?.regular;
    return {
      price: +m.regularMarketPrice,
      at: new Date((m.regularMarketTime || now) * 1000).toISOString(),
      prevClose: m.chartPreviousClose ?? m.previousClose ?? null,
      dayHigh: m.regularMarketDayHigh ?? null,
      dayLow: m.regularMarketDayLow ?? null,
      hi52: m.fiftyTwoWeekHigh ?? null,
      lo52: m.fiftyTwoWeekLow ?? null,
      currency: String(m.currency || ""),
      exchange: String(m.fullExchangeName || m.exchangeName || ""),
      name: String(m.longName || m.shortName || ""),
      type: String(m.instrumentType || ""),
      open: !!reg && now >= reg.start && now < reg.end,
      opens: reg && now < reg.start ? new Date(reg.start * 1000).toISOString() : null,
    };
  } catch {
    return null;
  }
}

// 5 years of daily closes and dividends -> growth, risk, trend and yield (all ratios, so the quote currency doesn't matter)
async function metrics(sym: string) {
  const y = sym.startsWith("LSE~") ? sym.slice(4) + ".L" : sym;
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(y)}?range=5y&interval=1d&events=div`, {
      headers: UA,
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    const res = (await r.json())?.chart?.result?.[0];
    const ts: number[] = res?.timestamp || [],
      cl: (number | null)[] = res?.indicators?.adjclose?.[0]?.adjclose || res?.indicators?.quote?.[0]?.close || [],
      raw: (number | null)[] = res?.indicators?.quote?.[0]?.close || [];
    const pts = ts.map((t, i) => [t, cl[i], raw[i]] as const).filter(([, c, p]) => c != null && c > 0 && p != null) as [number, number, number][];
    if (pts.length < 60) return null;
    const last = pts[pts.length - 1],
      now = last[0];
    const at = (yrs: number) => {
      const t = now - yrs * 365.25 * 86400;
      const p = pts.find((x) => x[0] >= t);
      return p && p[0] - t < 20 * 86400 ? p : null;
    };
    const cagr = (yrs: number) => {
      const p = at(yrs);
      return p ? Math.pow(last[1] / p[1], 1 / yrs) - 1 : null;
    };
    const yr = pts.filter((x) => x[0] >= now - 365.25 * 86400);
    const rets = yr.slice(1).map((x, i) => Math.log(x[1] / yr[i][1]));
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const vol = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, rets.length - 1)) * Math.sqrt(252);
    const hi = Math.max(...yr.map((x) => x[2]));
    const d200 = pts.slice(-200),
      ma200 = d200.reduce((a, x) => a + x[2], 0) / d200.length;
    let dd = 0, peak = 0;
    for (const x of pts.filter((x) => x[0] >= now - 3 * 365.25 * 86400)) { peak = Math.max(peak, x[1]); dd = Math.min(dd, x[1] / peak - 1); }
    const divs = Object.values(res?.events?.dividends || {}) as { amount: number; date: number }[];
    const div12 = divs.filter((d) => d.date >= now - 365.25 * 86400).reduce((a, d) => a + d.amount, 0);
    return {
      r1: cagr(1), r3: cagr(3), r5: cagr(5), vol,
      fromHigh: last[2] / hi - 1,
      vs200: last[2] / ma200 - 1,
      maxDD3: dd,
      yield: div12 / last[2],
    };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false } });
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u } = jwt ? await sb.auth.getUser(jwt) : { data: null };
  if (!u?.user) return json({ ok: false, error: "Sign in to get live prices." }, 401);
  let syms: string[] = [], deep = false;
  try {
    const b = await req.json();
    syms = (b?.syms || []).map((s: unknown) => String(s).toUpperCase().replace(/^lse~/i, "LSE~"));
    deep = !!b?.metrics;
  } catch { /* empty body */ }
  syms = [...new Set(syms.filter((s) => SYM.test(s)))].slice(0, 40);
  const out: Record<string, unknown> = {};
  await Promise.all(syms.map(async (s) => { const q = await quote(s); if (q) out[s] = q; }));
  // growth / risk / yield, only when asked (the "which should I buy" check), for at most 10 symbols
  const met: Record<string, unknown> = {};
  if (deep) await Promise.all(syms.slice(0, 10).map(async (s) => { const m = await metrics(s); if (m) met[s] = m; }));
  const fx = await quote("INR=X");
  return json({ ok: true, quotes: out, metrics: met, fx: fx && fx.price > 70 && fx.price < 130 ? { rate: +fx.price.toFixed(3), at: fx.at } : null, fetchedAt: new Date().toISOString() });
});
