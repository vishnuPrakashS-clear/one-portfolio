"use client";

import type { ReactNode } from "react";
import { usePortfolio } from "@/components/providers/portfolio-provider";
import { LoginScreen } from "@/components/auth/login-screen";
import { LockScreen } from "@/components/auth/lock-screen";
import { HoldingSheet } from "@/components/sub/holding-sheet";
import { StatusRow } from "./status-row";
import { PasswordDialog, ResultDialog, Toasts } from "./dialogs";

/** decides what's on screen: sign-in, the lock, a loading line, or the screens */
export function AppShell({ children }: { children: ReactNode }) {
  const { user, mode, locked, loginView } = usePortfolio();
  if (loginView || (!user && mode === "signedout")) return <LoginScreen />;
  if (locked) return <LockScreen />;
  return (
    <main id="main" className="relative mx-auto w-full max-w-[1248px] px-6 max-sm:px-4">
      <StatusRow />
      {mode === "loading" && !user ? (
        <p className="note pt-[30vh] text-center">Loading…</p>
      ) : (
        <div className="grid gap-5 max-sm:gap-3.5">{children}</div>
      )}
      <HoldingSheet />
      <ResultDialog />
      <PasswordDialog />
      <Toasts />
    </main>
  );
}
