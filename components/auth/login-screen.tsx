"use client";

import { motion } from "framer-motion";
import { useState, type FormEvent } from "react";
import { usePortfolio, type LoginView } from "@/components/providers/portfolio-provider";
import { cloudErr, sb } from "@/lib/supabase";
import { Icon } from "@/components/sub/icon";
import { riseIn, slideInFromLeft } from "@/lib/motion";
import { HeroArt } from "@/components/main/art/hero-art";

const TITLE: Record<LoginView, string> = {
  signin: "Sign in to One Portfolio",
  signup: "Create your account",
  forgot: "Reset your password",
  newpass: "Choose a new password",
  check: "Check your email",
};
const SUB: Record<Exclude<LoginView, "check">, string> = {
  signin: "Your investments in India, the US and Japan in one place. Every number comes from your own statements.",
  signup: "Use your email and a new password. Everything you upload is private to your account.",
  forgot:
    "We'll email you a link to set a new password. If it doesn't arrive within a few minutes, ask the person who runs this app to reset it for you.",
  newpass: "Pick a password you don't use anywhere else.",
};
const GO: Record<Exclude<LoginView, "check">, string> = {
  signin: "Sign in",
  signup: "Create account",
  forgot: "Email me a link",
  newpass: "Save password",
};

function friendly(e: unknown) {
  const m = String((e as Error)?.message || e);
  return /Invalid login/i.test(m)
    ? "That email and password don't match."
    : /Email not confirmed/i.test(m)
      ? "Confirm your email first: open the link we sent you."
      : /already registered|already been registered|User already/i.test(m)
        ? "That email already has an account. Sign in instead."
        : /Sign-up is full|Database error saving new user/i.test(m)
          ? "Sign-up is full or closed for this app right now."
          : /Password should|weak/i.test(m)
            ? "Pick a longer, less common password."
            : /rate limit/i.test(m)
              ? "Too many attempts. Wait a few minutes and try again."
              : /at least 10/.test(m) || /valid email/.test(m)
                ? m
                : cloudErr(e);
}

