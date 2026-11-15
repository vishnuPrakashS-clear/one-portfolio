/* The plan on the Health screen, built on the analysis (lib/analysis.ts) and your own rules:
     - at most 12 funds and 60 stocks, with about 20 shares of each stock (or ₹30,000 for a pricey one)
     - a target split of your shares across large, mid and small companies (equal thirds, or 55 / 25 / 20)
     - a yearly dividend goal from your shares
   It says which funds and stocks to keep, add to or let go, where each month's money should go, how far you are from
   your dividend goal, which market leaders you don't own are fairly priced today, and how your purchases have done
   against the same money put in the Nifty 50 on the same days. Nothing here is advice from a SEBI-registered adviser:
   it's arithmetic on public data and your statements. */
import { CATEGORIES, PLAN_DEFAULT, PLAN_RULES } from "@/constants";
import { LEADERS } from "@/constants/leaders";
import { xirr, type CashFlow } from "@/lib/core/xirr";
import { TODAY } from "@/lib/dates";
import { steadyMonthly, type Model, type ModelItem } from "@/lib/model";
import { CAP_TARGET, fundMerit, fundWhy, scoreStock, yieldOf, type Analysis, type FundRow } from "@/lib/analysis";
import type { Cap, MarketData, MarketIndex, StockInfo } from "@/types/market";
import type { PlanPrefs, Portfolio } from "@/types/portfolio";

export const MIX: Record<PlanPrefs["mix"], Record<Cap, number>> = {
  equal: { L: 1 / 3, M: 1 / 3, S: 1 / 3 },
  balanced: CAP_TARGET,
};
const CAPS: Cap[] = ["L", "M", "S"];
const INDEX_FOR: Record<Cap, string> = {
  L: "A Nifty 50 index fund (direct)",
  M: "A Nifty Midcap 150 index fund (direct)",
  S: "A Nifty Smallcap 250 index fund (direct)",
};

/* ---------- comparing with the Nifty 50 ---------- */

/** the index's value on a day (the last one on or before it) */
export function indexOn(ix: MarketIndex, d: string): number | null {
  const p = ix.points;
  if (!p.length || d < p[0][0]) return null;
  let lo = 0,
    hi = p.length - 1;
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1;
    if (p[m][0] <= d) lo = m;
    else hi = m - 1;
  }
  return p[lo][1];
}

export interface Lot {
  d: string;
  q: number;
  p: number;
}
export interface VsIndex {
  invested: number;
  value: number;
  xirr: number | null;
  /** the same money, on the same days, in the index */
  ixValue: number;
  ixXirr: number | null;
  from: string;
  buys: number;
}
/** your purchases (still held) against putting each one in the index on the same day */
export function vsIndex(items: { lots: Lot[]; price: number }[], ix: MarketIndex | null | undefined, today = TODAY()): VsIndex | null {
  if (!ix?.points?.length) return null;
  const last = ix.points[ix.points.length - 1][1];
  const cf: CashFlow[] = [],
    cfi: CashFlow[] = [];
  let invested = 0,
    value = 0,
    units = 0,
    from = "",
    buys = 0;
  for (const it of items)
    for (const l of it.lots) {
      const at = l.d && l.p > 0 && l.q > 0 ? indexOn(ix, l.d) : null;
      if (!at) continue;
      const amt = l.q * l.p;
      invested += amt;
      value += l.q * it.price;
      units += amt / at;
      cf.push({ d: l.d, v: -amt });
      if (!from || l.d < from) from = l.d;
      buys++;
    }
  if (!buys) return null;
  cf.sort((a, b) => a.d.localeCompare(b.d));
  cfi.push(...cf);
  return {
    invested,
    value,
    xirr: xirr([...cf, { d: today, v: value }]),
    ixValue: units * last,
    ixXirr: xirr([...cfi, { d: today, v: units * last }]),
    from,
    buys,
  };
}

