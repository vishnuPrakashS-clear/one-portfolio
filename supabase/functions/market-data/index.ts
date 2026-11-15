// One Portfolio — market data for the Portfolio health screen (Supabase Edge Function, free tier).
// Fills three shared tables with public market data for whatever anyone holds (nothing personal is stored):
//   market_class  NSE index lists: each company's NSE industry and market-cap band (Nifty 100 = large,
//                 Midcap 150 = mid, rest of the Nifty Total Market = small)
//   market_fund   each fund's or ETF's latest disclosed holdings (with sector and band), category, plan,
//                 expense ratio, size, risk, and 1/3/5-year returns against its category average
//   market_stock  each directly held stock's fundamentals: market cap, P/E vs industry P/E, P/B, ROE, debt/equity,
//                 revenue and profit growth, margin and promoter holding
// Sources: niftyindices.com constituent lists (official), and Groww's public fund and stock pages (the data shown on
// groww.in, itself from monthly AMC portfolio disclosures and company filings). Each run does a small batch and skips
// anything fetched in the last few weeks, so the nightly schedule stays well inside the free tier.
import { createClient } from "jsr:@supabase/supabase-js@2";

const UA = { "User-Agent": "Mozilla/5.0 (One Portfolio market data)", Accept: "application/json,text/csv;q=0.9,*/*;q=0.8" };
const FRESH_DAYS = 25, MISS_DAYS = 7, FUNDS_PER_RUN = 18, STOCKS_PER_RUN = 50;
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" } });
const days = (d?: string | null) => (d ? (Date.now() - Date.parse(d)) / 86400000 : Infinity);
const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);

async function get(url: string, ms = 15000): Promise<Response | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    let r: Response;
    try { r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) }); } catch { return null; }
    if (r.ok) return r;
    if (r.status !== 429 && r.status < 500) return null;
    if (attempt === 0) await new Promise((res) => setTimeout(res, 1500));
  }
  return null;
}
async function getJson(url: string) { const r = await get(url); if (!r) return null; try { return await r.json(); } catch { return null; } }
async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
}

/** a company name reduced for matching across sources ("ICICI Bank Ltd." = "ICICI Bank Ltd" = "ICICI BANK LIMITED") */
export function norm(s: string) {
  return s.toLowerCase().replace(/&/g, " and ").replace(/\(india\)/g, " india ").replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(ltd|limited|the|co|company|inc|plc|corp)\b/g, " ").replace(/\s+/g, " ").trim();
}

/* ---------- sectors: everything is mapped to NSE's industry names so stocks and fund holdings add up together ---------- */
const NSE_SECTORS = ["Automobile and Auto Components", "Capital Goods", "Chemicals", "Construction", "Construction Materials", "Consumer Durables", "Consumer Services", "Diversified", "Fast Moving Consumer Goods", "Financial Services", "Forest Materials", "Healthcare", "Information Technology", "Media Entertainment & Publication", "Metals & Mining", "Oil Gas & Consumable Fuels", "Power", "Realty", "Services", "Telecommunication", "Textiles", "Utilities"];
const RULES: [RegExp, string][] = [
  [/bank|financ|insur|nbfc|capital market|broking|asset manag|housing fin|credit|exchange|depositor|fintech|lending/i, "Financial Services"],
  [/software|technolog|\bit\b|computer|internet|data process|digital/i, "Information Technology"],
  [/pharma|health|hospital|diagnos|drug|medical|life science|biotech/i, "Healthcare"],
  [/auto|tyre|tire|vehicle|tractor|two wheeler/i, "Automobile and Auto Components"],
  [/oil|gas|petro|refiner|coal|energy|fuel/i, "Oil Gas & Consumable Fuels"],
  [/power|electric util|renewable|solar/i, "Power"],
  [/fmcg|consumer staple|food|beverage|tobacco|personal care|household|sugar|tea|coffee|dairy|agri/i, "Fast Moving Consumer Goods"],
  [/metal|mining|steel|alumin|copper|zinc|iron/i, "Metals & Mining"],
  [/chemic|fertili|pesticide|paint/i, "Chemicals"],
  [/cement|construction material|ceramic|glass/i, "Construction Materials"],
  [/construct|engineering|infra|road|epc/i, "Construction"],
  [/capital good|industrial|machiner|electrical equip|defence|aerospace|cable|bearing|compressor/i, "Capital Goods"],
  [/telecom|communication/i, "Telecommunication"],
  [/realty|real estate/i, "Realty"],
  [/textile|apparel|garment|yarn/i, "Textiles"],
  [/media|entertain|broadcast|publish|film/i, "Media Entertainment & Publication"],
  [/retail|hotel|restaurant|travel|leisure|e-?commerce|consumer service|airline|aviation/i, "Consumer Services"],
  [/durable|consumer discretion|appliance|jewel|footwear|electronics/i, "Consumer Durables"],
  [/logistic|transport|shipping|port|service/i, "Services"],
  [/utilit|water/i, "Utilities"],
  [/paper|wood|forest/i, "Forest Materials"],
  [/diversified|conglomerate/i, "Diversified"],
];
export function canonSector(s?: string | null): string {
  if (!s) return "Other";
  if (NSE_SECTORS.includes(s)) return s;
  for (const [re, out] of RULES) if (re.test(s)) return out;
  return "Other";
}

