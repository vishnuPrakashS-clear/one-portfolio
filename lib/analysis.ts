/* Portfolio health: what you really own once every fund is opened up, how well it is spread, where funds repeat each
   other, how each fund and stock holds up, and what to do about it. Pure functions over the view model and the shared
   market data (types/market.ts), so the screen just draws the result.

   Diversification score (0–100, Tickertape's bands: 76+ very good, 51–75 good, 26–50 low, 25 or less extremely low):
     stocks 30   how many companies your equity is really spread over (1 / sum of squared weights, full marks at 30)
                 less if one company is over 10% of your equity
     sectors 25  the same for sectors (full marks at 7), less if one sector is over 35%
     size 15     large / mid / small split against 55 / 25 / 20
     assets 15   equity 50–90% of everything, some money abroad, some in bonds, debt funds or gold
     overlap 15  how much your equity funds hold the same stocks (none = full marks, 50% or more = none)
   A part with no data yet is left out and the score is scaled to the parts that have it. */

import { CATEGORIES } from "@/constants";
import { priceKey } from "@/lib/core/india";
import { fv, steadyMonthly, type Model, type ModelItem } from "@/lib/model";
import type { Portfolio } from "@/types/portfolio";
import type { Cap, FundLine, MarketData, MarketFund, MarketStock, StockInfo } from "@/types/market";

export type Bucket = "equity" | "intl" | "debt" | "gold" | "cash" | "other";
export const BUCKET_NAME: Record<Bucket, string> = {
  equity: "Indian shares",
  intl: "Shares abroad",
  debt: "Bonds & debt",
  gold: "Gold & silver",
  cash: "Cash",
  other: "Other",
};
export const CAP_NAME: Record<Cap | "F" | "?", string> = { L: "Large", M: "Mid", S: "Small", F: "Foreign", "?": "Not classified" };
export const CAP_TARGET: Record<Cap, number> = { L: 0.55, M: 0.25, S: 0.2 };

export interface Via {
  name: string;
  value: number;
}
export interface Exposure {
  key: string;
  name: string;
  isin: string | null;
  value: number;
  /** share of your equity (Indian + foreign shares) */
  pct: number;
  direct: number;
  via: Via[];
  sector: string;
  cap: Cap | "F" | null;
}
export interface Part {
  key: "stocks" | "sectors" | "size" | "assets" | "overlap";
  label: string;
  score: number;
  max: number;
  note: string;
}
export interface Common {
  name: string;
  wa: number;
  wb: number;
}
export interface Overlap {
  a: number;
  b: number;
  /** % of each fund in the same stocks (sum of the smaller weight of each shared stock) */
  pct: number;
  common: Common[];
}
export interface Flag {
  tone: "good" | "wait" | "act";
  text: string;
}
export interface FundRow {
  id: string;
  isin: string;
  name: string;
  short: string;
  value: number;
  /** steady monthly purchase over the last six months */
  sip: number;
  equity: boolean;
  /** an exchange-traded fund (bought like a share) rather than a mutual fund */
  etf: boolean;
  data: MarketFund | null;
  flags: Flag[];
  verdict: "good" | "ok" | "review" | "unknown";
}
export interface StockRow {
  id: string;
  isin: string;
  name: string;
  value: number;
  /** share of everything you own */
  pct: number;
  industry: string;
  cap: Cap | null;
  scores: { valuation: number | null; growth: number | null; quality: number | null; momentum: number | null };
  overall: number | null;
  flags: string[];
  data: MarketStock | null;
}
export interface Action {
  level: 1 | 2 | 3;
  kind: string;
  title: string;
  body: string;
  impact?: string;
}
export interface Analysis {
  total: number;
  buckets: Record<Bucket, number>;
  equity: number;
  /** share of equity whose underlying companies are known */
  mapped: number;
  exposures: Exposure[];
  sectors: { name: string; value: number; pct: number }[];
  caps: Record<Cap | "F" | "?", number>;
  score: number | null;
  band: { label: string; tone: "good" | "wait" | "act"; text: string } | null;
  parts: Part[];
  overDiversified: string[];
  funds: FundRow[];
  overlaps: Overlap[];
  stocks: StockRow[];
  flagged: { value: number; pct: number; count: number };
  actions: Action[];
  coverage: { funds: number; fundsWithData: number; stocks: number; stocksWithData: number };
  asOf: string | null;
}

