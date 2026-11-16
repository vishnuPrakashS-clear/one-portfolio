"use client";

/* The plan part of Portfolio health: your rules (how many funds and stocks, shares of each, company-size split,
   dividend goal) set by tapping chips, where this month's money goes, which funds and stocks to keep, build up or let
   go, the dividend plan, market leaders you don't own, and how your buys compare with the Nifty 50. */

import { useMemo, useState } from "react";
import { usePortfolio } from "@/components/providers/portfolio-provider";
import { useUi } from "@/components/providers/ui-provider";
import type { Analysis } from "@/lib/analysis";
import { makePlan, VERDICT_NAME, type Planner, type StockPlan, type Verdict } from "@/lib/planner";
import { PLAN_DIV, PLAN_MONTHLY, PLAN_RULES, PLAN_SPLIT } from "@/constants";
import { useMoney } from "@/lib/use-money";
import { pctf, qty } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MarketData } from "@/types/market";
import { Card, CardHead, Chip } from "@/components/sub/ui";
import { Chips } from "@/components/sub/chips";
import { Icon } from "@/components/sub/icon";

const CAP_WORD = { L: "Large", M: "Mid", S: "Small" } as const;
const k = (v: number) => (v >= 100000 ? `₹${+(v / 100000).toFixed(1)}L` : `₹${Math.round(v / 1000)}k`);
const VTONE: Record<Verdict, "good" | "wait" | "act"> = { add: "good", hold: "wait", watch: "wait", exit: "act" };

function Bar({ v, color }: { v: number; color: string }) {
  return (
    <span className="block h-2 overflow-hidden rounded-full bg-tint-2">
      <i className="block h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, v * 100))}%`, background: color }} />
    </span>
  );
}

export type Scope = "funds" | "stocks" | "all";
export function PlanCards({ A, D, scope = "all" }: { A: Analysis; D: MarketData; scope?: Scope }) {
  const { model, S, setPlan } = usePortfolio();
  const P = useMemo(() => (S ? makePlan(model, S, A, D) : null), [model, S, A, D]);
  if (!P) return null;
  return (
    <div id="plan" className="grid scroll-mt-24 gap-[inherit]">
      {scope === "all" && <Rules P={P} setPlan={setPlan} />}
      <ThisMonth P={P} scope={scope} />
      {scope === "funds" && <Funds P={P} />}
      {scope === "stocks" && (
        <>
          <Stocks P={P} />
          <Dividends P={P} />
          <Ideas P={P} />
        </>
      )}
      {scope !== "all" && <VsNifty P={P} scope={scope} />}
    </div>
  );
}

