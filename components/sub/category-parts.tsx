"use client";

import { CATEGORIES, IND_CLASS_COLOR, PROJECTION_YEARS, type CatId } from "@/constants";
import { fv, type CategoryModel } from "@/lib/model";
import { pct1 } from "@/lib/format";
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
            <div
              key={y}
              className="grid gap-0.5 rounded-[14px] bg-white/[0.045] px-4 py-3.5 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.07)]"
            >
              <span className="text-[12.5px] text-muted">In {y} years</span>
              <b className="num font-display text-[24px] leading-tight font-bold tracking-[-0.02em] text-white max-sm:text-[20px]">
                {s(v[1])}
              </b>
              <span className="num text-[13px] text-body">
                {s(v[0])} – {s(v[2])}
              </span>
              <span className="relative mt-1.5 mb-0.5 h-2 overflow-hidden rounded-full bg-white/6" aria-hidden>
                <i
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ width: `${(100 * v[0]) / top}%`, background: `${cat.hex}88` }}
                />
                <i
                  className="absolute inset-y-0 rounded-full"
                  style={{
                    left: `${(100 * v[0]) / top}%`,
                    width: `${(100 * (v[2] - v[0])) / top}%`,
                    background: `linear-gradient(90deg, ${cat.hex}, #fff8)`,
                    boxShadow: `0 0 10px ${cat.hex}`,
                  }}
                />
                <i className="absolute bottom-0 left-0 h-[3px] rounded-full bg-white/30" style={{ width: `${(100 * put) / top}%` }} />
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
export function HoldingsList({ c, limit }: { c: CategoryModel; limit?: number }) {
  const { m, s } = useMoney(),
    { openItem } = useUi(),
    hex = CATEGORIES[c.id].hex;
  const max = Math.max(1, ...c.items.map((x) => x.value));
  return (
    <ol className="grid max-h-[760px] [scrollbar-width:thin] gap-0.5 overflow-auto">
      {c.items.slice(0, limit).map((it) => {
        const g = it.cost != null ? it.value - it.cost : null,
          gp = it.cost ? (g as number) / it.cost : null;
        return (
          <li key={it.id}>
            <button
              type="button"
              onClick={() => openItem(c.id, it.id)}
              className="grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] gap-x-3.5 gap-y-1.5 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/6 focus-visible:outline-offset-[-2px]"
            >
              <span className="grid min-w-0 gap-px">
                <b className="truncate text-[14.5px] font-semibold">{it.name}</b>
                <span className="truncate text-[12.5px] text-muted">{it.sub}</span>
              </span>
              <span className="num text-right font-display text-[15px] font-semibold">{m(it.value)}</span>
              <span className="h-[5px] self-center overflow-hidden rounded-full bg-white/6">
                <i
                  className="block h-full rounded-full"
                  style={{ width: `${(100 * it.value) / max}%`, background: hex, boxShadow: `0 0 8px ${hex}` }}
                />
              </span>
              <span
                className={cn(
                  "num text-right text-[12.5px] whitespace-nowrap text-muted",
                  g != null && "font-semibold",
                  g != null && (g >= 0 ? "text-gain" : "text-loss"),
                )}
              >
                {g == null ? "buy price not uploaded" : `${g >= 0 ? "+" : "−"}${s(Math.abs(g))} · ${pct1(gp)}`}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
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
        className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl px-2.5 py-2 text-left text-[14px] hover:bg-white/6"
      >
        <span className="truncate">{r.x.name}</span>
        <b className={cn("num font-semibold", r.p >= 0 ? "text-gain" : "text-loss")}>{pct1(r.p)}</b>
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
