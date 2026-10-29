/* India: the statement (CAS) is the baseline; fresher Groww / Zerodha / Wint / IndiaBonds reports replace or enrich it.
   Also the Indian capital-gains rules, bond income and the list the daily price job reads. */
import type { BondFlow, CasHolding, IndHolding, IndLot, IndiaSources, IndiaState, ISODate, OrderRow, Portfolio } from "@/types/portfolio";
import { addMonths, fmtDate, fyStart, nextYm, TODAY } from "@/lib/dates";
import { inr, sgn } from "@/lib/format";
import { xirr } from "@/lib/core/xirr";
import { noteImport } from "@/lib/core/abroad";
import type { CasResult } from "@/lib/core/cas";
import { casClass } from "@/lib/core/cas";

/** NSE symbols for listed holdings (the daily refresh looks up any it doesn't know) */
export const IN_NSE: Record<string, string> = {
  INE848E01016: "NHPC",
  INE622W01025: "ACMESOLAR",
  INE0V6F01027: "HYUNDAI",
  INE742F01042: "ADANIPORTS",
  INE885A01032: "ARE&M",
  INE208A01029: "ASHOKLEY",
  INE238A01034: "AXISBANK",
  INE028A01039: "BANKBARODA",
  INE263A01024: "BEL",
  INE397D01024: "BHARTIARTL",
  INE029A01011: "BPCL",
  INE486A01021: "CESC",
  INE522F01014: "COALINDIA",
  INE299U01018: "CROMPTON",
  INE089A01031: "DRREDDY",
  INE129A01019: "GAIL",
  INE860A01027: "HCLTECH",
  INE040A01034: "HDFCBANK",
  INE267A01025: "HINDZINC",
  INE030A01027: "HINDUNILVR",
  INE094A01015: "HINDPETRO",
  INE090A01021: "ICICIBANK",
  INE242A01010: "IOC",
  INE053F01010: "IRFC",
  INE009A01021: "INFY",
  INE962Y01021: "IRCON",
  INE335Y01020: "IRCTC",
  INE379A01028: "ITCHOTELS",
  INE154A01025: "ITC",
  INE237A01036: "KOTAKBANK",
  INE04I401011: "KPITTECH",
  INE139A01034: "NATIONALUM",
  INE987B01026: "NATCOPHARM",
  INE095N01031: "NBCC",
  INE589A01014: "NLCINDIA",
  INE0ONG01011: "NTPCGREEN",
  INE733E01010: "NTPC",
  INE274J01014: "OIL",
  INE213A01029: "ONGC",
  INE134E01011: "PFC",
  INE415G01027: "RVNL",
  INE0DD101019: "RAILTEL",
  INE020B01018: "RECLTD",
  INE002A01018: "RELIANCE",
  INE320J01015: "RITES",
  INE062A01020: "SBIN",
  INE002L01015: "SJVN",
  INE467B01029: "TCS",
  INE669C01036: "TECHM",
  INE615H01020: "TITAGARH",
  INE075A01022: "WIPRO",
  INE018A01030: "LT",
  INE736A01011: "CDSL",
};

export const mfKey = (s: string) =>
  String(s)
    .toUpperCase()
    .replace(/\.\.\.$/, "")
    .replace(/\b(DIRECT|DIR|PLAN|GROWTH|OPTION|OPT|FUND|FD|PL|GR|THE)\b/g, " ")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
export const nameKey = (s: string) =>
  String(s)
    .toUpperCase()
    .replace(/\.\.\.$/, "")
    .replace(/[^A-Z0-9]/g, "");
/** the key a holding's prices are stored under (ISIN, or "MF:" + name for funds known only by name) */
export const priceKey = (h: { type: string; isin: string; name: string }) =>
  h.type === "mf" && !h.isin ? "MF:" + nameKey(h.name) : h.isin;
/** latest value: the refreshed price if newer than the statement, else the statement value */
export const indCur = (h: IndHolding, I: IndiaState | undefined) =>
  h.lp && h.lpAt && h.lpAt > (h.asOf || I?.asOf || "") ? h.units * h.lp : h.value;
export const indPrice = (h: IndHolding, I: IndiaState) => (h.lp && h.lpAt && h.lpAt > (h.asOf || I.asOf) ? h.lp : h.price);
export const indPriceAt = (h: IndHolding, I: IndiaState) => (h.lp && h.lpAt && h.lpAt > (h.asOf || I.asOf) ? h.lpAt : h.asOf || I.asOf);

