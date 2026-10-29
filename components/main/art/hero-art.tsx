"use client";

/* The 3D illustration in each page's top panel: a WebGL scene of its own for every screen (see scenes.tsx), built from
   your own numbers for that page. It loads after the page, holds still while you scroll (so scrolling stays smooth),
   stops when scrolled away or when "reduce motion" is on, and without WebGL a flat version of the same panel is shown. */

import dynamic from "next/dynamic";
import { Component, useMemo, useRef, type ReactNode } from "react";
import { usePortfolio } from "@/components/providers/portfolio-provider";
import { useUi } from "@/components/providers/ui-provider";
import { ASK_PRESETS, BUCKET_COLOR, CATEGORIES, CAT_ORDER, CHECKLIST, GOAL_COLOR, GOAL_LITE, type CatId } from "@/constants";
import { goalCalc, projectAll, type Model } from "@/lib/model";
import { fmtDate, monthShort, TODAY } from "@/lib/dates";
import { bucketView, hasAbroad, holdingRows, lotRows } from "@/lib/core/abroad";
import { bondSummary, indHoldings, inTaxSummary } from "@/lib/core/india";
import { pct1 } from "@/lib/format";
import { useInView, useMedia, useScrolling, useWebGL } from "@/lib/hooks";
import { useMoney } from "@/lib/use-money";
import { cn } from "@/lib/utils";
import type { Portfolio } from "@/types/portfolio";
import type { CardSpec, DashData } from "./textures";
import type { ArtData, Label } from "./scenes";

const Art = dynamic(() => import("./scenes"), { ssr: false, loading: () => null });

class GlBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export type ArtKind = "home" | CatId | "goals" | "plan" | "tax" | "checklist" | "ask" | "upload";

const LIME: [string, string] = ["#c4f25a", "#5fe37a"];
const ACCENT: Partial<Record<ArtKind, [string, string]>> = {
  funds: [CATEGORIES.funds.hex2, CATEGORIES.funds.hex],
  stocks: [CATEGORIES.stocks.hex2, CATEGORIES.stocks.hex],
  bonds: [CATEGORIES.bonds.hex2, CATEGORIES.bonds.hex],
  abroad: [CATEGORIES.abroad.hex2, CATEGORIES.abroad.hex],
  goals: [GOAL_LITE, GOAL_COLOR],
  plan: ["#bfdbfe", "#60a5fa"],
  tax: ["#fed7aa", "#fb923c"],
  checklist: ["#99f6e4", "#2dd4bf"],
  ask: ["#f5d0fe", "#e879f9"],
  upload: ["#d9f99d", "#84cc16"],
};
const SUB: Record<ArtKind, string> = {
  home: "All investments",
  funds: "Mutual funds",
  stocks: "Stocks",
  bonds: "Bonds",
  abroad: "Abroad",
  goals: "Goal check",
  plan: "Monthly plan",
  tax: "Sell & tax",
  checklist: "Checklist",
  ask: "Ask",
  upload: "Upload",
};
const isCat = (k: ArtKind): k is CatId => k in CATEGORIES;

/** purchase days this month, for the calendar card */
function buyDays(S: Portfolio | null, ym: string): number[] {
  const out = new Set<number>([+TODAY().slice(8, 10)]);
  for (const h of S?.holdings || []) for (const l of h.lots) if (l.d.startsWith(ym)) out.add(+l.d.slice(8, 10));
  return [...out];
}

