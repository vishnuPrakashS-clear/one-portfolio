"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { usePortfolio } from "@/components/providers/portfolio-provider";
import { CATEGORIES, CAT_ORDER, EXTRA_MONTHLY, GOAL_AMOUNTS, GOAL_COLOR, RATE_NAMES } from "@/constants";
import { fv, goalCalc, projectAll, type GoalResult, type Model } from "@/lib/model";
import { TODAY } from "@/lib/dates";
import { useMoney } from "@/lib/use-money";
import { Card, CardHead, Hero } from "@/components/sub/ui";
import { GoalChart } from "@/components/sub/charts";
import { ProjectionCard } from "@/components/sub/category-parts";
import { Icon, type IconName } from "@/components/sub/icon";
import type { Goal } from "@/types/portfolio";
import { cn } from "@/lib/utils";

export const VERDICTS: {
  title: string;
  color: string;
  icon: IconName;
  text: (g: Goal, r: GoalResult, m: (v: number) => string, s: (v: number) => string) => string;
}[] = [
  {
    title: "Not on track yet",
    color: "#f87171",
    icon: "alert",
    text: (g, r, m, s) =>
      `Even a strong market gets you to about ${s(r.v[2])}. Investing about ${m(Math.ceil(r.need / 500) * 500)} a month (now ${m(r.sip)}) reaches ${s(g.amt)} at the likely rate.`,
  },
  {
    title: "Only in a strong market",
    color: "#fbbf24",
    icon: "up",
    text: (g, r, m, s) =>
      `Likely about ${s(r.v[1])}. To reach ${s(g.amt)} at the likely rate, invest about ${m(Math.ceil(r.need / 500) * 500)} a month instead of ${m(r.sip)}.`,
  },
  {
    title: "On track at the likely rate",
    color: "#34d399",
    icon: "check",
    text: (g, r, _m, s) => `Likely about ${s(r.v[1])} by ${g.year}. A cautious market would leave you at ${s(r.v[0])}.`,
  },
  {
    title: "On track, even in a cautious market",
    color: "#5eead4",
    icon: "check",
    text: (g, r, _m, s) => `Cautious ${s(r.v[0])}, likely ${s(r.v[1])} by ${g.year}.`,
  },
];

