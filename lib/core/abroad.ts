/* The abroad sleeve (US and London-listed funds bought through INDmoney): reports, statements, lots, tax dates and the monthly split.
   Pure functions over the saved document; no DOM. */
import type { Bucket, Cell, Holding, ISODate, Lot, Plan, Portfolio, Sale, Settings, Sheet, Target } from "@/types/portfolio";
import { daysBetween, excelDate, fmtDate, iso, ltcgDate, MON, parseLooseDate, TODAY } from "@/lib/dates";
import { fmtQ, usd2 } from "@/lib/format";

const EPS = 1e-7;

export const CATALOG: Record<string, { name: string; bucket: Bucket; plan: Plan }> = {
  "LSE~CSPX": { name: "iShares Core S&P 500 UCITS (Acc)", bucket: "US core", plan: "core" },
  "LSE~CNDX": { name: "iShares Nasdaq 100 UCITS (Acc)", bucket: "US tech", plan: "core" },
  "LSE~IJPA": { name: "iShares Core MSCI Japan IMI UCITS (Acc)", bucket: "Japan", plan: "core" },
  "LSE~CPPR": { name: "Sprott Pure Play Copper Miners UCITS (Acc)", bucket: "Copper", plan: "core" },
  "LSE~COPX": { name: "Global X Copper Miners UCITS (Acc)", bucket: "Copper", plan: "core" },
  TSM: { name: "Taiwan Semiconductor (ADR)", bucket: "Satellite", plan: "core" },
  VOO: { name: "Vanguard S&P 500 ETF", bucket: "US core", plan: "keep" },
  VT: { name: "Vanguard Total World ETF", bucket: "US core", plan: "keep" },
  QQQ: { name: "Invesco QQQ (Nasdaq 100)", bucket: "US tech", plan: "keep" },
  EWJ: { name: "iShares MSCI Japan ETF", bucket: "Japan", plan: "keep" },
  SCHD: { name: "Schwab US Dividend Equity ETF", bucket: "US core", plan: "legacy" },
  VIG: { name: "Vanguard Dividend Appreciation ETF", bucket: "US core", plan: "legacy" },
  AAPL: { name: "Apple", bucket: "US tech", plan: "legacy" },
  AMZN: { name: "Amazon", bucket: "US tech", plan: "legacy" },
  GOOGL: { name: "Alphabet (Google)", bucket: "US tech", plan: "legacy" },
  META: { name: "Meta Platforms", bucket: "US tech", plan: "legacy" },
  MSFT: { name: "Microsoft", bucket: "US tech", plan: "legacy" },
  NVDA: { name: "Nvidia", bucket: "US tech", plan: "legacy" },
  ASML: { name: "ASML (ADR)", bucket: "US tech", plan: "legacy" },
  SPCX: { name: "SpaceX", bucket: "Satellite", plan: "legacy" },
  EWZ: { name: "iShares MSCI Brazil ETF", bucket: "Emerging", plan: "legacy" },
  EWY: { name: "iShares MSCI South Korea ETF", bucket: "Emerging", plan: "legacy" },
  EWT: { name: "iShares MSCI Taiwan ETF", bucket: "Emerging", plan: "legacy" },
};
export const DEFAULT_TARGETS: Target[] = [
  { bucket: "US core", w: 45, buy: "LSE~CSPX" },
  { bucket: "Japan", w: 20, buy: "LSE~IJPA" },
  { bucket: "US tech", w: 20, buy: "LSE~CNDX" },
  { bucket: "Copper", w: 10, buy: "LSE~COPX" },
  { bucket: "Satellite", w: 5, buy: "TSM" },
  { bucket: "Emerging", w: 0, buy: "" },
];
/** single companies: none may pass 10% of the sleeve */
export const SINGLE = new Set(["AAPL", "AMZN", "GOOGL", "META", "MSFT", "NVDA", "ASML", "SPCX", "TSM"]);
/** whole-share-only funds on INDmoney, with a fallback price (USD) used until the fund is held and priced */
export const WHOLE: Record<string, number> = { "LSE~COPX": 63.59, "LSE~CPPR": 22.12 };

export function freshState(): Portfolio {
  return {
    v: 1,
    settings: { monthlyInr: 10000, fx: 96.78, fxAt: "2026-10-09", feePct: 1, slab: 30, cess: 4 },
    targets: JSON.parse(JSON.stringify(DEFAULT_TARGETS)) as Target[],
    holdings: [],
    sales: [],
    seenTx: [],
    checklist: {},
    log: [],
    imports: [],
    updatedAt: null,
  };
}
/** fill defaults into a document loaded from the database */
export function adopt(d: Partial<Portfolio> | null): Portfolio | null {
  if (!d) return null;
  const base = freshState();
  const n = Object.assign(base, d) as Portfolio;
  n.settings = Object.assign(freshState().settings, d.settings);
  n.imports = n.imports || [];
  n.targets?.forEach((t) => {
    if (t.buy === "LSE~CPPR") t.buy = "LSE~COPX";
  });
  return n;
}

