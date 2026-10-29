"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePortfolio } from "@/components/providers/portfolio-provider";
import { NAV } from "@/constants";
import { Icon } from "@/components/sub/icon";
import { cn } from "@/lib/utils";
import { useScrollProgress } from "@/lib/hooks";

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));

function Logo() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2.5 rounded-full text-ink no-underline" aria-label="One Portfolio, home">
      <span
        className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-[#1b1240] to-[#2b1660] text-stocks shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12),0_0_18px_-4px_#22d3ee]"
        aria-hidden
      >
        <Icon name="orbit" className="size-6" strokeWidth={1.8} />
      </span>
      <b className="font-display text-[17px] font-bold tracking-[-0.01em] whitespace-nowrap max-[1300px]:min-[641px]:hidden">
        One Portfolio
      </b>
    </Link>
  );
}

export function Navbar() {
  const path = usePathname() || "/";
  const { user, S, cur, setCur, lockNow, signOut, locked } = usePortfolio();
  const scrolled = useScrollProgress() > 0.003,
    [moreOn, setMoreOn] = useState<string | null>(null);
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
      <header
        className={cn(
          "sticky top-0 z-30 border-b pt-[env(safe-area-inset-top)] backdrop-blur-[14px] backdrop-saturate-150 transition-colors",
          scrolled
            ? "border-white/12 bg-[rgb(3_0_20/0.78)]"
            : "border-transparent bg-gradient-to-b from-[rgb(3_0_20/0.85)] to-[rgb(3_0_20/0.45)]",
        )}
      >
        <div className="mx-auto flex max-w-[1440px] items-center gap-3.5 px-6 py-3 max-sm:px-4 max-sm:py-2.5">
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
                    "relative flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2.5 text-[14px] leading-none font-semibold whitespace-nowrap no-underline transition-colors max-xl:px-2.5 max-xl:text-[13.5px]",
                    on ? "text-ink" : "text-body hover:bg-white/7 hover:text-ink",
                  )}
                  style={
                    on
                      ? {
                          background: `${n.color || "#ffffff"}2e`,
                          boxShadow: `inset 0 0 0 1px ${(n.color || "#ffffff") + "8c"}, 0 0 22px -8px ${n.color || "#fff"}`,
                        }
                      : undefined
                  }
                >
                  {n.color && (
                    <i className="size-[7px] rounded-full" style={{ background: n.color, boxShadow: `0 0 8px ${n.color}` }} aria-hidden />
                  )}
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Link href="/upload" className="btn min-h-[38px] px-3.5 max-sm:w-[38px] max-sm:px-0" aria-label="Upload statements">
              <Icon name="upload" />
              <span className="max-sm:hidden">Upload</span>
            </Link>
            <div
              className="inline-flex rounded-full bg-white/7 p-[3px] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12)]"
              role="group"
              aria-label="Show money in"
            >
              {(["INR", "USD"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={cur === c}
                  onClick={() => setCur(c)}
                  title={c === "INR" ? "Show rupee amounts" : "Show dollar amounts"}
                  className={cn(
                    "grid h-8 min-w-[34px] cursor-pointer place-items-center rounded-full text-[14px] font-bold transition-colors",
                    cur === c ? "bg-ink text-space" : "text-muted",
                  )}
                >
                  {c === "INR" ? "₹" : "$"}
                </button>
              ))}
            </div>
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
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 gap-0.5 border-t border-white/12 bg-[rgb(8_5_24/0.94)] px-2 pt-2 pb-[calc(8px+env(safe-area-inset-bottom))] backdrop-blur-[14px] sm:hidden"
      >
        {phoneMain.map((n) => {
          const on = isActive(path, n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={on ? "page" : undefined}
              className={cn(
                "grid min-h-[50px] content-center justify-items-center gap-[5px] rounded-[14px] px-0.5 text-[12px] leading-tight font-semibold no-underline",
                on ? "bg-white/10 text-ink" : "text-body",
              )}
            >
              <i
                className="size-[7px] rounded-full"
                style={{ background: n.color || "#f6f4ff", boxShadow: n.color ? `0 0 8px ${n.color}` : undefined }}
                aria-hidden
              />
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
            "grid min-h-[50px] cursor-pointer content-center justify-items-center gap-[5px] rounded-[14px] text-[12px] font-semibold",
            more || moreActive ? "bg-white/12 text-ink" : "text-body",
          )}
        >
          <Icon name="menu" className="size-3.5" />
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
            className="fixed inset-x-3 bottom-[calc(76px+env(safe-area-inset-bottom))] z-30 grid gap-1 rounded-[20px] p-2 glass sm:hidden"
          >
            {phoneMore.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "flex min-h-[46px] items-center gap-2.5 rounded-xl px-4 text-[15px] font-semibold no-underline",
                  isActive(path, n.href) ? "bg-white/10 text-ink" : "text-body",
                )}
              >
                {n.color && <i className="size-2 rounded-full" style={{ background: n.color }} aria-hidden />}
                {n.label}
              </Link>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
