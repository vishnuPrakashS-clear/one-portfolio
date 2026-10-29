"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useState } from "react";
import { usePortfolio } from "@/components/providers/portfolio-provider";
import { BUCKET_COLOR, BUY_WHY } from "@/constants";
import { CATALOG, hasAbroad } from "@/lib/core/abroad";
import { monthStatus } from "@/lib/game";
import { fmtDate, monthLong } from "@/lib/dates";
import { inr, tk } from "@/lib/format";
import { useMoney } from "@/lib/use-money";
import { Card, CardHead, Chip, Hero } from "@/components/sub/ui";
import { Icon } from "@/components/sub/icon";
import type { SplitRow } from "@/lib/core/abroad";

function FlipCard({ r, unitsHint }: { r: SplitRow; unitsHint: string }) {
  const { d } = useMoney(),
    [on, setOn] = useState(false),
    c = BUCKET_COLOR[r.bucket] || "#a99fd0";
  const face =
    "absolute inset-0 flex flex-col items-start gap-1.5 overflow-hidden rounded-[20px] p-4 text-left text-[13.5px] leading-snug [backface-visibility:hidden]";
  return (
    <button
      type="button"
      onClick={() => setOn((v) => !v)}
      aria-label={`${tk(r.buy)}: ${d(r.reb)}. Tap for why.`}
      className="block h-[200px] cursor-pointer rounded-[20px] [perspective:900px]"
    >
      <motion.span
        className="relative block h-full w-full [transform-style:preserve-3d]"
        animate={{ rotateY: on ? 180 : 0 }}
        transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <span className={`${face} pt-6 glass`} style={{ boxShadow: `inset 0 3px 0 ${c}, inset 0 0 0 1px rgb(255 255 255 / 0.1)` }}>
          <span className="kicker text-body">{r.bucket}</span>
          <span className="font-display text-[26px] leading-tight font-extrabold tracking-[-0.02em]">{tk(r.buy)}</span>
          <span className="num font-display text-[20px] font-bold">
            {r.shares ? `${r.shares} share${r.shares > 1 ? "s" : ""}` : r.reb >= 1 ? d(r.reb) : r.whole ? "Skip" : "Paused"}
          </span>
          <span className="text-body">
            {r.shares ? `≈ ${d(r.reb)} · enter 1 in Qty` : r.reb >= 1 ? unitsHint : r.whole ? r.skipWhy : "Nothing this month"}
          </span>
          <span className="mt-auto rounded-full bg-white/10 px-2.5 py-1.5 text-[12.5px] leading-none font-semibold">
            Now {r.nowPct.toFixed(0)}% · target {r.w}%
          </span>
        </span>
        <span className={`${face} [transform:rotateY(180deg)] glass`}>
          <span className="kicker text-body">Why {tk(r.buy)}</span>
          <span>{BUY_WHY[r.buy] || ""}</span>
          <span className="note">{r.buy.startsWith("LSE~") ? "London-listed. Buy between 1 pm and 8:30 pm IST." : "US-listed."}</span>
        </span>
      </motion.span>
    </button>
  );
}

