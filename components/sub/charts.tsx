"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { monthLong, monthShort } from "@/lib/dates";
import type { YearMonth } from "@/types/portfolio";

/** draw narrower on phones so axis text stays readable after scaling */
function useChartWidth() {
  const [w, setW] = useState(760);
  useEffect(() => {
    const mq = matchMedia("(max-width: 640px)"),
      f = () => setW(mq.matches ? 400 : 760);
    f();
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);
  return w;
}
export function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v))),
    f = v / p;
  return ([1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((x) => f <= x) || 10) * p;
}
const path = (arr: number[], X: (i: number) => number, Y: (v: number) => number) =>
  arr.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("");

interface Frame {
  W: number;
  H: number;
  pl: number;
  pr: number;
  pt: number;
  pb: number;
  n: number;
  max: number;
}
function frame(W: number, H: number, n: number, max: number): Frame & { X: (i: number) => number; Y: (v: number) => number } {
  const pl = 56,
    pr = 14,
    pt = 16,
    pb = 30;
  return {
    W,
    H,
    pl,
    pr,
    pt,
    pb,
    n,
    max,
    X: (i) => pl + (i * (W - pl - pr)) / Math.max(1, n - 1),
    Y: (v) => pt + (1 - v / max) * (H - pt - pb),
  };
}
function Axes({ f, months, fmt }: { f: ReturnType<typeof frame>; months: YearMonth[]; fmt: (v: number) => string }) {
  const n = months.length;
  return (
    <>
      {[0, 0.25, 0.5, 0.75, 1].map((k) => (
        <g key={k}>
          <line className="grid" x1={f.pl} x2={f.W - f.pr} y1={f.Y(k * f.max)} y2={f.Y(k * f.max)} />
          <text className="axis" x={f.pl - 8} y={f.Y(k * f.max) + 4} textAnchor="end">
            {fmt(k * f.max)}
          </text>
        </g>
      ))}
      {months.map((m, i) =>
        i % 2 === (n - 1) % 2 ? (
          <text key={m} className="axis" x={f.X(i)} y={f.H - 8} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}>
            {monthShort(m)}
          </text>
        ) : null,
      )}
    </>
  );
}
/** invisible columns that pick a month on hover or tap, plus the tooltip */
function HoverLayer({
  f,
  months,
  sel,
  setSel,
}: {
  f: ReturnType<typeof frame>;
  months: YearMonth[];
  sel: number | null;
  setSel: (i: number | null) => void;
}) {
  const step = (f.W - f.pl - f.pr) / Math.max(1, months.length - 1);
  return (
    <>
      {sel != null && <line className="cursor" x1={f.X(sel)} x2={f.X(sel)} y1={f.pt} y2={f.H - f.pb} />}
      {months.map((m, i) => (
        <rect
          key={m}
          className="hit"
          x={f.X(i) - step / 2}
          y={f.pt}
          width={step}
          height={f.H - f.pt - f.pb}
          onPointerEnter={() => setSel(i)}
          onClick={() => setSel(i)}
        />
      ))}
    </>
  );
}
function Tip({
  f,
  sel,
  month,
  children,
}: {
  f: ReturnType<typeof frame>;
  sel: number | null;
  month: YearMonth | undefined;
  children: ReactNode;
}) {
  if (sel == null || !month) return null;
  const left = `clamp(70px, ${(100 * f.X(sel)) / f.W}%, calc(100% - 70px))`;
  return (
    <div
      className="pointer-events-none absolute top-1.5 z-10 grid -translate-x-1/2 gap-1 rounded-xl bg-card px-3 py-2.5 text-[12.5px] whitespace-nowrap shadow-[inset_0_0_0_1px_var(--color-line),0_14px_30px_-12px_rgb(0_0_0/0.7)]"
      style={{ left }}
    >
      <b className="mb-0.5 text-[12px] font-medium text-muted">{monthLong(month)}</b>
      {children}
    </div>
  );
}
export function TipRow({
  color,
  dashed,
  label,
  value,
  strong,
}: {
  color?: string;
  dashed?: boolean;
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <span className={`flex items-center gap-2 text-body tabular-nums ${strong ? "mt-0.5 border-t border-line pt-1" : ""}`}>
      {dashed ? (
        <i className="h-0 w-4 border-t-2 border-dashed border-ink/55" />
      ) : color ? (
        <i className="size-2.5 rounded-[3px]" style={{ background: color }} />
      ) : null}
      {label}
      <b className="ml-auto pl-3 font-semibold text-ink">{value}</b>
    </span>
  );
}

