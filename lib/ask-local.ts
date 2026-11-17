/* Answers the Ask screen gives straight from your own numbers, with no AI helper. Each answer is a short list of lines
   plus a link to the screen with the details. A typed question is routed to the closest topic by its words. */

import { CATEGORIES, CAT_ORDER } from "@/constants";
import { goalCalc, type Model } from "@/lib/model";
import { hasAbroad, holdingRows, lastImport, monthlySplit } from "@/lib/core/abroad";
import { indHoldings, inTaxSummary } from "@/lib/core/india";
import { rebalancePlan } from "@/lib/core/rebalance";
import { dateGaps, FIXES, gapsByFix } from "@/lib/coverage";
import { daysBetween, fmtDate, iso, TODAY } from "@/lib/dates";
import { inr } from "@/lib/format";
import type { Portfolio } from "@/types/portfolio";

export type Topic = "goal" | "buy" | "sell" | "tax" | "upload";
export interface LocalAnswer {
  topic: Topic;
  title: string;
  lines: string[];
  link: { href: string; label: string };
}

export const TOPICS: { id: Topic; q: string }[] = [
  { id: "goal", q: "Will I reach my goal, and what should I change?" },
  { id: "buy", q: "What exactly should I buy this month, and why?" },
  { id: "sell", q: "Should I sell any holding now?" },
  { id: "tax", q: "When is my next tax-saving sell date, and what will I save?" },
  { id: "upload", q: "What should I upload next?" },
];

const WORDS: Record<Topic, RegExp> = {
  goal: /goal|reach|target|crore|retire|enough|on track|future|years?/i,
  buy: /buy|invest|sip|month|add|put|where.*money|allocat/i,
  sell: /sell|exit|book|profit|loss|get rid|switch|redeem/i,
  tax: /tax|long[- ]?term|ltcg|stcg|1\.25|harvest|save/i,
  upload: /upload|report|statement|missing|date|data|cas|order history/i,
};
/** the topic a typed question is closest to, or null when no topic's words appear */
export function topicOf(q: string): Topic | null {
  let best: Topic | null = null,
    n = 0;
  for (const t of ["tax", "upload", "goal", "sell", "buy"] as Topic[]) {
    // on a tie the more specific topic wins
    const k = (q.match(new RegExp(WORDS[t].source, "gi")) || []).length;
    if (k > n) {
      n = k;
      best = t;
    }
  }
  return best;
}

const L = (v: number) => inr(Math.round(v));

