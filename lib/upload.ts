/* Reading uploads in the browser. Spreadsheets (SheetJS) and PDFs (pdf.js) load on first use from cdnjs, pinned to the versions
   the parsers were written against. A PDF password is used only to open the file here and is never saved or sent. */
import type { Portfolio, Sheet } from "@/types/portfolio";
import { fmtDate, parseLooseDate, TODAY } from "@/lib/dates";
import {
  applyExtracted,
  applyHoldingsReport,
  applyStatement,
  applyTransactions,
  noteImport,
  parseStatementLines,
  rowsFromHoldingsSheet,
  rowsFromTransactionsSheet,
  type Extracted,
  type HoldingsReport,
  type Statement,
  type Trade,
} from "@/lib/core/abroad";
import { parseCAS, type CasResult, type PdfItem } from "@/lib/core/cas";
import { applyCAS } from "@/lib/core/india";
import {
  applyInBonds,
  applyInDivs,
  applyInHoldings,
  applyIndiaSheet,
  applyInLots,
  KIND_IN,
  rowsFromIndiaSheet,
  rowsFromWintBook,
  type IndiaSheet,
} from "@/lib/core/india-sheets";
import { UPLOAD_KIND } from "@/constants";
import type { AiHelper } from "@/lib/supabase";

const XLSX_URL = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
const PDF_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDF_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

interface XLSXLib {
  read: (d: ArrayBuffer, o: { type: "array" }) => { SheetNames: string[]; Sheets: Record<string, unknown> };
  utils: { sheet_to_json: (s: unknown, o: { header: 1; raw: true }) => Sheet };
}
interface PdfTextItem {
  str: string;
  transform: number[];
}
interface PdfPage {
  getTextContent: () => Promise<{ items: PdfTextItem[] }>;
  getViewport: (o: { scale: number }) => { width: number; height: number };
  render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> };
}
interface PdfDoc {
  numPages: number;
  getPage: (n: number) => Promise<PdfPage>;
}
interface PdfTask {
  promise: Promise<PdfDoc>;
  onPassword?: (update: (pw: string) => void, reason: number) => void;
  destroy: () => void;
}
interface PdfLib {
  getDocument: (o: { data: Uint8Array }) => PdfTask;
}
declare global {
  interface Window {
    XLSX?: XLSXLib;
    pdfjsLib?: PdfLib;
  }
}

const loaded: Record<string, Promise<void>> = {};
function loadScript(src: string): Promise<void> {
  if (src in loaded) return loaded[src];
  return (loaded[src] = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src;
    s.crossOrigin = "anonymous";
    s.onload = () => res();
    s.onerror = () => {
      delete loaded[src];
      rej(new Error("A helper library couldn't load. Check your connection and try again."));
    };
    document.head.appendChild(s);
  }));
}

