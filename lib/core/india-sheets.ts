/* Indian broker reports (Groww, Zerodha, Wint Wealth, IndiaBonds) read from spreadsheets, plus extras the AI helper reads
   from screenshots. Each adds buy prices, purchase dates or bond payouts on top of the statement (CAS). */
import type {
  BondFlow,
  Cell,
  Dividend,
  GrowwMfRow,
  GrowwStockRow,
  IbBondRow,
  ISODate,
  OrderRow,
  Portfolio,
  Sheet,
  WintRow,
  ZerodhaRow,
} from "@/types/portfolio";
import { ddmmmyy, dmy, fmtDate, parseLooseDate, TODAY } from "@/lib/dates";
import { inr } from "@/lib/format";
import { casNum, ISIN_RE } from "@/lib/core/cas";
import { noteImport, type Extracted } from "@/lib/core/abroad";
import { buildWatch, indHoldings, mfKey } from "@/lib/core/india";

const inNum = (v: Cell): number | null => (typeof v === "number" ? v : casNum(String(v ?? "").replace(/[₹%]/g, "")));
const norm = (s: Cell) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

export type IndiaSheet =
  | { kind: "wint"; asOf: ISODate; rows: WintRow[]; flows: BondFlow[]; paid: BondFlow[]; ytmAll: number }
  | { kind: "ib-bonds"; asOf: ISODate; rows: IbBondRow[] }
  | { kind: "ib-cf"; asOf: ISODate; rows: BondFlow[]; full: boolean }
  | { kind: "zd-div"; asOf: ISODate; rows: Dividend[] }
  | { kind: "gr-stocks"; asOf: ISODate; rows: GrowwStockRow[] }
  | { kind: "zd-hold"; asOf: ISODate; rows: ZerodhaRow[] }
  | { kind: "gr-mf"; asOf: ISODate; rows: GrowwMfRow[] }
  | { kind: "gr-st-orders"; asOf?: ISODate; rows: OrderRow[] }
  | { kind: "gr-mf-orders"; asOf?: ISODate; rows: OrderRow[] };

export const KIND_IN: Record<string, string> = {
  "gr-stocks": "Groww stocks holdings",
  "zd-hold": "Zerodha holdings",
  "gr-mf": "Groww mutual fund holdings",
  "gr-st-orders": "Groww stock order history",
  "gr-mf-orders": "Groww mutual fund order history",
  wint: "Wint Wealth master report",
  "ib-bonds": "IndiaBonds transaction statement",
  "ib-cf": "IndiaBonds interest / cashflow report",
  "zd-div": "Zerodha dividend report",
};

/* Wint Wealth "Master Report" workbook: Holding Statement (value, cost, YTM, interest so far), Investment Summary (purchase dates),
   Upcoming Cashflow Statement (future interest and principal) and Repayment Summary (interest already paid) */