export interface Layer {
  name: string;
  color: string;
  values: number[];
}
/** stacked areas of each category's value, with what went in drawn as a dashed line */
export function StackChart({
  months,
  layers,
  invested,
  fmt,
  label,
}: {
  months: YearMonth[];
  layers: Layer[];
  invested: number[];
  fmt: (v: number) => string;
  label: string;
}) {
  const W = useChartWidth(),
    H = 260,
    uid = useId().replace(/:/g, "");
  const [sel, setSel] = useState<number | null>(null);
  const n = months.length,
    tops: { l: Layer; lo: number[]; hi: number[] }[] = [];
  let base = months.map(() => 0);
  for (const l of layers) {
    const hi = base.map((b, i) => b + l.values[i]);
    tops.push({ l, lo: base, hi });
    base = hi;
  }
  const f = frame(W, H, n, niceMax(Math.max(...base, ...invested) * 1.05));
  return (
    <div className="relative" onPointerLeave={() => setSel(null)}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        <defs>
          {tops.map((t, k) => (
            <linearGradient key={k} id={`${uid}g${k}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={t.l.color} stopOpacity={0.5} />
              <stop offset="1" stopColor={t.l.color} stopOpacity={0.14} />
            </linearGradient>
          ))}
        </defs>
        <Axes f={f} months={months} fmt={fmt} />
        <g className="draw">
          {tops.map((t, k) => (
            <g key={k}>
              <path
                d={`${path(t.hi, f.X, f.Y)}${t.lo.map((_, i) => `L${f.X(n - 1 - i).toFixed(1)},${f.Y(t.lo[n - 1 - i]).toFixed(1)}`).join("")}Z`}
                fill={`url(#${uid}g${k})`}
              />
              <path d={path(t.hi, f.X, f.Y)} fill="none" stroke={t.l.color} strokeWidth={2} />
            </g>
          ))}
          <path d={path(invested, f.X, f.Y)} className="inv" />
        </g>
        <HoverLayer f={f} months={months} sel={sel} setSel={setSel} />
      </svg>
      <Tip f={f} sel={sel} month={sel != null ? months[sel] : undefined}>
        {sel != null && (
          <>
            {layers.map((l) => (
              <TipRow key={l.name} color={l.color} label={l.name} value={fmt(l.values[sel])} />
            ))}
            <TipRow strong label="Total" value={fmt(base[sel])} />
            <TipRow dashed label="Put in" value={fmt(invested[sel])} />
          </>
        )}
      </Tip>
    </div>
  );
}

/** one category: value (soft area) against the money put in (dashed) */
export function LineChart({
  months,
  values,
  invested,
  color,
  fmt,
  label,
}: {
  months: YearMonth[];
  values: number[];
  invested: number[];
  color: string;
  fmt: (v: number) => string;
  label: string;
}) {
  const W = useChartWidth(),
    H = 240,
    uid = useId().replace(/:/g, "");
  const [sel, setSel] = useState<number | null>(null);
  const n = months.length,
    f = frame(W, H, n, niceMax(Math.max(...values, ...invested) * 1.08));
  return (
    <div className="relative" onPointerLeave={() => setSel(null)}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        <defs>
          <linearGradient id={`${uid}a`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity={0.24} />
            <stop offset="1" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Axes f={f} months={months} fmt={fmt} />
        <g className="draw">
          <path d={`${path(values, f.X, f.Y)}L${f.X(n - 1)},${f.Y(0)}L${f.X(0)},${f.Y(0)}Z`} fill={`url(#${uid}a)`} />
          <path d={path(invested, f.X, f.Y)} className="inv" />
          <path d={path(values, f.X, f.Y)} fill="none" stroke={color} strokeWidth={3} strokeLinejoin="round" />
        </g>
        <circle
          cx={f.X(n - 1)}
          cy={f.Y(values[n - 1])}
          r={5}
          fill={color}
          className="motion-safe:animate-pulse-dot"
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        />
        <HoverLayer f={f} months={months} sel={sel} setSel={setSel} />
      </svg>
      <Tip f={f} sel={sel} month={sel != null ? months[sel] : undefined}>
        {sel != null && (
          <>
            <TipRow color={color} label="Value" value={fmt(values[sel])} />
            <TipRow dashed label="Put in" value={fmt(invested[sel])} />
          </>
        )}
      </Tip>
    </div>
  );
}

/** the path to a goal: likely line, cautious-to-strong band, money put in, the goal line and where it is reached */
export function GoalChart({
  startYear,
  yrs,
  series,
  put,
  goal,
  goalYear,
  fmt,
  startMonth,
}: {
  startYear: number;
  startMonth: number;
  yrs: number;
  series: [number[], number[], number[]];
  put: number[];
  goal: number;
  goalYear: number;
  fmt: (v: number) => string;
}) {
  const W = useChartWidth(),
    H = 280,
    pts = series[1].length - 1,
    uid = useId().replace(/:/g, "");
  const pl = 64,
    pr = 18,
    pt = 20,
    pb = 34;
  const max = niceMax(Math.max(goal, series[2][pts]) * 1.08);
  const X = (j: number) => pl + (j / pts) * (W - pl - pr),
    Y = (v: number) => pt + (1 - v / max) * (H - pt - pb);
  const cross = series[1].findIndex((v) => v >= goal),
    years = Math.floor(yrs),
    step = Math.max(1, Math.ceil(yrs / 6));
  return (
    <svg
      className="chart"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Projected value to ${goalYear} against the goal of ${fmt(goal)}`}
    >
      <defs>
        <linearGradient id={`${uid}b`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#10b981" stopOpacity={0.26} />
          <stop offset="1" stopColor="#06b6d4" stopOpacity={0.06} />
        </linearGradient>
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map((k) => (
        <g key={k}>
          <line className="grid" x1={pl} x2={W - pr} y1={Y(k * max)} y2={Y(k * max)} />
          <text className="axis" x={pl - 8} y={Y(k * max) + 4} textAnchor="end">
            {fmt(k * max)}
          </text>
        </g>
      ))}
      <g className="draw">
        <path
          d={`${path(series[2], X, Y)}${series[0].map((_, j) => `L${X(pts - j).toFixed(1)},${Y(series[0][pts - j]).toFixed(1)}`).join("")}Z`}
          fill={`url(#${uid}b)`}
        />
        <path d={path(put, X, Y)} className="inv" />
        <path d={path(series[1], X, Y)} fill="none" stroke="#5fe37a" strokeWidth={3} />
      </g>
      <line x1={pl} x2={W - pr} y1={Y(goal)} y2={Y(goal)} stroke="#f3f6f1" strokeWidth={1.5} strokeDasharray="2 6" strokeLinecap="round" />
      <text x={W - pr} y={Y(goal) - 8} textAnchor="end" className="font-display" fontSize={13} fontWeight={700} fill="#f3f6f1">
        Goal {fmt(goal)}
      </text>
      {cross > 0 && (
        <>
          <circle cx={X(cross)} cy={Y(series[1][cross])} r={7} fill="#5fe37a" stroke="#1b1f1d" strokeWidth={3} />
          <text x={X(cross)} y={Y(series[1][cross]) + 24} textAnchor="middle" fontSize={12} fontWeight={600} fill="#86efac">
            reached {startYear + Math.floor((cross / pts) * yrs + (startMonth - 1) / 12)}
          </text>
        </>
      )}
      {Array.from({ length: years + 1 }, (_, k) => k)
        .filter((k) => k % step === 0 && k / yrs < 0.9)
        .map((k) => (
          <text key={k} className="axis" x={X(Math.round((k / yrs) * pts))} y={H - 10} textAnchor={k ? "middle" : "start"}>
            {startYear + k}
          </text>
        ))}
      <text className="axis" x={X(pts)} y={H - 10} textAnchor="end">
        {goalYear}
      </text>
    </svg>
  );
}

export function Legend({ items }: { items: { name: string; color?: string; dashed?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-body">
      {items.map((i) => (
        <span key={i.name} className="inline-flex items-center gap-2">
          {i.dashed ? (
            <i className="h-0 w-4 border-t-2 border-dashed border-ink/55" />
          ) : (
            <i className="size-2.5 rounded-[3px]" style={{ background: i.color }} />
          )}
          {i.name}
        </span>
      ))}
    </div>
  );
}
