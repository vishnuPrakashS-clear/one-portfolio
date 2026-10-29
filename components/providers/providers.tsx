"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";
import { PortfolioProvider } from "./portfolio-provider";
import { UiProvider } from "./ui-provider";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <PortfolioProvider>
        <UiProvider>{children}</UiProvider>
      </PortfolioProvider>
    </MotionConfig>
  );
}
