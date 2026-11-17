/* What the uploaded reports cover, and where purchase dates are still missing.
   A purchase date (with its price) is what XIRR, the growth chart and the long-term tax date need. Holdings reports and the
   CDSL/NSDL statement give units and the average price only; the dates come from order histories, tradebooks and the
   detailed CAS of the fund registrars. */

import type { CatId } from "@/constants";
import type { Model } from "@/lib/model";
import type { ImportRecord, ISODate } from "@/types/portfolio";

export type ReportGroup = "holdings" | "orders" | "income" | "statements";

export const REPORT_GROUPS: { id: ReportGroup; title: string; what: string; icon: string }[] = [
  { id: "holdings", title: "Holdings", what: "What you own today: units, average buy price, value", icon: "layers" },
  { id: "orders", title: "Transactions", what: "Each buy and sell with its date: needed for XIRR, charts and tax dates", icon: "list" },
  { id: "income", title: "Dividends & interest", what: "Payouts received from shares and bonds", icon: "receipt" },
  {
    id: "statements",
    title: "Statements & tax forms",
    what: "Account statements, screenshots read by the AI helper, tax forms",
    icon: "scroll",
  },
];

const GROUP_OF: Record<string, ReportGroup> = {
  cas: "holdings",
  "gr-stocks": "holdings",
  "gr-mf": "holdings",
  "zd-hold": "holdings",
  wint: "holdings",
  report: "holdings",
  "hold-shot": "holdings",
  "bond-shot": "holdings",
  "gr-st-orders": "orders",
  "gr-mf-orders": "orders",
  "mf-lots": "orders",
  "ib-bonds": "orders",
  transactions: "orders",
  screenshot: "orders",
  divs: "income",
  "zd-div": "income",
  "ib-cf": "income",
  statement: "statements",
  "1042s": "statements",
};
export const groupOf = (kind: string): ReportGroup => GROUP_OF[kind] || "statements";

const DMY = /(\d{2})[-_.](\d{2})[-_.](\d{4})/g;
/** the date range a report covers, read from names like "…_01-04-2026_15-11-2026.xlsx" */
export function fileRange(file?: string): { from: ISODate; to: ISODate } | null {
  const ds = [...(file || "").matchAll(DMY)].map((m) => `${m[3]}-${m[2]}-${m[1]}`).filter((d) => !isNaN(Date.parse(d)));
  if (ds.length < 2) return null;
  ds.sort();
  return { from: ds[0], to: ds[ds.length - 1] };
}

export interface ReportCard {
  kind: string;
  group: ReportGroup;
  latest: ImportRecord;
  /** every upload of this report, newest first */
  all: ImportRecord[];
}
/** one card per kind of report, newest upload first, grouped */
export function reportCards(imports: ImportRecord[]): Record<ReportGroup, ReportCard[]> {
  const by = new Map<string, ImportRecord[]>();
  for (const x of imports) by.set(x.kind, [...(by.get(x.kind) || []), x]);
  const out: Record<ReportGroup, ReportCard[]> = { holdings: [], orders: [], income: [], statements: [] };
  for (const [kind, xs] of by) {
    const all = xs.slice().sort((a, b) => String(b.at || b.period || "").localeCompare(String(a.at || a.period || "")));
    out[groupOf(kind)].push({ kind, group: groupOf(kind), latest: all[0], all });
  }
  for (const g of Object.values(out)) g.sort((a, b) => String(b.latest.at || "").localeCompare(String(a.latest.at || "")));
  return out;
}

/** where to get the missing dates, by the account a holding sits in */
export type FixId = "gr-st" | "gr-mf" | "zd" | "cams" | "ind" | "bond" | "other";
export const FIXES: Record<FixId, { title: string; steps: string; note: string }> = {
  "gr-st": {
    title: "Groww stock order history, for earlier years",
    steps:
      "Groww app → Profile → Reports → Transactions → Stocks – Order history. Pick one financial year at a time (e.g. 1 Apr 2021 – 31 Mar 2022) and download each.",
    note: "Upload all the files together. Orders from every file are kept and a repeat of the same order is counted once.",
  },
  "gr-mf": {
    title: "Groww mutual fund order history, for earlier years",
    steps: "Groww app → Profile → Reports → Transactions → Mutual Funds – Order history, one financial year at a time.",
    note: "Each SIP instalment then gets its own date, which also gives the date it turns long-term.",
  },
  zd: {
    title: "Zerodha tradebook",
    steps: "Zerodha Console → Reports → Tradebook → Equity, one financial year at a time → Download (Excel or CSV).",
    note: "The holdings report has the average price only; the tradebook has each buy.",
  },
  cams: {
    title: "Detailed CAS from CAMS / KFintech",
    steps:
      "camsonline.com → Investors → Statements → CAS – CAMS+KFintech → Detailed, period 'Since inception', with your email. It arrives as a PDF.",
    note: "Covers funds held directly with fund houses (folios). Its password is set by you on that page and is only used here to open the file.",
  },
  ind: {
    title: "INDmoney order screenshots",
    steps: "INDstocks has no downloadable order history. Upload screenshots of each holding's orders and the AI helper reads the dates.",
    note: "Only needed for the long-term tax date; the buy price is already known.",
  },
  bond: {
    title: "Bond purchase statement",
    steps: "Wint Wealth master report, or the IndiaBonds transaction statement, for the date the bond was bought.",
    note: "Bonds pay fixed interest, so the date mostly matters for tax.",
  },
  other: {
    title: "The broker's order history",
    steps: "Download the order history or tradebook from the app the holding was bought in.",
    note: "",
  },
};

export interface DateGap {
  cat: CatId;
  id: string;
  name: string;
  acct: string;
  units: number;
  /** units with no purchase date */
  undated: number;
  /** today's value of those units */
  value: number;
  fix: FixId;
}

const fixFor = (acct: string, type: string): FixId =>
  type === "bond"
    ? "bond"
    : acct === "Groww"
      ? type === "mf"
        ? "gr-mf"
        : "gr-st"
      : acct === "Zerodha"
        ? "zd"
        : /folio|CAMS/i.test(acct)
          ? "cams"
          : /IND/.test(acct)
            ? "ind"
            : /Wint/.test(acct)
              ? "bond"
              : "other";

/** every Indian holding with units that have no purchase date, largest gap first */
export function dateGaps(M: Model): DateGap[] {
  const out: DateGap[] = [];
  for (const c of Object.values(M.cats))
    for (const it of c.items) {
      const h = it.india;
      if (!h || !h.units) continue;
      const dq = (h.lots || []).filter((l) => l.d).reduce((s, l) => s + l.q, 0),
        undated = Math.max(0, h.units - dq);
      if (undated < 1e-6 || undated / h.units < 0.001) continue;
      out.push({
        cat: c.id,
        id: it.id,
        name: it.name,
        acct: h.via || h.acct || "",
        units: h.units,
        undated,
        value: (it.value * undated) / h.units,
        fix: fixFor(h.via || h.acct || "", h.type),
      });
    }
  return out.sort((a, b) => b.value - a.value);
}

/** the gaps grouped by the report that fills them, biggest first */
export function gapsByFix(gaps: DateGap[]) {
  const by = new Map<FixId, DateGap[]>();
  for (const g of gaps) by.set(g.fix, [...(by.get(g.fix) || []), g]);
  return [...by.entries()]
    .map(([fix, items]) => ({ fix, items, value: items.reduce((s, x) => s + x.value, 0) }))
    .sort((a, b) => b.value - a.value);
}
