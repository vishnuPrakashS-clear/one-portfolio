import { describe, expect, test } from "vitest";
import { netTax, rebalancePlan } from "@/lib/core/rebalance";
import { freshState } from "@/lib/core/abroad";
import type { Portfolio } from "@/types/portfolio";

function state(): Portfolio {
  const S = freshState();
  S.settings.fx = 90;
  S.settings.slab = 30;
  S.settings.cess = 0;
  S.settings.monthlyInr = 9000;
  S.settings.feePct = 0;
  const h = (sym: string, bucket: string, plan: string, price: number, lots: [string, number, number, number][]) =>
    S.holdings.push({
      sym,
      name: sym,
      bucket,
      plan,
      price,
      priceAt: "2026-11-17",
      lots: lots.map(([d, q, p, fx]) => ({ d, q, p, fx })),
    } as never);
  // US tech far over target: an old long-term lot with a gain, a recent lot at a loss
  h("LSE~CNDX", "US tech", "core", 100, [
    ["2023-01-10", 5, 60, 82],
    ["2026-09-01", 5, 110, 88],
  ]);
  h("LSE~CSPX", "US core", "core", 100, [["2025-01-10", 2, 90, 86]]);
  return S;
}

describe("rebalance by selling", () => {
  test("never-below-cost sells the old long-term units first and skips the loss-making ones", () => {
    const P = rebalancePlan(state(), { today: "2026-11-17" });
    expect(P.orders).toHaveLength(1);
    const o = P.orders[0];
    expect(o.sym).toBe("LSE~CNDX");
    expect(o.chunks.every((c) => c.d === "2023-01-10" && c.isLT)).toBe(true);
    expect(o.limit).toBeGreaterThanOrEqual(o.breakeven);
    // long-term gain taxed at 12.5%
    expect(P.tax).toBeCloseTo(P.gainLT * 0.125, 0);
  });
  test("a short-term loss offsets long-term gains; a long-term loss doesn't touch short-term gains", () => {
    const r = { st: 0.3, lt: 0.125 };
    expect(netTax(-1000, 3000, r)).toBeCloseTo(2000 * 0.125);
    expect(netTax(1000, -3000, r)).toBeCloseTo(300);
  });
  test("new money alone needs some months; halfway sells about half", () => {
    const S = state(),
      full = rebalancePlan(S, { today: "2026-11-17" }),
      half = rebalancePlan(S, { share: 0.5, today: "2026-11-17" });
    expect(full.months).toBeGreaterThan(0);
    expect(half.aim).toBeCloseTo(full.aim / 2, 1);
  });
});

describe("long-term units only", () => {
  test("sells nothing under 24 months and says when the next units turn long-term", () => {
    const P = rebalancePlan(state(), { mode: "lt-only", today: "2026-11-17" });
    expect(P.orders.flatMap((o) => o.chunks).every((c) => c.isLT)).toBe(true);
    expect(P.gainST).toBe(0);
    expect(P.nextLT).toBe("2028-09-02");
  });
});

describe("one sell order", () => {
  test("FIFO units, long-term and no-loss counts, tax", async () => {
    const { sellTicket } = await import("@/lib/core/rebalance");
    const t = sellTicket(state(), "LSE~CNDX", 6, 100, 90, "2026-11-17")!;
    expect(t.ltQty).toBe(5);
    expect(t.noLossQty).toBe(5); // the 2026 lot at $110 is a loss at $100
    expect(t.chunks.map((c) => c.q)).toEqual([5, 1]);
    expect(t.gainLT).toBeCloseTo(5 * (100 * 90 - 60 * 82));
    expect(t.gainST).toBeCloseTo(100 * 90 - 110 * 88);
    expect(t.tax).toBeCloseTo((t.gainLT + t.gainST) * 0.125); // the short-term loss offsets the long-term gain
  });
});
