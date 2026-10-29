/* CDSL / NSDL Consolidated Account Statement (India): holdings found by their position on each PDF page. */
import type { CasHolding, IndClass, IndType, ISODate, YearMonth } from "@/types/portfolio";
import { iso, MON } from "@/lib/dates";

export const ISIN_RE = /^IN[EF][A-Z0-9]{9}$/;
export const casNum = (s: unknown): number | null => {
  const t = String(s).replace(/,/g, "").trim();
  return /^-?(\d+(\.\d+)?|\.\d+)$/.test(t) ? +t : null;
};

/** a positioned text item on a PDF page */
export interface PdfItem {
  x: number;
  y: number;
  s: string;
}
export interface CasResult {
  holdings: (CasHolding & { raw: string })[];
  accounts: { name: string; value: number; n: number }[];
  history: { m: YearMonth; v: number }[];
  mix: Record<string, number>;
  asOf: ISODate | null;
  total: number | null;
}
type Mode = "none" | "summary" | "bonds" | "demat" | "skip" | "mf";
interface Anchor {
  it: PdfItem;
  mode: Mode;
  acct: string | null;
  depo: string;
}
interface Row {
  a: Anchor;
  units: number;
  price: number;
  value: number;
  cost?: number;
  gain?: number;
  folio?: string;
  pi?: number;
  nameParts?: PdfItem[];
}

