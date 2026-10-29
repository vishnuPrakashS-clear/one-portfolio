"use client";

/* The person's portfolio: sign-in state, the PIN lock, loading and saving their row, and the view model every screen reads.
   Upload parsers change the document in place, so changes go through mutate(), which re-renders and saves (debounced). */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import type { Goal, PinLock, Portfolio } from "@/types/portfolio";
import { adopt, freshState } from "@/lib/core/abroad";
import { buildModel, type Model } from "@/lib/model";
import {
  aiSetup,
  cloud,
  cloudDelete,
  cloudErr,
  cloudLoad,
  cloudSave,
  cloudStamp,
  refreshPricesNow,
  sb,
  type AiHelper,
  type RefreshResult,
} from "@/lib/supabase";
import { clearSession, LOCK_IDLE, pinMatches, sessionUnlocked, touchSession } from "@/lib/pin";
import { prefs } from "@/lib/utils";
import type { Currency } from "@/lib/format";

export type Mode = "loading" | "signedout" | "sb" | "sberr";
export type LoginView = "signin" | "signup" | "forgot" | "newpass" | "check";
export interface Status {
  kind: "ok" | "busy" | "err";
  text: string;
}
export interface Banner {
  text: string;
  action?: () => void;
  label?: string;
}

interface PortfolioCtx {
  mode: Mode;
  user: User | null;
  S: Portfolio | null;
  model: Model;
  version: number;
  locked: boolean;
  cur: Currency;
  fx: number;
  status: Status;
  banner: Banner | null;
  ai: AiHelper | null;
  loginView: LoginView | null;
  loginMsg: string;
  freshLogin: number;
  setCur: (c: Currency) => void;
  showLogin: (v: LoginView | null, msg?: string) => void;
  /** change the document (creating it on first upload) and save */
  mutate: (fn: (S: Portfolio) => void) => void;
  /** the same for slow changes (reading uploads); saves only when save(result) says so */
  mutateAsync: <T>(fn: (S: Portfolio) => Promise<T>, save?: (r: T) => boolean) => Promise<T | undefined>;
  setGoal: (g: Partial<Goal>) => void;
  setStatus: (s: Status) => void;
  /** put the status line back to saved / signed out */
  idleStatus: () => void;
  signedIn: (fresh: boolean) => Promise<void>;
  signOut: () => Promise<void>;
  lockNow: () => void;
  unlock: (pin: string) => Promise<boolean>;
  setLock: (lock: PinLock | null) => void;
  deleteData: () => Promise<void>;
  refreshNow: () => Promise<RefreshResult>;
}
const Ctx = createContext<PortfolioCtx | null>(null);

