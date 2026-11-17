/* Rebalancing the abroad sleeve by selling: which fund to sell, how many units, at what limit price, and the Indian tax.
   Sales use FIFO (oldest units go first, as INDmoney sells), so the choice is only how many units of each fund.
   Tax on foreign shares in India: held over 24 months 12.5% (+cess), otherwise your slab rate (+cess). Short-term losses
   can offset any gain, long-term losses only long-term gains. The gain is in rupees: sale at today's ₹/$ minus cost at the
   ₹/$ of the day you bought, so a fall in the rupee alone can make a gain. Review only: you place the orders yourself. */

import type { Bucket, ISODate, Portfolio } from "@/types/portfolio";
import { daysBetween, ltcgDate, TODAY } from "@/lib/dates";
import { bucketView, fxOn, qtyOf, taxRates } from "./abroad";

export type SellMode = "no-loss" | "lt-only" | "least-tax";
export interface Chunk {
  d: ISODate;
  q: number;
  /** buy price, $ */
  p: number;
  fxBuy: number;
  ltd: ISODate;
  isLT: boolean;
  /** rupee gain for these units at the sale price */
  gain: number;
}
export interface SellOrder {
  sym: string;
  bucket: Bucket;
  plan: string;
  held: number;
  qty: number;
  /** the price used, $ (today's unless you changed it) */
  price: number;
  priceAt: ISODate | null;
  /** $ price at which the units sold make no rupee gain or loss */
  breakeven: number;
  /** suggested limit: today's price, never below break-even in no-loss mode */
  limit: number;
  proceeds: number;
  chunks: Chunk[];
  gainLT: number;
  gainST: number;
  /** the soonest date a short-term unit in this sale turns long-term, and roughly what waiting saves */
  waitTo: ISODate | null;
  waitSaves: number;
}
export interface BucketGap {
  bucket: Bucket;
  value: number;
  pct: number;
  w: number;
  /** $ above (+) or below (−) target */
  gap: number;
}
export interface RebalancePlan {
  total: number;
  buckets: BucketGap[];
  /** $ the plan tries to sell (the overweight part, times the share chosen) */
  aim: number;
  orders: SellOrder[];
  sold: number;
  /** $ that couldn't be sold under the chosen rule (e.g. every unit left is below break-even) */
  short: number;
  /** the next date a unit in an overweight bucket turns long-term */
  nextLT: ISODate | null;
  gainLT: number;
  gainST: number;
  tax: number;
  /** where the money goes: underweight buckets, by how far each is below target */
  into: { bucket: Bucket; buy: string; usd: number }[];
  /** months of new money (all of it to underweight funds) that would rebalance without selling */
  months: number | null;
  /** overweight buckets with a 0% target: only a sale removes them */
  zero: Bucket[];
}

/** tax on a set of gains, with losses offset the way Indian rules allow */
export function netTax(gainST: number, gainLT: number, rates: { st: number; lt: number }) {
  let st = gainST,
    lt = gainLT;
  if (st < 0) {
    lt += st; // a short-term loss can offset long-term gains
    st = 0;
  }
  return Math.max(0, st) * rates.st + Math.max(0, lt) * rates.lt;
}

