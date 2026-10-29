"use client";

import type { IndiaState, IndHolding } from "@/types/portfolio";
import { bondSummary, inTaxSummary } from "@/lib/core/india";
import { fmtDate, fyStart, monthLong, monthShort } from "@/lib/dates";
import { inr, sgn } from "@/lib/format";
import { Card, CardHead, Chip } from "./ui";
import { Icon } from "./icon";
import { cn } from "@/lib/utils";

function Fact({ k, v, s, tone }: { k: string; v: string; s: string; tone?: "pos" | "neg" | "" }) {
  return (
    <div className="grid content-start gap-1 rounded-[14px] bg-white/5 px-4 py-3.5">
      <small className="text-[13px] text-muted">{k}</small>
      <b
        className={cn("num font-display text-[20px] leading-tight font-bold", tone === "pos" && "text-gain", tone === "neg" && "text-loss")}
      >
        {v}
      </b>
      <em className="text-[12.5px] text-muted not-italic">{s}</em>
    </div>
  );
}
function Tip({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex max-w-none items-start gap-2.5 rounded-[14px] bg-[rgb(94_234_212/0.12)] px-3.5 py-3 text-[14px]">
      <Icon name="bulb" className="mt-0.5 size-[18px] text-[#5eead4]" />
      <span>{children}</span>
    </p>
  );
}

