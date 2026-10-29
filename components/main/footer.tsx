"use client";

import { usePortfolio } from "@/components/providers/portfolio-provider";

export function Footer() {
  const { user, locked } = usePortfolio();
  if (!user || locked) return null;
  return (
    <footer className="mx-auto mt-14 w-full max-w-[1248px] border-t border-line px-6 pt-6 pb-24 max-sm:px-4 sm:pb-10">
      <p className="max-w-[90ch] text-[13px] text-muted">
        Your data is private to you: each person who opens this page sees only their own uploads. Planning aid, not SEBI-registered advice.
        Projections are estimates at the rates shown, not promises; tax figures are estimates, and your CA computes the real numbers.
      </p>
    </footer>
  );
}
