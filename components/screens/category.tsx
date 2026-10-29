"use client";

import Link from "next/link";
import { useState } from "react";
import { usePortfolio } from "@/components/providers/portfolio-provider";
import { useUi } from "@/components/providers/ui-provider";
import { CATEGORIES, type CatId } from "@/constants";
import { indHoldings } from "@/lib/core/india";
import { holdingRows } from "@/lib/core/abroad";
import { fmtDate } from "@/lib/dates";
import { pct1, pctf, sgn, tk } from "@/lib/format";
import { useMoney } from "@/lib/use-money";
import { Card, CardHead, Chip, GainPill, Hero, Pill, Stat, StatGrid } from "@/components/sub/ui";
import { CountUp } from "@/components/sub/count-up";
import { Legend, LineChart } from "@/components/sub/charts";
import { FundMix, HoldingsList, Movers, ProjectionCard } from "@/components/sub/category-parts";
import { BondCard } from "@/components/sub/india-cards";
import { Icon } from "@/components/sub/icon";
import { HistNote } from "./home";
import { cn } from "@/lib/utils";

const EMPTY: Record<CatId, string> = {
  funds: "Your mutual funds appear here from your CDSL or NSDL statement (CAS). Groww and Zerodha reports add buy prices and SIP dates.",
  stocks: "Your shares, ETFs and InvITs appear here from your CDSL or NSDL statement (CAS). Broker holdings reports add buy prices.",
  bonds:
    "Bonds and NCDs appear here from your CAS. A Wint Wealth master report or IndiaBonds statements add the price paid and every payout.",
  abroad: "Your US, Japan and London funds appear here once your INDmoney Transactions Report and Holdings Report are uploaded.",
};

