import { beforeAll, describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { setToday } from "@/lib/dates";
import { buildModel } from "@/lib/model";
import { freshState } from "@/lib/core/abroad";
import { analyse } from "@/lib/analysis";
import { breakeven, indexOn, makePlan, stockVerdict, targetQty, vsIndex } from "@/lib/planner";
import { LEADERS } from "@/constants/leaders";
import { PLAN_DEFAULT } from "@/constants";
import type { CasHolding, Portfolio } from "@/types/portfolio";
import type { MarketData, MarketFund, MarketIndex, StockInfo } from "@/types/market";

beforeAll(() => setToday("2026-10-29"));

const hold = (
  isin: string,
  name: string,
  type: CasHolding["type"],
  value: number,
  units = value / 100,
  cls: CasHolding["cls"] = "Equity",
): CasHolding => ({
  isin,
  name,
  type,
  cls,
  units,
  price: value / units,
  value,
  cost: value,
  acct: "Groww",
  depo: type === "mf" ? "MF" : "CDSL",
});
const info = (o: Partial<StockInfo>): StockInfo => ({
  mcap: 50000,
  pe: 20,
  ipe: 25,
  pb: 3,
  roe: 22,
  de: 0.2,
  dy: 1,
  eps: 10,
  rev1: 0.1,
  rev3: 0.1,
  pr1: 0.1,
  pr3: 0.1,
  margin: 0.15,
  loss: false,
  prom: 60,
  promYr: 60,
  cap: "L",
  groww: null,
  ...o,
});
const fund = (isin: string, sub: string, r3: number, c3: number, er: number, lines: [string, number, "L" | "M" | "S"][]): MarketFund => ({
  isin,
  search_id: null,
  name: isin,
  info: {
    cat: "Equity",
    sub,
    plan: "Direct",
    er,
    der: er,
    aum: 5000,
    risk: null,
    bench: null,
    r1: null,
    r3,
    r5: null,
    c1: null,
    c3,
    c5: null,
    rank3: null,
    rank5: null,
    alpha: null,
    beta: null,
    sharpe: null,
    sd: null,
    launch: null,
    turnover: null,
    name: isin,
  },
  holdings: lines.map(([n, w, c]) => ({ n, i: null, s: "Financial Services", w, t: "E" as const, c })),
  as_of: "2026-09-30",
  fetched_at: null,
  miss: null,
});

function sample(): Portfolio {
  const S = freshState();
  S.india = {
    asOf: "2026-10-29",
    total: 0,
    accounts: [],
    mix: {},
    history: [],
    holdings: [
      hold("INF0000000A1", "Alpha Large Cap Fund - Direct Plan - Growth", "mf", 300000),
      hold("INF0000000B1", "Beta Large Cap Fund - Direct Plan - Growth", "mf", 100000),
      hold("INE0000000G1", "Goodco Ltd", "stock", 5000, 10),
      hold("INE0000000D1", "Debtco Ltd", "stock", 3000, 30),
      hold("INE0000000P1", "Pricey Ltd", "stock", 25000, 10),
    ],
    src: {},
  };
  return S;
}
function data(): MarketData {
  const big: [string, number, "L" | "M" | "S"][] = Array.from({ length: 40 }, (_, i) => [`Co${i}`, 2.4, "L"]);
  return {
    funds: {
      INF0000000A1: fund("INF0000000A1", "Large Cap", 15, 13, 0.6, big),
      INF0000000B1: fund("INF0000000B1", "Large Cap", 12, 13, 0.9, big),
    },
    stocks: {
      INE0000000G1: {
        isin: "INE0000000G1",
        search_id: null,
        nse: "GOOD",
        name: "Goodco",
        industry: "Capital Goods",
        info: info({ dy: 4 }),
        fetched_at: null,
        miss: null,
      },
      INE0000000D1: {
        isin: "INE0000000D1",
        search_id: null,
        nse: "DEBT",
        name: "Debtco",
        industry: "Capital Goods",
        info: info({ de: 3.5, roe: 8 }),
        fetched_at: null,
        miss: null,
      },
      INE0000000P1: {
        isin: "INE0000000P1",
        search_id: null,
        nse: "PRICY",
        name: "Pricey",
        industry: "Capital Goods",
        info: info({ pe: 80, ipe: 25 }),
        fetched_at: null,
        miss: null,
      },
      INE0000000L1: {
        isin: "INE0000000L1",
        search_id: null,
        nse: "COALINDIA",
        name: "Coalco",
        industry: "Oil Gas & Consumable Fuels",
        info: info({ pe: 8, ipe: 10, eps: 50, dy: 6, roe: 26 }),
        fetched_at: null,
        miss: null,
      },
    },
    klass: {
      INE0000000G1: { isin: "INE0000000G1", symbol: "GOOD", name: "Goodco Ltd", industry: "Capital Goods", cap: "S" },
      INE0000000L1: { isin: "INE0000000L1", symbol: "COALINDIA", name: "Coalco Ltd", industry: "Oil Gas & Consumable Fuels", cap: "L" },
    },
    leaders: ["INE0000000L1"],
  };
}

describe("plan helpers", () => {
  test("index value on a day and you vs the index", () => {
    const ix: MarketIndex = {
      key: "N",
      name: "N",
      points: [
        ["2024-01-01", 100],
        ["2025-01-01", 110],
        ["2026-01-01", 121],
      ],
    };
    expect(indexOn(ix, "2023-12-31")).toBeNull();
    expect(indexOn(ix, "2025-06-30")).toBe(110);
    expect(indexOn(ix, "2030-01-01")).toBe(121);
    const v = vsIndex([{ lots: [{ d: "2024-01-01", q: 10, p: 100 }], price: 150 }], ix, "2026-01-01")!;
    expect(v.invested).toBe(1000);
    expect(v.value).toBe(1500);
    expect(v.ixValue).toBeCloseTo(1210, 6);
    expect(v.ixXirr!).toBeCloseTo(0.1, 2);
    expect(v.xirr!).toBeGreaterThan(v.ixXirr!);
  });
  test("break-even: down 25% needs a 33% rise; about 2.5 years at 12% a year", () => {
    const b = breakeven(75, 100)!;
    expect(b.drop).toBeCloseTo(-0.25, 6);
    expect(b.need).toBeCloseTo(1 / 3, 6);
    expect(b.years[1]).toBeCloseTo(Math.log(4 / 3) / Math.log(1.12), 6);
    expect(breakeven(120, 100)).toBeNull();
  });
  test("verdict comes from the business, not from what you paid", () => {
    expect(stockVerdict({ valuation: 60, growth: 50, quality: 80, flags: ["Heavy debt (3.0× equity)"] }).verdict).toBe("exit");
    expect(stockVerdict({ valuation: 60, growth: 50, quality: 80, flags: [] }).verdict).toBe("add");
    expect(stockVerdict({ valuation: 20, growth: 50, quality: 80, flags: [] }).verdict).toBe("hold");
    expect(stockVerdict({ valuation: 60, growth: 50, quality: 45, flags: [] }).verdict).toBe("watch");
    expect(stockVerdict({ valuation: 60, growth: 50, quality: 20, flags: [] }).verdict).toBe("exit");
  });
  test("20 shares, or ₹30,000 worth of a pricey one", () => {
    expect(targetQty(100)).toBe(20);
    expect(targetQty(1500)).toBe(20);
    expect(targetQty(2465)).toBe(12);
  });
  test("the leaders list matches the server's", () => {
    const src = readFileSync("supabase/functions/market-data/index.ts", "utf8");
    const server = JSON.parse(src.match(/export const LEADERS = (\[[\s\S]*?\]);/)![1]);
    expect(LEADERS.map((l) => l.sym)).toEqual(server);
  });
});

describe("the plan", () => {
  test("trimming to the fund limit never drops a big fund before a tiny one", () => {
    const S = sample();
    const D = data();
    const kinds = ["Thematic", "Sectoral", "Dynamic Asset Allocation", "Multi Asset Allocation", "Equity Savings", "Aggressive Hybrid"];
    for (let i = 0; i < 14; i++) {
      const isin = `INF00000Z${String(i).padStart(3, "0")}`;
      S.india!.holdings.push(hold(isin, `Fund ${i} - Direct Plan - Growth`, "mf", i === 0 ? 500000 : 2000 + i * 100));
      D.funds[isin] = fund(isin, kinds[i % kinds.length], 13, 13, 0.8, [[`Only${i}`, 50, "L"]]);
    }
    const M = buildModel(S),
      A = analyse(M, S, D),
      P = makePlan(M, S, A, D);
    expect(P.funds.keep.length).toBeLessThanOrEqual(12);
    expect(P.funds.keep.some((k) => k.f.isin === "INF00000Z000")).toBe(true);
    // the large-cap keeper is never trimmed away
    expect(P.funds.keep.some((k) => k.f.isin === "INF0000000A1")).toBe(true);
  });
  test("one fund per kind, stock verdicts, dividends, ideas and this month's buys", () => {
    const S = sample();
    S.settings.plan = { ...PLAN_DEFAULT, monthly: 20000, stocks: 0.5, mix: "equal", div: 5000 };
    const M = buildModel(S),
      D = data(),
      A = analyse(M, S, D),
      P = makePlan(M, S, A, D);
    expect(P.monthly).toBe(20000);
    expect(P.funds.drop.map((d) => d.f.isin)).toEqual(["INF0000000B1"]);
    expect(P.funds.keep.reduce((a, k) => a + k.monthly, 0)).toBeLessThanOrEqual(P.funds.budget);
    const v = Object.fromEntries(P.stocks.map((s) => [s.isin, s.verdict]));
    expect(v.INE0000000D1).toBe("exit");
    expect(v.INE0000000G1).toBe("add");
    expect(v.INE0000000P1).toBe("hold");
    const good = P.stocks.find((s) => s.isin === "INE0000000G1")!;
    expect(good.short).toBe(10);
    expect(good.divYear).toBeCloseTo(5000 * 0.04, 6);
    expect(P.dividend.gap).toBeGreaterThan(0);
    expect(P.dividend.picks.some((p) => p.name === "Coalco" && !p.held)).toBe(true);
    expect(P.ideas[0]).toMatchObject({ sym: "COALINDIA", status: "fair", price: 400 });
    expect(P.buysCost).toBeLessThanOrEqual(10000);
    expect(P.buys[0].isin).toBe("INE0000000G1");
    expect(P.rules.map((r) => r.key)).toEqual(["funds", "stocks", "qty", "size", "div"]);
    expect(P.caps.target.M).toBeCloseTo(1 / 3, 6);
    expect(P.caps.add).toBeGreaterThan(0);
  });
});