export type AskPassword = (fileName: string, wrong: boolean) => Promise<string | null>;
interface PdfText {
  lines: string[];
  pages: PdfItem[][];
  doc: PdfDoc;
}
async function pdfText(buf: ArrayBuffer, name: string, askPassword: AskPassword): Promise<PdfText> {
  // the worker script runs on the page (pdf.js picks up window.pdfjsWorker), which avoids a cross-origin worker
  await loadScript(PDF_URL);
  await loadScript(PDF_WORKER);
  const lib = window.pdfjsLib!;
  const task = lib.getDocument({ data: new Uint8Array(buf) });
  // password-protected statements (CDSL/NSDL CAS, CAMS): ask for the password; it opens the file here and is never saved
  task.onPassword = (update, reason) => {
    askPassword(name, reason === 2).then((pw) => (pw == null ? task.destroy() : update(pw)));
  };
  const doc = await task.promise,
    lines: string[] = [],
    pages: PdfItem[][] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent(),
      rows: { y: number; items: { x: number; s: string }[] }[] = [];
    pages.push(tc.items.filter((it) => it.str && it.str.trim()).map((it) => ({ x: it.transform[4], y: it.transform[5], s: it.str })));
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const y = it.transform[5],
        x = it.transform[4];
      let r = rows.find((r) => Math.abs(r.y - y) < 2.5);
      if (!r) rows.push((r = { y, items: [] }));
      r.items.push({ x, s: it.str });
    }
    rows.sort((a, b) => b.y - a.y);
    for (const r of rows)
      lines.push(
        r.items
          .sort((a, b) => a.x - b.x)
          .map((i) => i.s)
          .join(" "),
      );
  }
  return { lines, pages, doc };
}
async function pageImages(doc: PdfDoc, name: string): Promise<File[]> {
  const imgs: File[] = [];
  for (let i = 1; i <= Math.min(3, doc.numPages); i++) {
    const pg = await doc.getPage(i),
      vp = pg.getViewport({ scale: 2 }),
      cv = document.createElement("canvas");
    cv.width = vp.width;
    cv.height = vp.height;
    await pg.render({ canvasContext: cv.getContext("2d")!, viewport: vp }).promise;
    const blob = await new Promise<Blob | null>((r) => cv.toBlob(r, "image/png"));
    if (blob) imgs.push(new File([blob], `${name}-p${i}.png`, { type: "image/png" }));
  }
  return imgs;
}

type Parsed =
  | { name: string; kind: "india-sheet"; data: IndiaSheet; sortKey: string }
  | { name: string; kind: "report"; data: HoldingsReport; sortKey: string }
  | { name: string; kind: "transactions"; data: Trade[]; sortKey: string }
  | { name: string; kind: "cas"; data: CasResult; sortKey: string }
  | { name: string; kind: "statement"; data: Statement; sortKey: string };
export interface Pending {
  name: string;
  ex: Extracted;
}
export interface UploadResult {
  done: { name: string; what: string }[];
  errors: string[];
  pending: Pending[];
  log: string[];
  changed: boolean;
}

const AI_PROMPT = (
  isImage: boolean,
  text: string | null,
) => `Extract investment data from this ${isImage ? "screenshot" : "document"} (INDmoney / Alpaca / bank / an Indian broker). Reply with only JSON in this shape:
{"doc_type":"transactions report|order confirmation|portfolio screen|remittance|form 1042-S|tax report|other","as_of":"YYYY-MM-DD or null","trades":[{"date":"YYYY-MM-DD","side":"buy|sell","symbol":"VOO","units":0.123,"price_usd":100.5}],"prices":[{"symbol":"VOO","price_usd":100.5,"as_of":"YYYY-MM-DD"}],"fx_inr_per_usd":null,"in_bonds":[{"isin":"INE... or null","name":"issuer as shown","units":1,"invested_inr":10000,"date":"YYYY-MM-DD or null","ytm":11.2,"maturity":"YYYY-MM-DD or null"}],"in_lots":[{"fund":"SBI LONG TERM EQUITY FUND - DIRECT PLAN","folio":"12345678","symbol":null,"isin":null,"platform":"Groww|Zerodha|null","date":"YYYY-MM-DD","units":1.021,"amount_inr":499.95,"tag":"IPO|bonus|null"}],"in_dividends":[{"symbol":"ACMESOLAR","ex_date":"YYYY-MM-DD","qty":51,"per_share_inr":0.2,"total_inr":10.2}],"in_holdings":[{"name":"NHPC","isin":"INE... or null","units":1,"avg_inr":80.08,"platform":"INDstocks|Groww|Zerodha|other"}],"notes":"one short sentence"}
in_lots is for individual Indian purchases: mutual fund purchases (e.g. a Zerodha ELSS statement) or share purchases from a broker's per-stock breakdown (date, qty, price, an "IPO" tag; put the stock's symbol or, if no symbol is shown, its name in "symbol", the ISIN if shown, and the app in "platform", and amount_inr = qty × price). One entry per purchase. in_dividends is for Indian dividends received. in_holdings is for Indian shares, ETFs or funds shown in rupees on a holdings screen, with the average buy price per unit. in_bonds is only for Indian bonds / NCDs in rupees: the total amount invested in that bond, not a per-unit price, unless only a per-unit price is shown (then invested_inr = units × that price). For a Form 1042-S also add "f1042":{"year":2026,"gross_income_usd":0,"tax_withheld_usd":0}. Rules: include only values you can see; never guess or compute missing ones; leave arrays empty if none. Executed trades only (not pending or cancelled). London-listed funds get the prefix "LSE~" (e.g. "LSE~CSPX"). fx_inr_per_usd only if the document shows the rupee-dollar rate actually applied.${text ? "\n\nDocument text:\n" + text.slice(0, 60000) : ""}`;

