"use client";

import { useRef, useState, type FormEvent } from "react";
import { usePortfolio } from "@/components/providers/portfolio-provider";
import { Icon } from "@/components/sub/icon";

export function LockScreen() {
  const { unlock, signOut } = usePortfolio();
  const [pin, setPin] = useState(""),
    [err, setErr] = useState("");
  const tries = useRef(0),
    wait = useRef(0);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const now = Date.now();
    if (wait.current > now) {
      setErr(`Too many wrong tries. Try again in ${Math.ceil((wait.current - now) / 1000)} seconds.`);
      return;
    }
    if (await unlock(pin)) {
      tries.current = 0;
      return;
    }
    tries.current++;
    if (tries.current >= 5) wait.current = Date.now() + 30000 * Math.pow(2, tries.current - 5);
    setErr(
      tries.current >= 5
        ? `Wrong PIN. Locked for ${Math.round((wait.current - Date.now()) / 1000)} seconds.`
        : `Wrong PIN (${5 - tries.current} tr${5 - tries.current === 1 ? "y" : "ies"} left before a pause).`,
    );
    setPin("");
  }
  return (
    <div role="dialog" aria-modal aria-label="App locked" className="fixed inset-0 z-50 grid place-items-center overflow-auto p-4">
      <form
        onSubmit={submit}
        autoComplete="off"
        className="grid w-[min(400px,100%)] justify-items-center gap-3.5 rounded-[24px] px-7 py-8 text-center surface"
      >
        <div className="grid size-14 place-items-center rounded-[18px] bg-gradient-to-br from-act-a to-act-b text-on-act" aria-hidden>
          <Icon name="lock" className="size-7" />
        </div>
        <h1 className="font-display text-[26px] font-bold tracking-[-0.02em]">One Portfolio is locked</h1>
        <p className="note">Enter your PIN to see your investments.</p>
        <label className="sr-only" htmlFor="lockpin">
          PIN
        </label>
        <input
          id="lockpin"
          className="field-input text-center text-[22px] font-semibold tracking-[0.35em]"
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={8}
          placeholder="PIN"
          required
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value)}
        />
        {err && (
          <p className="text-[14px] text-loss-ink" role="alert">
            {err}
          </p>
        )}
        <button className="btn btn-primary min-h-12 w-full" type="submit">
          Unlock
        </button>
        <p className="note">
          Forgot your PIN?{" "}
          <button type="button" className="cursor-pointer font-semibold underline" onClick={() => void signOut()}>
            Sign out
          </button>{" "}
          and sign in again with your password; then turn the lock off or set a new PIN.
        </p>
      </form>
    </div>
  );
}
