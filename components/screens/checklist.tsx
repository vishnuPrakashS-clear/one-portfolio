"use client";

import { useState } from "react";
import { usePortfolio } from "@/components/providers/portfolio-provider";
import { CHECKLIST } from "@/constants";
import { buyMonths } from "@/lib/game";
import { TODAY } from "@/lib/dates";
import { inr } from "@/lib/format";
import { Card, CardHead, Chip, Hero } from "@/components/sub/ui";
import { cn } from "@/lib/utils";

const MN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function ChecklistScreen() {
  const { S, mutate } = usePortfolio(),
    [year, setYear] = useState(+TODAY().slice(0, 4));
  const months = new Set(
    buyMonths(S)
      .filter((m) => +m.slice(0, 4) === year)
      .map((m) => +m.slice(5, 7) - 1),
  );
  const auto: Record<string, boolean> = {};
  if (S?.imports.some((x) => x.kind === "statement" && x.period === `${year - 1}-12-31`)) auto["jan-import"] = true;
  const mine = S?.checklist[year] || {};
  const done = (id: string) => !!(auto[id] || mine[id]);
  return (
    <>
      <Hero badge="Yearly checklist" title="The jobs that save tax each year" big={false} art="checklist">
        <p className="max-w-[60ch] text-[16.5px] text-body">Ticks fill themselves in where your uploads prove a job is done.</p>
      </Hero>
      <Card>
        <CardHead
          title={`Checklist for ${year}`}
          right={
            <div className="flex gap-2" role="group" aria-label="Year">
              {[year - 1, year, year + 1].map((y) => (
                <button
                  key={y}
                  type="button"
                  aria-pressed={y === year}
                  onClick={() => setYear(y)}
                  className={cn("btn min-h-9", y === year && "btn-primary")}
                >
                  {y}
                </button>
              ))}
            </div>
          }
        />
        <div>
          <span className="kicker mb-1.5">Months with a purchase (from your statements)</span>
          <div className="grid grid-cols-12 gap-1.5 max-sm:grid-cols-6">
            {MN.map((n, i) => (
              <span
                key={n}
                className={cn(
                  "rounded-[10px] px-1 py-2 text-center text-[12px] leading-none font-semibold",
                  months.has(i) ? "bg-gain/15 text-gain-ink" : "text-muted shadow-[inset_0_0_0_1px_var(--color-line)]",
                )}
              >
                {n}
              </span>
            ))}
          </div>
        </div>
        <div className="grid">
          {[...new Set(CHECKLIST.map((c) => c.m))].map((m) => (
            <div
              key={m}
              className="grid grid-cols-[96px_1fr] items-start gap-3.5 border-b border-rule py-3.5 last:border-0 max-sm:grid-cols-1 max-sm:gap-1.5"
            >
              <div className="font-display text-[17px] font-extrabold">{MN[m]}</div>
              <div className="grid gap-2.5">
                {CHECKLIST.filter((c) => c.m === m).map((c) => (
                  <label key={c.id} htmlFor={`ck-${c.id}`} className="flex cursor-pointer items-start gap-2.5">
                    <input
                      type="checkbox"
                      id={`ck-${c.id}`}
                      className="mt-1 size-[18px]"
                      checked={done(c.id)}
                      disabled={!!auto[c.id] || !S}
                      onChange={(e) =>
                        mutate((D) => {
                          D.checklist[year] = { ...(D.checklist[year] || {}), [c.id]: e.target.checked };
                        })
                      }
                    />
                    <span>
                      {c.text}
                      {auto[c.id] && (
                        <Chip tone="good" className="ml-1.5 px-1.5 py-0.5">
                          from uploads
                        </Chip>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="note">
          Schedule FA lists every foreign holding you held at any time from January to December, even with no sale. TCS starts only above
          ₹10 lakh of foreign remittances in a financial year{S ? `; ${inr(S.settings.monthlyInr * 12)} a year stays clear` : ""}.
        </p>
      </Card>
    </>
  );
}