export function rowsFromWintBook(sheets: Record<string, Sheet>): IndiaSheet | null {
  const table = (pred: (h: string[]) => boolean) => {
    for (const aoa of Object.values(sheets)) {
      const hi = aoa.findIndex((r) => r && pred(r.map(norm)));
      if (hi >= 0) return { aoa, hi, h: aoa[hi].map(norm) };
    }
    return null;
  };
  const col = (h: string[], ...ks: string[]) => {
    for (const k of ks) {
      const i = h.indexOf(k);
      if (i >= 0) return i;
    }
    for (const k of ks) {
      const i = h.findIndex((x) => x.startsWith(k));
      if (i >= 0) return i;
    }
    return -1;
  };
  const isin = (v: Cell) =>
      String(v ?? "")
        .trim()
        .toUpperCase(),
    ok = (v: Cell) => ISIN_RE.test(isin(v)),
    n = (v: Cell) => inNum(v) || 0;
  const hs = table((h) => h.includes("nameofbond") && h.includes("isin") && h.includes("totalinvested") && h.includes("currentvalue"));
  if (!hs) return null;
  let asOf: ISODate | null = null;
  for (const aoa of Object.values(sheets))
    for (const r of aoa) if (r && /date of report/i.test(String(r[0] || ""))) asOf = asOf || dmy(r[1]);
  const H = hs.h,
    c = {
      n: col(H, "nameofbond"),
      i: col(H, "isin"),
      m: col(H, "maturitydate"),
      u: col(H, "units"),
      y: col(H, "ytm"),
      v: col(H, "currentvalue"),
      ui: col(H, "upcominginterest"),
      up: col(H, "upcomingprincipal"),
      t: col(H, "totalinvested"),
      pr: col(H, "principalrepaid"),
      ig: col(H, "interestpaidbefore"),
      ia: col(H, "interestpaidafter"),
      tds: col(H, "tdsdeducted"),
      pt: col(H, "principalrepaymenttype"),
      it: col(H, "interestrepaymenttype"),
    };
  const by: Record<string, WintRow & { yv: number }> = {};
  for (const r of hs.aoa.slice(hs.hi + 1)) {
    if (!r || !ok(r[c.i]) || !(n(r[c.u]) > 0)) continue;
    const k = isin(r[c.i]),
      v = n(r[c.v]);
    const o =
      by[k] ||
      (by[k] = {
        isin: k,
        name: String(r[c.n] || "").trim(),
        mat: dmy(r[c.m]),
        units: 0,
        value: 0,
        invested: 0,
        upInt: 0,
        upPrin: 0,
        prinRep: 0,
        intG: 0,
        intN: 0,
        tds: 0,
        yv: 0,
        ytm: 0,
        pType: String(r[c.pt] || ""),
        iType: String(r[c.it] || ""),
        lots: [],
      });
    o.units += n(r[c.u]);
    o.value += v;
    o.invested += n(r[c.t]);
    o.upInt += n(r[c.ui]);
    o.upPrin += n(r[c.up]);
    o.prinRep += n(r[c.pr]);
    o.intG += n(r[c.ig]);
    o.intN += n(r[c.ia]);
    o.tds += n(r[c.tds]);
    o.yv += n(r[c.y]) * v;
  }
  const rows: WintRow[] = Object.values(by).map(({ yv, ...o }) => ({ ...o, ytm: o.value ? yv / o.value : 0 }));
  const totRow = hs.aoa.slice(hs.hi + 1).find((r) => r && /^total$/i.test(String(r[c.n] || "").trim())),
    ytmAll = totRow ? n(totRow[c.y]) : 0;
  if (!rows.length) return null;
  const inv = table((h) => h.includes("bondname") && h.includes("isin") && h.includes("investedamount") && h.includes("dateofinvestment"));
  if (inv) {
    const c2 = {
      i: col(inv.h, "isin"),
      u: col(inv.h, "noofunits"),
      a: col(inv.h, "investedamount"),
      d: col(inv.h, "dateofinvestment"),
      x: col(inv.h, "xirr"),
    };
    for (const r of inv.aoa.slice(inv.hi + 1)) {
      if (!r || !ok(r[c2.i]) || !by[isin(r[c2.i])]) continue;
      const q = n(r[c2.u]),
        d = dmy(r[c2.d]);
      if (q > 0 && d) by[isin(r[c2.i])].lots.push({ d, q, p: n(r[c2.a]) / q, x: n(r[c2.x]) });
    }
  }
  for (const o of rows) o.lots = (by[o.isin].lots || []).sort((x, y) => x.d.localeCompare(y.d));
  const names = Object.fromEntries(rows.map((o) => [o.isin, o.name]));
  const cf = table((h) => h.includes("nameofbond") && h.includes("isin") && h.includes("date") && h.includes("transactiontype")),
    flows: BondFlow[] = [];
  if (cf) {
    const c3 = {
      i: col(cf.h, "isin"),
      n: col(cf.h, "nameofbond"),
      d: col(cf.h, "date"),
      b: col(cf.h, "amountinbank"),
      p: col(cf.h, "principalrepaid"),
      ia: col(cf.h, "interestpaidafter"),
      ig: col(cf.h, "interestpaidbefore"),
    };
    for (const r of cf.aoa.slice(cf.hi + 1)) {
      if (!r || !ok(r[c3.i])) continue;
      const d = dmy(r[c3.d]);
      if (d)
        flows.push({
          d,
          isin: isin(r[c3.i]),
          n: names[isin(r[c3.i])] || String(r[c3.n] || "").trim(),
          bank: n(r[c3.b]),
          prin: n(r[c3.p]),
          int: n(r[c3.ia]),
          intG: n(r[c3.ig]),
        });
    }
  }
  const rp = table((h) => h[0] === "date" && h.includes("nameofbond") && h.includes("isin") && h.some((x) => x.startsWith("tdsdeducted"))),
    paid: BondFlow[] = [];
  if (rp) {
    const c4 = {
      i: col(rp.h, "isin"),
      n: col(rp.h, "nameofbond"),
      d: col(rp.h, "date"),
      p: col(rp.h, "principalrepaid"),
      ia: col(rp.h, "interestpaidafter"),
      ig: col(rp.h, "interestpaidbefore"),
      t: col(rp.h, "tdsdeducted"),
    };
    for (const r of rp.aoa.slice(rp.hi + 1)) {
      if (!r || !ok(r[c4.i])) continue;
      const d = dmy(r[c4.d]);
      if (d)
        paid.push({
          d,
          isin: isin(r[c4.i]),
          n: String(r[c4.n] || "").trim(),
          bank: 0,
          prin: n(r[c4.p]),
          int: n(r[c4.ia]),
          intG: n(r[c4.ig]),
          tds: n(r[c4.t]),
        });
    }
  }
  flows.sort((x, y) => x.d.localeCompare(y.d));
  paid.sort((x, y) => x.d.localeCompare(y.d));
  return { kind: "wint", asOf: asOf || TODAY(), rows, flows, paid, ytmAll };
}