/** a company name reduced for matching across sources (same rule as the market-data function) */
export function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\(india\)/g, " india ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(ltd|limited|the|co|company|inc|plc|corp)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const pctTxt = (x: number) => `${Math.round(x * 100)}%`;
/** a fund's name without the plan and option words */
export const shortFund = (n: string) =>
  n
    .replace(/\s*[-–(]?\s*(direct|regular)\s*(plan)?\s*[-–)]?\s*(growth|idcw|dividend)?\s*(option|plan)?.*$/i, "")
    .replace(/\b(direct|growth|plan|option)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim() || n;

/** the bucket a fund without look-through data goes to, from its class */
function classSplit(cls: string | undefined): Partial<Record<Bucket, number>> {
  if (cls === "Debt") return { debt: 1 };
  if (cls === "Gold & silver") return { gold: 1 };
  if (cls === "International") return { intl: 1 };
  if (cls === "Hybrid") return { equity: 0.65, debt: 0.35 };
  if (cls === "Other") return { other: 1 };
  return { equity: 1 };
}
function etfSplit(name: string): Partial<Record<Bucket, number>> {
  if (/GOLD|SILVER/i.test(name)) return { gold: 1 };
  if (/NASDAQ|S&P|FANG|HANG SENG|NYSE|GLOBAL|US /i.test(name)) return { intl: 1 };
  if (/LIQUID|GILT|G-?SEC|BOND|BHARAT BOND|SDL|OVERNIGHT|MONEY MARKET/i.test(name)) return { debt: 1 };
  return { equity: 1 };
}

const FIN = /financial|bank|insur/i;

/** a stock's valuation, growth and quality (0–100) and red flags from its fundamentals; P/E under 2 is treated as a
    data glitch (it shows up around demergers) */
export function scoreStock(i: StockInfo | null | undefined, industry: string | null) {
  let valuation: number | null = null,
    growth: number | null = null,
    quality: number | null = null;
  const flags: string[] = [];
  if (!i) return { valuation, growth, quality, flags };
  const pe = i.pe != null && i.pe >= 2 ? i.pe : null;
  if (pe != null)
    valuation =
      i.ipe && i.ipe > 0 ? Math.round(clamp(1 - (pe / i.ipe - 0.5) * 0.66) * 100) : Math.round(clamp(1 - (pe - 10) * 0.015) * 100);
  else if (i.loss) valuation = 10;
  const g1 = i.rev3 ?? i.rev1,
    g2 = i.pr3 ?? i.pr1;
  if (g1 != null || g2 != null) growth = Math.round(clamp((40 + 200 * (0.4 * (g1 ?? g2 ?? 0) + 0.6 * (g2 ?? g1 ?? 0))) / 100) * 100);
  const fin = FIN.test(industry || "");
  let q = i.roe != null ? clamp(i.roe / 25) * 100 : 50;
  if (!fin && i.de != null && i.de > 2) q -= 30;
  else if (!fin && i.de != null && i.de > 1) q -= 15;
  if (i.loss || (i.margin != null && i.margin < 0)) q = Math.min(q, 15);
  quality = Math.round(clamp(q / 100) * 100);
  if (i.loss) flags.push("Making losses");
  if (!fin && i.de != null && i.de > 2) flags.push(`Heavy debt (${i.de.toFixed(1)}× equity)`);
  // above 75% a cut is usually the sell-down every listed company must make to 25% public shareholding
  if (i.prom != null && i.promYr != null && i.prom - i.promYr <= -5 && i.promYr <= 75)
    flags.push(`Promoters cut their stake from ${i.promYr.toFixed(0)}% to ${i.prom.toFixed(0)}% in a year`);
  if (pe != null && i.ipe && pe > 3 * i.ipe && pe > 60)
    flags.push(`Very expensive: P/E ${Math.round(pe)} vs ${Math.round(i.ipe)} for its industry`);
  if (i.mcap != null && i.mcap < 500) flags.push(`Micro-cap (₹${Math.round(i.mcap)} Cr): thinly traded and risky`);
  return { valuation, growth, quality, flags };
}

/** dividend yield as a fraction, ignoring one-off figures above 10% (a special payout or a listing-year glitch) */
export const yieldOf = (i: StockInfo | null | undefined) => (i?.dy != null && i.dy >= 0 && i.dy <= 10 ? i.dy / 100 : null);

export function verdictBand(score: number) {
  if (score >= 76)
    return {
      label: "Very good",
      tone: "good" as const,
      text: "Your money is well spread across companies, sectors and kinds of investment.",
    };
  if (score >= 51)
    return { label: "Good", tone: "good" as const, text: "Reasonably spread, with a few places where too much rides on the same things." };
  if (score >= 26)
    return {
      label: "Low",
      tone: "wait" as const,
      text: "Too much of your money depends on the same companies or sectors. The steps below spread it out.",
    };
  return {
    label: "Extremely low",
    tone: "act" as const,
    text: "Most of your money rides on a few bets. The steps below matter more than any single fund pick.",
  };
}

/** monthly purchase of one holding, from its dated lots over the last six full months */
function itemSip(it: ModelItem, M: Model) {
  const months = M.months.slice(-7, -1);
  const per = months.map((m) => it.lots.filter((l) => l.d.slice(0, 7) === m).reduce((a, l) => a + l.q * l.p, 0));
  return Math.round(steadyMonthly(per) / 100) * 100;
}

/** a holding's ISIN; funds read from the Groww fund report carry only a name, so use the ISIN the price list matched it to */
export function isinOf(S: Portfolio) {
  const w = new Map((S.india?.watch || []).map((x) => [x.key, x.isin]));
  return (h: { type: string; isin: string; name: string }) => h.isin || w.get(priceKey(h)) || "";
}

export function analyse(M: Model, S: Portfolio, D: MarketData): Analysis {
  const buckets: Record<Bucket, number> = { equity: 0, intl: 0, debt: 0, gold: 0, cash: 0, other: 0 };
  const exp = new Map<string, Exposure>();
  const fisin = isinOf(S);
  const gmap = new Map<string, string>(); // Groww stock id → ISIN, from directly held stocks
  for (const s of Object.values(D.stocks)) if (s.search_id) gmap.set(s.search_id, s.isin);
  let unmappedEquity = 0;
  const put = (b: Bucket, v: number) => (buckets[b] += v);
  const addExp = (
    key: string,
    o: { name: string; isin: string | null; value: number; sector?: string | null; cap?: Cap | "F" | null; via?: string; direct?: boolean },
  ) => {
    let e = exp.get(key);
    if (!e) {
      const k = o.isin ? D.klass[o.isin] : undefined,
        st = o.isin ? D.stocks[o.isin] : undefined;
      e = {
        key,
        name: (o.direct && o.name) || k?.name?.replace(/ Ltd\.?$/, "") || o.name,
        isin: o.isin,
        value: 0,
        pct: 0,
        direct: 0,
        via: [],
        sector: k?.industry || st?.industry || o.sector || "Other",
        cap: k?.cap || st?.info?.cap || o.cap || null,
      };
      exp.set(key, e);
    }
    e.value += o.value;
    if (o.direct) e.direct += o.value;
    if (o.via) {
      const v = e.via.find((x) => x.name === o.via);
      if (v) v.value += o.value;
      else e.via.push({ name: o.via, value: o.value });
    }
    if (o.direct && o.name) e.name = o.name;
  };
  const lineKey = (l: FundLine) => l.i || (l.g && gmap.get(l.g)) || (l.g ? "g:" + l.g : "n:" + norm(l.n));

  const fundRows: FundRow[] = [];
  const stockRows: StockRow[] = [];
  const total = M.total;

  // 1. open up every holding
  for (const it of M.cats.funds.items.concat(M.cats.stocks.items)) {
    const h = it.india;
    if (!h) continue;
    if (h.type === "stock") {
      put("equity", it.value);
      addExp(h.isin, { name: it.name, isin: h.isin, value: it.value, direct: true });
      continue;
    }
    if (h.type === "invit") {
      put("other", it.value);
      continue;
    }
    // funds and ETFs
    const isin = fisin(h),
      f = isin ? D.funds[isin] : undefined;
    // an arbitrage fund's shares are matched by futures sold against them: it behaves like cash, not like shares
    const arb = /arbitrage/i.test((f?.info?.sub || "") + " " + it.name);
    const lines = f?.holdings?.length && !arb ? f.holdings : null;
    const name = shortFund(it.name);
    if (lines) {
      const sum = lines.reduce((a, l) => a + l.w, 0) || 100;
      // weights are % of the fund; a list that covers most of it (rounding, tiny lines left out) is spread to the whole,
      // a short one leaves the rest as "other"
      const scale = it.value / (sum >= 85 ? sum : Math.max(sum, 100));
      for (const l of lines) {
        const v = l.w * scale;
        if (l.t === "E" || l.t === "F") {
          put(l.t === "E" ? "equity" : "intl", v);
          addExp(lineKey(l), { name: l.n, isin: l.i, value: v, sector: l.s, cap: l.c, via: name });
        } else if (l.t === "D") put("debt", v);
        else if (l.t === "C") put("cash", v);
        else if (l.t === "G") put("gold", v);
        else {
          const sp =
            h.cls === "International"
              ? { intl: 1 }
              : h.cls === "Gold & silver"
                ? { gold: 1 }
                : h.cls === "Debt"
                  ? { debt: 1 }
                  : { other: 1 };
          for (const [b, w] of Object.entries(sp)) put(b as Bucket, v * (w as number));
        }
      }
      if (sum < 85) {
        const rest = it.value - sum * scale;
        if (rest > 0) put(h.cls === "Debt" ? "debt" : "other", rest);
      }
    } else {
      const sp = arb ? { debt: 1 } : h.type === "etf" ? etfSplit(it.name) : classSplit(h.cls);
      for (const [b, w] of Object.entries(sp)) {
        put(b as Bucket, it.value * (w as number));
        if (b === "equity") unmappedEquity += it.value * (w as number);
      }
    }
    if (h.type === "mf" || (h.type === "etf" && f)) {
      // an equity fund: at least half of what it lists is shares (or, without holdings, its class says so)
      const eq = lines
        ? lines.filter((l) => l.t === "E" || l.t === "F").reduce((a, l) => a + l.w, 0) >= 0.5 * lines.reduce((a, l) => a + l.w, 0)
        : !arb && h.cls === "Equity";
      // the same fund in two folios or accounts is one fund
      const rid = isin || priceKey(h),
        same = fundRows.find((r) => r.isin === rid);
      if (same) {
        same.value += it.value;
        same.sip += itemSip(it, M);
      } else
        fundRows.push({
          id: it.id,
          isin: rid,
          name: it.name,
          short: name,
          value: it.value,
          sip: itemSip(it, M),
          equity: eq,
          etf: h.type === "etf",
          data: f || null,
          flags: [],
          verdict: "unknown",
        });
    }
  }
  for (const it of M.cats.bonds.items) put("debt", it.value);
  for (const it of M.cats.abroad.items) {
    if (/GOLD|GLD|IAU/i.test(it.name + (it.sub || ""))) put("gold", it.value);
    else put("intl", it.value);
  }

  fundRows.sort((a, b) => b.value - a.value);

  // 2. what you really own
  const exposures = [...exp.values()].sort((a, b) => b.value - a.value);
  const stockTotal = exposures.reduce((a, e) => a + e.value, 0);
  for (const e of exposures) {
    e.pct = stockTotal ? e.value / stockTotal : 0;
    e.via.sort((a, b) => b.value - a.value);
  }
  const equity = buckets.equity + buckets.intl;
  const mapped = buckets.equity ? clamp((buckets.equity - unmappedEquity) / buckets.equity) : 0;
  const secMap = new Map<string, number>();
  for (const e of exposures)
    secMap.set(e.cap === "F" ? "Foreign companies" : e.sector, (secMap.get(e.cap === "F" ? "Foreign companies" : e.sector) || 0) + e.value);
  const sectors = [...secMap.entries()]
    .map(([name, value]) => ({ name, value, pct: stockTotal ? value / stockTotal : 0 }))
    .sort((a, b) => b.value - a.value);
  const caps: Record<Cap | "F" | "?", number> = { L: 0, M: 0, S: 0, F: 0, "?": 0 };
  for (const e of exposures) caps[e.cap || "?"] += e.value;

  // 3. fund overlap (equity funds with holdings)
  const eqAll = fundRows.filter((f) => f.equity);
  const eqFunds = eqAll.filter((f) => f.data?.holdings?.length);
  const eqSeen = eqFunds.reduce((a, f) => a + f.value, 0) / (eqAll.reduce((a, f) => a + f.value, 0) || 1);
  const fw = eqFunds.map((f) => {
    const m = new Map<string, { n: string; w: number }>();
    for (const l of f.data!.holdings!) if (l.t === "E" || l.t === "F") m.set(lineKey(l), { n: l.n, w: l.w });
    return m;
  });
  const overlaps: Overlap[] = [];
  for (let a = 0; a < eqFunds.length; a++)
    for (let b = a + 1; b < eqFunds.length; b++) {
      let pct = 0;
      const common: Common[] = [];
      for (const [k, x] of fw[a]) {
        const y = fw[b].get(k);
        if (!y) continue;
        pct += Math.min(x.w, y.w);
        common.push({ name: x.n.replace(/ Ltd\.?$/, ""), wa: x.w, wb: y.w });
      }
      common.sort((p, q) => Math.min(q.wa, q.wb) - Math.min(p.wa, p.wb));
      overlaps.push({
        a: fundRows.indexOf(eqFunds[a]),
        b: fundRows.indexOf(eqFunds[b]),
        pct: Math.round(pct * 10) / 10,
        common: common.slice(0, 8),
      });
    }
  overlaps.sort((p, q) => q.pct - p.pct);

  // 4. the score
  const parts: Part[] = [];
  if (stockTotal > 0) {
    const neff = 1 / exposures.reduce((a, e) => a + e.pct * e.pct, 0),
      top = exposures[0];
    let s = clamp(Math.log(neff) / Math.log(30));
    if (top.pct > 0.1) s *= Math.max(0.5, 1 - (top.pct - 0.1) * 3);
    parts.push({
      key: "stocks",
      label: "Spread across companies",
      score: Math.round(s * 30),
      max: 30,
      note: `Your shares behave like ${Math.round(neff)} equal holdings. The largest, ${top.name}, is ${pctTxt(top.pct)} of your shares.`,
    });
    const known = sectors.filter((x) => x.name !== "Other");
    const kt = known.reduce((a, x) => a + x.value, 0);
    if (kt > 0) {
      const seff = 1 / known.reduce((a, x) => a + (x.value / kt) ** 2, 0),
        st = known[0];
      let s2 = clamp(Math.log(seff) / Math.log(7));
      if (st.value / kt > 0.35) s2 *= Math.max(0.4, 1 - (st.value / kt - 0.35) * 2);
      parts.push({
        key: "sectors",
        label: "Spread across sectors",
        score: Math.round(s2 * 25),
        max: 25,
        note: `${st.name} is the biggest sector at ${pctTxt(st.value / kt)} of your shares.`,
      });
    }
    const lms = caps.L + caps.M + caps.S;
    if (lms > 0 && lms / stockTotal > 0.4) {
      const tv = 0.5 * (["L", "M", "S"] as Cap[]).reduce((a, c) => a + Math.abs(caps[c] / lms - CAP_TARGET[c]), 0);
      parts.push({
        key: "size",
        label: "Large, mid and small companies",
        score: Math.round(clamp(1 - tv / 0.6) * 15),
        max: 15,
        note: `Large ${pctTxt(caps.L / lms)}, mid ${pctTxt(caps.M / lms)}, small ${pctTxt(caps.S / lms)} (a balanced split is about 55 / 25 / 20).`,
      });
    }
  }
  if (total > 0) {
    const e = equity / total,
      intl = buckets.intl / total,
      safe = (buckets.debt + buckets.gold) / total;
    const p1 = e >= 0.5 && e <= 0.9 ? 6 : e > 0.9 ? 6 - (e - 0.9) * 30 : Math.max(0, 6 - (0.5 - e) * 20);
    const sc = clamp(p1 / 6) * 6 + clamp(intl / 0.1) * 5 + clamp(safe / 0.1) * 4;
    parts.push({
      key: "assets",
      label: "Kinds of investment",
      score: Math.round(sc),
      max: 15,
      note: `Shares ${pctTxt(e)} (abroad ${pctTxt(intl)}), bonds, debt and gold ${pctTxt(safe)}.`,
    });
  }
  if (eqAll.length >= 2 && eqFunds.length >= 2 && eqSeen >= 0.6) {
    let num = 0,
      den = 0;
    for (const o of overlaps) {
      const w = fundRows[o.a].value + fundRows[o.b].value;
      num += w * o.pct;
      den += w;
    }
    const avg = den ? num / den : 0;
    parts.push({
      key: "overlap",
      label: "Funds that don't repeat each other",
      score: Math.round(clamp(1 - avg / 50) * 15),
      max: 15,
      note: `Your equity funds share ${Math.round(avg)}% of their stocks on average${overlaps[0] ? `; the closest pair shares ${Math.round(overlaps[0].pct)}%` : ""}.`,
    });
  } else if (eqAll.length === 1 && eqFunds.length === 1)
    parts.push({
      key: "overlap",
      label: "Funds that don't repeat each other",
      score: 15,
      max: 15,
      note: "One equity fund, so nothing repeats.",
    });
  const max = parts.reduce((a, p) => a + p.max, 0);
  // no score until most of what sits inside funds has been opened up: a guess from a few funds would mislead
  const score =
    max >= 40 && (buckets.equity === 0 || mapped >= 0.6) ? Math.round((100 * parts.reduce((a, p) => a + p.score, 0)) / max) : null;

  const directStocks = M.cats.stocks.items.filter((x) => x.india?.type === "stock");
  const overDiversified: string[] = [];
  if (eqAll.length > 7) overDiversified.push(`${eqAll.length} equity funds`);
  if (directStocks.length > 40) overDiversified.push(`${directStocks.length} separate stocks`);

  // 5. each fund's report card
  for (const f of fundRows) {
    const i = f.data?.info;
    if (!i) continue;
    if (i.proxy) {
      f.flags = [{ tone: "wait", text: `An ETF: what it holds is read from ${shortFund(i.proxy)}, an index fund on the same index` }];
      f.verdict = "ok";
      continue;
    }
    const flags: Flag[] = [];
    const d3 = i.r3 != null && i.c3 != null ? i.r3 - i.c3 : null,
      d5 = i.r5 != null && i.c5 != null ? i.r5 - i.c5 : null;
    const index = /index|etf/i.test(f.name + " " + (i.sub || "")),
      passive = index || /gold|silver/i.test(i.sub || "");
    let review = false,
      good = false;
    if (d3 != null) {
      if (d3 >= 1 && (d5 == null || d5 >= 0)) {
        good = true;
        flags.push({ tone: "good", text: `Ahead of its category: ${i.r3!.toFixed(1)}% a year over 3 years vs ${i.c3!.toFixed(1)}%` });
      } else if (d3 <= -1.5 && (d5 == null || d5 <= -1) && passive) {
        // a fund that follows an index or a metal can't pick better stocks: a gap is cost and tracking, worth a cheaper twin
        flags.push({
          tone: "wait",
          text: `${i.r3!.toFixed(1)}% a year over 3 years vs ${i.c3!.toFixed(1)}% for its kind: it follows an index or a metal, so the gap is mostly cost and tracking`,
        });
      } else if (d3 <= -1.5 && (d5 == null || d5 <= -1)) {
        review = true;
        flags.push({
          tone: "act",
          text: `Behind its category: ${i.r3!.toFixed(1)}% a year over 3 years vs ${i.c3!.toFixed(1)}%${d5 != null ? `, and over 5 years too` : ""}`,
        });
      } else
        flags.push({ tone: "wait", text: `About level with its category over 3 years (${i.r3!.toFixed(1)}% vs ${i.c3!.toFixed(1)}%)` });
    }
    if (i.rank3)
      flags.push({
        tone: i.rank3[0] <= i.rank3[1] / 3 ? "good" : i.rank3[0] > (i.rank3[1] * 2) / 3 ? "wait" : "wait",
        text: `Ranked ${i.rank3[0]} of ${i.rank3[1]} in its category over 3 years`,
      });
    if (i.plan === "Regular" && i.er && i.der && i.er > i.der) {
      review = true;
      flags.push({
        tone: "act",
        text: `Regular plan: costs ${(i.er - i.der).toFixed(2)}% a year more than the direct plan of the same fund`,
      });
    }
    if (i.er != null && ((index && i.er > 0.4) || (!index && f.equity && i.er > 1.0)))
      flags.push({
        tone: "wait",
        text: `Costly for its kind: ${i.er.toFixed(2)}% a year (${index ? "index funds often cost 0.1–0.3%" : "good direct equity funds often cost 0.5–0.9%"})`,
      });
    if (i.aum != null && i.aum < 500)
      flags.push({ tone: "wait", text: `Small fund (₹${Math.round(i.aum)} Cr), so it can be closed or merged more easily` });
    if (/sector|thematic/i.test(i.sub || ""))
      flags.push({ tone: "wait", text: `Thematic fund: bets on one theme, so it swings more than a diversified fund` });
    f.flags = flags;
    f.verdict = review ? "review" : good ? "good" : "ok";
  }

  // 6. each directly held stock's scorecard and red flags
  const pxm = S.pxm || {};
  for (const it of directStocks) {
    const h = it.india!;
    const d = D.stocks[h.isin] || null,
      i = d?.info;
    const k = D.klass[h.isin];
    let momentum: number | null = null;
    const { valuation, growth, quality, flags } = scoreStock(i, d?.industry || i?.groww || null);
    if (!i && d?.miss) flags.push("No market data found: check whether it was delisted, suspended or renamed");
    const p = pxm[priceKey(h)] || {},
      units = h.units || 0;
    const now = units ? it.value / units : null,
      p12 = p[M.months[0]],
      p6 = p[M.months[6]];
    if (now && (p12 || p6)) {
      const r12 = p12 ? now / p12 - 1 : null,
        r6 = p6 ? now / p6 - 1 : null;
      const m = r12 != null && r6 != null ? 0.6 * r12 + 0.4 * r6 * 1.6 : (r12 ?? (r6 as number) * 1.6);
      momentum = Math.round(clamp(0.5 + m) * 100);
    }
    const sc = [valuation, growth, quality, momentum].filter((x): x is number => x != null);
    stockRows.push({
      id: it.id,
      isin: h.isin,
      name: it.name,
      value: it.value,
      pct: total ? it.value / total : 0,
      industry: k?.industry || d?.industry || "Other",
      cap: k?.cap || i?.cap || null,
      scores: { valuation, growth, quality, momentum },
      overall: sc.length >= 2 ? Math.round(sc.reduce((a, b) => a + b, 0) / sc.length) : null,
      flags,
      data: d,
    });
  }
  stockRows.sort((a, b) => b.value - a.value);
  const fl = stockRows.filter((s) => s.flags.length);
  const flagged = {
    value: fl.reduce((a, s) => a + s.value, 0),
    pct: total ? fl.reduce((a, s) => a + s.value, 0) / total : 0,
    count: fl.length,
  };

  // 7. what to do, most useful first
  const actions = plan({
    total,
    buckets,
    exposures,
    sectors,
    caps,
    stockTotal,
    fundRows,
    overlaps,
    stockRows,
    directStocks: directStocks.length,
    rate: CATEGORIES.funds.rates[1],
  });

  const asOf =
    fundRows
      .map((f) => f.data?.as_of)
      .filter((x): x is string => !!x)
      .sort()
      .pop() || null;
  return {
    total,
    buckets,
    equity,
    mapped,
    exposures,
    sectors,
    caps,
    score,
    band: score == null ? null : verdictBand(score),
    parts,
    overDiversified,
    funds: fundRows,
    overlaps,
    stocks: stockRows,
    flagged,
    actions,
    coverage: {
      funds: fundRows.length,
      fundsWithData: fundRows.filter((f) => f.data?.holdings?.length).length,
      stocks: directStocks.length,
      stocksWithData: stockRows.filter((s) => s.data?.info).length,
    },
    asOf,
  };
}

/** how good a fund's record is for keeping: beating its category (5 years counts double), low cost, direct plan */
export function fundMerit(f: FundRow) {
  const i = f.data?.info;
  if (!i) return 0;
  const d5 = i.r5 != null && i.c5 != null ? i.r5 - i.c5 : null,
    d3 = i.r3 != null && i.c3 != null ? i.r3 - i.c3 : null;
  return (d5 ?? d3 ?? 0) * 2 + (d3 ?? 0) - (i.er ?? 1) * 1.5 + (i.plan === "Regular" ? -2 : 0);
}
/** a fund's record in a few words */
export function fundWhy(f: FundRow) {
  const i = f.data?.info;
  if (!i) return "";
  const bits: string[] = [];
  if (i.r5 != null && i.c5 != null)
    bits.push(`${(i.r5 - i.c5 >= 0 ? "+" : "") + (i.r5 - i.c5).toFixed(1)}% a year vs its category over 5 years`);
  else if (i.r3 != null && i.c3 != null)
    bits.push(`${(i.r3 - i.c3 >= 0 ? "+" : "") + (i.r3 - i.c3).toFixed(1)}% a year vs its category over 3 years`);
  if (i.er != null) bits.push(`costs ${i.er.toFixed(2)}% a year`);
  return bits.join(", ");
}

/** extra wealth over `yrs` from paying `cut` less a year on `value` growing at `r` */
const costGain = (value: number, cut: number, r: number, yrs = 10) => fv(value, 0, r, yrs) - fv(value, 0, r - cut, yrs);

function plan(x: {
  total: number;
  buckets: Record<Bucket, number>;
  exposures: Exposure[];
  sectors: { name: string; value: number; pct: number }[];
  caps: Record<Cap | "F" | "?", number>;
  stockTotal: number;
  fundRows: FundRow[];
  overlaps: Overlap[];
  stockRows: StockRow[];
  directStocks: number;
  rate: number;
}): Action[] {
  const A: Action[] = [];
  const inr = (v: number) => "₹" + Math.round(v).toLocaleString("en-IN");
  const better = (a: FundRow, b: FundRow) => (fundMerit(a) >= fundMerit(b) ? a : b);
  const why = fundWhy;

  // overlapping funds: funds linked by 40%+ overlap form a group, and each group gets one keeper
  const parent = x.fundRows.map((_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  const high = x.overlaps.filter((o) => o.pct >= 40);
  for (const o of high) parent[root(o.a)] = root(o.b);
  const groups = new Map<number, number[]>();
  for (const o of high) for (const i of [o.a, o.b]) groups.set(root(i), [...new Set([...(groups.get(root(i)) || []), i])]);
  const covered = new Set<number>();
  for (const ids of groups.values()) {
    const fs = ids.map((i) => x.fundRows[i]).sort((p, q) => q.value - p.value);
    ids.forEach((i) => covered.add(i));
    const keep = fs.reduce((p, q) => better(p, q)),
      drop = fs.filter((f) => f !== keep);
    const pairs = high.filter((o) => ids.includes(o.a) && ids.includes(o.b)).sort((p, q) => q.pct - p.pct);
    const top = pairs[0];
    const sip = drop.reduce((a, f) => a + f.sip, 0),
      moved = drop.reduce((a, f) => a + f.value, 0);
    A.push({
      level: 1,
      kind: "overlap",
      title:
        fs.length === 2
          ? `${fs[0].short} and ${fs[1].short} hold ${Math.round(top.pct)}% the same stocks`
          : `${fs.length} of your funds hold mostly the same stocks`,
      body:
        (fs.length > 2
          ? `${pairs
              .slice(0, 4)
              .map((o) => `${x.fundRows[o.a].short} & ${x.fundRows[o.b].short} ${Math.round(o.pct)}%`)
              .join("; ")}. `
          : "") +
        `Shared: ${top.common
          .slice(0, 4)
          .map((c) => c.name)
          .join(", ")}. Holding them all adds cost and tracking without spreading your money further. ` +
        `Keep ${keep.short}${why(keep) ? ` (${why(keep)})` : ""}; stop new money into ${drop.map((f) => f.short).join(", ")}${sip ? ` (${inr(sip)} a month)` : ""} and send it to ${keep.short} or to a fund that fills a gap below. ` +
        `Move the existing ${inr(moved)} only after each purchase is a year old: gains over ₹1.25 lakh a year are taxed 12.5% after a year, 20% before, and many funds charge 1% to leave within a year.`,
    });
  }
  const mid = x.overlaps.filter((o) => o.pct >= 25 && o.pct < 40 && !(covered.has(o.a) && covered.has(o.b) && root(o.a) === root(o.b)));
  if (mid.length)
    A.push({
      level: 2,
      kind: "overlap",
      title: `${mid.length} more pair${mid.length > 1 ? "s" : ""} of funds share a quarter or more of their stocks`,
      body:
        mid
          .slice(0, 4)
          .map((o) => `${x.fundRows[o.a].short} & ${x.fundRows[o.b].short} (${Math.round(o.pct)}%)`)
          .join("; ") + ". Not urgent, but when you add money, prefer the one of each pair with the better record.",
    });

  // same kind of fund more than once
  const bySub = new Map<string, FundRow[]>();
  for (const [i, f] of x.fundRows.entries()) {
    const sub = f.data?.info?.sub;
    // already decided in an overlap group; thematic and sectoral funds share a label but not a theme
    if (!f.equity || !sub || covered.has(i) || /thematic|sectoral/i.test(sub)) continue;
    bySub.set(sub, [...(bySub.get(sub) || []), f]);
  }
  for (const [sub, fs] of bySub) {
    if (fs.length < 2) continue;
    const best = fs.reduce((p, q) => better(p, q));
    A.push({
      level: fs.length >= 3 ? 1 : 2,
      kind: "duplicate",
      title: `${fs.length} ${sub} funds doing the same job`,
      body: `${fs.map((f) => f.short).join(", ")}. One fund per kind is enough; funds of the same kind buy mostly the same companies. ${best.short} has the best record of these${why(best) ? ` (${why(best)})` : ""}: point new money there and let the others run down as their purchases turn a year old.`,
    });
  }
  const eqN = x.fundRows.filter((f) => f.equity).length;
  if (eqN > 6)
    A.push({
      level: 2,
      kind: "too-many",
      title: `${eqN} equity funds is more than you need`,
      body: "Four or five well-chosen funds cover the whole market: a Nifty 50 or large-cap index fund, one flexi-cap, one mid-cap, one small-cap, and optionally one international fund. More funds mostly means more of the same stocks, more paperwork and harder tax planning.",
    });

  // single company and sector concentration
  const top = x.exposures[0];
  if (top && top.pct > 0.08)
    A.push({
      level: top.pct > 0.12 ? 1 : 2,
      kind: "stock",
      title: `${top.name} is ${pctTxt(top.pct)} of your shares`,
      body: `It reaches you ${top.direct ? `directly (${inr(top.direct)})` : ""}${top.direct && top.via.length ? " and " : ""}${top.via.length ? `through ${top.via.length} fund${top.via.length > 1 ? "s" : ""}` : ""}, ${inr(top.value)} in all. A bad year for one company shouldn't dent your whole plan: avoid buying more of it directly, and favour funds that hold less of it.`,
    });
  const sec = x.sectors.filter((s) => s.name !== "Other")[0];
  if (sec && sec.pct > 0.35)
    A.push({
      level: 2,
      kind: "sector",
      title: `${sec.name} is ${pctTxt(sec.pct)} of your shares`,
      body: `Most diversified funds keep any one sector near 15–30%. When ${sec.name.toLowerCase()} has a bad patch, a third of your shares fall together. New money into broad funds that are lighter on it (an index fund of the whole market, or a fund focused elsewhere) evens this out without selling.`,
    });

  // company size
  const lms = x.caps.L + x.caps.M + x.caps.S;
  if (lms > 0 && lms / x.stockTotal > 0.4) {
    const L = x.caps.L / lms,
      Mi = x.caps.M / lms,
      Sm = x.caps.S / lms;
    if (Sm > 0.35)
      A.push({
        level: 2,
        kind: "size",
        title: `Small companies are ${pctTxt(Sm)} of your shares`,
        body: "Small companies can grow faster but fall 30–50% in bad years and take longer to recover. Keeping them nearer 15–25% and the rest in large and mid companies keeps the ride bearable while still capturing growth.",
      });
    else if (Mi + Sm < 0.2)
      A.push({
        level: 3,
        kind: "size",
        title: `Only ${pctTxt(Mi + Sm)} of your shares are in mid and small companies`,
        body: "Over 10+ years mid and small companies have usually grown faster than large ones, with bigger swings. For goals 7+ years away, a mid-cap or small-cap index fund for 20–40% of new money adds that growth at low cost.",
      });
    else if (L < 0.35)
      A.push({
        level: 2,
        kind: "size",
        title: `Large companies are only ${pctTxt(L)} of your shares`,
        body: "Large companies are the steady core. A Nifty 50 or Nifty 100 index fund for new money brings the split nearer 55 / 25 / 20.",
      });
  }

  // kinds of investment
  if (x.total > 0) {
    const intl = x.buckets.intl / x.total,
      safe = (x.buckets.debt + x.buckets.gold) / x.total;
    if (intl < 0.05)
      A.push({
        level: 3,
        kind: "assets",
        title: "Almost nothing outside India",
        body: "Some money in global companies (a US index fund or a fund of funds) means one country's bad decade doesn't hit everything, and it gains when the rupee weakens. 10–20% is a common share.",
      });
    if (safe < 0.05)
      A.push({
        level: 3,
        kind: "assets",
        title: "No cushion of bonds, debt funds or gold",
        body: "If any goal is under five years away, the money for it belongs in bonds or debt funds, not shares, so a market fall doesn't arrive right when you need it.",
      });
  }

  // costs
  const reg = x.fundRows.filter(
    (f) => f.data?.info?.plan === "Regular" && f.data.info.er && f.data.info.der && f.data.info.er > f.data.info.der,
  );
  if (reg.length) {
    const gain = reg.reduce((a, f) => a + costGain(f.value, (f.data!.info!.er! - f.data!.info!.der!) / 100, x.rate), 0);
    A.push({
      level: gain > 10000 ? 1 : 2,
      kind: "cost",
      title: `Switch ${reg.length} regular plan${reg.length > 1 ? "s" : ""} to direct`,
      body: `${reg.map((f) => f.short).join(", ")}: the same fund, same stocks, just a distributor commission inside the yearly cost. Start new SIPs in the direct plan now; switch the existing money once each purchase is a year old.`,
      impact: `About ${inr(gain)} more after 10 years`,
    });
  }
  const costly = x.fundRows.filter((f) => {
    const i = f.data?.info;
    return f.equity && i?.er != null && i.plan !== "Regular" && i.er > 1.0 && !/index|etf/i.test(f.name);
  });
  if (costly.length) {
    const gain = costly.reduce((a, f) => a + costGain(f.value, (f.data!.info!.er! - 0.6) / 100, x.rate), 0);
    A.push({
      level: 3,
      kind: "cost",
      title: `${costly.length} fund${costly.length > 1 ? "s" : ""} charge over 1% a year`,
      body: `${costly.map((f) => `${f.short} (${f.data!.info!.er!.toFixed(2)}%)`).join(", ")}. Cost is the one part of returns you control. Unless a fund has clearly beaten its category for 5 years, a similar fund near 0.6% (or an index fund near 0.2%) keeps more for you.`,
      impact: `Up to ${inr(gain)} more after 10 years`,
    });
  }

  // funds trailing their category
  const lag = x.fundRows.filter((f) => f.verdict === "review" && f.flags.some((g) => g.text.startsWith("Behind")));
  if (lag.length)
    A.push({
      level: 2,
      kind: "laggard",
      title: `${lag.length} fund${lag.length > 1 ? "s have trailed their" : " has trailed its"} category for years`,
      body: `${lag.map((f) => f.short).join(", ")}. One bad year is normal; 3 and 5 years behind usually isn't luck. Stop new money first; decide on the rest after a year-old check on tax and exit load. An index fund of the same kind is the simple fallback.`,
    });

  // stocks
  const red = x.stockRows.filter((s) => s.flags.length);
  if (red.length)
    A.push({
      level: red.some((s) => s.pct > 0.01) ? 1 : 2,
      kind: "red-flag",
      title: `${red.length} stock${red.length > 1 ? "s carry" : " carries"} a red flag`,
      body:
        red
          .slice(0, 6)
          .map((s) => `${s.name} (${s.flags[0].toLowerCase()})`)
          .join("; ") + ". A red flag isn't a sell signal on its own, but these deserve a fresh look before you add more.",
    });
  const tiny = x.stockRows.filter((s) => s.pct < 0.005);
  if (x.directStocks > 25 && tiny.length > 10) {
    const v = tiny.reduce((a, s) => a + s.value, 0);
    A.push({
      level: 2,
      kind: "tiny",
      title: `${tiny.length} stocks are each under 0.5% of your money`,
      body: `Together ${inr(v)}. Positions that small can't move your returns either way, but each needs tracking, and many small bets usually add up to an expensive index fund. Consider folding the ones without a clear reason to hold into a Nifty 500 or flexi-cap index fund as they turn a year old.`,
    });
  }

  return A.sort((a, b) => a.level - b.level);
}
