"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { usePortfolio } from "@/components/providers/portfolio-provider";
import { useUi } from "@/components/providers/ui-provider";
import { CATEGORIES, CAT_ORDER } from "@/constants";
import { goalCalc, projectAll } from "@/lib/model";
import { fmtDate, ist, longDate, monthLong, monthShort, nextRefresh, TODAY } from "@/lib/dates";
import { pct1 } from "@/lib/format";
import { useMoney } from "@/lib/use-money";
import { stagger, riseIn } from "@/lib/motion";
import { Card, CardHead, Empty, GainPill, Hero, Pill } from "@/components/sub/ui";
import { CountUp } from "@/components/sub/count-up";
import { Legend, StackChart } from "@/components/sub/charts";
import { GameLayer } from "@/components/sub/game-layer";
import { Icon } from "@/components/sub/icon";
import { useNow } from "@/lib/hooks";
import { VERDICTS } from "./goals";

function HistNote() {
  const { model } = usePortfolio();
  const miss = CAT_ORDER.reduce((a, id) => a + model.cats[id].histMissing, 0);
  return miss ? (
    <p className="note text-warn-ink">
      Some month-end prices are still being collected (the nightly job fills a few holdings at a time), so a few earlier months use the buy
      price for now.
    </p>
  ) : null;
}
export { HistNote };

/** play the last 12 months: planets and moons grow and shrink to each month-end value */
function Replay() {
  const { model } = usePortfolio(),
    { month, setMonth } = useUi();
  const n = model.months.length,
    [playing, setPlaying] = useState(false),
    t = useRef<ReturnType<typeof setInterval> | null>(null);
  const shown = month < 0 ? n - 1 : month;
  useEffect(
    () => () => {
      if (t.current) clearInterval(t.current);
      setMonth(-1);
    },
    [setMonth],
  );
  const play = () => {
    if (t.current) clearInterval(t.current);
    if (playing) {
      setPlaying(false);
      setMonth(-1);
      return;
    }
    let i = 0;
    setMonth(0);
    setPlaying(true);
    t.current = setInterval(() => {
      i++;
      if (i >= n - 1) {
        if (t.current) clearInterval(t.current);
        setPlaying(false);
        setMonth(-1);
      } else setMonth(i);
    }, 700);
  };
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3.5 rounded-full py-3 pr-5 pl-3 glass">
      <button
        type="button"
        onClick={play}
        aria-label={playing ? "Stop the replay" : "Replay the last 12 months"}
        className="grid size-11 cursor-pointer place-items-center rounded-full bg-gradient-to-br from-act-a to-act-b text-on-act shadow-[0_0_22px_-4px_var(--color-act-a)] active:scale-95"
      >
        <Icon name={playing ? "pause" : "play"} className="size-5" />
      </button>
      <div>
        <label htmlFor="mslider" className="mb-0.5 block text-[13px] text-muted">
          Replay your system: <b className="text-ink">{shown >= n - 1 ? "today" : monthLong(model.months[shown])}</b>
        </label>
        <input
          id="mslider"
          className="replay-range"
          type="range"
          min={0}
          max={n - 1}
          step={1}
          value={shown}
          onChange={(e) => {
            const v = +e.target.value;
            setMonth(v >= n - 1 ? -1 : v);
          }}
        />
      </div>
    </div>
  );
}