function buildDash(
  kind: ArtKind,
  M: Model,
  S: Portfolio | null,
  real: boolean,
  s: (v: number) => string,
  m: (v: number) => string,
): DashData {
  const accent = ACCENT[kind] || LIME,
    ym = TODAY().slice(0, 7),
    labels = M.months.map((x) => monthShort(x).slice(0, 3));
  const demo = [45, 27, 17, 11];
  const split = CAT_ORDER.map((id, i) => ({ name: CATEGORIES[id].name, color: CATEGORIES[id].hex, v: real ? M.cats[id].value : demo[i] }));
  const demoBars = [3, 3.4, 3.2, 3.9, 4.2, 4.1, 4.8, 5.2, 5.1, 5.8, 6.3, 6.9];
  const goal = S?.settings.goal,
    gr = real && goal ? goalCalc(M, goal) : null;
  const cal: CardSpec = { kind: "calendar", ym, marks: buyDays(S, ym) };

  if (isCat(kind) && real) {
    const c = M.cats[kind],
      top = c.items[0];
    return {
      accent,
      screen: {
        kicker: `${CATEGORIES[kind].name} · ${c.items.length} holdings`,
        value: s(c.value),
        bars: c.covered ? c.val : demoBars,
        labels,
        split: c.items.slice(0, 4).map((it, i) => ({ name: it.name, color: [accent[1], accent[0], "#5fe37a", "#94a3b8"][i], v: it.value })),
      },
      phone: {
        kicker: "Gain so far",
        value: c.gain != null ? `${c.gain >= 0 ? "+" : "−"}${s(Math.abs(c.gain))}` : "—",
        ring: c.gainPct != null ? Math.min(1, Math.abs(c.gainPct) * 4) : 0.1,
        ringText: c.gainPct != null ? pct1(c.gainPct) : "—",
        foot: c.sip ? `${m(c.sip)}/month` : "See holdings",
      },
      cards: [
        { kind: "stat", title: top ? top.name : "Largest", value: top ? s(top.value) : "—", up: top?.cost ? top.value >= top.cost : null },
        { kind: "bars", title: "Value, 12 months", bars: c.covered ? c.val : demoBars, color: accent[1] },
        cal,
      ],
    };
  }
  const gain = CAT_ORDER.reduce((x, id) => x + (M.cats[id].gain || 0), 0);
  return {
    accent,
    screen: {
      kicker: real ? `${SUB[kind]} · worth today` : "Your dashboard",
      value: real ? s(M.total) : "Your total",
      bars: real ? M.val : demoBars,
      labels,
      split,
    },
    phone: {
      kicker: gr && goal ? `Goal ${s(goal.amt)}` : "Goal check",
      value: gr && goal ? `by ${goal.year}` : "Pick a goal",
      ring: gr && goal ? Math.min(1, gr.v[1] / goal.amt) : real ? 0.35 : 0.75,
      ringText: gr && goal ? `${Math.min(999, Math.round((100 * gr.v[1]) / goal.amt))}%` : real ? "—" : "75%",
      foot: real && M.sip ? `${m(M.sip)}/month` : "Get started",
    },
    cards: [
      {
        kind: "ring",
        title: "Gain on money put in",
        pct: real ? Math.min(1, Math.max(0.02, (gain / Math.max(1, M.total)) * 5)) : 0.62,
        text: real ? `${gain >= 0 ? "+" : "−"}${s(Math.abs(gain))} so far` : "Growth of your money",
      },
      {
        kind: "bars",
        title: "Going in each month",
        bars: real ? CAT_ORDER.map((id) => M.cats[id].sip || 0.01) : [5, 3, 8, 10],
        color: accent[1],
      },
      cal,
    ],
  };
}

const sgnS = (v: number, s: (v: number) => string) => `${v >= 0 ? "+" : "−"}${s(Math.abs(v))}`;
const DEMO12 = [3, 3.4, 3.2, 3.9, 4.2, 4.1, 4.8, 5.2, 5.1, 5.8, 6.3, 6.9];

