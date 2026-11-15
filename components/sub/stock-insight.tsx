"use client";

/* The parts of a holding's detail sheet that explain its numbers and what to do next: how invested, average price,
   returns and XIRR are worked out (with your own figures), where the price stands against its 52-week range and your
   average, how long a recovery takes, whether to hold, build up or let go, and how the same money would have done in
   the Nifty 50. */
import { useEffect, useState, type ReactNode } from "react";
import { usePortfolio } from "@/components/providers/portfolio-provider";
import { loadStockData } from "@/lib/supabase";
import { scoreStock } from "@/lib/analysis";
import { breakeven, stockVerdict, targetQty, VERDICT_NAME, vsIndex, type Lot } from "@/lib/planner";
import { CATEGORIES, PLAN_RULES } from "@/constants";
import { fmtDate, TODAY } from "@/lib/dates";
import { inr, inr2, pctf, qty, sgn } from "@/lib/format";
import type { IndHolding } from "@/types/portfolio";
import type { MarketClass, MarketIndex, MarketStock } from "@/types/market";
import { Chip } from "./ui";
import { cn } from "@/lib/utils";

const yrs = (d: string, today: string) => (Date.parse(today) - Date.parse(d)) / 31557600000;
const yrTxt = (y: number) => (y < 1 / 12 ? "under a month" : y < 1 ? `${Math.round(y * 12)} months` : `${y.toFixed(1)} years`);
const B = ({ children, className }: { children: ReactNode; className?: string }) => (
  <b className={cn("num font-semibold text-ink", className)}>{children}</b>
);

function Box({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-3 rounded-[20px] bg-card p-[18px] shadow-[inset_0_0_0_1px_var(--color-line)]">
      <h3 className="font-display text-[16px] font-semibold">{title}</h3>
      {children}
    </section>
  );
}

/** "How these numbers are worked out", with the holding's own figures */
export function HowCalculated({
  h,
  price,
  value,
  lots,
  xr,
}: {
  h: IndHolding;
  price: number;
  value: number;
  lots: Lot[];
  xr: number | null;
}) {
  const today = TODAY();
  const unit = h.type === "mf" ? "units" : "shares";
  const units = h.units || 0;
  const invested = h.cost ?? null;
  const avg = h.avg || (invested != null && units ? invested / units : null);
  const g = invested != null ? value - invested : null;
  const dq = lots.reduce((a, l) => a + l.q, 0),
    dv = dq * price;
  const big = lots
    .slice()
    .sort((a, b) => b.q * b.p - a.q * a.p)
    .slice(0, 3);
  const grown = (l: Lot) => (xr != null ? l.q * l.p * Math.pow(1 + xr, yrs(l.d, today)) : 0);
  const avgAge = dq ? lots.reduce((a, l) => a + l.q * l.p * yrs(l.d, today), 0) / lots.reduce((a, l) => a + l.q * l.p, 0) : null;
  return (
    <details className="group rounded-[20px] bg-card p-[18px] shadow-[inset_0_0_0_1px_var(--color-line)] [&_summary]:cursor-pointer">
      <summary className="flex items-center justify-between gap-3 font-display text-[16px] font-semibold">
        How these numbers are worked out
        <span className="text-[13px] font-normal text-muted group-open:hidden">Show</span>
      </summary>
      <ol className="mt-3 grid list-decimal gap-3 pl-5 text-[14.5px] leading-relaxed text-body marker:text-muted">
        <li>
          <b className="text-ink">Invested</b> is what you paid for the {unit} you still hold:{" "}
          {lots.length
            ? `${lots.length} purchase${lots.length === 1 ? "" : "s"}, each its ${unit} × its price`
            : `${qty(units)} ${unit} × your average price`}
          {invested != null && (
            <>
              {" "}
              = <B>{inr2(invested)}</B>
            </>
          )}
          . {unit === "shares" ? "Shares you sold leave the oldest purchases first, so they drop out of this." : ""}
        </li>
        {avg != null && (
          <li>
            <b className="text-ink">Average price</b> = invested ÷ {unit} = {invested != null ? inr2(invested) : "—"} ÷ {qty(units)} ={" "}
            <B>{inr2(avg)}</B>. It&apos;s the price that, paid for every {unit === "shares" ? "share" : "unit"}, would have cost the same in
            total.
          </li>
        )}
        <li>
          <b className="text-ink">Current value</b> = {unit} × today&apos;s {h.type === "mf" ? "NAV" : "price"} = {qty(units)} ×{" "}
          {inr2(price)} = <B>{inr2(value)}</B>.
        </li>
        {g != null && invested ? (
          <li>
            <b className="text-ink">Returns</b> = current − invested ={" "}
            <B className={g >= 0 ? "text-gain-ink" : "text-loss-ink"}>
              {sgn(g)}
              {inr2(Math.abs(g))}
            </B>
            , which is {pctf(g / invested)} of what you put in. This ignores time: it&apos;s the same number whether that took a month or
            ten years.
          </li>
        ) : null}
        <li>
          <b className="text-ink">XIRR</b> is your return <i>per year</i>, counting when each rupee went in.{" "}
          {xr != null ? (
            <>
              It&apos;s the one yearly rate, <B className={xr >= 0 ? "text-gain-ink" : "text-loss-ink"}>{pctf(xr)}</B>, at which every
              purchase, growing from its own date to today, adds up to today&apos;s value:
              <span className="mt-2 grid gap-1.5 rounded-[14px] bg-tint p-3 text-[13.5px]">
                {big.map((l, i) => (
                  <span key={i} className="num grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                    <span>
                      {inr(l.q * l.p)} on {fmtDate(l.d)}, {yrTxt(yrs(l.d, today))} at {pctf(xr)}
                    </span>
                    <b>→ {inr(grown(l))}</b>
                  </span>
                ))}
                {lots.length > big.length && (
                  <span className="text-muted">…and {lots.length - big.length} more purchases the same way</span>
                )}
                <span className="num grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-t border-rule pt-1.5">
                  <span>All of them together</span>
                  <b>
                    {inr(lots.reduce((a, l) => a + grown(l), 0))} ≈ {inr(dv)} today
                  </b>
                </span>
              </span>
              <span className="mt-2 block">
                {avgAge != null && avgAge < 1
                  ? `Your money here has been in for ${yrTxt(avgAge)} on average, and XIRR stretches that to a full year, so a small move shows up as a big yearly rate. It settles down as time passes.`
                  : `Your money here has been in for ${avgAge != null ? yrTxt(avgAge) : "a while"} on average, so ${pctf(xr)} a year is a fair measure to compare with a fixed deposit (about 7%) or the Nifty 50.`}{" "}
                Dividends aren&apos;t included (Groww leaves them out too).
                {dq < units - 1e-6 ? ` It covers the ${qty(dq)} ${unit} whose purchase date is in your reports.` : ""}
              </span>
            </>
          ) : (
            "It needs the date of each purchase, which isn't in the reports you've uploaded for this one."
          )}
        </li>
      </ol>
    </details>
  );
}

