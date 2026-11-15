"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/** a row of tap-to-pick choices (no typing: amounts and years are picked, never entered) */
export function Chips<T extends number | string>({
  label,
  items,
  value,
  onPick,
  render,
  sub,
}: {
  label: string;
  items: T[];
  value: T | undefined;
  onPick: (v: T) => void;
  render: (v: T) => string;
  sub?: (v: T) => string | null;
}) {
  return (
    <div>
      <span className="kicker mb-2">{label}</span>
      <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
        {items.map((v) => {
          const on = value === v;
          return (
            <motion.button
              key={v}
              type="button"
              whileTap={{ scale: 0.95 }}
              aria-pressed={on}
              onClick={() => onPick(v)}
              className={cn(
                "num inline-grid min-h-11 min-w-16 cursor-pointer justify-items-center gap-px rounded-[14px] px-3.5 py-2 font-display text-[15px] leading-tight font-bold transition-colors",
                on
                  ? "bg-gradient-to-r from-lime to-lime-2 text-on-lime shadow-[0_8px_18px_-10px_rgb(95_227_122/0.8)]"
                  : "bg-card text-ink shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-tint",
              )}
            >
              {render(v)}
              {sub?.(v) && (
                <small className={cn("font-sans text-[11px] font-medium", on ? "text-on-lime/70" : "text-muted")}>{sub(v)}</small>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
