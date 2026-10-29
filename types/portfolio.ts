/* The saved document: one JSON row per person in Supabase (public.portfolio.data).
   Every field comes from uploaded statements or the daily price refresh; nothing here is typed in by hand. */

export type ISODate = string; // yyyy-mm-dd
export type YearMonth = string; // yyyy-mm

/* ---------- abroad sleeve (INDmoney: US and London-listed funds) ---------- */
export type Plan = "core" | "keep" | "legacy";
export type Bucket = "US core" | "US tech" | "Japan" | "Copper" | "Satellite" | "Emerging" | (string & {});

export interface Lot {
  d: ISODate;
  q: number;
  p: number;
  src?: string;
  fx?: number;
}
export interface Holding {
  sym: string;
  name: string;
  bucket: Bucket;
  plan: Plan;
  price: number | null;
  priceAt: ISODate | null;
  lots: Lot[];
  reportQty?: number;
  reportAt?: ISODate;
}
export interface Sale {
  d: ISODate;
  sym: string;
  q: number;
  price: number | null;
  cost: number;
  lots: { d: ISODate; q: number; p: number }[];
  est?: boolean;
}
export interface Target {
  bucket: Bucket;
  w: number;
  buy: string;
}
export interface ImportRecord {
  kind: string;
  period?: string | null;
  count?: number;
  total?: number | null;
  file?: string;
  at?: string;
  doc?: string;
  income?: number;
  withheld?: number;
}
export interface Signal {
  ref?: string;
  price: number;
  hi52: number;
  lo52: number;
  pe?: number;
  at?: string;
}
export interface Goal {
  amt: number;
  year: number;
  extra?: number;
}
export interface Settings {
  monthlyInr: number;
  fx: number;
  fxAt: ISODate | null;
  feePct: number;
  slab: number;
  cess: number;
  fxHistory?: Record<ISODate, number>;
  signals?: Record<string, Signal>;
  refreshedAt?: string;
  startedOn?: ISODate;
  goal?: Goal;
  age?: number;
  ageYear?: number;
}
export interface LogLine {
  d: ISODate;
  text: string;
}
export interface PinLock {
  salt: string;
  iter: number;
  hash: string;
  set: ISODate;
}

/* ---------- India (CDSL / NSDL statement plus broker reports) ---------- */
export type IndType = "stock" | "mf" | "etf" | "bond" | "invit";
export type IndClass = "Equity" | "Hybrid" | "Debt" | "Gold & silver" | "International" | "Other";

export interface IndLot {
  d: ISODate | null;
  q: number;
  p: number | null;
  tag?: string | null;
  x?: number;
}
export interface BondInfo {
  ytm: number;
  ytmEst?: boolean;
  mat: ISODate | null;
  intN: number;
  intG: number;
  tds: number;
  upInt: number;
  upPrin: number;
  pType?: string;
  iType?: string;
  src?: string;
}
export interface Dividend {
  sym: string;
  d: ISODate;
  q: number | null;
  dps: number | null;
  amt: number;
  acct?: string;
  isin?: string;
}
/** a holding as read from the statement (CAS) */
export interface CasHolding {
  isin: string;
  name: string;
  type: IndType;
  cls: IndClass;
  units: number;
  price: number;
  value: number;
  cost?: number;
  gain?: number;
  avg?: number;
  costSrc?: string;
  acct: string;
  depo: string;
  folio?: string;
  nse?: string;
  mfcode?: string;
  lp?: number;
  lpAt?: ISODate;
}
/** a holding as the app shows it: statement baseline, replaced or enriched by fresher broker reports */
export interface IndHolding extends CasHolding {
  key: string;
  from: string;
  asOf?: ISODate;
  sub?: string;
  mfName?: string;
  casName?: string;
  lots?: IndLot[];
  bond?: BondInfo;
  via?: string;
  coupon?: number | null;
  ytmBuy?: number;
  elss?: boolean;
  divs?: Dividend[];
}
export interface WatchItem {
  key: string;
  kind: "nse" | "mf";
  name: string;
  isin: string | null;
  nse?: string | null;
  mfcode?: string | null;
}
export interface BondFlow {
  d: ISODate;
  isin: string;
  n: string;
  bank: number;
  prin: number;
  int: number;
  intG: number;
  tds?: number;
  full?: boolean;
  freq?: string;
}
export interface WintRow {
  isin: string;
  name: string;
  mat: ISODate | null;
  units: number;
  value: number;
  invested: number;
  upInt: number;
  upPrin: number;
  prinRep: number;
  intG: number;
  intN: number;
  tds: number;
  ytm: number;
  pType: string;
  iType: string;
  lots: { d: ISODate; q: number; p: number; x?: number }[];
}
export interface GrowwStockRow {
  isin: string;
  name: string;
  q: number;
  avg: number;
  close: number;
}
export interface ZerodhaRow extends GrowwStockRow {
  mf: boolean;
}
export interface GrowwMfRow {
  name: string;
  amc: string;
  cat: string;
  sub: string;
  folio: string;
  src: string;
  units: number;
  invested: number;
  value: number;
}
export interface OrderRow {
  isin?: string;
  n: string;
  s: 1 | -1;
  q: number;
  v: number;
  d: ISODate;
}
export interface IbBondRow {
  isin: string;
  name: string;
  sec: string;
  coupon: number | null;
  q: number;
  amt: number;
  prin: number;
  ai: number | null;
  d: ISODate;
  mat: ISODate | null;
}

