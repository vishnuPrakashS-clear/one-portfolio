"use client";

import { motion } from "framer-motion";
import type { CSSProperties, ReactNode } from "react";
import { riseIn, slideInFromLeft, slideInFromRight, slideInFromTop } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { pct1 } from "@/lib/format";
type ArtKind = string;
type ArtExtra = unknown;

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
        <h2 className="flex items-center gap-2.5 text-[18px] leading-tight font-semibold tracking-[-0.01em]">{title}</h2>
        {note && <p className="note max-w-[70ch]">{note}</p>}
      </div>
      {right}
    </div>
  );
}

/** the page opening, broker-style: a plain card with a small label, the big figure or title, the key numbers under it,
    and the screen's 3D scene on the right (above on phones) */
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
  /** numbers the screen hands to its 3D scene */
  artExtra?: ArtExtra;
  compact?: boolean;
  big?: boolean;
}) {
  return (
    <motion.section
      initial="hidden"
      animate="visible"
      className={cn(
        "relative isolate grid items-center gap-x-8 gap-y-3 overflow-hidden rounded-[var(--radius-card)] px-8 py-7 surface max-sm:rounded-[14px] max-sm:px-4 max-sm:py-4",
        aside && !art && "lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]",
      )}
      style={{
        backgroundImage: `radial-gradient(85% 120% at 100% 30%, ${wash && wash !== "transparent" ? wash : "color-mix(in srgb, var(--color-lime-2) 9%, transparent)"}, transparent 62%)`,
      }}
    >
      <div className="grid min-w-0 content-center gap-3.5 max-lg:order-2">
        <motion.span variants={slideInFromTop} className="inline-flex w-fit items-center gap-2 text-[13.5px] font-medium text-muted">
          <i className="size-2 rounded-full" style={{ background: color || "var(--color-lime-2)" }} />
          {badge}
        </motion.span>
        <motion.h1
          variants={slideInFromLeft(0.1)}
          className={cn(
            "font-semibold text-ink",
            big
              ? "num text-[clamp(38px,5.6vw,64px)] leading-[0.98] tracking-[-0.03em]"
              : "text-[clamp(26px,3.6vw,42px)] leading-[1.1] tracking-[-0.02em]",
          )}
        >
          {title}
        </motion.h1>
        {children && (
          <motion.div variants={slideInFromLeft(0.2)} className="grid gap-4">
            {children}
          </motion.div>
        )}
        {aside && art != null && (
          <motion.div variants={slideInFromLeft(0.3)} className="mt-1">
            {aside}
          </motion.div>
        )}
      </div>
      {aside && !art ? (
        <motion.div variants={slideInFromRight(0.25)} className="max-lg:order-3">
          {aside}
        </motion.div>
      ) : null}
    </motion.section>
  );
}

/** the top of a holdings screen, like a broker's summary: the big current value, the key numbers in a row under it,
    and the screen's 3D scene kept small at the side (below the numbers on phones, so figures come first) */
export function Summary({
  badge,
  color,
  title,
  items,
  chart,
  children,
}: {
  badge: string;
  color?: string;
  title: ReactNode;
  items?: { k: string; v: ReactNode; tone?: "pos" | "neg" | "" }[];
  /** usually a ValueChart of this screen's money */
  chart?: ReactNode;
  children?: ReactNode;
  art?: unknown;
  artExtra?: unknown;
}) {
  return (
    <motion.section
      initial="hidden"
      animate="visible"
      className="grid gap-4 rounded-[var(--radius-card)] px-6 py-5 surface max-sm:rounded-[14px] max-sm:px-4 max-sm:py-4"
    >
      <div className="grid min-w-0 content-center gap-3">
        <motion.span variants={slideInFromTop} className="inline-flex items-center gap-2 text-[13.5px] font-medium text-muted">
          <i className="size-2 rounded-full" style={{ background: color || "var(--color-lime-2)" }} />
          {badge}
        </motion.span>
        <motion.h1
          variants={slideInFromLeft(0.08)}
          className="num text-[clamp(28px,3.6vw,40px)] leading-none font-semibold tracking-[-0.02em] text-ink"
        >
          {title}
        </motion.h1>
        {items && (
          <motion.dl variants={slideInFromLeft(0.16)} className="flex flex-wrap gap-x-7 gap-y-2 border-t border-rule pt-3">
            {items.map((x) => (
              <div key={x.k} className="grid content-start gap-0.5">
                <dt className="text-[12.5px] text-muted">{x.k}</dt>
                <dd
                  className={cn(
                    "num text-[15.5px] leading-tight font-semibold whitespace-nowrap text-ink",
                    x.tone === "pos" && "text-gain-ink",
                    x.tone === "neg" && "text-loss-ink",
                  )}
                >
                  {x.v}
                </dd>
              </div>
            ))}
          </motion.dl>
        )}
        {children && (
          <motion.div variants={slideInFromLeft(0.22)} className="grid gap-3">
            {children}
          </motion.div>
        )}
      </div>
      {chart && (
        <motion.div variants={slideInFromRight(0.1)} className="min-w-0">
          {chart}
        </motion.div>
      )}
    </motion.section>
  );
}

/** the key numbers under a hero figure, like a broker's holdings summary: label over value, a hairline between */
export function SummaryRow({ items }: { items: { k: string; v: ReactNode; s?: ReactNode; tone?: "pos" | "neg" | "" }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-line shadow-[inset_0_0_0_1px_var(--color-line)] sm:grid-cols-4">
      {items.map((x) => (
        <div key={x.k} className="grid content-start gap-0.5 bg-card px-4 py-3">
          <dt className="text-[12.5px] text-muted">{x.k}</dt>
          <dd
            className={cn(
              "num text-[17px] leading-tight font-semibold whitespace-nowrap text-ink",
              x.tone === "pos" && "text-gain-ink",
              x.tone === "neg" && "text-loss-ink",
            )}
          >
            {x.v}
          </dd>
          {x.s && <dd className="text-[12px] text-muted">{x.s}</dd>}
        </div>
      ))}
    </dl>
  );
}

/** one bar split by share, with a legend under it */
export function SplitBar({ parts }: { parts: { name: string; value: number; color: string }[] }) {
  const t = parts.reduce((a, p) => a + p.value, 0) || 1;
  const shown = parts.filter((p) => p.value > 0);
  return (
    <div className="grid gap-2.5">
      <div
        className="flex h-2.5 gap-[2px] overflow-hidden rounded-full"
        role="img"
        aria-label={shown.map((p) => `${p.name} ${Math.round((100 * p.value) / t)}%`).join(", ")}
      >
        {shown.map((p) => (
          <i key={p.name} className="block h-full" style={{ width: `${(100 * p.value) / t}%`, background: p.color }} />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
        {shown.map((p) => (
          <li key={p.name} className="inline-flex items-center gap-1.5">
            <i className="size-2 rounded-full" style={{ background: p.color }} aria-hidden />
            <span className="text-body">{p.name}</span>
            <b className="num font-semibold text-ink">{Math.round((100 * p.value) / t)}%</b>
          </li>
        ))}
      </ul>
    </div>
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
          "num text-[19px] leading-tight font-semibold tracking-[-0.01em] whitespace-nowrap",
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
    <div
      className={cn("grid overflow-hidden rounded-[var(--radius-card)] surface", cols === 4 ? "grid-cols-2 md:grid-cols-4" : "grid-cols-2")}
    >
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
      <h2 className="text-[20px] font-semibold">{title}</h2>
      <div className="lead text-body">{children}</div>
      {action}
    </Card>
  );
}
