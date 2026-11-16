"use client";

/* Indian stocks, broker by broker. The Stocks screen shows all of them with a card for each broker; each broker has its
   own screen with its holdings, value over time, biggest positions, gainers and losers, and what's left to upload. */
import Link from "next/link";
import { useMemo, useState } from "react";
import { usePortfolio } from "@/components/providers/portfolio-provider";
import { CATEGORIES } from "@/constants";
import { BROKERS, acctName, brokerItems, group, otherItems, type BrokerId, type Group } from "@/lib/brokers";
import { fmtDate } from "@/lib/dates";
import { pct1 } from "@/lib/format";
import { useMoney } from "@/lib/use-money";
import { cn } from "@/lib/utils";
import { Card, CardHead, Empty, SplitBar, Summary } from "@/components/sub/ui";
import { CountUp } from "@/components/sub/count-up";
import { ValueChart } from "@/components/sub/charts";
import { HoldingsList, Movers, ProjectionCard } from "@/components/sub/category-parts";
import { Icon } from "@/components/sub/icon";
import { HistNote } from "./home";

function summaryItems(g: Group, s: (v: number) => string) {
  return [
    {
      k: g.known < g.value - 1 ? `Invested (${Math.round((100 * g.known) / (g.value || 1))}% known)` : "Invested",
      v: g.cost ? s(g.cost) : "—",
    },
    {
      k: "Total returns",
      v: g.gain != null ? `${g.gain >= 0 ? "+" : "−"}${s(Math.abs(g.gain))} (${pct1(g.gainPct)})` : "—",
      tone: (g.gain == null ? "" : g.gain >= 0 ? "pos" : "neg") as "pos" | "neg" | "",
    },
    ...(g.xirr != null
      ? [{ k: `XIRR since ${fmtDate(g.since!)}`, v: pct1(g.xirr), tone: (g.xirr >= 0 ? "pos" : "neg") as "pos" | "neg" }]
      : []),
    { k: "Holdings", v: String(g.items.length) },
  ];
}