function Chips<T extends number>({
  label,
  items,
  value,
  onPick,
  render,
  sub,
}: {
  label: string;
  items: T[];
  value: T | undefined;
  onPick: (v: T) => void;
  render: (v: T) => string;
  sub?: (v: T) => string | null;
}) {
  return (
    <div>
      <span className="kicker mb-2">{label}</span>
      <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
        {items.map((v) => {
          const on = value === v;
          return (
            <motion.button
              key={v}
              type="button"
              whileTap={{ scale: 0.95 }}
              aria-pressed={on}
              onClick={() => onPick(v)}
              className={cn(
                "num inline-grid min-h-11 min-w-16 cursor-pointer justify-items-center gap-px rounded-[14px] px-3.5 py-2 font-display text-[15px] leading-tight font-bold transition-colors",
                on
                  ? "bg-goal/22 text-white shadow-[inset_0_0_0_1.5px_var(--color-goal),0_0_20px_-6px_var(--color-goal)]"
                  : "bg-white/6 text-ink shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12)] hover:bg-white/11",
              )}
            >
              {render(v)}
              {sub?.(v) && <small className={cn("font-sans text-[11px] font-medium", on ? "text-gain-ink" : "text-muted")}>{sub(v)}</small>}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

function Meter({ goal, r, total, s }: { goal: Goal; r: GoalResult; total: number; s: (v: number) => string }) {
  const top = Math.max(goal.amt, r.v[2]) * 1.04,
    at = (v: number) => Math.min(100, (100 * v) / top);
  const marks: [string, number, string][] = [
    ["Today", total, "now"],
    ...RATE_NAMES.map((n, k) => [n, r.v[k], "k" + k] as [string, number, string]),
  ];
  return (
    <div
      className="col-span-full px-2 pt-9 pb-12"
      role="img"
      aria-label={`By ${goal.year}: cautious ${s(r.v[0])}, likely ${s(r.v[1])}, strong ${s(r.v[2])}, against a goal of ${s(goal.amt)}; today ${s(total)}`}
    >
      <div className="relative h-3 rounded-full bg-white/7">
        <motion.i
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-act-a to-act-b shadow-[0_0_12px_var(--color-act-a)]"
          initial={{ width: 0 }}
          animate={{ width: `${at(total)}%` }}
          transition={{ duration: 0.9 }}
        />
        <motion.span
          className="absolute inset-y-0 rounded-full bg-gradient-to-r from-goal/35 to-goal/75 shadow-[0_0_14px_-2px_var(--color-goal)]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, left: `${at(r.v[0])}%`, width: `${at(r.v[2]) - at(r.v[0])}%` }}
          transition={{ duration: 0.9 }}
        />
        {marks.map(([name, v, k]) => (
          <motion.em
            key={k}
            className={cn(
              "absolute -top-[3px] h-[18px] -translate-x-1/2 rounded-sm not-italic",
              k === "k1" ? "w-1 bg-white shadow-[0_0_8px_#fff]" : k === "now" ? "w-0" : "w-[3px] bg-white/60",
            )}
            animate={{ left: `${at(v)}%` }}
          >
            <span
              className={cn(
                "absolute top-[22px] grid text-[11.5px] leading-tight whitespace-nowrap text-muted",
                k === "now" ? "left-0 justify-items-start" : "left-1/2 -translate-x-1/2 justify-items-center",
                (k === "k0" || k === "k2") && "max-sm:hidden",
              )}
            >
              {name}
              <b className="num font-display text-[12.5px] font-semibold text-ink">{s(v)}</b>
            </span>
          </motion.em>
        ))}
        <motion.b
          className="absolute -top-2 h-7 w-1 -translate-x-1/2 rounded-sm bg-white shadow-[0_0_10px_#fff]"
          animate={{ left: `${at(goal.amt)}%` }}
        >
          <span className="absolute bottom-8 left-1/2 -translate-x-1/2 rounded-lg bg-white/10 px-2 py-1 font-display text-[12.5px] font-bold whitespace-nowrap">
            Goal {s(goal.amt)}
          </span>
        </motion.b>
      </div>
    </div>
  );
}

function pathSeries(M: Model, r: GoalResult, extra: number): { series: [number[], number[], number[]]; put: number[] } {
  const pts = Math.max(4, Math.ceil(r.yrs) * 4);
  const at = (k: 0 | 1 | 2, t: number) => projectAll(M, k, t, extra);
  const series = [0, 1, 2].map((k) => Array.from({ length: pts + 1 }, (_, j) => at(k as 0 | 1 | 2, (j / pts) * r.yrs))) as [
    number[],
    number[],
    number[],
  ];
  const put = Array.from({ length: pts + 1 }, (_, j) => M.total + r.sip * 12 * (j / pts) * r.yrs);
  return { series, put };
}

export function GoalsScreen() {
  const { model: M, S, setGoal } = usePortfolio(),
    { m, s } = useMoney();
  if (!M.total) {
    return (
      <Hero badge="Goal check" title="Upload a statement first" big={false} compact>
        <p className="max-w-[60ch] text-[16.5px] text-body">
          The goal check works out where your current investments and monthly investing lead, and whether that reaches your goal.
        </p>
        <div>
          <Link href="/upload" className="btn btn-primary">
            <Icon name="upload" />
            Upload
          </Link>
        </div>
      </Hero>
    );
  }
  const Y = +TODAY().slice(0, 4),
    years = [5, 10, 15, 20, 25].map((k) => Y + k),
    goal = S?.settings.goal;
  const age =
    S?.settings.age && S.settings.ageYear ? (y: number) => (S.settings.age as number) + (y - (S.settings.ageYear as number)) : null;
  const r = goal ? goalCalc(M, goal) : null,
    vd = r ? VERDICTS[r.level] : null,
    extra = goal?.extra || 0;
  const path = r ? pathSeries(M, r, extra) : null;
  return (
    <>
      <Hero
        badge="Goal check"
        color={GOAL_COLOR}
        title={goal ? `${s(goal.amt)} by ${goal.year}` : "Pick a goal and a year"}
        big={false}
        compact
        aside={
          <div className="grid gap-4 rounded-[22px] p-5 glass">
            <Chips label="Goal" items={GOAL_AMOUNTS} value={goal?.amt} onPick={(amt) => setGoal({ amt })} render={s} />
            <Chips
              label={`Each month, on top of today's ${m(M.sip)}`}
              items={EXTRA_MONTHLY}
              value={goal ? extra : undefined}
              onPick={(x) => setGoal({ extra: x })}
              render={(x) => (x ? "+" + s(x) : "Same")}
            />
            <Chips
              label="By"
              items={years}
              value={goal?.year}
              onPick={(year) => setGoal({ year })}
              render={String}
              sub={age ? (y) => `age ${age(y)}` : undefined}
            />
          </div>
        }
      >
        <p className="max-w-[56ch] text-[16.5px] text-body">
          Tap an amount and a year. The check uses what you hold today and what goes in each month, read from your statements. Nothing to
          type.
        </p>
      </Hero>
      {goal && r && vd && path ? (
        <>
          <Card
            className="grid-cols-[auto_minmax(0,1fr)] items-center gap-x-[18px] gap-y-4 max-sm:grid-cols-1"
            style={{ boxShadow: `inset 0 0 0 1px ${vd.color}73, 0 0 60px -30px ${vd.color}` }}
          >
            <div
              className="grid size-14 place-items-center rounded-[18px]"
              style={{ color: vd.color, background: `${vd.color}29` }}
              aria-hidden
            >
              <Icon name={vd.icon} className="size-7" strokeWidth={2.2} />
            </div>
            <div>
              <h2 className="font-display text-[24px] font-semibold max-sm:text-[21px]" style={{ color: vd.color }}>
                {vd.title}
              </h2>
              <p className="text-[14.5px] text-body">{vd.text(goal, r, m, s)}</p>
            </div>
            <Meter goal={goal} r={r} total={M.total} s={s} />
          </Card>
          <Card>
            <CardHead
              title={`Your path to ${goal.year}`}
              note="Green line: likely. Shaded: cautious to strong. Dashed: what you'd have put in by then."
            />
            <GoalChart
              startYear={Y}
              startMonth={+TODAY().slice(5, 7)}
              yrs={r.yrs}
              series={path.series}
              put={path.put}
              goal={goal.amt}
              goalYear={goal.year}
              fmt={s}
            />
          </Card>
          <Card>
            <CardHead title={`By category in ${goal.year}`} note="At the likely rate, with today's monthly investing continuing." />
            <div className="-mx-2 overflow-x-auto px-2">
              <table>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th className="text-right">Today</th>
                    <th className="text-right">Each month</th>
                    <th className="text-right max-sm:hidden">Likely rate</th>
                    <th className="text-right">In {goal.year}</th>
                  </tr>
                </thead>
                <tbody>
                  {CAT_ORDER.filter((id) => M.cats[id].items.length).map((id) => {
                    const c = M.cats[id],
                      cat = CATEGORIES[id];
                    return (
                      <tr key={id}>
                        <td className="whitespace-nowrap">
                          <span
                            className="mr-2.5 inline-block size-2.5 rounded-full align-[1px]"
                            style={{ background: cat.hex, boxShadow: `0 0 8px ${cat.hex}` }}
                          />
                          {cat.name}
                        </td>
                        <td className="num text-right">{s(c.value)}</td>
                        <td className="num text-right">{c.sip ? m(c.sip) : "—"}</td>
                        <td className="num text-right max-sm:hidden">{(cat.rates[1] * 100).toFixed(1).replace(".0", "")}%</td>
                        <td className="num text-right">
                          <b>{s(fv(c.value, c.sip, cat.rates[1], r.yrs))}</b>
                        </td>
                      </tr>
                    );
                  })}
                  {extra > 0 && (
                    <tr>
                      <td className="whitespace-nowrap">
                        <span className="mr-2.5 inline-block size-2.5 rounded-full bg-white align-[1px]" />
                        Extra you add
                      </td>
                      <td className="num text-right">—</td>
                      <td className="num text-right">{m(extra)}</td>
                      <td className="num text-right max-sm:hidden">{(r.w * 100).toFixed(1)}%</td>
                      <td className="num text-right">
                        <b>{s(fv(0, extra, r.w, r.yrs))}</b>
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td className="num text-right">{s(M.total)}</td>
                    <td className="num text-right">{m(r.sip)}</td>
                    <td className="num text-right max-sm:hidden">{(r.w * 100).toFixed(1)}%</td>
                    <td className="num text-right font-display">{s(r.v[1])}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        </>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {CAT_ORDER.filter((id) => M.cats[id].items.length).map((id) => (
            <ProjectionCard key={id} c={M.cats[id]} title={CATEGORIES[id].name} />
          ))}
        </div>
      )}
      <p className="note max-w-[110ch] text-[12.5px]">
        Rates are long-run assumptions, not promises: mutual funds 8–14%, stocks 7–16%, bonds 6.5–9.5%, abroad in rupees 7–14% a year.
        Monthly investing is the average of your last six months of purchases (abroad: your monthly plan). Inflation is not taken out.
      </p>
    </>
  );
}
