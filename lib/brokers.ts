/* Indian shares, ETFs and InvITs grouped by the broker that holds them (the demat account in your statements), with the
   numbers a broker's holdings page shows: current value, invested, returns, XIRR and month-end value. */
import { xirr, type CashFlow } from "@/lib/core/xirr";
import { TODAY } from "@/lib/dates";
import type { Model, ModelItem } from "@/lib/model";

export type BrokerId = "groww" | "zerodha" | "indmoney";
export const BROKERS: { id: BrokerId; name: string; accts: string[]; color: string; route: string; note: string }[] = [
  {
    id: "groww",
    name: "Groww",
    accts: ["Groww"],
    color: "#00b386",
    route: "/stocks/groww",
    note: "From your Groww stocks holdings report and order history (purchase dates and prices).",
  },
  {
    id: "zerodha",
    name: "Zerodha",
    accts: ["Zerodha"],
    color: "#387ed1",
    route: "/stocks/zerodha",
    note: "From your Zerodha (Console) holdings and tradebook, or your CDSL/NSDL statement.",
  },
  {
    id: "indmoney",
    name: "INDmoney",
    accts: ["INDstocks", "INDmoney"],
    color: "#e9468f",
    route: "/stocks/indmoney",
    note: "Indian shares in INDmoney's demat (INDstocks), from your CDSL/NSDL statement. Your US stocks are under US stocks.",
  },
];
export const brokerOf = (acct: string) => BROKERS.find((b) => b.accts.includes(acct));
export const acctName = (acct: string) => brokerOf(acct)?.name || acct;

export interface Group {
  items: ModelItem[];
  value: number;
  cost: number;
  known: number;
  gain: number | null;
  gainPct: number | null;
  xirr: number | null;
  since: string | null;
  val: number[];
  inv: number[];
  coverage: number;
}
/** totals for any set of holdings */
export function group(M: Model, items: ModelItem[], today = TODAY()): Group {
  const n = M.months.length;
  const val = new Array(n).fill(0),
    inv = new Array(n).fill(0);
  let value = 0,
    cost = 0,
    known = 0,
    covered = 0;
  const cf: CashFlow[] = [];
  let dated = 0;
  for (const it of items) {
    value += it.value;
    if (it.cost != null) {
      cost += it.cost;
      known += it.value;
    }
    if (it.val && it.inv) {
      covered += it.value;
      for (let i = 0; i < n; i++) {
        val[i] += it.val[i] || 0;
        inv[i] += it.inv[i] || 0;
      }
    }
    const units = it.india?.units || 0,
      price = units ? it.value / units : 0;
    for (const l of it.lots)
      if (l.d && l.p && l.q > 0 && price > 0) {
        cf.push({ d: l.d, v: -l.q * l.p });
        dated += l.q * price;
      }
  }
  cf.sort((a, b) => a.d.localeCompare(b.d));
  const x = cf.length ? xirr([...cf, { d: today, v: dated }]) : null;
  const gain = known ? known - cost : null;
  return {
    items,
    value,
    cost,
    known,
    gain,
    gainPct: gain != null && cost ? gain / cost : null,
    xirr: x,
    since: cf[0]?.d || null,
    val,
    inv,
    coverage: value ? covered / value : 0,
  };
}
/** a broker's Indian shares, ETFs and InvITs */
export const brokerItems = (M: Model, id: BrokerId) => {
  const b = BROKERS.find((x) => x.id === id)!;
  return M.cats.stocks.items.filter((it) => it.india && b.accts.includes(it.india.acct));
};
/** holdings at accounts that aren't one of the brokers above */
export const otherItems = (M: Model) => M.cats.stocks.items.filter((it) => !it.india || !brokerOf(it.india.acct));
