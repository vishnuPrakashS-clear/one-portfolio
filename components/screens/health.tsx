"use client";

/* Portfolio health: a Tickertape-style check of everything you hold. Opens up every fund to show the companies you
   really own, scores how well it is spread (0–100), finds funds that repeat each other, grades each fund against its
   category and each stock on valuation, growth, quality and momentum, flags risky stocks, and turns it all into a short,
   ordered list of what to do. Market data comes from the shared tables the market-data function fills. */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePortfolio } from "@/components/providers/portfolio-provider";
import { useUi } from "@/components/providers/ui-provider";
import {
  analyse,
  isinOf,
  BUCKET_NAME,
  CAP_NAME,
  type Analysis,
  type Bucket,
  type Exposure,
  type FundRow,
  type StockRow,
} from "@/lib/analysis";
import { fillMarketData, loadMarketData } from "@/lib/supabase";
import { monthLong } from "@/lib/dates";
import { useMoney } from "@/lib/use-money";
import { cn } from "@/lib/utils";
import type { MarketData } from "@/types/market";
import { Card, CardHead, Chip, Hero, Pill } from "@/components/sub/ui";
import { Icon } from "@/components/sub/icon";
import { PlanCards } from "./health-plan";

const BUCKET_COLOR: Record<Bucket, string> = {
  equity: "#a78bfa",
  intl: "#f472b6",
  debt: "#22d3ee",
  gold: "#fbbf24",
  cash: "#94a3b8",
  other: "#64748b",
};
const SECTOR_COLORS = ["#c4f25a", "#5fe37a", "#22d3ee", "#a78bfa", "#f472b6", "#fbbf24", "#fb923c", "#60a5fa", "#2dd4bf", "#e879f9"];
const LEVEL: Record<1 | 2 | 3, { label: string; tone: "act" | "wait" | "good" }> = {
  1: { label: "Do first", tone: "act" },
  2: { label: "Next", tone: "wait" },
  3: { label: "Worth considering", tone: "good" },
};
const pc = (x: number) => `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;
const toneColor = (v: number | null) =>
  v == null ? "#3a413c" : v >= 70 ? "#4ade80" : v >= 45 ? "#c4f25a" : v >= 25 ? "#fbbf24" : "#f87171";

type Load = { data: MarketData | null; error: string | null; filling: boolean };

export function HealthScreen() {
  const { S, model, locked, mode } = usePortfolio();
  const { openItem } = useUi();
  const { m, s } = useMoney();
  const [load, setLoad] = useState<Load>({ data: null, error: null, filling: false });
  const [nonce, setNonce] = useState(0);

  // what to ask the shared tables about: every fund, ETF and stock you hold
  const ids = useMemo(() => {
    const f: string[] = [],
      st: string[] = [],
      isin = S ? isinOf(S) : (h: { isin: string }) => h.isin;
    for (const it of model.cats.funds.items.concat(model.cats.stocks.items)) {
      const h = it.india;
      if (!h) continue;
      if (h.type === "mf" || h.type === "etf") {
        const i = isin(h);
        if (i) f.push(i);
      } else if (h.type === "stock") st.push(h.isin);
    }
    return { f, st, key: f.join() + "|" + st.join() };
  }, [model, S]);

  useEffect(() => {
    if (!S || locked || (!ids.f.length && !ids.st.length)) return;
    let live = true;
    (async () => {
      try {
        let D = await loadMarketData(ids.f, ids.st);
        if (!live) return;
        setLoad({ data: D, error: null, filling: false });
        // anything never fetched: ask the server for a few batches now (the nightly job fills the rest)
        const missing = ids.f.filter((x) => !D.funds[x]).length + ids.st.filter((x) => !D.stocks[x]).length;
        if (missing && mode === "sb") {
          setLoad((l) => ({ ...l, filling: true }));
          for (let i = 0; i < 3 && live; i++) {
            const r = await fillMarketData().catch(() => null);
            if (!r || !r.todo || (r.todo.funds === 0 && r.todo.stocks === 0)) break;
          }
          D = await loadMarketData(ids.f, ids.st);
          if (live) setLoad({ data: D, error: null, filling: false });
        }
      } catch (e) {
        if (live) setLoad({ data: null, error: e instanceof Error ? e.message : String(e), filling: false });
      }
    })();
    return () => {
      live = false;
    };
    // ids.key stands for both lists
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [S == null, locked, ids.key, nonce, mode]);

  const A: Analysis | null = useMemo(() => (S && load.data ? analyse(model, S, load.data) : null), [S, model, load.data]);

  if (!S || !model.total) {
    return (
      <Hero badge="Portfolio health" title="How well is your money spread?" big={false} art="health">
        <p className="max-w-[60ch] text-[16.5px] text-body">
          Upload your CDSL statement and broker reports. This screen opens up every fund to show the companies you really own, scores your
          diversification, finds funds that hold the same stocks and tells you what to change.
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

  const extra = A ? { score: A.score, parts: A.parts.map((p) => p.score / p.max), band: A.band?.label || null } : undefined;
  return (
    <>
      <Hero
        badge="Portfolio health"
        color="#c4f25a"
        title={A?.score != null ? `${A.score} / 100` : "Checking…"}
        art="health"
        artExtra={extra}
      >
        {A?.band ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone={A.band.tone}>{A.band.label} diversification</Chip>
              {A.overDiversified.length > 0 && <Chip tone="wait">Over-diversified: {A.overDiversified.join(", ")}</Chip>}
            </div>
            <p className="max-w-[56ch] text-[16.5px] text-body">{A.band.text}</p>
            <div className="flex flex-wrap gap-2">
              <Pill>{A.exposures.length} companies inside everything you own</Pill>
              <Pill>
                {A.coverage.fundsWithData} of {A.coverage.funds} funds opened up
              </Pill>
              {A.asOf && <Pill>Fund holdings as of {monthLong(A.asOf.slice(0, 7))}</Pill>}
              <a href="#plan" className="btn btn-primary">
                <Icon name="arrow" />
                Your plan
              </a>
            </div>
          </>
        ) : (
          <p className="max-w-[56ch] text-[16.5px] text-body">
            {load.error
              ? `Couldn't load market data: ${load.error}`
              : A && !load.filling
                ? `${A.coverage.fundsWithData} of ${A.coverage.funds} funds opened up so far. The score waits until most of your money inside funds can be seen; the rest is fetched overnight, or check again in a minute.`
                : "Reading what's inside each of your funds and how each stock is doing. The first time can take a minute."}
          </p>
        )}
        {(load.error || (A && A.score == null && !load.filling)) && (
          <div>
            <button className="btn" onClick={() => setNonce((n) => n + 1)}>
              <Icon name="refresh" />
              {load.error ? "Try again" : "Check again"}
            </button>
          </div>
        )}
      </Hero>

      {A && (
        <>
          <Breakdown A={A} />
          <Actions A={A} />
          {load.data && <PlanCards A={A} D={load.data} />}
          <Mix A={A} s={s} />
          <TopCompanies A={A} s={s} />
          <OverlapCard A={A} m={m} />
          <FundCards A={A} s={s} onOpen={(f) => openItem("funds", f.id)} />
          <StockCards A={A} s={s} onOpen={(r) => openItem("stocks", r.id)} />
          <About A={A} filling={load.filling} />
        </>
      )}
    </>
  );
}

