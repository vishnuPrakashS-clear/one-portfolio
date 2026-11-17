import { describe, expect, test } from "vitest";
import { fileRange, groupOf, reportCards } from "@/lib/coverage";

describe("report coverage", () => {
  test("reads the date range from a Groww file name", () => {
    expect(fileRange("Stocks_Order_History_ABC_01-04-2026_15-11-2026.xlsx")).toEqual({ from: "2026-04-01", to: "2026-11-15" });
    expect(fileRange("holdings.xlsx")).toBeNull();
  });
  test("one card per kind, grouped, newest upload first", () => {
    const c = reportCards([
      { kind: "gr-st-orders", at: "2026-11-16T10:00:00Z", count: 131 },
      { kind: "gr-st-orders", at: "2026-11-17T10:00:00Z", count: 40 },
      { kind: "cas", at: "2026-10-05T10:00:00Z", count: 60 },
      { kind: "zd-div", at: "2026-10-05T10:00:00Z", count: 3 },
    ]);
    expect(c.orders).toHaveLength(1);
    expect(c.orders[0].all).toHaveLength(2);
    expect(c.orders[0].latest.count).toBe(40);
    expect(c.holdings[0].kind).toBe("cas");
    expect(c.income[0].kind).toBe("zd-div");
    expect(groupOf("unknown")).toBe("statements");
  });
});
