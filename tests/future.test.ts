import { describe, expect, test } from "vitest";
import { grow, monthlyFor, real } from "@/lib/future";
import { fv } from "@/lib/model";

describe("future value", () => {
  test("no step-up matches the plain SIP formula (to within a rupee per lakh)", () => {
    const g = grow(500000, 10000, 10, 0.11);
    const f = fv(500000, 10000, 0.11, 10);
    expect(Math.abs(g.value - f) / f).toBeLessThan(0.012); // fv adds at the start of each month, grow at the end
    expect(g.added).toBe(10000 * 120);
    expect(g.years).toHaveLength(11);
  });
  test("a lump sum alone doubles in about 6.6 years at 11%", () => {
    expect(grow(100, 0, 6.64, 0.11).value).toBeCloseTo(200, -0.5);
  });
  test("a 10% yearly step-up adds more money and more growth", () => {
    const a = grow(0, 10000, 10, 0.12),
      b = grow(0, 10000, 10, 0.12, 0.1);
    expect(b.added).toBeGreaterThan(a.added * 1.5);
    expect(b.value).toBeGreaterThan(a.value);
  });
  test("today's money and the amount needed for a target", () => {
    expect(real(179085, 10)).toBeCloseTo(100000, -2);
    const m = monthlyFor(10000000, 800000, 15, 0.12);
    expect(grow(800000, m, 15, 0.12).value).toBeCloseTo(10000000, -2);
  });
});