export function rowsFromIndiaSheet(aoa: Sheet): IndiaSheet | null {
  const find = (pred: (h: string[]) => boolean) => aoa.findIndex((r) => r && pred(r.map(norm)));
  const col = (head: string[], ...ks: string[]) => {
    for (const k of ks) {
      const i = head.findIndex((h) => h === k);
      if (i >= 0) return i;
    }
    for (const k of ks) {
      const i = head.findIndex((h) => h.includes(k));
      if (i >= 0) return i;
    }
    return -1;
  };
  const textAll = aoa
    .slice(0, 20)
    .map((r) => (r || []).join(" "))
    .join(" ");
  const isinOk = (v: Cell) => ISIN_RE.test(String(v || "").trim());
  const today = TODAY();
  let hi: number;
  // IndiaBonds: transaction statement (Buy Transactions sheet)
  if (
    (hi = find(
      (h) =>
        h.includes("isin") &&
        h.includes("issuername") &&
        h.includes("qty") &&
        h.some((x) => x.startsWith("dateofallotment")) &&
        h.some((x) => x.startsWith("settlementallotmentamount")),
    )) >= 0
  ) {
    const h = aoa[hi].map(norm),
      cI = col(h, "isin"),
      cN = col(h, "issuername"),
      cS = col(h, "securityname"),
      cC = col(h, "coupon"),
      cQ = col(h, "qty"),
      cD = col(h, "dateofallotment"),
      cM = col(h, "maturitydate"),
      cA = col(h, "settlementallotmentamount"),
      cP = col(h, "principalamount"),
      cAI = col(h, "accruedinterestrs");
    const rows = aoa
      .slice(hi + 1)
      .filter((r) => r && isinOk(r[cI]))
      .map((r) => ({
        isin: String(r[cI]).trim(),
        name: String(r[cN] || "")
          .replace(/\s+/g, " ")
          .trim(),
        sec: String(r[cS] || "").trim(),
        coupon: inNum(r[cC]) || null,
        q: inNum(r[cQ]) || 0,
        amt: inNum(r[cA]) || 0,
        prin: inNum(r[cP]) || 0,
        ai: cAI >= 0 ? inNum(r[cAI]) : null,
        d: ddmmmyy(r[cD]) as ISODate,
        mat: ddmmmyy(r[cM]),
      }))
      .filter((r) => r.q > 0 && r.amt > 0 && r.d);
    return rows.length ? { kind: "ib-bonds", asOf: today, rows } : null;
  }
  // IndiaBonds: Cashflow report (all interest and principal, past and future)
  if (
    (hi = find(
      (h) =>
        h.includes("nameofbond") && h.includes("isin") && h.includes("date") && h.includes("amountinbank") && h.includes("transactiontype"),
    )) >= 0
  ) {
    const h = aoa[hi].map(norm),
      cN = col(h, "nameofbond"),
      cI = col(h, "isin"),
      cD = col(h, "date"),
      cB = col(h, "amountinbank"),
      cP = col(h, "principalrepaid"),
      cA = col(h, "interestamountafter", "interestpaidafter"),
      cG = col(h, "interestamountbefore", "interestpaidbefore"),
      cT = col(h, "tds");
    const rows = aoa
      .slice(hi + 1)
      .filter((r) => r && isinOk(r[cI]))
      .map((r) => ({
        d: ddmmmyy(r[cD]) as ISODate,
        isin: String(r[cI]).trim(),
        n: String(r[cN] || "")
          .replace(/\s+/g, " ")
          .trim(),
        bank: inNum(r[cB]) || 0,
        prin: inNum(r[cP]) || 0,
        int: inNum(r[cA]) || 0,
        intG: inNum(r[cG]) || 0,
        tds: inNum(r[cT]) || 0,
      }))
      .filter((r) => r.d);
    return rows.length ? { kind: "ib-cf", asOf: today, rows, full: true } : null;
  }
  // IndiaBonds: Interest report (indicative payouts for a year)
  if ((hi = find((h) => h.includes("isin") && h.includes("issuername") && h.some((x) => x.startsWith("indicativeinterestpayment")))) >= 0) {
    const h = aoa[hi].map(norm),
      cN = col(h, "issuername"),
      cI = col(h, "isin"),
      cD = col(h, "indicativeinterestpayment"),
      amt = h.map((x, i) => (x.startsWith("indicativeinterestamount") ? i : -1)).filter((i) => i >= 0),
      cT = col(h, "indicativetds"),
      cF = col(h, "interestpaymentfrequency");
    const cG = amt[0],
      cA = amt[amt.length - 1];
    const rows = aoa
      .slice(hi + 1)
      .filter((r) => r && isinOk(r[cI]))
      .map((r) => {
        const int = inNum(r[cA]) || 0;
        return {
          d: ddmmmyy(r[cD]) as ISODate,
          isin: String(r[cI]).trim(),
          n: String(r[cN] || "")
            .replace(/\s+/g, " ")
            .trim(),
          prin: 0,
          intG: inNum(r[cG]) || 0,
          tds: inNum(r[cT]) || 0,
          int,
          bank: int,
          freq: String(r[cF] || ""),
        };
      })
      .filter((r) => r.d);
    return rows.length ? { kind: "ib-cf", asOf: today, rows, full: false } : null;
  }
  // Zerodha Console: Dividend and Interest (CSV)
  if (
    (hi = find(
      (h) =>
        h.includes("symbol") &&
        h.some((x) => x.startsWith("exdate")) &&
        h.some((x) => x.startsWith("totaldividend") || x === "netdividendamount" || x.startsWith("dividendamount")),
    )) >= 0
  ) {
    const h = aoa[hi].map(norm),
      cS = col(h, "symbol"),
      cD = col(h, "exdate"),
      cQ = col(h, "qty", "quantity"),
      cP = col(h, "dividendpershare"),
      cT = col(h, "totaldividend", "netdividendamount", "dividendamount");
    const rows = aoa
      .slice(hi + 1)
      .filter((r) => r && r[cS] && (inNum(r[cT]) || 0) > 0)
      .map((r) => ({
        sym: String(r[cS]).trim(),
        d: (dmy(r[cD]) || parseLooseDate(r[cD])) as ISODate,
        q: inNum(r[cQ]) || null,
        dps: inNum(r[cP]) || null,
        amt: inNum(r[cT]) || 0,
      }))
      .filter((r) => r.d);
    return rows.length ? { kind: "zd-div", asOf: today, rows } : null;
  }
  // Groww: Stocks - Holdings statement
  if ((hi = find((h) => h.includes("stockname") && h.includes("isin") && h.includes("averagebuyprice"))) >= 0) {
    const h = aoa[hi].map(norm),
      cN = col(h, "stockname"),
      cI = col(h, "isin"),
      cQ = col(h, "quantity"),
      cA = col(h, "averagebuyprice"),
      cC = col(h, "closingprice");
    const m = textAll.match(/as on (\d{2}-\d{2}-\d{4})/i);
    const rows = aoa
      .slice(hi + 1)
      .filter((r) => r && isinOk(r[cI]))
      .map((r) => ({
        isin: String(r[cI]).trim(),
        name: String(r[cN] || "").trim(),
        q: inNum(r[cQ]) || 0,
        avg: inNum(r[cA]) || 0,
        close: inNum(r[cC]) || 0,
      }))
      .filter((r) => r.q > 0);
    return rows.length ? { kind: "gr-stocks", asOf: (m && dmy(m[1])) || today, rows } : null;
  }
  // Zerodha Console holdings (Equity / Mutual Funds / Combined sheets)
  if (
    (hi = find(
      (h) => h.includes("symbol") && h.includes("isin") && h.includes("averageprice") && h.some((x) => x.startsWith("quantityavailable")),
    )) >= 0
  ) {
    const h = aoa[hi].map(norm),
      cS = col(h, "symbol"),
      cI = col(h, "isin"),
      cQ = col(h, "quantityavailable"),
      cA = col(h, "averageprice"),
      cC = col(h, "previousclosingprice"),
      cT = col(h, "instrumenttype");
    const rows = aoa
      .slice(hi + 1)
      .filter((r) => r && isinOk(r[cI]))
      .map((r) => ({
        isin: String(r[cI]).trim(),
        name: String(r[cS] || "").trim(),
        q: inNum(r[cQ]) || 0,
        avg: inNum(r[cA]) || 0,
        close: inNum(r[cC]) || 0,
        mf: (cT >= 0 && /fund|elss|mutual/i.test(String(r[cT] || ""))) || /^INF/.test(String(r[cI])),
      }))
      .filter((r) => r.q > 0);
    return rows.length ? { kind: "zd-hold", asOf: today, rows } : null;
  }
  // Groww: Mutual Funds - Holdings statement
  if ((hi = find((h) => h.includes("schemename") && h.includes("investedvalue") && h.includes("currentvalue"))) >= 0) {
    const h = aoa[hi].map(norm),
      cN = col(h, "schemename"),
      cAmc = col(h, "amc"),
      cCat = col(h, "category"),
      cSub = col(h, "subcategory"),
      cF = col(h, "foliono", "folio"),
      cSrc = col(h, "source"),
      cU = col(h, "units"),
      cV = col(h, "investedvalue"),
      cC = col(h, "currentvalue");
    const m = textAll.match(/HOLDINGS AS ON (\d{4}-\d{2}-\d{2})/i);
    const rows = aoa
      .slice(hi + 1)
      .filter((r) => r && r[cN] && (inNum(r[cU]) || 0) > 0)
      .map((r) => ({
        name: String(r[cN]).trim(),
        amc: String(r[cAmc] || ""),
        cat: String(r[cCat] || ""),
        sub: String(r[cSub] || ""),
        folio: String(r[cF] || ""),
        src: String(r[cSrc] || ""),
        units: inNum(r[cU]) || 0,
        invested: inNum(r[cV]) || 0,
        value: inNum(r[cC]) || 0,
      }));
    return rows.length ? { kind: "gr-mf", asOf: m ? m[1] : today, rows } : null;
  }
  // Groww: Stocks - Order history
  if (
    (hi = find(
      (h) => h.includes("isin") && h.includes("type") && h.includes("quantity") && h.some((x) => x.startsWith("executiondate")),
    )) >= 0
  ) {
    const h = aoa[hi].map(norm),
      cI = col(h, "isin"),
      cT = col(h, "type"),
      cQ = col(h, "quantity"),
      cV = col(h, "value"),
      cD = col(h, "executiondateandtime", "executiondate"),
      cSt = col(h, "orderstatus"),
      cN = col(h, "stockname");
    const rows: OrderRow[] = aoa
      .slice(hi + 1)
      .filter((r) => r && isinOk(r[cI]) && (cSt < 0 || /executed|complete/i.test(String(r[cSt]))))
      .map((r) => ({
        isin: String(r[cI]).trim(),
        n: String(r[cN] || "").trim(),
        s: (/sell/i.test(String(r[cT])) ? -1 : 1) as 1 | -1,
        q: inNum(r[cQ]) || 0,
        v: inNum(r[cV]) || 0,
        d: dmy(r[cD]) as ISODate,
      }))
      .filter((r) => r.q > 0 && r.d);
    return rows.length ? { kind: "gr-st-orders", rows } : null;
  }
  // Groww: Mutual Funds - Order history
  if ((hi = find((h) => h.includes("schemename") && h.includes("transactiontype") && h.includes("units") && h.includes("date"))) >= 0) {
    const h = aoa[hi].map(norm),
      cN = col(h, "schemename"),
      cT = col(h, "transactiontype"),
      cU = col(h, "units"),
      cA = col(h, "amount"),
      cD = col(h, "date");
    const rows: OrderRow[] = aoa
      .slice(hi + 1)
      .filter((r) => r && r[cN] && (inNum(r[cU]) || 0) > 0)
      .map((r) => ({
        n: String(r[cN]).trim(),
        s: (/redeem|sell|switch.?out|withdraw/i.test(String(r[cT])) ? -1 : 1) as 1 | -1,
        q: inNum(r[cU]) || 0,
        v: inNum(r[cA]) || 0,
        d: dmy(r[cD]) as ISODate,
      }))
      .filter((r) => r.d);
    return rows.length ? { kind: "gr-mf-orders", rows } : null;
  }
  return null;
}