function indClsFromMF(r: { cat: string; sub: string; name: string }) {
  const c = (r.cat + " " + r.sub + " " + r.name).toUpperCase();
  if (/COMMODIT|GOLD|SILVER/.test(c)) return "Gold & silver" as const;
  if (/NASDAQ|FANG|S&P 500|GLOBAL|INTERNATIONAL|US EQUITY|OVERSEAS/.test(c)) return "International" as const;
  if (/DEBT|LIQUID|OVERNIGHT|MONEY MARKET|GILT|ARBITRAGE/.test(c)) return "Debt" as const;
  if (/HYBRID/.test(c)) return "Hybrid" as const;
  return "Equity" as const;
}

/** the holdings the app shows: statement (CAS) baseline, replaced by fresher broker snapshots */
export function indHoldings(I: IndiaState, today: ISODate = TODAY()): IndHolding[] {
  const src: IndiaSources = I.src || {},
    newer = (s?: { asOf: ISODate }) => !!s && s.asOf >= I.asOf;
  const casByIsin: Record<string, CasHolding> = {};
  for (const h of I.holdings) casByIsin[h.isin] = h;
  let out: IndHolding[] = I.holdings.map((h) => ({ ...h, key: h.isin + "|" + h.acct, from: "CAS" }));
  if (newer(src.grSt) && src.grSt) {
    out = out.filter((h) => !(h.acct === "Groww" && h.type !== "mf" && h.type !== "bond")); // bonds keep the statement value (Groww quotes some bonds as % of face value)
    for (const r of src.grSt.rows) {
      const c = casByIsin[r.isin],
        isMF = c ? c.type === "mf" : /^INF/.test(r.isin) && !/ETF|BEES|EXCHANGE TRADED|GOLD|SILV/i.test(r.name);
      if (isMF) continue; // fund units held in demat are covered by the mutual fund report
      if (c ? c.type === "bond" : /^INE\w{4}07/.test(r.isin)) continue;
      const type = c ? c.type : /^INF/.test(r.isin) ? "etf" : /INVIT/i.test(r.name) ? "invit" : "stock";
      if (!(r.close > 0)) continue;
      out.push({
        isin: r.isin,
        name: c ? c.name : r.name,
        type,
        cls: c ? c.cls : casClass(r.name, type),
        acct: "Groww",
        depo: "CDSL",
        units: r.q,
        price: r.close,
        value: r.q * r.close,
        ...(r.avg > 0 ? { avg: r.avg, cost: r.avg * r.q } : {}),
        key: r.isin + "|Groww",
        from: "Groww " + fmtDate(src.grSt.asOf),
        asOf: src.grSt.asOf,
      });
    }
  }
  if (newer(src.zd) && src.zd) {
    out = out.filter((h) => !(h.acct === "Zerodha" && (h.type !== "mf" || !newer(src.grMF))));
    for (const r of src.zd.rows) {
      if (r.mf && newer(src.grMF)) continue;
      const c = casByIsin[r.isin],
        type = c ? c.type : r.mf ? "mf" : "stock";
      out.push({
        isin: r.isin,
        name: c ? c.name : r.name,
        type,
        cls: c ? c.cls : "Equity",
        acct: "Zerodha",
        depo: "CDSL",
        units: r.q,
        price: r.close,
        value: r.q * r.close,
        ...(r.avg > 0 ? { avg: r.avg, cost: r.avg * r.q } : {}),
        nse: r.mf ? undefined : r.name,
        key: r.isin + "|Zerodha",
        from: "Zerodha",
        asOf: src.zd.asOf,
      });
    }
  }
  if (newer(src.grMF) && src.grMF) {
    out = out.filter((h) => h.type !== "mf");
    for (const r of src.grMF.rows)
      out.push({
        isin: "",
        name: r.name,
        type: "mf",
        cls: indClsFromMF(r),
        sub: r.sub,
        acct: r.src === "External" ? "MF folios (CAMS/KFin)" : "Groww",
        depo: "MF",
        folio: r.folio,
        units: r.units,
        price: r.value / r.units,
        value: r.value,
        cost: r.invested,
        key: "MF:" + nameKey(r.name) + "|" + r.folio,
        mfName: r.name,
        from: "Groww " + fmtDate(src.grMF.asOf),
        asOf: src.grMF.asOf,
      });
  }
  // Wint Wealth bonds: the master report has value (with accrued interest), price paid, YTM and purchase dates
  if (src.wint) {
    const WA = "Wint Wealth (NSDL)",
      by = Object.fromEntries(src.wint.rows.map((r) => [r.isin, r]));
    const bondOf = (r: (typeof src.wint.rows)[number]) => ({
      ytm: r.ytm,
      mat: r.mat,
      intN: r.intN,
      intG: r.intG,
      tds: r.tds,
      upInt: r.upInt,
      upPrin: r.upPrin,
      pType: r.pType,
      iType: r.iType,
    });
    if (newer(src.wint)) {
      out = out.filter((h) => h.acct !== WA);
      for (const r of src.wint.rows) {
        const c = casByIsin[r.isin];
        out.push({
          isin: r.isin,
          name: r.name,
          casName: c && c.name,
          type: "bond",
          cls: "Debt",
          acct: WA,
          depo: "NSDL",
          units: r.units,
          price: r.value / r.units,
          value: r.value,
          cost: r.invested,
          avg: r.invested / r.units,
          lots: r.lots.map((l) => ({ d: l.d, q: l.q, p: l.p })),
          bond: bondOf(r),
          key: r.isin + "|Wint",
          from: "Wint " + fmtDate(src.wint.asOf),
          asOf: src.wint.asOf,
        });
      }
    } else
      for (const h of out) {
        const r = h.acct === WA && by[h.isin];
        if (!r || Math.abs(r.units - h.units) > 1e-6) continue; // a newer statement: keep its value, add what Wint knows
        Object.assign(h, {
          name: r.name,
          casName: h.name,
          cost: r.invested,
          avg: r.invested / r.units,
          lots: r.lots.map((l) => ({ d: l.d, q: l.q, p: l.p })),
          bond: bondOf(r),
        });
      }
  }
  // refreshed prices
  const px = I.px || {};
  for (const h of out) {
    const p = px[priceKey(h)];
    if (p && p.p > 0 && p.at > (h.asOf || I.asOf)) {
      h.lp = p.p;
      h.lpAt = p.at;
    }
  }
  // purchase dates from order histories (FIFO)
  attachLots(out, src);
  // bonds bought elsewhere (e.g. on INDmoney) but held in another demat: platform label and buy price
  for (const h of out)
    if (h.type === "bond") {
      const via = (I.via || {})[h.isin];
      if (via) h.via = via;
      const ibn = src.ib && src.ib.rows.find((r) => r.isin === h.isin);
      if (ibn && ibn.name) {
        h.casName = h.name;
        h.name = ibn.name
          .replace(/\b(LIMITED|LTD|PRIVATE|PVT)\b\.?/gi, "")
          .trim()
          .toLowerCase()
          .replace(/\b[a-z]/g, (c) => c.toUpperCase());
      }
      const bc = (I.bondCost || {})[h.isin];
      if (bc && h.cost == null && bc.units > 0) {
        h.cost = bc.cost * (h.units / bc.units);
        h.avg = bc.cost / bc.units;
        if (bc.coupon) h.coupon = bc.coupon;
        if (bc.lots && Math.abs(bc.units - h.units) < 1e-6) h.lots = bc.lots.map((l) => ({ ...l }));
        else if (bc.d) h.lots = [{ d: bc.d, q: h.units, p: h.avg }];
        else if (h.lots) h.lots = h.lots.map((l) => ({ ...l, p: h.avg ?? null }));
        if (bc.ytm) h.ytmBuy = bc.ytm;
      }
    }
  // IndiaBonds payouts: interest so far, upcoming cash flows and an estimated yield (XIRR of price paid vs all payouts before TDS)
  const ibcf = src.ibcf && src.ibcf.rows;
  if (ibcf)
    for (const h of out)
      if (h.type === "bond" && !h.bond) {
        const rs = ibcf.filter((r) => r.isin === h.isin);
        if (!rs.length) continue;
        const past = rs.filter((r) => r.d <= today),
          fut = rs.filter((r) => r.d > today),
          bc = (I.bondCost || {})[h.isin];
        const buy =
          h.lots && h.lots.length && h.lots.every((l) => l.d && l.p != null)
            ? h.lots.map((l) => ({ d: l.d as ISODate, v: -l.q * (l.p as number) }))
            : null;
        const ytm = buy
          ? xirr([...buy, ...rs.filter((r) => buy.every((b) => r.d > b.d)).map((r) => ({ d: r.d, v: r.prin + r.intG }))])
          : null;
        const lastPrin = rs
          .filter((r) => r.prin > 0)
          .map((r) => r.d)
          .sort()
          .slice(-1)[0];
        h.bond = {
          ytm: ytm != null ? 100 * ytm : bc?.coupon || 0,
          ytmEst: true,
          mat: bc?.mat || lastPrin || null,
          intN: past.reduce((s, r) => s + r.int, 0),
          intG: past.reduce((s, r) => s + r.intG, 0),
          tds: past.reduce((s, r) => s + (r.tds || 0), 0),
          upInt: fut.reduce((s, r) => s + r.int, 0),
          upPrin: fut.reduce((s, r) => s + r.prin, 0),
          iType: rs.find((r) => r.freq)?.freq || "",
          src: "IndiaBonds",
        };
      }
  // fund purchases from statements like Zerodha's ELSS statement (by folio), for funds without dated lots
  for (const h of out)
    if (h.type === "mf") {
      const L = (I.mfLots || {})[String(h.folio || "")] || (I.mfLots || {})[mfKey(h.name)];
      if (!L || (h.lots && h.lots.some((l) => l.d))) continue;
      const lots: IndLot[] = L.map((l) => ({ ...l }));
      const got = lots.reduce((s, l) => s + l.q, 0);
      if (h.units - got > 0.01) {
        const known = lots.reduce((s, l) => s + l.q * (l.p || 0), 0),
          rest = h.units - got;
        lots.unshift({ d: null, q: rest, p: h.cost != null ? Math.max(0, (h.cost - known) / rest) : null });
      }
      h.lots = lots;
    }
  // share purchases from a broker's per-stock breakdown (e.g. Zerodha IPO allotments)
  for (const h of out)
    if (h.type !== "mf" && h.type !== "bond") {
      const L = (I.stLots || {})[h.isin + "|" + h.acct];
      if (!L) continue;
      if (h.lots && h.lots.some((l) => l.d)) {
        // order history covers part: use the screenshot only for the undated units
        const und = h.lots.filter((l) => !l.d),
          need0 = und.reduce((s, l) => s + l.q, 0);
        if (need0 < 1e-6) continue;
        const have = new Set(h.lots.filter((l) => l.d).map((l) => l.d));
        let need = need0;
        const add: IndLot[] = [];
        for (const l of L) {
          if (have.has(l.d) || need < 1e-6) continue;
          const t = Math.min(l.q, need);
          add.push({ ...l, q: t });
          need -= t;
        }
        h.lots = [...h.lots.filter((l) => l.d), ...add, ...(need > 1e-6 ? [{ d: null, q: need, p: und[0].p }] : [])].sort((x, y) =>
          String(x.d || "").localeCompare(String(y.d || "")),
        );
        continue;
      }
      const lots: IndLot[] = L.map((l) => ({ ...l })),
        got = lots.reduce((s, l) => s + l.q, 0);
      if (h.units - got > 1e-6) lots.unshift({ d: null, q: h.units - got, p: null });
      h.lots = lots;
    }
  for (const h of out)
    if (h.type === "mf" && /ELSS|TAX SAVER|LONG TERM EQUITY|TAX ?SAVING/i.test(h.name + " " + (h.sub || ""))) h.elss = true;
  // dividends
  if (I.divs)
    for (const h of out) {
      const ds = I.divs.filter(
        (x) => (h.nse && x.sym === h.nse.toUpperCase() && (!x.acct || x.acct === h.acct)) || (x.isin && x.isin === h.isin),
      );
      if (ds.length) h.divs = ds;
    }
  // buy prices read from a broker screenshot (e.g. INDstocks), for holdings no report covers
  for (const h of out) {
    const sc = (I.shotCost || {})[h.isin + "|" + h.acct];
    if (h.cost == null && sc && sc.units > 0) {
      h.avg = sc.avg;
      h.cost = sc.avg * h.units;
      h.costSrc = sc.src;
    }
  }
  return out;
}