/* ---------- NSE index lists ---------- */
type Klass = { isin: string; symbol: string; name: string; industry: string; cap: "L" | "M" | "S" };
function csvRows(t: string) {
  const out: string[][] = [];
  for (const line of t.split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    const cells = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map((c) => c.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"').trim()) || [];
    out.push(cells);
  }
  return out;
}
async function refreshClass(sb: ReturnType<typeof createClient>) {
  const base = "https://www.niftyindices.com/IndexConstituent/";
  const [tm, l, m] = await Promise.all(["ind_niftytotalmarket_list.csv", "ind_nifty100list.csv", "ind_niftymidcap150list.csv"].map(async (f) => { const r = await get(base + f); return r ? csvRows(await r.text()) : null; }));
  if (!tm || !l || !m || tm.length < 500) return { ok: false, error: "NSE lists not reachable" };
  const L = new Set(l.map((r) => r[4])), M = new Set(m.map((r) => r[4]));
  const rows: Klass[] = tm.filter((r) => r[4]).map((r) => ({ isin: r[4], symbol: r[2], name: r[0], industry: r[1], cap: L.has(r[4]) ? "L" : M.has(r[4]) ? "M" : "S" }));
  const { error } = await sb.from("market_class").upsert(rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })), { onConflict: "isin" });
  return { ok: !error, n: rows.length, error: error?.message };
}

