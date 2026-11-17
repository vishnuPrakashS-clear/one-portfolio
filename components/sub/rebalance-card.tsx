"use client";

import { useState } from "react";
import { usePortfolio } from "@/components/providers/portfolio-provider";
import { BUCKET_COLOR } from "@/constants";
import { CATALOG, taxRates } from "@/lib/core/abroad";
import { rebalancePlan, type SellMode, type SellOrder } from "@/lib/core/rebalance";
import { fmtDate } from "@/lib/dates";
import { inr, tk } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card, CardHead, Chip } from "./ui";
import { Icon } from "./icon";

const $ = (v: number, dp = 2) =>
  (v < 0 ? "−" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
const units = (q: number) => (q >= 1 ? q.toFixed(3) : q.toFixed(4)).replace(/\.?0+$/, "");
const signInr = (v: number) => (v < 0 ? "−" : "+") + inr(Math.abs(Math.round(v)));

function Chips<T extends string | number>({ v, set, opts }: { v: T; set: (x: T) => void; opts: [T, string][] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {opts.map(([k, l]) => (
        <button
          key={String(k)}
          type="button"
          aria-pressed={v === k}
          onClick={() => set(k)}
          className={cn(
            "rounded-full px-3.5 py-1.5 text-[13.5px] font-semibold transition active:scale-95",
            v === k ? "bg-act-a text-on-act" : "bg-tint text-body hover:shadow-[inset_0_0_0_2px_var(--color-act-a)]",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function Order({ o, onPrice, base }: { o: SellOrder; onPrice: (p: number | null) => void; base: number }) {
  const gain = o.gainLT + o.gainST,
    moved = Math.abs(o.price - base) > 1e-6;
  const step = (k: number) => onPrice(+(o.price * (1 + k)).toFixed(2));
  return (
    <li className="grid gap-3 rounded-[16px] bg-tint p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <span className="kicker">
            {o.bucket} ·{" "}
            {o.plan === "legacy" ? "old holding, exiting anyway" : o.plan === "keep" ? "held, not bought any more" : "plan fund"}
          </span>
          <b className="block font-display text-[19px] text-ink">
            Sell {units(o.qty)} of {tk(o.sym)}{" "}
            <span className="text-[14px] font-normal text-muted">
              of {units(o.held)} held · {CATALOG[o.sym]?.name || ""}
            </span>
          </b>
        </div>
        <Chip tone={gain >= 0 ? "good" : "wait"}>{gain >= 0 ? `Gain ${signInr(gain)}` : `Loss ${signInr(gain)}`}</Chip>
      </div>
      <div className="grid grid-cols-3 gap-2 max-sm:grid-cols-1">
        <div className="rounded-[12px] bg-card p-3 shadow-[inset_0_0_0_2px_var(--color-act-a)]">
          <span className="kicker block">Limit sell at</span>
          <b className="num font-display text-[22px] text-ink">{$(o.limit)}</b>
          <span className="block text-[12.5px] text-muted">≈ {$(o.qty * o.limit)} in all</span>
        </div>
        <div className="rounded-[12px] bg-card p-3">
          <span className="kicker block">No-loss price</span>
          <b className="num font-display text-[19px] text-ink">{$(o.breakeven)}</b>
          <span className="block text-[12.5px] text-muted">below this the sale is a rupee loss</span>
        </div>
        <div className="rounded-[12px] bg-card p-3">
          <span className="kicker block">Price used</span>
          <span className="flex items-center gap-1.5">
            <button type="button" className="btn size-8 min-h-0 p-0" aria-label="2% lower" onClick={() => step(-0.02)}>
              −
            </button>
            <b className="num font-display text-[19px] text-ink">{$(o.price)}</b>
            <button type="button" className="btn size-8 min-h-0 p-0" aria-label="2% higher" onClick={() => step(0.02)}>
              +
            </button>
          </span>
          <span className="block text-[12.5px] text-muted">
            {moved ? (
              <button type="button" className="font-semibold text-act-a" onClick={() => onPrice(null)}>
                back to {$(base)}
              </button>
            ) : (
              `last price${o.priceAt ? `, ${fmtDate(o.priceAt)}` : ""}`
            )}
          </span>
        </div>
      </div>
      <ul className="grid gap-1 text-[13.5px] text-body">
        {o.chunks.map((c, i) => (
          <li key={i} className="flex flex-wrap justify-between gap-x-3">
            <span>
              {units(c.q)} bought {fmtDate(c.d)} at {$(c.p)} ·{" "}
              {c.isLT ? <span className="text-gain-ink">long-term (12.5%)</span> : <span>short-term until {fmtDate(c.ltd)}</span>}
            </span>
            <span className={cn("num", c.gain >= 0 ? "text-gain-ink" : "text-loss-ink")}>{signInr(c.gain)}</span>
          </li>
        ))}
      </ul>
      {o.waitTo && o.waitSaves > 50 && (
        <p className="rounded-[12px] bg-card px-3 py-2 text-[13.5px] text-body">
          <Icon name="clock" className="mr-1 inline size-4 text-warn" />
          Part of this is short-term. Waiting until <b className="text-ink">{fmtDate(o.waitTo)}</b> saves about{" "}
          <b className="text-ink">{inr(Math.round(o.waitSaves))}</b> in tax.
        </p>
      )}
    </li>
  );
}

/** rebalance the abroad sleeve: what's off target, what to sell (FIFO, tax-aware), at what limit price, and where the money goes */
export function RebalanceCard({ live }: { live?: { prices: Record<string, number>; fx: number } | null }) {
  const { S } = usePortfolio();
  const [share, setShare] = useState(1),
    [mode, setMode] = useState<SellMode>("no-loss"),
    [prices, setPrices] = useState<Record<string, number>>({});
  if (!S) return null;
  const P = rebalancePlan(S, { share, mode, prices: { ...(live?.prices || {}), ...prices }, fx: live?.fx }),
    r = taxRates(S.settings),
    over = P.buckets.filter((b) => b.gap > 1);
  const base = (sym: string) => live?.prices[sym] ?? S.holdings.find((h) => h.sym === sym)?.price ?? 0;
  const usdMonth = (S.settings.monthlyInr / S.settings.fx) * (1 - (S.settings.feePct || 0) / 100);
  return (
    <Card id="rebalance" className="scroll-mt-24">
      <CardHead
        title="Rebalance: sell or wait?"
        note="What is above its target, what to sell to bring it back, the limit price to use, and the Indian tax. Nothing is placed for you: use these numbers on INDmoney."
      />
      <div className="grid gap-2">
        {P.buckets
          .filter((b) => b.w > 0 || b.value > 0)
          .map((b) => (
            <div
              key={b.bucket}
              className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-3 text-[14px] max-sm:grid-cols-[5rem_minmax(0,1fr)_auto]"
            >
              <span className="truncate font-semibold text-ink">{b.bucket}</span>
              <span className="relative h-3 rounded-full bg-tint" aria-hidden>
                <i
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ width: `${Math.min(100, b.pct * 2)}%`, background: BUCKET_COLOR[b.bucket] }}
                />
                <i className="absolute -inset-y-1 w-0.5 rounded bg-ink" style={{ left: `${Math.min(100, b.w * 2)}%` }} title="target" />
              </span>
              <span
                className={cn(
                  "num w-44 text-right whitespace-nowrap max-sm:w-auto max-sm:text-[12.5px]",
                  b.gap > 1 ? "font-semibold text-loss-ink" : b.gap < -1 ? "text-body" : "text-gain-ink",
                )}
              >
                {b.pct.toFixed(0)}% / {b.w}% · {b.gap > 1 ? `${$(b.gap, 0)} over` : b.gap < -1 ? `${$(-b.gap, 0)} under` : "on target"}
              </span>
            </div>
          ))}
        <p className="text-[12.5px] text-muted">Bar: share now (scale 0–50%). Line: target.</p>
      </div>

      {!over.length ? (
        <p className="well p-4 text-body">Everything is within a dollar of its target. Nothing to sell.</p>
      ) : (
        <>
          <div
            className={cn(
              "flex flex-wrap items-center gap-3 rounded-[16px] p-4",
              P.months != null && P.months <= 6 ? "bg-gain-wash" : "bg-tint",
            )}
          >
            <Icon name="calendar" className="size-6 shrink-0 text-act-a" />
            <p className="min-w-0 flex-1 text-[14.5px] text-body">
              <b className="text-ink">Option 1: don&apos;t sell, steer new money.</b> Every month your {$(usdMonth, 0)} goes only to the
              under-target funds, so the over-target ones shrink as a share without paying any tax.{" "}
              {P.months ? (
                <>
                  At that pace it takes about{" "}
                  <b className="text-ink">
                    {P.months} month{P.months > 1 ? "s" : ""}
                  </b>
                  .{P.months <= 6 ? " That's quick: selling isn't worth the tax." : " That's slow, so selling some (option 2) makes sense."}
                </>
              ) : null}
              {P.zero.length > 0 && (
                <>
                  {" "}
                  {P.zero.join(" and ")} {P.zero.length > 1 ? "have" : "has"} a 0% target, so new money can&apos;t remove{" "}
                  {P.zero.length > 1 ? "them" : "it"}; only selling does.
                </>
              )}
            </p>
          </div>

          <div className="grid gap-3">
            <b className="text-ink">Option 2: sell the extra</b>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <span className="text-[13.5px] text-muted">How much</span>
              <Chips
                v={share}
                set={setShare}
                opts={[
                  [1, "All the way to target"],
                  [0.5, "Halfway"],
                  [0.25, "A quarter"],
                ]}
              />
              <span className="text-[13.5px] text-muted">Rule</span>
              <Chips
                v={mode}
                set={setMode}
                opts={[
                  ["no-loss", "Never below cost"],
                  ["lt-only", "Long-term units only (12.5%)"],
                  ["least-tax", "Least tax (losses allowed)"],
                ]}
              />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2.5 max-md:grid-cols-2">
            {[
              ["You sell", $(P.sold, 0), `of ${$(P.aim, 0)} aimed`],
              ["Gain booked", signInr(P.gainLT + P.gainST), `long-term ${signInr(P.gainLT)} · short ${signInr(P.gainST)}`],
              ["Tax", inr(Math.round(P.tax)), `${(r.lt * 100).toFixed(1)}% long, ${(r.st * 100).toFixed(1)}% short`],
              ["You keep", $(P.sold - P.tax / S.settings.fx, 0), "after tax"],
            ].map(([k, v, n]) => (
              <div key={k} className="grid gap-0.5 rounded-[14px] bg-tint px-4 py-3.5">
                <span className="kicker">{k}</span>
                <b className="num font-display text-[20px] text-ink">{v}</b>
                <span className="text-[12px] text-muted">{n}</span>
              </div>
            ))}
          </div>
          {P.short > 1 && (
            <p className="rounded-[14px] bg-warn/10 p-3 text-[14px] text-body">
              {mode === "lt-only" ? (
                <>
                  {$(P.short, 0)} of the extra is in units under 24 months old (or below cost), so it isn&apos;t sold.
                  {P.nextLT ? (
                    <>
                      {" "}
                      The next units turn long-term on <b className="text-ink">{fmtDate(P.nextLT)}</b>; until then let new money (option 1)
                      do the rest.
                    </>
                  ) : null}
                </>
              ) : (
                <>
                  {$(P.short, 0)} couldn&apos;t be sold without going below cost. Raise the price above (if you expect it), switch the rule
                  to &ldquo;Least tax&rdquo; to sell at a loss that cuts this year&apos;s tax, or cover it with new money (option 1).
                </>
              )}
            </p>
          )}
          <ol className="grid gap-3">
            {P.orders.map((o) => (
              <Order
                key={o.sym}
                o={o}
                base={base(o.sym)}
                onPrice={(p) =>
                  setPrices((x) => {
                    const y = { ...x };
                    if (p == null) delete y[o.sym];
                    else y[o.sym] = p;
                    return y;
                  })
                }
              />
            ))}
          </ol>
          {P.into.length > 0 && P.sold > 0 && (
            <div className="grid gap-2">
              <b className="text-ink">Then buy with the {$(P.sold, 0)}</b>
              <div className="flex flex-wrap gap-2">
                {P.into.map((x) => (
                  <span key={x.bucket} className="inline-flex items-center gap-2 rounded-full bg-tint px-3.5 py-1.5 text-[14px]">
                    <i className="size-2.5 rounded-[3px]" style={{ background: BUCKET_COLOR[x.bucket] }} />
                    <b>{x.buy ? tk(x.buy) : x.bucket}</b> <span className="num">{$(x.usd, 0)}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          <details className="text-[13px] text-muted">
            <summary className="cursor-pointer font-semibold text-body">How this is worked out</summary>
            <ul className="mt-1.5 grid list-disc gap-1 pl-5">
              <li>Sales take your oldest units first (FIFO), which is how INDmoney sells; you choose only how many units.</li>
              <li>
                Units are picked by the least tax per dollar: long-term units (over 24 months, 12.5%) before short-term ones (your{" "}
                {S.settings.slab}% slab), and old holdings you&apos;re exiting before plan funds.
              </li>
              <li>
                The gain is in rupees: the sale at today&apos;s ₹{S.settings.fx}/$ minus what you paid at the ₹/$ of each buy day. A weaker
                rupee alone can turn a dollar loss into a rupee gain.
              </li>
              <li>
                A short-term loss offsets any gain; a long-term loss only long-term gains. Other sales this year aren&apos;t included.
              </li>
              <li>
                Use a limit order at or above the limit price. Prices are the last ones uploaded; check the live price on INDmoney, and use
                − / + to see how a different price changes the result.
              </li>
              <li>A planning aid, not SEBI-registered advice.</li>
            </ul>
          </details>
        </>
      )}
    </Card>
  );
}