export function answer(topic: Topic, S: Portfolio | null, M: Model, today = TODAY()): LocalAnswer {
  const I = S?.india,
    H = I ? indHoldings(I, today) : [];
  if (topic === "goal") {
    const g = S?.settings.goal;
    if (!g)
      return {
        topic,
        title: "No goal set yet",
        lines: [
          `You have ${L(M.total)} today, adding about ${L(M.sip)} a month.`,
          "Set a target amount and year on Goals and this answer shows whether you'll get there and what to change.",
        ],
        link: { href: "/future#goal", label: "Set a goal" },
      };
    const r = goalCalc(M, g, today),
      [lo, mid, hi] = r.v,
      gap = Math.max(0, r.need - r.sip);
    return {
      topic,
      title: mid >= g.amt ? `Likely yes: about ${L(mid)} by ${g.year}` : `Not yet: about ${L(mid)} by ${g.year}, short of ${L(g.amt)}`,
      lines: [
        `Goal ${L(g.amt)} in ${g.year} (${r.yrs.toFixed(1)} years). Today ${L(M.total)}, adding ${L(r.sip)} a month.`,
        `By then: cautious ${L(lo)}, likely ${L(mid)}, strong ${L(hi)}.`,
        gap > 0
          ? `To reach it on the likely case, invest about ${L(r.need)} a month: ${L(gap)} more than now. Or push the year out.`
          : `You can reach it with ${L(r.need)} a month; you already put in ${L(r.sip)}, so keep it going and don't stop SIPs in a fall.`,
        "As the year gets within 3–5 years, move that goal's money step by step into debt funds or bonds.",
      ],
      link: { href: "/future#goal", label: "Open Goals" },
    };
  }
  if (topic === "buy") {
    const lines = CAT_ORDER.filter((id) => M.cats[id].sip > 0).map(
      (id) => `${CATEGORIES[id].name}: ${L(M.cats[id].sip)} a month (${M.cats[id].sipSrc}).`,
    );
    if (S && hasAbroad(S)) {
      const sp = monthlySplit(S),
        b = sp.rows.filter((x) => x.w > 0 && !x.paused);
      if (b.length)
        lines.push(
          `US stocks: split your ${L(S.settings.monthlyInr)} as ${b.map((x) => `${x.buy} ${Math.round(x.w * 100)}%`).join(", ")}.`,
        );
    }
    return {
      topic,
      title: `About ${L(M.sip)} goes in every month`,
      lines: [
        ...(lines.length ? lines : ["No regular monthly buying found yet."]),
        "Insights → This month's plan turns this into a fund-by-fund and stock-by-stock list, using what each fund holds and how each stock is doing.",
      ],
      link: { href: "/health#plan", label: "This month's plan" },
    };
  }
  if (topic === "sell") {
    const lines: string[] = [];
    if (S && hasAbroad(S))
      for (const r of holdingRows(S, today)
        .filter((x) => x.action.tone === "act")
        .slice(0, 4))
        lines.push(`${r.sym}: ${r.action.label}. ${r.action.why}`);
    if (S && hasAbroad(S)) {
      const R = rebalancePlan(S, { today });
      const o = R.orders.slice(0, 3);
      if (o.length)
        lines.unshift(
          `US / global rebalance: sell ${o.map((x) => `${x.qty.toFixed(4)} ${x.sym.replace("LSE~", "")} at a limit of $${x.limit.toFixed(2)} or more`).join("; ")}. Tax about ${L(R.tax)}${R.months != null ? `; or skip selling and let new money fix it in about ${R.months} months` : ""}.`,
        );
    }
    const losers = CAT_ORDER.flatMap((id) => M.cats[id].items)
      .filter((x) => x.cost && x.value < x.cost * 0.8)
      .sort((a, b) => a.value / (a.cost || 1) - b.value / (b.cost || 1))
      .slice(0, 4);
    if (losers.length)
      lines.push(
        `Down more than 20%: ${losers.map((x) => `${x.name} (${Math.round((100 * (x.value - (x.cost || 0))) / (x.cost || 1))}%)`).join(", ")}. Sell only if the reason you bought is gone; a loss you book can be set off against gains this year.`,
      );
    lines.push("Selling to hold fewer, better funds can wait until each purchase is a year old, to pay 12.5% instead of 20%.");
    return {
      topic,
      title: lines.length > 1 ? "A few to look at, nothing urgent" : "Nothing needs selling now",
      lines,
      link:
        S && hasAbroad(S)
          ? { href: "/plan#rebalance", label: "Open the rebalance planner" }
          : { href: "/health#todo", label: "Your to-do list" },
    };
  }
  if (topic === "tax") {
    if (!I)
      return {
        topic,
        title: "No Indian holdings yet",
        lines: ["Upload your CDSL/NSDL statement first."],
        link: { href: "/upload", label: "Upload" },
      };
    const t = inTaxSummary(H, I, today),
      fy = (() => {
        const d = new Date(today + "T00:00:00Z");
        return iso(d.getUTCMonth() >= 3 ? d.getUTCFullYear() + 1 : d.getUTCFullYear(), 2, 31);
      })(),
      free = Math.max(0, 125000 - Math.max(0, t.real.lt));
    const next = t.upcoming[0];
    return {
      topic,
      title: next ? `Next: ${next.name} turns long-term on ${fmtDate(next.from)}` : "No purchases turning long-term soon",
      lines: [
        ...t.upcoming
          .slice(0, 4)
          .map(
            (u) =>
              `${fmtDate(u.from)}: ${u.name}${u.g != null ? `, gain ${L(u.g)}; waiting saves about ${L(Math.max(0, u.g) * 0.075)} (20% → 12.5%)` : ""}.`,
          ),
        `Long-term gains you could book today: ${L(Math.max(0, t.ltG))}. Up to ${L(free)} more is tax-free this year if booked by ${fmtDate(fy)}.`,
        dateGaps(M).length
          ? `${dateGaps(M).length} holdings have no purchase date, so their dates aren't counted here (see "What should I upload next?").`
          : "",
      ].filter(Boolean),
      link: { href: "/tax", label: "Open Tax" },
    };
  }
  // upload
  const lines: string[] = [];
  const d0 = new Date(today + "T00:00:00Z"),
    lastMonthEnd = iso(d0.getUTCFullYear(), d0.getUTCMonth(), 0),
    cas = S ? lastImport(S, "cas") : null;
  if (!cas || String(cas.period) < lastMonthEnd)
    lines.push(`CDSL/NSDL statement for ${fmtDate(lastMonthEnd)}: ${cas ? `yours is as of ${fmtDate(String(cas.period))}` : "none yet"}.`);
  const old = (S?.imports || []).filter(
    (x) => /^(gr-stocks|gr-mf|zd-hold)$/.test(x.kind) && x.period && daysBetween(String(x.period), today) > 14,
  );
  for (const x of old)
    lines.push(`A fresh ${x.kind === "zd-hold" ? "Zerodha" : "Groww"} holdings report (last one ${fmtDate(String(x.period))}).`);
  for (const g of gapsByFix(dateGaps(M)).slice(0, 3))
    lines.push(`${FIXES[g.fix].title}: adds purchase dates for ${g.items.length} holdings (${L(g.value)}). ${FIXES[g.fix].steps}`);
  return {
    topic,
    title: lines.length ? `${lines.length} upload${lines.length > 1 ? "s" : ""} would help` : "You're up to date",
    lines: lines.length ? lines : ["Every report is recent and every holding has a purchase date."],
    link: { href: "/upload#dates", label: "Open Upload" },
  };
}