/** yearly return of the purchases still held (dated ones only), valued at today's price */
export function lotsXirr(lots: { d: string | null; q: number; p: number | null }[], price: number, today = TODAY()): number | null {
  const ok = lots.filter((l): l is Lot => !!l.d && l.p != null && l.p > 0 && l.q > 0).sort((a, b) => a.d.localeCompare(b.d));
  if (!ok.length || !(price > 0)) return null;
  return xirr([...ok.map((l) => ({ d: l.d, v: -l.q * l.p })), { d: today, v: ok.reduce((a, l) => a + l.q, 0) * price }]);
}
/** an Indian holding's yearly return, as on its detail sheet */
export function itemXirr(it: ModelItem, today = TODAY()) {
  if (!it.india || !it.india.units || it.india.type === "bond") return null;
  return lotsXirr(it.lots, it.value / it.india.units, today);
}

/* ---------- one stock ---------- */

/** how far a price is below what you paid, and how long a recovery takes at cautious / likely / strong yearly growth */
export function breakeven(price: number, avg: number, rates: readonly number[] = CATEGORIES.stocks.rates) {
  if (!(price > 0 && avg > price)) return null;
  return {
    drop: price / avg - 1,
    need: avg / price - 1,
    years: rates.map((r) => Math.log(avg / price) / Math.log(1 + r)),
  };
}

export type Verdict = "add" | "hold" | "watch" | "exit";
export const VERDICT_NAME: Record<Verdict, string> = { add: "Build up", hold: "Hold", watch: "Hold, don't add", exit: "Let go" };
const SERIOUS = /^(Making losses|Heavy debt|Micro-cap)/;

/** keep, add to, or let go of a stock, from its business numbers (not from what you paid) */
export function stockVerdict(sc: ReturnType<typeof scoreStock>): { verdict: Verdict; why: string } {
  const serious = sc.flags.find((f) => SERIOUS.test(f));
  if (serious) return { verdict: "exit", why: `${serious}. There are stronger companies to hold the same money.` };
  if (sc.quality == null) return { verdict: "watch", why: "No market data for this one yet, so hold what you have and don't add." };
  if (sc.quality < 35)
    return {
      verdict: "exit",
      why: "Earns a low return on its shareholders' money. Stronger companies are likely to grow the same money faster.",
    };
  if (sc.quality >= 55 && (sc.valuation ?? 50) >= 45)
    return { verdict: "add", why: "A strong business at a fair price for its industry: worth building up to your target size." };
  if (sc.quality >= 55)
    return { verdict: "hold", why: "A strong business, but priced above its industry right now: keep it, and add only after a fall." };
  return {
    verdict: "watch",
    why: sc.flags[0]
      ? `${sc.flags[0]}. Keep what you have and don't add until that changes.`
      : "Middling business numbers: keep what you have, and put new money into stronger names.",
  };
}

/** shares to hold of a stock: 20, or ₹30,000 worth when 20 would cost more */
export function targetQty(price: number) {
  if (!(price > 0)) return PLAN_RULES.minQty;
  return price * PLAN_RULES.minQty <= PLAN_RULES.maxPosition ? PLAN_RULES.minQty : Math.max(1, Math.floor(PLAN_RULES.maxPosition / price));
}

export interface StockPlan {
  ids: string[];
  isin: string;
  name: string;
  cap: Cap | null;
  industry: string;
  qty: number;
  price: number;
  avg: number | null;
  value: number;
  invested: number | null;
  hi52: number | null;
  scores: ReturnType<typeof scoreStock>;
  verdict: Verdict;
  why: string;
  yield: number | null;
  divYear: number;
  target: number;
  /** shares to buy to reach the target size */
  short: number;
  lots: Lot[];
}

/* ---------- ideas: market leaders you don't own ---------- */
export interface Idea {
  isin: string;
  sym: string;
  name: string;
  why: string;
  cap: Cap | null;
  industry: string;
  info: StockInfo;
  scores: ReturnType<typeof scoreStock>;
  /** price worked out from P/E × EPS (both from the same day's data) */
  price: number | null;
  yield: number | null;
  status: "fair" | "pricey" | "weak";
}

