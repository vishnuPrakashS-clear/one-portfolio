"use client";

/* The yearly checklist: the jobs that save tax or keep the plan on course, month by month. A 3D year ring shows how far
   the year has got (tap or drag it to pick a month); the chosen month's jobs sit beside it as large tick cards. Ticks fill
   themselves in where an upload proves a job is done. */

import Link from "next/link";
import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { usePortfolio } from "@/components/providers/portfolio-provider";
import { CHECKLIST } from "@/constants";
import { TODAY, daysBetween, fmtDate, iso } from "@/lib/dates";
import { inr } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { Card, CardHead, Chip } from "@/components/sub/ui";
import { Icon } from "@/components/sub/icon";
import { YearRing, type RingMonth } from "@/components/sub/year-ring";
import { cn } from "@/lib/utils";

const MN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const ACCENT = { light: "#7c3aed", dark: "#a78bfa" };
/** where each job is done in the app */
const GO: Record<string, [string, string]> = {
  "jan-import": ["/upload", "Upload"],
  "jan-rebal": ["/plan#rebalance", "Rebalance"],
  "mar-harvest": ["/tax", "Tax"],
  "mar-ltcg": ["/tax", "Tax"],
  "apr-1042": ["/upload", "Upload"],
  "jun-pnl": ["/upload", "Upload"],
  "jul-67": ["/tax", "Tax"],
  "jul-itr": ["/tax", "Tax"],
  "jul-rebal": ["/plan#rebalance", "Rebalance"],
  "dec-exit": ["/plan#sell", "Sell planner"],
};

/** a small burst of dots when a job is ticked */
function Burst({ color }: { color: string }) {
  return (
    <span className="pointer-events-none absolute inset-0" aria-hidden>
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return (
          <motion.i
            key={i}
            className="absolute top-1/2 left-1/2 size-1.5 rounded-full"
            style={{ background: color }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{ x: Math.cos(a) * 26, y: Math.sin(a) * 26, opacity: 0, scale: 0.4 }}
            transition={{ duration: 0.55, ease: "easeOut" }}
          />
        );
      })}
    </span>
  );
}

function Tick({ on, auto, color, onToggle, label }: { on: boolean; auto: boolean; color: string; onToggle: () => void; label: string }) {
  const [pop, setPop] = useState(0);
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={label}
      disabled={auto}
      onClick={() => {
        if (!on) setPop((p) => p + 1);
        onToggle();
      }}
      className={cn(
        "relative grid size-11 shrink-0 place-items-center rounded-full transition active:scale-90 disabled:cursor-default",
        on
          ? "text-white"
          : "bg-card text-transparent shadow-[inset_0_0_0_2px_var(--color-line)] hover:shadow-[inset_0_0_0_2px_currentColor]",
      )}
      style={on ? { background: color } : { color }}
    >
      <motion.span
        initial={false}
        animate={{ scale: on ? 1 : 0.4, opacity: on ? 1 : 0 }}
        transition={{ type: "spring", stiffness: 500, damping: 22 }}
      >
        <Icon name="check" className="size-5" strokeWidth={3} />
      </motion.span>
      {pop > 0 && <Burst key={pop} color={color} />}
    </button>
  );
}