function fifoLots(orders: OrderRow[]): { d: ISODate; q: number; p: number }[] {
  const lots: { d: ISODate; q: number; p: number }[] = [];
  for (const o of orders.slice().sort((a, b) => a.d.localeCompare(b.d) || b.s - a.s)) {
    if (o.s > 0) lots.push({ d: o.d, q: o.q, p: o.v / o.q });
    else {
      let r = o.q;
      while (r > 1e-6 && lots.length) {
        const l = lots[0],
          t = Math.min(l.q, r);
        l.q -= t;
        r -= t;
        if (l.q <= 1e-6) lots.shift();
      }
    }
  }
  return lots;
}
function attachLots(out: IndHolding[], src: IndiaSources) {
  if (src.grStO) {
    const by: Record<string, OrderRow[]> = {};
    for (const o of src.grStO.rows) (by[o.isin || ""] = by[o.isin || ""] || []).push(o);
    for (const h of out.filter((x) => x.acct === "Groww" && x.type !== "mf" && by[x.isin])) {
      const lots: IndLot[] = fifoLots(by[h.isin]);
      let got = lots.reduce((a, l) => a + l.q, 0);
      while (got > h.units + 1e-6 && lots.length) {
        const l = lots[0],
          t = Math.min(l.q, got - h.units);
        l.q -= t;
        got -= t;
        if (l.q <= 1e-6) lots.shift();
      }
      if (h.units - got > 1e-6) {
        const known = lots.reduce((a, l) => a + l.q * (l.p || 0), 0),
          rest = h.units - got;
        lots.unshift({ d: null, q: rest, p: h.cost != null ? Math.max(0, (h.cost - known) / rest) : null });
      }
      h.lots = lots;
    }
  }
  if (src.grMFO) {
    const by: Record<string, OrderRow[]> = {};
    for (const o of src.grMFO.rows) (by[nameKey(o.n)] = by[nameKey(o.n)] || []).push(o);
    const groups: Record<string, IndHolding[]> = {};
    for (const h of out.filter((x) => x.type === "mf" && x.mfName)) (groups[nameKey(h.mfName!)] = groups[nameKey(h.mfName!)] || []).push(h);
    for (const [k, hs] of Object.entries(groups)) {
      const ok = Object.keys(by).find((b) => b === k || b.startsWith(k) || k.startsWith(b));
      if (!ok) continue;
      const lots = fifoLots(by[ok]),
        tot = hs.reduce((a, h) => a + h.units, 0);
      let got = lots.reduce((a, l) => a + l.q, 0);
      while (got > tot + 0.05 && lots.length) {
        const l = lots[0],
          t = Math.min(l.q, got - tot);
        l.q -= t;
        got -= t;
        if (l.q <= 1e-6) lots.shift();
      }
      // Groww-sourced folios take the dated lots first; the rest stays undated
      for (const h of hs.sort((a, b) => (a.acct === "Groww" ? -1 : 1) - (b.acct === "Groww" ? -1 : 1))) {
        const mine: IndLot[] = [];
        let need = h.units;
        while (need > 0.01 && lots.length) {
          const l = lots[0],
            t = Math.min(l.q, need);
          mine.push({ d: l.d, q: t, p: l.p });
          l.q -= t;
          need -= t;
          if (l.q <= 0.01) lots.shift();
        }
        if (need > 0.01) mine.unshift({ d: null, q: need, p: null });
        h.lots = mine;
      }
    }
  }
}