const countEx = (ex: Extracted) =>
  (ex.trades || []).length +
  (ex.prices || []).length +
  (ex.in_bonds || []).filter((b) => +b.invested_inr > 0).length +
  (ex.in_holdings || []).filter((b) => +b.avg_inr > 0).length +
  (ex.in_lots || []).filter((b) => +b.units > 0).length +
  (ex.in_dividends || []).filter((b) => +b.total_inr > 0).length +
  (ex.fx_inr_per_usd ? 1 : 0) +
  (ex.f1042 ? 1 : 0);

export function describe(rec: Portfolio["imports"][number]) {
  const one = rec.count === 1;
  const unit = /orders$/.test(rec.kind)
    ? one
      ? "order"
      : "orders"
    : rec.kind === "ib-cf"
      ? one
        ? "payout"
        : "payouts"
      : rec.kind === "wint" || rec.kind === "ib-bonds"
        ? one
          ? "bond"
          : "bonds"
        : ["report", "cas", "gr-stocks", "gr-mf", "zd-hold"].includes(rec.kind)
          ? one
            ? "holding"
            : "holdings"
          : one
            ? "trade"
            : "trades";
  return `${UPLOAD_KIND[rec.kind] || rec.kind}${rec.period ? " · up to " + fmtDate(rec.period) : ""}${rec.count ? ` · ${rec.count} ${unit}` : ""}`;
}
/** what an upload added, in a few words */
export function addedText(x: Portfolio["imports"][number]) {
  if (x.kind === "cas") return `${x.count} holdings · ₹${Math.round(x.total || 0).toLocaleString("en-IN")}`;
  if (/orders$/.test(x.kind)) return `${x.count} orders`;
  if (/^(gr|zd)-/.test(x.kind) && x.kind !== "zd-div") return `${x.count} holdings`;
  if (x.kind === "ib-cf") return `${x.count} payouts`;
  if (x.kind === "divs" || x.kind === "zd-div") return `${x.count} dividends`;
  if (x.kind === "mf-lots") return `${x.count} purchases`;
  if (x.kind === "hold-shot") return `${x.count} buy price${x.count === 1 ? "" : "s"}`;
  if (["wint", "bond-shot", "ib-bonds"].includes(x.kind)) return `${x.count} bond${x.count === 1 ? "" : "s"}`;
  if (x.kind === "statement" && x.total) return `Total $${x.total.toFixed(2)}`;
  if (x.kind === "1042s") return `Withheld $${x.withheld}`;
  return x.count ? `${x.count} ${x.kind === "report" ? (x.count === 1 ? "holding" : "holdings") : x.count === 1 ? "trade" : "trades"}` : "";
}

