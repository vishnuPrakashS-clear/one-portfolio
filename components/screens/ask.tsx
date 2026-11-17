"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { usePortfolio } from "@/components/providers/portfolio-provider";
import { CATEGORIES, CAT_ORDER } from "@/constants";
import { answer, topicOf, TOPICS, type LocalAnswer, type Topic } from "@/lib/ask-local";
import { Icon } from "@/components/sub/icon";
import { cn } from "@/lib/utils";
import { goalCalc } from "@/lib/model";
import { hasAbroad, health, holdingRows, monthlySplit } from "@/lib/core/abroad";
import { TODAY } from "@/lib/dates";
import { Card, CardHead, Hero } from "@/components/sub/ui";

export function AskScreen() {
  const { S, model, ai } = usePortfolio();
  const [q, setQ] = useState(""),
    [a, setA] = useState(""),
    [busy, setBusy] = useState(false),
    [local, setLocal] = useState<LocalAnswer | null>(null),
    [miss, setMiss] = useState(false);
  const pick = (t: Topic) => {
    setMiss(false);
    setA("");
    setLocal(answer(t, S, model));
  };
  async function ask(question: string) {
    if (!question.trim()) return;
    const t = topicOf(question);
    setLocal(t ? answer(t, S, model) : null);
    setMiss(!t && !ai);
    if (!ai) return setA("");
    setBusy(true);
    setA("Thinking…");
    const goal = S?.settings.goal,
      r = goal ? goalCalc(model, goal) : null;
    const ctx = {
      today: TODAY(),
      categories: CAT_ORDER.map((id) => ({
        name: CATEGORIES[id].name,
        value: Math.round(model.cats[id].value),
        cost: Math.round(model.cats[id].cost),
        monthly: model.cats[id].sip,
        pastYearlyReturn: model.cats[id].xirr,
        largest: model.cats[id].items
          .slice(0, 8)
          .map((i) => ({ name: i.name, value: Math.round(i.value), cost: i.cost && Math.round(i.cost) })),
      })),
      goal:
        goal && r
          ? {
              ...goal,
              likelyByThen: Math.round(r.v[1]),
              cautious: Math.round(r.v[0]),
              strong: Math.round(r.v[2]),
              monthlyNeeded: Math.round(r.need),
            }
          : null,
      abroad:
        S && hasAbroad(S)
          ? {
              settings: S.settings,
              health: health(S),
              holdings: holdingRows(S).map((h) => ({
                sym: h.sym,
                plan: h.plan,
                value: +h.value.toFixed(2),
                cost: +h.cost.toFixed(2),
                longTermFrom: h.firstLT,
              })),
              thisMonth: monthlySplit(S),
            }
          : null,
      reports: S?.imports.map((x) => ({ kind: x.kind, period: x.period })),
    };
    const prompt = `You are the user's investing guide. They are an Indian resident investing in Indian mutual funds, stocks and bonds, plus a US/Japan/London sleeve through INDmoney. Be direct: give the action, the date and the amount, then the reason in one or two sentences.
Indian rules: listed shares and equity funds long-term after 12 months, 12.5% above ₹1.25 lakh a year, 20% short-term; debt funds at slab; bond interest at slab. Foreign holdings long-term after 24 months at 12.5%.
Never invent numbers not in the data. If data is missing, say which upload would fix it. Not SEBI-registered advice: say so once, briefly, only if recommending a sale.
Data (JSON): ${JSON.stringify(ctx)}
Question: ${question}`;
    try {
      setA(await ai.ask(prompt));
    } catch (e) {
      setA(
        /rate/i.test(String((e as Error).message))
          ? "Too many questions in a short time. Try again in a minute."
          : "Couldn't get an answer. Try again.",
      );
    }
    setBusy(false);
  }
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void ask(q);
  };
  return (
    <>
      <Hero badge="Ask" title="Ask about your money" big={false} art="ask">
        <p className="max-w-[60ch] text-[16.5px] text-body">Answers use your holdings, monthly investing, goal and tax dates.</p>
      </Hero>
      <Card>
        <CardHead title="Quick answers" note="Worked out from your own numbers, instantly." />
        <div className="grid grid-cols-2 gap-2.5 max-md:grid-cols-1">
          {TOPICS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={local?.topic === t.id && !a}
              onClick={() => pick(t.id)}
              className={cn(
                "flex items-center justify-between gap-3 rounded-[16px] px-4 py-3.5 text-left text-[15px] font-semibold transition active:scale-[0.98]",
                local?.topic === t.id && !a
                  ? "bg-act-a text-on-act shadow-md"
                  : "bg-tint text-ink hover:shadow-[inset_0_0_0_2px_var(--color-act-a)]",
              )}
            >
              {t.q}
              <Icon name="arrow" className="size-4 shrink-0" />
            </button>
          ))}
        </div>
        {local && (
          <div className="grid gap-2.5 rounded-[16px] bg-gain-wash p-4" aria-live="polite">
            <b className="font-display text-[18px] text-ink">{local.title}</b>
            <ul className="grid list-disc gap-1.5 pl-5 text-[15px] leading-relaxed text-body">
              {local.lines.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
            <div>
              <Link href={local.link.href} className="btn btn-primary">
                {local.link.label} <Icon name="arrow" className="size-4" />
              </Link>
            </div>
          </div>
        )}
        <form onSubmit={submit} className="grid gap-2.5 border-t border-rule pt-4">
          <label htmlFor="ask-q" className="grid gap-1.5 text-[13.5px] font-medium text-muted">
            Or type your own question
            <textarea
              id="ask-q"
              className="field-input min-h-24 resize-y"
              placeholder="e.g. when can I sell ITC with less tax?"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <div>
            <button className="btn btn-primary" type="submit" disabled={busy || !q.trim()}>
              {busy ? "Thinking…" : "Ask"}
            </button>
          </div>
        </form>
        {miss && (
          <p className="rounded-[14px] bg-tint px-[18px] py-4 text-body">
            Without the AI helper, typed questions are matched to the five quick answers above (goal, buying, selling, tax dates, uploads),
            and this one didn&apos;t match any. Try words like &ldquo;sell&rdquo;, &ldquo;tax&rdquo; or &ldquo;goal&rdquo;, or tap a quick
            answer.
          </p>
        )}
        {a && <p className="rounded-[14px] bg-tint px-[18px] py-4 leading-relaxed whitespace-pre-wrap">{a}</p>}
        {!ai && (
          <p className="note">
            Free-form answers in your own words need the optional AI helper (a free Gemini key saved as a Supabase secret). Everything above
            works without it.
          </p>
        )}
      </Card>
    </>
  );
}
