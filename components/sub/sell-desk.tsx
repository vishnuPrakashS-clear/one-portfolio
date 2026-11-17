"use client";

import { useState } from "react";
import { usePortfolio } from "@/components/providers/portfolio-provider";
import { useUi } from "@/components/providers/ui-provider";
import { CATALOG, holdingRows } from "@/lib/core/abroad";
import { sellTicket } from "@/lib/core/rebalance";
import { fmtDate } from "@/lib/dates";
import { inr, tk } from "@/lib/format";
import { liveQuotes, cloudErr, type LiveQuotes } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Card, CardHead, Chip } from "./ui";
import { Icon } from "./icon";
import { RebalanceCard } from "./rebalance-card";
import { PickCard } from "./pick-card";

const $ = (v: number, dp = 2) =>
  (v < 0 ? "−" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
const units = (q: number) => (+q.toFixed(4)).toString();
const signInr = (v: number) => (v < 0 ? "−" : "+") + inr(Math.abs(Math.round(v)));
const ist = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function Ticket({ sym, live }: { sym: string; live: LiveQuotes | null }) {
  const { S } = usePortfolio(),
    { toast } = useUi();
  const h = S!.holdings.find((x) => x.sym === sym)!,
    q = live?.quotes[sym],
    fx = live?.fx?.rate || S!.settings.fx,
    mkt = q?.price ?? h.price ?? 0;
  const first = sellTicket(S!, sym, 0, mkt, fx)!;
  const [qty, setQty] = useState(first.ltQty > 0 ? Math.min(first.ltQty, first.noLossQty || first.ltQty) : first.noLossQty),
    [px, setPx] = useState(+mkt.toFixed(2));
  const t = sellTicket(S!, sym, qty, px, fx)!;
  const gain = t.gainLT + t.gainST,
    loss = px < t.breakeven - 1e-6 && qty > 0;
  const order = `SELL ${units(t.qty)} ${tk(sym)} · LIMIT $${px.toFixed(2)}`;
  const qOpts: [string, number][] = (
    [
      ["Long-term units", t.ltQty],
      ["No-loss units", t.noLossQty],
      ["Half", t.held / 2],
      ["All", t.held],
    ] as [string, number][]
  ).filter(([, v], i, a) => v > 1e-6 && a.findIndex(([, w]) => Math.abs(w - v) < 1e-6) === i);
  const pOpts: [string, number][] = (
    [
      [q ? "Live" : "Last price", mkt],
      ["+0.5%", mkt * 1.005],
      ["No-loss", t.qty ? t.breakeven : 0],
      ["Day high", q?.dayHigh || 0],
    ] as [string, number][]
  ).filter(([, v]) => v > 0);
  return (
    <div className="grid gap-4 border-t border-rule px-4 pt-4 pb-5">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-1.5">
          <span className="kicker">Units to sell (of {units(t.held)})</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.0001"
            min={0}
            max={t.held}
            className="field-input num text-[20px] font-semibold"
            value={units(qty)}
            onChange={(e) => setQty(Math.max(0, Math.min(t.held, +e.target.value || 0)))}
          />
          <span className="flex flex-wrap gap-1.5">
            {qOpts.map(([l, v]) => (
              <button
                key={l}
                type="button"
                onClick={() => setQty(v)}
                className={cn(
                  "rounded-full px-3 py-1 text-[13px] font-semibold active:scale-95",
                  Math.abs(qty - v) < 1e-6 ? "bg-act-a text-on-act" : "bg-tint text-body",
                )}
              >
                {l} <span className="num opacity-75">{units(v)}</span>
              </button>
            ))}
          </span>
        </label>
        <label className="grid gap-1.5">
          <span className="kicker">Limit price ($)</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min={0}
            className="field-input num text-[20px] font-semibold"
            value={px}
            onChange={(e) => setPx(Math.max(0, +e.target.value || 0))}
          />
          <span className="flex flex-wrap gap-1.5">
            {pOpts.map(([l, v]) => (
              <button
                key={l}
                type="button"
                onClick={() => setPx(+v.toFixed(2))}
                className={cn(
                  "rounded-full px-3 py-1 text-[13px] font-semibold active:scale-95",
                  Math.abs(px - +v.toFixed(2)) < 0.005 ? "bg-act-a text-on-act" : "bg-tint text-body",
                )}
              >
                {l} <span className="num opacity-75">{$(v)}</span>
              </button>
            ))}
          </span>
        </label>
      </div>

      <div className="grid grid-cols-4 gap-2 max-md:grid-cols-2">
        {[
          ["You get", $(t.proceeds), `≈ ${inr(Math.round(t.proceeds * fx))}`],
          [gain >= 0 ? "Gain (₹)" : "Loss (₹)", signInr(gain), `long ${signInr(t.gainLT)} · short ${signInr(t.gainST)}`],
          ["Tax", inr(Math.round(t.tax)), t.gainST > 0 ? "short-term at your slab" : "12.5% long-term"],
          ["No-loss price", t.qty ? $(t.breakeven) : "—", "for these units"],
        ].map(([k, v, n]) => (
          <div key={k} className="grid gap-0.5 rounded-[14px] bg-tint px-3.5 py-3">
            <span className="kicker">{k}</span>
            <b className={cn("num font-display text-[19px]", k.startsWith("Loss") ? "text-loss-ink" : "text-ink")}>{v}</b>
            <span className="text-[12px] text-muted">{n}</span>
          </div>
        ))}
      </div>

      {t.chunks.length > 0 && (
        <ul className="grid gap-1 text-[13.5px] text-body">
          {t.chunks.map((c, i) => (
            <li key={i} className="flex flex-wrap justify-between gap-x-3">
              <span>
                {units(c.q)} bought {fmtDate(c.d)} at {$(c.p)} (₹{c.fxBuy.toFixed(2)}/$) ·{" "}
                {c.isLT ? <span className="text-gain-ink">long-term</span> : <span>short-term until {fmtDate(c.ltd)}</span>}
              </span>
              <span className={cn("num", c.gain >= 0 ? "text-gain-ink" : "text-loss-ink")}>{signInr(c.gain)}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-2 text-[14px]">
        {loss && (
          <p className="rounded-[12px] bg-loss-wash p-3 text-body">
            At {$(px)} this is a rupee loss. Fine if you want the loss to cut tax on other gains this year; otherwise set the limit at{" "}
            <b className="text-ink">{$(t.breakeven)}</b> or above.
          </p>
        )}
        {t.gainST > 0 && t.nextLT && (
          <p className="rounded-[12px] bg-warn/10 p-3 text-body">
            Some units are under 24 months old. Selling only the long-term ones now, and the rest after{" "}
            <b className="text-ink">{fmtDate(t.nextLT)}</b>, saves about <b className="text-ink">{inr(Math.round(t.waitSaves))}</b>.
          </p>
        )}
        {q && !q.open && (
          <p className="text-muted">
            Market closed{q.opens ? `; opens ${ist(q.opens)} IST` : ""}. A limit order placed now waits for the open.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-[14px] bg-card p-3 shadow-[inset_0_0_0_2px_var(--color-act-a)]">
        <code className="num min-w-0 flex-1 font-mono text-[15px] font-semibold text-ink">{order}</code>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!t.qty}
          onClick={() => {
            void navigator.clipboard?.writeText(order).catch(() => {});
            toast("Order copied: enter it in INDmoney");
          }}
        >
          <Icon name="check" />
          Copy order
        </button>
      </div>
      <p className="note">
        In INDmoney: US Stocks → the holding → Sell → Limit, enter the units and price above. INDmoney sells your oldest units first, as
        worked out here. You place it; nothing is sent from this app. Not SEBI-registered advice.
      </p>
    </div>
  );
}

/** pick a holding abroad, see its live price, and get a sell order with the rupee gain and Indian tax */
function SellTicketCard({ live }: { live: LiveQuotes | null }) {
  const { S } = usePortfolio();
  const [scope, setScope] = useState<"us" | "lse" | "all">("us"),
    [open, setOpen] = useState<string | null>(null);
  const fx = live?.fx?.rate || S!.settings.fx;
  const rows = holdingRows(S!)
    .filter((r) => (scope === "all" ? true : scope === "us" ? !r.sym.startsWith("LSE~") : r.sym.startsWith("LSE~")))
    .map((r) => {
      const t = sellTicket(S!, r.sym, r.q, live?.quotes[r.sym]?.price ?? r.price, fx)!;
      return { r, t, q: live?.quotes[r.sym] };
    })
    .sort((a, b) => b.t.proceeds - a.t.proceeds);
  return (
    <Card id="sell" className="scroll-mt-24">
      <CardHead title="Sell a holding" note="Tap one to build the order: units, limit price, rupee gain and tax." />
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ["us", "US-listed stocks & ETFs"],
            ["lse", "London (UCITS)"],
            ["all", "All"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            type="button"
            aria-pressed={scope === k}
            onClick={() => setScope(k)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-[13.5px] font-semibold active:scale-95",
              scope === k ? "bg-act-a text-on-act" : "bg-tint text-body hover:shadow-[inset_0_0_0_2px_var(--color-act-a)]",
            )}
          >
            {l}
          </button>
        ))}
      </div>
      <ul className="grid gap-2">
        {rows.map(({ r, t, q }) => {
          const on = open === r.sym,
            g = t.gainLT + t.gainST,
            day = q?.prevClose ? q.price / q.prevClose - 1 : null;
          return (
            <li key={r.sym} className={cn("overflow-hidden rounded-[16px] bg-tint", on && "shadow-[inset_0_0_0_2px_var(--color-act-a)]")}>
              <button
                type="button"
                aria-expanded={on}
                onClick={() => setOpen(on ? null : r.sym)}
                className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 p-3.5 text-left"
              >
                <span className="min-w-0">
                  <b className="text-ink">{tk(r.sym)}</b>{" "}
                  <span className="text-[13px] text-muted">
                    {units(r.q)} units · {CATALOG[r.sym]?.name || r.name}
                  </span>
                  <span className="mt-0.5 flex flex-wrap gap-1.5">
                    {t.ltQty >= r.q - 1e-6 ? (
                      <Chip tone="good">All long-term</Chip>
                    ) : t.ltQty > 0 ? (
                      <Chip tone="wait">{units(t.ltQty)} long-term</Chip>
                    ) : (
                      <Chip tone="wait">Long-term from {t.nextLT ? fmtDate(t.nextLT) : "—"}</Chip>
                    )}
                    {r.plan === "legacy" && <Chip>Exiting</Chip>}
                  </span>
                </span>
                <span className="grid text-right">
                  <b className="num text-ink">{$(t.price)}</b>
                  <span className={cn("num text-[12.5px]", day == null ? "text-muted" : day >= 0 ? "text-gain-ink" : "text-loss-ink")}>
                    {day == null ? "last upload" : `${day >= 0 ? "+" : "−"}${Math.abs(day * 100).toFixed(2)}% today`}
                  </span>
                  <span className={cn("num text-[12.5px]", g >= 0 ? "text-gain-ink" : "text-loss-ink")}>{signInr(g)}</span>
                </span>
                <Icon name="chevron" className={cn("size-5 text-muted transition", on && "rotate-90")} />
              </button>
              {on && <Ticket key={`${r.sym}-${live?.fetchedAt || ""}`} sym={r.sym} live={live} />}
            </li>
          );
        })}
        {!rows.length && <li className="text-muted">No holdings here.</li>}
      </ul>
    </Card>
  );
}

/** live prices (on demand) shared by the rebalance planner and the sell ticket */
export function SellDesk() {
  const { S } = usePortfolio();
  const [live, setLive] = useState<LiveQuotes | null>(null),
    [busy, setBusy] = useState(false),
    [err, setErr] = useState("");
  if (!S) return null;
  const syms = S.holdings.filter((h) => h.lots.some((l) => l.q > 0)).map((h) => h.sym);
  const get = async () => {
    setBusy(true);
    setErr("");
    try {
      setLive(await liveQuotes(syms));
    } catch (e) {
      setErr(cloudErr(e));
    } finally {
      setBusy(false);
    }
  };
  const got = live ? Object.keys(live.quotes).length : 0,
    anyOpen = live && Object.values(live.quotes).some((q) => q.open);
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 rounded-[18px] bg-card p-4 shadow-[inset_0_0_0_1px_var(--color-line)]">
        <button type="button" className="btn btn-primary" onClick={() => void get()} disabled={busy}>
          <Icon name="refresh" className={busy ? "animate-spin" : ""} />
          {busy ? "Getting prices…" : live ? "Refresh live prices" : "Get live prices"}
        </button>
        <span className="min-w-0 flex-1 text-[14px] text-body">
          {err ? (
            <span className="text-loss-ink">Couldn&apos;t get prices: {err}</span>
          ) : live ? (
            <>
              {got} of {syms.length} prices as of {ist(live.fetchedAt)} IST
              {live.fx ? ` · ₹${live.fx.rate}/$` : ""} · market {anyOpen ? "open" : "closed"}. The rebalance and sell orders below use them.
            </>
          ) : (
            <>
              Using prices from your last upload. Get live prices before placing an order (US market: about 8:00 PM–2:30 AM IST, 7:00 PM in
              US summer).
            </>
          )}
        </span>
      </div>
      <PickCard />
      <SellTicketCard live={live} />
      <RebalanceCard
        live={
          live
            ? { prices: Object.fromEntries(Object.entries(live.quotes).map(([k, v]) => [k, v.price])), fx: live.fx?.rate || S.settings.fx }
            : null
        }
      />
    </>
  );
}