/* ---------- the whole plan ---------- */
export interface FundKeep {
  f: FundRow;
  kind: string;
  monthly: number;
  note: string;
}
export interface FundDrop {
  f: FundRow;
  why: string;
}
export interface Buy {
  isin: string;
  name: string;
  qty: number;
  cost: number;
  price: number;
  why: string;
  isNew: boolean;
}
export interface Rule {
  key: string;
  label: string;
  now: string;
  goal: string;
  ok: boolean;
  note: string;
}
export interface Planner {
  prefs: PlanPrefs;
  monthly: number;
  monthlyFrom: "chosen" | "statements" | "default";
  stockShare: number;
  rules: Rule[];
  /** keep, let go, the month's fund money, and new index funds when no kept fund covers a size you need */
  funds: { keep: FundKeep[]; drop: FundDrop[]; budget: number; add: { label: string; monthly: number; note: string }[] };
  stocks: StockPlan[];
  buys: Buy[];
  buysCost: number;
  /** cost of bringing every stock you keep to its target size, and months that takes at your stock budget */
  fill: { cost: number; months: number | null; stocks: number };
  caps: { now: Record<Cap, number>; target: Record<Cap, number>; need: Record<Cap, number>; add: number; months: number | null };
  dividend: {
    now: number;
    goal: number;
    gap: number;
    picks: { isin: string; name: string; yield: number; amount: number; gives: number; held: boolean }[];
    capital: number;
  };
  ideas: Idea[];
  vs: { stocks: VsIndex | null; funds: VsIndex | null };
}

const kindOf = (f: FundRow) => {
  const sub = f.data?.info?.sub;
  const n = f.name.toUpperCase();
  if (/GOLD/.test(n) || /^gold$/i.test(sub || "")) return "Gold";
  if (/SILVER/.test(n) || /^silver$/i.test(sub || "")) return "Silver";
  if (/NASDAQ|S&P|FANG|GLOBAL|INTERNATIONAL|US EQUITY|OVERSEAS/.test(n)) return "International";
  if (sub && /thematic|sectoral/i.test(sub)) return `${sub}: ${f.short}`; // each theme is its own kind
  return sub || (f.equity ? "Equity" : "Other");
};
/** a fund's split of its shares across company sizes, from what it holds (or its category) */
function fundCaps(f: FundRow): Record<Cap, number> | null {
  const h = f.data?.holdings;
  if (h?.length) {
    const c: Record<Cap, number> = { L: 0, M: 0, S: 0 };
    for (const l of h) if (l.t === "E" && (l.c === "L" || l.c === "M" || l.c === "S")) c[l.c] += l.w;
    const t = c.L + c.M + c.S;
    if (t > 0) return { L: c.L / t, M: c.M / t, S: c.S / t };
  }
  const sub = (f.data?.info?.sub || "").toLowerCase();
  if (/small/.test(sub)) return { L: 0.05, M: 0.15, S: 0.8 };
  if (/mid/.test(sub)) return { L: 0.1, M: 0.75, S: 0.15 };
  if (/large/.test(sub) && !/mid/.test(sub)) return { L: 0.9, M: 0.1, S: 0 };
  if (f.equity) return { L: 0.6, M: 0.25, S: 0.15 };
  return null;
}
const CORE =
  /^(large cap|mid cap|small cap|flexi cap|multi cap|large & mid cap|focused|index|value|contra|elss|international|gold|silver|liquid|arbitrage|corporate bond|short duration|money market|overnight|equity)/i;

/** last six complete months' steady buying of a category */
function buying(M: Model, items: ModelItem[]) {
  const months = M.months.slice(-7, -1);
  return steadyMonthly(
    months.map((m) => items.reduce((a, it) => a + it.lots.filter((l) => l.d.slice(0, 7) === m).reduce((s, l) => s + l.q * l.p, 0), 0)),
  );
}