/* ---------- holdings helpers ---------- */
export function getH(state: Portfolio, sym: string, name?: string): Holding {
  let h = state.holdings.find((x) => x.sym === sym);
  if (!h) {
    const c = CATALOG[sym];
    h = {
      sym,
      name: c?.name || name || sym,
      bucket: c?.bucket || "Satellite",
      plan: c?.plan || "keep",
      price: null,
      priceAt: null,
      lots: [],
    };
    state.holdings.push(h);
  }
  return h;
}
export const qtyOf = (h: Holding) => h.lots.reduce((s, l) => s + l.q, 0);
export const costOf = (h: Holding) => h.lots.reduce((s, l) => s + l.q * l.p, 0);
export const hasAbroad = (S: Portfolio | null) => !!S && S.holdings.some((h) => qtyOf(h) > EPS);
function fifoReduce(h: Holding, q: number) {
  h.lots.sort((a, b) => a.d.localeCompare(b.d));
  let left = q,
    cost = 0;
  const removed: Sale["lots"] = [];
  for (const l of h.lots) {
    if (left <= EPS) break;
    const take = Math.min(l.q, left);
    l.q -= take;
    left -= take;
    cost += take * l.p;
    removed.push({ d: l.d, q: take, p: l.p });
  }
  h.lots = h.lots.filter((l) => l.q > EPS);
  return { cost, removed };
}
function addLot(h: Holding, lot: Lot) {
  h.lots.push(lot);
  h.lots.sort((a, b) => a.d.localeCompare(b.d));
}
export function noteImport(state: Portfolio, rec: Portfolio["imports"][number]) {
  state.imports = (state.imports || []).filter(
    (x) => !(x.kind === rec.kind && x.period === rec.period && (!rec.file || x.file === rec.file)),
  );
  rec.at = rec.at || new Date().toISOString();
  state.imports.push(rec);
}
export function lastImport(state: Portfolio | null, kind: string) {
  return ((state && state.imports) || [])
    .filter((x) => x.kind === kind)
    .sort((a, b) => String(a.period || "").localeCompare(String(b.period || "")))
    .slice(-1)[0];
}
/** rupee rate on a date: the newest recorded rate on or before it (INDmoney's rate, saved daily) */
export function fxOn(state: Portfolio, d: ISODate): number | null {
  const hist = state.settings?.fxHistory || {};
  const keys = Object.keys(hist)
    .filter((k) => k <= d)
    .sort();
  return keys.length ? hist[keys[keys.length - 1]] : null;
}
const symOf = (s: unknown) =>
  String(s ?? "")
    .trim()
    .toUpperCase()
    .replace(/^LSE[~:\s]+/, "LSE~");

/* ---------- INDmoney Holdings Report (.xls): {sym, since, q, avg} ---------- */
export interface HoldingsReport {
  asOf: ISODate | null;
  rows: { sym: string; since: ISODate | null; q: number; avg: number }[];
}
export function rowsFromHoldingsSheet(aoa: Sheet): HoldingsReport | null {
  const hi = aoa.findIndex(
    (r) =>
      r &&
      String(r[0] || "")
        .toLowerCase()
        .includes("stock symbol") &&
      r.some((c) => /holding since/i.test(String(c || ""))),
  );
  if (hi < 0) return null;
  const head = aoa[hi].map((c) => String(c || "").toLowerCase());
  const col = (k: string) => head.findIndex((c) => c.includes(k));
  const cD = col("holding since"),
    cQ = col("quantity"),
    cA = col("avg");
  let asOf: ISODate | null = null;
  for (const r of aoa.slice(0, hi)) if (r && /holdings as on/i.test(String(r[0]))) asOf = parseLooseDate(r[1]);
  const rows: HoldingsReport["rows"] = [];
  for (const r of aoa.slice(hi + 1)) {
    if (!r || !r[0]) {
      if (rows.length) break;
      else continue;
    }
    const sym = String(r[0]).trim();
    if (/disclaimer/i.test(sym)) break;
    const q = parseFloat(String(r[cQ])),
      avg = parseFloat(String(r[cA]));
    if (!sym || !(q > 0)) continue;
    rows.push({ sym, since: parseLooseDate(r[cD]), q, avg });
  }
  return { asOf, rows };
}
export function applyHoldingsReport(state: Portfolio, rep: HoldingsReport, importDate: ISODate): string[] {
  const changes: string[] = [],
    when = rep.asOf || importDate,
    seen = new Set<string>();
  for (const r of rep.rows) {
    seen.add(r.sym);
    const h = getH(state, r.sym);
    h.reportQty = r.q;
    h.reportAt = when;
    const q0 = qtyOf(h),
      c0 = costOf(h);
    if (!h.lots.length) {
      addLot(h, { d: r.since || when, q: r.q, p: r.avg, src: "report" });
      changes.push(`${r.sym}: added ${fmtQ(r.q)} units (first bought ${r.since || "?"})`);
    } else if (r.q > q0 + 1e-6) {
      const dq = r.q - q0,
        p = Math.max(0, (r.q * r.avg - c0) / dq);
      addLot(h, { d: when, q: dq, p, src: "report-new" });
      changes.push(`${r.sym}: +${fmtQ(dq)} new units, dated ${when} (check the exact buy date in INDmoney orders)`);
    } else if (r.q < q0 - 1e-6) {
      const dq = q0 - r.q,
        { cost, removed } = fifoReduce(h, dq);
      state.sales.push({ d: when, sym: r.sym, q: dq, price: h.price, cost, lots: removed, est: true });
      changes.push(`${r.sym}: ${fmtQ(dq)} units sold (oldest units first)`);
    }
  }
  for (const h of state.holdings) {
    if (!seen.has(h.sym) && qtyOf(h) > EPS && !h.sym.startsWith("LSE~")) {
      const q = qtyOf(h),
        { cost, removed } = fifoReduce(h, q);
      state.sales.push({ d: when, sym: h.sym, q, price: h.price, cost, lots: removed, est: true });
      changes.push(`${h.sym}: no longer in the report, marked as sold`);
    }
  }
  noteImport(state, { kind: "report", period: when, count: rep.rows.length, total: rep.rows.reduce((a, r) => a + r.q * r.avg, 0) });
  return changes;
}

