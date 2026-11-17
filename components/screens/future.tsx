"use client";

/* Future value, in the spirit of a wealth tracker's calculator: starts from what you have today and what you add each
   month (both read from your statements), and lets you slide the monthly amount, the years and a yearly step-up to see
   the result at once. Big answer first; then how it builds year by year, ready answers for 5, 10, 15, 20 and 25 years,
   and what-ifs. */
import Link from "next/link";
import { useMemo, useState } from "react";
import { usePortfolio } from "@/components/providers/portfolio-provider";
import { weightedRate } from "@/lib/model";
import { grow, monthlyFor, real, type Growth } from "@/lib/future";
import { useMoney } from "@/lib/use-money";
import { cn, prefs } from "@/lib/utils";
import { Card, CardHead, Empty } from "@/components/sub/ui";
import { Icon } from "@/components/sub/icon";

const CASES = [
  [0, "Cautious"],
  [1, "Likely"],
  [2, "Strong"],
] as const;
const MILESTONES = [5, 10, 15, 20, 25];
const KEY = "op-future";

type Inputs = { monthly: number; years: number; step: number; k: 0 | 1 | 2; real: boolean };

function Slider({
  label,
  value,
  min,
  max,
  step,
  show,
  onChange,
  marks,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  show: string;
  onChange: (v: number) => void;
  marks?: string[];
}) {
  return (
    <label className="grid gap-2">
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-[14px] font-medium text-body">{label}</span>
        <b className="num rounded-lg bg-gain-wash px-2.5 py-1 text-[16px] font-semibold text-lime">{show}</b>
      </span>
      <input
        type="range"
        className="fill-range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        aria-valuetext={show}
        style={{ ["--fill" as string]: `${((value - min) / (max - min)) * 100}%` }}
      />
      {marks && (
        <span className="flex justify-between text-[11.5px] text-muted">
          {marks.map((x) => (
            <span key={x}>{x}</span>
          ))}
        </span>
      )}
    </label>
  );
}