export function LoginScreen() {
  const { loginView, loginMsg, showLogin, signedIn } = usePortfolio();
  const V = loginView || "signin";
  const [email, setEmail] = useState(""),
    [pass, setPass] = useState(""),
    [busy, setBusy] = useState(false),
    [err, setErr] = useState("");
  const here = typeof location !== "undefined" ? location.origin + location.pathname : "";
  const go = (v: LoginView, msg = "") => {
    setErr("");
    setPass("");
    showLogin(v, msg);
  };
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      if (V === "signin") {
        const { error } = await sb().auth.signInWithPassword({ email: email.trim(), password: pass });
        if (error) throw error;
        await signedIn(true);
        return;
      }
      if (V === "signup") {
        if (pass.length < 10) throw new Error("Use at least 10 characters.");
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) throw new Error("Enter a valid email address.");
        const { data, error } = await sb().auth.signUp({ email: email.trim(), password: pass, options: { emailRedirectTo: here } });
        if (error) throw error;
        if (data.session) {
          await signedIn(true);
          return;
        }
        if (data.user && Array.isArray(data.user.identities) && !data.user.identities.length) throw new Error("already registered");
        return go("check", `We sent a confirmation link to ${email.trim()}. Open it, then sign in.`);
      }
      if (V === "forgot") {
        const { error } = await sb().auth.resetPasswordForEmail(email.trim(), { redirectTo: here });
        if (error) throw error;
        return go("check", `If ${email.trim()} has an account, a reset link is on its way. Open it on this device.`);
      }
      if (V === "newpass") {
        if (pass.length < 10) throw new Error("Use at least 10 characters.");
        const { error } = await sb().auth.updateUser({ password: pass });
        if (error) throw error;
        history.replaceState(null, "", here);
        await signedIn(true);
        return;
      }
    } catch (x) {
      setErr(friendly(x));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      role="dialog"
      aria-modal
      aria-label="Sign in"
      className="fixed inset-0 z-50 grid place-items-center gap-x-14 gap-y-2 overflow-auto p-4 lg:grid-cols-[minmax(0,520px)_420px] lg:justify-center"
    >
      <motion.div variants={slideInFromLeft(0.1)} initial="hidden" animate="visible" className="grid gap-3 max-lg:hidden">
        <HeroArt kind="home" className="max-w-[480px]" />
        <h2 className="font-display text-[40px] leading-[1.05] font-bold tracking-[-0.03em] text-ink">
          All your money, <span className="gradient-text">in one clear picture</span>
        </h2>
        <p className="max-w-[46ch] text-[16px] text-body">
          Upload your CDSL statement and broker reports. See mutual funds, stocks, bonds and money abroad, how they grew, and whether
          you&apos;ll reach your goal.
        </p>
      </motion.div>
      <motion.form
        noValidate
        onSubmit={submit}
        variants={riseIn(0.1)}
        initial="hidden"
        animate="visible"
        className="grid w-[min(420px,100%)] gap-3.5 rounded-[24px] px-7 pt-8 pb-7 surface"
      >
        <div
          className="grid size-14 place-items-center justify-self-center rounded-[18px] bg-gradient-to-br from-act-a to-act-b text-on-act shadow-[0_12px_24px_-10px_rgb(95_227_122/0.7)]"
          aria-hidden
        >
          <Icon name="orbit" className="size-8" strokeWidth={2} />
        </div>
        <h1 className="text-center font-display text-[26px] leading-tight font-bold tracking-[-0.02em]">{TITLE[V]}</h1>
        <p className="note text-center">{V === "check" ? loginMsg || "We sent you a link. Open it on this device to finish." : SUB[V]}</p>
        {V === "check" ? (
          <button type="button" className="btn btn-primary min-h-12" onClick={() => go("signin")}>
            Back to sign in
          </button>
        ) : (
          <>
            {V !== "newpass" && (
              <label className="grid gap-1.5" htmlFor="lg-email">
                <span className="text-[13.5px] font-medium text-body">Email</span>
                <input
                  id="lg-email"
                  className="field-input"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus
                />
              </label>
            )}
            {V !== "forgot" && (
              <label className="grid gap-1.5" htmlFor="lg-pass">
                <span className="text-[13.5px] font-medium text-body">
                  {V === "signin" ? "Password" : V === "signup" ? "Password (10+ characters)" : "New password (10+ characters)"}
                </span>
                <input
                  id="lg-pass"
                  className="field-input"
                  type="password"
                  autoComplete={V === "signin" ? "current-password" : "new-password"}
                  required
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                />
              </label>
            )}
            {(err || (loginMsg && V !== "signin")) && (
              <p className="text-[14px] text-loss-ink" role="alert">
                {err || loginMsg}
              </p>
            )}
            <button id="lg-go" className="btn btn-primary min-h-12 text-[15.5px]" type="submit" disabled={busy}>
              {busy ? "Please wait…" : GO[V]}
            </button>
            <div className="flex flex-wrap justify-between gap-2 text-[14px]">
              {V === "signin" ? (
                <>
                  <button type="button" className="cursor-pointer font-semibold underline underline-offset-3" onClick={() => go("forgot")}>
                    Forgot password?
                  </button>
                  <button type="button" className="cursor-pointer font-semibold underline underline-offset-3" onClick={() => go("signup")}>
                    First time? Create your account
                  </button>
                </>
              ) : (
                V !== "newpass" && (
                  <button type="button" className="cursor-pointer font-semibold underline underline-offset-3" onClick={() => go("signin")}>
                    Back to sign in
                  </button>
                )
              )}
            </div>
          </>
        )}
        <p className="note mt-0.5 text-center text-[12.5px]">Secured by Supabase Auth · your data is readable only by your account.</p>
      </motion.form>
    </div>
  );
}
