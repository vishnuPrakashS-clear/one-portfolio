"use client";

import { useRef, useState, type DragEvent, type FormEvent } from "react";
import { usePortfolio } from "@/components/providers/portfolio-provider";
import { useUi } from "@/components/providers/ui-provider";
import { UPLOAD_KIND } from "@/constants";
import { acceptPending, addedText, handleFiles, type Pending } from "@/lib/upload";
import { hasAbroad, lastImport } from "@/lib/core/abroad";
import { indHoldings } from "@/lib/core/india";
import { daysBetween, fmtDate, iso, TODAY } from "@/lib/dates";
import { inr, tk } from "@/lib/format";
import { makeLock, pinMatches, pinProblem } from "@/lib/pin";
import { cloudErr } from "@/lib/supabase";
import { Card, CardHead, Chip, Hero } from "@/components/sub/ui";
import { Icon } from "@/components/sub/icon";
import { Modal } from "@/components/main/dialogs";
import { cn } from "@/lib/utils";
import { useNow } from "@/lib/hooks";

function Dropzone({ onFiles }: { onFiles: (f: File[]) => void }) {
  const inp = useRef<HTMLInputElement>(null),
    [over, setOver] = useState(false);
  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    onFiles([...e.dataTransfer.files]);
  };
  return (
    <label
      htmlFor="f-any"
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
      className={cn(
        "relative grid cursor-pointer grid-cols-[auto_1fr] items-center gap-x-5 gap-y-1.5 overflow-hidden rounded-[22px] bg-gradient-to-br from-act-a/10 to-act-b/12 p-7 transition focus-within:outline-2 focus-within:outline-offset-[3px] focus-within:outline-act-a max-sm:grid-cols-1 max-sm:p-[22px]",
        over
          ? "scale-[0.995] shadow-[inset_0_0_0_2px_var(--color-act-a),0_0_40px_-16px_var(--color-act-a)]"
          : "shadow-[inset_0_0_0_2px_rgb(167_139_250/0.35)] hover:shadow-[inset_0_0_0_2px_var(--color-act-a)]",
      )}
    >
      <span className="row-span-3 grid size-16 place-items-center rounded-2xl bg-white/6 text-stocks max-sm:row-span-1" aria-hidden>
        <Icon name="upload" className="size-8" />
      </span>
      <b className="font-display text-[20px] font-extrabold">Drop your statements and reports here</b>
      <span className="note text-body">
        CDSL / NSDL CAS, Groww, Zerodha, Wint Wealth, IndiaBonds, INDmoney. Several at once is fine. Spreadsheets and statements are read in
        your browser.
      </span>
      <span className="btn btn-primary mt-2 justify-self-start" aria-hidden>
        <Icon name="upload" />
        Choose files
      </span>
      <input
        ref={inp}
        id="f-any"
        type="file"
        multiple
        accept=".xls,.xlsx,.csv,.pdf,.png,.jpg,.jpeg,.webp"
        className="pointer-events-none absolute size-px opacity-0"
        onChange={(e) => {
          onFiles([...(e.target.files || [])]);
          e.target.value = "";
        }}
      />
    </label>
  );
}

function PendingCard({ p, onAccept, onReject }: { p: Pending; onAccept: () => void; onReject: () => void }) {
  const ex = p.ex;
  const rows: [string, string, string, string, string][] = [
    ...(ex.trades || []).map(
      (t) => [t.side, tk(t.symbol), t.date, String(t.units), String(t.price_usd)] as [string, string, string, string, string],
    ),
    ...(ex.prices || []).map(
      (t) => ["price", tk(t.symbol), t.as_of || "", "", String(t.price_usd)] as [string, string, string, string, string],
    ),
    ...(ex.in_bonds || [])
      .filter((b) => +b.invested_inr > 0)
      .map(
        (b) =>
          ["bond bought", b.name || b.isin || "", b.date || "", String(b.units ?? ""), `${inr(+b.invested_inr)} total`] as [
            string,
            string,
            string,
            string,
            string,
          ],
      ),
    ...(ex.in_lots || [])
      .filter((b) => +b.units > 0)
      .map(
        (b) =>
          ["purchase", b.fund || b.symbol || "", b.date || "", String(b.units), inr(+(b.amount_inr || 0))] as [
            string,
            string,
            string,
            string,
            string,
          ],
      ),
    ...(ex.in_dividends || [])
      .filter((b) => +b.total_inr > 0)
      .map((b) => ["dividend", b.symbol, b.ex_date, String(b.qty), inr(+b.total_inr)] as [string, string, string, string, string]),
    ...(ex.in_holdings || [])
      .filter((b) => +b.avg_inr > 0)
      .map(
        (b) =>
          ["buy price", b.name || b.isin || "", "", String(b.units ?? ""), `₹${(+b.avg_inr).toFixed(2)} avg`] as [
            string,
            string,
            string,
            string,
            string,
          ],
      ),
    ...(ex.fx_inr_per_usd
      ? [["₹ per $", "", ex.as_of || "", "", String(ex.fx_inr_per_usd)] as [string, string, string, string, string]]
      : []),
  ];
  return (
    <div className="grid gap-2.5 rounded-[14px] bg-[rgb(94_234_212/0.1)] p-4">
      <p>
        <b>{p.name}</b>{" "}
        <span className="text-muted">
          {ex.doc_type}
          {ex.notes ? " · " + ex.notes : ""}
        </span>
      </p>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>What</th>
              <th>Name</th>
              <th>Date</th>
              <th className="text-right">Units</th>
              <th className="text-right">Price</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j} className={j >= 3 ? "num text-right" : ""}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-3">
        <button type="button" className="btn btn-primary" onClick={onAccept}>
          Looks right, add it
        </button>
        <button type="button" className="btn" onClick={onReject}>
          Discard
        </button>
      </div>
    </div>
  );
}

