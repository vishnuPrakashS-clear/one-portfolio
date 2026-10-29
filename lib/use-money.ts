"use client";

import { useCallback } from "react";
import { usePortfolio } from "@/components/providers/portfolio-provider";
import { money, short, usd } from "@/lib/format";

/** rupee amounts in the chosen currency: m() full, s() short (₹6.75 L), d() a dollar amount from the abroad sleeve */
export function useMoney() {
  const { cur, fx } = usePortfolio();
  const m = useCallback((v: number) => money(v, cur, fx), [cur, fx]);
  const s = useCallback((v: number) => short(v, cur, fx), [cur, fx]);
  const d = useCallback((v: number) => usd(v, cur, fx), [cur, fx]);
  return { m, s, d, cur, fx };
}
