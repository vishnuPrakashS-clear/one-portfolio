/* "Which should I buy?" for the abroad sleeve: you name a few tickers and an amount; each is scored against your own plan
   (bucket targets, the UCITS preference, the 10% single-company cap, the whole-share funds, and where the price sits in
   its 1-year range) using live prices. Rules only: the same ones the monthly plan follows. Not advice. */

import type { Bucket, Portfolio } from "@/types/portfolio";
import type { LiveQuote, Metrics } from "@/lib/supabase";
import { bucketView, CATALOG, holdingRows, SINGLE, WHOLE } from "./abroad";

/** US-listed funds and the London (UCITS Acc) version your plan buys instead */
export const UCITS_TWIN: Record<string, string> = {
  VOO: "LSE~CSPX",
  SPY: "LSE~CSPX",
  IVV: "LSE~CSPX",
  SPLG: "LSE~CSPX",
  QQQ: "LSE~CNDX",
  QQQM: "LSE~CNDX",
  EWJ: "LSE~IJPA",
  BBJP: "LSE~IJPA",
  COPX: "LSE~COPX",
  CPER: "LSE~COPX",
};
/** what people type -> the symbol the app uses (London funds carry an "LSE~" prefix) */
export function normSym(t: string): string {
  const s = t
    .trim()
    .toUpperCase()
    .replace(/^LSE[:~]/, "LSE~")
    .replace(/\.L$/, "");
  if (s.startsWith("LSE~")) return s;
  if (CATALOG["LSE~" + s] && !CATALOG[s]) return "LSE~" + s; // CSPX, CNDX, IJPA, COPX, CPPR
  return s;
}
export const show = (s: string) => s.replace(/^LSE~/, "");

/** yearly fund cost (TER, %) of the funds the plan knows; single companies cost nothing to hold */
export const TER: Record<string, number> = {
  "LSE~CSPX": 0.07,
  "LSE~CNDX": 0.3,
  "LSE~IJPA": 0.15,
  "LSE~COPX": 0.65,
  VOO: 0.03,
  IVV: 0.03,
  SPY: 0.0945,
  SPLG: 0.02,
  VT: 0.06,
  QQQ: 0.2,
  QQQM: 0.15,
  EWJ: 0.5,
  SCHD: 0.06,
  VIG: 0.05,
  EWZ: 0.59,
  EWY: 0.59,
  EWT: 0.59,
  COPX: 0.65,
};

/** the metrics half of the score (0–100): growth, return per unit of risk, where the price is against its trend,
    cost, and the tax drag of dividends paid to an Indian resident */
export function qualityOf(sym: string, isEtf: boolean, m: Metrics | undefined) {
  const parts: { k: string; v: number; max: number; note: string }[] = [];
  if (!m) return { score: null as number | null, parts };
  const pc = (x: number | null) => (x == null ? "—" : `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(1)}%`);
  const g = m.r5 != null && m.r3 != null ? (m.r5 + m.r3) / 2 : (m.r3 ?? m.r1 ?? 0);
  parts.push({
    k: "Growth",
    v: Math.max(0, Math.min(30, (g / 0.15) * 30)),
    max: 30,
    note: `${pc(m.r1)} 1y · ${pc(m.r3)} 3y · ${pc(m.r5)} 5y a year`,
  });
  const sh = m.vol > 0 ? g / m.vol : 0;
  parts.push({
    k: "Return for the risk",
    v: Math.max(0, Math.min(20, sh * 20)),
    max: 20,
    note: `swings ${(m.vol * 100).toFixed(0)}% a year · worst fall in 3y ${pc(m.maxDD3)}`,
  });
  // in an uptrend but not stretched scores best; far above the 200-day average is stretched; far below is a downtrend
  const t = m.vs200;
  parts.push({
    k: "Right now",
    v: Math.max(4, Math.min(20, 20 - Math.abs(t + 0.02) * 80)),
    max: 20,
    note: `${pc(t)} vs its 200-day average · ${pc(m.fromHigh)} from its 1-year high`,
  });
  const ter = TER[sym];
  parts.push({
    k: "Cost",
    v: !isEtf ? 15 : ter == null ? 8 : Math.max(0, 15 - ter * 15),
    max: 15,
    note: !isEtf ? "a single company: no fund fee" : ter == null ? "fund fee not known" : `${ter}% a year`,
  });
  const lse = sym.startsWith("LSE~");
  parts.push({
    k: "Dividend tax",
    v: lse || m.yield < 0.001 ? 15 : Math.max(0, 15 - m.yield * 100 * 5),
    max: 15,
    note:
      lse || m.yield < 0.001
        ? "reinvested inside the fund: nothing to declare each year"
        : `${(m.yield * 100).toFixed(2)}% paid out: 25% US withholding, then your slab rate`,
  });
  return { score: Math.round(parts.reduce((a, x) => a + x.v, 0)), parts };
}

