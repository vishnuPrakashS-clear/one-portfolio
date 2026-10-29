import { beforeAll, describe, expect, test } from "vitest";
import { setToday } from "@/lib/dates";
import { buildModel, fv, goalCalc, steadyMonthly } from "@/lib/model";
import { freshState } from "@/lib/core/abroad";
import type { CasHolding, Portfolio } from "@/types/portfolio";

beforeAll(() => setToday("2026-10-29"));

/** a made-up investor: one equity fund bought ₹5,000 a month for a year, priced from month-end NAVs */
function sample(): Portfolio {
  const S = freshState();
  const fund: CasHolding = {
    isin: "INF000000001",
    name: "Sample Flexi Cap Fund",
    type: "mf",
    cls: "Equity",
    units: 0,
    price: 120,
    value: 0,
    acct: "Groww",
    depo: "MF",
    cost: 0,
  };
  S.india = { asOf: "2026-10-29", total: 0, accounts: [], mix: {}, history: [], holdings: [fund], src: {} };
  const months = [
    "2025-11",
    "2025-12",
    "2026-01",
    "2026-02",
    "2026-03",
    "2026-04",
    "2026-05",
    "2026-06",
    "2026-07",
    "2026-08",
    "2026-09",
    "2026-10",
  ];
  S.pxm = { "MF:SAMPLEFLEXICAPFUND": {} };
  const lots = months.map((m, i) => {
    const p = 100 + i * 2;
    S.pxm!["MF:SAMPLEFLEXICAPFUND"][m] = p;
    return { d: `${m}-05`, q: 5000 / p, p };
  });
  fund.units = lots.reduce((a, l) => a + l.q, 0);
  fund.value = fund.units * 120;
  fund.cost = 60000;
  S.india.src = { grMFO: { asOf: "2026-10-29", rows: lots.map((l) => ({ n: fund.name, s: 1 as const, q: l.q, v: l.q * l.p, d: l.d })) } };
  S.india.src.grMF = {
    asOf: "2026-10-29",
    rows: [
      {
        name: fund.name,
        amc: "",
        cat: "Equity",
        sub: "Flexi Cap",
        folio: "1",
        src: "Groww",
        units: fund.units,
        invested: 60000,
        value: fund.value,
      },
    ],
  };
  return S;
}

describe("projections", () => {
  test("future value with and without monthly investing", () => {
    expect(fv(100000, 0, 0.12, 1)).toBeCloseTo(112000, -1);
    expect(fv(0, 1000, 0, 2)).toBe(24000);
  });
  test("the steady monthly amount ignores one lump sum", () => {
    expect(steadyMonthly([5000, 5000, 5000, 5000, 5000, 60000])).toBe(5000);
    expect(steadyMonthly([4000, 6000, 5000, 5000, 4000, 6000])).toBe(5000);
  });
});

describe("the model", () => {
  test("builds 12 months of value and money put in, and reads the SIP", () => {
    const M = buildModel(sample());
    const c = M.cats.funds;
    expect(M.months).toHaveLength(12);
    expect(c.items).toHaveLength(1);
    expect(c.inv[11]).toBeCloseTo(60000, 0);
    expect(c.val[0]).toBeCloseTo(5000, 0);
    expect(c.sip).toBe(5000);
    expect(c.histMissing).toBe(0);
    expect(c.xirr).toBeGreaterThan(0);
  });
  test("goal verdicts move with the target", () => {
    const M = buildModel(sample());
    expect(goalCalc(M, { amt: 5e5, year: 2036 }).level).toBe(3);
    expect(goalCalc(M, { amt: 5e7, year: 2031 }).level).toBe(0);
    const tight = goalCalc(M, { amt: 5e7, year: 2031 });
    expect(tight.need).toBeGreaterThan(tight.sip);
    expect(goalCalc(M, { amt: 2e6, year: 2036, extra: 10000 }).sip).toBe(15000);
  });
});
