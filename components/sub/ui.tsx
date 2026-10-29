"use client";

import { motion } from "framer-motion";
import type { CSSProperties, ReactNode } from "react";
import { riseIn, slideInFromLeft, slideInFromRight, slideInFromTop } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { pct1 } from "@/lib/format";
import { HeroArt, type ArtKind } from "@/components/main/art/hero-art";

/** a white card that rises in as it scrolls into view */
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

/** the page opening: a soft tinted panel with the badge, the big figure or title and a lead line on the left,
    and a glossy 3D illustration (or an aside such as the goal meter) on the right */
export function Hero({
  badge,
  color,
  wash,
  title,
  children,
  aside,
  art,
  big = true,
}: {
  badge: string;
  color?: string;
  wash?: string;
  title: ReactNode;
  children?: ReactNode;
  aside?: ReactNode;
  art?: ArtKind;
  compact?: boolean;
  big?: boolean;
}) {
  return (
    <motion.section
      initial="hidden"
      animate="visible"
      className="relative isolate grid items-center gap-x-6 gap-y-4 overflow-hidden rounded-[32px] px-9 py-9 surface max-sm:rounded-[24px] max-sm:px-5 max-sm:py-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,540px)]"
      style={{ backgroundImage: `radial-gradient(90% 120% at 100% 30%, ${wash || "#c4f25a1a"}, transparent 62%)` }}
    >
      <div className="grid content-center gap-4 max-lg:order-2">
        <motion.span
          variants={slideInFromTop}
          className="inline-flex w-fit items-center gap-2 rounded-full bg-card px-3 py-1.5 text-[13px] font-semibold text-body shadow-[inset_0_0_0_1px_var(--color-line)]"
        >
          <i className="size-2 rounded-full" style={{ background: color || "var(--color-act-a)" }} />
          {badge}
        </motion.span>
        <motion.h1
          variants={slideInFromLeft(0.15)}
          className={cn(
            "font-display font-bold text-ink",
            big
              ? "num text-[clamp(40px,6.4vw,76px)] leading-[0.98] tracking-[-0.04em]"
              : "text-[clamp(30px,4.4vw,52px)] leading-[1.06] tracking-[-0.03em]",
          )}
        >
          {title}
        </motion.h1>
        {children && (
          <motion.div variants={slideInFromLeft(0.3)} className="grid gap-4">
            {children}
          </motion.div>
        )}
      </div>
      {aside ? (
        <motion.div variants={slideInFromRight(0.35)} className="max-lg:order-3">
          {aside}
        </motion.div>
      ) : art ? (
        <motion.div
          variants={slideInFromRight(0.2)}
          className="mx-auto w-full max-w-[560px] max-lg:order-1 max-lg:max-w-[460px] max-sm:-mx-2 max-sm:-my-2 max-sm:max-w-none"
        >
          <HeroArt kind={art} />
        </motion.div>
      ) : null}
    </motion.section>
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
    tone === "pos" && "bg-gain-wash text-gain-ink shadow-none",
    tone === "neg" && "bg-loss-wash text-loss-ink shadow-none",
    onClick && "cursor-pointer text-ink hover:bg-tint",
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
    <div className="relative grid content-start gap-0.5 px-[18px] py-4 [&+&]:before:absolute [&+&]:before:inset-y-3.5 [&+&]:before:left-0 [&+&]:before:w-px [&+&]:before:bg-line">
      <span className="text-[12.5px] text-muted">{k}</span>
      <b
        className={cn(
          "num font-display text-[22px] leading-tight font-bold tracking-[-0.015em] whitespace-nowrap",
          tone === "pos" && "text-gain-ink",
          tone === "neg" && "text-loss-ink",
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
    <div className={cn("grid overflow-hidden rounded-[20px] surface", cols === 4 ? "grid-cols-2 md:grid-cols-4" : "grid-cols-2")}>
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
