/* The view model every screen and the 3D system read: four categories (mutual funds, stocks, bonds, abroad), each holding with
   its value, cost, purchase lots and month-by-month value for the last 12 months (lots × month-end prices from data.pxm),
   the regular monthly amount read from purchases, past yearly return, and where today's money could lead. */
import type { Goal, IndHolding, ISODate, Portfolio, YearMonth } from "@/types/portfolio";
import { daysBetween, monthEnd, TODAY, ymAdd, ymOf } from "@/lib/dates";
import { holdingRows, hasAbroad } from "@/lib/core/abroad";
import { indHoldings, indCur, indPrice, priceKey } from "@/lib/core/india";
import { xirr, type CashFlow } from "@/lib/core/xirr";
import { CATEGORIES, CAT_ORDER, type CatId } from "@/constants";

export const NMONTHS = 12;

export interface ModelLot {
  d: ISODate;
  q: number;
  p: number;
  fx?: number;
}
export interface ModelItem {
  id: string;
  name: string;
  sub: string;
  value: number;
  cost: number | null;
  lots: ModelLot[];
  /** month-end value for each of the last 12 months (null without dated purchases) */
  val: number[] | null;
  inv: number[] | null;
  india?: IndHolding;
  sym?: string;
}
export interface CategoryModel {
  id: CatId;
  items: ModelItem[];
  value: number;
  /** what was paid for the holdings whose buy price is known */
  cost: number;
  /** value of the holdings whose buy price is known */
  known: number;
  gain: number | null;
  gainPct: number | null;
  val: number[];
  inv: number[];
  /** value of the holdings with dated purchases (they draw the growth line) */
  covered: number;
  coverage: number;
  /** month-ends that had to fall back to the buy price because a price isn't stored yet */
  histMissing: number;
  xirr: number | null;
  since: ISODate | null;
  sip: number;
  sipSrc: string;
}
export interface Model {
  months: YearMonth[];
  cats: Record<CatId, CategoryModel>;
  total: number;
  val: number[];
  inv: number[];
  fx: number;
  sip: number;
}

export const monthsList = (today: ISODate = TODAY()): YearMonth[] =>
  Array.from({ length: NMONTHS }, (_, i) => ymAdd(ymOf(today), i - NMONTHS + 1));
const fxAt = (S: Portfolio, d: ISODate) => {
  const h = S.settings.fxHistory || {},
    k = Object.keys(h)
      .filter((x) => x <= d)
      .sort()
      .pop();
  return k ? h[k] : S.settings.fx || 95;
};
/** the steady monthly amount: the average of the last six complete months, ignoring one lump-sum month */
export function steadyMonthly(a: number[]): number {
  if (!a.length) return 0;
  const mx = Math.max(...a),
    rest = a.slice();
  rest.splice(a.indexOf(mx), 1);
  const m = rest.reduce((x, y) => x + y, 0) / (rest.length || 1);
  return mx > 2.5 * m && rest.length ? m : a.reduce((x, y) => x + y, 0) / a.length;
}
/** future value of today's money plus a monthly amount, compounding monthly at an annual rate */
export function fv(pv: number, sip: number, r: number, yrs: number): number {
  const i = Math.pow(1 + r, 1 / 12) - 1,
    n = Math.round(yrs * 12),
    g = Math.pow(1 + i, n);
  return pv * g + (i ? ((sip * (g - 1)) / i) * (1 + i) : sip * n);
}

const emptyCat = (id: CatId, months: number): CategoryModel => ({
  id,
  items: [],
  value: 0,
  cost: 0,
  known: 0,
  gain: null,
  gainPct: null,
  val: Array(months).fill(0),
  inv: Array(months).fill(0),
  covered: 0,
  coverage: 0,
  histMissing: 0,
  xirr: null,
  since: null,
  sip: 0,
  sipSrc: "",
});