export function rebalancePlan(
  S: Portfolio,
  opts: { share?: number; mode?: SellMode; prices?: Record<string, number>; fx?: number; today?: ISODate } = {},
): RebalancePlan {
  const today = opts.today || TODAY(),
    share = opts.share ?? 1,
    mode = opts.mode || "no-loss",
    fx = opts.fx || S.settings.fx,
    rates = taxRates(S.settings);
  const bv = bucketView(S),
    total = bv[0]?.total || 0,
    wsum = bv.reduce((a, b) => a + b.w, 0) || 100;
  const buckets: BucketGap[] = bv.map((b) => ({
    bucket: b.bucket,
    value: b.value,
    pct: b.pct,
    w: b.w,
    gap: b.value - (total * b.w) / wsum,
  }));
  const over = buckets.filter((b) => b.gap > 1),
    aim = over.reduce((a, b) => a + b.gap, 0) * share;

  // FIFO chunks of every fund in an overweight bucket, with the rupee gain per $ sold
  const PLAN_ORDER: Record<string, number> = { legacy: 0, keep: 1, core: 2 };
  const orders: SellOrder[] = [];
  let short = 0;
  for (const b of over) {
    let need = b.gap * share;
    const hs = S.holdings
      .filter((h) => h.bucket === b.bucket && qtyOf(h) > 1e-7)
      .map((h) => {
        const price = opts.prices?.[h.sym] ?? h.price ?? 0;
        const chunks = [...h.lots]
          .sort((x, y) => x.d.localeCompare(y.d))
          .map((l) => {
            const fxBuy = l.fx || fxOn(S, l.d) || fx,
              ltd = ltcgDate(l.d);
            return { d: l.d, q: l.q, p: l.p, fxBuy, ltd, isLT: daysBetween(today, ltd) <= 0, gain: 0 };
          });
        return { h, price, chunks, i: 0, used: 0 };
      })
      .filter((x) => x.price > 0);
    // greedy: keep taking the next FIFO chunk with the lowest tax per $ (old plan funds first on a tie)
    const taken = new Map<string, Chunk[]>();
    while (need > 0.01) {
      let best: (typeof hs)[number] | null = null,
        bestKey = Infinity;
      for (const x of hs) {
        const c = x.chunks[x.i];
        if (!c) continue;
        const left = c.q - x.used,
          perUnit = x.price * fx - c.p * c.fxBuy;
        if (mode !== "least-tax" && perUnit < 0) continue;
        if (mode === "lt-only" && !c.isLT) continue;
        const taxPer = (perUnit > 0 ? perUnit * (c.isLT ? rates.lt : rates.st) : perUnit * rates.st) / (x.price * fx);
        const key = taxPer + PLAN_ORDER[x.h.plan] * 0.01; // holdings you are exiting anyway go first unless they cost clearly more tax
        if (left > 1e-9 && key < bestKey) {
          bestKey = key;
          best = x;
        }
      }
      if (!best) {
        short += need;
        break;
      }
      const c = best.chunks[best.i],
        left = c.q - best.used,
        q = Math.min(left, need / best.price);
      const part = { ...c, q, gain: q * (best.price * fx - c.p * c.fxBuy) };
      taken.set(best.h.sym, [...(taken.get(best.h.sym) || []), part]);
      need -= q * best.price;
      best.used += q;
      if (best.used >= c.q - 1e-9) {
        best.i++;
        best.used = 0;
      }
    }
    for (const x of hs) {
      const cs = taken.get(x.h.sym);
      if (!cs) continue;
      const qty = cs.reduce((a, c) => a + c.q, 0),
        costInr = cs.reduce((a, c) => a + c.q * c.p * c.fxBuy, 0),
        breakeven = costInr / (qty * fx);
      const st = cs.filter((c) => !c.isLT),
        gainST = st.reduce((a, c) => a + c.gain, 0),
        waitTo = st.length ? st.map((c) => c.ltd).sort()[0] : null;
      orders.push({
        sym: x.h.sym,
        bucket: x.h.bucket,
        plan: x.h.plan,
        held: qtyOf(x.h),
        qty,
        price: x.price,
        priceAt: x.h.priceAt,
        breakeven,
        limit: mode === "least-tax" ? x.price : Math.max(x.price, breakeven),
        proceeds: qty * x.price,
        chunks: cs,
        gainLT: cs.filter((c) => c.isLT).reduce((a, c) => a + c.gain, 0),
        gainST,
        waitTo,
        waitSaves: Math.max(0, gainST) * (rates.st - rates.lt),
      });
    }
  }
  const sold = orders.reduce((a, o) => a + o.proceeds, 0),
    gainLT = orders.reduce((a, o) => a + o.gainLT, 0),
    gainST = orders.reduce((a, o) => a + o.gainST, 0);

  const under = buckets.filter((b) => b.gap < -1 && b.w > 0),
    usum = under.reduce((a, b) => a - b.gap, 0) || 1;
  const into = under.map((b) => ({
    bucket: b.bucket,
    buy: bv.find((x) => x.bucket === b.bucket)?.buy || "",
    usd: (sold * -b.gap) / usum,
  }));

  const usdMonth = (S.settings.monthlyInr / fx) * (1 - (S.settings.feePct || 0) / 100);
  // only buckets with a target can be diluted by new money; a 0% bucket never gets there without a sale
  const dil = over.filter((b) => b.w > 0);
  const months =
    dil.length && usdMonth > 0
      ? Math.ceil(Math.max(...dil.map((b) => (b.value / (b.w / wsum) - total) / usdMonth)))
      : dil.length
        ? null
        : 0;

  return {
    total,
    buckets,
    aim,
    orders: orders.sort((a, b) => b.proceeds - a.proceeds),
    sold,
    short,
    gainLT,
    gainST,
    tax: netTax(gainST, gainLT, rates),
    into,
    nextLT:
      S.holdings
        .filter((h) => over.some((b) => b.bucket === h.bucket))
        .flatMap((h) => h.lots.map((l) => ltcgDate(l.d)))
        .filter((d) => d > today)
        .sort()[0] || null,
    months: months != null && isFinite(months) ? Math.max(0, months) : null,
    zero: over.filter((b) => b.w <= 0).map((b) => b.bucket),
  };
}

