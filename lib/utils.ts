import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** merge class names, letting later Tailwind utilities win */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** read and write small per-viewer preferences; storage can be unavailable (private mode), so failures are ignored */
export const prefs = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  },
};