export function makePlan(M: Model, S: Portfolio, A: Analysis, D: MarketData, today = TODAY()): Planner {
  const prefs: PlanPrefs = { ...PLAN_DEFAULT, ...(S.settings.plan || {}) };
  const target = MIX[prefs.mix];
  const total = A.total || 1;

  // money each month: what you chose, else what your statements show, else ₹10,000
  const fundBuy = buying(M, M.cats.funds.items),
    stockBuy = buying(
      M,
      M.cats.stocks.items.filter((i) => i.india?.type === "stock"),
    );
  const seen = Math.round((fundBuy + stockBuy) / 500) * 500;
  const monthly = prefs.monthly > 0 ? prefs.monthly : seen > 0 ? seen : 10000;
  const monthlyFrom: Planner["monthlyFrom"] = prefs.monthly > 0 ? "chosen" : seen > 0 ? "statements" : "default";
  const stockShare =
    prefs.stocks >= 0 ? prefs.stocks : fundBuy + stockBuy > 0 ? Math.round((stockBuy / (fundBuy + stockBuy)) * 10) / 10 : 0.3;

  // ---- company sizes across everything (funds opened up) ----
  const capNow: Record<Cap, number> = { L: A.caps.L, M: A.caps.M, S: A.caps.S };
  const capSum = capNow.L + capNow.M + capNow.S || 1;
  const share: Record<Cap, number> = { L: capNow.L / capSum, M: capNow.M / capSum, S: capNow.S / capSum };
  const T2 = Math.max(...CAPS.map((c) => capNow[c] / target[c]));
  const need: Record<Cap, number> = { L: 0, M: 0, S: 0 };
  for (const c of CAPS) need[c] = Math.max(0, target[c] * T2 - capNow[c]);
  const capAdd = need.L + need.M + need.S;
  const gap: Record<Cap, number> = {
    L: Math.max(0, target.L - share.L),
    M: Math.max(0, target.M - share.M),
    S: Math.max(0, target.S - share.S),
  };

  // ---- funds: one per kind, no more than the limit ----
  const drop: FundDrop[] = [];
  const dropped = new Set<FundRow>();
  const byKind = new Map<string, FundRow[]>();
  for (const f of A.funds) byKind.set(kindOf(f), [...(byKind.get(kindOf(f)) || []), f]);
  for (const [kind, fs] of byKind) {
    if (fs.length < 2) continue;
    const best = fs.reduce((a, b) => (fundMerit(b) > fundMerit(a) || (fundMerit(b) === fundMerit(a) && b.value > a.value) ? b : a));
    for (const f of fs)
      if (f !== best) {
        dropped.add(f);
        drop.push({
          f,
          why: `Same job as ${best.short} (${kind.split(":")[0]}), which has the better record${fundWhy(best) ? `: ${fundWhy(best)}` : ""}.`,
        });
      }
  }
  // heavy overlap between what's left: keep the better one
  for (const o of A.overlaps) {
    if (o.pct < 40) continue;
    const a = A.funds[o.a],
      b = A.funds[o.b];
    if (dropped.has(a) || dropped.has(b)) continue;
    const [keep, go] = fundMerit(a) >= fundMerit(b) ? [a, b] : [b, a];
    dropped.add(go);
    drop.push({ f: go, why: `Holds ${Math.round(o.pct)}% the same stocks as ${keep.short}, the one with the better record.` });
  }
  for (const f of A.funds)
    if (!dropped.has(f) && f.verdict === "review" && !f.data?.info?.proxy) {
      dropped.add(f);
      drop.push({ f, why: `${f.flags[0]?.text || "Trailed its category"}. An index fund of the same kind is the simple swap.` });
    }
  // leftover balances aren't worth a line
  for (const f of A.funds)
    if (!dropped.has(f) && f.value < 1000) {
      dropped.add(f);
      drop.push({ f, why: "A leftover balance: move it into a fund you keep." });
    }
  // still too many: narrower funds go first, smallest first; the one fund kept for each core job stays
  let kept = A.funds.filter((f) => !dropped.has(f));
  const over = kept.length - PLAN_RULES.maxFunds;
  if (over > 0) {
    const order = kept
      .filter((f) => !CORE.test(kindOf(f)))
      .sort((a, b) => a.value - b.value)
      .concat(
        kept
          .filter((f) => CORE.test(kindOf(f)) && kept.filter((g) => kindOf(g) === kindOf(f)).length > 1)
          .sort((a, b) => a.value - b.value),
      )
      .slice(0, over);
    for (const f of order) {
      dropped.add(f);
      drop.push({
        f,
        why: CORE.test(kindOf(f))
          ? `A smaller fund doing a job another fund you keep already does; folding it in gets you to ${PLAN_RULES.maxFunds} funds.`
          : `A narrower fund (${kindOf(f).split(":")[0].toLowerCase()}) and one of your smaller ones: folding it into your core funds gets you to ${PLAN_RULES.maxFunds}.`,
      });
    }
    kept = A.funds.filter((f) => !dropped.has(f));
  }
  // where this month's fund money goes: towards the sizes you're short of, plus a cushion if there isn't one
  const fundBudget = Math.round(monthly * (1 - stockShare));
  const keep: FundKeep[] = kept.map((f) => ({
    f,
    kind: kindOf(f),
    monthly: 0,
    note: f.equity ? "Keep; no new money needed this month" : "Keep as it is",
  }));
  const safe = (A.buckets.debt + A.buckets.gold) / total;
  let left = fundBudget;
  if (fundBudget > 0 && safe < 0.1) {
    const cushion = keep
      .filter((k) => !k.f.equity && /gold|liquid|bond|arbitrage|debt|duration|money/i.test(k.kind))
      .sort((a, b) => fundMerit(b.f) - fundMerit(a.f))[0];
    if (cushion) {
      cushion.monthly = Math.round((fundBudget * 0.1) / 100) * 100;
      cushion.note = "Builds your cushion of debt and gold, which is under 10%";
      left -= cushion.monthly;
    }
  }
  const add: { label: string; monthly: number; note: string }[] = [];
  const eqKeep = keep.filter(
    (k) => k.f.equity && !/thematic|sectoral/i.test(k.kind) && !/hybrid|asset allocation|equity savings|arbitrage/i.test(k.kind),
  );
  if (left > 0 && eqKeep.length) {
    const g = gap.L + gap.M + gap.S;
    const want: Record<Cap, number> = g > 0.01 ? { L: gap.L / g, M: gap.M / g, S: gap.S / g } : target;
    for (const c of CAPS) {
      if (want[c] < 0.05) continue;
      const best = eqKeep
        .map((k) => ({ k, fit: (fundCaps(k.f) || { L: 0, M: 0, S: 0 })[c] }))
        .sort((a, b) => b.fit - a.fit || fundMerit(b.k.f) - fundMerit(a.k.f))[0];
      const amt = Math.round((left * want[c]) / 100) * 100;
      if (!best || best.fit < 0.3) {
        // none of the funds you keep covers this size: a low-cost index fund does
        if (amt > 0)
          add.push({
            label: INDEX_FOR[c],
            monthly: amt,
            note: `None of the funds you keep is mostly ${c === "L" ? "large" : c === "M" ? "mid" : "small"} companies; an index fund is the cheapest way in`,
          });
        continue;
      }
      best.k.monthly += amt;
      best.k.note = `Most of it in ${c === "L" ? "large" : c === "M" ? "mid" : "small"} companies, which you're short of`;
    }
  }

  // ---- stocks: one row per company, across accounts ----
  const byIsin = new Map<string, ModelItem[]>();
  for (const it of M.cats.stocks.items)
    if (it.india?.type === "stock") byIsin.set(it.india.isin, [...(byIsin.get(it.india.isin) || []), it]);
  const stocks: StockPlan[] = [];
  for (const [isin, its] of byIsin) {
    const qty = its.reduce((a, i) => a + (i.india?.units || 0), 0);
    const value = its.reduce((a, i) => a + i.value, 0);
    const cost = its.every((i) => i.cost != null) ? its.reduce((a, i) => a + (i.cost || 0), 0) : null;
    const d = D.stocks[isin] || null,
      k = D.klass[isin];
    const sc = scoreStock(d?.info, d?.industry || d?.info?.groww || null);
    const v = stockVerdict(sc);
    const price = qty ? value / qty : 0;
    const t = targetQty(price);
    const y = yieldOf(d?.info);
    stocks.push({
      ids: its.map((i) => i.id),
      isin,
      name: k?.name?.replace(/ Ltd\.?$/, "") || its[0].name,
      cap: k?.cap || d?.info?.cap || null,
      industry: k?.industry || d?.industry || "Other",
      qty,
      price,
      avg: cost != null && qty ? cost / qty : null,
      value,
      invested: cost,
      hi52: d?.info?.hi52 ?? null,
      scores: sc,
      verdict: v.verdict,
      why: v.why,
      yield: y,
      divYear: y ? value * y : 0,
      target: t,
      short: v.verdict === "add" || v.verdict === "hold" ? Math.max(0, t - qty) : 0,
      lots: its.flatMap((i) => i.lots),
    });
  }
  stocks.sort((a, b) => b.value - a.value);
  // too many stocks: the weakest small ones go first
  const keepers = stocks.filter((s) => s.verdict !== "exit");
  if (keepers.length > PLAN_RULES.maxStocks) {
    const rank = (s: StockPlan) => (s.scores.quality ?? 40) + (s.scores.valuation ?? 40) + Math.min(30, (s.value / 1000) * 3);
    for (const s of keepers
      .slice()
      .sort((a, b) => rank(a) - rank(b))
      .slice(0, keepers.length - PLAN_RULES.maxStocks)) {
      s.verdict = "exit";
      s.short = 0;
      s.why = `To stay within ${PLAN_RULES.maxStocks} stocks, this is one of the weakest small positions to fold into the others.`;
    }
  }
  const held = new Set(stocks.map((s) => s.isin));

  // ---- ideas: market leaders you don't own ----
  const ideas: Idea[] = [];
  for (const isin of D.leaders || []) {
    if (held.has(isin)) continue;
    const st = D.stocks[isin],
      k = D.klass[isin];
    if (!st?.info || !k) continue;
    const sc = scoreStock(st.info, st.industry || st.info.groww);
    const pe = st.info.pe != null && st.info.pe >= 2 ? st.info.pe : null;
    // fair: P/E within about 10% of its industry's, or below it
    const fair = sc.valuation != null && sc.valuation >= 60,
      strong = (sc.quality ?? 0) >= 55 && !sc.flags.some((f) => SERIOUS.test(f));
    ideas.push({
      isin,
      sym: k.symbol || "",
      name: (st.name || k.name).replace(/ Ltd\.?$/, ""),
      why: LEADERS.find((l) => l.sym === k.symbol)?.why || "",
      cap: k.cap,
      industry: k.industry || st.industry || "Other",
      info: st.info,
      scores: sc,
      price: pe && st.info.eps && st.info.eps > 0 ? Math.round(pe * st.info.eps * 10) / 10 : null,
      yield: yieldOf(st.info),
      status: strong && fair ? "fair" : strong ? "pricey" : "weak",
    });
  }
  const ideaRank = (i: Idea) =>
    (i.status === "fair" ? 200 : i.status === "pricey" ? 100 : 0) +
    (i.scores.quality ?? 0) +
    (i.scores.valuation ?? 0) +
    (i.scores.growth ?? 0) / 2 +
    gap[i.cap || "L"] * 100;
  ideas.sort((a, b) => ideaRank(b) - ideaRank(a));

  // ---- dividends ----
  const divNow = stocks.reduce((a, s) => a + s.divYear, 0);
  const divGap = Math.max(0, prefs.div - divNow);
  const payers = [
    ...stocks
      .filter((s) => (s.verdict === "add" || s.verdict === "hold") && (s.yield || 0) >= 0.03)
      .map((s) => ({ isin: s.isin, name: s.name, yield: s.yield!, q: s.scores.quality ?? 50, price: s.price, held: true })),
    ...ideas
      .filter((i) => i.status === "fair" && (i.yield || 0) >= 0.03 && i.price)
      .map((i) => ({ isin: i.isin, name: i.name, yield: i.yield!, q: i.scores.quality ?? 50, price: i.price!, held: false })),
  ]
    .sort((a, b) => b.yield * (0.5 + b.q / 100) - a.yield * (0.5 + a.q / 100))
    .slice(0, 5);
  const avgYield = payers.length ? payers.reduce((a, p) => a + p.yield, 0) / payers.length : 0;
  const capital = divGap > 0 && avgYield > 0 ? divGap / avgYield : 0;
  const picks = payers.map((p) => {
    const amount = capital / payers.length;
    return { isin: p.isin, name: p.name, yield: p.yield, amount, gives: amount * p.yield, held: p.held };
  });

  // ---- this month's stock buys ----
  const stockBudget = Math.round(monthly * stockShare);
  const divShort = divGap > 0;
  const prio = (s: { scores: ReturnType<typeof scoreStock>; cap: Cap | null; yield: number | null }) =>
    (s.scores.quality ?? 40) + (s.scores.valuation ?? 40) + gap[s.cap || "L"] * 150 + (divShort && (s.yield || 0) >= 0.03 ? 25 : 0);
  type Cand = { isin: string; name: string; price: number; want: number; why: string; isNew: boolean; p: number };
  const cands: Cand[] = [
    ...stocks
      .filter((s) => s.verdict === "add" && s.short > 0 && s.price > 0)
      .map((s) => ({
        isin: s.isin,
        name: s.name,
        price: s.price,
        want: s.short,
        why: `${s.qty} → ${s.target} shares`,
        isNew: false,
        p: prio(s) + 20,
      })),
    ...(keepers.length < PLAN_RULES.maxStocks
      ? ideas
          .filter((i) => i.status === "fair" && i.price)
          .slice(0, 5)
          .map((i) => ({
            isin: i.isin,
            name: i.name,
            price: i.price!,
            want: targetQty(i.price!),
            why: `new: ${i.why.toLowerCase()}`,
            isNew: true,
            p: prio(i),
          }))
      : []),
  ].sort((a, b) => b.p - a.p);
  const buys: Buy[] = [];
  let budget = stockBudget;
  const perStock = Math.max(stockBudget / 3, 1);
  for (const c of cands) {
    if (budget < c.price) continue;
    const q = Math.min(c.want, Math.floor(Math.min(budget, Math.max(perStock, c.price)) / c.price));
    if (q <= 0) continue;
    buys.push({ isin: c.isin, name: c.name, qty: q, cost: q * c.price, price: c.price, why: c.why, isNew: c.isNew });
    budget -= q * c.price;
    if (buys.length >= 6) break;
  }
  const fillCost = stocks.reduce((a, s) => a + s.short * s.price, 0);

  // ---- you vs the Nifty 50 ----
  const lotsOf = (it: ModelItem) => it.lots.filter((l) => l.d && l.p > 0) as Lot[];
  const priceOf = (it: ModelItem) => (it.india?.units ? it.value / it.india.units : 0);
  const vsStocks = vsIndex(
    M.cats.stocks.items.filter((i) => i.india?.type === "stock").map((i) => ({ lots: lotsOf(i), price: priceOf(i) })),
    D.nifty,
    today,
  );
  const eqItems = M.cats.funds.items.filter((i) => i.india?.type === "mf" && i.india.cls === "Equity");
  const vsFunds = vsIndex(
    eqItems.map((i) => ({ lots: lotsOf(i), price: priceOf(i) })),
    D.nifty,
    today,
  );

  // ---- your rules at a glance ----
  const qtyLow = stocks.filter((s) => s.verdict !== "exit" && s.qty < s.target).length;
  const avgQty = stocks.length ? stocks.reduce((a, s) => a + s.qty, 0) / stocks.length : 0;
  const capTxt = (x: Record<Cap, number>) => `${Math.round(x.L * 100)} / ${Math.round(x.M * 100)} / ${Math.round(x.S * 100)}`;
  const capOk = CAPS.every((c) => Math.abs(share[c] - target[c]) <= 0.07);
  const rules: Rule[] = [
    {
      key: "funds",
      label: "Funds",
      now: `${A.funds.length}`,
      goal: `${PLAN_RULES.maxFunds} or fewer`,
      ok: A.funds.length <= PLAN_RULES.maxFunds,
      note:
        A.funds.length <= PLAN_RULES.maxFunds
          ? "Within your limit."
          : `Keeping ${kept.length}: one per kind, the better of any two that overlap, and none that have trailed for years.`,
    },
    {
      key: "stocks",
      label: "Stocks",
      now: `${stocks.length}`,
      goal: `${PLAN_RULES.maxStocks} or fewer`,
      ok: stocks.length <= PLAN_RULES.maxStocks,
      note: `${stocks.filter((s) => s.verdict === "exit").length} to let go over time, ${stocks.filter((s) => s.verdict === "add").length} worth building up.`,
    },
    {
      key: "qty",
      label: "Shares of each",
      now: `${Math.round(avgQty)} on average`,
      goal: `${PLAN_RULES.minQty} each`,
      ok: qtyLow === 0,
      note: qtyLow
        ? `${qtyLow} stocks you're keeping are below their target. All of them would take about ₹${Math.round(fillCost).toLocaleString("en-IN")}.`
        : "Every stock you keep is at its target size.",
    },
    {
      key: "size",
      label: "Large / mid / small",
      now: capTxt(share),
      goal: capTxt(target),
      ok: capOk,
      note: capOk
        ? "On target."
        : `About ₹${Math.round(capAdd).toLocaleString("en-IN")} of new money in the sizes you're short of gets you there without selling.`,
    },
    {
      key: "div",
      label: "Dividends a year",
      now: `₹${Math.round(divNow).toLocaleString("en-IN")}`,
      goal: `₹${prefs.div.toLocaleString("en-IN")}`,
      ok: divNow >= prefs.div,
      note:
        divNow >= prefs.div
          ? "Your shares already pay about this, going by last year's payouts."
          : `About ₹${Math.round(capital).toLocaleString("en-IN")} more in steady dividend payers closes the gap.`,
    },
  ];
  if (vsStocks?.xirr != null && vsStocks.ixXirr != null)
    rules.push({
      key: "nifty",
      label: "Your stocks vs Nifty 50",
      now: `${(vsStocks.xirr * 100).toFixed(1)}% a year`,
      goal: `beat ${(vsStocks.ixXirr * 100).toFixed(1)}%`,
      ok: vsStocks.xirr >= vsStocks.ixXirr,
      note: "The same money on the same days in a Nifty 50 index fund.",
    });

  const equityMonthly = monthly; // nearly all new money goes into shares, directly or through funds
  return {
    prefs,
    monthly,
    monthlyFrom,
    stockShare,
    rules,
    funds: { keep: keep.sort((a, b) => b.monthly - a.monthly || b.f.value - a.f.value), drop, budget: fundBudget, add },
    stocks,
    buys,
    buysCost: buys.reduce((a, b) => a + b.cost, 0),
    fill: { cost: fillCost, months: stockBudget > 0 ? Math.ceil(fillCost / stockBudget) : null, stocks: qtyLow },
    caps: {
      now: share,
      target,
      need,
      add: capAdd,
      months: equityMonthly > 0 && capAdd > 0 ? Math.ceil(capAdd / equityMonthly) : capAdd > 0 ? null : 0,
    },
    dividend: { now: divNow, goal: prefs.div, gap: divGap, picks, capital },
    ideas,
    vs: { stocks: vsStocks, funds: vsFunds },
  };
}
