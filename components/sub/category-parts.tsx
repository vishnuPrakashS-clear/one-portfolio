"use client";

import { useState } from "react";
import { CATEGORIES, IND_CLASS_COLOR, PROJECTION_YEARS, type CatId } from "@/constants";
import { fv, type CategoryModel, type ModelItem } from "@/lib/model";
import { inr2, pct1, qty } from "@/lib/format";
import { itemXirr } from "@/lib/planner";
import { useMoney } from "@/lib/use-money";
import { useUi } from "@/components/providers/ui-provider";
import { Card, CardHead } from "./ui";
import { cn } from "@/lib/utils";

const rate = (r: number) => (r * 100).toFixed(1).replace(".0", "") + "%";

/** where today's money and the monthly amount could be in 5, 10, 15 and 20 years, as a cautious–strong range */
export function ProjectionCard({ c, title = "Where this could be" }: { c: CategoryModel; title?: string }) {
  const { m, s } = useMoney(),
    cat = CATEGORIES[c.id],
    [lo, mid, hi] = cat.rates;
  const top = fv(c.value, c.sip, hi, 20);
  return (
    <Card style={{ ["--c" as string]: cat.hex }}>
      <CardHead
        title={title}
        note={
          <>
            Today {m(c.value)}
            {c.sip ? (
              <>
                , adding {m(c.sip)} a month ({c.sipSrc})
              </>
            ) : (
              ", with nothing more added"
            )}
            . Cautious {rate(lo)}, likely {rate(mid)}, strong {rate(hi)} a year
            {c.xirr != null ? (
              <>
                . Your own past return: <b className="text-ink">{pct1(c.xirr)} a year</b>
              </>
            ) : null}
            .
          </>
        }
      />
      <div className="grid grid-cols-2 gap-2.5">
        {PROJECTION_YEARS.map((y) => {
          const v = cat.rates.map((r) => fv(c.value, c.sip, r, y)),
            put = c.value + c.sip * 12 * y;
          return (
            <div key={y} className="grid gap-0.5 rounded-[14px] bg-tint px-4 py-3.5">
              <span className="text-[12.5px] text-muted">In {y} years</span>
              <b className="num font-display text-[24px] leading-tight font-bold tracking-[-0.02em] text-ink max-sm:text-[20px]">
                {s(v[1])}
              </b>
              <span className="num text-[13px] text-body">
                {s(v[0])} – {s(v[2])}
              </span>
              <span className="relative mt-1.5 mb-0.5 h-2 overflow-hidden rounded-full bg-tint" aria-hidden>
                <i className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(100 * v[0]) / top}%`, background: cat.hex2 }} />
                <i
                  className="absolute inset-y-0 rounded-full"
                  style={{
                    left: `${(100 * v[0]) / top}%`,
                    width: `${(100 * (v[2] - v[0])) / top}%`,
                    background: `linear-gradient(90deg, ${cat.hex}, ${cat.hex2})`,
                  }}
                />
                <i className="absolute bottom-0 left-0 h-[3px] rounded-full bg-ink/40" style={{ width: `${(100 * put) / top}%` }} />
              </span>
              <span className="text-[12px] text-muted">you put in {s(put)}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/** every holding, largest first; the bar shows its share of the category; tap opens its details */
const SORTS = [
  ["value", "Current value"],
  ["ret", "Returns %"],
  ["name", "Name"],
] as const;
/** the holdings list, broker-style: name and what you paid on the left, current value and returns on the right */
export function HoldingsList({
  c,
  limit,
  items,
  tag,
}: {
  c: CategoryModel;
  limit?: number;
  /** a subset of the category (one broker's, say); all of it by default */
  items?: ModelItem[];
  /** a short label shown after the name, e.g. the broker */
  tag?: (it: ModelItem) => string | null;
}) {
  const { m } = useMoney(),
    { openItem } = useUi();
  const [sort, setSort] = useState<(typeof SORTS)[number][0]>("value");
  const rows = [...(items || c.items)].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "ret") {
      const ra = a.cost ? (a.value - a.cost) / a.cost : -1e9,
        rb = b.cost ? (b.value - b.cost) / b.cost : -1e9;
      return rb - ra;
    }
    return b.value - a.value;
  });
  return (
    <div className="grid gap-1">
      <div className="flex flex-wrap items-center gap-1.5 pb-1" role="group" aria-label="Sort holdings">
        <span className="pr-1 text-[12.5px] text-muted">Sort</span>
        {SORTS.map(([k, l]) => (
          <button
            key={k}
            type="button"
            aria-pressed={sort === k}
            onClick={() => setSort(k)}
            className={cn("chip cursor-pointer", sort === k ? "bg-gain-wash text-lime" : "hover:bg-tint-2")}
          >
            {l}
          </button>
        ))}
      </div>
      <ol className="grid max-h-[760px] [scrollbar-width:thin] overflow-auto">
        {rows.slice(0, limit).map((it) => {
          const g = it.cost != null ? it.value - it.cost : null,
            gp = it.cost ? (g as number) / it.cost : null,
            xr = itemXirr(it),
            h = it.india;
          const left =
            h && h.type !== "mf" && (h.avg || (h.cost && h.units))
              ? `${qty(h.units)} × avg ${inr2(h.avg || (h.cost as number) / h.units)}`
              : it.cost != null
                ? `Invested ${m(it.cost)}`
                : it.sub;
          return (
            <li key={it.id} className="border-b border-rule last:border-0">
              <button
                type="button"
                onClick={() => openItem(c.id, it.id)}
                className="grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 rounded-lg px-1.5 py-3 text-left transition-colors hover:bg-tint focus-visible:outline-offset-[-2px]"
              >
                <b className="truncate text-[14.5px] font-medium text-ink">
                  {it.name}
                  {tag?.(it) && (
                    <span className="ml-2 rounded-md bg-tint px-1.5 py-0.5 text-[11px] font-semibold text-muted">{tag(it)}</span>
                  )}
                </b>
                <b className="num text-right text-[14.5px] font-semibold text-ink">{m(it.value)}</b>
                <span className="num truncate text-[12.5px] text-muted">
                  {left}
                  {xr != null && (
                    <>
                      {" "}
                      · XIRR <b className={cn("font-semibold", xr >= 0 ? "text-gain-ink" : "text-loss-ink")}>{pct1(xr)}</b>
                    </>
                  )}
                </span>
                <span
                  className={cn(
                    "num text-right text-[12.5px] font-semibold whitespace-nowrap",
                    g == null ? "font-normal text-muted" : g >= 0 ? "text-gain-ink" : "text-loss-ink",
                  )}
                >
                  {g == null ? "buy price not uploaded" : `${g >= 0 ? "+" : "−"}${m(Math.abs(g))} (${pct1(gp)})`}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function FundMix({ c }: { c: CategoryModel }) {
  const { s } = useMoney(),
    by: Record<string, number> = {};
  for (const it of c.items) {
    const k = it.india?.cls || "Other";
    by[k] = (by[k] || 0) + it.value;
  }
  const rows = Object.entries(by).sort((a, b) => b[1] - a[1]);
  return (
    <Card>
      <CardHead title="What your funds hold" note="By the kind of fund each one is." />
      <div
        className="flex h-3.5 gap-[3px] overflow-hidden rounded-full"
        role="img"
        aria-label={rows.map(([k, v]) => `${k} ${((100 * v) / c.value).toFixed(0)}%`).join(", ")}
      >
        {rows.map(([k, v]) => (
          <i key={k} className="block h-full" style={{ width: `${(100 * v) / c.value}%`, background: IND_CLASS_COLOR[k] || "#94a3b8" }} />
        ))}
      </div>
      <ul className="grid gap-0.5">
        {rows.map(([k, v]) => (
          <li key={k} className="grid min-h-[34px] grid-cols-[10px_minmax(0,1fr)_auto_44px] items-center gap-2.5 text-[14px]">
            <span className="size-2.5 rounded-[3px]" style={{ background: IND_CLASS_COLOR[k] || "#94a3b8" }} />
            <span>{k}</span>
            <b className="num font-semibold">{s(v)}</b>
            <em className="num text-right text-muted not-italic">{((100 * v) / c.value).toFixed(0)}%</em>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function Movers({ c }: { c: CategoryModel }) {
  const { openItem } = useUi();
  const g = c.items
    .filter((x) => x.cost)
    .map((x) => ({ x, p: (x.value - (x.cost as number)) / (x.cost as number) }))
    .sort((a, b) => b.p - a.p);
  const up = g.slice(0, 4),
    dn = g
      .slice(-4)
      .reverse()
      .filter((r) => r.p < 0);
  if (!g.length) return null;
  const Row = ({ r }: { r: (typeof g)[number] }) => (
    <li>
      <button
        type="button"
        onClick={() => openItem(c.id as CatId, r.x.id)}
        className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl px-2.5 py-2 text-left text-[14px] hover:bg-tint"
      >
        <span className="truncate">{r.x.name}</span>
        <b className={cn("num font-semibold", r.p >= 0 ? "text-gain-ink" : "text-loss-ink")}>{pct1(r.p)}</b>
      </button>
    </li>
  );
  return (
    <Card>
      <CardHead title="Best and worst" note="Return on what you paid." />
      <h3 className="text-[13px] font-semibold text-muted">Best</h3>
      <ul>
        {up.map((r) => (
          <Row key={r.x.id} r={r} />
        ))}
      </ul>
      {dn.length > 0 && (
        <>
          <h3 className="text-[13px] font-semibold text-muted">Down</h3>
          <ul>
            {dn.map((r) => (
              <Row key={r.x.id} r={r} />
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