/** today / you add / growth as one ring */
function Ring({ g, s }: { g: Growth; s: (v: number) => string }) {
  const parts = [
    { name: "Today", v: g.put - g.added, c: "#94a3b8" },
    { name: "You add", v: g.added, c: "#0ea5e9" },
    { name: "Growth", v: Math.max(0, g.gain), c: "var(--color-lime-2)" },
  ];
  const t = parts.reduce((a, p) => a + p.v, 0) || 1,
    R = 54,
    C = 2 * Math.PI * R;
  let off = 0;
  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 140 140" className="size-[132px] shrink-0 -rotate-90" aria-hidden>
        <circle cx="70" cy="70" r={R} fill="none" strokeWidth="18" style={{ stroke: "var(--color-tint-2)" }} />
        {parts.map((p) => {
          const len = (C * p.v) / t;
          const el = (
            <circle
              key={p.name}
              cx="70"
              cy="70"
              r={R}
              fill="none"
              strokeWidth="18"
              strokeDasharray={`${len} ${C}`}
              strokeDashoffset={-off}
              style={{ stroke: p.c, transition: "all .4s ease" }}
            />
          );
          off += len;
          return el;
        })}
      </svg>
      <ul className="grid gap-2">
        {parts.map((p) => (
          <li key={p.name} className="grid grid-cols-[10px_auto] items-baseline gap-x-2">
            <i className="size-2.5 rounded-full" style={{ background: p.c }} />
            <span className="text-[13px] text-muted">
              {p.name} · {Math.round((100 * p.v) / t)}%
            </span>
            <span />
            <b className="num text-[15px] font-semibold text-ink">{s(p.v)}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** bars by year: what you put in, and growth on top; hover or tap a bar for its numbers */
function YearBars({ g, s, adj }: { g: Growth; s: (v: number) => string; adj: (v: number, y: number) => number }) {
  const [sel, setSel] = useState<number | null>(null);
  const pts = g.years.slice(1);
  const max = Math.max(...pts.map((p) => adj(p.value, p.y)), 1);
  const show = sel ?? pts.length - 1;
  const p = pts[show];
  const every = pts.length > 20 ? 5 : pts.length > 10 ? 2 : 1;
  return (
    <div className="grid gap-3">
      {p && (
        <p className="num text-[14px] text-body">
          <b className="text-ink">Year {p.y}</b> ({new Date().getFullYear() + p.y}): worth{" "}
          <b className="text-ink">{s(adj(p.value, p.y))}</b>, of which you put in {s(adj(p.put, p.y))} and growth is{" "}
          <b className="text-gain-ink">{s(adj(p.value - p.put, p.y))}</b>
        </p>
      )}
      <div
        className="flex h-[220px] items-end gap-[3px]"
        onPointerLeave={() => setSel(null)}
        role="img"
        aria-label="Value at the end of each year"
      >
        {pts.map((q, i) => {
          const v = adj(q.value, q.y),
            put = adj(q.put, q.y);
          return (
            <button
              key={q.y}
              type="button"
              onPointerEnter={() => setSel(i)}
              onFocus={() => setSel(i)}
              onClick={() => setSel(i)}
              aria-label={`Year ${q.y}: ${s(v)}`}
              className={cn(
                "flex h-full min-w-0 flex-1 cursor-pointer flex-col justify-end rounded-t-md",
                i === show && "ring-2 ring-lime-2 ring-offset-2 ring-offset-card",
              )}
            >
              <i className="block w-full rounded-t-[4px] bg-lime-2" style={{ height: `${(100 * Math.max(0, v - put)) / max}%` }} />
              <i className="block w-full bg-[#0ea5e9]/70" style={{ height: `${(100 * put) / max}%` }} />
            </button>
          );
        })}
      </div>
      <div className="flex gap-[3px] text-center text-[11px] text-muted">
        {pts.map((q) => (
          <span key={q.y} className="min-w-0 flex-1">
            {q.y % every === 0 || q.y === 1 ? q.y : ""}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-4 text-[12.5px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <i className="size-2.5 rounded-sm bg-[#0ea5e9]/70" />
          Money put in (today&apos;s value + what you add)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="size-2.5 rounded-sm bg-lime-2" />
          Growth
        </span>
        <span>Years from now</span>
      </div>
    </div>
  );
}

export function FutureScreen() {
  const { model, S } = usePortfolio();
  const { s, m } = useMoney();
  const today = model.total;
  const seen = Math.round((model.sip || 0) / 500) * 500;
  const saved = useMemo(() => {
    try {
      return JSON.parse(prefs.get(KEY) || "null") as Partial<Inputs> | null;
    } catch {
      return null;
    }
  }, []);
  const [x, setX] = useState<Inputs>({
    monthly: saved?.monthly ?? (seen || 10000),
    years: saved?.years ?? 10,
    step: saved?.step ?? 0,
    k: saved?.k ?? 1,
    real: saved?.real ?? false,
  });
  const set = (p: Partial<Inputs>) =>
    setX((o) => {
      const n = { ...o, ...p };
      prefs.set(KEY, JSON.stringify(n));
      return n;
    });
  const rates = [0, 1, 2].map((k) => weightedRate(model, k as 0 | 1 | 2)) as [number, number, number];
  const r = rates[x.k];
  const g = grow(today, x.monthly, x.years, r, x.step / 100);
  const lo = grow(today, x.monthly, x.years, rates[0], x.step / 100).value,
    hi = grow(today, x.monthly, x.years, rates[2], x.step / 100).value;
  const adj = (v: number, y: number) => (x.real ? real(v, y) : v);
  const fd = grow(today, x.monthly, x.years, 0.07, x.step / 100).value;
  const crore = monthlyFor(1e7, today, x.years, r, x.step / 100);

  if (!S || !today)
    return (
      <Empty
        title="See where your money is heading"
        action={
          <Link href="/upload" className="btn btn-primary">
            Upload reports
          </Link>
        }
      >
        Upload your statements and this screen projects your money 5, 10 or 25 years ahead from what you have and add each month.
      </Empty>
    );

  const whatIf = [
    { t: `Add ${s(5000)} more a month`, v: grow(today, x.monthly + 5000, x.years, r, x.step / 100).value },
    { t: "Stay invested 5 years longer", v: grow(today, x.monthly, x.years + 5, r, x.step / 100).value, y: x.years + 5 },
    { t: "Raise it 10% every year", v: grow(today, x.monthly, x.years, r, Math.max(0.1, x.step / 100)).value, hide: x.step >= 10 },
    { t: "Stop adding money", v: grow(today, 0, x.years, r).value },
  ].filter((w) => !w.hide);

  return (
    <>
      <section className="grid gap-6 rounded-[var(--radius-card)] px-6 py-6 surface max-sm:rounded-[14px] max-sm:px-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-4">
          <span className="inline-flex items-center gap-2 text-[13.5px] font-medium text-muted">
            <i className="size-2 rounded-full bg-lime-2" />
            Your money in {x.years} year{x.years === 1 ? "" : "s"} ({new Date().getFullYear() + x.years})
          </span>
          <h1 className="num text-[clamp(34px,5vw,54px)] leading-none font-semibold tracking-[-0.02em] text-ink">
            {s(adj(g.value, x.years))}
          </h1>
          <p className="num text-[14px] text-body">
            Between <b className="text-ink">{s(adj(lo, x.years))}</b> and <b className="text-ink">{s(adj(hi, x.years))}</b> depending on
            markets
            {x.real ? ", in today's money (6% a year inflation taken out)" : ""}. A fixed deposit at 7% would give{" "}
            <b className="text-ink">{s(adj(fd, x.years))}</b>.
          </p>
          <Ring
            g={{ ...g, value: adj(g.value, x.years), put: adj(g.put, x.years), added: adj(g.added, x.years), gain: adj(g.gain, x.years) }}
            s={s}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={cn("btn min-h-9 text-[13.5px]", x.real && "bg-gain-wash text-lime")}
              onClick={() => set({ real: !x.real })}
              aria-pressed={x.real}
            >
              <Icon name={x.real ? "check" : "bulb"} />
              In today&apos;s money
            </button>
          </div>
        </div>
        <div className="grid content-start gap-5 rounded-[18px] bg-tint p-5 max-sm:p-4">
          <Slider
            label="Invest every month"
            value={x.monthly}
            min={0}
            max={100000}
            step={500}
            show={m(x.monthly)}
            onChange={(v) => set({ monthly: v })}
            marks={["₹0", "₹25k", "₹50k", "₹75k", "₹1L"]}
          />
          <Slider
            label="For how many years"
            value={x.years}
            min={1}
            max={30}
            step={1}
            show={`${x.years} yr${x.years === 1 ? "" : "s"}`}
            onChange={(v) => set({ years: v })}
            marks={["1", "10", "20", "30"]}
          />
          <Slider
            label="Raise it every year by"
            value={x.step}
            min={0}
            max={20}
            step={1}
            show={`${x.step}%`}
            onChange={(v) => set({ step: v })}
            marks={["0%", "10%", "20%"]}
          />
          <div className="grid gap-2">
            <span className="text-[14px] font-medium text-body">Markets</span>
            <div className="grid grid-cols-3 gap-1.5 rounded-full bg-card p-1" role="group" aria-label="Markets">
              {CASES.map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={x.k === k}
                  onClick={() => set({ k })}
                  className={cn(
                    "grid cursor-pointer rounded-full px-2 py-1.5 text-center",
                    x.k === k ? "bg-act-a text-on-act" : "text-body hover:bg-tint",
                  )}
                >
                  <b className="text-[13.5px] font-semibold">{l}</b>
                  <span className="num text-[11.5px] opacity-80">{(rates[k] * 100).toFixed(1)}% a year</span>
                </button>
              ))}
            </div>
          </div>
          <p className="text-[12.5px] text-muted">
            Starts from your {s(today)} today. {seen ? `Your statements show about ${m(seen)} going in each month. ` : ""}
            Yearly returns are blended from your mix of funds, stocks, bonds and US stocks.
          </p>
        </div>
      </section>

      <Card>
        <CardHead
          title="How it builds, year by year"
          note="Tap or hover a year. Early years are mostly your money; later, growth does most of the work."
        />
        <YearBars g={g} s={s} adj={adj} />
      </Card>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card>
          <CardHead
            title="At a glance"
            note={`At ${m(x.monthly)} a month${x.step ? `, raised ${x.step}% a year` : ""}, ${CASES[x.k][1].toLowerCase()} markets.`}
          />
          <table className="num w-full text-[14px]">
            <thead>
              <tr className="text-left text-[12.5px] text-muted">
                <th className="py-2 font-medium">In</th>
                <th className="py-2 font-medium">You put in</th>
                <th className="py-2 text-right font-medium">Worth</th>
              </tr>
            </thead>
            <tbody>
              {MILESTONES.map((y) => {
                const q = grow(today, x.monthly, y, r, x.step / 100);
                return (
                  <tr key={y} className={cn("border-t border-rule", y === x.years && "bg-gain-wash")}>
                    <td className="py-3">
                      <button
                        type="button"
                        className="cursor-pointer font-semibold text-ink underline-offset-2 hover:underline"
                        onClick={() => set({ years: y })}
                      >
                        {y} years
                      </button>
                      <span className="block text-[12px] text-muted">{new Date().getFullYear() + y}</span>
                    </td>
                    <td className="py-3 text-body">{s(adj(q.put, y))}</td>
                    <td className="py-3 text-right">
                      <b className="text-[15.5px] text-ink">{s(adj(q.value, y))}</b>
                      <span className="block text-[12px] text-gain-ink">+{s(adj(q.gain, y))} growth</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
        <Card>
          <CardHead title="What if…" note={`Compared with ${s(adj(g.value, x.years))} in ${x.years} years.`} />
          <ul className="grid gap-2">
            {whatIf.map((w) => {
              const yy = w.y ?? x.years;
              const d = adj(w.v, yy) - adj(g.value, x.years);
              return (
                <li key={w.t} className="well grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-4">
                  <span>
                    <b className="block text-[14.5px] font-semibold text-ink">{w.t}</b>
                    <span className="num text-[13px] text-muted">
                      {s(adj(w.v, yy))} in {yy} years
                    </span>
                  </span>
                  <b className={cn("num text-[15px]", d >= 0 ? "text-gain-ink" : "text-loss-ink")}>
                    {d >= 0 ? "+" : "−"}
                    {s(Math.abs(d))}
                  </b>
                </li>
              );
            })}
            <li className="well grid gap-1 p-4">
              <b className="text-[14.5px] font-semibold text-ink">To have ₹1 crore in {x.years} years</b>
              <span className="num text-[13px] text-body">
                {crore === 0
                  ? "You get there without adding anything more."
                  : `Invest about ${m(Math.ceil(crore / 500) * 500)} a month${x.step ? `, raised ${x.step}% a year` : ""}.`}
              </span>
            </li>
          </ul>
        </Card>
      </div>
      <p className="note">
        Projections, not promises: markets don&apos;t rise in straight lines, and a bad year near the end changes the result most. The
        likely case uses long-run averages for each kind of investment; the cautious and strong cases show a realistic range. Tax on gains
        isn&apos;t taken out.
      </p>
    </>
  );
}