export function applyIndiaSheet(state: Portfolio, rep: IndiaSheet, fname: string): string[] {
  const I = state.india;
  if (!I) return [`${fname}: upload your CDSL/NSDL statement (CAS) first`];
  const today = TODAY();
  I.src = I.src || {};
  if (rep.kind === "ib-bonds") {
    // bonds bought on IndiaBonds, delivered into another demat (here Groww)
    I.via = I.via || {};
    I.bondCost = I.bondCost || {};
    const by: Record<string, IbBondRow[]> = {};
    for (const r of rep.rows) (by[r.isin] = by[r.isin] || []).push(r);
    for (const [isin, rs] of Object.entries(by)) {
      I.via[isin] = "IndiaBonds";
      I.bondCost[isin] = {
        cost: rs.reduce((s, r) => s + r.amt, 0),
        prin: rs.reduce((s, r) => s + r.prin, 0),
        units: rs.reduce((s, r) => s + r.q, 0),
        lots: rs.map((r) => ({ d: r.d, q: r.q, p: r.amt / r.q })),
        coupon: rs[0].coupon,
        mat: rs[0].mat,
        src: "IndiaBonds",
        at: today,
      };
    }
    I.src.ib = { asOf: today, rows: rep.rows, file: fname };
    noteImport(state, { kind: rep.kind, period: today, count: rep.rows.length });
    const eff = indHoldings(I);
    return [
      ...rep.rows.map(
        (r) =>
          `${r.name}: ${r.q} bought on ${fmtDate(r.d)} for ${inr(r.amt)} (${r.coupon ? r.coupon + "% coupon, " : ""}matures ${fmtDate(r.mat)})`,
      ),
      `Now ${eff.filter((h) => h.cost != null).length} of ${eff.length} Indian holdings have a buy price`,
    ];
  }
  if (rep.kind === "zd-div") return applyInDivs(state, rep.rows);
  if (rep.kind === "ib-cf") {
    // merge by bond + date; the cashflow report wins over the indicative interest report (it also has principal)
    const old = I.src.ibcf?.rows || [],
      by: Record<string, BondFlow> = {};
    for (const r of old) by[r.isin + "|" + r.d] = r;
    for (const r of rep.rows) {
      const k = r.isin + "|" + r.d;
      if (!by[k] || rep.full || !by[k].full) by[k] = { ...r, full: rep.full };
    }
    const rows = Object.values(by).sort((x, y) => x.d.localeCompare(y.d));
    I.src.ibcf = { asOf: today, rows, file: fname };
    noteImport(state, { kind: rep.kind, period: today, count: rep.rows.length, file: fname });
    const past = rows.filter((r) => r.d <= today),
      fut = rows.filter((r) => r.d > today);
    return [
      `${rep.rows.length} payouts read (${rep.full ? "cashflow report" : "interest report"})`,
      `Received so far: ${inr(past.reduce((s, r) => s + r.int, 0))} after ${inr(past.reduce((s, r) => s + (r.tds || 0), 0))} TDS`,
      `Still to come: ${inr(fut.reduce((s, r) => s + r.int, 0))} interest + ${inr(fut.reduce((s, r) => s + r.prin, 0))} principal`,
    ];
  }
  const asOf = rep.asOf || today;
  if (rep.kind === "gr-stocks") I.src.grSt = { asOf, rows: rep.rows, file: fname };
  else if (rep.kind === "zd-hold") I.src.zd = { asOf, rows: rep.rows, file: fname };
  else if (rep.kind === "gr-mf") I.src.grMF = { asOf, rows: rep.rows, file: fname };
  else if (rep.kind === "gr-st-orders") I.src.grStO = { asOf, rows: rep.rows, file: fname };
  else if (rep.kind === "gr-mf-orders") I.src.grMFO = { asOf, rows: rep.rows, file: fname };
  else if (rep.kind === "wint") I.src.wint = { asOf, rows: rep.rows, file: fname, flows: rep.flows, paid: rep.paid, ytmAll: rep.ytmAll };
  noteImport(state, { kind: rep.kind, period: asOf, count: rep.rows.length });
  buildWatch(I);
  const eff = indHoldings(I);
  const withCost = eff.filter((h) => h.cost != null).length,
    withDate = eff.filter((h) => h.lots && h.lots.some((l) => l.d)).length;
  const extra =
    rep.kind === "wint"
      ? [
          `${rep.rows.length} bonds · invested ${inr(rep.rows.reduce((s, r) => s + r.invested, 0))} · now ${inr(rep.rows.reduce((s, r) => s + r.value, 0))}`,
          `${rep.flows.length} upcoming payouts and ${rep.paid.length} past payouts read`,
        ]
      : [];
  return [
    `${KIND_IN[rep.kind]}: ${rep.rows.length} rows`,
    ...extra,
    `Now ${withCost} of ${eff.length} Indian holdings have a buy price and ${withDate} have purchase dates`,
  ];
}

