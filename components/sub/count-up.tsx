"use client";

import { animate, useInView, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

/** a figure that rolls up once when it first comes into view (it is correct before and after; this is only motion) */
export function CountUp({ value, format, className }: { value: number; format: (v: number) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);
  const done = useRef(false);
  useEffect(() => {
    if (!inView || reduced || done.current) {
      setShown(value);
      return;
    }
    done.current = true;
    const c = animate(0, value, { duration: 0.9, ease: [0.2, 0.8, 0.2, 1], onUpdate: setShown });
    return () => c.stop();
  }, [inView, reduced, value]);
  return (
    <span ref={ref} className={className}>
      {format(shown)}
    </span>
  );
}