function Rules({ P, setPlan }: { P: Planner; setPlan: ReturnType<typeof usePortfolio>["setPlan"] }) {
  const { s } = useMoney();
  return (
    <Card>
      <CardHead
        title={
          <>
            <Icon name="sparkles" className="size-5 text-lime" />
            Your plan
          </>
        }
        note={`Your rules: at most ${PLAN_RULES.maxFunds} funds and ${PLAN_RULES.maxStocks} stocks, about ${PLAN_RULES.minQty} shares of each stock (or ₹${PLAN_RULES.maxPosition / 1000}k worth when 20 would cost more), a size split and a dividend goal. Tap to change; the plan below follows.`}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Chips
          label="Money you can add each month"
          items={PLAN_MONTHLY}
          value={P.prefs.monthly > 0 ? P.prefs.monthly : undefined}
          onPick={(v) => setPlan({ monthly: v === P.prefs.monthly ? 0 : v })}
          render={k}
        />
        <Chips
          label="Of that, into stocks"
          items={PLAN_SPLIT}
          value={P.prefs.stocks >= 0 ? P.prefs.stocks : undefined}
          onPick={(v) => setPlan({ stocks: v === P.prefs.stocks ? -1 : v })}
          render={(v) => `${Math.round(v * 100)}%`}
          sub={(v) => `${Math.round((1 - v) * 100)}% funds`}
        />
        <Chips
          label="Large / mid / small split"
          items={["equal", "balanced"] as ("equal" | "balanced")[]}
          value={P.prefs.mix}
          onPick={(v) => setPlan({ mix: v })}
          render={(v) => (v === "equal" ? "Equal thirds" : "55 / 25 / 20")}
          sub={(v) => (v === "equal" ? "more growth, bigger swings" : "steadier")}
        />
        <Chips label="Dividends a year" items={PLAN_DIV} value={P.prefs.div} onPick={(v) => setPlan({ div: v })} render={k} />
      </div>
      <p className="note">
        {P.monthlyFrom === "chosen"
          ? `Planning ${s(P.monthly)} a month, ${Math.round(P.stockShare * 100)}% into stocks.`
          : P.monthlyFrom === "statements"
            ? `Planning ${s(P.monthly)} a month, what your statements show you've been adding (${Math.round(P.stockShare * 100)}% into stocks). Tap an amount to change it.`
            : `Your statements don't show steady monthly buying, so this plans ${s(P.monthly)} a month. Tap an amount to change it.`}
      </p>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {P.rules.map((r) => (
          <li key={r.key} className="well grid content-start gap-1.5 p-4">
            <div className="flex items-center justify-between gap-2">
              <b className="text-ink">{r.label}</b>
              <Chip tone={r.ok ? "good" : "wait"}>{r.ok ? "On track" : "Not yet"}</Chip>
            </div>
            <div className="num flex flex-wrap items-baseline gap-x-2 font-display">
              <span className="text-[20px] font-bold text-ink">{r.now}</span>
              <span className="text-[13px] text-muted">goal {r.goal}</span>
            </div>
            <p className="note">{r.note}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ThisMonth({ P, scope }: { P: Planner; scope: Scope }) {
  const { s, m } = useMoney();
  const fundsIn = P.funds.keep.filter((x) => x.monthly > 0);
  const stockBudget = Math.round(P.monthly * P.stockShare);
  const capShort = (["L", "M", "S"] as const).filter((c) => P.caps.need[c] > 1000);
  return (
    <Card>
      <CardHead
        title="Where this month's money goes"
        note="Worked out again every time you upload: towards the company sizes you're short of, building up strong stocks to their target size, and a cushion of debt and gold if you have under 10%. No selling needed."
      />
      <div className={cn("grid gap-4", scope === "all" && "lg:grid-cols-2")}>
        {scope !== "stocks" && (
          <div className="well grid content-start gap-3 p-4">
            <div className="flex items-baseline justify-between gap-2">
              <b className="text-ink">Funds</b>
              <span className="num font-display font-bold text-ink">{s(P.funds.budget)}</span>
            </div>
            {P.funds.add.length > 0 && (
              <ul className="grid gap-2.5">
                {P.funds.add.map((x) => (
                  <li key={x.label} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3">
                    <span className="min-w-0">
                      <b className="block font-semibold text-ink">
                        {x.label} <Chip className="ml-1 align-middle">new</Chip>
                      </b>
                      <span className="block text-[13px] text-muted">{x.note}</span>
                    </span>
                    <b className="num text-ink">{m(x.monthly)}</b>
                  </li>
                ))}
              </ul>
            )}
            {fundsIn.length ? (
              <ul className="grid gap-2.5">
                {fundsIn.map((x) => (
                  <li key={x.f.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3">
                    <span className="min-w-0">
                      <b className="block truncate font-semibold text-ink">{x.f.short}</b>
                      <span className="block text-[13px] text-muted">{x.note}</span>
                    </span>
                    <b className="num text-ink">{m(x.monthly)}</b>
                  </li>
                ))}
              </ul>
            ) : P.funds.add.length ? null : (
              <p className="note">Nothing set aside for funds this month.</p>
            )}
          </div>
        )}
        {scope !== "funds" && (
          <div className="well grid content-start gap-3 p-4">
            <div className="flex items-baseline justify-between gap-2">
              <b className="text-ink">Stocks</b>
              <span className="num font-display font-bold text-ink">{s(stockBudget)}</span>
            </div>
            {P.buys.length ? (
              <ul className="grid gap-2.5">
                {P.buys.map((b) => (
                  <li key={b.isin} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3">
                    <span className="min-w-0">
                      <b className="block truncate font-semibold text-ink">
                        {b.name} {b.isNew && <Chip className="ml-1 align-middle">new</Chip>}
                      </b>
                      <span className="num block text-[13px] text-muted">
                        {qty(b.qty)} × about {m(b.price)} · {b.why}
                      </span>
                    </span>
                    <b className="num text-ink">{m(b.cost)}</b>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="note">
                {stockBudget > 0
                  ? "No stock here is both strong and fairly priced right now; let this month's stock money go to funds."
                  : "No money set aside for stocks."}
              </p>
            )}
            {P.buys.length > 0 && stockBudget - P.buysCost > 200 && (
              <p className="note">About {m(stockBudget - P.buysCost)} left over: carry it to next month.</p>
            )}
          </div>
        )}
      </div>
      <div className="grid gap-2 text-[14.5px] text-body">
        {scope !== "funds" && P.fill.stocks > 0 && (
          <p>
            Bringing all {P.fill.stocks} stocks you keep up to their target size takes about <b className="text-ink">{s(P.fill.cost)}</b>
            {P.fill.months ? (
              <>
                {" "}
                — around{" "}
                <b className="text-ink">
                  {P.fill.months} month{P.fill.months === 1 ? "" : "s"}
                </b>{" "}
                at {s(stockBudget)} a month
              </>
            ) : null}
            . Letting the weak ones go (below) frees money for this and gets there sooner.
          </p>
        )}
        {scope === "all" && capShort.length > 0 && (
          <p>
            To reach your {P.prefs.mix === "equal" ? "equal" : "55 / 25 / 20"} split without selling, you need about{" "}
            {capShort.map((c, i) => (
              <span key={c}>
                {i ? " and " : ""}
                <b className="text-ink">{s(P.caps.need[c])}</b> more in {CAP_WORD[c].toLowerCase()} companies
              </span>
            ))}
            {P.caps.months ? ` — about ${P.caps.months} months of your monthly money` : ""}. Funds are the easier way to own small
            companies; one small company can halve.
          </p>
        )}
      </div>
    </Card>
  );
}

function Funds({ P }: { P: Planner }) {
  const { s } = useMoney();
  const { openItem } = useUi();
  return (
    <Card>
      <CardHead
        title={`Funds: keep ${P.funds.keep.length}, let ${P.funds.drop.length} go`}
        note={`One fund for each job, the better of any two that hold mostly the same stocks, none that have trailed their kind for years, and no more than ${PLAN_RULES.maxFunds} in all.`}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="grid content-start gap-2">
          <span className="kicker">Keep</span>
          <ul className="grid gap-1">
            {P.funds.keep.map((x) => (
              <li key={x.f.id}>
                <button
                  type="button"
                  onClick={() => openItem("funds", x.f.id)}
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 rounded-xl px-3 py-2 text-left hover:bg-tint"
                >
                  <span className="min-w-0">
                    <b className="block truncate font-semibold text-ink">{x.f.short}</b>
                    <span className="block truncate text-[13px] text-muted">{x.kind.split(":")[0]}</span>
                  </span>
                  <span className="num text-right font-semibold">{s(x.f.value)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="grid content-start gap-2">
          <span className="kicker">Let go</span>
          {P.funds.drop.length ? (
            <ul className="grid gap-1">
              {P.funds.drop.map((x) => (
                <li key={x.f.id}>
                  <button
                    type="button"
                    onClick={() => openItem("funds", x.f.id)}
                    className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 rounded-xl px-3 py-2 text-left hover:bg-tint"
                  >
                    <span className="min-w-0">
                      <b className="block truncate font-semibold text-ink">{x.f.short}</b>
                      <span className="block text-[13px] text-muted">{x.why}</span>
                    </span>
                    <span className="num text-right font-semibold">{s(x.f.value)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="note">Nothing to let go.</p>
          )}
        </div>
      </div>
      <p className="note">
        How to let a fund go: stop its SIP first. Move the money once each purchase is over a year old (gains then count as long-term: the
        first ₹1.25 lakh a year is tax-free, then 12.5%, against 20% before a year) and after any exit load. ELSS units stay until their
        3-year lock-in ends.
      </p>
    </Card>
  );
}

function StockList({ rows, onOpen }: { rows: StockPlan[]; onOpen: (r: StockPlan) => void }) {
  const { m } = useMoney();
  return (
    <ul className="grid gap-1">
      {rows.map((r) => {
        const vsAvg = r.avg ? r.price / r.avg - 1 : null;
        return (
          <li key={r.isin}>
            <button
              type="button"
              onClick={() => onOpen(r)}
              className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 rounded-xl px-3 py-2 text-left hover:bg-tint"
            >
              <b className="truncate font-semibold text-ink">{r.name}</b>
              <span className="num text-right font-semibold">{m(r.value)}</span>
              <span className="text-[13px] text-muted">
                {CAP_WORD[r.cap as "L"] || "Size unknown"} · {qty(r.qty)}
                {r.short > 0 ? ` of ${r.target}` : ""} shares{r.yield ? ` · yields ${(r.yield * 100).toFixed(1)}%` : ""}
              </span>
              <span
                className={cn("num text-right text-[13px]", vsAvg == null ? "text-muted" : vsAvg >= 0 ? "text-gain-ink" : "text-loss-ink")}
              >
                {vsAvg == null ? "" : `${pctf(vsAvg)} vs avg`}
              </span>
              <span className="col-span-2 text-[13px] text-body">{r.why}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Stocks({ P }: { P: Planner }) {
  const { openItem } = useUi();
  const [open, setOpen] = useState<Verdict | null>(null);
  const groups = (["add", "hold", "watch", "exit"] as Verdict[])
    .map((v) => ({ v, rows: P.stocks.filter((s) => s.verdict === v) }))
    .filter((g) => g.rows.length);
  const below = P.stocks.filter((s) => s.avg && s.price < s.avg * 0.9);
  return (
    <Card>
      <CardHead
        title="Stocks: build up, hold or let go"
        note="Judged on the business (return on equity, debt, losses, price against its industry), not on what you paid. Tap a stock for its numbers, 52-week range and break-even time."
      />
      {below.length > 0 && (
        <div className="well grid gap-2 p-4 text-[14.5px] text-body">
          <b className="text-ink">
            {below.length} stock{below.length === 1 ? " is" : "s are"} 10% or more below your average price
          </b>
          <p>
            Waiting to break even only makes sense for a business you&apos;d buy fresh today: for those (marked Build up or Hold), holding
            is fine, and buying more lowers your average. For the weak ones (Let go), selling books a loss that cuts your tax on gains this
            year, and the money can recover faster in a stronger company. Your average price doesn&apos;t change what the stock does next.
          </p>
        </div>
      )}
      <div className="grid gap-3">
        {groups.map((g) => (
          <div key={g.v} className="grid gap-2">
            <button
              type="button"
              onClick={() => setOpen(open === g.v ? null : g.v)}
              className="flex items-center justify-between gap-3 rounded-xl px-1 py-1 text-left"
              aria-expanded={open === g.v}
            >
              <span className="flex items-center gap-2">
                <Chip tone={VTONE[g.v]}>{VERDICT_NAME[g.v]}</Chip>
                <b className="text-ink">
                  {g.rows.length} stock{g.rows.length === 1 ? "" : "s"}
                </b>
              </span>
              <span className="text-[13px] text-muted">{open === g.v ? "Hide" : "Show"}</span>
            </button>
            {open === g.v && <StockList rows={g.rows} onOpen={(r) => openItem("stocks", r.ids[0])} />}
          </div>
        ))}
      </div>
    </Card>
  );
}

function Dividends({ P }: { P: Planner }) {
  const { s, m } = useMoney();
  const d = P.dividend;
  const top = P.stocks
    .filter((x) => x.divYear > 0)
    .sort((a, b) => b.divYear - a.divYear)
    .slice(0, 5);
  return (
    <Card>
      <CardHead
        title={`Dividends: about ${m(d.now)} of ${m(d.goal)} a year`}
        note="Estimated from each company's payouts over the last year (its dividend yield) on what you hold today. Companies cut dividends in bad years, so this is a guide, not a promise."
      />
      <Bar v={d.goal ? d.now / d.goal : 0} color="var(--color-lime-2)" />
      {top.length > 0 && (
        <p className="text-[14.5px] text-body">Most of it comes from {top.map((x) => `${x.name} (${m(x.divYear)})`).join(", ")}.</p>
      )}
      {d.gap > 0 && d.picks.length > 0 ? (
        <>
          <p className="text-[14.5px] text-body">
            To close the {m(d.gap)} gap, about <b className="text-ink">{s(d.capital)}</b> spread over steady payers with good business
            numbers:
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {d.picks.map((p) => (
              <li key={p.isin} className="well grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 p-3.5">
                <span className="min-w-0">
                  <b className="block truncate font-semibold text-ink">{p.name}</b>
                  <span className="block text-[13px] text-muted">
                    yields {(p.yield * 100).toFixed(1)}% · {p.held ? "you hold it" : "you don't hold it yet"}
                  </span>
                </span>
                <span className="num text-right">
                  <b className="block text-ink">{s(p.amount)}</b>
                  <span className="text-[13px] text-gain-ink">≈ {m(p.gives)} a year</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : d.gap <= 0 ? (
        <p className="text-[14.5px] text-body">You&apos;re at your goal already.</p>
      ) : (
        <p className="note">No strong, fairly priced dividend payer stands out right now.</p>
      )}
      <p className="note">
        Dividends are added to your income and taxed at your slab rate (TDS above ₹10,000 a year from one company). A high yield is often a
        warning: the price fell because profits are under pressure. Growth in the share price usually matters more than the dividend.
      </p>
    </Card>
  );
}

function Ideas({ P }: { P: Planner }) {
  const [all, setAll] = useState(false);
  const { m } = useMoney();
  const fair = P.ideas.filter((i) => i.status === "fair");
  const rows = all ? P.ideas : fair.length ? fair : P.ideas.slice(0, 6);
  if (!P.ideas.length) return null;
  const ST = { fair: ["Fair price", "good"], pricey: ["Pricey now", "wait"], weak: ["Weak numbers", "act"] } as const;
  return (
    <Card>
      <CardHead
        title="Market leaders you don't own"
        note="Companies that are the only player, one of two, or a clear No. 1 in what they do. A strong position isn't a reason to buy at any price, so each is checked: return on equity, debt, losses, and P/E against its industry today."
      />
      <ul className="grid gap-2 md:grid-cols-2">
        {rows.map((i) => (
          <li key={i.isin} className="well grid gap-1.5 p-4">
            <div className="flex items-start justify-between gap-2">
              <b className="font-display text-[16px] leading-snug text-ink">
                {i.name} <span className="text-[13px] font-normal text-muted">{i.sym}</span>
              </b>
              <Chip tone={ST[i.status][1]}>{ST[i.status][0]}</Chip>
            </div>
            <p className="text-[14px] text-body">{i.why}</p>
            <p className="num text-[13px] text-muted">
              {CAP_WORD[i.cap as "L"] || ""} · P/E {i.info.pe?.toFixed(0) ?? "—"} vs {i.info.ipe?.toFixed(0) ?? "—"} for its industry · ROE{" "}
              {i.info.roe?.toFixed(0) ?? "—"}%{i.yield ? ` · yields ${(i.yield * 100).toFixed(1)}%` : ""}
              {i.price
                ? ` · about ${m(i.price)} a share, ${m(i.price * Math.min(20, Math.max(1, Math.floor(PLAN_RULES.maxPosition / i.price))))} for ${Math.min(20, Math.max(1, Math.floor(PLAN_RULES.maxPosition / i.price)))}`
                : ""}
            </p>
            {i.scores.flags.length > 0 && <p className="text-[13px] text-loss-ink">! {i.scores.flags.join(" · ")}</p>}
          </li>
        ))}
      </ul>
      {P.ideas.length > rows.length || all ? (
        <div>
          <button type="button" className="btn" onClick={() => setAll(!all)}>
            {all ? "Show the fairly priced ones" : `Show all ${P.ideas.length}`}
          </button>
        </div>
      ) : null}
      <p className="note">
        Ideas to look into, not tips: the price is worked out from P/E × earnings per share, so check the live price before buying, and buy
        in a few steps rather than all at once.
      </p>
    </Card>
  );
}

function VsNifty({ P, scope }: { P: Planner; scope: Scope }) {
  const { m } = useMoney();
  const rows = (
    [
      ["Your stocks", P.vs.stocks],
      ["Your equity funds", P.vs.funds],
    ] as const
  ).filter(([k]) => scope === "all" || (scope === "stocks" ? k === "Your stocks" : k === "Your equity funds"));
  const any = rows.some(([, v]) => v && v.xirr != null && v.ixXirr != null);
  return (
    <Card>
      <CardHead
        title="Beating the Nifty 50"
        note="Each purchase you still hold, against the same money put in a Nifty 50 index fund on the same day. This is the bar every stock pick and active fund has to clear."
      />
      {any ? (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map(([label, v]) =>
            v && v.xirr != null && v.ixXirr != null ? (
              <div key={label} className="well grid gap-1.5 p-4">
                <b className="text-ink">{label}</b>
                <div className="num grid grid-cols-2 gap-3">
                  <span>
                    <small className="block text-[12.5px] text-muted">Yours</small>
                    <b className={cn("font-display text-[20px]", v.xirr >= v.ixXirr ? "text-gain-ink" : "text-loss-ink")}>{pctf(v.xirr)}</b>
                    <small className="block text-[12.5px] text-muted">a year · {m(v.value)}</small>
                  </span>
                  <span>
                    <small className="block text-[12.5px] text-muted">Nifty 50</small>
                    <b className="font-display text-[20px] text-ink">{pctf(v.ixXirr)}</b>
                    <small className="block text-[12.5px] text-muted">a year · {m(v.ixValue)}</small>
                  </span>
                </div>
                <p className="note">
                  {v.buys} purchases since {v.from.slice(0, 4)}, {m(v.invested)} in all. {v.value >= v.ixValue ? "Ahead" : "Behind"} by{" "}
                  {m(Math.abs(v.value - v.ixValue))}.
                </p>
              </div>
            ) : null,
          )}
        </div>
      ) : (
        <p className="note">
          Needs dated purchases from your broker&apos;s order history and the Nifty 50 series, which is fetched overnight.
        </p>
      )}
      <div className="well grid gap-2 p-4 text-[14.5px] text-body">
        <b className="text-ink">What tends to beat the index over time</b>
        <ul className="grid list-disc gap-1.5 pl-5">
          <li>
            A low-cost core: most of your money in a few index or proven funds; most active funds trail their index over 10 years once costs
            are counted.
          </li>
          <li>
            Fewer, bigger, better stocks: 20–30 strong businesses you understand, each big enough to matter, instead of many one-share bets.
          </li>
          <li>
            Buy quality at fair prices (P/E near or below its industry), add on falls rather than after big runs, and let go of businesses
            that weaken.
          </li>
          <li>
            Mid and small companies have grown faster over long periods but fall harder: hold them for 7+ years and mostly through funds.
          </li>
          <li>Keep adding every month and stay invested; missing a few of the best days does more damage than any single bad pick.</li>
        </ul>
      </div>
    </Card>
  );
}