/** each screen's own scene, from that screen's numbers (a quiet demo before anything is uploaded) */
function build(kind: ArtKind, M: Model, S: Portfolio | null, real: boolean, s: (v: number) => string, m: (v: number) => string): ArtData {
  const accent = ACCENT[kind] || LIME,
    today = TODAY(),
    ym = today.slice(0, 7);
  if (kind === "home") return { scene: "dash", accent, dash: buildDash(kind, M, S, real, s, m) };
  if (isCat(kind)) {
    const c = M.cats[kind],
      has = real && c.items.length > 0;
    const head: Label = {
      kicker: CATEGORIES[kind].name,
      value: has ? s(c.value) : "No data yet",
      sub: has && c.gain != null ? `${sgnS(c.gain, s)} · ${pct1(c.gainPct)}` : "Upload a statement",
      color: has && c.gain != null && c.gain < 0 ? "#fca5a5" : "#86efac",
    };
    if (kind === "funds")
      return {
        scene: "bars",
        accent,
        values: has && c.covered ? c.val : DEMO12,
        label: head,
        coin: { kicker: "Going in each month", value: has && c.sip ? m(c.sip) : "—" },
      };
    if (kind === "stocks")
      return {
        scene: "line",
        accent,
        values: has && c.covered ? c.val : DEMO12,
        tiles: has
          ? [
              head,
              ...c.items.slice(0, 2).map((it) => {
                const g = it.cost ? (it.value - it.cost) / it.cost : null;
                return {
                  kicker: it.name,
                  value: s(it.value),
                  sub: g != null ? pct1(g) : undefined,
                  color: g != null && g < 0 ? "#fca5a5" : "#86efac",
                };
              }),
            ]
          : [head],
      };
    if (kind === "bonds") {
      const I = S?.india,
        b = has && I ? bondSummary(indHoldings(I), I) : null;
      const months = b?.months.slice(0, 6) || [];
      const next = months[0]?.ym || ym;
      return {
        scene: "coins",
        accent,
        stacks: months.length ? months.map((x) => x.int + x.prin) : has ? c.items.slice(0, 6).map((x) => x.value) : [3, 5, 4, 7, 6, 8],
        label: b ? { kicker: "Payouts, next 12 months", value: s(b.yInt + b.yPrin), sub: `${b.n} bonds · ${s(b.yInt)} interest` } : head,
        cal: { ym: next, marks: next === ym ? [+today.slice(8, 10)] : [] },
      };
    }
    // abroad: a pin per market
    const rows = has && S ? holdingRows(S) : [];
    const by = { US: 0, Japan: 0, London: 0 };
    for (const r of rows) by[r.bucket === "Japan" ? "Japan" : r.sym.startsWith("LSE~") ? "London" : "US"] += r.value;
    const tot = by.US + by.Japan + by.London || 1;
    const pins = (
      [
        ["US", 39, -98, "#60a5fa"],
        ["Japan", 36, 138, "#f472b6"],
        ["London", 51.5, -0.1, "#c4f25a"],
      ] as const
    ).map(([k, lat, lon, color]) => ({ lat, lon, color, share: rows.length ? by[k] / tot : 1 / 3 }));
    return {
      scene: "globe",
      accent,
      pins,
      label: {
        ...head,
        sub: rows.length
          ? `US ${Math.round((100 * by.US) / tot)}% · Japan ${Math.round((100 * by.Japan) / tot)}% · London ${Math.round((100 * by.London) / tot)}%`
          : head.sub,
        color: "#f3f6f1",
      },
    };
  }
  if (kind === "goals") {
    const goal = S?.settings.goal,
      r = real && goal ? goalCalc(M, goal) : null;
    return {
      scene: "stairs",
      accent,
      progress: r && goal ? Math.min(1, r.v[1] / goal.amt) : 0.45,
      label:
        r && goal
          ? {
              kicker: `${s(goal.amt)} by ${goal.year}`,
              value: `${Math.min(999, Math.round((100 * r.v[1]) / goal.amt))}% of goal`,
              sub: r.v[1] >= goal.amt ? "On track" : `About ${s(r.v[1])}`,
              color: r.v[1] >= goal.amt ? "#86efac" : "#fcd34d",
            }
          : { kicker: "Goal check", value: "Pick a goal", sub: "Tap an amount and a year" },
    };
  }
  if (kind === "plan") {
    const rows = S && hasAbroad(S) ? bucketView(S) : [];
    return {
      scene: "donut",
      accent,
      parts: rows.length
        ? rows.map((r) => ({ color: BUCKET_COLOR[r.bucket] || "#a78bfa", share: r.w, fill: r.w ? r.pct / r.w : 0 }))
        : [0.4, 0.25, 0.15, 0.1, 0.1].map((w, i) => ({ color: Object.values(BUCKET_COLOR)[i], share: w, fill: 0.8 })),
      label: {
        kicker: "Each month abroad",
        value: S?.settings.monthlyInr ? m(S.settings.monthlyInr) : "—",
        sub: rows.length ? `${rows.length} parts to the plan` : "Upload INDmoney reports",
        color: "#f3f6f1",
      },
    };
  }
  if (kind === "tax") {
    const cands: { d: string; name: string }[] = [];
    if (S && hasAbroad(S)) for (const l of lotRows(S)) if (!l.isLT) cands.push({ d: l.ltd, name: l.sym.replace("LSE~", "") });
    const I = S?.india;
    if (I) for (const u of inTaxSummary(indHoldings(I), I).upcoming) cands.push({ d: u.from, name: u.name });
    cands.sort((x, y) => x.d.localeCompare(y.d));
    const nx = cands.find((x) => x.d >= today);
    return {
      scene: "tax",
      accent,
      cal: { ym: nx ? nx.d.slice(0, 7) : ym, marks: nx ? [+nx.d.slice(8, 10)] : [] },
      label: nx
        ? { kicker: "Next long-term date", value: fmtDate(nx.d), sub: nx.name, color: "#fed7aa" }
        : { kicker: "Long-term dates", value: "None due", sub: "Upload order histories" },
    };
  }
  if (kind === "checklist") {
    const year = +today.slice(0, 4),
      mine = S?.checklist[year] || {};
    const rows = CHECKLIST.map((c) => ({ text: c.text.replace(/^Before 31 \w+: |^By 31 \w+: /, ""), done: !!mine[c.id] }));
    const n = rows.filter((r) => r.done).length;
    const month = +today.slice(5, 7) - 1,
      due = CHECKLIST.find((c) => c.m >= month && !mine[c.id]);
    return {
      scene: "list",
      accent,
      rows,
      label: {
        kicker: `${year} jobs done`,
        value: `${n} of ${rows.length}`,
        sub: due ? `Next: ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][due.m]}` : "All caught up",
        color: "#99f6e4",
      },
    };
  }
  if (kind === "ask")
    return {
      scene: "chat",
      accent,
      q: ASK_PRESETS[0],
      a: real
        ? `You have ${s(M.total)} with ${m(M.sip)} going in each month. At likely rates that could be about ${s(projectAll(M, 1, 10))} in 10 years.`
        : "Upload a statement and I'll answer from your own holdings, monthly investing and goal.",
    };
  // upload: your latest files, or the ones to start with
  const COL: Record<string, string> = { PDF: "#c4f25a", XLSX: "#5fe37a", XLS: "#5fe37a", CSV: "#22d3ee", PNG: "#f472b6", JPG: "#f472b6" };
  const recent = (S?.imports || [])
    .filter((x) => x.file)
    .slice(-3)
    .reverse()
    .map((x) => {
      const ext = (String(x.file).split(".").pop() || "PDF").toUpperCase().slice(0, 4);
      return { ext, name: String(x.file).replace(/\.[^.]+$/, ""), color: COL[ext] || "#a78bfa" };
    });
  return {
    scene: "folder",
    accent,
    docs: recent.length
      ? recent
      : [
          { ext: "PDF", name: "CDSL CAS", color: "#c4f25a" },
          { ext: "XLSX", name: "Groww orders", color: "#5fe37a" },
          { ext: "XLSX", name: "INDmoney", color: "#22d3ee" },
        ],
  };
}

