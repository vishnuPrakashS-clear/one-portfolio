import { beforeAll, describe, expect, test } from "vitest";
import { setToday } from "@/lib/dates";
import { buildModel } from "@/lib/model";
import { freshState } from "@/lib/core/abroad";
import { analyse, norm, shortFund, verdictBand } from "@/lib/analysis";
import type { CasHolding, Portfolio } from "@/types/portfolio";
import type { MarketData, MarketFund } from "@/types/market";

beforeAll(() => setToday("2026-10-29"));

const hold = (isin: string, name: string, type: CasHolding["type"], value: number, cls: CasHolding["cls"] = "Equity"): CasHolding => ({
  isin,
  name,
  type,
  cls,
  units: value / 100,
  price: 100,
  value,
  acct: "Groww",
  depo: type === "mf" ? "MF" : "CDSL",
});

/** a made-up investor: two flexi-cap funds that share most of their stocks (one a regular plan), one large-cap fund,
    and a direct holding in the most common stock */
function sample(): Portfolio {
  const S = freshState();
  S.india = {
    asOf: "2026-10-29",
    total: 0,
    accounts: [],
    mix: {},
    history: [],
    holdings: [
      hold("INF000000A01", "Alpha Flexi Cap Fund - Direct Plan - Growth", "mf", 400000),
      hold("INF000000B01", "Beta Flexi Cap Fund - Regular Plan - Growth", "mf", 300000),
      hold("INF000000C01", "Gamma Large Cap Fund - Direct Plan - Growth", "mf", 200000),
      hold("INE000000X01", "Bigbank Ltd", "stock", 100000),
    ],
    src: {},
  };
  return S;
}
const line = (n: string, i: string | null, w: number, s = "Financial Services", c: "L" | "M" | "S" = "L") => ({
  n,
  i,
  s,
  w,
  t: "E" as const,
  c,
});
const fund = (
  isin: string,
  sub: string,
  plan: string,
  er: number,
  der: number,
  r3: number,
  c3: number,
  holdings: MarketFund["holdings"],
): MarketFund => ({
  isin,
  search_id: isin.toLowerCase(),
  name: isin,
  info: {
    cat: "Equity",
    sub,
    plan,
    er,
    der,
    aum: 5000,
    risk: "Very High",
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
  holdings,
  as_of: "2026-09-30",
  fetched_at: "2026-11-01",
  miss: null,
});
function data(): MarketData {
  const shared = [
    line("Bigbank Ltd", "INE000000X01", 10),
    line("Softco Ltd", "INE000000Y01", 9, "Information Technology"),
    line("Oilco Ltd", "INE000000Z01", 8, "Oil Gas & Consumable Fuels"),
    line("Carco Ltd", "INE000000W01", 7, "Automobile and Auto Components", "M"),
  ];
  return {
    funds: {
      INF000000A01: fund("INF000000A01", "Flexi Cap", "Direct", 0.7, 0.7, 18, 15, [
        ...shared,
        line("Smallco Ltd", "INE000000V01", 6, "Chemicals", "S"),
        { n: "Treps", i: null, s: null, w: 5, t: "C", c: null },
      ]),
      INF000000B01: fund("INF000000B01", "Flexi Cap", "Regular", 1.9, 0.9, 12, 15, [
        ...shared.map((l) => ({ ...l, w: l.w - 1 })),
        line("Pharmaco Ltd", "INE000000U01", 5, "Healthcare", "M"),
      ]),
      INF000000C01: fund("INF000000C01", "Large Cap", "Direct", 0.9, 0.9, 14, 13.5, [
        line("Bigbank Ltd", "INE000000X01", 9),
        line("Fmcgco Ltd", "INE000000T01", 8, "Fast Moving Consumer Goods"),
      ]),
    },
    stocks: {},
    klass: {},
  };
}

describe("portfolio health", () => {
  test("opens up funds: a stock held directly and through funds adds up", () => {
    const S = sample(),
      M = buildModel(S),
      A = analyse(M, S, data());
    const big = A.exposures.find((e) => e.isin === "INE000000X01")!;
    // 1,00,000 direct + 10% of 4 L + 9% of 3 L + 9% of 2 L
    expect(Math.round(big.value)).toBe(100000 + 40000 + 27000 + 18000);
    expect(big.via.map((v) => v.name)).toEqual(["Alpha Flexi Cap Fund", "Beta Flexi Cap Fund", "Gamma Large Cap Fund"]);
    expect(A.exposures[0].isin).toBe("INE000000X01");
    expect(A.buckets.cash).toBeCloseTo(20000, -1);
  });
  test("overlap is the sum of the smaller weight of every shared stock", () => {
    const S = sample(),
      A = analyse(buildModel(S), S, data());
    const ab = A.overlaps.find(
      (o) =>
        [o.a, o.b]
          .map((i) => A.funds[i].isin)
          .sort()
          .join() === "INF000000A01,INF000000B01",
    )!;
    expect(ab.pct).toBeCloseTo(9 + 8 + 7 + 6, 5);
    expect(ab.common[0].name).toBe("Bigbank");
  });
  test("score, bands, report cards and the plan", () => {
    const S = sample(),
      A = analyse(buildModel(S), S, data());
    expect(A.score).not.toBeNull();
    expect(A.score!).toBeGreaterThan(0);
    expect(A.score!).toBeLessThanOrEqual(100);
    expect(A.parts.map((p) => p.key)).toEqual(["stocks", "sectors", "size", "assets", "overlap"]);
    const beta = A.funds.find((f) => f.isin === "INF000000B01")!;
    expect(beta.verdict).toBe("review");
    expect(beta.flags.some((f) => f.text.startsWith("Regular plan"))).toBe(true);
    expect(A.funds.find((f) => f.isin === "INF000000A01")!.verdict).toBe("good");
    expect(A.actions[0].level).toBe(1);
    const dup = A.actions.find((a) => a.kind === "duplicate")!;
    expect(dup.body).toContain("Alpha Flexi Cap Fund has the best record");
    const cost = A.actions.find((a) => a.kind === "cost" && a.title.includes("regular"))!;
    expect(cost.impact).toMatch(/^About ₹[\d,]+ more after 10 years$/);
    expect(A.actions.some((a) => a.kind === "stock" && a.title.startsWith("Bigbank"))).toBe(true);
  });
  test("funds that all overlap heavily get one keeper, not contradicting advice", () => {
    const S = sample(),
      D = data();
    const big = (f: MarketFund) => ({ ...f, holdings: f.holdings!.map((l) => (l.t === "E" ? { ...l, w: l.w * 2 } : l)) });
    D.funds.INF000000A01 = big(D.funds.INF000000A01);
    D.funds.INF000000B01 = big(D.funds.INF000000B01);
    D.funds.INF000000C01 = { ...D.funds.INF000000C01, holdings: D.funds.INF000000A01.holdings };
    const A = analyse(buildModel(S), S, D);
    const groups = A.actions.filter((a) => a.kind === "overlap" && a.level === 1);
    expect(groups).toHaveLength(1);
    expect(groups[0].title).toBe("3 of your funds hold mostly the same stocks");
    expect(groups[0].body.match(/Keep /g)).toHaveLength(1);
    expect(A.actions.some((a) => a.kind === "duplicate")).toBe(false);
  });
  test("helpers", () => {
    expect(norm("ICICI Bank Ltd.")).toBe(norm("ICICI BANK LIMITED"));
    expect(shortFund("HDFC Focused Fund - Direct Plan - Growth Option")).toBe("HDFC Focused Fund");
    expect(verdictBand(80).label).toBe("Very good");
    expect(verdictBand(51).label).toBe("Good");
    expect(verdictBand(26).label).toBe("Low");
    expect(verdictBand(25).label).toBe("Extremely low");
  });
});