/* ---------- INDmoney Transactions Report: every buy and sell since the account opened ---------- */
export interface Trade {
  d: ISODate;
  side: "buy" | "sell";
  sym: string;
  q: number;
  price: number;
}
export function rowsFromTransactionsSheet(aoa: Sheet): Trade[] | null {
  const norm = (s: Cell) =>
    String(s ?? "")
      .toLowerCase()
      .replace(/[^a-z]/g, "");
  const hi = aoa.findIndex(
    (r) => r && r.some((c) => /symbol|ticker/.test(norm(c))) && r.some((c) => /quantity|qty|units|shares/.test(norm(c))),
  );
  if (hi < 0) return null;
  const head = aoa[hi].map(norm);
  const find = (...ks: string[]) => {
    for (const k of ks) {
      const i = head.findIndex((h) => h.includes(k));
      if (i >= 0) return i;
    }
    return -1;
  };
  const cSym = find("symbol", "ticker"),
    cQ = find("quantity", "qty", "units", "shares");
  const cD = find("executiontime", "executiondate", "tradedate", "transactiondate", "settlementdate", "orderdate", "date", "time");
  const cT = find("transactiontype", "ordertype", "type", "side", "action", "buysell", "activity");
  const cP = find("executionprice", "tradeprice", "avgprice", "price", "rate");
  const cStat = find("status"),
    cA = find("amount", "value", "total");
  if (cD < 0 || cT < 0) return null;
  const num = (v: Cell) => Math.abs(parseFloat(String(v).replace(/[,$]/g, "")));
  const out: Trade[] = [];
  for (const r of aoa.slice(hi + 1)) {
    if (!r || !r[cSym]) continue;
    const t = String(r[cT] ?? "").toLowerCase(),
      side = /\bsell|\bsold/.test(t) ? "sell" : /\bbuy|\bbought|purchase/.test(t) ? "buy" : null;
    if (!side) continue;
    if (cStat >= 0 && /cancel|reject|expire|fail|pending/.test(String(r[cStat] ?? "").toLowerCase())) continue; // only filled orders count
    const q = num(r[cQ]);
    let p = cP >= 0 ? num(r[cP]) : NaN;
    if (!(p > 0) && cA >= 0 && q > 0) p = num(r[cA]) / q;
    const dv = r[cD],
      d = typeof dv === "number" ? excelDate(dv) : parseLooseDate(dv);
    if (!d || !(q > 0) || !(p > 0)) continue;
    out.push({ d, side, sym: symOf(r[cSym]), q, price: p });
  }
  return out.length ? out : null;
}
/* The full history is the best source of purchase dates: rebuild every lot from it (oldest first, sales FIFO). */
export function applyTransactions(state: Portfolio, txs: Trade[]): string[] {
  const changes: string[] = [],
    bySym: Record<string, Trade[]> = {};
  for (const t of [...txs].sort((a, b) => a.d.localeCompare(b.d))) (bySym[t.sym] = bySym[t.sym] || []).push(t);
  state.sales = (state.sales || []).filter((s) => !bySym[s.sym]);
  for (const sym of Object.keys(bySym)) {
    const h = getH(state, sym);
    h.lots = [];
    for (const t of bySym[sym]) {
      if (t.side === "buy") {
        const fx = fxOn(state, t.d);
        addLot(h, { d: t.d, q: t.q, p: t.price, src: "transactions", ...(fx ? { fx } : {}) });
      } else {
        const { cost, removed } = fifoReduce(h, Math.min(t.q, qtyOf(h)));
        state.sales.push({ d: t.d, sym, q: t.q, price: t.price, cost, lots: removed });
      }
      const key = `${t.d}|${t.side}|${sym}|${t.q}`;
      if (!state.seenTx.includes(key)) state.seenTx.push(key);
    }
    if (!h.price && h.lots.length) {
      const l = h.lots[h.lots.length - 1];
      h.price = l.p;
      h.priceAt = l.d;
    }
    const buys = bySym[sym].filter((t) => t.side === "buy").length,
      sells = bySym[sym].length - buys;
    changes.push(
      `${sym}: ${buys} buy${buys === 1 ? "" : "s"}${sells ? `, ${sells} sale${sells === 1 ? "" : "s"}` : ""}; first on ${bySym[sym][0].d}`,
    );
    if (h.reportQty != null && Math.abs(qtyOf(h) - h.reportQty) > 1e-4)
      changes.push(`  check ${sym}: history gives ${fmtQ(qtyOf(h))} units, holdings report says ${fmtQ(h.reportQty)}`);
  }
  noteImport(state, {
    kind: "transactions",
    period: txs
      .map((t) => t.d)
      .sort()
      .slice(-1)[0],
    count: txs.length,
  });
  return changes;
}
/** units counted in a report lot that a dated trade now accounts for: shrink the report lot */
function reconcileReportLots(h: Holding) {
  const target = h.reportQty;
  if (target == null) return;
  let excess = qtyOf(h) - target;
  if (excess <= 1e-6) return;
  for (const l of h.lots.filter((l) => l.src?.startsWith("report")).sort((a, b) => b.q - a.q)) {
    if (excess <= 1e-6) break;
    const t = Math.min(l.q, excess);
    l.q -= t;
    excess -= t;
  }
  h.lots = h.lots.filter((l) => l.q > EPS);
}

