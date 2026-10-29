import type { ISODate } from "@/types/portfolio";

export interface CashFlow {
  d: ISODate;
  /** negative = money paid in, positive = money received or value now */
  v: number;
}

/** annualised return of dated cash flows (bisection; null when it can't be solved) */
export function xirr(cf: CashFlow[]): number | null {
  if (cf.length < 2 || !cf.some((c) => c.v < 0) || !cf.some((c) => c.v > 0)) return null;
  const t0 = Date.parse(cf[0].d + "T00:00:00Z");
  const yrs = cf.map((c) => (Date.parse(c.d + "T00:00:00Z") - t0) / 31557600000);
  const f = (r: number) => cf.reduce((s, c, i) => s + c.v / Math.pow(1 + r, yrs[i]), 0);
  let lo = -0.9,
    hi = 10; // up to 1000% a year
  if (f(lo) * f(hi) > 0) return null;
  for (let k = 0; k < 100; k++) {
    const m = (lo + hi) / 2;
    if (f(lo) * f(m) <= 0) hi = m;
    else lo = m;
  }
  return (lo + hi) / 2;
}