function PinDialog({ kind, onClose }: { kind: "set" | "change" | "off" | null; onClose: () => void }) {
  const { S, setLock, freshLogin } = usePortfolio(),
    { showResult } = useUi(),
    now = useNow();
  const [old, setOld] = useState(""),
    [p1, setP1] = useState(""),
    [p2, setP2] = useState(""),
    [err, setErr] = useState("");
  const recent = !!freshLogin && now - freshLogin < 10 * 60 * 1000,
    needOld = kind !== "set" && !recent,
    needNew = kind !== "off";
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (needOld && !(await pinMatches(old, S?.lock))) return setErr("The current PIN isn't right.");
    if (needNew) {
      const bad = pinProblem(p1, p2);
      if (bad) return setErr(bad);
      setLock(await makeLock(p1, TODAY()));
    } else setLock(null);
    onClose();
    setOld("");
    setP1("");
    setP2("");
    setErr("");
    showResult({
      done: [
        {
          name: "App lock",
          what: kind === "off" ? "Turned off" : kind === "set" ? "PIN set · the app will ask for it when opened" : "PIN changed",
        },
      ],
      errors: [],
    });
  };
  const F = ({ id, label, v, set, ac }: { id: string; label: string; v: string; set: (s: string) => void; ac: string }) => (
    <label htmlFor={id} className="grid gap-1.5 text-left">
      <span className="text-[13.5px] text-muted">{label}</span>
      <input
        id={id}
        className="field-input text-center text-[22px] font-semibold tracking-[0.35em]"
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        minLength={4}
        maxLength={8}
        autoComplete={ac}
        required
        value={v}
        onChange={(e) => set(e.target.value)}
      />
    </label>
  );
  return (
    <Modal open={!!kind} onClose={onClose} label="App lock">
      <form onSubmit={submit} className="grid gap-3">
        <h2 className="font-display text-[22px] font-semibold">
          {kind === "set" ? "Set a PIN" : kind === "change" ? "Change your PIN" : "Turn off the app lock"}
        </h2>
        {needOld && F({ id: "pin-old", label: "Current PIN", v: old, set: setOld, ac: "current-password" })}
        {needNew && (
          <>
            {F({ id: "pin-new", label: "New PIN (4 to 8 digits)", v: p1, set: setP1, ac: "new-password" })}
            {F({ id: "pin-new2", label: "Type it again", v: p2, set: setP2, ac: "new-password" })}
          </>
        )}
        {err && <p className="text-left text-[14px] text-loss">{err}</p>}
        <p className="note">
          {needNew
            ? "Pick digits that aren't your card PIN or birthday. The PIN itself is never saved, only a scrambled check value."
            : "The app will open straight away when you're signed in."}
        </p>
        <div className="flex justify-center gap-3">
          <button className="btn btn-primary" type="submit">
            {kind === "off" ? "Turn off" : "Save PIN"}
          </button>
          <button className="btn" type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function UploadScreen() {
  const { S, mode, mutate, mutateAsync, setStatus, idleStatus, ai, lockNow, deleteData } = usePortfolio(),
    { askPassword, showResult, toast } = useUi();
  const [pending, setPending] = useState<Pending[]>([]),
    [pinKind, setPinKind] = useState<"set" | "change" | "off" | null>(null),
    [busy, setBusy] = useState(false);
  async function onFiles(files: File[]) {
    if (!files.length) return;
    if (mode !== "sb") {
      showResult({
        done: [],
        errors: [
          mode === "signedout" ? "Sign in first." : "Nothing was saved: the app can't reach Supabase right now. Try again in a minute.",
        ],
      });
      return;
    }
    setBusy(true);
    let r: Awaited<ReturnType<typeof handleFiles>> | undefined;
    try {
      r = await mutateAsync(
        (D) => handleFiles(D, files, { askPassword, ai, onStatus: (t) => setStatus({ kind: "busy", text: t }) }),
        (x) => x.changed,
      );
    } finally {
      setBusy(false);
    }
    if (!r) return;
    if (!r.changed) idleStatus();
    const res = r;
    if (res.log.length)
      mutate((D) => {
        D.log.push(...res.log.map((text) => ({ d: TODAY(), text })));
        D.log = D.log.slice(-60);
      });
    if (res.pending.length) setPending((p) => [...p, ...res.pending]);
    if (res.done.length || res.errors.length)
      showResult({
        done: res.done,
        errors: res.errors,
        note: res.pending.length
          ? "The AI helper also read some files. Check what it found below and tap “Looks right, add it”."
          : undefined,
      });
  }
  const I = S?.india,
    H = I ? indHoldings(I) : [];
  const d0 = new Date(TODAY() + "T00:00:00Z"),
    lastMonthEnd = iso(d0.getUTCFullYear(), d0.getUTCMonth(), 0),
    cas = lastImport(S, "cas");
  const need = (acct: string, types: string[]) => H.filter((h) => h.acct === acct && types.includes(h.type) && h.cost == null).length;
  const guide = [
    {
      app: "CDSL / NSDL",
      what: "Consolidated Account Statement (the PDF emailed each month)",
      gives: cas
        ? `holdings as of ${fmtDate(String(cas.period))}; a new month is ${String(cas.period) >= lastMonthEnd ? "not due yet" : "due"}`
        : "every share, fund and bond under your PAN",
      left: !cas || String(cas.period) < lastMonthEnd ? 1 : 0,
      tone: cas ? "wait" : "act",
    },
    {
      app: "Groww",
      what: "Reports → Stocks → Holdings report (Excel)",
      gives: "buy price of each share and ETF",
      left: need("Groww", ["stock", "etf", "invit"]),
      tone: "act",
    },
    {
      app: "Groww",
      what: "Reports → Mutual funds → Holdings report (Excel)",
      gives: "amount invested in each fund",
      left: need("Groww", ["mf"]),
      tone: "act",
    },
    {
      app: "Groww",
      what: "Reports → Transactions → Mutual Funds - Order history",
      gives: "the date of each SIP instalment, for growth charts and tax dates",
      left: I?.src?.grMFO ? 0 : H.filter((h) => h.type === "mf" && h.acct === "Groww").length,
      tone: "act",
    },
    {
      app: "Groww",
      what: "Reports → Transactions → Stocks - Order history",
      gives: "purchase date of each share",
      left: I?.src?.grStO ? 0 : H.filter((h) => h.acct === "Groww" && h.type !== "mf" && h.type !== "bond").length,
      tone: "act",
    },
    {
      app: "Zerodha",
      what: "Console → Portfolio → Holdings → Download (Excel)",
      gives: "buy price of each Zerodha holding",
      left: need("Zerodha", ["stock", "etf", "mf"]),
      tone: "act",
    },
    {
      app: "Wint Wealth",
      what: "Master Report (Excel)",
      gives: "price paid, yield and payouts for each bond",
      left: need("Wint Wealth (NSDL)", ["bond"]),
      tone: "act",
    },
    ...(hasAbroad(S)
      ? [
          {
            app: "INDmoney",
            what: "US Stocks → Taxation Documents → Transactions Report",
            gives: "every buy and sell abroad with its date",
            left: !lastImport(S, "transactions") || daysBetween(String(lastImport(S, "transactions")?.period), TODAY()) > 95 ? 1 : 0,
            tone: "act",
          },
        ]
      : []),
  ].filter((g) => g.left > 0);
  const history = (S?.imports || []).slice().sort((a, b) => String(b.at || b.period || "").localeCompare(String(a.at || a.period || "")));
  const log = (S?.log || []).slice(-10).reverse();
  return (
    <>
      <Hero badge="Upload" title="Add your statements" big={false} compact>
        <p className="max-w-[60ch] text-[16.5px] text-body">
          Every number in One Portfolio comes from these files. Password-protected PDFs ask for their password, which is used only to open
          the file here.
        </p>
      </Hero>
      <Card>
        <Dropzone onFiles={(f) => void onFiles(f)} />
        {busy && (
          <p className="note" role="status">
            Reading your files…
          </p>
        )}
        {pending.map((p, i) => (
          <PendingCard
            key={p.name + i}
            p={p}
            onReject={() => setPending((x) => x.filter((_, k) => k !== i))}
            onAccept={() => {
              let ch: string[] = [];
              mutate((D) => {
                ch = acceptPending(D, p);
                D.log.push(...[`${p.name}: ${ch.length} items added`, ...ch].map((text) => ({ d: TODAY(), text })));
              });
              setPending((x) => x.filter((_, k) => k !== i));
              showResult({ done: [{ name: p.name, what: ch.slice(0, 4).join(" · ") || "no changes" }], errors: [] });
            }}
          />
        ))}
      </Card>
      {guide.length > 0 && (
        <Card>
          <CardHead
            title="What to upload next"
            note="These fill in buy prices, purchase dates and payouts the statement doesn't carry. Menu names can differ slightly between app versions."
          />
          <ol className="grid gap-3">
            {guide.map((g, i) => (
              <li key={i} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5">
                <span className="row-span-2 grid size-7 place-items-center rounded-full bg-gradient-to-br from-act-a to-act-b font-display text-[14px] font-extrabold text-on-act">
                  {i + 1}
                </span>
                <span>
                  <b>{g.app}</b> <span className="text-body">{g.what}</span>
                </span>
                <span className="note">
                  Adds the {g.gives}
                  {g.left > 1 ? ` · ${g.left} holdings` : ""}
                </span>
              </li>
            ))}
          </ol>
        </Card>
      )}
      <Card>
        <CardHead title="Uploaded reports" right={<Chip>{history.length} uploaded</Chip>} />
        {history.length ? (
          <div className="-mx-2 overflow-x-auto px-2 max-sm:mx-0 max-sm:px-0">
            <table className="stack">
              <thead>
                <tr>
                  <th>Report</th>
                  <th>Covers</th>
                  <th>Uploaded on</th>
                  <th>Added</th>
                </tr>
              </thead>
              <tbody>
                {history.map((x, i) => (
                  <tr key={i}>
                    <td className="stack-full">
                      <b>{UPLOAD_KIND[x.kind] || x.kind}</b>
                      <span className="block max-w-[34ch] truncate text-[12.5px] text-muted max-sm:max-w-none">{x.file || ""}</span>
                    </td>
                    <td data-label="Covers" className="num whitespace-nowrap">
                      {x.period ? fmtDate(String(x.period)) : "—"}
                    </td>
                    <td data-label="Uploaded on" className="num whitespace-nowrap">
                      {x.at
                        ? new Date(x.at).toLocaleString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })
                        : "—"}
                    </td>
                    <td data-label="Added" className="stack-full">
                      {addedText(x)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-muted">Nothing uploaded yet.</p>
        )}
      </Card>
      <Card>
        <CardHead
          title={<>App lock {S?.lock ? <Chip tone="good">On</Chip> : <Chip>Off</Chip>}</>}
          note={
            <>
              Your data is private to your login: the database only lets your signed-in account read or change it.{" "}
              {S?.lock
                ? `A PIN is also asked whenever you open the app, and after 10 minutes without activity. PIN set on ${fmtDate(S.lock.set)}.`
                : "Add a PIN so the app also asks for it when opened, and locks itself after 10 minutes without activity."}
            </>
          }
          right={
            <div className="flex flex-wrap gap-2">
              {S?.lock ? (
                <>
                  <button type="button" className="btn" onClick={lockNow}>
                    Lock now
                  </button>
                  <button type="button" className="btn" onClick={() => setPinKind("change")}>
                    Change PIN
                  </button>
                  <button type="button" className="btn" onClick={() => setPinKind("off")}>
                    Turn off
                  </button>
                </>
              ) : (
                <button type="button" className="btn btn-primary" disabled={!S} onClick={() => setPinKind("set")}>
                  Set a PIN
                </button>
              )}
            </div>
          }
        />
        <details className="border-t border-white/7 pt-3.5">
          <summary className="cursor-pointer font-semibold text-loss">Delete all my data</summary>
          <p className="note my-2">
            Removes your portfolio and its saved versions from the database for good. Your login stays, so you can start again by uploading
            reports.
          </p>
          <button
            type="button"
            className="btn btn-danger"
            disabled={!S}
            onClick={async () => {
              if (!confirm("Delete your whole portfolio and every saved version? This can't be undone.")) return;
              if (prompt("Type DELETE to confirm") !== "DELETE") return;
              try {
                await deleteData();
                toast("Your data was deleted");
              } catch (e) {
                showResult({ done: [], errors: ["Couldn't delete: " + cloudErr(e)] });
              }
            }}
          >
            Delete my data permanently
          </button>
        </details>
      </Card>
      {log.length > 0 && (
        <details className="card">
          <summary className="cursor-pointer font-semibold">Activity log</summary>
          <pre className="mt-3 max-h-60 overflow-auto rounded-[14px] bg-white/5 p-3.5 font-mono text-[13px] leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap">
            {log.map((l) => `${l.d}  ${l.text}`).join("\n")}
          </pre>
        </details>
      )}
      <PinDialog kind={pinKind} onClose={() => setPinKind(null)} />
    </>
  );
}