export interface Pick {
  sym: string;
  name: string;
  bucket: Bucket | null;
  score: number;
  /** fit with your plan (0–100) and the metrics score (0–100) */
  fit: number;
  quality: number | null;
  parts: ReturnType<typeof qualityOf>["parts"];
  /** a plan rule rules it out (over the 10% cap, 0% target, being wound down, can't afford a whole share) */
  blocked: boolean;
  /** $ the bucket is below (+) or above (−) its target, after adding the amount */
  gap: number;
  verdict: "best" | "ok" | "skip";
  why: string[];
  price: number | null;
  /** $ to put in (the whole amount for the top pick), and units it buys */
  usd: number;
  units: number | null;
  limit: number | null;
}

export function pickBest(
  S: Portfolio,
  syms: string[],
  amount: number,
  quotes: Record<string, LiveQuote>,
  metrics: Record<string, Metrics> = {},
): Pick[] {
  const bv = bucketView(S),
    total = bv[0]?.total || 0,
    wsum = bv.reduce((a, b) => a + b.w, 0) || 100,
    rows = holdingRows(S);
  const out: Pick[] = syms.map((sym) => {
    const raw = quotes[sym],
      // a quote in another currency (London sometimes quotes in £) can't be compared with dollars: use the last $ price
      q = raw && (!raw.currency || raw.currency.toUpperCase() === "USD") ? raw : undefined,
      cat = CATALOG[sym],
      why: string[] = [];
    let score = 50,
      blocked = false;
    const price = q?.price ?? S.holdings.find((h) => h.sym === sym)?.price ?? WHOLE[sym] ?? null;
    if (raw && !q) why.push(`Quoted in ${raw.currency} on the exchange; using your last dollar price.`);
    const isEtf = raw?.type ? /ETF|FUND/i.test(raw.type) : !!cat && !SINGLE.has(sym);
    const bucket: Bucket | null = cat?.bucket ?? (isEtf ? null : "Satellite");
    if (!price) {
      why.push("No price found for this symbol: check the spelling (London funds: CSPX, CNDX, IJPA, COPX).");
      return {
        sym,
        name: q?.name || cat?.name || "",
        bucket,
        score: -999,
        fit: 0,
        quality: null,
        parts: [],
        blocked: true,
        gap: 0,
        verdict: "skip",
        why,
        price: null,
        usd: 0,
        units: null,
        limit: null,
      };
    }
    // the plan's own view of this symbol
    if (cat?.plan === "core") {
      score += 15;
      why.push("Your monthly plan buys this.");
    } else if (cat?.plan === "legacy") {
      score -= 40;
      blocked = true;
      why.push("You're winding this down in the plan; adding more works against it.");
    } else if (cat?.plan === "keep") {
      score -= 15;
      why.push("You hold it, but new money goes to its London version.");
    }
    const twin = UCITS_TWIN[sym];
    if (twin) {
      score -= 20;
      why.push(
        `${show(twin)} holds the same and is the London (UCITS Acc) version: no dividends to declare, 15% US withholding instead of 25%, no US estate tax.`,
      );
    }
    // bucket gap
    let gap = 0;
    if (bucket) {
      const b = bv.find((x) => x.bucket === bucket);
      const target = b ? (b.w / wsum) * (total + amount) : 0;
      gap = target - (b?.value || 0);
      if (!b || b.w === 0) {
        score -= 30;
        blocked = true;
        why.push(`${bucket} has a 0% target in your plan.`);
      } else if (gap > 0) {
        const fill = Math.min(1, gap / amount);
        score += 10 + 25 * fill;
        why.push(`${bucket} is below target by $${gap.toFixed(0)} (${b.pct.toFixed(0)}% now vs ${b.w}%).`);
      } else {
        score -= 30 + Math.min(20, (-gap / Math.max(1, total)) * 100);
        why.push(`${bucket} is already above target (${b.pct.toFixed(0)}% vs ${b.w}%).`);
      }
    } else {
      score -= 10;
      why.push("A fund outside your plan's buckets: it would be a new bucket to track.");
    }
    // one company may not pass 10% of the sleeve
    if (!isEtf || SINGLE.has(sym)) {
      const now = rows.find((r) => r.sym === sym)?.value || 0,
        after = (now + amount) / (total + amount);
      if (after > 0.1) {
        score -= 30;
        blocked = true;
        why.push(`One company: it would be ${(after * 100).toFixed(0)}% of your US money, over the 10% limit.`);
      } else why.push(`One company: ${(after * 100).toFixed(1)}% of your US money after buying (limit 10%).`);
    }
    // whole shares only
    const whole = !!WHOLE[sym];
    if (whole && price * 1.0075 > amount) {
      score -= 60;
      blocked = true;
      why.push(`Sold only in whole shares and 1 share (≈$${(price * 1.0075).toFixed(2)}) is more than $${amount.toFixed(2)}.`);
    }
    // price within its 1-year range (only when the 5-year metrics didn't come back; they cover this better)
    if (!metrics[sym] && q?.hi52 && q.lo52 && q.hi52 > q.lo52) {
      const pos = (price - q.lo52) / (q.hi52 - q.lo52);
      if (pos > 0.9) {
        score -= 8;
        why.push(`Near its 1-year high (${Math.round(pos * 100)}% of the range).`);
      } else if (pos < 0.4) {
        score += 6;
        why.push(`In the lower part of its 1-year range (${Math.round(pos * 100)}%).`);
      } else why.push(`Mid-range for the year (${Math.round(pos * 100)}%).`);
    }
    if (q?.prevClose) {
      const d = price / q.prevClose - 1;
      if (d < -0.02) why.push(`Down ${(Math.abs(d) * 100).toFixed(1)}% today.`);
    }
    const fit = Math.max(0, Math.min(100, Math.round(score))),
      Q = qualityOf(sym, isEtf, metrics[sym]);
    const final = Q.score == null ? fit : Math.round(0.55 * fit + 0.45 * Q.score);
    return {
      sym,
      name: raw?.name || cat?.name || "",
      bucket,
      score: final,
      fit,
      quality: Q.score,
      parts: Q.parts,
      blocked,
      gap,
      verdict: "ok",
      why,
      price,
      usd: 0,
      units: null,
      limit: null,
    };
  });
  out.sort((a, b) => Number(a.blocked) - Number(b.blocked) || b.score - a.score);
  const top = out[0];
  for (const p of out) {
    p.verdict = p.blocked || p.score < 45 || p.fit < 35 ? "skip" : p === top ? "best" : "ok"; // good metrics alone don't make a bucket that is over target worth adding to
  }
  return splitAmount(out, amount);
}

