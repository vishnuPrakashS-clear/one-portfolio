"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePortfolio } from "@/components/providers/portfolio-provider";
import { NAV } from "@/constants";
import { Icon } from "@/components/sub/icon";
import { cn } from "@/lib/utils";
import { setTheme, useTheme } from "@/lib/theme";
import type { IconName } from "@/components/sub/icon";

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));

function Logo() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2.5 rounded-full text-ink no-underline" aria-label="One Portfolio, home">
      <span className="grid size-9 place-items-center rounded-[10px] bg-lime-2 text-white" aria-hidden>
        <Icon name="trend" className="size-5" strokeWidth={2.4} />
      </span>
      <b className="text-[17px] font-bold tracking-[-0.01em] whitespace-nowrap max-[1180px]:min-[641px]:hidden">One Portfolio</b>
    </Link>
  );
}

export function Navbar() {
  const path = usePathname() || "/";
  const { user, S, cur, setCur, lockNow, signOut, locked } = usePortfolio();
  const [moreOn, setMoreOn] = useState<string | null>(null);
  const theme = useTheme();
  const more = moreOn === path,
    setMore = (v: boolean | ((x: boolean) => boolean)) => setMoreOn((typeof v === "function" ? v(more) : v) ? path : null);
  useEffect(() => {
    if (!more) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOn(null);
    };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [more]);
  if (!user || locked) return null;
  const main = NAV.filter((n) => !n.more),
    extra = NAV.filter((n) => n.more);
  const phoneMain = main.filter((n) => !n.moreOnPhone),
    phoneMore = NAV.filter((n) => n.more || n.moreOnPhone);
  const moreActive = phoneMore.some((n) => isActive(path, n.href));

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-card pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-[1440px] items-center gap-3.5 px-6 max-sm:px-4 max-sm:py-2.5">
          <Logo />
          <nav
            aria-label="Sections"
            className="hidden min-w-0 flex-1 [scrollbar-width:none] justify-center gap-0.5 overflow-x-auto sm:flex"
          >
            {[...main, ...extra.filter((n) => n.href !== "/upload")].map((n) => {
              const on = isActive(path, n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "relative flex shrink-0 items-center gap-2 px-3 py-[22px] text-[14.5px] leading-none font-semibold whitespace-nowrap no-underline transition-colors max-xl:px-2 max-xl:text-[14px]",
                    on ? "text-lime" : "text-body hover:text-ink",
                  )}
                >
                  {n.more ? n.short : n.label}
                  {on && <i className="absolute inset-x-2 bottom-0 h-[3px] rounded-t-full bg-lime" aria-hidden />}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Link href="/upload" className="btn btn-primary min-h-[38px] px-3.5 max-sm:w-[38px] max-sm:px-0" aria-label="Upload statements">
              <Icon name="upload" />
              <span className="max-sm:hidden">Upload</span>
            </Link>
            <div className="inline-flex rounded-[10px] bg-tint p-[3px]" role="group" aria-label="Show money in">
              {(["INR", "USD"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={cur === c}
                  onClick={() => setCur(c)}
                  title={c === "INR" ? "Show rupee amounts" : "Show dollar amounts"}
                  className={cn(
                    "grid h-8 min-w-[34px] cursor-pointer place-items-center rounded-[8px] text-[14px] font-bold transition-colors",
                    cur === c ? "bg-card text-ink shadow-[0_1px_2px_rgb(0_0_0/0.15)]" : "text-muted",
                  )}
                >
                  {c === "INR" ? "₹" : "$"}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn size-[38px] min-h-0 p-0"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              title={theme === "dark" ? "Light mode" : "Dark mode"}
            >
              <Icon name={theme === "dark" ? "sun" : "moon"} />
            </button>
            {S?.lock && (
              <button
                type="button"
                className="btn size-[38px] min-h-0 p-0"
                onClick={lockNow}
                aria-label="Lock the app"
                title="Lock the app"
              >
                <Icon name="lock" />
              </button>
            )}
            <button
              type="button"
              className="btn size-[38px] min-h-0 p-0"
              onClick={() => void signOut()}
              aria-label="Sign out"
              title={`Sign out (${user.email})`}
            >
              <Icon name="signout" />
            </button>
          </div>
        </div>
      </header>

      {/* phones: the main places in a bottom bar, the rest under More */}
      <nav
        aria-label="Sections"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 gap-0.5 border-t border-line bg-card px-1.5 pt-1.5 pb-[calc(6px+env(safe-area-inset-bottom))] sm:hidden"
      >
        {phoneMain.map((n) => {
          const on = isActive(path, n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={on ? "page" : undefined}
              className={cn(
                "grid min-h-[52px] content-center justify-items-center gap-1 rounded-[12px] px-0.5 text-[11.5px] leading-tight font-semibold no-underline",
                on ? "text-lime" : "text-muted",
              )}
            >
              <Icon name={(n.icon || "home") as IconName} className="size-[22px]" strokeWidth={on ? 2.3 : 1.8} />
              {n.short}
            </Link>
          );
        })}
        <button
          type="button"
          aria-expanded={more}
          aria-controls="more-menu"
          onClick={() => setMore((v) => !v)}
          className={cn(
            "grid min-h-[52px] cursor-pointer content-center justify-items-center gap-1 rounded-[12px] text-[11.5px] font-semibold",
            more || moreActive ? "text-lime" : "text-muted",
          )}
        >
          <Icon name="menu" className="size-[22px]" strokeWidth={1.8} />
          More
        </button>
      </nav>
      <AnimatePresence>
        {more && (
          <motion.div
            id="more-menu"
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="fixed inset-x-3 bottom-[calc(72px+env(safe-area-inset-bottom))] z-30 grid grid-cols-2 gap-1 rounded-[16px] p-2 shadow-[0_12px_40px_-12px_rgb(0_0_0/0.35)] surface sm:hidden"
          >
            {phoneMore.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "flex min-h-[46px] items-center gap-2.5 rounded-xl px-3.5 text-[15px] font-semibold no-underline",
                  isActive(path, n.href) ? "bg-tint text-lime" : "text-body",
                )}
              >
                <Icon name={(n.icon || "home") as IconName} className="size-[18px]" />
                {n.label}
              </Link>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
