"use client";

import { usePortfolio } from "@/components/providers/portfolio-provider";
import { cn } from "@/lib/utils";

/** where the data stands: saved, saving, or why it can't be saved */
export function StatusRow() {
  const { status, banner } = usePortfolio();
  return (
    <>
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
          className="fixed bottom-4 left-1/2 z-[60] flex w-[min(640px,calc(100vw-24px))] -translate-x-1/2 flex-wrap items-center gap-x-3 gap-y-2 rounded-[18px] bg-card px-4 py-3 text-[14px] shadow-[inset_0_0_0_1.5px_var(--color-loss),0_20px_50px_-15px_rgb(0_0_0/0.7)] max-sm:bottom-[calc(84px+env(safe-area-inset-bottom))]"
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