/* ---------- India capital-gains rules (2026) ----------
   Listed shares, equity & arbitrage funds, ETFs: long-term after 12 months, 12.5% above ₹1.25 lakh a year.
   Gold / silver / international funds of funds: long-term after 24 months, 12.5%. Debt funds bought after Apr 2023: always slab rate. */
export interface TaxRule {
  months: number | null;
  label: string;
}
export function inRule(h: IndHolding): TaxRule {
  if (h.type === "mf" && h.cls === "Debt" && !/ARBITRAGE/i.test((h.sub || "") + " " + h.name))
    return { months: null, label: "Slab rate (debt fund)" };
  if (h.type === "mf" && (h.cls === "Gold & silver" || h.cls === "International")) return { months: 24, label: "24 months" };
  if (h.type === "bond") return { months: 12, label: "12 months (listed bond, interest taxed yearly)" };
  return { months: 12, label: "12 months" };
}
export const stRate = (rule: TaxRule) => (rule.months === 24 ? "your slab rate" : "20%");
export interface TaxStatus {
  rule: TaxRule;
  lt: number;
  st: number;
  unk: number;
  ltG: number;
  stG: number;
  next: ISODate | null;
}
export function inTax(h: IndHolding, curPx: number, today: ISODate = TODAY()): TaxStatus {
  const rule = inRule(h),
    out: TaxStatus = { rule, lt: 0, st: 0, unk: 0, ltG: 0, stG: 0, next: null };
  if (!h.lots || !rule.months) return out;
  for (const l of h.lots) {
    const g = l.p != null ? (curPx - l.p) * l.q : null;
    if (!l.d) {
      out.unk += l.q;
      continue;
    }
    const from = addMonths(l.d, rule.months);
    if (from <= today) {
      out.lt += l.q;
      out.ltG += g || 0;
    } else {
      out.st += l.q;
      out.stG += g || 0;
      if (!out.next || from < out.next) out.next = from;
    }
  }
  return out;
}
export const bondMat = (h: IndHolding): ISODate | null =>
  h.bond?.mat ||
  (() => {
    const m = String(h.name || "").match(/\b(\d{2})(\d{2})(20\d{2})\b/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
  })();
export function taxExplain(h: IndHolding, rule: TaxRule): string {
  if (h.type === "bond")
    return "Interest is added to your income and taxed at your slab rate every year; 10% TDS is already deducted from each payout and counts towards that tax. If you hold to maturity you simply get the face value back. If you sell on the exchange before maturity, the gain is long-term after 12 months (12.5%) and taxed at your slab rate before that.";
  if (h.elss)
    return "ELSS (tax-saver) fund: each purchase is locked in for 3 years and can't be sold before then. After that, gains are long-term (held over 12 months): taxed at 12.5%, with the first ₹1.25 lakh of long-term gains in a financial year tax-free. Purchases count towards the ₹1.5 lakh Section 80C deduction only under the old tax regime.";
  if (!rule.months)
    return "Debt fund bought after April 2023: gains are always added to your income and taxed at your slab rate, however long you hold.";
  if (rule.months === 24)
    return "Gold, silver and international funds of funds: units held more than 24 months are long-term (12.5% on gains). Sold earlier, gains are taxed at your slab rate.";
  return "Units held more than 12 months are long-term: gains are taxed at 12.5%, and the first ₹1.25 lakh of long-term gains in a financial year (across all your holdings) is tax-free. Units held 12 months or less are short-term: gains are taxed at 20%. Losses can be set off against gains. When you sell, the oldest units go first.";
}

/* gains already booked this financial year (from Groww orders, FIFO) */
function inRealised(I: IndiaState, H: IndHolding[]) {
  const src = I.src || {},
    fy = fyStart();
  let lt = 0,
    st = 0,
    n = 0;
  const run = (orders: OrderRow[], months: number) => {
    const lots: { d: ISODate; q: number; p: number }[] = [];
    for (const o of orders.slice().sort((a, b) => a.d.localeCompare(b.d) || b.s - a.s)) {
      if (o.s > 0) {
        lots.push({ d: o.d, q: o.q, p: o.v / o.q });
        continue;
      }
      let rq = o.q;
      const px = o.v / o.q;
      while (rq > 1e-6 && lots.length) {
        const l = lots[0],
          t = Math.min(l.q, rq);
        if (o.d >= fy) {
          const g = (px - l.p) * t;
          if (addMonths(l.d, months) <= o.d) lt += g;
          else st += g;
          n++;
        }
        l.q -= t;
        rq -= t;
        if (l.q <= 1e-6) lots.shift();
      }
    }
  };
  if (src.grStO) {
    const by: Record<string, OrderRow[]> = {};
    for (const o of src.grStO.rows) (by[o.isin || ""] = by[o.isin || ""] || []).push(o);
    for (const k in by) run(by[k], 12);
  }
  if (src.grMFO) {
    const by: Record<string, OrderRow[]> = {};
    for (const o of src.grMFO.rows) (by[nameKey(o.n)] = by[nameKey(o.n)] || []).push(o);
    for (const k in by) {
      const h = H.find((x) => x.mfName && nameKey(x.mfName) === k);
      const months = h ? inRule(h).months : /GOLD|SILVER|NASDAQ|FANG|GLOBAL/.test(k) ? 24 : 12;
      if (months) run(by[k], months);
    }
  }
  return { lt, st, n, has: !!(src.grStO || src.grMFO) };
}
export interface TaxSummary {
  ltG: number;
  stG: number;
  ltPos: number;
  ltNeg: number;
  dated: number;
  gainers: { name: string; g: number }[];
  upcoming: { name: string; from: ISODate; q: number; g: number | null }[];
  real: { lt: number; st: number; n: number; has: boolean };
}
export function inTaxSummary(H: IndHolding[], I: IndiaState, today: ISODate = TODAY()): TaxSummary {
  let ltG = 0,
    stG = 0,
    dated = 0,
    ltPos = 0,
    ltNeg = 0;
  const upcoming: TaxSummary["upcoming"] = [],
    gainers: TaxSummary["gainers"] = [];
  for (const h of H) {
    const px = indPrice(h, I),
      t = inTax(h, px, today);
    if (!t.rule.months || !h.lots || h.type === "bond") continue; // bonds: see the bonds card (their value includes accrued interest)
    dated++;
    ltG += t.ltG;
    stG += t.stG;
    if (t.ltG > 0) {
      ltPos += t.ltG;
      gainers.push({ name: h.name, g: t.ltG });
    } else ltNeg += t.ltG;
    for (const l of h.lots)
      if (l.d) {
        const from = addMonths(l.d, t.rule.months);
        if (from > today) upcoming.push({ name: h.name, from, q: l.q, g: l.p != null ? (px - l.p) * l.q : null });
      }
  }
  upcoming.sort((a, b) => a.from.localeCompare(b.from));
  gainers.sort((a, b) => b.g - a.g);
  return { ltG, stG, ltPos, ltNeg, gainers: gainers.slice(0, 4), dated, upcoming: upcoming.slice(0, 6), real: inRealised(I, H) };
}

/* ---------- bonds: income, payouts and money coming back ---------- */
export function bondFlowsFor(h: IndHolding, I: IndiaState, today: ISODate = TODAY()) {
  const s = I.src || {};
  let rs: BondFlow[] = [];
  if (h.bond?.src === "IndiaBonds" && s.ibcf) rs = s.ibcf.rows.filter((r) => r.isin === h.isin);
  else if (s.wint)
    rs = [...(s.wint.paid || []).filter((r) => r.isin === h.isin), ...(s.wint.flows || []).filter((r) => r.isin === h.isin && r.d > today)];
  rs = rs.slice().sort((x, y) => x.d.localeCompare(y.d));
  return { past: rs.filter((r) => r.d <= today), fut: rs.filter((r) => r.d > today) };
}
export interface BondSummary {
  n: number;
  val: number;
  inv: number;
  ytm: number;
  srcLab: string;
  intN: number;
  intG: number;
  tds: number;
  fyG: number;
  fyT: number;
  yInt: number;
  yPrin: number;
  months: { ym: string; int: number; prin: number }[];
  back: BondFlow[];
  notCovered: IndHolding[];
  anyIB: boolean;
}
export function bondSummary(H: IndHolding[], I: IndiaState, today: ISODate = TODAY()): BondSummary | null {
  const src = I.src || {},
    W = src.wint,
    IB = src.ibcf,
    B = H.filter((h) => h.bond);
  if (!B.length || (!W && !IB)) return null;
  const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);
  const val = sum(B, (h) => h.value),
    inv = sum(B, (h) => h.cost || 0);
  const wB = B.filter((h) => h.bond!.src !== "IndiaBonds"),
    iB = B.filter((h) => h.bond!.src === "IndiaBonds"),
    wVal = sum(wB, (h) => h.value);
  const wY = W && wB.length === W.rows.length && W.ytmAll ? W.ytmAll : wVal ? sum(wB, (h) => h.bond!.ytm * h.value) / wVal : 0;
  const ytm = (wY * wVal + sum(iB, (h) => h.bond!.ytm * h.value)) / val;
  const ibRows = IB ? IB.rows.filter((r) => iB.some((h) => h.isin === r.isin)) : [];
  const paid = [...((W && W.paid) || []), ...ibRows.filter((r) => r.d <= today)];
  const flows = [...((W && W.flows) || []), ...ibRows.filter((r) => r.d > today)].sort((x, y) => x.d.localeCompare(y.d));
  const srcLab = [W ? `Wint Wealth (${fmtDate(W.asOf)})` : "", IB && iB.length ? `IndiaBonds (${fmtDate(IB.asOf)})` : ""]
    .filter(Boolean)
    .join(" + ");
  const fy = fyStart(today),
    fyPaid = paid.filter((p) => p.d >= fy && p.d <= today);
  const fut = flows.filter((f) => f.d >= today),
    end = addMonths(today, 12),
    yr = fut.filter((f) => f.d < end);
  const months: BondSummary["months"] = [];
  let ym = today.slice(0, 7);
  for (let i = 0; i < 12; i++) {
    months.push({ ym, int: 0, prin: 0 });
    ym = nextYm(ym);
  }
  for (const f of fut) {
    const m = months.find((x) => x.ym === f.d.slice(0, 7));
    if (m) {
      m.int += f.int;
      m.prin += f.prin;
    }
  }
  return {
    n: B.length,
    val,
    inv,
    ytm,
    srcLab,
    intN: sum(B, (h) => h.bond!.intN),
    intG: sum(B, (h) => h.bond!.intG),
    tds: sum(B, (h) => h.bond!.tds),
    fyG: sum(fyPaid, (p) => p.intG),
    fyT: sum(fyPaid, (p) => p.tds || 0),
    yInt: sum(yr, (f) => f.int),
    yPrin: sum(yr, (f) => f.prin),
    months,
    back: fut.filter((f) => f.prin > 0).slice(0, 6),
    notCovered: H.filter((h) => h.type === "bond" && !h.bond),
    anyIB: iB.length > 0,
  };
}