export interface IndiaSources {
  grSt?: { asOf: ISODate; rows: GrowwStockRow[]; file?: string };
  zd?: { asOf: ISODate; rows: ZerodhaRow[]; file?: string };
  grMF?: { asOf: ISODate; rows: GrowwMfRow[]; file?: string };
  grStO?: { asOf: ISODate; rows: OrderRow[]; file?: string };
  grMFO?: { asOf: ISODate; rows: OrderRow[]; file?: string };
  wint?: { asOf: ISODate; rows: WintRow[]; file?: string; flows: BondFlow[]; paid: BondFlow[]; ytmAll: number };
  ib?: { asOf: ISODate; rows: IbBondRow[]; file?: string };
  ibcf?: { asOf: ISODate; rows: BondFlow[]; file?: string };
}
export interface BondCost {
  cost: number;
  prin?: number;
  units: number;
  lots?: { d: ISODate; q: number; p: number }[];
  coupon?: number | null;
  mat?: ISODate | null;
  src?: string;
  at: ISODate;
  d?: ISODate | null;
  ytm?: number | null;
}
export interface IndiaState {
  asOf: ISODate;
  total: number;
  accounts: { name: string; value: number; n: number }[];
  mix: Record<string, number>;
  history: { m: YearMonth; v: number }[];
  pricedAt?: ISODate;
  holdings: CasHolding[];
  src?: IndiaSources;
  px?: Record<string, { p: number; at: ISODate }>;
  watch?: WatchItem[];
  via?: Record<string, string>;
  bondCost?: Record<string, BondCost>;
  shotCost?: Record<string, { avg: number; units: number; src: string; at: ISODate }>;
  mfLots?: Record<string, { d: ISODate; q: number; p: number | null }[]>;
  stLots?: Record<string, { d: ISODate; q: number; p: number | null; tag?: string | null }[]>;
  divs?: Dividend[];
}

/* ---------- the whole document ---------- */
export interface Portfolio {
  v: number;
  settings: Settings;
  targets: Target[];
  holdings: Holding[];
  sales: Sale[];
  seenTx: string[];
  checklist: Record<string, Record<string, boolean>>;
  log: LogLine[];
  imports: ImportRecord[];
  updatedAt: string | null;
  india?: IndiaState;
  /** month-end prices {key: {"yyyy-mm": price | null}}, filled by the nightly price-history job */
  pxm?: Record<string, Record<YearMonth, number | null>>;
  lock?: PinLock;
}

/** a cell read from a spreadsheet by SheetJS */
export type Cell = string | number | boolean | Date | null | undefined;
export type Sheet = Cell[][];
