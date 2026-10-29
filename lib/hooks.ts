"use client";

import { useSyncExternalStore } from "react";

/** the current time, rounded to the minute and updated each minute (0 while pre-rendering) */
export function useNow(): number {
  return useSyncExternalStore(
    (cb) => {
      const t = setInterval(cb, 30000);
      return () => clearInterval(t);
    },
    () => Math.floor(Date.now() / 60000) * 60000,
    () => 0,
  );
}

/** whether a media query matches (false while pre-rendering) */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => matchMedia(query).matches,
    () => false,
  );
}

let gl: boolean | null = null;
function hasWebGL() {
  if (gl == null) {
    try {
      const c = document.createElement("canvas");
      gl = !!(c.getContext("webgl2") || c.getContext("webgl"));
    } catch {
      gl = false;
    }
  }
  return gl;
}
/** null while pre-rendering, then whether this browser can draw WebGL */
export function useWebGL(): boolean | null {
  return useSyncExternalStore(
    () => () => {},
    hasWebGL,
    () => null,
  );
}

/** how far the page has scrolled, as 0–1 of 1.2 screens */
export function useScrollProgress(): number {
  return useSyncExternalStore(
    (cb) => {
      addEventListener("scroll", cb, { passive: true });
      addEventListener("resize", cb);
      return () => {
        removeEventListener("scroll", cb);
        removeEventListener("resize", cb);
      };
    },
    () => Math.round(Math.min(1, scrollY / (innerHeight * 1.2)) * 100) / 100,
    () => 0,
  );
}
