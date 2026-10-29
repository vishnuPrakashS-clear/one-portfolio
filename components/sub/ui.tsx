"use client";

import { motion } from "framer-motion";
import type { CSSProperties, ReactNode } from "react";
import { riseIn, slideInFromLeft, slideInFromRight, slideInFromTop } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { Icon } from "./icon";
import { pct1 } from "@/lib/format";

/** a glass card that rises in as it scrolls into view */
export function Card({
  children,
  className,
  delay = 0,
  style,
  id,
  as = "section",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  style?: CSSProperties;
  id?: string;
  as?: "section" | "div";
}) {
  const M = as === "div" ? motion.div : motion.section;
  return (
    <M
      id={id}
      className={cn("card", className)}
      style={style}
      variants={riseIn(delay)}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-40px" }}
    >
      {children}
    </M>
  );
}
export function CardHead({ title, note, right }: { title: ReactNode; note?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="grid gap-1">
        <h2 className="flex items-center gap-2.5 font-display text-[19px] leading-tight font-semibold tracking-[-0.01em]">{title}</h2>
        {note && <p className="note max-w-[70ch]">{note}</p>}
      </div>
      {right}
    </div>
  );
}

/** the page opening: a glowing welcome badge, the big figure or title, and a lead line (like the reference portfolio's hero) */
export function Hero({
  badge,
  color,
  title,
  children,
  aside,
  compact,
  big = true,
}: {
  badge: string;
  color?: string;
  title: ReactNode;
  children?: ReactNode;
  aside?: ReactNode;
  compact?: boolean;
  big?: boolean;
}) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      className={cn(
        "pointer-events-none grid items-end gap-x-8 gap-y-6 pb-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)]",
        compact
          ? "min-h-[min(44vh,420px)] pt-[clamp(40px,16vh,160px)] lg:pt-[clamp(24px,7vh,80px)]"
          : "min-h-[min(64vh,620px)] pt-[clamp(40px,22vh,220px)] lg:pt-[clamp(24px,8vh,90px)]",
      )}
    >
      <div className="grid content-end gap-4 [text-shadow:0_2px_24px_rgb(3_0_20/0.85)]">
        <motion.div
          variants={slideInFromTop}
          className="welcome-box pointer-events-auto w-fit border border-[#7042f88b] px-3 py-2 opacity-90"
          style={color ? { borderColor: color + "99" } : undefined}
        >
          <Icon name="sparkles" className="mr-2.5 size-4" style={{ color: color || "#b49bff" }} />
          <span className="welcome-text text-[13px] font-semibold">{badge}</span>
        </motion.div>
        <motion.h1
          variants={slideInFromLeft(0.25)}
          className={cn(
            "font-display font-bold text-white",
            big
              ? "num text-[clamp(42px,7.4vw,86px)] leading-[0.98] tracking-[-0.04em]"
              : "text-[clamp(32px,4.8vw,56px)] leading-[1.05] tracking-[-0.03em]",
          )}
          style={
            color
              ? {
                  backgroundImage: `linear-gradient(180deg,#fff 30%, ${color})`,
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                  textShadow: "none",
                  filter: `drop-shadow(0 4px 30px ${color}55)`,
                }
              : undefined
          }
        >
          {title}
        </motion.h1>
        {children && (
          <motion.div variants={slideInFromLeft(0.45)} className="pointer-events-auto grid gap-4">
            {children}
          </motion.div>
        )}
      </div>
      {aside && (
        <motion.div variants={slideInFromRight(0.5)} className="pointer-events-auto">
          {aside}
        </motion.div>
      )}
    </motion.div>
  );
}

export function Pill({
  children,
  tone,
  className,
  onClick,
}: {
  children: ReactNode;
  tone?: "pos" | "neg";
  className?: string;
  onClick?: () => void;
}) {
  const cls = cn(
    "pill",
    tone === "pos" && "text-gain-ink shadow-[inset_0_0_0_1px_rgb(52_211_153/0.45)]",
    tone === "neg" && "text-loss-ink shadow-[inset_0_0_0_1px_rgb(248_113_113/0.45)]",
    onClick && "cursor-pointer text-ink hover:bg-white/12",
    className,
  );
  return onClick ? (
    <button type="button" onClick={onClick} className={cls}>
      {children}
    </button>
  ) : (
    <span className={cls}>{children}</span>
  );
}
export function Chip({
  children,
  tone,
  className,
  title,
}: {
  children: ReactNode;
  tone?: "good" | "wait" | "act" | "neutral";
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn("chip", tone === "good" && "chip-good", tone === "wait" && "chip-wait", tone === "act" && "chip-act", className)}
    >
      {children}
    </span>
  );
}
export function Stat({ k, v, s, tone }: { k: string; v: ReactNode; s?: ReactNode; tone?: "pos" | "neg" | "" }) {
  return (
    <div className="relative grid content-start gap-0.5 px-[18px] py-4 [&+&]:before:absolute [&+&]:before:inset-y-3.5 [&+&]:before:left-0 [&+&]:before:w-px [&+&]:before:bg-white/12">
      <span className="text-[12.5px] text-muted">{k}</span>
      <b
        className={cn(
          "num font-display text-[22px] leading-tight font-bold tracking-[-0.015em] whitespace-nowrap",
          tone === "pos" && "text-gain",
          tone === "neg" && "text-loss",
        )}
      >
        {v}
      </b>
      {s && <span className="text-[12.5px] text-muted">{s}</span>}
    </div>
  );
}
export function StatGrid({ children, cols = 4 }: { children: ReactNode; cols?: 2 | 4 }) {
  return (
    <div className={cn("grid overflow-hidden rounded-[18px] glass", cols === 4 ? "grid-cols-2 md:grid-cols-4" : "grid-cols-2")}>
      {children}
    </div>
  );
}
export function GainPill({ gain, pct, base, s }: { gain: number | null; pct: number | null; base?: number; s: (v: number) => string }) {
  if (gain == null) return null;
  return (
    <Pill tone={gain >= 0 ? "pos" : "neg"}>
      {gain >= 0 ? "+" : "−"}
      {s(Math.abs(gain))}
      {pct != null ? ` · ${pct1(pct)}` : ""}
      {base ? ` on ${s(base)} put in` : ""}
    </Pill>
  );
}
export function Empty({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <Card className="gap-3.5 p-8">
      <h2 className="font-display text-[22px] font-semibold">{title}</h2>
      <div className="lead text-body">{children}</div>
      {action}
    </Card>
  );
}