/** the abroad sleeve's table: plan, units, cost, price, gain, long-term dates and what to do with each */
function AbroadTable() {
  const { S } = usePortfolio(),
    { d } = useMoney(),
    { openItem } = useUi();
  const [f, setF] = useState<"all" | "sell" | "wait" | "keep">("all");
  if (!S) return null;
  const order = { core: 0, keep: 1, legacy: 2 },
    rows = holdingRows(S).sort((a, b) => order[a.plan] - order[b.plan] || b.value - a.value);
  const fk = (r: (typeof rows)[number]) => (r.action.tone === "act" ? "sell" : r.action.tone === "wait" ? "wait" : "keep");
  const cnt = {
    all: rows.length,
    sell: rows.filter((r) => fk(r) === "sell").length,
    wait: rows.filter((r) => fk(r) === "wait").length,
    keep: rows.filter((r) => fk(r) === "keep").length,
  };
  const PLAN = { core: ["good", "In plan"], keep: ["neutral", "Hold"], legacy: ["wait", "Exit later"] } as const;
  return (
    <Card>
      <CardHead
        title="Every holding abroad"
        note="What to do with each one. Long-term from: the first day a sale counts as long-term (held more than 24 months, taxed at 12.5%)."
      />
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter holdings">
        {(
          [
            ["all", "All"],
            ["sell", "Sell now"],
            ["wait", "Wait for 12.5% date"],
            ["keep", "Keep"],
          ] as const
        )
          .filter(([k]) => cnt[k] || k === "all")
          .map(([k, l]) => (
            <button
              key={k}
              type="button"
              aria-pressed={f === k}
              onClick={() => setF(k)}
              className={cn("btn min-h-9 px-3.5 text-[13.5px]", f === k && "bg-ink text-space hover:bg-ink")}
            >
              {l}
              <b className="num opacity-70">{cnt[k]}</b>
            </button>
          ))}
      </div>
      <div className="-mx-2 overflow-x-auto px-2 max-sm:mx-0 max-sm:px-0">
        <table className="stack">
          <thead>
            <tr>
              <th>Holding</th>
              <th>Plan</th>
              <th className="text-right">Value</th>
              <th className="text-right">Gain</th>
              <th>Long-term from</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows
              .filter((r) => f === "all" || fk(r) === f)
              .map((r) => (
                <tr key={r.sym} className="cursor-pointer hover:bg-white/5" onClick={() => openItem("abroad", r.sym)}>
                  <td className="stack-full">
                    <b className="font-semibold">{tk(r.sym)}</b>
                    <span className="block max-w-[30ch] text-[12.5px] text-muted max-sm:max-w-none">
                      {r.name}
                      {r.sym.startsWith("LSE~") ? " · London" : ""}
                    </span>
                  </td>
                  <td data-label="Plan">
                    <Chip tone={PLAN[r.plan][0] as "good" | "neutral" | "wait"}>{PLAN[r.plan][1]}</Chip>
                  </td>
                  <td data-label="Value" className="num text-right">
                    {d(r.value)}
                  </td>
                  <td data-label="Gain" className={cn("num text-right", r.gain >= 0 ? "text-gain" : "text-loss")}>
                    {sgn(r.gain)}
                    {d(Math.abs(r.gain))}
                    <span className="block text-[12.5px] text-muted">{pctf(r.pct)}</span>
                  </td>
                  <td data-label="Long-term from" className="num whitespace-nowrap">
                    {fmtDate(r.firstLT)}
                    {r.lots.length > 1 && r.lastLT !== r.firstLT ? (
                      <span className="block text-[12.5px] text-muted">to {fmtDate(r.lastLT)}</span>
                    ) : null}
                  </td>
                  <td data-label="Action">
                    <Chip tone={r.action.tone} title={r.action.why}>
                      {r.action.label}
                    </Chip>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function CategoryScreen({ id }: { id: CatId }) {
  const { model, S } = usePortfolio(),
    { m, s } = useMoney();
  const c = model.cats[id],
    cat = CATEGORIES[id],
    n = model.months.length;
  if (!c.items.length) {
    return (
      <>
        <Hero badge={cat.name} color={cat.hex} title={`No ${cat.name.toLowerCase()} yet`} big={false} compact>
          <p className="max-w-[60ch] text-[16.5px] text-body">{EMPTY[id]}</p>
          <div>
            <Link href="/upload" className="btn btn-primary">
              <Icon name="upload" />
              Upload reports
            </Link>
          </div>
        </Hero>
      </>
    );
  }
  const last = c.val[n - 1],
    prev = c.val[n - 2],
    putIn = c.inv[n - 1] - c.inv[n - 2],
    move = last - prev - putIn;
  const I = S?.india,
    H = I ? indHoldings(I) : [];
  const extras = id === "funds" ? <FundMix c={c} /> : id === "stocks" ? <Movers c={c} /> : null;
  return (
    <>
      <Hero
        badge={`${cat.name} · ${c.items.length} holding${c.items.length === 1 ? "" : "s"}`}
        color={cat.hex}
        compact
        title={<CountUp value={c.value} format={m} />}
      >
        <div className="flex max-w-[640px] flex-wrap gap-2">
          <GainPill gain={c.gain} pct={c.gainPct} base={c.cost} s={s} />
          {c.xirr != null && (
            <Pill>
              {pct1(c.xirr)} a year since {fmtDate(c.since)}
            </Pill>
          )}
          <Pill>{c.sip ? `${m(c.sip)} a month` : "No regular monthly buying found"}</Pill>
          {id === "abroad" && (
            <Link href="/plan" className="pill text-ink no-underline hover:bg-white/12">
              This month&apos;s buys →
            </Link>
          )}
        </div>
      </Hero>
      <StatGrid>
        <Stat k="Value" v={s(c.value)} />
        <Stat
          k="Put in"
          v={c.cost ? s(c.cost) : "—"}
          s={c.known < c.value - 1 ? `buy price known for ${Math.round((100 * c.known) / c.value)}%` : undefined}
        />
        <Stat
          k="Gain"
          v={c.gain != null ? `${c.gain >= 0 ? "+" : "−"}${s(Math.abs(c.gain))}` : "—"}
          s={c.gainPct != null ? pct1(c.gainPct) : undefined}
          tone={c.gain == null ? "" : c.gain >= 0 ? "pos" : "neg"}
        />
        <Stat
          k="This month"
          v={`${move >= 0 ? "+" : "−"}${s(Math.abs(move))}`}
          s="market move, besides money added"
          tone={move >= 0 ? "pos" : "neg"}
        />
      </StatGrid>
      <Card>
        <CardHead
          title={`Growth over the last ${n} months`}
          note={
            <>
              Value of{" "}
              {c.coverage < 0.995
                ? `the holdings with purchase dates (${Math.round(100 * c.coverage)}% of ${cat.name.toLowerCase()})`
                : `your ${cat.name.toLowerCase()}`}{" "}
              at each month end, against the money put in (dashed).
              {id === "bonds" ? " Bonds are shown at the price you paid; their interest arrives as payouts below." : ""}
              {id === "abroad" ? " In rupees at INDmoney's rate on each date." : ""}
            </>
          }
        />
        {c.covered > 0 ? (
          <LineChart
            months={model.months}
            values={c.val}
            invested={c.inv}
            color={cat.hex}
            fmt={s}
            label={`${cat.name}: value and money put in over the last ${n} months`}
          />
        ) : (
          <p className="note">
            No purchase dates yet, so the growth line can&apos;t be drawn.{" "}
            <Link href="/upload" className="font-semibold text-ink underline">
              Upload an order history
            </Link>{" "}
            to fill it in.
          </p>
        )}
        {c.covered > 0 && (
          <Legend
            items={[
              { name: "Value", color: cat.hex },
              { name: "Money put in", dashed: true },
            ]}
          />
        )}
        <HistNote />
      </Card>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div className="grid gap-5">
          <ProjectionCard c={c} />
          {extras}
        </div>
        <Card delay={0.05}>
          <CardHead
            title={`Your ${cat.name.toLowerCase()}`}
            note="Largest first. Each one is a moon of this planet. Tap one for its purchases, returns and tax."
          />
          <HoldingsList c={c} />
        </Card>
      </div>
      {id === "bonds" && I && <BondCard H={H} I={I} />}
      {id === "abroad" && <AbroadTable />}
    </>
  );
}
