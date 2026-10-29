"use client";

import { motion } from "framer-motion";
import { usePortfolio } from "@/components/providers/portfolio-provider";
import { player } from "@/lib/game";
import { TODAY, monthLong } from "@/lib/dates";
import { Card, CardHead } from "./ui";
import { BadgeIcon, Icon } from "./icon";
import { cn } from "@/lib/utils";

/** level, missions and badges: all computed from uploads, nothing to tick by hand */
export function GameLayer() {
  const { S, model } = usePortfolio();
  if (!S || !model.total) return null;
  const p = player(S, model),
    got = p.ach.filter((a) => a.got).length,
    pct = p.mis.length ? (100 * p.done) / p.mis.length : 0;
  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      <Card className="grid-cols-[auto_minmax(0,1fr)] items-center gap-[18px] md:col-span-2 xl:col-span-1">
        <div className="group relative size-[78px] [perspective:500px]" aria-hidden>
          <motion.i
            className="absolute inset-0 rounded-full bg-[conic-gradient(from_210deg,#c4f25a,#5fe37a,#22d3ee,#a78bfa,#c4f25a)] shadow-[0_14px_26px_-12px_rgb(95_227_122/0.5)]"
            style={{ rotateX: 16, rotateY: -20 }}
            whileHover={{ rotateY: 340 }}
            transition={{ duration: 1.2, ease: [0.2, 0.8, 0.2, 1] }}
          />
          <i className="absolute inset-[9px] rounded-full bg-[radial-gradient(circle_at_35%_30%,#2a302c,#151917)]" />
          <b className="absolute inset-0 grid place-items-center font-display text-[30px] font-extrabold text-lime">{p.lvl}</b>
        </div>
        <div className="grid min-w-0 gap-2">
          <span className="kicker">Level {p.lvl}</span>
          <h2 className="font-display text-[20px] font-semibold">{p.rank}</h2>
          <p className="note">
            {p.nextR
              ? `${p.nextR[0] - p.months} more investing month${p.nextR[0] - p.months === 1 ? "" : "s"} to ${p.nextR[1]}`
              : "Top rank"}{" "}
            · {p.streak}-month streak
          </p>
          <div
            className="relative h-7 overflow-hidden rounded-full bg-tint"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={p.mis.length}
            aria-valuenow={p.done}
            aria-label="Missions this month"
          >
            <motion.i
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-lime to-lime-2"
              initial={{ width: 0 }}
              whileInView={{ width: `${pct}%` }}
              viewport={{ once: true }}
              transition={{ duration: 1 }}
            />
            <span className="relative block px-3 text-[12.5px] leading-7 font-semibold text-ink">
              {p.done}/{p.mis.length} missions this month
            </span>
          </div>
        </div>
      </Card>
      <Card delay={0.05}>
        <CardHead title={`Missions for ${monthLong(TODAY().slice(0, 7))}`} />
        <ul className="grid">
          {p.mis.map((m) => (
            <li
              key={m.id}
              className="grid grid-cols-[26px_minmax(0,1fr)_auto] items-center gap-3 border-b border-rule py-2.5 text-[14px] last:border-0"
            >
              <span
                className={cn(
                  "grid size-[26px] place-items-center rounded-full text-gain-ink",
                  m.done ? "bg-gain-wash" : "shadow-[inset_0_0_0_2px_var(--color-line)]",
                )}
                aria-hidden
              >
                {m.done && <Icon name="check" className="size-[15px]" strokeWidth={2.6} />}
              </span>
              <span className={m.done ? "text-muted" : ""}>{m.title}</span>
              <span className="num rounded-full bg-[rgb(196_242_90/0.14)] px-2.5 py-1.5 text-[12px] leading-none font-bold whitespace-nowrap text-lime">
                +{m.xp} XP
              </span>
            </li>
          ))}
        </ul>
      </Card>
      <Card delay={0.1}>
        <CardHead title="Badges" note={`${got} of ${p.ach.length} unlocked`} />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-1.5">
          {p.ach.map((a) => (
            <motion.div
              key={a.k}
              title={a.how}
              whileHover={{ y: -4, rotateX: 8 }}
              className="grid content-start justify-items-center gap-1.5 px-1 py-2.5 text-center"
            >
              <span
                className={cn(
                  "grid size-[52px] place-items-center rounded-full",
                  a.got
                    ? "bg-[radial-gradient(circle_at_35%_30%,#fde68a,#fbbf24_55%,#b45309)] text-[#5a2d00] shadow-[0_4px_0_#d97706,0_12px_20px_-8px_rgb(217_119_6/0.6)]"
                    : "bg-tint text-muted shadow-[inset_0_0_0_2px_var(--color-line)]",
                )}
              >
                <BadgeIcon name={a.k} className="size-[22px]" />
              </span>
              <b className={cn("text-[12.5px] leading-tight font-semibold", a.got ? "text-ink" : "text-muted")}>{a.name}</b>
            </motion.div>
          ))}
        </div>
      </Card>
    </div>
  );
}