function Bar({ v, color, className }: { v: number; color: string; className?: string }) {
  return (
    <span className={cn("block h-2 overflow-hidden rounded-full bg-tint-2", className)}>
      <i className="block h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, v * 100))}%`, background: color }} />
    </span>
  );
}

function Breakdown({ A }: { A: Analysis }) {
  return (
    <Card>
      <CardHead
        title="What the score is made of"
        note={
          A.score == null
            ? "So far, from the funds opened up only: these will move once the rest are read."
            : "Five checks, each scored from what you actually own once funds are opened up. Tickertape's bands: 76+ very good, 51–75 good, 26–50 low, 25 or less extremely low."
        }
      />
      <div className="grid gap-4 md:grid-cols-2">
        {A.parts.map((p) => (
          <div key={p.key} className="well grid gap-1.5 p-4">
            <div className="flex items-baseline justify-between gap-3">
              <b className="font-semibold text-ink">{p.label}</b>
              <span className="num font-display font-bold text-ink">
                {p.score}
                <span className="text-muted"> / {p.max}</span>
              </span>
            </div>
            <Bar v={p.score / p.max} color={toneColor((100 * p.score) / p.max)} />
            <p className="note">{p.note}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Actions({ A }: { A: Analysis }) {
  return (
    <Card>
      <CardHead
        title={
          <>
            <Icon name="bulb" className="size-5 text-lime" />
            What to do
          </>
        }
        note="Most useful first. Diversifying doesn't raise returns by itself; it stops one company, sector or fund from setting them. The levers that do lift what you keep are lower costs, funds that keep beating their category, the right mix for each goal's timeline, and staying invested."
      />
      {A.actions.length ? (
        <ol className="grid gap-3">
          {A.actions.map((a, i) => (
            <li
              key={i}
              className="well grid gap-2 p-4"
              style={{ boxShadow: `inset 3px 0 0 ${toneColor(a.level === 1 ? 10 : a.level === 2 ? 35 : 80)}` }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone={LEVEL[a.level].tone}>{LEVEL[a.level].label}</Chip>
                {a.impact && <Chip tone="good">{a.impact}</Chip>}
              </div>
              <b className="font-display text-[17px] leading-snug font-semibold text-ink">{a.title}</b>
              <p className="text-[14.5px] leading-relaxed text-body">{a.body}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="well p-4 text-body">Nothing stands out. Keep investing steadily and check back after your next statement.</p>
      )}
      <p className="note">
        A planning aid built from public data, not SEBI-registered advice. Check exit loads and tax before moving money, and talk to an
        adviser for big changes.
      </p>
    </Card>
  );
}

function Mix({ A, s }: { A: Analysis; s: (v: number) => string }) {
  const bk = (Object.keys(A.buckets) as Bucket[]).filter((b) => A.buckets[b] > 0).sort((a, b) => A.buckets[b] - A.buckets[a]);
  const sec = A.sectors.slice(0, 10),
    capT = Object.values(A.caps).reduce((a, b) => a + b, 0) || 1;
  return (
    <Card>
      <CardHead title="Where your money really is" note="Every fund opened up and added to your own shares, bonds and money abroad." />
      <div className="grid gap-2">
        <div className="flex h-4 overflow-hidden rounded-full bg-tint-2">
          {bk.map((b) => (
            <i key={b} style={{ width: `${(100 * A.buckets[b]) / A.total}%`, background: BUCKET_COLOR[b] }} title={BUCKET_NAME[b]} />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[13.5px]">
          {bk.map((b) => (
            <span key={b} className="inline-flex items-center gap-2 text-body">
              <i className="size-2.5 rounded-full" style={{ background: BUCKET_COLOR[b] }} />
              {BUCKET_NAME[b]} <b className="num text-ink">{pc(A.buckets[b] / A.total)}</b>
              <span className="text-muted">{s(A.buckets[b])}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="grid content-start gap-3">
          <h3 className="kicker">Sectors (share of your stocks)</h3>
          {sec.map((x, i) => (
            <div key={x.name} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
              <span className="truncate text-[14px] text-body">{x.name}</span>
              <b className="num text-[14px] text-ink">{pc(x.pct)}</b>
              <Bar v={x.pct / (sec[0]?.pct || 1)} color={SECTOR_COLORS[i % SECTOR_COLORS.length]} className="col-span-2" />
            </div>
          ))}
        </div>
        <div className="grid content-start gap-3">
          <h3 className="kicker">Company size (share of your stocks)</h3>
          {(["L", "M", "S", "F", "?"] as const)
            .filter((c) => A.caps[c] > 0)
            .map((c) => (
              <div key={c} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
                <span className="text-[14px] text-body">
                  {CAP_NAME[c]}
                  {c === "L" ? " (top 100)" : c === "M" ? " (101–250)" : c === "S" ? " (251+)" : c === "?" ? " (not on NSE's top 750)" : ""}
                </span>
                <b className="num text-[14px] text-ink">{pc(A.caps[c] / capT)}</b>
                <Bar
                  v={A.caps[c] / capT}
                  color={{ L: "#c4f25a", M: "#22d3ee", S: "#f472b6", F: "#a78bfa", "?": "#64748b" }[c]}
                  className="col-span-2"
                />
              </div>
            ))}
          <p className="note">A balanced split for long-term goals is about 55% large, 25% mid and 20% small.</p>
        </div>
      </div>
    </Card>
  );
}

function TopCompanies({ A, s }: { A: Analysis; s: (v: number) => string }) {
  const [all, setAll] = useState(false);
  const rows = A.exposures.slice(0, all ? 60 : 12);
  const via = (e: Exposure) => [e.direct ? "your shares" : null, ...e.via.map((v) => v.name)].filter(Boolean) as string[];
  return (
    <Card>
      <CardHead
        title="The companies you really own"
        note="Each company's total across your own shares and every fund that holds it. Funds that each look different can still pile into the same names."
      />
      <div className="-mx-2 overflow-x-auto px-2 max-sm:mx-0 max-sm:px-0">
        <table className="stack">
          <thead>
            <tr>
              <th>Company</th>
              <th className="text-right">Share of your stocks</th>
              <th className="text-right">Amount</th>
              <th>Through</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.key}>
                <td className="stack-full">
                  <b className="font-semibold text-ink">{e.name}</b>
                  <span className="block text-[12.5px] text-muted">
                    {e.sector}
                    {e.cap ? ` · ${CAP_NAME[e.cap]}` : ""}
                  </span>
                </td>
                <td data-label="Share of your stocks" className="num text-right">
                  {pc(e.pct)}
                </td>
                <td data-label="Amount" className="num text-right">
                  {s(e.value)}
                </td>
                <td data-label="Through" className="stack-full">
                  <span className="block max-w-[38ch] text-[13px] text-body max-sm:max-w-none">
                    {via(e).length} {via(e).length === 1 ? "place" : "places"}: {via(e).slice(0, 3).join(", ")}
                    {via(e).length > 3 ? ` +${via(e).length - 3} more` : ""}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {A.exposures.length > 12 && (
        <div>
          <button className="btn" onClick={() => setAll((x) => !x)}>
            {all ? "Show fewer" : A.exposures.length > 60 ? `Show the top 60 of ${A.exposures.length}` : `Show all ${A.exposures.length}`}
          </button>
        </div>
      )}
    </Card>
  );
}

function OverlapCard({ A, m }: { A: Analysis; m: (v: number) => string }) {
  const eq = A.funds.map((f, i) => ({ f, i })).filter(({ f }) => f.equity && f.data?.holdings?.length);
  const shown = eq.slice(0, 10);
  const [pick, setPick] = useState<[number, number] | null>(null);
  const get = (a: number, b: number) => A.overlaps.find((o) => (o.a === a && o.b === b) || (o.a === b && o.b === a));
  const cur = pick ? get(pick[0], pick[1]) : A.overlaps[0];
  if (eq.length < 2)
    return (
      <Card>
        <CardHead title="Fund overlap" note="With fewer than two equity funds opened up, there's nothing to compare yet." />
      </Card>
    );
  const heat = (p: number) => (p >= 40 ? "#f87171" : p >= 25 ? "#fbbf24" : p >= 10 ? "#3d453f" : "#262b28");
  return (
    <Card>
      <CardHead
        title="Fund overlap"
        note="How much of each pair of funds is the same stocks (the smaller weight of every shared stock, added up). Over 40% is high: the two funds mostly do the same job. Tap a square to see what they share."
      />
      <div className="-mx-2 overflow-x-auto px-2">
        <table className="w-auto border-separate border-spacing-1 text-[12.5px]">
          <thead>
            <tr>
              <th />
              {shown.map(({ f }, j) => (
                <th key={f.id} className="px-1 text-center font-semibold text-muted" title={f.short}>
                  {j + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map(({ f, i }, r) => (
              <tr key={f.id}>
                <th className="max-w-[24ch] truncate pr-2 text-left font-medium text-body max-sm:max-w-[13ch]" title={f.short}>
                  {r + 1}. {f.short}
                </th>
                {shown.map(({ i: k }) => {
                  if (k === i) return <td key={k} className="size-11 rounded-lg bg-tint" />;
                  const o = get(i, k),
                    p = o?.pct ?? 0,
                    on = pick && ((pick[0] === i && pick[1] === k) || (pick[0] === k && pick[1] === i));
                  return (
                    <td key={k} className="p-0">
                      <button
                        className={cn("num size-11 rounded-lg font-semibold", on && "ring-2 ring-lime")}
                        style={{ background: heat(p), color: p >= 25 ? "#0d1a07" : "#c8d0c9" }}
                        onClick={() => setPick([i, k])}
                        aria-label={`${f.short} and ${A.funds[k].short}: ${Math.round(p)}% the same`}
                      >
                        {Math.round(p)}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cur && (
        <div className="well grid gap-2 p-4">
          <b className="text-ink">
            {A.funds[cur.a].short} & {A.funds[cur.b].short}: {Math.round(cur.pct)}% the same
          </b>
          <p className="note">
            {m(A.funds[cur.a].value)} and {m(A.funds[cur.b].value)} invested. Shared stocks (weight in each fund):
          </p>
          <div className="flex flex-wrap gap-2">
            {cur.common.map((c) => (
              <Chip key={c.name}>
                {c.name} {c.wa.toFixed(1)}% · {c.wb.toFixed(1)}%
              </Chip>
            ))}
          </div>
        </div>
      )}
      {eq.length > 10 && <p className="note">Showing your 10 largest equity funds of {eq.length}.</p>}
    </Card>
  );
}

function FundCards({ A, s, onOpen }: { A: Analysis; s: (v: number) => string; onOpen: (f: FundRow) => void }) {
  const rows = A.funds.filter((f) => f.data?.info);
  const missing = A.funds.filter((f) => !f.data?.info);
  const V = { good: ["good", "Doing well"], ok: ["neutral", "Fine"], review: ["act", "Review"], unknown: ["neutral", "No data"] } as const;
  return (
    <Card>
      <CardHead
        title="Fund report card"
        note="Each fund against the average of funds of its kind, its cost, and anything worth a second look. Returns are yearly averages."
      />
      <div className="-mx-2 overflow-x-auto px-2 max-sm:mx-0 max-sm:px-0">
        <table className="stack">
          <thead>
            <tr>
              <th>Fund</th>
              <th className="text-right">Yours</th>
              <th className="text-right">3 years vs kind</th>
              <th className="text-right">5 years vs kind</th>
              <th className="text-right">Yearly cost</th>
              <th>Verdict</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => {
              const i = f.data!.info!;
              const vs = (r: number | null, c: number | null) =>
                r == null ? (
                  "—"
                ) : (
                  <>
                    <span className={cn(c != null && (r >= c ? "text-gain-ink" : "text-loss-ink"))}>{r.toFixed(1)}%</span>
                    {c != null && <span className="block text-[12px] text-muted">kind {c.toFixed(1)}%</span>}
                  </>
                );
              return (
                <tr key={f.id} className="cursor-pointer hover:bg-tint" onClick={() => onOpen(f)}>
                  <td className="stack-full">
                    <b className="font-semibold text-ink">{f.short}</b>
                    <span className="block text-[12.5px] text-muted">
                      {[i.sub, i.plan, i.risk ? `${i.risk} risk` : null].filter(Boolean).join(" · ")}
                    </span>
                    {f.flags.length > 0 && (
                      <ul className="mt-1.5 grid gap-1">
                        {f.flags.map((g, k) => (
                          <li
                            key={k}
                            className={cn(
                              "text-[12.5px]",
                              g.tone === "good" ? "text-gain-ink" : g.tone === "act" ? "text-loss-ink" : "text-warn-ink",
                            )}
                          >
                            {g.tone === "good" ? "✓ " : g.tone === "act" ? "! " : "• "}
                            {g.text}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td data-label="Yours" className="num text-right">
                    {s(f.value)}
                  </td>
                  <td data-label="3 years vs kind" className="num text-right">
                    {vs(i.r3, i.c3)}
                  </td>
                  <td data-label="5 years vs kind" className="num text-right">
                    {vs(i.r5, i.c5)}
                  </td>
                  <td data-label="Yearly cost" className="num text-right">
                    {i.er != null ? `${i.er.toFixed(2)}%` : "—"}
                  </td>
                  <td data-label="Verdict">
                    <Chip tone={V[f.verdict][0]}>{V[f.verdict][1]}</Chip>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {missing.length > 0 && (
        <p className="note">
          Not found yet: {missing.map((f) => f.short).join(", ")}. These are counted by their type (equity, debt, gold) until their holdings
          load.
        </p>
      )}
    </Card>
  );
}

function Score({ v }: { v: number | null }) {
  return (
    <span className="inline-grid w-[74px] gap-1 max-sm:w-full">
      <span className="num text-[13px] font-semibold text-ink">{v == null ? "—" : v}</span>
      <Bar v={(v ?? 0) / 100} color={toneColor(v)} />
    </span>
  );
}
function StockCards({ A, s, onOpen }: { A: Analysis; s: (v: number) => string; onOpen: (r: StockRow) => void }) {
  const [all, setAll] = useState(false);
  if (!A.stocks.length) return null;
  const rows = A.stocks.slice(0, all ? 400 : 15);
  return (
    <Card>
      <CardHead
        title="Stock scorecard and red flags"
        note="Each stock you hold directly, scored 0–100 like Tickertape: valuation (P/E against its industry), growth (sales and profit), quality (return on equity, debt, losses) and momentum (price over 6 and 12 months)."
        right={
          A.flagged.count > 0 ? (
            <Chip tone="act">
              {A.flagged.count} flagged · {pc(A.flagged.pct)} of your money
            </Chip>
          ) : (
            <Chip tone="good">No red flags</Chip>
          )
        }
      />
      <div className="-mx-2 overflow-x-auto px-2 max-sm:mx-0 max-sm:px-0">
        <table className="stack">
          <thead>
            <tr>
              <th>Stock</th>
              <th className="text-right">Yours</th>
              <th>Valuation</th>
              <th>Growth</th>
              <th>Quality</th>
              <th>Momentum</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="cursor-pointer hover:bg-tint" onClick={() => onOpen(r)}>
                <td className="stack-full">
                  <b className="font-semibold text-ink">{r.name}</b>
                  <span className="block text-[12.5px] text-muted">
                    {r.industry}
                    {r.cap ? ` · ${CAP_NAME[r.cap]}` : ""}
                    {r.data?.info?.pe ? ` · P/E ${Math.round(r.data.info.pe)}` : ""}
                  </span>
                  {r.flags.map((f) => (
                    <span key={f} className="mt-1 block text-[12.5px] text-loss-ink">
                      ! {f}
                    </span>
                  ))}
                </td>
                <td data-label="Yours" className="num text-right">
                  {s(r.value)}
                  <span className="block text-[12px] text-muted">{pc(r.pct)}</span>
                </td>
                <td data-label="Valuation">
                  <Score v={r.scores.valuation} />
                </td>
                <td data-label="Growth">
                  <Score v={r.scores.growth} />
                </td>
                <td data-label="Quality">
                  <Score v={r.scores.quality} />
                </td>
                <td data-label="Momentum">
                  <Score v={r.scores.momentum} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {A.stocks.length > 15 && (
        <div>
          <button className="btn" onClick={() => setAll((x) => !x)}>
            {all ? "Show fewer" : `Show all ${A.stocks.length}`}
          </button>
        </div>
      )}
    </Card>
  );
}

function About({ A, filling }: { A: Analysis; filling: boolean }) {
  return (
    <Card>
      <CardHead title="Where this comes from" />
      <ul className="grid gap-2 text-[14px] text-body">
        <li>
          • What each fund holds, its category average, cost and size: the fund&apos;s latest monthly portfolio as published on Groww&apos;s
          public fund pages. Stock fundamentals from Groww&apos;s public stock pages. Sectors and large / mid / small from NSE&apos;s
          official index lists.
        </li>
        <li>
          • Refreshed every night for everything anyone using this app holds; nothing about you is sent, only the names of funds and stocks.
          {filling ? " Fetching the rest of yours now." : ""}
        </li>
        <li>
          • {A.coverage.fundsWithData} of {A.coverage.funds} funds and {A.coverage.stocksWithData} of {A.coverage.stocks} stocks have data.
          {A.mapped < 0.98
            ? ` ${pc(1 - A.mapped)} of your Indian shares are inside funds not opened up yet, so they're counted but not split by company.`
            : ""}
        </li>
        <li>
          • Red flags here: losses, heavy debt, promoters selling 5+ points in a year (once at or under 75%), a P/E over 3× its industry,
          micro-caps, and stocks with no market data.
        </li>
      </ul>
    </Card>
  );
}
