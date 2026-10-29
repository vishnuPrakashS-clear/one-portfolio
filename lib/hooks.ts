"use client";

import { useEffect, useState, useSyncExternalStore, type RefObject } from "react";

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

/** whether an element is on screen (true until measured), so animations can stop when it's scrolled away */
export function useInView<T extends Element>(ref: RefObject<T | null>, margin = "80px"): boolean {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setOn(e.isIntersecting), { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, margin]);
  return on;
}

let scrolling = false,
  scrollTimer: ReturnType<typeof setTimeout> | undefined;
const scrollSubs = new Set<() => void>();
function onScroll() {
  if (!scrolling) {
    scrolling = true;
    scrollSubs.forEach((f) => f());
  }
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => {
    scrolling = false;
    scrollSubs.forEach((f) => f());
  }, 160);
}
/** true while the page is being scrolled (and for 160 ms after), so heavy animation can pause and scrolling stays smooth */
export function useScrolling(): boolean {
  return useSyncExternalStore(
    (cb) => {
      if (!scrollSubs.size) addEventListener("scroll", onScroll, { passive: true });
      scrollSubs.add(cb);
      return () => {
        scrollSubs.delete(cb);
        if (!scrollSubs.size) removeEventListener("scroll", onScroll);
      };
    },
    () => scrolling,
    () => false,
  );
}