function Planets() {
  const { model } = usePortfolio(),
    { s } = useMoney();
  return (
    <motion.div variants={stagger(0.08, 0.6)} initial="hidden" animate="visible" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {CAT_ORDER.filter((id) => model.cats[id].items.length).map((id) => {
        const c = model.cats[id],
          cat = CATEGORIES[id];
        return (
          <motion.div key={id} variants={riseIn()}>
            <Link
              href={cat.route}
              className="group relative grid gap-1 overflow-hidden rounded-[18px] px-[18px] pt-4 pb-3.5 no-underline glass transition hover:-translate-y-[3px]"
              style={{ ["--c" as string]: cat.hex }}
            >
              <i className="absolute inset-y-0 left-0 w-[3px]" style={{ background: cat.hex, boxShadow: `0 0 14px ${cat.hex}` }} />
              <span className="text-[13px] font-semibold" style={{ color: cat.hex }}>
                {cat.name}
              </span>
              <b className="num font-display text-[24px] leading-tight font-bold tracking-[-0.02em] text-white max-[420px]:text-[20px]">
                {s(c.value)}
              </b>
              <span className="num flex justify-between gap-2 text-[12.5px] text-muted">
                <span>{((100 * c.value) / model.total).toFixed(0)}% of all</span>
                {c.gainPct != null && (
                  <span className={`font-semibold ${c.gainPct >= 0 ? "text-gain" : "text-loss"}`}>{pct1(c.gainPct)}</span>
                )}
              </span>
              <span className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/8">
                <i
                  className="block h-full rounded-full"
                  style={{ width: `${(100 * c.value) / model.total}%`, background: cat.hex, boxShadow: `0 0 10px ${cat.hex}` }}
                />
              </span>
            </Link>
          </motion.div>
        );
      })}
    </motion.div>
  );
}

function PricesCard() {
  const { S, refreshNow } = usePortfolio(),
    { showResult } = useUi(),
    now = useNow();
  const [busy, setBusy] = useState(false);
  if (!S) return null;
  const ref = S.settings.refreshedAt ? ist(Date.parse(S.settings.refreshedAt)) : "not yet",
    nx = now ? nextRefresh(now) : null;
  const click = async () => {
    setBusy(true);
    try {
      const r = await refreshNow();
      showResult({
        done: [
          {
            name: "Prices refreshed",
            what:
              r.skipped && !r.us
                ? "Already refreshed earlier today"
                : `${r.us ?? 0} US/London and ${r.india ?? 0} Indian prices${r.fx ? ` · ₹${r.fx} per $` : ""}`,
          },
        ],
        errors: [],
      });
    } catch (e) {
      showResult({ done: [], errors: ["Couldn't refresh prices: " + String((e as Error).message || e)] });
    }
    setBusy(false);
  };
  return (
    <Card delay={0.05}>
      <CardHead title="Prices" />
      <p className="text-[14.5px] text-body">
        Last refreshed <b className="text-ink">{ref}</b>
        {nx ? `, next ${ist(nx)} IST` : ""}. Indian prices as of {S.india?.pricedAt ? fmtDate(S.india.pricedAt) : "your statement"}, ₹
        {S.settings.fx} per $.
      </p>
      <div>
        <button type="button" className="btn" onClick={click} disabled={busy}>
          <Icon name="refresh" />
          {busy ? "Refreshing…" : "Refresh my prices now"}
        </button>
      </div>
    </Card>
  );
}

