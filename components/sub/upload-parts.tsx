"use client";

import { useState } from "react";
import { usePortfolio } from "@/components/providers/portfolio-provider";
import { useUi } from "@/components/providers/ui-provider";
import { UPLOAD_KIND } from "@/constants";
import { addedText } from "@/lib/upload";
import { dateGaps, FIXES, fileRange, gapsByFix, REPORT_GROUPS, reportCards, type ReportCard } from "@/lib/coverage";
import { daysBetween, fmtDate, TODAY } from "@/lib/dates";
import { qty } from "@/lib/format";
import { useMoney } from "@/lib/use-money";
import type { ImportRecord } from "@/types/portfolio";
import { Card, CardHead, Chip } from "./ui";
import { Icon, type IconName } from "./icon";
import { cn } from "@/lib/utils";

const when = (at?: string) =>
  at ? new Date(at).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—";

function covers(x: ImportRecord) {
  const r = fileRange(x.file);
  if (r) return `${fmtDate(r.from)} – ${fmtDate(r.to)}`;
  return x.period ? `as of ${fmtDate(String(x.period))}` : "—";
}

function Tile({ r }: { r: ReportCard }) {
  const x = r.latest,
    age = x.period ? daysBetween(String(x.period), TODAY()) : null,
    stale = r.group === "holdings" && age != null && age > 30;
  return (
    <li className="grid content-start gap-2 rounded-[16px] bg-tint p-4">
      <div className="flex items-start justify-between gap-2">
        <b className="leading-snug">{UPLOAD_KIND[r.kind] || r.kind}</b>
        {stale ? <Chip tone="wait">{age} days old</Chip> : <Chip tone="good">Up to date</Chip>}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13.5px]">
        <dt className="text-muted">Covers</dt>
        <dd className="num text-ink">{covers(x)}</dd>
        <dt className="text-muted">Adds</dt>
        <dd className="text-ink">{addedText(x) || "—"}</dd>
        <dt className="text-muted">Uploaded</dt>
        <dd className="num text-body">{when(x.at)}</dd>
      </dl>
      {r.all.length > 1 && (
        <details className="text-[13px]">
          <summary className="cursor-pointer font-semibold text-act-a">
            {r.all.length - 1} earlier upload{r.all.length > 2 ? "s" : ""}
          </summary>
          <ul className="mt-1.5 grid gap-1 text-body">
            {r.all.slice(1).map((y, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-x-3">
                <span className="num">{covers(y)}</span>
                <span className="text-muted">{addedText(y)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {x.file && <span className="truncate text-[12px] text-muted">{x.file}</span>}
    </li>
  );
}

/** uploaded reports, one tile per kind, grouped as holdings / transactions / payouts / statements */
export function ReportsByKind() {
  const { S } = usePortfolio(),
    cards = reportCards(S?.imports || []),
    total = Object.values(cards).reduce((s, g) => s + g.length, 0);
  const [open, setOpen] = useState<string | null>(null);
  const groups = REPORT_GROUPS.filter((g) => cards[g.id].length),
    pick = open && cards[open as keyof typeof cards]?.length ? open : null;
  return (
    <Card>
      <CardHead
        title="Your reports"
        note="Grouped by what they tell the app. Tap a group to see each report."
        right={<Chip>{total} kinds</Chip>}
      />
      {!total ? (
        <p className="text-muted">Nothing uploaded yet.</p>
      ) : (
        <div className="grid gap-3">
          <div className="grid grid-cols-4 gap-2.5 max-md:grid-cols-2">
            {REPORT_GROUPS.map((g) => {
              const n = cards[g.id].length,
                on = pick === g.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  disabled={!n}
                  aria-pressed={on}
                  onClick={() => setOpen(on ? null : g.id)}
                  className={cn(
                    "grid content-start gap-1 rounded-[16px] p-4 text-left transition active:scale-[0.98] disabled:opacity-50",
                    on ? "bg-act-a text-on-act shadow-lg" : "bg-tint hover:shadow-[inset_0_0_0_2px_var(--color-act-a)]",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Icon name={g.icon as IconName} className="size-5" />
                    <b>{g.title}</b>
                  </span>
                  <span className={cn("num font-display text-[26px] font-extrabold", on ? "" : "text-ink")}>{n}</span>
                  <span className={cn("text-[12.5px] leading-snug", on ? "opacity-90" : "text-muted")}>{g.what}</span>
                </button>
              );
            })}
          </div>
          {(pick ? groups.filter((g) => g.id === pick) : groups).map((g) => (
            <section key={g.id} className="grid gap-2.5 border-t border-rule pt-3.5">
              <h3 className="flex items-center gap-2 font-display text-[17px] font-bold">
                <Icon name={g.icon as IconName} className="size-5 text-act-a" />
                {g.title}
              </h3>
              <ul className="grid grid-cols-2 gap-2.5 max-md:grid-cols-1">
                {cards[g.id].map((r) => (
                  <Tile key={r.kind} r={r} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Card>
  );
}

/** holdings with units that have no purchase date, grouped by the report that fills them in */
export function MissingDates() {
  const { model, S } = usePortfolio(),
    { openItem } = useUi(),
    { s } = useMoney();
  const [all, setAll] = useState<string | null>(null);
  const gaps = dateGaps(model),
    groups = gapsByFix(gaps),
    total = gaps.reduce((t, g) => t + g.value, 0);
  const span = (o?: { rows: { d: string }[] }) => {
    const ds = (o?.rows || []).map((r) => r.d).sort();
    return ds.length ? `${fmtDate(ds[0])} – ${fmtDate(ds[ds.length - 1])}` : null;
  };
  const onFile: Partial<Record<string, string | null>> = { "gr-st": span(S?.india?.src?.grStO), "gr-mf": span(S?.india?.src?.grMFO) };
  return (
    <Card id="dates" className="scroll-mt-24">
      <CardHead
        title={
          <>Missing purchase dates {gaps.length ? <Chip tone="wait">{gaps.length} holdings</Chip> : <Chip tone="good">All dated</Chip>}</>
        }
        note={
          gaps.length ? (
            <>
              <b className="text-ink">{s(total)}</b> of what you hold has no buy date. Holdings reports and the CDSL statement give units
              and the average price, not <i>when</i> you bought. Without the date the app can&apos;t work out the yearly return (XIRR), draw
              the growth line, or tell you when a sale becomes long-term (lower tax).
            </>
          ) : (
            "Every holding has a buy date, so returns, charts and tax dates are complete."
          )
        }
      />
      <div className="grid gap-3">
        {groups.map(({ fix, items, value }, gi) => {
          const F = FIXES[fix],
            shown = all === fix ? items : items.slice(0, 6);
          return (
            <section key={fix} className="grid gap-2.5 rounded-[16px] bg-tint p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="flex items-center gap-2 font-display text-[16.5px] font-bold">
                  <span className="grid size-6 place-items-center rounded-full bg-act-a text-[13px] text-on-act">{gi + 1}</span>
                  {F.title}
                </h3>
                <span className="text-[13px] text-muted">
                  fixes {items.length} holding{items.length === 1 ? "" : "s"} · <b className="num text-ink">{s(value)}</b>
                </span>
              </div>
              {onFile[fix] && (
                <p className="text-[13.5px] text-body">
                  On file now: <b className="num text-ink">{onFile[fix]}</b>. Anything bought before that has no date.
                </p>
              )}
              <p className="text-[14px] text-ink">{F.steps}</p>
              {F.note && <p className="note">{F.note}</p>}
              <ul className="flex flex-wrap gap-1.5">
                {shown.map((g) => (
                  <li key={g.cat + g.id}>
                    <button
                      type="button"
                      onClick={() => openItem(g.cat, g.id)}
                      className="rounded-full bg-card px-3 py-1.5 text-[13px] shadow-[inset_0_0_0_1px_var(--color-line)] transition hover:shadow-[inset_0_0_0_2px_var(--color-act-a)] active:scale-95"
                    >
                      <b>{g.name.length > 26 ? g.name.slice(0, 25) + "…" : g.name}</b>{" "}
                      <span className="num text-muted">
                        {g.undated < g.units ? `${qty(g.undated)} of ${qty(g.units)}` : qty(g.units)} · {s(g.value)}
                      </span>
                    </button>
                  </li>
                ))}
                {items.length > 6 && (
                  <li>
                    <button
                      type="button"
                      className="rounded-full px-3 py-1.5 text-[13px] font-semibold text-act-a"
                      onClick={() => setAll(all === fix ? null : fix)}
                    >
                      {all === fix ? "Show fewer" : `+${items.length - 6} more`}
                    </button>
                  </li>
                )}
              </ul>
            </section>
          );
        })}
      </div>
    </Card>
  );
}