export function parseCAS(pages: PdfItem[][]): CasResult | null {
  const ascii = (s: string) => !/[^\x00-\x7F₹]/.test(s);
  const all = pages.map((items) => items.filter((i) => i.s && i.s.trim() && ascii(i.s)).map((i) => ({ x: i.x, y: i.y, s: i.s.trim() })));
  const text = all
    .map((p) =>
      p
        .slice()
        .sort((a, b) => b.y - a.y || a.x - b.x)
        .map((i) => i.s)
        .join(" "),
    )
    .join(" \n ");
  if (!/CONSOLIDATED ACCOUNT STATEMENT/i.test(text) || !/(CDSL|NSDL)/.test(text)) return null;
  const out: CasResult = { holdings: [], accounts: [], history: [], mix: {}, asOf: null, total: null };
  let m = text.match(/period from \d{2}-([A-Za-z]{3})-(\d{4}) to (\d{2})-([A-Za-z]{3})-(\d{4})/);
  if (m) out.asOf = iso(+m[5], MON[m[4].toLowerCase()], +m[3]);
  m = text.match(/Total Portfolio Value\s+([\d,]+\.\d{2})/);
  if (m) out.total = casNum(m[1]);
  for (const h of text.matchAll(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4})\s+([\d,]+\.\d{2})/g)) {
    const k = `${h[2]}-${String(MON[h[1].toLowerCase()] + 1).padStart(2, "0")}`;
    const v = casNum(h[3]);
    if (v != null && !out.history.some((x) => x.m === k)) out.history.push({ m: k, v });
  }
  let mode: Mode = "none",
    acct: string | null = null,
    depo = "CDSL";
  const rows: Row[] = [];
  all.forEach((items, pi) => {
    const sorted = items.slice().sort((a, b) => b.y - a.y || a.x - b.x);
    // events in reading order: section headers and ISIN anchors
    const anchors: Anchor[] = [];
    for (const it of sorted) {
      const s = it.s;
      if (/DEMAT ACCOUNTS HELD WITH NSDL/.test(s)) depo = "NSDL";
      else if (/DEMAT ACCOUNTS HELD WITH CDSL/.test(s)) depo = "CDSL";
      if (/^DP Name\s*:?$/.test(s) || /^DP Name :/.test(s)) {
        const nm = sorted.find((o) => Math.abs(o.y - it.y) < 2 && o.x > it.x + 5 && !/:/.test(o.s));
        if (nm && mode !== "summary") acct = nm.s.replace(/\s+/g, " ");
      }
      if (/HOLDING STATEMENT OF BONDS/.test(s)) mode = "bonds";
      else if (/HOLDING STATEMENT AS ON/.test(s))
        mode = /Other Details/.test(s) || sorted.some((o) => Math.abs(o.y - it.y) < 2 && /Other Details/.test(o.s)) ? "skip" : "demat";
      else if (/STATEMENT OF TRANSACTIONS/.test(s) || /TER & COMMISSION/.test(s) || /MUTUAL FUND UNITS HELD WITH MF\/RTA/.test(s))
        mode = "skip";
      else if (/MUTUAL FUND UNITS HELD AS ON/.test(s)) {
        mode = "mf";
        acct = "Mutual fund folios";
      }
      if (ISIN_RE.test(s) && (mode === "demat" || mode === "bonds" || mode === "mf")) anchors.push({ it, mode, acct, depo });
    }
    for (const a of anchors) {
      const same = items.filter((o) => Math.abs(o.y - a.it.y) < 2.5 && o.x > a.it.x + 30).sort((p, q) => p.x - q.x);
      const nums = same.map((o) => casNum(o.s)).filter((v): v is number => v !== null);
      if (a.mode === "mf") {
        const folioIt = same.find((o) => o.x < a.it.x + 80 && /\d/.test(o.s) && /[/\d]/.test(o.s));
        const numItems = same.filter((o) => o.x > a.it.x + 120 && casNum(o.s) !== null).map((o) => casNum(o.s) as number);
        if (numItems.length < 4) continue;
        const [bal, nav, cost, value] = numItems,
          profit = numItems.length >= 9 ? numItems[7] : value - cost;
        rows.push({ a, units: bal, price: nav, value, cost, gain: profit, folio: folioIt ? folioIt.s.replace(/­/g, "") : "" });
      } else {
        if (nums.length < 2) continue;
        const value = nums[nums.length - 1],
          price = nums[nums.length - 2],
          units = a.mode === "bonds" ? nums[nums.length - 4] : nums[0];
        rows.push({ a, units, price, value });
      }
    }
    // names: text in the name column, given to the nearest anchor of this page
    const pageRows = rows.filter((r) => r.pi === undefined && (r.pi = pi) === pi && items.includes(r.a.it));
    for (const r of pageRows) r.nameParts = [];
    const nameItems = items.filter(
      (o) =>
        !ISIN_RE.test(o.s) &&
        casNum(o.s) === null &&
        o.s !== "--" &&
        o.s !== "-" &&
        !/^(Grand )?Total$|Portfolio Value|^ISIN$|^Security$|HOLDING STATEMENT|Other Details|STATEMENT OF/i.test(o.s),
    );
    for (const o of nameItems) {
      let best: Row | null = null,
        bd = 1e9;
      for (const r of pageRows) {
        const ax = r.a.it.x,
          inCol = r.a.mode === "mf" ? o.x < ax - 2 : o.x > ax + 40 && o.x < ax + (r.a.mode === "bonds" ? 140 : 220);
        if (!inCol) continue;
        const d = Math.abs(o.y - r.a.it.y);
        if (d < bd && d < 36) {
          bd = d;
          best = r;
        }
      }
      if (best && !/^(ARN-|DIRECT|Regular|Direct)$/i.test(o.s)) best.nameParts!.push(o);
    }
  });
  for (const r of rows) {
    const raw = (r.nameParts || [])
      .sort((p, q) => q.y - p.y || p.x - q.x)
      .map((o) => o.s)
      .join(" ")
      .replace(/­\s?/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const isin = r.a.it.s;
    const bondish =
      r.a.mode === "bonds" ||
      (!!r.a.acct && /FOURDEGREEWATER|WINT|GRIP/i.test(r.a.acct)) ||
      / NCD|SEC NGRT|SR [IVX]+ /i.test(raw) ||
      /^INE\w{4}07/.test(isin);
    const type: IndType =
      r.a.mode === "mf"
        ? "mf"
        : bondish
          ? "bond"
          : /InvIT|REIT/i.test(raw)
            ? "invit"
            : isin.startsWith("INF")
              ? /ETF|EXCHANGE TRADED|BEES/i.test(raw) && !/FOF|FUND OF FUND/i.test(raw)
                ? "etf"
                : "mf"
              : "stock";
    if (!(r.value > 0)) continue;
    out.holdings.push({
      isin,
      name: casName(raw, type),
      raw,
      type,
      cls: casClass(raw, type),
      units: r.units,
      price: r.price,
      value: r.value,
      ...(r.cost != null ? { cost: r.cost, gain: r.gain } : {}),
      acct: casAcct(r.a.acct),
      depo: r.a.mode === "mf" ? "MF" : r.a.depo,
      ...(r.folio ? { folio: r.folio } : {}),
    });
  }
  for (const h of out.holdings) {
    let a = out.accounts.find((x) => x.name === h.acct);
    if (!a) out.accounts.push((a = { name: h.acct, value: 0, n: 0 }));
    a.value += h.value;
    a.n++;
  }
  for (const h of out.holdings) out.mix[h.cls] = (out.mix[h.cls] || 0) + h.value;
  out.history.sort((a, b) => a.m.localeCompare(b.m));
  return out.holdings.length ? out : null;
}
export function casAcct(a: string | null): string {
  if (!a) return "Other";
  const s = a.toUpperCase();
  return /GROWW/.test(s)
    ? "Groww"
    : /ZERODHA/.test(s)
      ? "Zerodha"
      : /INDSTOCKS/.test(s)
        ? "INDstocks"
        : /FOURDEGREEWATER/.test(s)
          ? "Wint Wealth (NSDL)"
          : /UPSTOX|RKSV/.test(s)
            ? "Upstox"
            : /ANGEL/.test(s)
              ? "Angel One"
              : /Mutual fund folios/i.test(a)
                ? "MF folios (CAMS/KFin)"
                : a.replace(/ (PRIVATE )?LIMITED$/i, "").replace(/\b\w+/g, (w) => w[0] + w.slice(1).toLowerCase());
}
export function casClass(raw: string, type: IndType): IndClass {
  const s = raw.toUpperCase();
  if (type === "bond" || /LIQUID|ARBITRAGE|GILT|OVERNIGHT|MONEY MARKET|CORPORATE BOND|SHORT DURATION|BANKING AND PSU|DEBT/.test(s))
    return "Debt";
  if (/GOLD|SILVER/.test(s)) return "Gold & silver";
  if (type !== "stock" && /NASDAQ|FANG|S&P 500|GLOBAL|INTERNATIONAL|US EQUITY|HANG SENG/.test(s)) return "International";
  if (/BALANCED ADVANTAGE|DYNAMIC ASSET|MULTI ASSET|EQUITY SAVINGS|HYBRID|ASSET ALLOCATION/.test(s)) return "Hybrid";
  if (type === "invit") return "Other";
  return "Equity";
}
export function casName(raw: string, type: IndType): string {
  let s = raw.replace(/^[A-Z0-9]{2,6} - /, "");
  if (type === "stock" || type === "invit")
    s = s
      .split("#")[0]
      .replace(/\s*[-–]?\s*(NEW )?(EQUITY|EQ|EQTY) .*$/i, "")
      .replace(/\s*-\s*$/, "");
  else if (type === "etf" || type === "mf") {
    if (/#/.test(s))
      s = s
        .slice(s.indexOf("#") + 1)
        .trim()
        .replace(/^[A-Z ]*?MF ?- ?/i, "");
  } else if (type === "bond")
    s = s
      .replace(/^ISIN Name /, "")
      .split("#")[0]
      .replace(/ (LIMITED|LTD)$/i, "");
  s = s.trim();
  let prev;
  do {
    prev = s;
    s = s.replace(/[\s\-–]+(DIRECT|DIR|DIRAN|PLAN|PL|GROWTH|GR|GRW|OPTION|OPT)\s*$/i, "").replace(/\s*[-–]\s*$/, "");
  } while (s !== prev);
  s = s
    .trim()
    .replace(/ (LIMITED|LTD)\.?$/i, "")
    .trim();
  return s.length >= 2 ? s : raw.slice(0, 40);
}