/* ---------- one sell order for one holding ---------- */
export interface Ticket {
  sym: string;
  held: number;
  qty: number;
  price: number;
  fx: number;
  chunks: Chunk[];
  breakeven: number;
  gainLT: number;
  gainST: number;
  tax: number;
  proceeds: number;
  /** units at the front of the FIFO queue that are already long-term */
  ltQty: number;
  /** units that can be sold without a rupee loss at this price (FIFO, stopping at the first loss-making unit) */
  noLossQty: number;
  nextLT: ISODate | null;
  waitSaves: number;
}
export function sellTicket(S: Portfolio, sym: string, qty: number, price: number, fx: number, today: ISODate = TODAY()): Ticket | null {
  const h = S.holdings.find((x) => x.sym === sym);
  if (!h) return null;
  const rates = taxRates(S.settings),
    held = qtyOf(h);
  const lots = [...h.lots]
    .sort((a, b) => a.d.localeCompare(b.d))
    .map((l) => {
      const fxBuy = l.fx || fxOn(S, l.d) || S.settings.fx,
        ltd = ltcgDate(l.d);
      return { d: l.d, q: l.q, p: l.p, fxBuy, ltd, isLT: daysBetween(today, ltd) <= 0, gain: 0 };
    });
  let ltQty = 0,
    noLossQty = 0,
    ltRun = true,
    nlRun = true;
  for (const l of lots) {
    if (ltRun && l.isLT) ltQty += l.q;
    else ltRun = false;
    if (nlRun && price * fx >= l.p * l.fxBuy) noLossQty += l.q;
    else nlRun = false;
  }
  qty = Math.max(0, Math.min(qty, held));
  const chunks: Chunk[] = [];
  let left = qty;
  for (const l of lots) {
    if (left <= 1e-9) break;
    const q = Math.min(l.q, left);
    chunks.push({ ...l, q, gain: q * (price * fx - l.p * l.fxBuy) });
    left -= q;
  }
  const gainLT = chunks.filter((c) => c.isLT).reduce((a, c) => a + c.gain, 0),
    gainST = chunks.filter((c) => !c.isLT).reduce((a, c) => a + c.gain, 0);
  const cost = chunks.reduce((a, c) => a + c.q * c.p * c.fxBuy, 0);
  return {
    sym,
    held,
    qty,
    price,
    fx,
    chunks,
    breakeven: qty ? cost / (qty * fx) : 0,
    gainLT,
    gainST,
    tax: netTax(gainST, gainLT, rates),
    proceeds: qty * price,
    ltQty,
    noLossQty,
    nextLT:
      lots
        .filter((l) => !l.isLT)
        .map((l) => l.ltd)
        .sort()[0] || null,
    waitSaves: Math.max(0, gainST) * (rates.st - rates.lt),
  };
}