/* ---------- the list the daily price job reads ---------- */
export function buildWatch(I: IndiaState) {
  I.px = I.px || {};
  for (const h of I.holdings) {
    const k = priceKey(h);
    if (h.lp && h.lpAt && (!I.px[k] || I.px[k].at < h.lpAt)) I.px[k] = { p: h.lp, at: h.lpAt };
  }
  const eff = indHoldings(I),
    seen = new Set<string>(),
    old = Object.fromEntries((I.watch || []).map((w) => [w.key, w]));
  I.watch = [];
  for (const h of eff) {
    if (h.type === "bond") continue;
    const key = priceKey(h);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const o = old[key] || {};
    let isin: string | null = h.isin || null,
      code = o.mfcode || h.mfcode || null;
    if (h.type !== "stock" && h.type !== "invit" && !isin) {
      const k = mfKey(h.name),
        c = I.holdings.find(
          (x) =>
            (x.type === "mf" || x.type === "etf") && (mfKey(x.name) === k || mfKey(x.name).startsWith(k) || k.startsWith(mfKey(x.name))),
        );
      if (c) {
        isin = c.isin;
        code = code || c.mfcode || null;
      }
    }
    I.watch.push(
      h.type === "stock" || h.type === "invit"
        ? { key, kind: "nse", name: h.name, isin: h.isin, nse: o.nse || h.nse || IN_NSE[h.isin] || null }
        : { key, kind: "mf", name: h.mfName || h.name, isin, mfcode: code },
    );
  }
}
/** read a statement (CAS) into the document, keeping prices and codes learnt earlier */
export function applyCAS(state: Portfolio, cas: CasResult): string[] {
  const prev = state.india,
    old: Record<string, CasHolding> = {};
  for (const h of prev?.holdings || []) old[h.isin + "|" + h.acct] = h;
  const holdings: CasHolding[] = cas.holdings.map(({ raw: _raw, ...h }) => {
    const o = old[h.isin + "|" + h.acct],
      keep: Partial<CasHolding> = {};
    if (o) {
      if (o.nse != null) keep.nse = o.nse;
      if (o.mfcode != null) keep.mfcode = o.mfcode;
      if (o.lp != null) keep.lp = o.lp;
      if (o.lpAt != null) keep.lpAt = o.lpAt;
    }
    if (h.cost == null && o?.avg) {
      keep.avg = o.avg;
      keep.cost = o.avg * h.units;
      keep.costSrc = o.costSrc;
    } else if (h.cost == null && o?.cost && o.units) {
      keep.cost = o.cost * (h.units / o.units);
      keep.costSrc = o.costSrc;
    }
    if (!keep.nse && IN_NSE[h.isin]) keep.nse = IN_NSE[h.isin];
    return Object.assign(h, keep);
  });
  state.india = {
    asOf: cas.asOf || TODAY(),
    total: cas.total || cas.holdings.reduce((a, h) => a + h.value, 0),
    accounts: cas.accounts,
    mix: cas.mix,
    history: cas.history,
    pricedAt: prev?.pricedAt,
    holdings,
  };
  if (prev?.src) state.india.src = prev.src;
  if (prev?.px) state.india.px = prev.px;
  if (prev?.watch) state.india.watch = prev.watch;
  for (const k of ["via", "bondCost", "shotCost", "mfLots", "stLots", "divs"] as const)
    if (prev?.[k]) (state.india as unknown as Record<string, unknown>)[k] = prev[k];
  buildWatch(state.india);
  noteImport(state, { kind: "cas", period: cas.asOf, count: cas.holdings.length, total: state.india.total });
  const ch = [`India total ${inr(state.india.total)} as of ${fmtDate(cas.asOf)} across ${cas.holdings.length} holdings`];
  if (prev?.total)
    ch.push(`Change since ${fmtDate(prev.asOf)}: ${sgn(state.india.total - prev.total)}${inr(Math.abs(state.india.total - prev.total))}`);
  return ch;
}