/* ---------- funds and ETFs ---------- */
type Target = { isin: string; name: string; mfcode?: string | null; etf: boolean };
const FOREIGN = /\b(inc|corp|corporation|plc|n\.?v|ag|sa|se|ltd adr|adr|holdings inc|class [abc])\b\.?$/i;
// statement names are often abbreviated ("ABSL BALANCED ADVANTAGE FD- DIRN-IDCW POUT"): expand and strip before searching
const ABBR: [RegExp, string][] = [[/\bABSL\b/gi, "Aditya Birla Sun Life"], [/\bICICI PRU\b/gi, "ICICI Prudential"], [/\bPRUENTIAL\b/gi, "Prudential"], [/\bEDEL\b/gi, "Edelweiss"], [/\bFD\b/gi, "Fund"], [/\bMOTILAL OSWAL AMC LTD\b.*?\bMF\b/gi, "Motilal Oswal"], [/\bS&P BSE\b/gi, "BSE"]];
function cleanName(name: string) {
  let n = name;
  for (const [re, to] of ABBR) n = n.replace(re, to);
  n = n.replace(/^[A-Z &]+ MUTUAL FUND\s*-\s*/i, "").replace(/\(formerly[^)]*\)/gi, " ").replace(/\(ELSS[^)]*\)/gi, " ");
  return n.replace(/\b(direct|regular|plan|growth|option|idcw|dividend|payout|pout|reinvestment|div|gr|dir|dirn|reg|pl|opt|others|quarterly|monthly)\b/gi, " ").replace(/[-()]/g, " ").replace(/\s+/g, " ").trim();
}
type Cand = { search_id: string; scheme_code?: string | null; isin?: string | null; entity_type?: string; title?: string };
async function search(q: string): Promise<Cand[]> {
  const j = await getJson(`https://groww.in/v1/api/search/v3/query/global/st_query?page=0&query=${encodeURIComponent(q)}&size=8&web=true`);
  return ((j?.data?.content || []) as Cand[]).filter((c) => c.entity_type === "Scheme" || c.entity_type === "ETF");
}
const WORDS = (s: string) => new Set(cleanName(s).toLowerCase().replace(/-/g, " ").split(/\s+/).filter((w) => w.length > 2 && !/^(fund|the|and|india|mutual|scheme)$/.test(w)));
/** a search result is only taken on name alone when it shares most of the fund's distinctive words */
function alike(title: string, name: string) {
  const a = WORDS(title), b = WORDS(name);
  let n = 0;
  for (const w of b) if (a.has(w)) n++;
  return n >= Math.min(3, Math.max(1, Math.ceil(b.size * 0.6)));
}
async function findScheme(t: Target) {
  const qs: string[] = [];
  if (t.mfcode) { const m = await getJson(`https://api.mfapi.in/mf/${t.mfcode}/latest`); if (m?.meta?.scheme_name) qs.push(cleanName(m.meta.scheme_name)); }
  const c = cleanName(t.name).split(" ");
  qs.push(c.slice(0, 6).join(" "), c.slice(0, 4).join(" "), c.slice(0, 3).join(" "));
  for (const q of [...new Set(qs)].filter((x) => x.length > 3)) {
    const cands = await search(q);
    const hit = (t.isin && cands.find((x) => x.isin === t.isin)) || (t.mfcode && cands.find((x) => String(x.scheme_code) === String(t.mfcode))) || cands.find((x) => (t.etf ? x.entity_type === "ETF" : x.entity_type === "Scheme") && alike(x.title || x.search_id, t.name));
    if (hit) return hit;
  }
  return null;
}
/** an index ETF holds what an index fund on the same index holds; Groww publishes holdings for funds, not ETFs */
async function etfProxy(name: string): Promise<Cand | null> {
  const m = cleanName(name).toUpperCase().match(/\b(NIFTY|SENSEX|BSE|NASDAQ|S&P|NYSE|HANG SENG|BHARAT 22|CPSE)\b.*/);
  if (!m) return null;
  const idx = m[0].replace(/\b(ETF|BEES|EXCHANGE TRADED FUND|FUND|RGESS QUALIFIED)\b/g, " ").replace(/\s+/g, " ").trim();
  for (const q of [`${idx} index fund`, `${idx} fund`]) {
    const hit = (await search(q)).find((x) => x.entity_type === "Scheme" && /direct-growth$/.test(x.search_id));
    if (hit) return hit;
  }
  return null;
}
const pct = (v: unknown) => (typeof v === "number" && isFinite(v) ? Math.round(v * 100) / 100 : null);
async function fetchFund(t: Target, klass: Map<string, Klass>) {
  if (t.etf && /GOLD|SILVER/i.test(t.name)) return null; // gold and silver ETFs are classed by name
  let hit = await findScheme(t), proxy = false;
  if (t.etf && (!hit || hit.entity_type === "ETF")) { hit = await etfProxy(t.name); proxy = !!hit; }
  if (!hit) return null;
  const p = await getJson(`https://groww.in/v1/api/data/mf/web/v4/scheme/search/${encodeURIComponent(hit.search_id)}`);
  if (!p || !p.search_id) return null;
  const regular = /regular/i.test(t.name) && !/direct/i.test(t.name);
  let rer: number | null = null;
  if (regular && p.regular_search_id) { const r = await getJson(`https://groww.in/v1/api/data/mf/web/v4/scheme/search/${encodeURIComponent(p.regular_search_id)}`); rer = r ? Number(r.expense_ratio) || null : null; }
  const rs = (p.return_stats || [])[0] || {};
  const st: Record<string, { stat_1y?: number; stat_3y?: number; stat_5y?: number }> = {};
  for (const s of p.stats || []) st[s.type] = s;
  const holdings = ((p.holdings || []) as { company_name: string; sector_name?: string; corpus_per?: number; nature_name?: string; portfolio_date?: string; stock_search_id?: string | null }[])
    .filter((h) => (h.corpus_per || 0) > 0)
    .map((h) => {
      const k = klass.get(norm(h.company_name)), nat = String(h.nature_name || "").toUpperCase();
      const foreign = !k && nat === "EQUITY" && FOREIGN.test(h.company_name.trim());
      const t = nat === "EQUITY" ? (foreign ? "F" : "E") : nat === "DEBT" ? "D" : nat === "CASH" ? "C" : /GOLD|SILVER|COMMOD/.test(nat + h.company_name.toUpperCase()) ? "G" : nat === "MF" || /FUND|ETF/i.test(h.company_name) ? "O" : "O";
      // a company that isn't on the NSE lists by name (renamed, or beyond the top 750) keeps an unknown band rather than a guess
      return { n: h.company_name, i: k?.isin || null, g: h.stock_search_id || null, s: t === "E" || t === "F" ? (k ? k.industry : canonSector(h.sector_name)) : null, w: Math.round((h.corpus_per || 0) * 100) / 100, t, c: t === "E" ? (k ? k.cap : null) : t === "F" ? "F" : null };
    })
    .sort((a, b) => b.w - a.w)
    .slice(0, 150);
  const asOf = ((p.holdings || [])[0]?.portfolio_date || "").slice(0, 10) || null;
  const info = {
    cat: p.category || null, sub: p.sub_category || null, plan: regular ? "Regular" : p.plan_type || null, er: regular && rer ? rer : Number(p.expense_ratio) || null,
    der: Number(p.expense_ratio) || null, aum: Number(p.aum) || null, risk: rs.risk || p.nfo_risk || null, bench: p.benchmark_name || null,
    r1: pct(st.FUND_RETURN?.stat_1y ?? rs.return1y), r3: pct(st.FUND_RETURN?.stat_3y ?? rs.return3y), r5: pct(st.FUND_RETURN?.stat_5y ?? rs.return5y),
    // the category averages in return_stats agree with the fund's rank; the separate "stats" block can come from another base
    c1: pct(rs.cat_return1y ?? st.CATEGORY_AVG_RETURN?.stat_1y), c3: pct(rs.cat_return3y ?? st.CATEGORY_AVG_RETURN?.stat_3y), c5: pct(rs.cat_return5y ?? st.CATEGORY_AVG_RETURN?.stat_5y),
    rank3: rs.rank3yr ? [rs.rank3yr, rs.rank_count3yr] : null, rank5: rs.rank5yr ? [rs.rank5yr, rs.rank_count5yr] : null,
    alpha: pct(rs.alpha), beta: pct(rs.beta), sharpe: pct(rs.sharpe_ratio), sd: pct(rs.standard_deviation), launch: p.launch_date || null, turnover: Number(p.portfolio_turnover) || null,
    name: p.scheme_name || p.fund_name || null,
    // for an ETF: holdings (and returns) are those of an index fund on the same index; the ETF's own cost isn't known
    ...(proxy ? { proxy: p.scheme_name || p.search_id, plan: "ETF", er: null, der: null } : {}),
  };
  return { isin: t.isin, search_id: p.search_id, scheme_code: String(p.scheme_code || hit.scheme_code || ""), name: p.scheme_name || t.name, info, holdings, as_of: asOf, fetched_at: new Date().toISOString(), miss: null };
}