/** read a batch of files and apply them to the portfolio, oldest statement first so lots and prices settle in order */
export async function handleFiles(
  S: Portfolio,
  files: File[],
  opts: { askPassword: AskPassword; ai: AiHelper | null; onStatus?: (t: string) => void },
): Promise<UploadResult> {
  const res: UploadResult = { done: [], errors: [], pending: [], log: [], changed: false };
  const typed: { f: File; kind: "xls" | "pdf" | "img" }[] = [];
  for (const f of files) {
    const n = f.name.toLowerCase();
    if (/\.(xls|xlsx|csv)$/.test(n)) typed.push({ f, kind: "xls" });
    else if (n.endsWith(".pdf")) typed.push({ f, kind: "pdf" });
    else if (/\.(png|jpe?g|webp)$/.test(n) || (f.type || "").startsWith("image/")) typed.push({ f, kind: "img" });
    else res.errors.push(`${f.name}: file type not supported (use .xls, .pdf, .png or .jpg)`);
  }
  const smart = async (name: string, text: string | null, images: Blob[] | null) => {
    if (!opts.ai) {
      res.errors.push(`${name}: this kind of document needs the optional AI helper`);
      return;
    }
    opts.onStatus?.(`The AI helper is reading ${name}…`);
    try {
      const ex = await opts.ai.json<Extracted>(AI_PROMPT(!!images, text), images || []);
      if (!countEx(ex)) {
        res.log.push(`${name}: ${ex.doc_type || "document"} read, but it has nothing to add.${ex.notes ? " " + ex.notes : ""}`);
        return;
      }
      res.pending.push({ name, ex });
    } catch (e) {
      res.errors.push(
        `${name}: the AI helper couldn't read it (${(e as { code?: string }).code || "error"}). Try a clearer screenshot or the PDF.`,
      );
    }
  };
  const parsed: Parsed[] = [];
  for (const t of typed) {
    opts.onStatus?.(`Reading ${t.f.name}…`);
    try {
      if (t.kind === "xls") {
        await loadScript(XLSX_URL);
        const X = window.XLSX!,
          wb = X.read(await t.f.arrayBuffer(), { type: "array" });
        const sheet = (sn: string) => X.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true });
        const names = wb.SheetNames.slice().sort((a, b) => (/combined/i.test(b) ? 1 : 0) - (/combined/i.test(a) ? 1 : 0));
        let ind = rowsFromWintBook(Object.fromEntries(wb.SheetNames.map((sn) => [sn, sheet(sn)])));
        if (!ind)
          for (const sn of names) {
            ind = rowsFromIndiaSheet(sheet(sn));
            if (ind) break;
          }
        if (ind) {
          parsed.push({ name: t.f.name, kind: "india-sheet", data: ind, sortKey: "4" + ind.kind });
          continue;
        }
        const aoa = sheet(wb.SheetNames[0]),
          rep = rowsFromHoldingsSheet(aoa);
        if (rep) parsed.push({ name: t.f.name, kind: "report", data: rep, sortKey: "1" });
        else {
          const txs = rowsFromTransactionsSheet(aoa);
          if (txs) parsed.push({ name: t.f.name, kind: "transactions", data: txs, sortKey: "2" });
          else await smart(t.f.name, aoa.map((r) => (r || []).join(" | ")).join("\n"), null);
        }
      } else if (t.kind === "pdf") {
        const pdf = await pdfText(await t.f.arrayBuffer(), t.f.name, opts.askPassword),
          cas = parseCAS(pdf.pages);
        if (cas) {
          parsed.push({ name: t.f.name, kind: "cas", data: cas, sortKey: "3" + (cas.asOf || "") });
          continue;
        }
        const st = parseStatementLines(pdf.lines);
        if (st.holdings.length || st.tx.length)
          parsed.push({ name: t.f.name, kind: "statement", data: st, sortKey: "0" + (st.periodEnd || "") });
        else if (pdf.lines.join("").replace(/\s/g, "").length < 40)
          await smart(t.f.name, null, await pageImages(pdf.doc, t.f.name)); // printed-to-PDF with no text layer
        else await smart(t.f.name, pdf.lines.join("\n"), null);
      } else await smart(t.f.name, null, [t.f]);
    } catch (err) {
      res.errors.push(`${t.f.name}: couldn't read it${err instanceof Error && err.message ? ` (${err.message})` : ""}`);
    }
  }
  parsed.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  const today = TODAY();
  for (const p of parsed) {
    const nImp = S.imports.length;
    let ch: string[];
    if (p.kind === "india-sheet") {
      if (!S.india) {
        res.errors.push(`${p.name}: upload your CDSL or NSDL consolidated statement (CAS) first; broker reports add to it`);
        continue;
      }
      ch = applyIndiaSheet(S, p.data, p.name);
      res.log.push(`${p.name}: ${KIND_IN[p.data.kind] || "Indian report"}`, ...ch);
      if (S.imports.length === nImp && ch.length) {
        res.errors.push(`${p.name}: ${ch[0]}`);
        continue;
      }
    } else if (p.kind === "statement") {
      ch = applyStatement(S, p.data);
      res.log.push(`${p.name}: statement for ${p.data.periodEnd}, ${ch.length} updates`, ...ch);
    } else if (p.kind === "cas") {
      ch = applyCAS(S, p.data);
      res.log.push(`${p.name}: consolidated account statement`, ...ch);
    } else if (p.kind === "transactions") {
      ch = applyTransactions(S, p.data);
      res.log.push(`${p.name}: transaction history, ${p.data.length} trades`, ...ch);
    } else {
      ch = applyHoldingsReport(S, p.data, today);
      res.log.push(`${p.name}: holdings report${p.data.asOf ? " of " + p.data.asOf : ""}, ${ch.length} changes`, ...ch);
    }
    const rec = S.imports[S.imports.length - 1];
    if (!rec) continue;
    if (!rec.file) rec.file = p.name;
    res.done.push({ name: p.name, what: describe(rec) });
    res.changed = true;
  }
  return res;
}

