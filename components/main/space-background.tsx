"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { Component, useMemo, type ReactNode } from "react";
import { useMedia, useScrollProgress, useWebGL } from "@/lib/hooks";
import { usePortfolio } from "@/components/providers/portfolio-provider";
import { useUi } from "@/components/providers/ui-provider";
import { CATEGORIES, CAT_ORDER, type CatId } from "@/constants";
import { money, short } from "@/lib/format";
import type { SpacePlanet } from "./space/scene";

const SpaceScene = dynamic(() => import("./space/scene"), { ssr: false, loading: () => null });

/** a quiet demo system shown before anything is uploaded (and behind the sign-in screen) */
const DEMO: SpacePlanet[] = CAT_ORDER.map((id, i) => ({
  id,
  name: CATEGORIES[id].name,
  hex: CATEGORIES[id].hex,
  hex2: CATEGORIES[id].hex2,
  value: [5, 3, 2, 1.4][i],
  valueText: "",
  series: null,
  moons: Array.from({ length: [9, 12, 5, 7][i] }, (_, k) => ({
    id: `${id}${k}`,
    name: "",
    value: 1 + ((k * 7) % 5),
    gainPct: k % 4 === 0 ? -0.05 : 0.08,
    series: null,
    valueText: "",
  })),
}));

class GlBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
const StaticSky = () => (
  <div aria-hidden className="absolute inset-0 bg-[radial-gradient(120%_70%_at_60%_0%,#2a1054_0%,#140a2a_45%,#030014_100%)]" />
);

export function SpaceBackground() {
  const { model, cur, fx, S, locked, mode } = usePortfolio();
  const { month, openItem, hover, setHover } = useUi();
  const router = useRouter(),
    path = usePathname() || "/";
  const scroll = useScrollProgress(),
    reduced = useMedia("(prefers-reduced-motion: reduce)"),
    small = useMedia("(max-width: 760px)"),
    gl = useWebGL();

  const focus: CatId | "all" = (CAT_ORDER.find((id) => path.startsWith(CATEGORIES[id].route)) as CatId | undefined) || "all";
  const real = !!S && !locked && model.total > 0;
  const planets = useMemo<SpacePlanet[]>(() => {
    if (!real) return DEMO;
    return CAT_ORDER.filter((id) => model.cats[id].items.length).map((id) => {
      const c = model.cats[id],
        cat = CATEGORIES[id];
      return {
        id,
        name: cat.name,
        hex: cat.hex,
        hex2: cat.hex2,
        value: c.value,
        valueText: short(c.value, cur, fx),
        series: c.covered ? c.val.map((v) => v + (c.value - c.covered)) : null,
        moons: c.items.map((it) => ({
          id: it.id,
          name: it.name,
          value: it.value,
          gainPct: it.cost ? (it.value - it.cost) / it.cost : null,
          series: it.val,
          valueText: money(it.value, cur, fx),
        })),
      };
    });
  }, [real, model, cur, fx]);

  return (
    <>
      <div aria-hidden className="fixed inset-0 -z-10">
        {gl === false ? (
          <StaticSky />
        ) : gl ? (
          <GlBoundary fallback={<StaticSky />}>
            <SpaceScene
              planets={planets}
              focus={real ? focus : "all"}
              month={month}
              scroll={focus === "all" ? scroll : 0}
              reduced={reduced}
              small={small}
              showLabels={real && !small && path === "/"}
              view={path === "/" || !real ? "home" : "other"}
              onPlanet={(id) => real && router.push(CATEGORIES[id].route)}
              onMoon={(cat, id) => {
                if (real) {
                  openItem(cat, id);
                  setHover(null);
                }
              }}
              onHover={(h) => setHover(real || !h ? h : null)}
            />
          </GlBoundary>
        ) : null}
        {/* keeps text readable: darker lower down, darker still on detail screens */}
        <div
          className={`pointer-events-none absolute inset-0 transition-opacity duration-700 ${focus === "all" ? "bg-[linear-gradient(180deg,rgb(3_0_20/0.1)_0%,rgb(3_0_20/0)_30%,rgb(3_0_20/0.55)_78%,rgb(3_0_20/0.8)_100%)]" : "bg-[linear-gradient(180deg,rgb(3_0_20/0.15),rgb(3_0_20/0.6)_62%,rgb(3_0_20/0.85))]"}`}
        />
      </div>
      {hover && mode === "sb" && (
        <div
          role="tooltip"
          className="pointer-events-none fixed top-0 left-0 z-40 grid max-w-60 gap-0.5 rounded-xl bg-[rgb(8_5_24/0.94)] px-3 py-2 text-[13px] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12),0_12px_30px_-10px_#000]"
          style={{ left: Math.max(8, hover.x + 14), top: hover.y + 14, maxWidth: "min(240px, calc(100vw - 16px))" }}
        >
          <b className="font-semibold text-white">{hover.name}</b>
          <span className="num text-body">
            {hover.value}
            {hover.gain != null && (
              <>
                {" "}
                ·{" "}
                <em className={`font-bold not-italic ${hover.gain >= 0 ? "text-gain" : "text-loss"}`}>
                  {hover.gain >= 0 ? "+" : "−"}
                  {Math.abs(hover.gain * 100).toFixed(1)}%
                </em>
              </>
            )}
          </span>
        </div>
      )}
    </>
  );
}