/* Split the money across the picks that fit (or the ones you chose): one fund per bucket (the best-scoring), each bucket
   getting money in proportion to how far it is below target, weighted by its score, never more than its gap until every
   gap is filled. A whole-share fund gets 1+ shares only when its share of the money covers most of a share; otherwise it
   sits out and its money goes to the rest. Orders under $2 are folded into the others. */
export function splitAmount(picks: Pick[], amount: number, exclude: ReadonlySet<string> = new Set()): Pick[] {
  const out = picks.map((p) => ({ ...p, usd: 0, units: null as number | null, limit: null as number | null }));
  const seen = new Set<string>();
  let pool = out.filter(
    (p) =>
      p.verdict !== "skip" && p.price && !exclude.has(p.sym) && !(p.bucket && seen.has(p.bucket)) && (p.bucket ? seen.add(p.bucket) : true),
  );
  const share = (ps: typeof pool, money: number) => {
    const w = ps.map((p) => Math.max(1, p.gap) * (p.score / 100)),
      ws = w.reduce((a, b) => a + b, 0) || 1;
    let alloc = ps.map((_, i) => (money * w[i]) / ws);
    // cap at the gap while other gaps are open, then spread what is left by weight
    const gapSum = ps.reduce((a, p) => a + Math.max(0, p.gap), 0);
    if (gapSum >= money) {
      for (let k = 0; k < 5; k++) {
        const over = alloc.reduce((a, v, i) => a + Math.max(0, v - Math.max(0, ps[i].gap)), 0);
        if (over < 0.01) break;
        alloc = alloc.map((v, i) => Math.min(v, Math.max(0, ps[i].gap)));
        const room = ps.map((p, i) => Math.max(0, p.gap) - alloc[i]),
          rs = room.reduce((a, b) => a + b, 0) || 1;
        alloc = alloc.map((v, i) => v + (over * room[i]) / rs);
      }
    }
    return alloc;
  };
  for (let round = 0; round < 6 && pool.length; round++) {
    const alloc = share(pool, amount);
    // whole-share funds: buy floor(alloc / price) shares, but 1 share if the allocation covers 60% of one and the money allows
    let fixed = 0,
      drop: string[] = [];
    pool.forEach((p, i) => {
      if (!WHOLE[p.sym]) return;
      const px = p.price! * 1.0075,
        n = Math.floor(alloc[i] / px) || (alloc[i] >= 0.6 * px && px <= amount ? 1 : 0);
      if (!n) drop.push(p.sym);
      else {
        p.units = n;
        p.usd = n * px;
        fixed += p.usd;
      }
    });
    const rest = pool.filter((p) => !WHOLE[p.sym]);
    const small = rest.length ? share(rest, amount - fixed) : [];
    drop = drop.concat(rest.filter((_, i) => small[i] < 2).map((p) => p.sym));
    if (drop.length && round < 5) {
      pool.forEach((p) => {
        p.units = null;
        p.usd = 0;
      });
      pool = pool.filter((p) => !drop.includes(p.sym));
      continue;
    }
    rest.forEach((p, i) => {
      p.usd = Math.floor(small[i] * 100) / 100;
    });
    break;
  }
  for (const p of out) {
    if (!p.usd || !p.price) continue;
    p.limit = +(p.price * 1.002).toFixed(2);
    if (!WHOLE[p.sym]) p.units = Math.floor((p.usd / p.limit) * 10000) / 10000;
  }
  return out;
}
