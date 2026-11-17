import { describe, expect, test } from "vitest";
import { normSym, pickBest } from "@/lib/core/pick";
import { freshState } from "@/lib/core/abroad";
import type { Portfolio } from "@/types/portfolio";
import type { LiveQuote } from "@/lib/supabase";

const q = (price: number, type = "ETF"): LiveQuote => ({
  price,
  at: "",
  prevClose: price,
  dayHigh: null,
  dayLow: null,
  hi52: price * 1.2,
  lo52: price * 0.8,
  currency: "USD",
  exchange: "",
  open: true,
  opens: null,
  type,
});

function state(): Portfolio {
  const S = freshState();
  S.settings.fx = 90;
  const h = (sym: string, bucket: string, plan: string, price: number, n: number) =>
    S.holdings.push({ sym, name: sym, bucket, plan, price, priceAt: "2026-11-17", lots: [{ d: "2025-01-01", q: n, p: price }] } as never);
  h("LSE~CNDX", "US tech", "core", 1000, 0.3); // $300: far over its 20%
  h("LSE~CSPX", "US core", "core", 700, 0.1); // $70: far under its 45%
  return S;
}

describe("which should I buy", () => {
  test("names map to the plan's symbols", () => {
    expect(normSym("cspx")).toBe("LSE~CSPX");
    expect(normSym("CSPX.L")).toBe("LSE~CSPX");
    expect(normSym("voo")).toBe("VOO");
  });
  test("the under-target plan fund beats its US twin and the over-target bucket", () => {
    const r = pickBest(state(), ["VOO", "LSE~CSPX", "LSE~CNDX"], 100, { VOO: q(600), "LSE~CSPX": q(700), "LSE~CNDX": q(1000) });
    expect(r[0].sym).toBe("LSE~CSPX");
    expect(r[0].verdict).toBe("best");
    expect(r.find((x) => x.sym === "LSE~CNDX")!.verdict).toBe("skip");
    expect(r[0].units).toBeCloseTo(100 / r[0].limit!, 3);
  });
  test("a London quote in pounds isn't read as dollars", () => {
    const r = pickBest(state(), ["LSE~COPX"], 100, { "LSE~COPX": { ...q(51.5), currency: "GBP" } });
    expect(r[0].price).toBe(63.59);
    expect(r[0].units).toBe(1);
  });
});

test("metrics: steady growth, a fair price and an Acc fund score higher than a stretched high-dividend one", async () => {
  const { qualityOf } = await import("@/lib/core/pick");
  const good = qualityOf("LSE~CSPX", true, {
    r1: 0.12,
    r3: 0.14,
    r5: 0.13,
    vol: 0.16,
    fromHigh: -0.05,
    vs200: 0.0,
    maxDD3: -0.2,
    yield: 0,
  });
  const meh = qualityOf("SCHD", true, {
    r1: 0.02,
    r3: 0.04,
    r5: 0.08,
    vol: 0.15,
    fromHigh: -0.01,
    vs200: 0.18,
    maxDD3: -0.15,
    yield: 0.037,
  });
  expect(good.score!).toBeGreaterThan(meh.score! + 25);
  expect(qualityOf("X", true, undefined).score).toBeNull();
});

describe("splitting the wallet", () => {
  const mk = (sym: string, bucket: string, gap: number, score: number, price: number) =>
    ({
      sym,
      name: "",
      bucket,
      score,
      fit: score,
      quality: score,
      parts: [],
      blocked: false,
      gap,
      verdict: "ok",
      why: [],
      price,
      usd: 0,
      units: null,
      limit: null,
    }) as never;
  test("splits by gap and score, one fund per bucket; a whole share too big for its slice sits out", async () => {
    const { splitAmount } = await import("@/lib/core/pick");
    const r = splitAmount(
      [
        mk("LSE~CSPX", "US core", 84, 96, 790),
        mk("LSE~IJPA", "Japan", 60, 86, 76.7),
        mk("LSE~COPX", "Copper", 55, 77, 51.54),
        mk("VOO", "US core", 84, 66, 673),
      ],
      104.8,
    );
    const by = Object.fromEntries(r.map((p) => [p.sym, p.usd]));
    expect(by["VOO"]).toBe(0);
    expect(by["LSE~COPX"]).toBe(0);
    expect(by["LSE~CSPX"]).toBeGreaterThan(by["LSE~IJPA"]);
    expect(by["LSE~CSPX"] + by["LSE~IJPA"]).toBeCloseTo(104.8, 1);
    expect(by["LSE~CSPX"]).toBeLessThanOrEqual(84);
  });
  test("a whole-share fund with a big enough gap gets 1 share and the rest is split", async () => {
    const { splitAmount } = await import("@/lib/core/pick");
    const r = splitAmount([mk("LSE~CSPX", "US core", 40, 90, 790), mk("LSE~COPX", "Copper", 80, 90, 50)], 104.8);
    const copx = r.find((p) => p.sym === "LSE~COPX")!;
    expect(copx.units).toBe(1);
    expect(copx.usd + r.find((p) => p.sym === "LSE~CSPX")!.usd).toBeLessThanOrEqual(104.8);
  });
  test("leaving one out re-splits the money among the rest", async () => {
    const { splitAmount } = await import("@/lib/core/pick");
    const r = splitAmount([mk("LSE~CSPX", "US core", 84, 96, 790), mk("LSE~IJPA", "Japan", 60, 86, 76.7)], 100, new Set(["LSE~CSPX"]));
    expect(r.find((p) => p.sym === "LSE~IJPA")!.usd).toBeCloseTo(100, 0);
  });
});
