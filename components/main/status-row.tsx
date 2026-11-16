"use client";

import { usePortfolio } from "@/components/providers/portfolio-provider";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { Icon } from "@/components/sub/icon";
import { fmtDate, TODAY } from "@/lib/dates";

const SRC_NAME: Record<string, string> = {
  grSt: "Groww stocks holdings",
  grStO: "Groww stocks order history",
  grMF: "Groww mutual funds holdings",
  grMFO: "Groww mutual funds order history",
  zd: "Zerodha holdings",
  wint: "Wint Wealth report",
  ib: "IndiaBonds statement",
  ibcf: "IndiaBonds cash flows",
};
/** a warning when the newest report is more than two weeks old, so sales and buys since then are clearly not counted */
function DataAge() {
  const { S, locked } = usePortfolio();
  const I = S?.india;
  if (!I || locked) return null;
  const dates = [I.asOf, ...Object.values(I.src || {}).map((x) => (x as { asOf?: string } | undefined)?.asOf)].filter(
    (d): d is string => !!d,
  );
  if (!dates.length) return null;
  const newest = dates.sort().at(-1)!;
  const days = Math.floor((Date.parse(TODAY()) - Date.parse(newest)) / 864e5);
  if (days <= 14) return null;
  const old = Object.entries(I.src || {})
    .filter(([, v]) => (v as { asOf?: string } | undefined)?.asOf)
    .map(([k, v]) => `${SRC_NAME[k] || k} (${fmtDate((v as { asOf: string }).asOf)})`);
  return (
    <div
      role="note"
      className="mt-2.5 grid gap-x-4 gap-y-2 rounded-[16px] bg-warn-wash px-4 py-3 text-[14px] text-body shadow-[inset_0_0_0_1px_var(--color-warn)] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
    >
      <span>
        <b className="text-warn-ink">
          Your holdings are as of {fmtDate(newest)}, {days} days ago.
        </b>{" "}
        Anything you bought or sold since then isn&apos;t counted. Upload the latest reports: CDSL/NSDL statement ({fmtDate(I.asOf)})
        {old.length ? `, ${old.join(", ")}` : ""}.
      </span>
      <Link href="/upload" className="btn btn-primary justify-self-start">
        <Icon name="upload" />
        Upload newer reports
      </Link>
    </div>
  );
}

/** where the data stands: saved, saving, or why it can't be saved */
export function StatusRow() {
  const { status, banner } = usePortfolio();
  return (
    <>
      <DataAge />
      <div className="flex min-h-[30px] justify-end pt-2.5" role="status" aria-live="polite">
        <span className="flex min-w-0 items-baseline gap-2 rounded-full bg-card px-2.5 py-1 text-[12.5px] text-muted shadow-[inset_0_0_0_1px_var(--color-line)] max-sm:text-[11.5px]">
          <span
            className={cn(
              "inline-block size-2 shrink-0 -translate-y-px rounded-full",
              status.kind === "ok" ? "bg-gain" : status.kind === "err" ? "bg-loss" : "bg-warn",
            )}
          />
          <span className="min-w-0">{status.text}</span>
        </span>
      </div>
      {banner && (
        <div
          role="alert"
          className="fixed bottom-4 left-1/2 z-[60] flex w-[min(640px,calc(100vw-24px))] -translate-x-1/2 flex-wrap items-center gap-x-3 gap-y-2 rounded-[18px] bg-card px-4 py-3 text-[14px] shadow-[inset_0_0_0_1.5px_var(--color-loss),0_16px_40px_-15px_rgb(0_0_0/0.3)] max-sm:bottom-[calc(84px+env(safe-area-inset-bottom))]"
        >
          <b className="text-loss-ink">Supabase</b>
          <span className="flex-[1_1_240px]">{banner.text}</span>
          {banner.action && (
            <button type="button" className="btn btn-primary" onClick={banner.action}>
              {banner.label || "Try again"}
            </button>
          )}
        </div>
      )}
    </>
  );
}