export function buildModel(S: Portfolio | null, today: ISODate = TODAY()): Model {
  const months = monthsList(today),
    cur = ymOf(today),
    fx = S?.settings.fx || 95;
  const cats = Object.fromEntries(CAT_ORDER.map((id) => [id, emptyCat(id, months.length)])) as Record<CatId, CategoryModel>;
  if (!S) return { months, cats, total: 0, val: Array(months.length).fill(0), inv: Array(months.length).fill(0), fx, sip: 0 };
  const pxm = S.pxm || {},
    I = S.india;

  const add = (catId: CatId, it: ModelItem, price: number | null, pxKey: string, opt: { usd?: boolean; bond?: boolean }) => {
    const c = cats[catId];
    c.items.push(it);
    c.value += it.value;
    if (it.cost != null) {
      c.cost += it.cost;
      c.known += it.value;
    }
    if (!it.lots.length) return;
    c.covered += it.value;
    it.val = months.map(() => 0);
    it.inv = months.map(() => 0);
    months.forEach((m, i) => {
      const end = m === cur ? today : monthEnd(m),
        held = it.lots.filter((l) => l.d <= end);
      const units = held.reduce((a, l) => a + l.q, 0),
        inv = held.reduce((a, l) => a + l.q * l.p * (opt.usd ? l.fx || fxAt(S, l.d) : 1), 0);
      let px = m === cur ? price : (pxm[pxKey]?.[m] ?? null);
      if (px == null) {
        if (units && !opt.bond) c.histMissing++;
        px = units ? inv / units / (opt.usd ? fxAt(S, end) : 1) : 0; // fall back to the price paid
      }
      const v = units * px * (opt.usd ? (m === cur ? fx : fxAt(S, end)) : 1);
      it.val![i] = v;
      it.inv![i] = inv;
      c.val[i] += v;
      c.inv[i] += inv;
    });
  };

  if (I)
    for (const h of indHoldings(I, today)) {
      const catId = (Object.keys(CATEGORIES) as CatId[]).find((k) => CATEGORIES[k].types?.includes(h.type));
      if (!catId) continue;
      const sub = [
        h.type === "etf" ? "ETF" : h.type === "invit" ? "InvIT" : h.type === "bond" ? "Bond / NCD" : h.type === "mf" ? h.cls : "Share",
        h.via || h.acct,
      ]
        .filter(Boolean)
        .join(" · ");
      const lots = (h.lots || []).filter((l): l is { d: ISODate; q: number; p: number } => !!l.d && l.q > 0 && l.p != null && l.p > 0);
      add(
        catId,
        { id: h.key, name: h.name, sub, value: indCur(h, I), cost: h.cost != null ? h.cost : null, lots, val: null, inv: null, india: h },
        indPrice(h, I),
        priceKey(h),
        { bond: h.type === "bond" },
      );
    }
  if (hasAbroad(S))
    for (const r of holdingRows(S, today)) {
      const lots = r.lots.filter((l) => l.q > 0).map((l) => ({ d: l.d, q: l.q, p: l.p, fx: l.fx }));
      add(
        "abroad",
        {
          id: r.sym,
          sym: r.sym,
          name: r.sym.replace("LSE~", ""),
          sub: r.name,
          value: r.value * fx,
          cost: r.cost * fx,
          lots,
          val: null,
          inv: null,
        },
        r.price,
        r.sym,
        { usd: true },
      );
    }

  let total = 0;
  for (const id of CAT_ORDER) {
    const c = cats[id];
    c.items.sort((a, b) => b.value - a.value);
    total += c.value;
    const priced = c.items.filter((x) => x.cost != null);
    c.gain = priced.length ? priced.reduce((a, x) => a + x.value - (x.cost as number), 0) : null;
    c.gainPct = c.gain != null && c.cost ? c.gain / c.cost : null;
    // past yearly return from dated purchases (bonds pay interest out, so their price-only return would mislead)
    const cf: CashFlow[] = [];
    let cov = 0;
    for (const it of c.items)
      if (it.lots.length) {
        cov += it.value;
        for (const l of it.lots) cf.push({ d: l.d, v: -l.q * l.p * (id === "abroad" ? l.fx || fxAt(S, l.d) : 1) });
      }
    cf.sort((a, b) => a.d.localeCompare(b.d));
    if (cov) cf.push({ d: today, v: cov });
    const first = cf.length ? cf[0].d : null;
    c.since = first;
    c.xirr = id !== "bonds" && first && daysBetween(first, today) > 120 ? xirr(cf) : null;
    // monthly investing, read from the last six complete months of purchases
    const ins: number[] = [];
    for (let i = NMONTHS - 7; i < NMONTHS - 1; i++) if (i > 0) ins.push(Math.max(0, c.inv[i] - c.inv[i - 1]));
    c.sip = id === "abroad" ? (c.items.length ? S.settings.monthlyInr || 0 : 0) : Math.round(steadyMonthly(ins) / 100) * 100;
    c.sipSrc = id === "abroad" ? "your monthly plan" : "the average of your last six months of purchases";
    c.coverage = c.value ? c.covered / c.value : 0;
  }
  const val = months.map((_, i) => CAT_ORDER.reduce((a, id) => a + cats[id].val[i], 0));
  const inv = months.map((_, i) => CAT_ORDER.reduce((a, id) => a + cats[id].inv[i], 0));
  return { months, cats, total, val, inv, fx, sip: CAT_ORDER.reduce((a, id) => a + cats[id].sip, 0) };
}