/** price against its range and your average, recovery time, the verdict, and the Nifty 50 comparison */
export function StockOutlook({ h, price, lots }: { h: IndHolding; price: number; lots: Lot[] }) {
  const { mode } = usePortfolio();
  const [d, setD] = useState<{ stock: MarketStock | null; klass: MarketClass | null; nifty: MarketIndex | null } | null>(null);
  useEffect(() => {
    if (mode !== "sb") return;
    let live = true;
    loadStockData(h.type === "stock" ? h.isin : "")
      .then((r) => live && setD(r))
      .catch(() => live && setD({ stock: null, klass: null, nifty: null }));
    return () => {
      live = false;
    };
  }, [h.isin, h.type, mode]);

  const isStock = h.type === "stock";
  const units = h.units || 0;
  const invested = h.cost ?? null;
  const avg = h.avg || (invested != null && units ? invested / units : null);
  const be = avg ? breakeven(price, avg) : null;
  const info = d?.stock?.info;
  const hi = info?.hi52 ?? null,
    lo = info?.lo52 ?? null;
  const sc = isStock ? scoreStock(info, d?.stock?.industry || info?.groww || null) : null;
  const v = sc ? stockVerdict(sc) : null;
  const vs = d?.nifty ? vsIndex([{ lots, price }], d.nifty) : null;
  const rates = CATEGORIES.stocks.rates;
  const t = targetQty(price),
    k = Math.max(0, t - units);
  const newAvg = avg && k > 0 ? (avg * units + k * price) / (units + k) : null;
  const loss = avg && avg > price ? (avg - price) * units : 0;

  const showVs = !!vs && vs.xirr != null && vs.ixXirr != null && (isStock || h.cls === "Equity");
  if (!isStock && !showVs) return null;
  return (
    <>
      {isStock && (
        <Box title="Where the price stands">
          {hi && lo && hi > lo ? (
            <div className="grid gap-1.5">
              <div className="relative h-2 rounded-full bg-gradient-to-r from-loss-ink/50 via-tint-2 to-gain-ink/50">
                <span
                  className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink shadow-[0_0_0_3px_var(--color-card)]"
                  style={{ left: `${Math.max(0, Math.min(100, ((price - lo) / (hi - lo)) * 100))}%` }}
                  aria-hidden
                />
                {avg && avg > lo && avg < hi && (
                  <span
                    className="absolute top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-lime"
                    style={{ left: `${((avg - lo) / (hi - lo)) * 100}%` }}
                    aria-hidden
                  />
                )}
              </div>
              <div className="num flex justify-between text-[12.5px] text-muted">
                <span>52-week low {inr2(lo)}</span>
                <span>high {inr2(hi)}</span>
              </div>
              <p className="text-[14.5px] text-body">
                Today&apos;s {inr2(price)} is <B>{pctf(price / hi - 1)}</B> from its 52-week high
                {avg ? (
                  <>
                    {" "}
                    and <B className={price >= avg ? "text-gain-ink" : "text-loss-ink"}>{pctf(price / avg - 1)}</B> from your average of{" "}
                    {inr2(avg)} <span className="text-muted">(the lime mark)</span>
                  </>
                ) : null}
                .
              </p>
            </div>
          ) : (
            mode === "sb" && !d && <p className="text-muted">Loading its price range…</p>
          )}
          {be && (
            <div className="grid gap-2 rounded-[14px] bg-tint p-3.5 text-[14.5px]">
              <p>
                Down <B className="text-loss-ink">{pctf(be.drop)}</B> from what you paid, so it has to rise <B>{pctf(be.need)}</B> to get
                back to {inr2(avg!)}. A fall needs a bigger rise to undo: −25% takes +33%, −50% takes +100%.
              </p>
              <div className="num grid grid-cols-3 gap-2 text-center">
                {be.years.map((y, i) => (
                  <div key={i} className="rounded-xl bg-card px-2 py-2">
                    <b className="block font-display text-[17px]">
                      {y < 1 ? `${Math.max(1, Math.round(y * 12))} mo` : `${y.toFixed(1)} yrs`}
                    </b>
                    <small className="text-[12px] text-muted">at {Math.round(rates[i] * 100)}% a year</small>
                  </div>
                ))}
              </div>
              <p className="text-[13px] text-muted">
                Break-even if it grows {Math.round(rates[0] * 100)}%, {Math.round(rates[1] * 100)}% or {Math.round(rates[2] * 100)}% a year
                from here (the app&apos;s cautious, likely and strong cases for shares). Nobody knows which; a weak business may not get
                back at all.
              </p>
            </div>
          )}
        </Box>
      )}
      {isStock && v && sc && (
        <Box title="Hold, build up or let go?">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone={v.verdict === "add" ? "good" : v.verdict === "exit" ? "act" : "wait"}>{VERDICT_NAME[v.verdict]}</Chip>
            <span className="num text-[13px] text-muted">
              quality {sc.quality ?? "—"} · price vs industry {sc.valuation ?? "—"} · growth {sc.growth ?? "—"} (out of 100)
            </span>
          </div>
          <p className="text-[14.5px] text-body">{v.why}</p>
          <p className="text-[14.5px] text-body">
            <b className="text-ink">What you paid doesn&apos;t decide this.</b> The market doesn&apos;t know your average price; the only
            question is whether this is the best place for this money from today. Waiting to break even only makes sense if you&apos;d buy
            it fresh at today&apos;s price.
          </p>
          {v.verdict === "exit" && loss > 0 && (
            <p className="rounded-[14px] bg-tint p-3.5 text-[14px]">
              Selling now books a loss of about <B>{inr(loss)}</B>. In your tax return it&apos;s set off against gains: a short-term loss
              against any gains, a long-term loss only against long-term gains. That can save up to {inr(loss * 0.2)} of tax this year, and
              an unused loss carries forward for 8 years if you file on time. Then move the money into a stronger company or an index fund.
            </p>
          )}
          {(v.verdict === "add" || v.verdict === "hold") && k > 0 && (
            <p className="rounded-[14px] bg-tint p-3.5 text-[14px]">
              Your target is {t} shares
              {t < PLAN_RULES.minQty ? ` (₹${(PLAN_RULES.maxPosition / 1000).toFixed(0)}k worth, as 20 would be a lot in one stock)` : ""}:
              buying {k} more costs about <B>{inr(k * price)}</B>
              {newAvg && avg && newAvg < avg ? (
                <>
                  {" "}
                  and brings your average down from {inr2(avg)} to <B>{inr2(newAvg)}</B>
                </>
              ) : null}
              .{v.verdict === "hold" ? " It's priced above its industry right now, so spreading it over a few months is safer." : ""}
            </p>
          )}
          {sc.flags.length > 0 && (
            <ul className="grid gap-1 text-[14px] text-loss-ink">
              {sc.flags.map((f) => (
                <li key={f}>! {f}</li>
              ))}
            </ul>
          )}
        </Box>
      )}
      {showVs && vs && vs.xirr != null && vs.ixXirr != null && (
        <Box title="Against the Nifty 50">
          <p className="text-[14.5px] text-body">
            The same {inr(vs.invested)}, put in a Nifty 50 index fund on the same days, would be worth <B>{inr(vs.ixValue)}</B> today (
            {pctf(vs.ixXirr)} a year). Yours is worth <B>{inr(vs.value)}</B> ({pctf(vs.xirr)} a year), so you&apos;re{" "}
            <B className={vs.value >= vs.ixValue ? "text-gain-ink" : "text-loss-ink"}>
              {vs.value >= vs.ixValue ? "ahead" : "behind"} by {inr(Math.abs(vs.value - vs.ixValue))}
            </B>
            .
          </p>
          <p className="text-[13px] text-muted">
            The index is the UTI Nifty 50 Index Fund&apos;s daily NAV, which includes dividends and a small cost. Counts the {vs.buys}{" "}
            purchase
            {vs.buys === 1 ? "" : "s"} you still hold, from {fmtDate(vs.from)}.
          </p>
        </Box>
      )}
    </>
  );
}
