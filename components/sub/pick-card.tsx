"use client";

import { useState, type FormEvent } from "react";
import { usePortfolio } from "@/components/providers/portfolio-provider";
import { useUi } from "@/components/providers/ui-provider";
import { normSym, pickBest, show, type Pick } from "@/lib/core/pick";
import { cloudErr, liveQuotes } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Card, CardHead, Chip } from "./ui";
import { Icon } from "./icon";

const V = { best: ["good", "Best fit"], ok: ["neutral", "Fits"], skip: ["act", "Skip"] } as const;

/** you name a few tickers and the money you have; each is scored against your plan with live prices */
export function PickCard() {
  const { S } = usePortfolio(),
    { toast } = useUi();
  const usd0 = S ? Math.round((S.settings.monthlyInr / S.settings.fx) * (1 - (S.settings.feePct || 0) / 100) * 100) / 100 : 100;
  const [text, setText] = useState(""),
    [amt, setAmt] = useState(String(usd0)),
    [res, setRes] = useState<Pick[] | null>(null),
    [busy, setBusy] = useState(false),
    [err, setErr] = useState("");
  if (!S) return null;
  const run = async (e?: FormEvent) => {
    e?.preventDefault();
    const syms = [
        ...new Set(
          text
            .split(/[\s,;/]+/)
            .filter(Boolean)
            .map(normSym),
        ),
      ].slice(0, 8),
      amount = +amt;
    if (!syms.length || !(amount > 0)) return setErr("Type at least one ticker and an amount.");
    setBusy(true);
    setErr("");
    try {
      const L = await liveQuotes(syms);
      setRes(pickBest(S, syms, amount, L.quotes));
    } catch (x) {
      setErr(cloudErr(x));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card id="pick" className="scroll-mt-24">
      <CardHead
        title="Which should I buy?"
        note="Type the tickers you're considering and the money in your INDmoney wallet. Each is checked against your plan with live prices."
      />
      <form onSubmit={(e) => void run(e)} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_10rem_auto] md:items-end">
        <label className="grid gap-1.5">
          <span className="kicker">Tickers</span>
          <input
            className="field-input"
            placeholder="e.g. CSPX, VOO, IJPA, NVDA, TSM"
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoCapitalize="characters"
          />
        </label>
        <label className="grid gap-1.5">
          <span className="kicker">Amount ($)</span>
          <input className="field-input num" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} />
        </label>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          <Icon name={busy ? "refresh" : "bulb"} className={busy ? "animate-spin" : ""} />
          {busy ? "Checking…" : "Check"}
        </button>
      </form>
      <div className="flex flex-wrap gap-1.5 text-[13px]">
        <span className="text-muted">Try:</span>
        {["CSPX, IJPA, CNDX, COPX, TSM", "VOO, CSPX", "NVDA, MSFT, CNDX"].map((x) => (
          <button
            key={x}
            type="button"
            className="rounded-full bg-tint px-3 py-1 font-semibold text-body active:scale-95"
            onClick={() => setText(x)}
          >
            {x}
          </button>
        ))}
      </div>
      {err && <p className="text-loss-ink">{err}</p>}
      {res && (
        <ol className="grid gap-2.5">
          {res.map((p, i) => (
            <li
              key={p.sym}
              className={cn(
                "grid gap-2 rounded-[16px] p-4",
                p.verdict === "best" ? "bg-gain-wash shadow-[inset_0_0_0_2px_var(--color-act-a)]" : "bg-tint",
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span className="grid size-7 place-items-center rounded-full bg-card font-display text-[14px] font-bold">{i + 1}</span>
                  <b className="font-display text-[18px] text-ink">{show(p.sym)}</b>
                  <span className="text-[13px] text-muted">{p.name}</span>
                </span>
                <Chip tone={V[p.verdict][0]}>{V[p.verdict][1]}</Chip>
              </div>
              <ul className="grid list-disc gap-1 pl-5 text-[14px] text-body">
                {p.why.map((w, k) => (
                  <li key={k}>{w}</li>
                ))}
              </ul>
              {p.verdict !== "skip" && p.limit && (
                <div className="flex flex-wrap items-center gap-3 rounded-[12px] bg-card p-3">
                  <code className="num min-w-0 flex-1 font-mono text-[14.5px] font-semibold text-ink">
                    BUY {p.units} {show(p.sym)} · LIMIT ${p.limit.toFixed(2)} (≈ ${p.usd.toFixed(2)})
                  </code>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      void navigator.clipboard?.writeText(`BUY ${p.units} ${show(p.sym)} LIMIT $${p.limit!.toFixed(2)}`).catch(() => {});
                      toast("Order copied: enter it in INDmoney");
                    }}
                  >
                    Copy
                  </button>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
      <p className="note">
        Ranked by your own plan&apos;s rules, not a market forecast. Splitting across the top two is fine too: the monthly split above does
        that. Not SEBI-registered advice.
      </p>
    </Card>
  );
}