/** add what the AI helper found, once the person confirms it */
export function acceptPending(S: Portfolio, p: Pending): string[] {
  const ex = p.ex,
    today = TODAY();
  let ch: string[];
  const indian =
    (ex.in_bonds || []).some((b) => +b.invested_inr > 0) ||
    (ex.in_holdings || []).some((b) => +b.avg_inr > 0) ||
    (ex.in_lots || []).length ||
    (ex.in_dividends || []).length;
  if (indian && !(ex.trades || []).length) {
    ch = [
      ...applyInBonds(S, ex.in_bonds || []),
      ...applyInHoldings(S, ex.in_holdings || []),
      ...applyInLots(S, ex.in_lots || []),
      ...applyInDivs(
        S,
        (ex.in_dividends || []).map((d) => ({
          sym: d.symbol,
          d: parseLooseDate(d.ex_date) || today,
          q: +d.qty,
          dps: +d.per_share_inr,
          amt: +d.total_inr,
        })),
      ),
    ];
  } else if (/transaction/i.test(ex.doc_type || "") && (ex.trades || []).length) {
    const txs: Trade[] = (ex.trades || [])
      .map((t) => ({
        d: parseLooseDate(t.date) || "",
        side: String(t.side || "").toLowerCase() as Trade["side"],
        sym: String(t.symbol || "")
          .trim()
          .toUpperCase()
          .replace(/^LSE[~:\s]+/, "LSE~"),
        q: +t.units,
        price: +t.price_usd,
      }))
      .filter((t) => t.d && t.sym && t.q > 0 && t.price > 0 && (t.side === "buy" || t.side === "sell"));
    ch = applyTransactions(S, txs);
  } else {
    ch = applyExtracted(S, ex, today);
    if (ch.length)
      noteImport(S, {
        kind: "screenshot",
        period: parseLooseDate(ex.as_of) || today,
        count: (ex.trades || []).length,
        doc: ex.doc_type || "",
      });
  }
  const rec = S.imports[S.imports.length - 1];
  if (rec && !rec.file) rec.file = p.name;
  if (ex.f1042) {
    noteImport(S, {
      kind: "1042s",
      period: String(ex.f1042.year || ""),
      income: ex.f1042.gross_income_usd,
      withheld: ex.f1042.tax_withheld_usd,
    });
    ch.push(`Form 1042-S ${ex.f1042.year}: income $${ex.f1042.gross_income_usd}, US tax withheld $${ex.f1042.tax_withheld_usd}`);
  }
  return ch;
}