export function PlanScreen() {
  const { S } = usePortfolio(),
    { d } = useMoney();
  if (!S || !hasAbroad(S)) {
    return (
      <Hero badge="Monthly plan" title="Your monthly plan abroad" big={false} compact>
        <p className="max-w-[60ch] text-[16.5px] text-body">
          The plan splits your monthly INDmoney amount across US, Japan, London and copper funds, buying more of whatever is below target.
          Upload your INDmoney Transactions Report and Holdings Report to start. Your Indian monthly investing is on the Home screen.
        </p>
        <div>
          <Link href="/upload" className="btn btn-primary">
            <Icon name="upload" />
            Upload INDmoney reports
          </Link>
        </div>
      </Hero>
    );
  }
  const s = S.settings,
    ms = monthStatus(S),
    sp = ms.split;
  const hint = (r: SplitRow) => {
    const h = S.holdings.find((x) => x.sym === r.buy);
    return h?.price ? `≈ ${(r.reb / h.price).toFixed(4)} units` : "by dollar amount";
  };
  return (
    <>
      <Hero
        badge={ms.done ? `${monthLong(ms.ym)} done · next: ${ms.label}` : `Monthly plan · ${ms.label}`}
        title={ms.done ? `${ms.label.split(" ")[0]}'s buys` : "This month's buys"}
        big={false}
        compact
      >
        <p className="max-w-[56ch] text-[16.5px] text-body">
          Invest {inr(s.monthlyInr)} in INDmoney {ms.done ? "next month" : "this month"}. Tap a card to see why each fund gets what it gets.
        </p>
        {ms.done && (
          <p className="flex flex-wrap items-center gap-2">
            <Chip tone="good">
              <Icon name="check" className="size-3" />
              Bought
            </Chip>
            {ms.buys.map((b) => `${tk(b.sym)} ${d(b.v)}`).join(" · ")}
          </p>
        )}
      </Hero>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3.5">
        {sp.rows.map((r) => (
          <FlipCard key={r.buy} r={r} unitsHint={hint(r)} />
        ))}
      </div>
      <Card>
        <CardHead title={ms.done ? `Next month's investment · ${ms.label}` : "This month's investment"} />
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
          {[
            ["Monthly amount", inr(s.monthlyInr), ""],
            ["₹ per $", String(s.fx), s.fxAt ? "as of " + fmtDate(s.fxAt) : ""],
            ["Bank + brokerage", `~${s.feePct}%`, ""],
            ["You invest", d(sp.usd), ""],
          ].map(([k, v, n]) => (
            <div key={k} className="grid gap-0.5 rounded-[14px] bg-white/5 px-4 py-3.5">
              <span className="kicker">{k}</span>
              <b className="num font-display text-[20px]">{v}</b>
              {n && <span className="note">{n}</span>}
            </div>
          ))}
        </div>
        <div className="-mx-2 overflow-x-auto px-2">
          <table>
            <thead>
              <tr>
                <th>Bucket</th>
                <th>Buy</th>
                <th className="text-right">Target</th>
                <th className="text-right">Now</th>
                <th className="text-right">Standard split</th>
                <th className="text-right">{ms.done ? "Next month" : "This month"}</th>
              </tr>
            </thead>
            <tbody>
              {sp.rows.map((r) => (
                <tr key={r.buy}>
                  <td>
                    <span className="inline-flex items-center gap-2">
                      <i className="size-2.5 rounded-[3px]" style={{ background: BUCKET_COLOR[r.bucket] }} />
                      {r.bucket}
                    </span>
                  </td>
                  <td>
                    <b className="font-semibold">{tk(r.buy)}</b>
                    <span className="block text-[12.5px] text-muted">
                      {CATALOG[r.buy]?.name || ""}
                      {r.buy.startsWith("LSE~") ? " · London" : ""}
                    </span>
                  </td>
                  <td className="num text-right">{r.w}%</td>
                  <td className="num text-right">{r.nowPct.toFixed(0)}%</td>
                  <td className="num text-right">{d(r.std)}</td>
                  <td className="num text-right">
                    <b>{r.shares ? `${r.shares} share${r.shares > 1 ? "s" : ""}` : d(r.reb)}</b>
                    {r.whole && (
                      <span className="block text-[12.5px] text-muted">
                        {r.shares ? "≈" + d(r.reb) : "skip: " + r.skipWhy}
                        {r.vc?.label ? " · " + r.vc.label : ""}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}>Total</td>
                <td className="num text-right">{d(sp.usd)}</td>
                <td className="num text-right">{d(sp.rows.reduce((a, r) => a + r.reb, 0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="note">
          &ldquo;This month&rdquo; tilts towards whatever is below target, so you rebalance without selling or paying tax. A company above
          10% of the sleeve gets nothing until it drops back.
        </p>
      </Card>
      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardHead title="Why the London-listed (UCITS Acc) versions" />
          <ol className="grid list-decimal gap-2.5 pl-5 marker:font-bold marker:text-muted">
            <li>
              <b>No dividends paid to you.</b> The fund reinvests them, so there is nothing to declare each year at your slab rate.
            </li>
            <li>
              <b>Lower US withholding.</b> An Irish fund pays 15% US tax on US dividends. A US-listed ETF paying you directly loses 25%.
            </li>
            <li>
              <b>No US estate tax.</b> The US can tax a non-resident&apos;s US-listed assets above $60,000 at death. Irish funds are outside
              that.
            </li>
            <li>
              <b>Same Indian tax on sale:</b> held more than 24 months, 12.5%.
            </li>
          </ol>
          <p className="note">
            Trade-off: slightly higher fees than VOO/QQQ and London trading hours (about 1:30 pm to 10 pm IST). The fund name in INDmoney
            should say &ldquo;Acc&rdquo;.
          </p>
        </Card>
        <Card delay={0.05}>
          <CardHead title="Copper rules" />
          <ol className="grid list-decimal gap-2.5 pl-5 marker:font-bold marker:text-muted">
            <li>
              Copper miners swing far more than the S&amp;P 500. Keep them at <b>10% or less</b> of this sleeve.
            </li>
            <li>Buy only through the monthly plan, never a lump sum.</li>
            <li>
              Use <b className="text-bonds">COPX on London (UCITS Acc)</b>. INDmoney sells it in whole shares only, so the plan buys 1 share
              in a month when copper is below its 10% target and the value check isn&apos;t &ldquo;Expensive&rdquo;.
            </li>
            <li>Avoid copper-futures funds such as CPER: US partnerships, with extra withholding for foreign holders.</li>
          </ol>
        </Card>
      </div>
    </>
  );
}
