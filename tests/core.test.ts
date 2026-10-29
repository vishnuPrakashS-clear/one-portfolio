import { beforeAll, describe, expect, test } from "vitest";
import { addMonths, ltcgDate, parseLooseDate, setToday, dmy, ddmmmyy } from "@/lib/dates";
import { xirr } from "@/lib/core/xirr";
import { short } from "@/lib/format";
import { applyTransactions, freshState, holdingRows, monthlySplit, rowsFromTransactionsSheet } from "@/lib/core/abroad";
import { rowsFromIndiaSheet } from "@/lib/core/india-sheets";
import { casName, casClass } from "@/lib/core/cas";
import { inRule, inTax } from "@/lib/core/india";
import type { IndHolding } from "@/types/portfolio";

beforeAll(() => setToday("2026-10-29"));

describe("dates and tax clocks", () => {
  test("abroad turns long-term the day after 24 months", () => {
    expect(ltcgDate("2024-02-29")).toBe("2026-03-01");
    expect(ltcgDate("2026-02-10")).toBe("2028-02-11");
  });
  test("Indian equity turns long-term the day after 12 months", () => expect(addMonths("2025-10-28", 12)).toBe("2026-10-29"));
  test("reads the date formats reports use", () => {
    expect(parseLooseDate("12 Mar 2026")).toBe("2026-03-12");
    expect(parseLooseDate("03/12/2026")).toBe("2026-03-12");
    expect(dmy("12-03-2026")).toBe("2026-03-12");
    expect(ddmmmyy("12-Mar-26")).toBe("2026-03-12");
  });
});

describe("money", () => {
  test("short lakh and crore figures", () => {
    expect(short(674835)).toBe("₹6.75 L");
    expect(short(1e7)).toBe("₹1 Cr");
    expect(short(43982)).toBe("₹43,982");
    expect(short(-250000)).toBe("−₹2.5 L");
  });
  test("XIRR of a doubling over one year is 100%", () => {
    expect(
      xirr([
        { d: "2025-01-01", v: -100 },
        { d: "2026-01-01", v: 200 },
      ]),
    ).toBeCloseTo(1, 2);
    expect(xirr([{ d: "2025-01-01", v: 100 }])).toBeNull();
  });
});

describe("Indian tax rules", () => {
  const base = {
    isin: "INE000000001",
    name: "Test",
    units: 10,
    price: 100,
    value: 1000,
    acct: "Groww",
    depo: "CDSL",
    key: "k",
    from: "CAS",
  } as const;
  test("equity: 12 months; gold funds: 24; debt funds: slab", () => {
    expect(inRule({ ...base, type: "stock", cls: "Equity" } as IndHolding).months).toBe(12);
    expect(inRule({ ...base, type: "mf", cls: "Gold & silver" } as IndHolding).months).toBe(24);
    expect(inRule({ ...base, type: "mf", cls: "Debt" } as IndHolding).months).toBeNull();
  });
  test("splits units into long-term, short-term and unknown", () => {
    const h = {
      ...base,
      type: "stock",
      cls: "Equity",
      lots: [
        { d: "2024-01-05", q: 4, p: 50 },
        { d: "2026-06-01", q: 5, p: 90 },
        { d: null, q: 1, p: null },
      ],
    } as IndHolding;
    const t = inTax(h, 100);
    expect([t.lt, t.st, t.unk]).toEqual([4, 5, 1]);
    expect(t.ltG).toBe(200);
    expect(t.stG).toBe(50);
    expect(t.next).toBe("2027-06-02");
  });
});

describe("report readers", () => {
  test("names and classes from the statement", () => {
    expect(casName("B21G - SBI SMALL CAP FUND - DIRECT PLAN - GROWTH", "mf")).toBe("SBI SMALL CAP FUND");
    expect(casClass("HDFC BALANCED ADVANTAGE FUND", "mf")).toBe("Hybrid");
    expect(casClass("NIPPON INDIA ETF GOLD BEES", "etf")).toBe("Gold & silver");
  });
  test("Groww stocks holdings statement", () => {
    const r = rowsFromIndiaSheet([
      ["Holdings statement as on 17-10-2026"],
      [],
      ["Stock Name", "ISIN", "Quantity", "Average buy price", "Buy value", "Closing price"],
      ["NHPC LTD", "INE848E01016", 10, 80.5, 805, 84.2],
    ]);
    expect(r?.kind).toBe("gr-stocks");
    expect(r && "rows" in r && r.rows[0]).toMatchObject({ isin: "INE848E01016", q: 10, avg: 80.5, close: 84.2 });
    expect(r?.asOf).toBe("2026-10-17");
  });
  test("INDmoney transactions rebuild lots oldest first, sales FIFO", () => {
    const tx = rowsFromTransactionsSheet([
      ["Symbol", "Transaction Type", "Quantity", "Execution Price", "Execution Date", "Status"],
      ["LSE:CSPX", "BUY", 2, 600, "2026-01-10", "Filled"],
      ["LSE:CSPX", "BUY", 1, 650, "2026-03-10", "Filled"],
      ["LSE:CSPX", "SELL", 1, 700, "2026-06-01", "Filled"],
      ["VOO", "BUY", 1, 500, "2026-02-01", "Cancelled"],
    ]);
    expect(tx).toHaveLength(3);
    const S = freshState();
    applyTransactions(S, tx!);
    const h = S.holdings.find((x) => x.sym === "LSE~CSPX")!;
    expect(h.lots.map((l) => [l.d, l.q])).toEqual([
      ["2026-01-10", 1],
      ["2026-03-10", 1],
    ]);
    expect(S.sales[0].cost).toBe(600);
    expect(holdingRows(S)[0].action.label).toBe("Keep buying");
    expect(monthlySplit(S).usd).toBeGreaterThan(100);
  });
});
