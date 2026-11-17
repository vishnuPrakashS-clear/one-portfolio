/* What your money could grow to: today's value plus a monthly amount (raised by a step-up each year), compounding
   monthly at a yearly rate. Used by the Future screen's sliders and milestones. */

export interface YearPoint {
  /** years from now */
  y: number;
  /** today's value plus everything added so far */
  put: number;
  value: number;
}
export interface Growth {
  value: number;
  /** today's value + money you add */
  put: number;
  added: number;
  gain: number;
  years: YearPoint[];
}

/** month by month: grow what's there, then add this month's amount; the monthly amount rises by `step` once a year */
export function grow(today: number, monthly: number, years: number, rate: number, step = 0): Growth {
  const i = Math.pow(1 + rate, 1 / 12) - 1;
  let value = today,
    added = 0,
    sip = monthly;
  const pts: YearPoint[] = [{ y: 0, put: today, value: today }];
  for (let m = 1; m <= Math.round(years * 12); m++) {
    value = value * (1 + i) + sip;
    added += sip;
    if (m % 12 === 0) {
      pts.push({ y: m / 12, put: today + added, value });
      sip *= 1 + step;
    }
  }
  return { value, put: today + added, added, gain: value - today - added, years: pts };
}

/** a future amount in today's money, at a yearly inflation rate */
export const real = (v: number, years: number, inflation = 0.06) => v / Math.pow(1 + inflation, years);

/** the monthly amount that reaches a target in a number of years (by bisection: grow() is increasing in the amount) */
export function monthlyFor(target: number, today: number, years: number, rate: number, step = 0): number {
  if (grow(today, 0, years, rate, step).value >= target) return 0;
  let lo = 0,
    hi = Math.max(1000, target / Math.max(1, years * 12));
  while (grow(today, hi, years, rate, step).value < target) hi *= 2;
  for (let k = 0; k < 50; k++) {
    const mid = (lo + hi) / 2;
    if (grow(today, mid, years, rate, step).value < target) lo = mid;
    else hi = mid;
  }
  return hi;
}
