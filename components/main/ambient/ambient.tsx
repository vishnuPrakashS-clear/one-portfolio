"use client";

/* The app's ambient 3D: a calm field of points riding slow waves behind every page (the "drift" scene, picked from five
   candidates by a benchmark of smoothness, text legibility, calmness, size and looks). Each page tints it with its own
   colours and pace, and the change fades in. three.js loads after the page is ready, rendering pauses when the tab is
   hidden, and with reduced motion the scene is drawn once and stays still. */

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import type { Ambient, Look } from "./scenes";

type PageLook = { light: [string, string, string]; dark: [string, string, string]; mood: number; tilt: number };
const BRAND: PageLook = { light: ["#9fe3c2", "#149a68", "#0f7a4f"], dark: ["#7ff0c0", "#1fd19c", "#0b6a4b"], mood: 0.45, tilt: 0.4 };
const tint = (a: string, b: string, c: string, mood: number, tilt: number): PageLook => ({ light: [a, b, c], dark: [a, b, c], mood, tilt });

/** per page: colours (light → deep), how lively, and how high the camera sits */
export const PAGE_LOOK: [RegExp, PageLook][] = [
  [/^\/funds/, tint("#c9bcff", "#8b6cf6", "#5b3fd1", 0.4, 0.45)],
  [/^\/stocks/, tint("#a5dcf6", "#0ea5e9", "#0369a1", 0.55, 0.35)],
  [/^\/bonds/, tint("#fcd58a", "#f59e0b", "#b45309", 0.25, 0.5)],
  [/^\/abroad/, tint("#f6b3d1", "#e9468f", "#9d174d", 0.5, 0.35)],
  [/^\/health/, { ...BRAND, mood: 0.6, tilt: 0.25 }],
  [/^\/(future|goals)/, tint("#a7f3d0", "#00b386", "#047857", 0.75, 0.15)],
  [/^\/plan/, tint("#bfdbfe", "#3b82f6", "#1d4ed8", 0.5, 0.4)],
  [/^\/tax/, tint("#fde68a", "#eab308", "#a16207", 0.3, 0.55)],
  [/^\/checklist/, tint("#ddd6fe", "#7c3aed", "#4c1d95", 0.2, 0.7)],
  [/^\/ask/, tint("#99f6e4", "#14b8a6", "#0f766e", 0.35, 0.5)],
  [/^\/upload/, { ...BRAND, mood: 0.25, tilt: 0.6 }],
];
export function lookFor(path: string, dark: boolean): Look {
  const p = path.replace(/^\/one-portfolio/, "") || "/";
  const L = PAGE_LOOK.find(([re]) => re.test(p))?.[1] || BRAND;
  return { colors: dark ? L.dark : L.light, dark, mood: L.mood, tilt: L.tilt };
}
const isDark = () => document.documentElement.dataset.theme === "dark";

export function AmbientBackground() {
  const ref = useRef<HTMLCanvasElement>(null),
    scene = useRef<Ambient | null>(null),
    path = usePathname() || "/";
  const pathRef = useRef(path);

  useEffect(() => {
    pathRef.current = path;
    scene.current?.setLook(lookFor(path, isDark()));
  }, [path]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let raf = 0,
      alive = true,
      A: Ambient | null = null;
    const still = matchMedia("(prefers-reduced-motion: reduce)");
    const t0 = performance.now();
    const frame = (now: number) => {
      if (!A || !alive) return;
      A.render((now - t0) / 1000);
      if (!still.matches && !document.hidden) raf = requestAnimationFrame(frame);
    };
    const kick = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(frame);
    };
    const fit = () => {
      A?.resize(innerWidth, innerHeight);
      if (still.matches) kick();
    };
    const theme = new MutationObserver(() => {
      A?.setLook(lookFor(pathRef.current, isDark()));
      kick();
    });
    // load three.js once the page is idle, so it never delays the first paint
    const start = () =>
      import("./scenes").then(({ drift }) => {
        if (!alive) return;
        try {
          A = drift(canvas, lookFor(pathRef.current, isDark()));
        } catch {
          return; // no WebGL: the plain backdrop stays
        }
        scene.current = A;
        fit();
        canvas.style.opacity = "1";
        kick();
      });
    const idle = (globalThis as { requestIdleCallback?: (f: () => void) => number }).requestIdleCallback;
    if (idle) idle(start);
    else setTimeout(start, 400);
    addEventListener("resize", fit);
    document.addEventListener("visibilitychange", kick);
    still.addEventListener("change", kick);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      removeEventListener("resize", fit);
      document.removeEventListener("visibilitychange", kick);
      still.removeEventListener("change", kick);
      theme.disconnect();
      A?.dispose();
      scene.current = null;
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 size-full opacity-0 transition-opacity duration-1000"
    />
  );
}
