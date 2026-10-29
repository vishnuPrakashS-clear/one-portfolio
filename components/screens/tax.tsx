"use client";

import Link from "next/link";
import { usePortfolio } from "@/components/providers/portfolio-provider";
import { hasAbroad, lotRows, type LotRow } from "@/lib/core/abroad";
import { indHoldings } from "@/lib/core/india";
import { daysTxt, fmtDate, ltcgDate } from "@/lib/dates";
import { inr, sgn, tk } from "@/lib/format";
import { useMoney } from "@/lib/use-money";
import { Card, CardHead, Chip, Hero } from "@/components/sub/ui";
import { IndiaTaxCard } from "@/components/sub/india-cards";
import { Icon } from "@/components/sub/icon";
import { cn } from "@/lib/utils";

export function TaxScreen() {
  const { S } = usePortfolio(),
    { d } = useMoney();
  const I = S?.india,
    H = I ? indHoldings(I) : [],
    abroad = hasAbroad(S);
  if (!S || (!I && !abroad)) {
    return (
      <Hero badge="Sell & tax" title="When to sell, and what it costs" big={false} art="tax">
        <p className="max-w-[60ch] text-[16.5px] text-body">
          Upload your statements and order histories to see which holdings are long-term, the tax if you sold today, and the next tax-saving
          dates.
        </p>
        <div>
          <Link href="/upload" className="btn btn-primary">
            <Icon name="upload" />
            Upload
          </Link>
        </div>
      </Hero>
    );
  }
  const s = S.settings,
    lots = abroad ? lotRows(S) : [],
    groups: Record<string, LotRow[]> = {};
  for (const l of lots) (groups[l.ltd] = groups[l.ltd] || []).push(l);
  const keys = Object.keys(groups).sort();
  const lastLegacy = lots
      .filter((l) => l.plan === "legacy")
      .map((l) => l.ltd)
      .sort()
      .slice(-1)[0],
    exitYear = lastLegacy?.slice(0, 4);
  const totNow = lots.reduce((a, l) => a + l.taxNow, 0),
    totLT = lots.reduce((a, l) => a + l.taxLT, 0);
  const fy = (dd: string) => {
    const y = +dd.slice(0, 4),
      m = +dd.slice(5, 7);
    return m >= 4 ? `FY ${y}-${String(y + 1).slice(2)}` : `FY ${y - 1}-${String(y).slice(2)}`;
  };
  const sales: Record<string, { st: number; lt: number; n: number }> = {};
  for (const x of S.sales || []) {
    const k = fy(x.d);
    sales[k] = sales[k] || { st: 0, lt: 0, n: 0 };
    sales[k].n++;
    for (const l of x.lots || []) {
      const g = ((x.price ?? l.p) - l.p) * l.q;
      if (x.d >= ltcgDate(l.d)) sales[k].lt += g;
      else sales[k].st += g;
    }
  }
  return (
    <>
      <Hero badge="Sell & tax" title="When to sell, and what it costs" big={false} art="tax">
        <p className="max-w-[60ch] text-[16.5px] text-body">
          Indian shares and equity funds turn long-term after 12 months (12.5% above ₹1.25 lakh a year, 20% before). Foreign holdings need
          24 months. Each purchase has its own date.
        </p>
      </Hero>
      {I && <IndiaTaxCard H={H} I={I} />}
      {abroad && (
        <>
          <Card>
            <CardHead
              title="Abroad: tax by long-term date"
              note={`Estimates use a ${s.slab}% slab plus ${s.cess}% cess. Gains are in rupees: value now at ₹${s.fx}/$, minus what each purchase cost at the rupee rate on its buy date.`}
            />
            <p className="text-[15px]">
              Selling everything today: about <b className="num">{inr(totNow)}</b> tax. Waiting for each long-term date: about{" "}
              <b className="num">{inr(totLT)}</b>. Losses would reduce both.
            </p>
            {lastLegacy && (
              <p className="flex flex-wrap items-center gap-2 text-[14.5px]">
                <Chip tone="wait">Exit window</Chip>
                <span>
                  Everything marked &ldquo;Exit later&rdquo; is long-term by <b>{fmtDate(lastLegacy)}</b>. Sell those together between then
                  and <b>31 Dec {exitYear}</b>: one financial year, 12.5% on the rest.
                </span>
              </p>
            )}
            <div className="-mx-2 overflow-x-auto px-2 max-sm:mx-0 max-sm:px-0">
              <table className="stack">
                <thead>
                  <tr>
                    <th>Long-term from</th>
                    <th>Wait</th>
                    <th>Lots</th>
                    <th className="text-right">Gain now</th>
                    <th className="text-right">Tax if sold today</th>
                    <th className="text-right">Tax after date</th>
                    <th className="text-right">You save</th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((k) => {
                    const g = groups[k],
                      gain = g.reduce((a, l) => a + l.gain, 0),
                      tn = g.reduce((a, l) => a + l.taxNow, 0),
                      tl = g.reduce((a, l) => a + l.taxLT, 0),
                      left = g[0].left;
                    return (
                      <tr key={k}>
                        <td data-label="Long-term from" className="num whitespace-nowrap">
                          {fmtDate(k)}
                        </td>
                        <td data-label="Wait">
                          <Chip tone={left <= 0 ? "good" : "wait"}>{daysTxt(left)}</Chip>
                        </td>
                        <td data-label="Lots" className="stack-full">
                          <span className="flex max-w-[34ch] flex-wrap items-center gap-x-2 gap-y-1 max-sm:max-w-none">
                            {g.map((l, i) => (
                              <span key={i} className="inline-flex items-center gap-1 whitespace-nowrap">
                                <b className="font-semibold">{tk(l.sym)}</b>
                                {l.gain < 0 && (
                                  <Chip tone="act" className="px-1.5 py-0.5">
                                    loss
                                  </Chip>
                                )}
                              </span>
                            ))}
                          </span>
                        </td>
                        <td data-label="Gain now" className={cn("num text-right", gain >= 0 ? "text-gain-ink" : "text-loss-ink")}>
                          {sgn(gain)}
                          {d(Math.abs(gain))}
                        </td>
                        <td data-label="Tax if sold today" className="num text-right">
                          {inr(tn)}
                        </td>
                        <td data-label="Tax after date" className="num text-right">
                          {inr(tl)}
                        </td>
                        <td data-label="You save" className="num text-right text-gain-ink">
                          {inr(tn - tl)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
          <div className="grid gap-5 md:grid-cols-2">
            <Card>
              <CardHead title="Rules for selling at low tax" />
              <ol className="grid list-decimal gap-2.5 pl-5 marker:font-bold marker:text-muted">
                <li>
                  <b>Gains:</b> sell only after the &ldquo;long-term from&rdquo; date. Before it, the gain is taxed at your slab.
                </li>
                <li>
                  <b>Losses:</b> sell any time. A loss costs no tax and cancels gains in the same April–March year.
                </li>
                <li>
                  <b>Pair them:</b> in a year you sell winners, sell losers in the same April–March year.
                </li>
                <li>
                  <b>Oldest first:</b> sales take the oldest units first, so recent monthly buys keep their clock.
                </li>
                <li>
                  <b>Big exits before 31 Dec:</b> everything held in a calendar year goes into that year&apos;s Schedule FA.
                </li>
              </ol>
            </Card>
            <Card delay={0.05}>
              <CardHead title="Sales recorded" />
              {Object.keys(sales).length ? (
                <table>
                  <thead>
                    <tr>
                      <th>Year</th>
                      <th className="text-right">Sales</th>
                      <th className="text-right">Short-term</th>
                      <th className="text-right">Long-term</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.keys(sales)
                      .sort()
                      .map((k) => (
                        <tr key={k}>
                          <td>{k}</td>
                          <td className="num text-right">{sales[k].n}</td>
                          <td className={cn("num text-right", sales[k].st >= 0 ? "text-gain-ink" : "text-loss-ink")}>{d(sales[k].st)}</td>
                          <td className={cn("num text-right", sales[k].lt >= 0 ? "text-gain-ink" : "text-loss-ink")}>{d(sales[k].lt)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-muted">
                  No sales yet. Sales found in your statements appear here by financial year, ready for Schedule CG.
                </p>
              )}
            </Card>
          </div>
        </>
      )}
    </>
  );
}
