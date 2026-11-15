"use client";

/* Light or dark. The choice is kept per device ("op-theme": light | dark; nothing = follow the device) and written to
   html[data-theme] before first paint by THEME_SCRIPT, so pages never flash the wrong colours. Screens that draw with
   JavaScript (3D scenes, canvas textures) read it through useTheme(). */
import { useSyncExternalStore } from "react";
import { prefs } from "@/lib/utils";

export type Theme = "light" | "dark";
import { THEME_KEY as KEY } from "@/lib/theme-script";

const read = (): Theme => (typeof document !== "undefined" && document.documentElement.dataset.theme === "dark" ? "dark" : "light");
function subscribe(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  // follow the device while no choice is stored
  const mq = matchMedia("(prefers-color-scheme: dark)");
  const onSys = () => {
    if (!prefs.get(KEY)) document.documentElement.dataset.theme = mq.matches ? "dark" : "light";
  };
  mq.addEventListener("change", onSys);
  return () => {
    mo.disconnect();
    mq.removeEventListener("change", onSys);
  };
}
/** the theme on screen now */
export const useTheme = () => useSyncExternalStore(subscribe, read, () => "light" as Theme);
export function setTheme(t: Theme) {
  prefs.set(KEY, t);
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t === "dark" ? "#0d0e10" : "#eef5f1");
}