/* ---------- stocks ---------- */
const num = (s?: string | null) => { if (!s) return null; const v = parseFloat(String(s).replace(/[₹,%Cr\s]/g, "")); return isFinite(v) ? v : null; };
function quarterKey(k: string) { const m = k.match(/([A-Za-z]{3})\s*'?(\d{2})/); if (!m) return 0; const mo = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"].indexOf(m[1].toLowerCase()); return (2000 + +m[2]) * 12 + mo; }
async function fetchStock(isin: string, name: string, klass: Map<string, Klass>, byIsin: Map<string, Klass>) {
  const j = await getJson(`https://groww.in/v1/api/search/v3/query/global/st_query?page=0&query=${encodeURIComponent(isin)}&size=4&web=true`);
  const hit = (j?.data?.content || []).find((c: { isin?: string }) => c.isin === isin);
  if (!hit) return null;
  const p = await getJson(`https://groww.in/v1/api/stocks_data/v1/company/search_id/${encodeURIComponent(hit.search_id)}?page=0&size=10`);
  if (!p || !p.header) return null;
  const f: Record<string, string> = {};
  for (const x of p.fundamentals || []) f[x.name] = x.value;
  const fs: Record<string, { cagr?: { oneYearTtm?: number; threeYearCagr?: number }; yearly?: Record<string, number> }> = {};
  for (const x of p.financialStatement || []) fs[x.title] = x;
  const lastYear = (t: string) => { const y = fs[t]?.yearly || {}; const k = Object.keys(y).sort().pop(); return k ? y[k] : null; };
  const rev = lastYear("Revenue"), prof = lastYear("Profit");
  const sh = p.shareholdingPatternV2?.data || {};
  const qs = Object.keys(sh).sort((a, b) => quarterKey(a) - quarterKey(b));
  const promNow = qs.length ? sh[qs[qs.length - 1]]?.promoters ?? null : null,
    promYr = qs.length >= 5 ? sh[qs[qs.length - 5]]?.promoters ?? null : qs.length ? sh[qs[0]]?.promoters ?? null : null;
  const k = byIsin.get(isin) || klass.get(norm(p.header.displayName || name));
  const info = {
    mcap: num(f["Market Cap"]), pe: num(f["P/E Ratio(TTM)"]), ipe: num(f["Industry P/E"]), pb: num(f["P/B Ratio"]), roe: num(f["ROE"]), de: num(f["Debt to Equity"]),
    dy: num(f["Dividend Yield"]), eps: num(f["EPS(TTM)"]), rev1: fs.Revenue?.cagr?.oneYearTtm ?? null, rev3: fs.Revenue?.cagr?.threeYearCagr ?? null,
    pr1: fs.Profit?.cagr?.oneYearTtm ?? null, pr3: fs.Profit?.cagr?.threeYearCagr ?? null, margin: rev && prof != null ? Math.round((prof / rev) * 1000) / 1000 : null,
    loss: prof != null ? prof < 0 : null, prom: promNow, promYr, cap: k?.cap || null, groww: p.header.industryName || null,
  };
  return { isin, search_id: hit.search_id, nse: p.header.nseScriptCode || hit.nse_scrip_code || null, name: p.header.displayName || name, industry: k?.industry || canonSector(p.header.industryName), info, fetched_at: new Date().toISOString(), miss: null };
}

/* ---------- the run ---------- */
type Watch = { key: string; kind: string; name: string; isin?: string | null; mfcode?: string | null };
async function run(sb: ReturnType<typeof createClient>, rows: { watch: Watch[] | null; holdings: { isin: string; type: string; name: string }[] | null }[], dry: boolean) {
  const out: Record<string, unknown> = {};
  // 1. NSE lists (monthly)
  const { data: cls } = await sb.from("market_class").select("isin, symbol, name, industry, cap, updated_at");
  let klassRows = (cls || []) as (Klass & { updated_at: string })[];
  if (!klassRows.length || days(klassRows[0].updated_at) > FRESH_DAYS) {
    out.class = await refreshClass(sb);
    const { data } = await sb.from("market_class").select("isin, symbol, name, industry, cap, updated_at");
    klassRows = (data || []) as typeof klassRows;
  }
  const klass = new Map<string, Klass>(), byIsin = new Map<string, Klass>();
  for (const k of klassRows) { klass.set(norm(k.name), k); byIsin.set(k.isin, k); }

  // 2. what people hold
  const funds = new Map<string, Target>(), stocks = new Map<string, string>();
  for (const r of rows) {
    for (const h of r.holdings || []) {
      if (!h.isin) continue;
      if (h.type === "mf" || h.type === "etf") funds.set(h.isin, { isin: h.isin, name: h.name, etf: h.type === "etf" });
      else if (h.type === "stock" && /^INE/.test(h.isin)) stocks.set(h.isin, h.name);
    }
    for (const w of r.watch || []) {
      if (!w.isin) continue;
      if (/^INF/.test(w.isin)) funds.set(w.isin, { ...(funds.get(w.isin) || { isin: w.isin, name: w.name, etf: w.kind === "nse" }), mfcode: w.mfcode || null });
      else if (w.kind === "nse" && /^INE/.test(w.isin) && !/^INE\w{4}07/.test(w.isin)) stocks.set(w.isin, w.name);
    }
  }
  const stale = async (table: string, isins: string[]) => {
    const have = new Map<string, { fetched_at: string | null; miss: string | null }>();
    for (let i = 0; i < isins.length; i += 200) {
      const { data } = await sb.from(table).select("isin, fetched_at, miss").in("isin", isins.slice(i, i + 200));
      for (const d of data || []) have.set(d.isin, d);
    }
    return isins.filter((x) => { const h = have.get(x); return !h || (days(h.fetched_at) > FRESH_DAYS && days(h.miss) > MISS_DAYS); });
  };
  const fundTodo = (await stale("market_fund", [...funds.keys()])).slice(0, FUNDS_PER_RUN);
  const stockTodo = (await stale("market_stock", [...stocks.keys()])).slice(0, STOCKS_PER_RUN);
  out.todo = { funds: fundTodo.length, stocks: stockTodo.length, fundsHeld: funds.size, stocksHeld: stocks.size };

  // 3. fetch and store
  const fRows: unknown[] = [], fMiss: string[] = [], sRows: unknown[] = [], sMiss: string[] = [];
  await pool(fundTodo, 3, async (isin) => { const t = funds.get(isin)!; const r = await fetchFund(t, klass).catch(() => null); if (r) fRows.push(r); else fMiss.push(isin); });
  await pool(stockTodo, 5, async (isin) => { const r = await fetchStock(isin, stocks.get(isin)!, klass, byIsin).catch(() => null); if (r) sRows.push(r); else sMiss.push(isin); });
  if (dry) return { ...out, funds: fRows.slice(0, 3), stocks: sRows.slice(0, 3), fMiss, sMiss };
  const t = today();
  if (fRows.length) { const { error } = await sb.from("market_fund").upsert(fRows, { onConflict: "isin" }); if (error) out.fundError = error.message; }
  if (fMiss.length) await sb.from("market_fund").upsert(fMiss.map((isin) => ({ isin, name: funds.get(isin)?.name, miss: t })), { onConflict: "isin" });
  if (sRows.length) { const { error } = await sb.from("market_stock").upsert(sRows, { onConflict: "isin" }); if (error) out.stockError = error.message; }
  if (sMiss.length) await sb.from("market_stock").upsert(sMiss.map((isin) => ({ isin, name: stocks.get(isin), miss: t })), { onConflict: "isin" });
  return { ...out, funds: fRows.length, fundsMissed: fMiss.length, stocks: sRows.length, stocksMissed: sMiss.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const pick = "watch:data->india->watch, holdings:data->india->holdings";
  // a signed-in person opening Portfolio health fills only what they hold; the nightly schedule fills everyone's
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (jwt && jwt.split(".").length === 3) {
    const { data: u } = await sb.auth.getUser(jwt);
    if (u?.user) {
      const { data: r } = await sb.from("portfolio").select(pick).eq("user_id", u.user.id).maybeSingle();
      if (!r) return json({ ok: true, funds: 0, stocks: 0 });
      return json({ ok: true, ...(await run(sb, [r as never], dry)) });
    }
  }
  const { data: k } = await sb.from("job_keys").select("secret").eq("name", "market-data").maybeSingle();
  if (!k || req.headers.get("x-job-key") !== k.secret) return json({ ok: false, error: "Sign in to load market data." }, 401);
  const { data: rows, error } = await sb.from("portfolio").select(pick).not("user_id", "is", null);
  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true, ...(await run(sb, (rows || []) as never, dry)) });
});