/** bonds and NCDs: yield, interest received and to come, TDS, and the money coming back each month */
export function BondCard({ H, I }: { H: IndHolding[]; I: IndiaState }) {
  const b = bondSummary(H, I);
  if (!b) return null;
  const mx = Math.max(1, ...b.months.map((m) => m.int + m.prin)),
    k = (v: number) => (v >= 1000 ? `₹${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `₹${Math.round(v)}`),
    next = b.back[0];
  return (
    <Card>
      <CardHead
        title={`Earning about ${b.ytm.toFixed(2)}% a year on ${inr(b.val)}`}
        note={`Bonds & NCDs · ${b.srcLab}`}
        right={<Chip tone={b.val >= b.inv ? "good" : "act"}>{b.n} bonds</Chip>}
      />
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Fact k="Invested → value now" v={`${inr(b.inv)} → ${inr(b.val)}`} s="value includes interest earned but not yet paid" />
        <Fact
          k="Interest received so far"
          v={`+${inr(b.intN)}`}
          tone="pos"
          s={`in your bank, after ${inr(b.tds)} TDS (gross ${inr(b.intG)})`}
        />
        <Fact k="Interest this year (from 1 Apr)" v={inr(b.fyG)} s={`taxed at your slab · TDS ${inr(b.fyT)} already paid for you`} />
        <Fact k="Next 12 months" v={inr(b.yInt + b.yPrin)} s={`${inr(b.yInt)} interest + ${inr(b.yPrin)} principal back`} />
      </div>
      <h3 className="mt-1 text-[15px] font-semibold">Money coming to your bank, month by month</h3>
      <div
        className="grid grid-cols-12 items-end gap-1.5 max-sm:gap-[3px]"
        role="img"
        aria-label={b.months.map((m) => `${monthLong(m.ym)}: ${inr(m.int + m.prin)}`).join("; ")}
      >
        {b.months.map((m) => (
          <div
            key={m.ym}
            className="grid min-w-0 justify-items-center gap-1"
            title={`${monthLong(m.ym)}: ${inr(m.int)} interest${m.prin ? ` + ${inr(m.prin)} principal` : ""}`}
          >
            <span className="num text-[11px] leading-none font-semibold whitespace-nowrap text-muted max-sm:invisible">
              {m.int + m.prin ? k(m.int + m.prin) : ""}
            </span>
            <div className="flex h-[120px] w-full max-w-[34px] flex-col-reverse overflow-hidden rounded-t-lg rounded-b bg-white/7 max-sm:h-24">
              <i className="block w-full bg-bonds" style={{ height: `${(100 * m.prin) / mx}%` }} />
              <i className="block w-full bg-stocks" style={{ height: `${Math.max(m.int ? 3 : 0, (100 * m.int) / mx)}%` }} />
            </div>
            <span className="text-[11.5px] text-muted">{monthShort(m.ym)}</span>
          </div>
        ))}
      </div>
      <p className="note flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1.5">
          <i className="size-2.5 rounded-[3px] bg-stocks" />
          interest (after TDS)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="size-2.5 rounded-[3px] bg-bonds" />
          principal returned
        </span>
      </p>
      {b.back.length > 0 && (
        <>
          <h3 className="mt-1 text-[15px] font-semibold">Principal coming back</h3>
          <ul className="grid gap-0.5">
            {b.back.map((f) => (
              <li key={f.isin + f.d} className="grid min-h-8 grid-cols-[12px_minmax(0,1fr)_auto_auto] items-center gap-2.5 text-[14px]">
                <span className="size-2.5 rounded-[3px] bg-bonds" />
                <b className="truncate font-medium">{f.n}</b>
                <span className="num font-semibold">{inr(f.prin)}</span>
                <em className="num text-right text-muted not-italic">{fmtDate(f.d)}</em>
              </li>
            ))}
          </ul>
        </>
      )}
      {next && (
        <Tip>
          {inr(next.prin)} from {next.n} lands in your bank on <b>{fmtDate(next.d)}</b>. It doesn&apos;t reinvest by itself, so decide
          beforehand where it goes; otherwise it sits idle in savings.
        </Tip>
      )}
      <p className="note">
        Interest from bonds is taxed every year at your slab rate (as &ldquo;income from other sources&rdquo;), whether or not you sell. The
        10% TDS shows in your Form 26AS / AIS and counts towards your tax when you file.{" "}
        {b.notCovered.length > 0 && (
          <>
            {b.notCovered.map((h) => h.name).join(" and ")} {b.notCovered.length > 1 ? "aren't" : "isn't"} included yet: upload its
            platform&apos;s interest report.{" "}
          </>
        )}
        {b.anyIB && "Yields for IndiaBonds bonds are worked out from the price you paid and their scheduled payouts. "}Upload fresh Wint and
        IndiaBonds reports every month or two to keep this current.
      </p>
    </Card>
  );
}

/** Indian tax: long-term vs short-term gains if sold today, gains booked this year and the tax-free room left */
export function IndiaTaxCard({ H, I }: { H: IndHolding[]; I: IndiaState }) {
  const t = inTaxSummary(H, I);
  if (!t.dated) return null;
  const EX = 125000,
    used = Math.max(0, t.real.lt),
    left = Math.max(0, EX - used),
    harvest = Math.min(left, Math.max(0, t.ltPos));
  const fy = fyStart(),
    lab = `${fy.slice(0, 4)}–${String(+fy.slice(0, 4) + 1).slice(2)}`;
  return (
    <Card>
      <CardHead title="Long-term vs short-term" note={`Indian tax · financial year ${lab}`} />
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Fact
          k="Long-term gain if sold today"
          v={`${sgn(t.ltG)}${inr(Math.abs(t.ltG))}`}
          tone={t.ltG >= 0 ? "pos" : "neg"}
          s={t.ltPos > 0 ? `${inr(t.ltPos)} in gainers, −${inr(Math.abs(t.ltNeg))} in losers` : "12.5% above ₹1.25 lakh a year"}
        />
        <Fact
          k="Short-term gain if sold today"
          v={`${sgn(t.stG)}${inr(Math.abs(t.stG))}`}
          tone={t.stG >= 0 ? "pos" : "neg"}
          s="20% on shares and equity funds"
        />
        <Fact
          k="Booked this year (Groww orders)"
          v={t.real.has ? `${sgn(t.real.lt + t.real.st)}${inr(Math.abs(t.real.lt + t.real.st))}` : "—"}
          s={
            t.real.has
              ? `long-term ${sgn(t.real.lt)}${inr(Math.abs(t.real.lt))} · short-term ${sgn(t.real.st)}${inr(Math.abs(t.real.st))}`
              : "upload order histories"
          }
        />
        <Fact k="Tax-free long-term room left" v={inr(left)} s="of ₹1,25,000 this year" />
      </div>
      {harvest > 500 && (
        <Tip>
          You could book about <b>{inr(harvest)}</b> of long-term gains tax-free before 31 March by selling those units and buying them back
          the same day{t.gainers.length ? ` (mainly ${t.gainers.map((g) => g.name).join(", ")})` : ""}. That raises your buy price, so
          future tax is lower.
        </Tip>
      )}
      {t.upcoming.length > 0 && (
        <>
          <h3 className="mt-1 text-[15px] font-semibold">Next to turn long-term</h3>
          <ul className="grid gap-0.5">
            {t.upcoming.map((u) => (
              <li key={u.name + u.from} className="grid min-h-8 grid-cols-[12px_minmax(0,1fr)_auto_64px] items-center gap-2.5 text-[14px]">
                <span className="size-2.5 rounded-[3px] bg-stocks" />
                <b className="truncate font-medium">{u.name}</b>
                <span className="num">{fmtDate(u.from)}</span>
                <em className={cn("num text-right not-italic", u.g != null && u.g < 0 ? "text-loss" : "text-muted")}>
                  {u.g != null ? `${sgn(u.g)}${inr(Math.abs(u.g))}` : ""}
                </em>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="note">
        Purchase dates come from your Groww order histories. Units without a date (IPO allotments, bonuses, demergers, funds bought outside
        Groww) aren&apos;t counted here. Gold, silver and international funds of funds need 24 months; debt funds are always taxed at your
        slab. Estimates only; your CA files the real numbers.
      </p>
    </Card>
  );
}