function BrokerLogo({ name, color, size = 40 }: { name: string; color: string; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-xl font-bold text-white"
      style={{ background: color, width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden
    >
      {name[0]}
    </span>
  );
}

/** the Stocks screen: everything, a card per broker, and one list you can filter by broker */
export function StocksOverview() {
  const { model } = usePortfolio(),
    { m, s } = useMoney();
  const c = model.cats.stocks;
  const all = useMemo(() => group(model, c.items), [model, c.items]);
  const per = useMemo(() => BROKERS.map((b) => ({ b, g: group(model, brokerItems(model, b.id)) })), [model]);
  const other = useMemo(() => group(model, otherItems(model)), [model]);
  const [f, setF] = useState<BrokerId | "all" | "other">("all");
  if (!c.items.length)
    return (
      <Empty
        title="No Indian stocks yet"
        action={
          <Link href="/upload" className="btn btn-primary">
            Upload reports
          </Link>
        }
      >
        Upload your CDSL or NSDL statement, and your Groww and Zerodha holdings reports, to see each broker here.
      </Empty>
    );
  const shown = f === "all" ? c.items : f === "other" ? other.items : per.find((p) => p.b.id === f)!.g.items;
  const n = model.months.length;
  return (
    <>
      <Summary
        badge={`Indian stocks · ${c.items.length} holdings across ${per.filter((p) => p.g.items.length).length + (other.items.length ? 1 : 0)} accounts`}
        color={CATEGORIES.stocks.hex}
        title={<CountUp value={all.value} format={m} />}
        items={summaryItems(all, s)}
        chart={
          <ValueChart
            months={model.months}
            values={all.val}
            invested={all.inv}
            color={CATEGORIES.stocks.hex}
            fmt={s}
            label={`Indian stocks: value and money put in over the last ${n} months`}
            note={all.coverage < 0.995 ? `Holdings with purchase dates: ${Math.round(100 * all.coverage)}% of the value` : undefined}
          />
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {per.map(({ b, g }) => (
          <Link key={b.id} href={b.route} className="card gap-3 no-underline transition hover:shadow-[var(--shadow-lift)]">
            <div className="flex items-center gap-3">
              <BrokerLogo name={b.name} color={b.color} />
              <div className="min-w-0">
                <b className="block text-[16px] font-semibold text-ink">{b.name}</b>
                <span className="block text-[12.5px] text-muted">
                  {g.items.length ? `${g.items.length} holding${g.items.length === 1 ? "" : "s"}` : "Nothing uploaded yet"}
                </span>
              </div>
              <Icon name="chevron" className="ml-auto text-muted" />
            </div>
            {g.items.length > 0 && (
              <>
                <b className="num text-[22px] leading-none font-semibold text-ink">{s(g.value)}</b>
                <div className="num flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
                  {g.gain != null && (
                    <span className={g.gain >= 0 ? "font-semibold text-gain-ink" : "font-semibold text-loss-ink"}>
                      {g.gain >= 0 ? "+" : "−"}
                      {s(Math.abs(g.gain))} ({pct1(g.gainPct)})
                    </span>
                  )}
                  {g.xirr != null && (
                    <span className="text-muted">
                      XIRR <b className={g.xirr >= 0 ? "text-gain-ink" : "text-loss-ink"}>{pct1(g.xirr)}</b>
                    </span>
                  )}
                </div>
                <span className="h-1.5 overflow-hidden rounded-full bg-tint-2">
                  <i className="block h-full rounded-full" style={{ width: `${(100 * g.value) / all.value}%`, background: b.color }} />
                </span>
                <span className="text-[12px] text-muted">{Math.round((100 * g.value) / all.value)}% of your Indian stocks</span>
              </>
            )}
          </Link>
        ))}
      </div>
      <Card>
        <CardHead title="All your stocks" note="Tap one for its purchases, XIRR worked out, 52-week range and whether to hold." />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by broker">
          {(
            [
              ["all", "All", c.items.length],
              ...per.filter((p) => p.g.items.length).map((p) => [p.b.id, p.b.name, p.g.items.length] as const),
              ...(other.items.length ? ([["other", "Other", other.items.length]] as const) : []),
            ] as [BrokerId | "all" | "other", string, number][]
          ).map(([k, l, cnt]) => (
            <button
              key={k}
              type="button"
              aria-pressed={f === k}
              onClick={() => setF(k)}
              className={cn(
                "btn min-h-9 px-3.5 text-[13.5px]",
                f === k && "bg-gain-wash text-lime shadow-[inset_0_0_0_1px_var(--color-lime-2)]",
              )}
            >
              {l}
              <b className="num opacity-70">{cnt}</b>
            </button>
          ))}
        </div>
        <HoldingsList c={c} items={shown} tag={f === "all" ? (it) => (it.india ? acctName(it.india.acct) : null) : undefined} />
        <HistNote />
      </Card>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <ProjectionCard c={c} />
        <Movers c={c} />
      </div>
    </>
  );
}

/** one broker's screen */
export function BrokerScreen({ id }: { id: BrokerId }) {
  const { model } = usePortfolio(),
    { m, s } = useMoney();
  const b = BROKERS.find((x) => x.id === id)!;
  const g = useMemo(() => group(model, brokerItems(model, id)), [model, id]);
  const c = model.cats.stocks;
  const n = model.months.length;
  const crumbs = (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13.5px] text-muted">
      <Link href="/stocks" className="text-muted no-underline hover:text-ink">
        Stocks
      </Link>
      <Icon name="chevron" className="size-3.5" />
      <span className="font-semibold text-ink">{b.name}</span>
    </nav>
  );
  if (!g.items.length)
    return (
      <>
        {crumbs}
        <Empty
          title={`Nothing at ${b.name} yet`}
          action={
            <Link href="/upload" className="btn btn-primary">
              <Icon name="upload" />
              Upload reports
            </Link>
          }
        >
          {b.note}
        </Empty>
      </>
    );
  const top = [...g.items].sort((x, y) => y.value - x.value);
  const big = top.slice(0, 6);
  const rest = top.slice(6).reduce((a, x) => a + x.value, 0);
  const PALETTE = ["#0e9f6e", "#0ea5e9", "#8b6cf6", "#e9468f", "#f59e0b", "#14b8a6", "#94a3b8"];
  const byType = (["stock", "etf", "invit"] as const)
    .map((t) => ({ t, v: g.items.filter((x) => x.india?.type === t).reduce((a, x) => a + x.value, 0) }))
    .filter((x) => x.v > 0);
  const sub = { ...c, items: g.items };
  return (
    <>
      {crumbs}
      <Summary
        badge={`${b.name} · Indian stocks`}
        color={b.color}
        title={<CountUp value={g.value} format={m} />}
        items={summaryItems(g, s)}
        chart={
          <ValueChart
            months={model.months}
            values={g.val}
            invested={g.inv}
            color={b.color}
            fmt={s}
            label={`${b.name}: value and money put in over the last ${n} months`}
            note={g.coverage < 0.995 ? `Holdings with purchase dates: ${Math.round(100 * g.coverage)}% of the value` : undefined}
          />
        }
      />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHead title={`Holdings at ${b.name}`} note="Tap one for its purchases, XIRR worked out, 52-week range and whether to hold." />
          <HoldingsList c={c} items={g.items} />
        </Card>
        <div className="grid gap-5">
          <Card>
            <CardHead title="Where the money sits" />
            <SplitBar
              parts={[
                ...big.map((x, i) => ({ name: x.name, value: x.value, color: PALETTE[i] })),
                ...(rest > 0 ? [{ name: `${top.length - 6} others`, value: rest, color: PALETTE[6] }] : []),
              ]}
            />
            {byType.length > 1 && (
              <p className="text-[13.5px] text-body">
                {byType
                  .map((x) => `${x.t === "etf" ? "ETFs" : x.t === "invit" ? "InvITs" : "Shares"} ${Math.round((100 * x.v) / g.value)}%`)
                  .join(" · ")}
              </p>
            )}
          </Card>
          <Movers c={sub} />
          <Card>
            <CardHead title="Where this comes from" />
            <p className="text-[14px] text-body">{b.note}</p>
            <Link href="/upload" className="btn justify-self-start">
              <Icon name="upload" />
              Upload a newer report
            </Link>
          </Card>
        </div>
      </div>
    </>
  );
}
