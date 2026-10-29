/* Entrance animations shared by every screen (Framer Motion variants). Reduced-motion is respected by MotionConfig in the layout. */
import type { Variants } from "framer-motion";

const ease = [0.2, 0.8, 0.2, 1] as const;

export const slideInFromLeft = (delay = 0): Variants => ({
  hidden: { x: -60, opacity: 0 },
  visible: { x: 0, opacity: 1, transition: { delay, duration: 0.6, ease } },
});
export const slideInFromRight = (delay = 0): Variants => ({
  hidden: { x: 60, opacity: 0 },
  visible: { x: 0, opacity: 1, transition: { delay, duration: 0.6, ease } },
});
export const slideInFromTop: Variants = {
  hidden: { y: -40, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { delay: 0.15, duration: 0.5, ease } },
};
export const riseIn = (delay = 0): Variants => ({
  hidden: { y: 28, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { delay, duration: 0.55, ease } },
});
export const stagger = (gap = 0.07, delay = 0): Variants => ({
  hidden: {},
  visible: { transition: { staggerChildren: gap, delayChildren: delay } },
});
