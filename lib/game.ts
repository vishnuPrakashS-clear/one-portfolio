/* The game layer: level and rank from investing months, a streak, monthly missions and badges, all computed from uploads. */
import type { ISODate, Portfolio } from "@/types/portfolio";
import { daysBetween, iso, monthLong, nextYm, TODAY } from "@/lib/dates";
import { hasAbroad, holdingRows, lastImport, lotRows, monthlySplit } from "@/lib/core/abroad";
import { indHoldings } from "@/lib/core/india";
import { inr, tk } from "@/lib/format";
import { goalCalc, type Model } from "@/lib/model";
import { RANKS } from "@/constants";

/** every month with a dated purchase, in India or abroad */
export function buyMonths(S: Portfolio | null): string[] {
  const s = new Set<string>();
  if (!S) return [];
  for (const h of S.holdings) for (const l of h.lots) s.add(l.d.slice(0, 7));
  if (S.india) for (const h of indHoldings(S.india)) for (const l of h.lots || []) if (l.d) s.add(l.d.slice(0, 7));
  return [...s].sort();
}
export function streak(S: Portfolio | null, today: ISODate = TODAY()): number {
  const set = new Set(buyMonths(S)),
    d = new Date(today + "T00:00:00Z");
  let n = 0;
  const key = () => d.toISOString().slice(0, 7);
  if (!set.has(key())) d.setUTCMonth(d.getUTCMonth() - 1);
  while (set.has(key())) {
    n++;
    d.setUTCMonth(d.getUTCMonth() - 1);
  }
  return n;
}
export interface Mission {
  id: string;
  xp: number;
  done: boolean;
  title: string;
}
export function missions(S: Portfolio | null, M: Model, today: ISODate = TODAY()): Mission[] {
  if (!S || !M.total) return [];
  const ym = today.slice(0, 7),
    bought = buyMonths(S).includes(ym);
  const d0 = new Date(today + "T00:00:00Z"),
    lastMonthEnd = iso(d0.getUTCFullYear(), d0.getUTCMonth(), 0);
  const cas = lastImport(S, "cas"),
    out: Mission[] = [
      { id: "buy", xp: 100, done: bought, title: M.sip ? `Invest your usual ${inr(M.sip)} this month` : "Make a purchase this month" },
      { id: "cas", xp: 50, done: !!cas && String(cas.period) >= lastMonthEnd, title: "Upload this month's CDSL / NSDL statement" },
      {
        id: "goal",
        xp: 50,
        done: !!S.settings.goal,
        title: S.settings.goal ? `Goal set: ${inr(S.settings.goal.amt)} by ${S.settings.goal.year}` : "Pick a goal on the Goals screen",
      },
    ];
  if (hasAbroad(S)) {
    const losers = holdingRows(S, today).filter((r) => r.plan === "legacy" && r.gain < 0),
      tx = lastImport(S, "transactions");
    out.push({
      id: "harvest",
      xp: 50,
      done: !losers.length,
      title: losers.length
        ? `Sell ${losers.map((r) => tk(r.sym)).join(", ")} to bank the loss tax-free`
        : "No loss-making legacy holdings left",
    });
    out.push({
      id: "tx",
      xp: 50,
      done: !!tx && daysBetween(String(tx.period), today) < 95,
      title: "Upload a fresh INDmoney Transactions Report",
    });
  } else if (S.india) {
    const known = M.total ? (M.cats.funds.known + M.cats.stocks.known + M.cats.bonds.known) / (M.total - M.cats.abroad.value || 1) : 0;
    out.push({
      id: "prices",
      xp: 50,
      done: known >= 0.9,
      title: `Fill in buy prices for your Indian holdings (${Math.round(known * 100)}% known)`,
    });
  }
  out.push({ id: "hold", xp: 25, done: true, title: "Don't sell winners before their long-term date" });
  return out;
}
export interface Badge {
  k: BadgeIcon;
  name: string;
  got: boolean;
  how: string;
}
export type BadgeIcon = "star" | "globe" | "pick" | "shield" | "hourglass" | "flame" | "target" | "scroll";
export function achievements(S: Portfolio | null, M: Model, today: ISODate = TODAY()): Badge[] {
  const rows = hasAbroad(S) && S ? holdingRows(S, today) : [],
    has = (s: string) => rows.some((r) => r.sym === s);
  const lots = hasAbroad(S) && S ? lotRows(S, today) : [],
    firstLT = lots.map((l) => l.ltd).sort()[0];
  const india = S?.india ? indHoldings(S.india) : [];
  const firstIn = india.flatMap((h) => (h.lots || []).map((l) => l.d).filter((d): d is string => !!d)).sort()[0];
  const lossSold = (S?.sales || []).some((x) => (x.lots || []).some((l) => (x.price ?? l.p) < l.p));
  const st = streak(S, today),
    goal = S?.settings.goal,
    onTrack = !!goal && goalCalc(M, goal, today).level >= 2;
  const inLT = firstIn && new Date(firstIn) < new Date(Date.parse(today) - 365 * 864e5);
  return [
    { k: "star", name: "First trade", got: M.total > 0, how: "Upload a statement with your first holding" },
    {
      k: "globe",
      name: "Globe trotter",
      got: M.cats.abroad.value > 0 && M.total - M.cats.abroad.value > 0,
      how: "Hold investments in India and abroad",
    },
    {
      k: "pick",
      name: "All four kinds",
      got: (["funds", "stocks", "bonds", "abroad"] as const).every((c) => M.cats[c].value > 0),
      how: "Own mutual funds, stocks, bonds and something abroad",
    },
    { k: "shield", name: "Tax-smart", got: lossSold || has("LSE~CSPX"), how: "Bank a loss tax-free, or buy a tax-efficient UCITS fund" },
    {
      k: "hourglass",
      name: "Patience pays",
      got: (!!firstLT && firstLT <= today) || !!inLT,
      how: firstIn ? `Unlocks once a purchase is a year old` : "Hold a purchase until it turns long-term",
    },
    { k: "flame", name: "3-month streak", got: st >= 3, how: `${st}/3 months in a row` },
    { k: "target", name: "Bullseye", got: onTrack, how: "Be on track for your goal at the likely rate" },
    {
      k: "scroll",
      name: "Paperwork pro",
      got:
        !!lastImport(S, "cas") && (!!lastImport(S, "gr-mf-orders") || !!lastImport(S, "gr-st-orders") || !!lastImport(S, "transactions")),
      how: "Upload your CAS and an order history",
    },
  ];
}
export interface Player {
  months: number;
  lvl: number;
  rank: string;
  nextR: [number, string] | undefined;
  streak: number;
  mis: Mission[];
  done: number;
  ach: Badge[];
}
export function player(S: Portfolio | null, M: Model, today: ISODate = TODAY()): Player {
  const months = buyMonths(S).length,
    lvl = Math.max(1, months),
    rank = RANKS.filter(([m]) => months >= m).slice(-1)[0][1];
  const mis = missions(S, M, today);
  return {
    months,
    lvl,
    rank,
    nextR: RANKS.find(([m]) => m > months),
    streak: streak(S, today),
    mis,
    done: mis.filter((m) => m.done).length,
    ach: achievements(S, M, today),
  };
}

/* ---------- this month's plan-fund buys abroad (once they reach 80% of the monthly amount, the month counts as done) ---------- */
export function monthStatus(S: Portfolio, today: ISODate = TODAY()) {
  const ym = today.slice(0, 7),
    s = S.settings,
    budget = (s.monthlyInr / s.fx) * (1 - (s.feePct || 0) / 100),
    by: Record<string, number> = {};
  for (const h of S.holdings)
    if (h.plan === "core") for (const l of h.lots) if (l.d.startsWith(ym)) by[h.sym] = (by[h.sym] || 0) + l.q * l.p;
  const buys = Object.entries(by)
      .map(([sym, v]) => ({ sym, v }))
      .sort((a, b) => b.v - a.v),
    spent = buys.reduce((a, b) => a + b.v, 0);
  const done = spent >= 0.8 * budget,
    target = done ? nextYm(ym) : ym;
  return { ym, buys, spent, done, target, label: monthLong(target), short: done ? "next month" : "this month", split: monthlySplit(S) };
}
