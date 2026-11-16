import { describe, expect, test } from "vitest";
import { sipOf } from "@/lib/model";

const win = ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"] as const;
const lot = (d: string, amt: number) => ({ d, q: amt / 100, p: 100 });

describe("SIP detection", () => {
  test("a fund bought most months is a SIP at its usual amount", () => {
    const lots = ["2026-05-05", "2026-06-05", "2026-07-05", "2026-08-05", "2026-09-05", "2026-10-05"].map((d) => lot(d, 5000));
    expect(sipOf(lots, [...win])).toBe(5000);
  });
  test("a one-off lump sum or a switch isn't a SIP", () => {
    expect(sipOf([lot("2026-10-12", 150000)], [...win])).toBe(0);
    expect(sipOf([lot("2026-06-01", 2000), lot("2026-10-12", 50000)], [...win])).toBe(0);
  });
  test("a SIP that stopped months ago doesn't count", () => {
    const lots = ["2026-05-05", "2026-06-05", "2026-07-05"].map((d) => lot(d, 3000));
    expect(sipOf(lots, [...win])).toBe(0);
  });
  test("a step-up or a missed month still reads as the usual amount", () => {
    const lots = [lot("2026-06-05", 2000), lot("2026-07-05", 2000), lot("2026-09-05", 2500), lot("2026-10-05", 2500)];
    expect(sipOf(lots, [...win])).toBe(2500);
  });
});