export function ChecklistScreen() {
  const { S, model, mutate } = usePortfolio(),
    theme = useTheme(),
    reduce = useReducedMotion();
  const today = TODAY(),
    thisYear = +today.slice(0, 4),
    thisMonth = +today.slice(5, 7) - 1;
  const [year, setYear] = useState(thisYear);
  const [picked, setPicked] = useState<number | null>(null);
  const accent = ACCENT[theme];

  // months with a purchase, from every dated buy in the app (India and abroad)
  const bought = useMemo(() => {
    const s = new Set<string>();
    for (const c of Object.values(model.cats)) for (const it of c.items) for (const l of it.lots) s.add(l.d.slice(0, 7));
    for (const h of S?.holdings || []) for (const l of h.lots) s.add(l.d.slice(0, 7));
    return s;
  }, [model, S]);

  const auto: Record<string, boolean> = {};
  if (S?.imports.some((x) => x.kind === "statement" && x.period === `${year - 1}-12-31`)) auto["jan-import"] = true;
  if (S?.imports.some((x) => x.kind === "1042s" && String(x.at || "").startsWith(String(year)))) auto["apr-1042"] = true;
  const mine = S?.checklist[year] || {};
  const done = (id: string) => !!(auto[id] || mine[id]);
  const toggle = (id: string) =>
    mutate((D) => {
      D.checklist[year] = { ...(D.checklist[year] || {}), [id]: !done(id) };
    });

  const months: RingMonth[] = MN.map((label, i) => {
    const jobs = CHECKLIST.filter((c) => c.m === i);
    return {
      label,
      total: jobs.length,
      done: jobs.filter((c) => done(c.id)).length,
      bought: bought.has(`${year}-${String(i + 1).padStart(2, "0")}`),
      current: year === thisYear && i === thisMonth,
    };
  });
  const total = CHECKLIST.length,
    doneN = CHECKLIST.filter((c) => done(c.id)).length;
  // the next open job from today (or from January for another year)
  const fromM = year === thisYear ? thisMonth : year > thisYear ? 0 : 12;
  const next = CHECKLIST.filter((c) => c.m >= fromM && !done(c.id)).sort((a, b) => a.m - b.m)[0];
  const sel = picked ?? (next ? next.m : year === thisYear ? thisMonth : 0);
  const jobs = CHECKLIST.filter((c) => c.m === sel);
  const nextAfter = CHECKLIST.find((c) => c.m > sel);
  const due = next ? iso(year, next.m + 1, 0) : null,
    left = due && year === thisYear ? daysBetween(today, due) : null;

  return (
    <>
      <section className="grid items-center gap-4 overflow-hidden rounded-[var(--radius-card)] px-6 py-6 surface max-sm:rounded-[14px] max-sm:px-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="grid content-start gap-4">
          <span className="inline-flex items-center gap-2 text-[13.5px] font-medium text-muted">
            <i className="size-2 rounded-full" style={{ background: accent }} />
            Yearly checklist
          </span>
          <h1 className="text-[clamp(30px,4.4vw,48px)] leading-[1.05] font-semibold tracking-[-0.02em] text-ink">
            {doneN === total ? "All done for " + year : `${doneN} of ${total} jobs done`}
          </h1>
          <div className="h-2.5 overflow-hidden rounded-full bg-tint" aria-hidden>
            <motion.i
              className="block h-full rounded-full"
              style={{ background: accent }}
              initial={false}
              animate={{ width: `${(100 * doneN) / total}%` }}
              transition={{ type: "spring", stiffness: 120, damping: 20 }}
            />
          </div>
          {next ? (
            <button
              type="button"
              onClick={() => setPicked(next.m)}
              className="grid gap-0.5 rounded-[16px] bg-tint p-4 text-left transition hover:shadow-[inset_0_0_0_2px_var(--c)] active:scale-[0.99]"
              style={{ ["--c" as string]: accent }}
            >
              <span className="kicker">
                Next up · {MONTH[next.m]}
                {left != null ? (left >= 0 ? ` · ${left} days left` : " · overdue") : ""}
              </span>
              <b className="text-[15.5px] font-semibold text-ink">{next.text}</b>
            </button>
          ) : (
            <p className="text-body">Nothing left this year. Next year&apos;s list starts in January.</p>
          )}
          <div className="flex flex-wrap gap-2" role="group" aria-label="Year">
            {[thisYear - 1, thisYear, thisYear + 1].map((y) => (
              <button
                key={y}
                type="button"
                aria-pressed={y === year}
                onClick={() => {
                  setYear(y);
                  setPicked(null);
                }}
                className={cn(
                  "rounded-full px-4 py-1.5 text-[14px] font-semibold transition active:scale-95",
                  y === year ? "text-white" : "bg-tint text-body",
                )}
                style={y === year ? { background: accent } : undefined}
              >
                {y}
              </button>
            ))}
          </div>
        </div>
        <div className="relative">
          <YearRing months={months} selected={sel} onSelect={setPicked} progress={doneN / total} accent={accent} dark={theme === "dark"} />
          <div className="pointer-events-none absolute inset-x-0 bottom-1 text-center text-[12px] text-muted">
            Drag to spin · tap a month · dots mark months you invested
          </div>
        </div>
      </section>

      <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Month">
        {months.map((m, i) => (
          <button
            key={m.label}
            type="button"
            role="tab"
            aria-selected={i === sel}
            onClick={() => setPicked(i)}
            className={cn(
              "relative grid min-w-14 shrink-0 justify-items-center gap-0.5 rounded-[14px] px-2 py-2 text-[13px] font-semibold transition active:scale-95",
              i === sel
                ? "text-white shadow-md"
                : m.total
                  ? "bg-card text-ink shadow-[inset_0_0_0_1px_var(--color-line)]"
                  : "bg-card text-muted opacity-70",
            )}
            style={i === sel ? { background: accent } : undefined}
          >
            {m.label}
            <span className="num text-[11px] font-medium opacity-80">{m.total ? `${m.done}/${m.total}` : "·"}</span>
            {m.bought && (
              <i className="absolute top-1.5 right-1.5 size-1.5 rounded-full" style={{ background: i === sel ? "#fff" : accent }} />
            )}
            {m.current && <i className="absolute inset-x-3 bottom-0.5 h-0.5 rounded-full bg-current opacity-60" />}
          </button>
        ))}
      </div>

      <Card>
        <CardHead
          title={`${MONTH[sel]} ${year}`}
          note={jobs.length ? `${jobs.filter((c) => done(c.id)).length} of ${jobs.length} done` : "Nothing due this month."}
          right={months[sel].bought ? <Chip tone="good">You invested this month</Chip> : undefined}
        />
        <AnimatePresence mode="popLayout" initial={false}>
          {jobs.length ? (
            <motion.ul
              key={`${year}-${sel}`}
              className="grid gap-2.5"
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              {jobs.map((c, k) => {
                const on = done(c.id);
                return (
                  <motion.li
                    key={c.id}
                    layout={!reduce}
                    initial={reduce ? false : { opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: reduce ? 0 : k * 0.06 }}
                    className={cn(
                      "flex items-center gap-3.5 rounded-[18px] p-3.5 transition-colors",
                      on ? "bg-tint" : "bg-card shadow-[inset_0_0_0_1px_var(--color-line)]",
                    )}
                  >
                    <Tick on={on} auto={!!auto[c.id]} color={accent} onToggle={() => toggle(c.id)} label={c.text} />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-[15px] leading-snug", on ? "text-muted line-through decoration-2" : "text-ink")}>
                        {c.text}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-2">
                        {auto[c.id] && <Chip tone="good">Ticked from your uploads</Chip>}
                        {GO[c.id] && (
                          <Link href={GO[c.id][0]} className="text-[13px] font-semibold no-underline" style={{ color: accent }}>
                            {GO[c.id][1]} →
                          </Link>
                        )}
                      </span>
                    </span>
                  </motion.li>
                );
              })}
            </motion.ul>
          ) : (
            <motion.div
              key={`${year}-${sel}-empty`}
              className="grid gap-2 rounded-[16px] bg-tint p-4"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <p className="text-body">A quiet month: keep the monthly investing going.</p>
              {nextAfter && (
                <button
                  type="button"
                  className="justify-self-start text-[14px] font-semibold"
                  style={{ color: accent }}
                  onClick={() => setPicked(nextAfter.m)}
                >
                  Next jobs: {MONTH[nextAfter.m]} →
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      <Card>
        <CardHead title={`The whole of ${year}`} note="Tap a month to open it." />
        <ol className="relative grid gap-1 before:absolute before:top-2 before:bottom-2 before:left-[15px] before:w-0.5 before:bg-rule">
          {months.map((m, i) =>
            m.total ? (
              <li key={m.label}>
                <button
                  type="button"
                  onClick={() => setPicked(i)}
                  className="flex w-full items-start gap-3 rounded-[12px] p-1.5 text-left hover:bg-tint"
                >
                  <span
                    className={cn(
                      "relative z-[1] mt-0.5 grid size-5 place-items-center rounded-full",
                      m.done === m.total ? "text-white" : "bg-card",
                    )}
                    style={m.done === m.total ? { background: accent } : { boxShadow: `inset 0 0 0 2px ${accent}` }}
                  >
                    {m.done === m.total && <Icon name="check" className="size-3" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0">
                    <b className="text-[14.5px] text-ink">{MONTH[i]}</b>{" "}
                    <span className="num text-[13px] text-muted">
                      {m.done}/{m.total}
                    </span>
                    <span className="block truncate text-[13px] text-body">
                      {CHECKLIST.filter((c) => c.m === i)
                        .map((c) => c.text.replace(/^(Before|By) [^:]+: /, ""))
                        .join(" · ")}
                    </span>
                  </span>
                </button>
              </li>
            ) : null,
          )}
        </ol>
        <p className="note">
          Schedule FA lists every foreign holding you held at any time from January to December, even with no sale. TCS starts only above
          ₹10 lakh of foreign remittances in a financial year{S ? `; ${inr(S.settings.monthlyInr * 12)} a year stays clear` : ""}.
          {due && ` The next job is due by ${fmtDate(due)}.`}
        </p>
      </Card>
    </>
  );
}