/* Indian bond buy prices read from a screenshot (e.g. INDmoney bonds bought into the Groww demat) */
export function applyInBonds(state: Portfolio, list: NonNullable<Extracted["in_bonds"]>): string[] {
  const I = state.india;
  if (!I) return ["Upload your CDSL/NSDL statement (CAS) first"];
  const today = TODAY();
  I.bondCost = I.bondCost || {};
  const ch: string[] = [],
    bonds = indHoldings(I).filter((h) => h.type === "bond");
  const ABBR: Record<string, string> = { NFL: "NAVI FINSERV", INDEL: "INDEL MONEY", MFL: "MUTHOOT FINCORP" };
  const words = (s: string) =>
    String(s || "")
      .toUpperCase()
      .replace(/\b[A-Z]+\b/g, (w) => ABBR[w] || w)
      .replace(/[^A-Z ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !/^(LTD|LIMITED|PVT|PRIVATE|NCD|BOND|SERIES|THE)$/.test(w));
  for (const b of list) {
    if (!(+b.invested_inr > 0)) continue;
    const isin = String(b.isin || "")
      .trim()
      .toUpperCase();
    let h = (ISIN_RE.test(isin) && bonds.find((x) => x.isin === isin)) || null;
    const mat = parseLooseDate(b.maturity),
      dm = mat ? mat.slice(8, 10) + mat.slice(5, 7) + mat.slice(0, 4) : null;
    if (!h && dm) {
      const c = bonds.filter((x) => x.cost == null && x.name.includes(dm));
      if (c.length === 1) h = c[0];
    }
    if (!h) {
      const w = words(b.name || ""),
        c = bonds.filter(
          (x) =>
            x.cost == null &&
            words(x.name + " " + (x.casName || "")).some((y) => w.includes(y) || w.some((z) => y.startsWith(z) || z.startsWith(y))),
        );
      if (c.length === 1) h = c[0];
      else if (c.length > 1 && +(b.units || 0)) h = c.find((x) => Math.abs(x.units - +(b.units || 0)) < 1e-6) || null;
    }
    if (!h) {
      ch.push(`${b.name || isin}: couldn't match it to a bond in your statement`);
      continue;
    }
    I.bondCost[h.isin] = {
      cost: +b.invested_inr,
      units: +(b.units || 0) || h.units,
      d: parseLooseDate(b.date) || null,
      ytm: +(b.ytm || 0) || null,
      mat: parseLooseDate(b.maturity) || null,
      at: today,
    };
    ch.push(`${h.name}: bought for ${inr(+b.invested_inr)}${+(b.ytm || 0) ? ` at ${(+(b.ytm || 0)).toFixed(2)}% yield` : ""}`);
  }
  if (ch.some((x) => /bought for/.test(x)))
    noteImport(state, { kind: "bond-shot", period: today, count: ch.filter((x) => /bought for/.test(x)).length });
  return ch;
}
/* average buy price of Indian shares / funds read from a holdings screenshot (e.g. INDstocks, which has no downloadable report) */
export function applyInHoldings(state: Portfolio, list: NonNullable<Extracted["in_holdings"]>): string[] {
  const I = state.india;
  if (!I || !list.length) return [];
  const today = TODAY();
  I.shotCost = I.shotCost || {};
  const ch: string[] = [],
    H = indHoldings(I).filter((h) => h.type !== "bond");
  const key = (s: string) =>
    String(s || "")
      .toUpperCase()
      .replace(/\b(LTD|LIMITED|INDIA|THE)\b/g, "")
      .replace(/[^A-Z0-9]/g, "");
  for (const b of list) {
    if (!(+b.avg_inr > 0)) continue;
    const isin = String(b.isin || "")
        .trim()
        .toUpperCase(),
      plat = String(b.platform || "").toLowerCase();
    let c = H.filter((h) => (ISIN_RE.test(isin) ? h.isin === isin : key(h.name) === key(b.name) || (h.nse && key(h.nse) === key(b.name))));
    if (c.length > 1 && plat) {
      const f = c.filter((h) => h.acct.toLowerCase().startsWith(plat.slice(0, 4)));
      if (f.length) c = f;
    }
    if (c.length > 1 && +(b.units || 0)) c = c.filter((h) => Math.abs(h.units - +(b.units || 0)) < 1e-6);
    if (c.length > 1) c = c.filter((h) => h.cost == null);
    if (c.length !== 1) {
      ch.push(`${b.name}: couldn't tell which holding this is`);
      continue;
    }
    const h = c[0];
    I.shotCost[h.isin + "|" + h.acct] = {
      avg: +b.avg_inr,
      units: +(b.units || 0) || h.units,
      src: (b.platform || h.acct) + " screenshot",
      at: today,
    };
    ch.push(`${h.name} (${h.acct}): bought at ₹${(+b.avg_inr).toFixed(2)} a unit`);
  }
  if (ch.some((x) => /bought at/.test(x)))
    noteImport(state, { kind: "hold-shot", period: today, count: ch.filter((x) => /bought at/.test(x)).length });
  return ch;
}
/* individual purchases: fund purchases keyed by folio (e.g. a Zerodha ELSS statement) or share purchases from a per-stock breakdown */
export function applyInLots(state: Portfolio, list: NonNullable<Extracted["in_lots"]>): string[] {
  const I = state.india;
  if (!I || !list.length) return [];
  const today = TODAY();
  I.mfLots = I.mfLots || {};
  const ch: string[] = [],
    all = indHoldings(I),
    H = all.filter((h) => h.type === "mf"),
    SH = all.filter((h) => h.type !== "mf" && h.type !== "bond");
  const nk = (s: string) =>
    String(s || "")
      .toUpperCase()
      .replace(/\b(LTD|LIMITED|INDIA|THE|CORPORATION|CORP)\b/g, "")
      .replace(/[^A-Z0-9]/g, "");
  const funds = list.filter((b) => {
    const isin = String(b.isin || "")
        .trim()
        .toUpperCase(),
      sym = String(b.symbol || "")
        .trim()
        .toUpperCase();
    if (!isin && !sym) return true;
    const plat = String(b.platform || "").toLowerCase();
    let c = SH.filter((h) => (ISIN_RE.test(isin) && h.isin === isin) || (!!sym && !!h.nse && h.nse.toUpperCase() === sym));
    if (!c.length && sym) c = SH.filter((h) => nk(h.name) === nk(sym) || (nk(h.name).startsWith(nk(sym)) && nk(sym).length >= 4));
    if (c.length > 1 && plat) {
      const f = c.filter((h) => h.acct.toLowerCase().startsWith(plat.slice(0, 4)));
      if (f.length) c = f;
    }
    const h = c.length === 1 ? c[0] : c.find((x) => !x.lots) || c[0],
      d = parseLooseDate(b.date),
      q = +b.units;
    if (!h || !d || !(q > 0)) {
      ch.push(`${sym || isin}: couldn't match it to a share you hold`);
      return false;
    }
    I.stLots = I.stLots || {};
    const k = h.isin + "|" + h.acct,
      old = I.stLots[k] || [];
    if (!old.some((l) => l.d === d && Math.abs(l.q - q) < 1e-6))
      old.push({ d, q, p: +(b.amount_inr || 0) > 0 ? +(b.amount_inr || 0) / q : null, tag: b.tag || null });
    I.stLots[k] = old.sort((x, y) => x.d.localeCompare(y.d));
    ch.push(`${h.name}: ${q} bought on ${fmtDate(d)}${b.tag ? ` (${b.tag})` : ""}`);
    return false;
  });
  const by: Record<string, { d: ISODate; q: number; p: number | null; fund: string; folio: string }[]> = {};
  for (const b of funds) {
    const d = parseLooseDate(b.date),
      q = +b.units;
    if (!d || !(q > 0)) continue;
    const folio = String(b.folio || "").replace(/\D/g, ""),
      k = folio + "|" + mfKey(b.fund || "");
    (by[k] = by[k] || []).push({ d, q, p: +(b.amount_inr || 0) > 0 ? +(b.amount_inr || 0) / q : null, fund: b.fund || "", folio });
  }
  for (const rs of Object.values(by)) {
    const f = rs[0],
      h = H.find((x) => f.folio && String(x.folio || "").replace(/\D/g, "") === f.folio) || H.find((x) => mfKey(x.name) === mfKey(f.fund));
    if (!h) {
      ch.push(`${f.fund}: couldn't match it to a fund you hold`);
      continue;
    }
    const k = String(h.folio || f.folio || mfKey(h.name)),
      old = I.mfLots[k] || [],
      seen = new Set(old.map((l) => l.d + "|" + l.q));
    const add = rs.filter((l) => !seen.has(l.d + "|" + l.q)).map(({ d, q, p }) => ({ d, q, p }));
    I.mfLots[k] = [...old, ...add].sort((x, y) => x.d.localeCompare(y.d));
    const got = I.mfLots[k].reduce((s, l) => s + l.q, 0);
    ch.push(
      `${h.name}: ${add.length} purchase${add.length === 1 ? "" : "s"} added · dates known for ${(+got).toFixed(3)} of ${(+h.units).toFixed(3)} units`,
    );
  }
  if (ch.some((x) => /added|bought on/.test(x)))
    noteImport(state, { kind: "mf-lots", period: today, count: ch.filter((x) => /added|bought on/.test(x)).length });
  return ch;
}
/* dividends received (Zerodha "Dividend and Interest" CSV or screenshot) */
export function applyInDivs(state: Portfolio, list: Dividend[]): string[] {
  const I = state.india;
  if (!I || !list.length) return [];
  I.divs = I.divs || [];
  const seen = new Set(I.divs.map((x) => x.sym + "|" + x.d));
  let n = 0,
    tot = 0;
  for (const x of list) {
    const sym = String(x.sym || "")
      .trim()
      .toUpperCase();
    if (!sym || !x.d || !(x.amt > 0) || seen.has(sym + "|" + x.d)) continue;
    seen.add(sym + "|" + x.d);
    I.divs.push({ sym, d: x.d, q: x.q || null, dps: x.dps || null, amt: x.amt, acct: x.acct || "Zerodha" });
    n++;
    tot += x.amt;
  }
  I.divs.sort((x, y) => x.d.localeCompare(y.d));
  if (n) noteImport(state, { kind: "divs", period: TODAY(), count: n });
  return [n ? `${n} dividend${n === 1 ? "" : "s"} added (${inr(tot)})` : "No new dividends (already added)"];
}
