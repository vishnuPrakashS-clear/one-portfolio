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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false } });
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u } = jwt ? await sb.auth.getUser(jwt) : { data: null };
  if (!u?.user) return json({ ok: false, error: "Sign in to get live prices." }, 401);
  let syms: string[] = [];
  try {
    syms = ((await req.json())?.syms || []).map((s: unknown) => String(s).toUpperCase().replace(/^lse~/i, "LSE~"));
  } catch { /* empty body */ }
  syms = [...new Set(syms.filter((s) => SYM.test(s)))].slice(0, 40);
  const out: Record<string, unknown> = {};
  await Promise.all(syms.map(async (s) => { const q = await quote(s); if (q) out[s] = q; }));
  const fx = await quote("INR=X");
  return json({ ok: true, quotes: out, fx: fx && fx.price > 70 && fx.price < 130 ? { rate: +fx.price.toFixed(3), at: fx.at } : null, fetchedAt: new Date().toISOString() });
});
