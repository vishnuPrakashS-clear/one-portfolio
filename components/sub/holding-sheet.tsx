"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePortfolio } from "@/components/providers/portfolio-provider";
import { useUi } from "@/components/providers/ui-provider";
import type { IndHolding, IndiaState, Portfolio } from "@/types/portfolio";
import { bondFlowsFor, bondMat, indCur, indPrice, indPriceAt, inRule, inTax, stRate, taxExplain } from "@/lib/core/india";
import { holdingRows } from "@/lib/core/abroad";
import { xirr } from "@/lib/core/xirr";
import { addMonths, fmtDate, TODAY } from "@/lib/dates";
import { inr, inr2, pctf, qty, sgn, tk, tone } from "@/lib/format";
import { useMoney } from "@/lib/use-money";
import { CATEGORIES, TYPE_NAME } from "@/constants";
import { Chip } from "./ui";
import { Icon } from "./icon";
import { cn } from "@/lib/utils";

function Section({ title, children, right }: { title?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="grid gap-3 rounded-[20px] bg-white/[0.045] p-[18px] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.07)]">
      {title && (
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-display text-[16px] font-semibold">{title}</h3>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}
function DL({ rows }: { rows: [ReactNode, ReactNode, string?][] }) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2.5 border-t border-white/7 pt-3">
      {rows.map(([k, v, cls], i) => (
        <div key={i} className="contents">
          <dt className="text-[14px] whitespace-nowrap text-muted">{k}</dt>
          <dd className={cn("num grid justify-items-end text-right text-[14.5px] font-semibold [overflow-wrap:anywhere]", cls)}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
const Sub = ({ children, className }: { children: ReactNode; className?: string }) => (
  <span className={cn("block text-[12.5px] font-normal text-muted", className)}>{children}</span>
);

function IndiaDetail({ h, I }: { h: IndHolding; I: IndiaState }) {
  const today = TODAY(),
    px = indPrice(h, I),
    pxAt = indPriceAt(h, I),
    v = indCur(h, I),
    g = h.cost != null ? v - h.cost : null;
  const bp = h.avg || (h.cost != null && h.units ? h.cost / h.units : null),
    rule = inRule(h),
    t = inTax(h, px);
  const lots = (h.lots || []).slice().sort((x, y) => String(y.d || "").localeCompare(String(x.d || "")));
  const dl = lots.filter((l) => l.d && l.p != null),
    dated = lots.length > 0 && dl.length === lots.length,
    dq = dl.reduce((s, l) => s + l.q, 0),
    partial = !dated && dl.length > 0;
  const xr =
    h.bond || !(dated || partial)
      ? null
      : xirr([
          ...dl.map((l) => ({ d: l.d as string, v: -l.q * (l.p as number) })).sort((x, y) => x.d.localeCompare(y.d)),
          { d: today, v: dated ? v : dq * px },
        ]);
  const where = h.via
    ? `Bought on ${h.via} · held in your ${h.acct} demat`
    : h.acct === "MF folios (CAMS/KFin)"
      ? "Held directly with the fund house"
      : `Held in ${h.acct}`;
  const isLT = (d: string) => !!rule.months && addMonths(d, rule.months) <= today;
  const ltG = dl.filter((l) => isLT(l.d as string)).reduce((s, l) => s + (px - (l.p as number)) * l.q, 0),
    stG = dl.filter((l) => !isLT(l.d as string)).reduce((s, l) => s + (px - (l.p as number)) * l.q, 0);
  const elssFree = h.elss
    ? lots
        .filter((l) => l.d)
        .map((l) => addMonths(l.d as string, 36))
        .sort()
    : [];
  const ini = h.name
    .replace(/[^A-Za-z0-9 ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  const F = h.type === "bond" ? bondFlowsFor(h, I) : null,
    mat = h.type === "bond" ? bondMat(h) : null;
  return (
    <>
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
        <div
          className="grid size-12 place-items-center rounded-[14px] bg-gradient-to-br from-act-a to-act-b font-display text-[16px] font-extrabold text-on-act"
          aria-hidden
        >
          {ini || "?"}
        </div>
        <div className="min-w-0">
          <b className="block font-display text-[17px] leading-snug [overflow-wrap:anywhere]">{h.name}</b>
          <Sub>
            {inr2(px)} · price on {fmtDate(pxAt)}
          </Sub>
        </div>
        <Chip>{TYPE_NAME[h.type] || h.type}</Chip>
      </div>
      <Section>
        <div className="grid grid-cols-2 items-end gap-3">
          <div>
            <small className="block text-[13px] text-muted">Current</small>
            <b className="num font-display text-[22px] font-bold">{inr2(v)}</b>
          </div>
          <div className="text-right">
            <small className="block text-[13px] text-muted">Invested</small>
            <b className="num font-display text-[22px] font-bold">{h.cost != null ? inr2(h.cost) : "—"}</b>
          </div>
        </div>
        <DL
          rows={[
            [
              "Unrealised returns",
              g != null ? `${sgn(g)}${inr2(Math.abs(g))} (${pctf(h.cost ? g / h.cost : 0)})` : "—",
              g != null ? (g >= 0 ? "text-gain" : "text-loss") : "",
            ],
            [
              h.type === "mf" ? "NAV" : "Market price",
              <>
                {inr2(px)}
                <Sub>{fmtDate(pxAt)}</Sub>
              </>,
            ],
            ["Avg buy price", bp ? inr2(bp) : "—"],
            [`Total ${h.type === "mf" ? "units" : "qty"}`, qty(h.units)],
            ...(h.type !== "bond"
              ? [
                  [
                    <>
                      XIRR <Sub className="inline">(yearly return)</Sub>
                    </>,
                    xr != null ? (
                      <>
                        {pctf(xr)}
                        {partial && <Sub>on the {qty(dq)} units with a purchase date</Sub>}
                      </>
                    ) : (
                      <Sub>needs purchase dates</Sub>
                    ),
                    xr != null ? (xr >= 0 ? "text-gain" : "text-loss") : "",
                  ] as [ReactNode, ReactNode, string],
                ]
              : []),
            ...(h.divs
              ? [
                  [
                    "Total dividends",
                    <>
                      +{inr2(h.divs.reduce((s, x) => s + x.amt, 0))}
                      <Sub>
                        {h.divs.length} payout{h.divs.length === 1 ? "" : "s"} · last {fmtDate(h.divs[h.divs.length - 1].d)}
                      </Sub>
                    </>,
                    "text-gain",
                  ] as [ReactNode, ReactNode, string],
                ]
              : []),
            ...(h.elss
              ? [
                  [
                    "Lock-in (ELSS)",
                    elssFree.length ? (
                      <>
                        {elssFree.filter((x) => x <= today).length
                          ? `${elssFree.filter((x) => x <= today).length} of ${elssFree.length} purchases free to sell`
                          : "all locked"}
                        {elssFree.find((x) => x > today) && (
                          <Sub>first one free to sell from {fmtDate(elssFree.find((x) => x > today))}</Sub>
                        )}
                      </>
                    ) : (
                      "3 years from each purchase"
                    ),
                  ] as [ReactNode, ReactNode],
                ]
              : []),
            [
              "Where",
              <>
                {where}
                {h.folio && <Sub>folio {h.folio}</Sub>}
                {h.nse && <Sub>NSE {h.nse}</Sub>}
              </>,
              "font-normal",
            ],
            ...(h.type === "mf" && h.sub
              ? [
                  [
                    "Category",
                    <>
                      {h.cls}
                      <Sub>{h.sub}</Sub>
                    </>,
                  ] as [ReactNode, ReactNode],
                ]
              : []),
          ]}
        />
      </Section>
      {F && (
        <Section title="Bond details">
          <DL
            rows={[
              ...(h.coupon || h.name.match(/\b(\d{1,2}\.\d{1,2})\b/)?.[1]
                ? [["Coupon (interest rate)", `${h.coupon || h.name.match(/\b(\d{1,2}\.\d{1,2})\b/)?.[1]}% a year`] as [string, string]]
                : []),
              ...(h.bond?.ytm
                ? [["Yield to maturity", `${h.bond.ytmEst ? "≈" : ""}${h.bond.ytm.toFixed(2)}% a year`] as [string, string]]
                : []),
              [
                "Maturity date",
                mat ? (
                  <>
                    {fmtDate(mat)}
                    <Sub>
                      {(() => {
                        const mo = Math.max(0, Math.round((Date.parse(mat) - Date.parse(today)) / 2629800000));
                        return mo >= 12 ? `in about ${(mo / 12).toFixed(1)} years` : `in about ${mo} month${mo === 1 ? "" : "s"}`;
                      })()}
                    </Sub>
                  </>
                ) : (
                  "—"
                ),
              ],
              ...(h.bond?.pType ? [["Principal repaid", h.bond.pType] as [string, string]] : []),
              [
                "Interest received so far",
                <>
                  +{inr(h.bond?.intN || 0)}
                  <Sub>
                    after {inr(h.bond?.tds || 0)} TDS · gross {inr(h.bond?.intG || 0)}
                  </Sub>
                </>,
                "text-gain",
              ],
              ...(F.fut[0]
                ? [
                    [
                      "Next payout",
                      <>
                        {inr(F.fut[0].bank || F.fut[0].int + F.fut[0].prin)}
                        <Sub>
                          on {fmtDate(F.fut[0].d)}
                          {F.fut[0].prin ? ` · includes ${inr(F.fut[0].prin)} principal` : ""}
                        </Sub>
                      </>,
                    ] as [string, ReactNode],
                  ]
                : []),
              [
                "Still to come",
                `${inr(F.fut.reduce((s, f) => s + f.int, 0))} interest + ${inr(F.fut.reduce((s, f) => s + f.prin, 0))} principal`,
              ],
            ]}
          />
          {F.fut.length > 0 && (
            <details className="[&_summary]:cursor-pointer">
              <summary className="py-1.5 font-semibold">All upcoming payouts ({F.fut.length})</summary>
              <ul className="mt-1.5 grid max-h-64 gap-1.5 overflow-auto">
                {F.fut.map((f) => (
                  <li key={f.d + f.isin} className="num grid grid-cols-[1fr_auto_auto] gap-2.5 text-[14px]">
                    <span>{fmtDate(f.d)}</span>
                    <span>{inr(f.bank || f.int + f.prin)}</span>
                    <em className="min-w-28 text-right text-muted not-italic">{f.prin ? "principal + interest" : "interest"}</em>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Section>
      )}
      {h.divs && (
        <Section title="Dividends received">
          <ul className="grid gap-1.5">
            {h.divs
              .slice()
              .reverse()
              .map((x) => (
                <li key={x.d + x.sym} className="num grid grid-cols-[1fr_auto_auto] gap-2.5 text-[14px]">
                  <span>{fmtDate(x.d)}</span>
                  <span>{inr2(x.amt)}</span>
                  <em className="min-w-28 text-right text-muted not-italic">{x.q && x.dps ? `${x.q} × ₹${(+x.dps).toFixed(2)}` : ""}</em>
                </li>
              ))}
          </ul>
          <p className="note">
            Dividends are added to your income and taxed at your slab rate. TDS is deducted only above ₹10,000 a year from one company.
          </p>
        </Section>
      )}
      <Section title="Tax if you sell today">
        {h.type !== "bond" && rule.months && lots.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[14px] bg-white/5 px-3.5 py-3">
              <small className="block text-[13px] text-muted">Long-term units</small>
              <b className="num font-display text-[18px]">{qty(t.lt)}</b>
              <Sub className={tone(ltG) === "pos" ? "text-gain" : tone(ltG) === "neg" ? "text-loss" : ""}>
                gain {sgn(ltG)}
                {inr(Math.abs(ltG))} · 12.5%
              </Sub>
            </div>
            <div className="rounded-[14px] bg-white/5 px-3.5 py-3">
              <small className="block text-[13px] text-muted">Short-term units</small>
              <b className="num font-display text-[18px]">{qty(t.st)}</b>
              <Sub className={tone(stG) === "pos" ? "text-gain" : tone(stG) === "neg" ? "text-loss" : ""}>
                gain {sgn(stG)}
                {inr(Math.abs(stG))} · {stRate(rule)}
              </Sub>
            </div>
          </div>
        )}
        {t.next && (
          <p className="flex items-start gap-2 text-[14px]">
            <Icon name="clock" className="mt-0.5" />
            Next units turn long-term on <b>{fmtDate(t.next)}</b>.
          </p>
        )}
        {t.unk > 1e-6 && (
          <p className="text-[14px]">
            {qty(t.unk)} {Math.abs(t.unk - 1) < 1e-6 ? "unit has" : "units have"} no purchase date in the reports you&apos;ve uploaded, so
            they aren&apos;t counted above.
          </p>
        )}
        <p className="note">{taxExplain(h, rule)}</p>
      </Section>
      <Section title="Breakdown" right={lots.length ? <Sub>Avg price (invested)</Sub> : undefined}>
        {lots.length ? (
          <ul className="grid">
            {lots.map((l, i) => {
              const lg = l.p != null ? (px - l.p) * l.q : null;
              return (
                <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2.5 border-t border-white/7 py-3 first:border-0">
                  <div className="grid content-start gap-1">
                    <b>
                      {qty(l.q)} {h.type === "mf" ? "units" : "qty"}
                    </b>
                    <Sub>
                      {l.d ? fmtDate(l.d) : "purchase date unknown"}
                      {l.tag ? ` · ${l.tag}` : ""}
                      {l.d ? ` · held ${Math.round((Date.parse(today) - Date.parse(l.d)) / 864e5)} days` : ""}
                    </Sub>
                    {h.type !== "bond" &&
                      (!rule.months ? (
                        <Chip className="justify-self-start">Slab rate</Chip>
                      ) : !l.d ? (
                        <Chip className="justify-self-start">Date unknown</Chip>
                      ) : isLT(l.d) ? (
                        <Chip tone="good" className="justify-self-start">
                          <Icon name="check" className="size-3" />
                          Long-term
                        </Chip>
                      ) : (
                        <span className="flex flex-wrap items-center gap-2">
                          <Chip tone="act">Short-term</Chip>
                          <Sub>long-term from {fmtDate(addMonths(l.d, rule.months))}</Sub>
                        </span>
                      ))}
                    {h.elss &&
                      l.d &&
                      (addMonths(l.d, 36) > today ? (
                        <Chip className="justify-self-start">
                          <Icon name="lock" className="size-3" />
                          Locked until {fmtDate(addMonths(l.d, 36))}
                        </Chip>
                      ) : (
                        <Sub>lock-in over</Sub>
                      ))}
                  </div>
                  <div className="grid content-start justify-items-end text-right">
                    <b className="num">{l.p != null ? inr2(l.p) : "—"}</b>
                    <Sub>{l.p != null ? `(${inr2(l.p * l.q)})` : ""}</Sub>
                    {lg != null && h.type !== "bond" && (
                      <Sub className={lg >= 0 ? "text-gain" : "text-loss"}>
                        {sgn(lg)}
                        {inr(Math.abs(lg))}
                      </Sub>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-muted">
            {h.acct === "Zerodha"
              ? "Zerodha's holdings report has the average price but not each purchase, so the purchase dates aren't known yet."
              : "No purchase-by-purchase history for this one in your reports yet."}
          </p>
        )}
      </Section>
    </>
  );
}

function AbroadDetail({ S, sym }: { S: Portfolio; sym: string }) {
  const { d } = useMoney(),
    r = holdingRows(S).find((x) => x.sym === sym);
  if (!r) return <p className="text-muted">This holding is no longer in your reports.</p>;
  const exact = (src?: string) => ["statement", "document", "transactions"].includes(src || "");
  return (
    <>
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
        <div
          className="grid size-12 place-items-center rounded-[14px] font-display text-[14px] font-extrabold text-on-act"
          style={{ background: `linear-gradient(135deg, ${CATEGORIES.abroad.hex}, #a78bfa)` }}
          aria-hidden
        >
          {tk(r.sym).slice(0, 4)}
        </div>
        <div className="min-w-0">
          <b className="block font-display text-[17px]">{tk(r.sym)}</b>
          <Sub>
            {r.name}
            {r.sym.startsWith("LSE~") ? " · London" : ""}
          </Sub>
        </div>
        <Chip tone={r.action.tone}>{r.action.label}</Chip>
      </div>
      <Section>
        <div className="grid grid-cols-2 items-end gap-3">
          <div>
            <small className="block text-[13px] text-muted">Current</small>
            <b className="num font-display text-[22px] font-bold">{d(r.value)}</b>
          </div>
          <div className="text-right">
            <small className="block text-[13px] text-muted">Paid</small>
            <b className="num font-display text-[22px] font-bold">{d(r.cost)}</b>
          </div>
        </div>
        <DL
          rows={[
            ["Gain", `${sgn(r.gain)}${d(Math.abs(r.gain))} (${pctf(r.pct)})`, r.gain >= 0 ? "text-gain" : "text-loss"],
            [
              "Price",
              <>
                {d(r.price)}
                <Sub>{r.priceAt ? fmtDate(r.priceAt) : "no price yet"}</Sub>
              </>,
            ],
            ["Avg cost", d(r.cost / r.q)],
            ["Units", r.q.toFixed(4)],
            [
              "What to do",
              <>
                {r.action.label}
                <Sub>{r.action.why}</Sub>
              </>,
              "font-normal",
            ],
          ]}
        />
      </Section>
      <Section title="Each purchase">
        <ul className="grid">
          {r.lots.map((l, i) => (
            <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2.5 border-t border-white/7 py-3 first:border-0">
              <div className="grid gap-1">
                <b>{l.q.toFixed(4)} units</b>
                <Sub>
                  {fmtDate(l.d)}
                  {exact(l.src) ? "" : " · date from the holdings report"}
                </Sub>
                {l.ltd <= TODAY() ? (
                  <Chip tone="good" className="justify-self-start">
                    Long-term (12.5%)
                  </Chip>
                ) : (
                  <span className="flex flex-wrap items-center gap-2">
                    <Chip tone="wait">Short-term</Chip>
                    <Sub>12.5% from {fmtDate(l.ltd)}</Sub>
                  </span>
                )}
              </div>
              <div className="grid content-start justify-items-end">
                <b className="num">{d(l.p)}</b>
                <Sub className={r.price - l.p >= 0 ? "text-gain" : "text-loss"}>
                  {sgn(r.price - l.p)}
                  {d(Math.abs((r.price - l.p) * l.q))}
                </Sub>
              </div>
            </li>
          ))}
        </ul>
        <p className="note">
          Foreign shares and funds held more than 24 months are long-term: gains taxed at 12.5%. Before that, at your slab rate. Each
          purchase has its own date; sales take the oldest units first.
        </p>
      </Section>
    </>
  );
}

/** the details sheet for one holding, opened from any list, moon or chart */
export function HoldingSheet() {
  const { S, model } = usePortfolio(),
    { picked, closeItem } = useUi();
  const ref = useRef<HTMLDialogElement>(null);
  const it = picked ? model.cats[picked.cat]?.items.find((x) => x.id === picked.id) : null;
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (it && !d.open) {
      d.showModal();
      d.scrollTop = 0;
    }
    if (!it && d.open) d.close();
  }, [it]);
  return (
    <dialog
      ref={ref}
      onClose={closeItem}
      onClick={(e) => {
        if (e.target === ref.current) closeItem();
      }}
      aria-label="Holding details"
      className="m-auto max-h-[min(92vh,980px)] w-full max-w-[min(640px,calc(100vw-24px))] overflow-auto overscroll-contain rounded-[22px] bg-[#0d0822] p-0 text-ink shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12),0_40px_100px_-20px_#000] max-sm:m-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:max-w-none max-sm:rounded-none"
    >
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/12 bg-[#0d0822] px-4 py-3.5">
        <button type="button" className="btn min-w-10 px-3" onClick={closeItem} aria-label="Close">
          <Icon name="back" />
        </button>
        <h2 className="font-display text-[18px] font-semibold">Holding details</h2>
      </div>
      <div className="grid gap-3 p-4">
        {it && S && (it.india && S.india ? <IndiaDetail h={it.india} I={S.india} /> : it.sym ? <AbroadDetail S={S} sym={it.sym} /> : null)}
      </div>
    </dialog>
  );
}