/* ---------- goals: tap a goal and a year; does today's investing get there? ---------- */
export type VerdictLevel = 0 | 1 | 2 | 3;
export interface GoalResult {
  yrs: number;
  /** projected value in the goal year at the cautious, likely and strong rates */
  v: [number, number, number];
  /** total going in each month, including any extra chosen */
  sip: number;
  extra: number;
  /** monthly amount the goal needs at the likely rate */
  need: number;
  level: VerdictLevel;
  /** money-weighted likely rate across categories */
  w: number;
  wk: (k: 0 | 1 | 2) => number;
}
export function goalYears(goal: Goal, today: ISODate = TODAY()) {
  return Math.max(0.5, goal.year - +today.slice(0, 4) + (12 - +today.slice(5, 7)) / 12);
}
export function projectAll(M: Model, k: 0 | 1 | 2, yrs: number, extra = 0): number {
  const wk = weightedRate(M, k);
  return CAT_ORDER.reduce((a, id) => a + fv(M.cats[id].value, M.cats[id].sip, CATEGORIES[id].rates[k], yrs), 0) + fv(0, extra, wk, yrs);
}
export function weightedRate(M: Model, k: 0 | 1 | 2) {
  return M.total ? CAT_ORDER.reduce((a, id) => a + M.cats[id].value * CATEGORIES[id].rates[k], 0) / M.total : CATEGORIES.funds.rates[k];
}
export function goalCalc(M: Model, goal: Goal, today: ISODate = TODAY()): GoalResult {
  const yrs = goalYears(goal, today),
    extra = goal.extra || 0;
  const v: [number, number, number] = [projectAll(M, 0, yrs, extra), projectAll(M, 1, yrs, extra), projectAll(M, 2, yrs, extra)];
  const w = weightedRate(M, 1),
    i = Math.pow(1 + w, 1 / 12) - 1,
    n = Math.round(yrs * 12),
    g = Math.pow(1 + i, n);
  const need = Math.max(0, (goal.amt - M.total * g) / (((g - 1) / i) * (1 + i)));
  const level: VerdictLevel = v[0] >= goal.amt ? 3 : v[1] >= goal.amt ? 2 : v[2] >= goal.amt ? 1 : 0;
  return { yrs, v, sip: M.sip + extra, extra, need, level, w, wk: (k) => weightedRate(M, k) };
}
