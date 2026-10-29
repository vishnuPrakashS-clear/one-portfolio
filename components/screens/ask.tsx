"use client";

import { useState, type FormEvent } from "react";
import { usePortfolio } from "@/components/providers/portfolio-provider";
import { ASK_PRESETS, CATEGORIES, CAT_ORDER } from "@/constants";
import { goalCalc } from "@/lib/model";
import { hasAbroad, health, holdingRows, monthlySplit } from "@/lib/core/abroad";
import { TODAY } from "@/lib/dates";
import { Card, CardHead, Hero } from "@/components/sub/ui";

export function AskScreen() {
  const { S, model, ai } = usePortfolio();
  const [q, setQ] = useState(""),
    [a, setA] = useState(""),
    [busy, setBusy] = useState(false);
  async function ask(question: string) {
    if (!ai || !question.trim()) return;
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
      <Hero badge="Ask" title="Ask about your money" big={false} compact>
        <p className="max-w-[60ch] text-[16.5px] text-body">Answers use your holdings, monthly investing, goal and tax dates.</p>
      </Hero>
      <Card>
        <CardHead title="Questions people ask" />
        <div className="flex flex-wrap gap-2">
          {ASK_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              className="btn font-medium"
              disabled={!ai || busy}
              onClick={() => {
                setQ(p);
                void ask(p);
              }}
            >
              {p}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="grid gap-2.5">
          <label htmlFor="ask-q" className="grid gap-1.5 text-[13.5px] font-medium text-muted">
            Or ask your own question
            <textarea
              id="ask-q"
              className="field-input min-h-24 resize-y"
              placeholder="Anything about selling, tax dates, your goal or this month's buys"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              disabled={!ai}
            />
          </label>
          <div>
            <button className="btn btn-primary" type="submit" disabled={!ai || busy}>
              {busy ? "Thinking…" : "Ask"}
            </button>
          </div>
        </form>
        {a && <p className="rounded-[14px] bg-white/5 px-[18px] py-4 leading-relaxed whitespace-pre-wrap">{a}</p>}
        {!ai && <p className="note">Asking needs the optional AI helper: a free Gemini key saved as a Supabase secret (see the README).</p>}
      </Card>
    </>
  );
}