function AiTake() {
  const { model, ai, S } = usePortfolio(),
    { s } = useMoney();
  const [q, setQ] = useState(""),
    [a, setA] = useState(""),
    [busy, setBusy] = useState(false);
  const cs = CAT_ORDER.map((id) => model.cats[id]).filter((c) => c.items.length);
  const best = cs.filter((c) => c.xirr != null).sort((x, y) => (y.xirr as number) - (x.xirr as number))[0],
    big = [...cs].sort((x, y) => y.value - x.value)[0];
  const goal = S?.settings.goal,
    r = goal ? goalCalc(model, goal) : null;
  const lines = [
    best
      ? `${CATEGORIES[best.id].name} ${best.id === "abroad" ? "investments have" : "have"} returned ${pct1(best.xirr)} a year since ${fmtDate(best.since)}.`
      : "",
    big ? `${CATEGORIES[big.id].name} hold ${((100 * big.value) / model.total).toFixed(0)}% of your money.` : "",
    goal && r ? `Your ${s(goal.amt)} goal: ${VERDICTS[r.level].title.toLowerCase()}.` : "",
  ].filter(Boolean);
  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ai || !q.trim()) return;
    setBusy(true);
    setA("Thinking…");
    try {
      setA(
        await ai.ask(
          `You help an Indian investor understand their portfolio. Be direct and brief. Never invent numbers not in the data. Not SEBI-registered advice.\nData: ${JSON.stringify(CAT_ORDER.map((id) => ({ category: CATEGORIES[id].name, value: Math.round(model.cats[id].value), monthly: model.cats[id].sip, pastReturn: model.cats[id].xirr })))}\nGoal: ${JSON.stringify(goal || null)}\nQuestion: ${q}`,
        ),
      );
    } catch {
      setA("Couldn't get an answer. Try again.");
    }
    setBusy(false);
  };
  return (
    <Card delay={0.1}>
      <CardHead
        title={
          <>
            <Icon name="sparkles" className="size-[18px] text-stocks" />
            AI take
          </>
        }
      />
      <p className="text-[14.5px] text-body">{lines.join(" ")}</p>
      {a && <p className="rounded-[14px] bg-white/5 px-4 py-3.5 text-[14.5px] whitespace-pre-wrap">{a}</p>}
      <form onSubmit={ask} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <label htmlFor="ins-q" className="sr-only">
          Ask about your portfolio
        </label>
        <input
          id="ins-q"
          className="field-input rounded-full"
          placeholder={ai ? "Ask anything about your money" : "AI helper is off"}
          disabled={!ai || busy}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="off"
        />
        <button className="btn size-11 min-h-0 p-0" type="submit" aria-label="Ask" disabled={!ai || busy}>
          <Icon name="arrow" />
        </button>
      </form>
    </Card>
  );
}