export function usePortfolio(): PortfolioCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePortfolio must be used inside PortfolioProvider");
  return c;
}

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [version, setVersion] = useState(0);
  const [locked, setLocked] = useState(false);
  const [cur, setCurState] = useState<Currency>(() => (prefs.get("gbp-cur") === "USD" ? "USD" : "INR"));
  /** the document as last published to the screens (it changes in place; version marks each change) */
  const [doc, setDoc] = useState<Portfolio | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "busy", text: "Loading…" });
  const [banner, setBanner] = useState<Banner | null>(null);
  const [ai, setAi] = useState<AiHelper | null>(null);
  const [loginView, setLoginView] = useState<LoginView | null>(null);
  const [loginMsg, setLoginMsg] = useState("");
  const [freshLogin, setFreshLogin] = useState(0);
  const SRef = useRef<Portfolio | null>(null),
    heldRef = useRef<Portfolio | null>(null),
    userRef = useRef<User | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    saving = useRef(false),
    again = useRef(false),
    lockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lockedRef = useRef(false),
    modeRef = useRef<Mode>("loading"),
    aiTried = useRef(false),
    freshRef = useRef(0);
  // callbacks that call themselves (retry buttons, the save queue, the idle lock) go through refs
  const saveRef = useRef<() => Promise<void>>(async () => {}),
    loadRef = useRef<(fresh: boolean) => Promise<void>>(async () => {}),
    lockNowRef = useRef<() => void>(() => {});

  const bump = useCallback(() => {
    setDoc(SRef.current);
    setVersion((v) => v + 1);
  }, []);
  const setModeBoth = (m: Mode) => {
    modeRef.current = m;
    setMode(m);
  };
  const setCur = useCallback((c: Currency) => {
    setCurState(c);
    prefs.set("gbp-cur", c);
  }, []);
  const showLogin = useCallback((v: LoginView | null, msg = "") => {
    setLoginView(v);
    setLoginMsg(msg);
  }, []);

  const idleStatus = useCallback(() => {
    const m = modeRef.current,
      u = userRef.current;
    if (m === "loading") setStatus({ kind: "busy", text: "Loading…" });
    else if (m === "sberr") setStatus({ kind: "err", text: "Supabase isn't reachable · nothing can be saved" });
    else if (m === "signedout") setStatus({ kind: "busy", text: "Signed out" });
    else setStatus({ kind: "ok", text: `Saved to your account${u?.email ? " · " + u.email : ""}` });
  }, []);

  const save = useCallback(async () => {
    saveTimer.current = null;
    const S = SRef.current,
      u = userRef.current;
    if (!S || !u || lockedRef.current || modeRef.current !== "sb") return;
    if (saving.current) {
      again.current = true;
      return;
    }
    saving.current = true;
    try {
      await cloudSave(u, S);
      setBanner(null);
      idleStatus();
    } catch (e) {
      const t = cloudErr(e);
      setStatus({ kind: "err", text: "Not saved: " + t });
      setBanner({ text: t, action: () => void saveRef.current(), label: "Save again" });
    }
    saving.current = false;
    if (again.current) {
      again.current = false;
      void saveRef.current();
    }
  }, [idleStatus]);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);
  const dirty = useCallback(() => {
    const S = SRef.current;
    if (!S || lockedRef.current) return;
    S.updatedAt = new Date().toISOString();
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void save(), 600);
    setStatus({ kind: "busy", text: "Saving…" });
  }, [save]);

  const armIdle = useCallback(() => {
    if (lockTimer.current) clearTimeout(lockTimer.current);
    if (SRef.current?.lock && !lockedRef.current) lockTimer.current = setTimeout(() => lockNowRef.current(), LOCK_IDLE);
  }, []);
  const lockNow = useCallback(() => {
    const S = SRef.current;
    if (!S || !S.lock || lockedRef.current) return;
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      void save();
    }
    heldRef.current = S;
    SRef.current = null;
    lockedRef.current = true;
    setLocked(true);
    clearSession();
    bump();
  }, [bump, save]);
  useEffect(() => {
    lockNowRef.current = lockNow;
  }, [lockNow]);

  const load = useCallback(
    async (fresh: boolean) => {
      const { data } = await sb().auth.getSession();
      const session = data.session;
      if (!session) {
        userRef.current = null;
        setUser(null);
        SRef.current = null;
        setModeBoth("signedout");
        idleStatus();
        bump();
        setLoginView((v) => v || "signin");
        return;
      }
      userRef.current = session.user;
      setUser(session.user);
      setLoginView(null);
      setModeBoth("loading");
      idleStatus();
      let d: Partial<Portfolio> | null;
      try {
        d = await cloudLoad(session.user);
      } catch (e) {
        setModeBoth("sberr");
        idleStatus();
        setBanner({ text: cloudErr(e), action: () => void loadRef.current(false) });
        bump();
        return;
      }
      setModeBoth("sb");
      setBanner(null);
      const S = adopt(d);
      const recent = fresh || (freshRef.current && Date.now() - freshRef.current < 60000);
      if (S?.lock && !sessionUnlocked() && !recent) {
        heldRef.current = S;
        SRef.current = null;
        lockedRef.current = true;
        setLocked(true);
      } else {
        SRef.current = S;
        if (recent) touchSession();
        armIdle();
      }
      idleStatus();
      bump();
      if (!aiTried.current) {
        aiTried.current = true;
        setAi(await aiSetup());
      }
    },
    [armIdle, bump, idleStatus],
  );
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  const signedIn = useCallback(
    async (fresh: boolean) => {
      if (fresh) {
        freshRef.current = Date.now();
        setFreshLogin(freshRef.current);
      }
      await load(fresh);
    },
    [load],
  );

  // the first load starts from Supabase's INITIAL_SESSION event; sign-in screens call signedIn() themselves
  useEffect(() => {
    const { data } = sb().auth.onAuthStateChange((ev) => {
      if (ev === "INITIAL_SESSION") void loadRef.current(false);
      if (ev === "PASSWORD_RECOVERY") setLoginView("newpass");
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // pick up prices written by the daily refresh when coming back to the tab; lock on return after the idle time
  useEffect(() => {
    const onVis = async () => {
      if (document.visibilityState !== "visible") return;
      if (!lockedRef.current && SRef.current?.lock && !sessionUnlocked()) {
        lockNow();
        return;
      }
      const u = userRef.current;
      if (modeRef.current !== "sb" || saving.current || saveTimer.current || !u) return;
      try {
        const at = await cloudStamp(u);
        if (at && at !== cloud.at && !saving.current && !saveTimer.current) {
          const n = adopt(await cloudLoad(u));
          if (lockedRef.current) heldRef.current = n;
          else {
            SRef.current = n;
            bump();
          }
        }
      } catch {
        /* offline: keep what's on screen */
      }
    };
    document.addEventListener("visibilitychange", onVis);
    let last = 0;
    const touch = () => {
      if (lockedRef.current || !SRef.current?.lock) return;
      const n = Date.now();
      if (n - last < 5000) return;
      last = n;
      touchSession();
      armIdle();
    };
    const evs = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    evs.forEach((e) => addEventListener(e, touch, { passive: true, capture: true }));
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      evs.forEach((e) => removeEventListener(e, touch, { capture: true }));
    };
  }, [armIdle, bump, lockNow]);

  const mutate = useCallback(
    (fn: (S: Portfolio) => void) => {
      if (lockedRef.current) return;
      const S = SRef.current || (SRef.current = freshState());
      fn(S);
      dirty();
      bump();
    },
    [bump, dirty],
  );
  const mutateAsync = useCallback(
    async <T,>(fn: (S: Portfolio) => Promise<T>, shouldSave?: (r: T) => boolean): Promise<T | undefined> => {
      if (lockedRef.current) return undefined;
      const had = !!SRef.current,
        S = SRef.current || freshState();
      const r = await fn(S);
      if (!shouldSave || shouldSave(r)) {
        SRef.current = S;
        dirty();
      } else if (!had) return r;
      bump();
      return r;
    },
    [bump, dirty],
  );
  const setGoal = useCallback(
    (g: Partial<Goal>) =>
      mutate((S) => {
        const y = new Date().getFullYear();
        S.settings.goal = { amt: 1e7, year: y + 10, ...(S.settings.goal || {}), ...g };
      }),
    [mutate],
  );
  const unlock = useCallback(
    async (pin: string) => {
      if (!(await pinMatches(pin, heldRef.current?.lock))) return false;
      SRef.current = heldRef.current;
      heldRef.current = null;
      lockedRef.current = false;
      setLocked(false);
      touchSession();
      armIdle();
      bump();
      return true;
    },
    [armIdle, bump],
  );
  const setLock = useCallback(
    (lock: PinLock | null) =>
      mutate((S) => {
        if (lock) S.lock = lock;
        else delete S.lock;
        touchSession();
      }),
    [mutate],
  );
  const signOut = useCallback(async () => {
    try {
      await sb().auth.signOut();
    } catch {
      /* already signed out */
    }
    userRef.current = null;
    setUser(null);
    cloud.rowId = null;
    cloud.at = null;
    SRef.current = null;
    heldRef.current = null;
    lockedRef.current = false;
    setLocked(false);
    clearSession();
    setModeBoth("signedout");
    idleStatus();
    setLoginView("signin");
    bump();
  }, [bump, idleStatus]);
  const deleteData = useCallback(async () => {
    const u = userRef.current;
    if (!u) return;
    await cloudDelete(u);
    SRef.current = null;
    heldRef.current = null;
    lockedRef.current = false;
    setLocked(false);
    bump();
  }, [bump]);
  const refreshNow = useCallback(async () => {
    const r = await refreshPricesNow();
    const u = userRef.current;
    if (u) {
      SRef.current = adopt(await cloudLoad(u));
      bump();
    }
    return r;
  }, [bump]);

  const S = doc;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the document changes in place; version marks each change
  const model = useMemo(() => buildModel(S), [S, version]);
  const value: PortfolioCtx = {
    mode,
    user,
    S,
    model,
    version,
    locked,
    cur,
    fx: S?.settings.fx || model.fx,
    status,
    banner,
    ai,
    loginView,
    loginMsg,
    freshLogin,
    setCur,
    showLogin,
    mutate,
    mutateAsync,
    setGoal,
    setStatus,
    idleStatus,
    signedIn,
    signOut,
    lockNow,
    unlock,
    setLock,
    deleteData,
    refreshNow,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