/** the flat stand-in (no WebGL): the glow disc and a card with the page's headline figure */
function Flat({ d, kind }: { d: ArtData; kind: ArtKind }) {
  const l: Label =
    d.scene === "dash"
      ? { kicker: d.dash.screen.kicker, value: d.dash.screen.value }
      : "label" in d
        ? d.label
        : d.scene === "line"
          ? d.tiles[0]
          : { kicker: SUB[kind], value: d.scene === "chat" ? "Ask anything" : "Your files" };
  return (
    <div aria-hidden className="absolute inset-0 grid place-items-center">
      <span
        className="absolute top-[6%] left-[22%] aspect-square w-[62%] rounded-full"
        style={{ background: `linear-gradient(140deg, ${d.accent[0]}, ${d.accent[1]})` }}
      />
      <div className="relative grid w-[66%] gap-1.5 rounded-2xl bg-[#151917] p-5 shadow-[0_30px_60px_-20px_rgb(0_0_0/0.8),inset_0_0_0_6px_#0f1311]">
        <span className="text-[12.5px] text-muted">{l.kicker}</span>
        <b className="num font-display text-[24px] leading-tight font-bold text-ink">{l.value}</b>
        {l.sub && (
          <span className="text-[13px] font-semibold" style={{ color: l.color || d.accent[0] }}>
            {l.sub}
          </span>
        )}
      </div>
    </div>
  );
}

/** the hero illustration */
export function HeroArt({ kind, className }: { kind: ArtKind; className?: string }) {
  const { model, S, locked } = usePortfolio();
  const { month } = useUi();
  const { s, m } = useMoney();
  const box = useRef<HTMLDivElement>(null);
  const seen = useInView(box),
    reduced = useMedia("(prefers-reduced-motion: reduce)"),
    gl = useWebGL(),
    scrolling = useScrolling();
  const real = !!S && !locked && model.total > 0;
  const data = useMemo(() => {
    const d = build(kind, model, S, real, s, m);
    // the month replay on Home: the screen shows that month's worth
    if (d.scene === "dash" && real && month >= 0 && month < model.months.length) {
      d.dash.screen.kicker = `Worth at the end of ${monthShort(model.months[month])}`;
      d.dash.screen.value = s(model.val[month]);
      d.dash.screen.bars = model.val.map((v, i) => (i <= month ? v : 0));
    }
    return d;
  }, [kind, model, S, real, s, m, month]);

  return (
    <div ref={box} className={cn("relative aspect-[5/4] w-full", className)}>
      {gl ? (
        <GlBoundary fallback={<Flat d={data} kind={kind} />}>
          <div className="absolute inset-0">
            <Art data={data} animate={seen && !reduced && !scrolling} />
          </div>
        </GlBoundary>
      ) : (
        <Flat d={data} kind={kind} />
      )}
    </div>
  );
}

/** a small category marker for cards: a glossy dot in the category colour */
export function CatOrb({ id, size = 40, className }: { id: CatId; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block shrink-0 rounded-full", className)}
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 32% 28%, ${CATEGORIES[id].hex2}, ${CATEGORIES[id].hex} 55%, ${CATEGORIES[id].hex}66 100%)`,
        boxShadow: `0 10px 24px -10px ${CATEGORIES[id].hex}`,
      }}
    />
  );
}
