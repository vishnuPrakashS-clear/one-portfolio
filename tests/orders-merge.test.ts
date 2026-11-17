import { describe, expect, test } from "vitest";
import { mergeOrders } from "@/lib/core/india-sheets";
import type { OrderRow } from "@/types/portfolio";

const o = (d: string, n: string, q: number, v: number, s: 1 | -1 = 1): OrderRow => ({ d, n, q, v, s });

describe("order histories add up across uploads", () => {
  test("an older year's file joins the current one; the overlap counts once", () => {
    const fy27 = mergeOrders(undefined, "2026-11-16", [o("2026-05-02", "ITC", 5, 1500), o("2026-08-24", "ITC", 10, 3000)], "fy27.xlsx");
    const both = mergeOrders(fy27, "2026-03-31", [o("2024-05-21", "ITC", 10, 3769), o("2026-05-02", "ITC", 5, 1500)], "fy25-27.xlsx");
    expect(both.rows.map((r) => r.d)).toEqual(["2024-05-21", "2026-05-02", "2026-08-24"]);
    expect(both.asOf).toBe("2026-11-16");
    expect(both.file).toBe("fy27.xlsx + fy25-27.xlsx");
  });
  test("two identical fills on one day in one file both stay", () => {
    const a = mergeOrders(undefined, "2026-11-16", [o("2026-05-02", "ITC", 1, 300), o("2026-05-02", "ITC", 1, 300)], "a.xlsx");
    expect(a.rows).toHaveLength(2);
    const again = mergeOrders(a, "2026-11-16", [o("2026-05-02", "ITC", 1, 300), o("2026-05-02", "ITC", 1, 300)], "a.xlsx");
    expect(again.rows).toHaveLength(2);
  });
});