/* ---------- trades / prices read by the AI helper from any other document ---------- */
export interface Extracted {
  doc_type?: string;
  as_of?: string | null;
  trades?: { date: string; side: string; symbol: string; units: number; price_usd: number }[];
  prices?: { symbol: string; price_usd: number; as_of?: string }[];
  fx_inr_per_usd?: number | null;
  in_bonds?: {
    isin?: string | null;
    name?: string;
    units?: number;
    invested_inr: number;
    date?: string | null;
    ytm?: number;
    maturity?: string | null;
  }[];
  in_lots?: {
    fund?: string;
    folio?: string;
    symbol?: string | null;
    isin?: string | null;
    platform?: string | null;
    date: string;
    units: number;
    amount_inr?: number;
    tag?: string | null;
  }[];
  in_dividends?: { symbol: string; ex_date: string; qty: number; per_share_inr: number; total_inr: number }[];
  in_holdings?: { name: string; isin?: string | null; units?: number; avg_inr: number; platform?: string }[];
  f1042?: { year: number; gross_income_usd: number; tax_withheld_usd: number };
  notes?: string;
}
export function applyExtracted(state: Portfolio, ex: Extracted, when: ISODate): string[] {
  const changes: string[] = [];
  for (const t of ex.trades || []) {
    const d = parseLooseDate(t.date),
      q = +t.units,
      p = +t.price_usd,
      side = String(t.side || "").toLowerCase(),
      sym = symOf(t.symbol);
    if (!d || !sym || !(q > 0) || !(p > 0) || !["buy", "sell"].includes(side)) continue;
    const key = `${d}|${side}|${sym}|${q}`;
    if (state.seenTx.includes(key)) continue;
    state.seenTx.push(key);
    const h = getH(state, sym);
    if (side === "buy") {
      const fx = fxOn(state, d);
      addLot(h, { d, q, p, src: "document", ...(fx ? { fx } : {}) });
      reconcileReportLots(h);
      if (!h.price) {
        h.price = p;
        h.priceAt = d;
      }
      changes.push(`${sym}: buy of ${fmtQ(q)} on ${d} recorded`);
    } else {
      const { cost, removed } = fifoReduce(h, Math.min(q, qtyOf(h)));
      state.sales.push({ d, sym, q, price: p, cost, lots: removed });
      changes.push(`${sym}: sale of ${fmtQ(q)} on ${d} recorded`);
    }
  }
  for (const pr of ex.prices || []) {
    const sym = symOf(pr.symbol),
      h = state.holdings.find((x) => x.sym === sym),
      p = +pr.price_usd,
      d = parseLooseDate(pr.as_of) || when;
    if (h && p > 0 && (!h.priceAt || d >= h.priceAt)) {
      h.price = p;
      h.priceAt = d;
      changes.push(`${sym}: price ${p} as of ${d}`);
    }
  }
  const fx = Number(ex.fx_inr_per_usd);
  if (fx > 50 && fx < 200) {
    const fd = parseLooseDate(ex.as_of) || when;
    state.settings.fxHistory = { ...state.settings.fxHistory, [fd]: fx };
    state.settings.fx = fx;
    state.settings.fxAt = fd;
    changes.push(`₹ per $ set to ${fx}`);
  }
  return changes;
}

