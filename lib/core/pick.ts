/* "Which should I buy?" for the abroad sleeve: you name a few tickers and an amount; each is scored against your own plan
   (bucket targets, the UCITS preference, the 10% single-company cap, the whole-share funds, and where the price sits in
   its 1-year range) using live prices. Rules only: the same ones the monthly plan follows. Not advice. */

import type { Bucket, Portfolio } from "@/types/portfolio";
import type { LiveQuote } from "@/lib/supabase";
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

export interface Pick {
  sym: string;
  name: string;
  bucket: Bucket | null;
  score: number;
  verdict: "best" | "ok" | "skip";
  why: string[];
  price: number | null;
  /** $ to put in (the whole amount for the top pick), and units it buys */
  usd: number;
  units: number | null;
  limit: number | null;
}

export function pickBest(S: Portfolio, syms: string[], amount: number, quotes: Record<string, LiveQuote>): Pick[] {
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
    let score = 50;
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
    if (bucket) {
      const b = bv.find((x) => x.bucket === bucket);
      const target = b ? (b.w / wsum) * (total + amount) : 0,
        gap = target - (b?.value || 0);
      if (!b || b.w === 0) {
        score -= 30;
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
        why.push(`One company: it would be ${(after * 100).toFixed(0)}% of your US money, over the 10% limit.`);
      } else why.push(`One company: ${(after * 100).toFixed(1)}% of your US money after buying (limit 10%).`);
    }
    // whole shares only
    const whole = !!WHOLE[sym];
    if (whole && price * 1.0075 > amount) {
      score -= 60;
      why.push(`Sold only in whole shares and 1 share (≈$${(price * 1.0075).toFixed(2)}) is more than $${amount.toFixed(2)}.`);
    }
    // price within its 1-year range
    if (q?.hi52 && q.lo52 && q.hi52 > q.lo52) {
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
    return { sym, name: raw?.name || cat?.name || "", bucket, score, verdict: "ok", why, price, usd: 0, units: null, limit: null };
  });
  out.sort((a, b) => b.score - a.score);
  const top = out[0];
  for (const p of out) {
    p.verdict = p === top && p.score >= 40 ? "best" : p.score >= 40 ? "ok" : "skip";
    if (p.price && p.verdict !== "skip") {
      p.limit = +(p.price * 1.002).toFixed(2);
      const whole = !!WHOLE[p.sym];
      p.units = whole ? Math.floor(amount / (p.price * 1.0075)) : +(amount / p.limit).toFixed(4);
      p.usd = whole ? (p.units || 0) * p.price : amount;
    }
  }
  return out;
}
