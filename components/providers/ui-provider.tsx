"use client";

/* Screen-level state shared between the 3D system and the screens: which holding's sheet is open, the replayed month, toasts,
   the upload result dialog and the PDF password prompt. */
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import type { CatId } from "@/constants";

export interface Picked {
  cat: CatId;
  id: string;
}
export interface ResultInfo {
  done: { name: string; what: string }[];
  errors: string[];
  note?: string;
}
interface PwAsk {
  name: string;
  wrong: boolean;
  resolve: (v: string | null) => void;
}
interface UiCtx {
  picked: Picked | null;
  openItem: (cat: CatId, id: string) => void;
  closeItem: () => void;
  /** -1 = today; otherwise an index into model.months */
  month: number;
  setMonth: (i: number) => void;
  hover: { name: string; value: string; gain?: number; x: number; y: number } | null;
  setHover: (h: UiCtx["hover"]) => void;
  toasts: { id: number; text: string }[];
  toast: (text: string) => void;
  result: ResultInfo | null;
  showResult: (r: ResultInfo | null) => void;
  pw: PwAsk | null;
  askPassword: (name: string, wrong: boolean) => Promise<string | null>;
  answerPassword: (v: string | null) => void;
}
const Ctx = createContext<UiCtx | null>(null);
export function useUi(): UiCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useUi must be used inside UiProvider");
  return c;
}

export function UiProvider({ children }: { children: ReactNode }) {
  const [picked, setPicked] = useState<Picked | null>(null);
  const [month, setMonth] = useState(-1);
  const [hover, setHover] = useState<UiCtx["hover"]>(null);
  const [toasts, setToasts] = useState<UiCtx["toasts"]>([]);
  const [result, showResult] = useState<ResultInfo | null>(null);
  const [pw, setPw] = useState<PwAsk | null>(null);
  const n = useRef(0);
  const toast = useCallback((text: string) => {
    const id = ++n.current;
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3400);
  }, []);
  const askPassword = useCallback(
    (name: string, wrong: boolean) => new Promise<string | null>((resolve) => setPw({ name, wrong, resolve })),
    [],
  );
  const answerPassword = useCallback(
    (v: string | null) =>
      setPw((p) => {
        p?.resolve(v);
        return null;
      }),
    [],
  );
  const value: UiCtx = {
    picked,
    openItem: useCallback((cat, id) => setPicked({ cat, id }), []),
    closeItem: useCallback(() => setPicked(null), []),
    month,
    setMonth,
    hover,
    setHover,
    toasts,
    toast,
    result,
    showResult,
    pw,
    askPassword,
    answerPassword,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