/* ---------- Alpaca monthly statement (PDF text lines) ---------- */
const moneyNum = (s: string) => parseFloat(String(s).replace(/[$,\s]/g, ""));
export interface Statement {
  periodEnd: ISODate | null;
  holdings: { sym: string; q: number; price: number; value: number; costBasis: number }[];
  tx: Trade[];
  longTotal: number | null;
}
export function parseStatementLines(lines: string[]): Statement {
  const out: Statement = { periodEnd: null, holdings: [], tx: [], longTotal: null };
  const all = lines.join("\n");
  const pm = all.match(/Period:\s*([A-Z]+)\s*-\s*(\d{4})/i);
  if (pm && MON[pm[1].slice(0, 3).toLowerCase()] != null) out.periodEnd = iso(+pm[2], MON[pm[1].slice(0, 3).toLowerCase()] + 1, 0);
  const hRe =
    /^([A-Z][A-Z0-9.]{0,6})\s+.+?\s+(\d+(?:\.\d+)?)\s+\$([\d,]+\.\d+)\s+-?\$([\d,]+\.\d+)\s+\$([\d,]+\.\d+)\s+(-?)\$([\d,]+\.\d+)\s+\$([\d,]+\.\d+)\s*$/;
  const tRe =
    /^(\d{2}\/\d{2}\/\d{4})\s+Trade Entry\s+(buy|sell)\s+([A-Z][A-Z0-9.]{0,6})\s+.*?(\d+\.\d+|\d+)\s+\$([\d,]+\.\d+)\s+(-?)\$([\d,]+\.\d+)/i;
  for (const raw of lines) {
    const ln = raw.replace(/\s+/g, " ").trim();
    const lt = ln.match(/^Long\s+\$([\d,]+\.\d+)$/);
    if (lt) out.longTotal = moneyNum(lt[1]);
    let m = ln.match(hRe);
    if (m && m[1] !== "USD") {
      out.holdings.push({ sym: m[1], q: +m[2], price: moneyNum(m[3]), value: moneyNum(m[4]), costBasis: moneyNum(m[8]) });
      continue;
    }
    m = ln.match(tRe);
    if (m) {
      const d = parseLooseDate(m[1]);
      if (d) out.tx.push({ d, side: m[2].toLowerCase() as Trade["side"], sym: m[3], q: +m[4], price: moneyNum(m[5]) });
    }
  }
  return out;
}
export function applyStatement(state: Portfolio, st: Statement): string[] {
  const changes: string[] = [];
  for (const t of st.tx) {
    const key = `${t.d}|${t.side}|${t.sym}|${t.q}`;
    if (state.seenTx.includes(key)) continue;
    state.seenTx.push(key);
    const h = getH(state, t.sym);
    if (t.side === "buy") {
      addLot(h, { d: t.d, q: t.q, p: t.price, src: "statement" });
      changes.push(`${t.sym}: buy of ${fmtQ(t.q)} on ${t.d} recorded`);
    } else {
      const { cost, removed } = fifoReduce(h, t.q);
      state.sales.push({ d: t.d, sym: t.sym, q: t.q, price: t.price, cost, lots: removed });
      changes.push(`${t.sym}: sale of ${fmtQ(t.q)} on ${t.d} recorded`);
    }
  }
  for (const s of st.holdings) {
    const h = getH(state, s.sym);
    // reconcile: the report lot already counted units the statement lists as separate buys
    let excess = qtyOf(h) - s.q;
    if (excess > 1e-6) {
      for (const l of h.lots.filter((l) => l.src?.startsWith("report")).sort((a, b) => b.q - a.q)) {
        if (excess <= 1e-6) break;
        const t = Math.min(l.q, excess);
        l.q -= t;
        excess -= t;
      }
      h.lots = h.lots.filter((l) => l.q > EPS);
    }
    if (!h.lots.length && s.q > 0 && st.periodEnd)
      addLot(h, { d: st.periodEnd, q: s.q, p: s.costBasis / s.q, src: "statement-unknown-date" });
    // match total cost basis by adjusting the report lot price
    const rep = h.lots.find((l) => l.src?.startsWith("report"));
    if (rep && s.costBasis > 0) {
      const other = h.lots.filter((l) => l !== rep).reduce((a, l) => a + l.q * l.p, 0),
        p = (s.costBasis - other) / rep.q;
      if (p > 0 && isFinite(p)) rep.p = p;
    }
    if (!h.priceAt || !st.periodEnd || st.periodEnd >= h.priceAt) {
      h.price = s.price;
      h.priceAt = st.periodEnd;
    }
  }
  noteImport(state, { kind: "statement", period: st.periodEnd, total: st.longTotal });
  if (st.holdings.length) changes.push(`Prices updated for ${st.holdings.length} holdings (as of ${st.periodEnd})`);
  return changes;
}