export function HomeScreen() {
  const { model, S } = usePortfolio(),
    { m, s } = useMoney();
  if (!model.total) {
    return (
      <>
        <Hero badge="Your money as a solar system" title="Upload a statement to light up your system" big={false}>
          <p className="max-w-[60ch] text-[16.5px] text-body">
            Each planet is a kind of investment and each moon one of your holdings. Start with the CDSL or NSDL statement (CAS) that&apos;s
            emailed to you every month: it lists every share, mutual fund and bond under your PAN. Nothing is typed in.
          </p>
          <div>
            <Link href="/upload" className="btn btn-primary">
              <Icon name="upload" />
              Upload your CAS
            </Link>
          </div>
        </Hero>
        <Empty title="What you'll see">
          <ul className="grid gap-2">
            <li>Separate screens for mutual funds, stocks, bonds and money abroad, with 12 months of growth.</li>
            <li>The amount you invest each month, read from your purchases, and where it could take you in 5 to 20 years.</li>
            <li>A goal check: tap an amount and a year to see if you&apos;re on track.</li>
          </ul>
        </Empty>
      </>
    );
  }
  const n = model.months.length,
    putIn = model.inv[n - 1] - model.inv[n - 2],
    growth = model.val[n - 1] - model.val[n - 2] - putIn;
  const gainCats = CAT_ORDER.map((id) => model.cats[id]).filter((c) => c.gain != null);
  const gain = gainCats.length ? gainCats.reduce((a, c) => a + (c.gain as number), 0) : null,
    known = gainCats.reduce((a, c) => a + c.cost, 0);
  const goal = S?.settings.goal,
    r = goal ? goalCalc(model, goal) : null,
    tenY = projectAll(model, 1, 10);
  const layers = CAT_ORDER.filter((id) => model.cats[id].covered).map((id) => ({
    name: CATEGORIES[id].name,
    color: CATEGORIES[id].hex,
    values: model.cats[id].val,
  }));
  const coverage = CAT_ORDER.reduce((a, id) => a + model.cats[id].covered, 0) / model.total;
  return (
    <>
      <Hero badge={`All investments · ${longDate(TODAY())}`} title={<CountUp value={model.total} format={m} />}>
        <div className="flex max-w-[620px] flex-wrap gap-2">
          <GainPill gain={gain} pct={null} base={known} s={s} />
          <Pill>
            {s(Math.abs(growth))} {growth >= 0 ? "growth" : "fall"} in {monthShort(model.months[n - 1])}
            {putIn > 0 ? ` (besides ${s(putIn)} added)` : ""}
          </Pill>
          {model.sip > 0 && <Pill>{m(model.sip)} going in each month</Pill>}
        </div>
        <div className="max-w-[520px]">
          <Replay />
        </div>
      </Hero>
      <Planets />
      <Card>
        <CardHead
          title="How your money grew"
          note={`Month-end value of each kind of investment for the holdings with purchase dates (${Math.round(coverage * 100)}% of your money). The dashed line is what you put in.`}
        />
        <StackChart
          months={model.months}
          layers={layers}
          invested={model.inv}
          fmt={s}
          label={`Value by category over the last ${n} months`}
        />
        <Legend items={[...layers.map((l) => ({ name: l.name, color: l.color })), { name: "Money put in", dashed: true }]} />
        <HistNote />
      </Card>
      <div className="grid gap-5 md:grid-cols-2">
        <Link
          href="/goals"
          className="card no-underline transition hover:-translate-y-[3px] hover:shadow-[inset_0_0_0_1px_rgb(52_211_153/0.55),0_20px_40px_-20px_var(--color-goal)]"
        >
          <CardHead title={goal ? `Goal: ${s(goal.amt)} by ${goal.year}` : "Will you reach your goal?"} />
          {goal && r ? (
            <>
              <p
                className="grid gap-1 rounded-[14px] bg-white/5 px-4 py-3.5"
                style={{ boxShadow: `inset 3px 0 0 ${VERDICTS[r.level].color}` }}
              >
                <b className="font-display text-[17px] font-semibold" style={{ color: VERDICTS[r.level].color }}>
                  {VERDICTS[r.level].title}
                </b>
                <span className="num text-[13.5px] text-body">with {m(r.sip)} going in each month</span>
              </p>
              <div className="grid grid-cols-3 gap-2">
                {(["Cautious", "Likely", "Strong"] as const).map((k, i) => (
                  <div
                    key={k}
                    className={`grid gap-0.5 rounded-xl px-3 py-2.5 ${i === 1 ? "bg-goal/12 shadow-[inset_0_0_0_1px_rgb(52_211_153/0.4)]" : "bg-white/4"}`}
                  >
                    <span className="text-[12px] text-muted">
                      {k} by {goal.year}
                    </span>
                    <b
                      className={`num font-display font-bold ${r.v[i] >= goal.amt ? "text-gain" : "text-ink"} ${i === 1 ? "text-[18px]" : "text-[15px]"}`}
                    >
                      {s(r.v[i])}
                    </b>
                  </div>
                ))}
              </div>
              <span className="text-[13.5px] font-semibold text-ink">Change the goal or try a bigger SIP →</span>
            </>
          ) : (
            <>
              <p className="text-[14.5px] text-body">
                In 10 years at likely rates, with today&apos;s monthly investing, your money could be about{" "}
                <b className="text-ink">{s(tenY)}</b>.
              </p>
              <span className="btn btn-primary justify-self-start">Pick a goal</span>
            </>
          )}
        </Link>
        <Card delay={0.05}>
          <CardHead title="Going in every month" note="Read from your purchases, not typed in." />
          <ul className="grid">
            {CAT_ORDER.filter((id) => model.cats[id].items.length).map((id) => (
              <li
                key={id}
                className="grid grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-3 border-b border-white/7 py-2.5 text-[14.5px]"
              >
                <span
                  className="size-2.5 rounded-full"
                  style={{ background: CATEGORIES[id].hex, boxShadow: `0 0 8px ${CATEGORIES[id].hex}` }}
                />
                <span>{CATEGORIES[id].name}</span>
                <b className="num font-display font-semibold">{model.cats[id].sip ? m(model.cats[id].sip) : "—"}</b>
              </li>
            ))}
            <li className="grid grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-3 border-t border-white/12 pt-2.5 font-semibold">
              <span />
              <span>Total</span>
              <b className="num font-display text-[17px]">{m(model.sip)}</b>
            </li>
          </ul>
        </Card>
      </div>
      <GameLayer />
      <div className="grid gap-5 md:grid-cols-2">
        <PricesCard />
        <AiTake />
      </div>
    </>
  );
}
