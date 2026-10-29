"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useUi } from "@/components/providers/ui-provider";
import { Icon } from "@/components/sub/icon";
import { cn } from "@/lib/utils";

/** a modal <dialog> that opens while `open` is true */
export function Modal({
  open,
  onClose,
  children,
  label,
  className,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-label={label}
      onClose={onClose}
      onCancel={onClose}
      className={cn(
        "m-auto w-full max-w-[min(460px,calc(100vw-32px))] rounded-[22px] bg-[#100a24] px-6 pt-7 pb-5 text-center text-ink shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12),0_40px_100px_-20px_#000]",
        className,
      )}
    >
      {open && children}
    </dialog>
  );
}
const Badge = ({ kind }: { kind: "ok" | "mix" | "bad" }) => (
  <div
    className={cn(
      "mx-auto mb-3.5 grid size-[60px] place-items-center rounded-full",
      kind === "ok" ? "bg-gain/15 text-gain-ink" : kind === "mix" ? "bg-warn/15 text-warn-ink" : "bg-loss/15 text-loss-ink",
    )}
    aria-hidden
  >
    <Icon name={kind === "ok" ? "check" : kind === "mix" ? "alert" : "x"} className="size-7" strokeWidth={2.2} />
  </div>
);

/** what an upload changed, and anything that couldn't be read */
export function ResultDialog() {
  const { result, showResult } = useUi(),
    router = useRouter();
  const r = result,
    ok = !!r && r.done.length > 0 && !r.errors.length;
  return (
    <Modal open={!!r} onClose={() => showResult(null)} label="Upload result">
      {r && (
        <>
          <Badge kind={ok ? "ok" : r.done.length ? "mix" : "bad"} />
          <h2 className="mb-3 font-display text-[22px] font-semibold">
            {r.done.length ? `${r.done.length === 1 ? "Report" : r.done.length + " reports"} updated successfully` : "Nothing was updated"}
          </h2>
          {r.done.length > 0 && (
            <ul className="mb-3 grid gap-2 text-left">
              {r.done.map((x, i) => (
                <li key={i} className="grid gap-0.5 rounded-[14px] bg-white/5 px-3.5 py-3">
                  <b className="[overflow-wrap:anywhere]">{x.name}</b>
                  <span className="text-[13.5px] text-muted">{x.what}</span>
                </li>
              ))}
            </ul>
          )}
          {r.errors.length > 0 && (
            <p className="text-left text-[14px] text-loss">
              {r.errors.map((e, i) => (
                <span key={i} className="block">
                  {e}
                </span>
              ))}
            </p>
          )}
          {r.note && <p className="note mt-2">{r.note}</p>}
          <div className="mt-3 flex flex-wrap justify-center gap-3">
            <button type="button" className="btn btn-primary" onClick={() => showResult(null)}>
              Done
            </button>
            {r.done.length > 0 && (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  showResult(null);
                  router.push("/");
                }}
              >
                See my system
              </button>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}

/** a CAS PDF is usually password-protected; the password opens the file in this browser and is never saved or sent */
function PasswordForm({ name, wrong, answer }: { name: string; wrong: boolean; answer: (v: string | null) => void }) {
  const [v, setV] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    answer(v);
  };
  const pw = { name, wrong };
  return (
    <form onSubmit={submit} className="grid gap-3">
      <Badge kind="mix" />
      <h2 className="font-display text-[22px] font-semibold">
        {pw.wrong ? "That password didn't work" : "This PDF is password-protected"}
      </h2>
      <p className="note">
        {pw.name} needs its password to open. For a CDSL or NSDL statement it&apos;s usually based on your PAN; the exact rule is printed in
        the email it came with.
      </p>
      <label className="sr-only" htmlFor="pwin">
        PDF password
      </label>
      <input
        id="pwin"
        className="field-input text-[16px] font-semibold"
        type="password"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder="Password"
        value={v}
        onChange={(e) => setV(e.target.value)}
        autoFocus
      />
      <p className="note">Used only to open this file in your browser. It is never saved or sent anywhere.</p>
      <div className="flex justify-center gap-3">
        <button className="btn btn-primary" type="submit">
          Open
        </button>
        <button className="btn" type="button" onClick={() => answer(null)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
export function PasswordDialog() {
  const { pw, answerPassword } = useUi();
  return (
    <Modal open={!!pw} onClose={() => answerPassword(null)} label="PDF password">
      {pw && <PasswordForm key={pw.name + String(pw.wrong) + String(pw.resolve)} name={pw.name} wrong={pw.wrong} answer={answerPassword} />}
    </Modal>
  );
}

export function Toasts() {
  const { toasts } = useUi();
  return (
    <div
      className="fixed right-4 bottom-[calc(16px+env(safe-area-inset-bottom))] z-50 grid max-w-[min(360px,calc(100vw-32px))] gap-2 max-sm:bottom-[calc(84px+env(safe-area-inset-bottom))]"
      role="status"
      aria-live="polite"
    >
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 8, opacity: 0 }}
            className="rounded-2xl bg-[rgb(8_5_24/0.95)] px-[18px] py-3 text-[14.5px] font-semibold shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12),0_18px_30px_-12px_#000]"
          >
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