/* ---------- analytics ---------- */
export function taxRates(s: Settings) {
  const k = 1 + (s.cess || 0) / 100;
  return { st: (s.slab / 100) * k, lt: 0.125 * k };
}
export interface LotRow {
  sym: string;
  plan: Plan;
  d: ISODate;
  q: number;
  p: number;
  price: number;
  gain: number;
  gainInr: number;
  fxBuy: number;
  fxKnown: boolean;
  ltd: ISODate;
  left: number;
  isLT: boolean;
  taxNow: number;
  taxLT: number;
}
export function lotRows(state: Portfolio, today: ISODate = TODAY()): LotRow[] {
  const { st, lt } = taxRates(state.settings),
    fx = state.settings.fx,
    rows: LotRow[] = [];
  for (const h of state.holdings)
    for (const l of h.lots) {
      const price = h.price ?? l.p,
        gain = (price - l.p) * l.q,
        ltd = ltcgDate(l.d),
        left = daysBetween(today, ltd);
      const known = l.fx || fxOn(state, l.d),
        fxBuy = known || fx,
        gainInr = price * l.q * fx - l.p * l.q * fxBuy;
      rows.push({
        sym: h.sym,
        plan: h.plan,
        d: l.d,
        q: l.q,
        p: l.p,
        price,
        gain,
        gainInr,
        fxBuy,
        fxKnown: !!known,
        ltd,
        left,
        isLT: left <= 0,
        taxNow: gainInr > 0 ? gainInr * (left <= 0 ? lt : st) : 0,
        taxLT: gainInr > 0 ? gainInr * lt : 0,
      });
    }
  return rows.sort((a, b) => a.ltd.localeCompare(b.ltd));
}
export type Tone = "good" | "neutral" | "act" | "wait";
export interface Action {
  tone: Tone;
  label: string;
  why: string;
}
export interface HoldingRow extends Omit<Holding, "lots" | "price"> {
  lots: (Lot & { ltd: ISODate })[];
  q: number;
  cost: number;
  price: number;
  value: number;
  gain: number;
  pct: number;
  firstLT: ISODate;
  lastLT: ISODate;
  allLT: boolean;
  action: Action;
}
export function holdingRows(state: Portfolio, today: ISODate = TODAY()): HoldingRow[] {
  return state.holdings
    .filter((h) => qtyOf(h) > EPS)
    .map((h) => {
      const q = qtyOf(h),
        cost = costOf(h),
        price = h.price ?? cost / q,
        value = q * price,
        gain = value - cost;
      const lots = h.lots.map((l) => ({ ...l, ltd: ltcgDate(l.d) }));
      const ds = lots.map((l) => l.ltd).sort(),
        firstLT = ds[0],
        lastLT = ds[ds.length - 1];
      return {
        ...h,
        lots,
        q,
        cost,
        price,
        value,
        gain,
        pct: cost ? gain / cost : 0,
        firstLT,
        lastLT,
        allLT: lastLT <= today,
        action: actionFor(h.plan, gain, lastLT, today),
      };
    });
}
function actionFor(plan: Plan, gain: number, lastLT: ISODate, today: ISODate): Action {
  if (plan === "core") return { tone: "good", label: "Keep buying", why: "Part of your monthly plan." };
  if (plan === "keep")
    return { tone: "neutral", label: "Hold", why: "Good fund, but new money goes to the UCITS version. No need to sell." };
  if (gain < 0)
    return {
      tone: "act",
      label: "Sell: harvest loss",
      why: "Selling at a loss costs no tax, and the loss can cancel gains or carry forward 8 years.",
    };
  if (lastLT > today)
    return {
      tone: "wait",
      label: `Hold to ${fmtDate(lastLT)}`,
      why: "Selling earlier taxes the gain at your slab rate; after this date it is 12.5%.",
    };
  return { tone: "act", label: "Sell now (12.5%)", why: "Past 24 months. Exit and move the money into your plan funds." };
}
export interface BucketRow extends Target {
  value: number;
  pct: number;
  total: number;
}
export function bucketView(state: Portfolio): BucketRow[] {
  const rows = holdingRows(state),
    total = rows.reduce((s, r) => s + r.value, 0),
    by: Record<string, number> = {};
  for (const r of rows) by[r.bucket] = (by[r.bucket] || 0) + r.value;
  const ORDER = ["US core", "Japan", "US tech", "Copper", "Satellite", "Emerging"],
    ord = (b: string) => (ORDER.indexOf(b) < 0 ? 99 : ORDER.indexOf(b));
  return [...state.targets]
    .sort((a, b) => ord(a.bucket) - ord(b.bucket))
    .map((t) => ({ ...t, value: by[t.bucket] || 0, pct: total ? (100 * (by[t.bucket] || 0)) / total : 0 }))
    .concat(
      Object.keys(by)
        .filter((b) => !state.targets.some((t) => t.bucket === b))
        .map((b) => ({ bucket: b, w: 0, buy: "", value: by[b], pct: (100 * by[b]) / total })),
    )
    .map((x) => ({ ...x, total }));
}
export interface ValueCheck {
  zone: "cheap" | "fair" | "expensive" | null;
  pos?: number;
  label?: string;
  text: string;
}
/** where a whole-share fund's US-listed twin sits in its 1-year range: bottom 40% good value, 40–75% fair, top 25% expensive (skip) */
export function valueCheck(state: Portfolio, sym: string): ValueCheck {
  const g = state.settings?.signals?.[sym];
  if (!g || !(g.hi52 > g.lo52) || !g.price) return { zone: null, text: "No value check yet; treated as fair" };
  const pos = Math.min(1, Math.max(0, (g.price - g.lo52) / (g.hi52 - g.lo52))),
    off = 1 - g.price / g.hi52;
  const zone = pos <= 0.4 ? "cheap" : pos <= 0.75 ? "fair" : "expensive";
  const label = { cheap: "Good value", fair: "Fair value", expensive: "Expensive" }[zone];
  return {
    zone,
    pos,
    label,
    text: `${label}: ${g.ref || "the fund"} is at ${Math.round(pos * 100)}% of its 1-year range ($${g.lo52}–$${g.hi52}), ${Math.round(off * 100)}% below its high${g.pe ? `, P/E ${g.pe}` : ""} (${g.at})`,
  };
}
export interface SplitRow {
  bucket: Bucket;
  buy: string;
  w: number;
  paused: boolean;
  std: number;
  reb: number;
  nowPct: number;
  gapUsd: number;
  whole?: boolean;
  px?: number;
  shares?: number;
  vc?: ValueCheck;
  skipWhy?: string;
}
/* Split this month's money. Half follows the standard split, half fills the biggest gaps first, never selling. */
export function monthlySplit(state: Portfolio): { usd: number; rows: SplitRow[] } {
  const s = state.settings,
    usd = (s.monthlyInr / s.fx) * (1 - (s.feePct || 0) / 100);
  const buckets = bucketView(state),
    total = buckets[0] ? buckets[0].total : 0,
    rowsH = holdingRows(state);
  // a single company above 10% of the sleeve gets no new money until it falls back
  const paused = (b: BucketRow) => SINGLE.has(b.buy) && total > 0 && (rowsH.find((r) => r.sym === b.buy)?.value || 0) / total > 0.1;
  const active = buckets
    .filter((b) => b.w > 0 && b.buy)
    .map((b) => (paused(b) ? { ...b, w: 0, paused: true, w0: b.w } : { ...b, paused: false, w0: b.w }));
  const wsum = active.reduce((a, b) => a + b.w, 0) || 1,
    after = total + usd;
  const gaps = active.map((b) => (b.paused ? 0 : Math.max(0, (after * b.w) / wsum - b.value)));
  const gsum = gaps.reduce((a, b) => a + b, 0);
  const fill = gsum <= usd ? active.map((b, i) => gaps[i] + ((usd - gsum) * b.w) / wsum) : gaps.map((g) => (g / gsum) * usd);
  const rows: SplitRow[] = active.map((b, i) => {
    const std = (usd * b.w) / wsum;
    return {
      bucket: b.bucket,
      buy: b.buy,
      w: b.paused ? b.w0 : b.w,
      paused: b.paused,
      std,
      reb: b.paused ? 0 : 0.5 * std + 0.5 * fill[i],
      nowPct: b.pct,
      gapUsd: b.paused ? 0 : (after * b.w) / wsum - b.value,
    };
  });
  // funds INDmoney sells only in whole shares: buy 1 when the bucket is at least half a share under target, otherwise skip it this month
  let freed = 0,
    taken = 0;
  for (const r of rows) {
    if (!WHOLE[r.buy] || r.paused) continue;
    const held = state.holdings.find((h) => h.sym === r.buy),
      px = ((held && held.price) || WHOLE[r.buy]) * 1.0075;
    const vc = valueCheck(state, r.buy),
      behind = r.gapUsd >= 0.5 * px,
      fits = px <= 0.8 * usd;
    const n = behind && fits && vc.zone !== "expensive" ? 1 : 0;
    r.whole = true;
    r.px = px;
    r.shares = n;
    r.vc = vc;
    if (n > 0) {
      taken += n * px - r.reb;
      r.reb = n * px;
    } else {
      freed += r.reb;
      r.reb = 0;
      r.skipWhy = !fits
        ? "1 share costs more than this month's money"
        : !behind
          ? "at or above its 10% target; next share when it falls behind"
          : "expensive right now (near its 1-year high); waiting for a better price";
    }
  }
  const delta = freed - taken,
    rest = rows.filter((r) => !r.whole && !r.paused && r.reb > 0),
    rs = rest.reduce((a, r) => a + r.reb, 0);
  if (rs > 0 && delta) rest.forEach((r) => (r.reb = Math.max(0, r.reb + (delta * r.reb) / rs)));
  return { usd, rows };
}
export interface HealthCheck {
  name: string;
  ok: boolean;
  text: string;
  affects: string;
}
/** data-health checks, run before any figure is trusted */
export function health(state: Portfolio, today: ISODate = TODAY()): HealthCheck[] {
  const rows = holdingRows(state, today),
    total = rows.reduce((a, r) => a + r.value, 0),
    out: HealthCheck[] = [];
  const st = (state.imports || [])
    .filter((x) => x.kind === "statement" && x.total)
    .sort((a, b) => String(a.period).localeCompare(String(b.period)))
    .slice(-1)[0];
  if (st && st.total) {
    const atSt = rows.filter((r) => r.priceAt === st.period).reduce((a, r) => a + r.value, 0),
      all = rows.every((r) => r.priceAt === st.period),
      diff = all ? atSt - st.total : null;
    out.push(
      diff == null
        ? {
            name: "Reconciliation",
            ok: true,
            text: `Last statement total ${usd2(st.total)} (${st.period}). Some prices are newer, so totals aren't compared.`,
            affects: "",
          }
        : {
            name: "Reconciliation",
            ok: Math.abs(diff) <= Math.max(0.5, st.total * 0.01),
            text: `App total ${usd2(atSt)} vs statement ${usd2(st.total)}: difference ${usd2(diff)}.`,
            affects: "Every value and gain figure",
          },
    );
  } else
    out.push({
      name: "Reconciliation",
      ok: false,
      text: "No monthly statement imported yet, so totals can't be checked.",
      affects: "Every value and gain figure",
    });
  const stale = rows.filter((r) => !r.priceAt || daysBetween(r.priceAt, today) > 45);
  out.push({
    name: "Freshness",
    ok: !stale.length,
    text: stale.length
      ? `${stale.map((r) => r.sym.replace("LSE~", "")).join(", ")}: price older than 45 days. Upload the latest statement.`
      : "All prices are from the last 45 days.",
    affects: "Value, gain, allocation",
  });
  const txImp = (state.imports || []).find((x) => x.kind === "transactions");
  const estLots = rows.flatMap((r) =>
    r.lots.filter((l) => !["transactions", "statement", "document"].includes(l.src || "")).map(() => r.sym),
  );
  out.push({
    name: "Purchase dates",
    ok: !!txImp || !estLots.length,
    text: txImp
      ? `Every purchase date comes from your Transactions Report (up to ${txImp.period}).`
      : `${new Set(estLots).size} holdings still use the first-buy date from the holdings report. Upload the Transactions Report to get every purchase's exact date.`,
    affects: "Long-term dates and tax estimates",
  });
  const started = state.settings?.startedOn,
    early = started ? rows.filter((r) => r.lots.some((l) => l.d < started)) : [];
  if (early.length)
    out.push({
      name: "Start date",
      ok: false,
      text: `${early.map((r) => r.sym).join(", ")}: dated before you started (${started}). The Transactions Report confirms the real date, which decides when it can be sold at 12.5%.`,
      affects: "That holding's long-term date",
    });
  const conc = rows.filter((r) => SINGLE.has(r.sym) && total && r.value / total > 0.1);
  out.push({
    name: "Concentration",
    ok: !conc.length,
    text: conc.length
      ? conc
          .map((r) => `${r.sym} is ${((100 * r.value) / total).toFixed(0)}% of the sleeve (limit 10%). Stop adding until it drops below.`)
          .join(" ")
      : "No single company above 10%.",
    affects: "Risk",
  });
  const big = rows.filter((r) => r.pct > 0.6 || r.pct < -0.4);
  out.push({
    name: "Unusual moves",
    ok: !big.length,
    text: big.length
      ? big.map((r) => `${r.sym} ${(r.pct * 100).toFixed(0)}%`).join(", ") + ": check the price before acting."
      : "No gain or loss looks out of range.",
    affects: "Sell decisions",
  });
  const has = (s: string) => rows.some((r) => r.sym === s);
  const dup = [
    ["VOO", "LSE~CSPX"],
    ["VT", "LSE~CSPX"],
    ["QQQ", "LSE~CNDX"],
    ["EWJ", "LSE~IJPA"],
  ].filter(([a, b]) => has(a) && has(b));
  out.push({
    name: "Overlap",
    ok: true,
    text: dup.length
      ? `${dup.map(([a, b]) => `${a} and ${b.replace("LSE~", "")}`).join("; ")} track the same market. That's expected while old holdings wait out their 24 months.`
      : "No two funds track the same index.",
    affects: "",
  });
  return out;
}
