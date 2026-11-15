/* Shared public market data (Supabase tables market_class, market_fund, market_stock), filled by the market-data
   function. Nothing in here is about a person. */

export type Cap = "L" | "M" | "S";

/** NSE index lists: industry and market-cap band (L = Nifty 100, M = Midcap 150, S = rest of the Total Market) */
export interface MarketClass {
  isin: string;
  symbol: string | null;
  name: string;
  industry: string | null;
  cap: Cap | null;
}

/** one line of a fund's disclosed portfolio */
export interface FundLine {
  /** company or instrument name */
  n: string;
  /** ISIN when matched to the NSE lists */
  i: string | null;
  /** Groww's stock id (matches a directly held share's search_id) */
  g?: string | null;
  /** sector (NSE industry names) for shares */
  s: string | null;
  /** % of the fund */
  w: number;
  /** E Indian share, F foreign share, D debt, C cash, G gold/silver, O other (incl. other funds) */
  t: "E" | "F" | "D" | "C" | "G" | "O";
  /** market-cap band for Indian shares (null when not on the NSE lists), F for foreign */
  c: Cap | "F" | null;
}

export interface FundInfo {
  cat: string | null;
  sub: string | null;
  plan: string | null;
  /** expense ratio of the plan you hold (%) */
  er: number | null;
  /** expense ratio of the direct plan (%) */
  der: number | null;
  /** fund size, ₹ Cr */
  aum: number | null;
  risk: string | null;
  bench: string | null;
  r1: number | null;
  r3: number | null;
  r5: number | null;
  /** category average returns */
  c1: number | null;
  c3: number | null;
  c5: number | null;
  rank3: [number, number] | null;
  rank5: [number, number] | null;
  alpha: number | null;
  beta: number | null;
  sharpe: number | null;
  sd: number | null;
  launch: string | null;
  turnover: number | null;
  name: string | null;
  /** for an ETF: the index fund on the same index whose holdings and returns stand in for it */
  proxy?: string | null;
}

export interface MarketFund {
  isin: string;
  search_id: string | null;
  name: string | null;
  info: FundInfo | null;
  holdings: FundLine[] | null;
  as_of: string | null;
  fetched_at: string | null;
  miss: string | null;
}

export interface StockInfo {
  /** market cap, ₹ Cr */
  mcap: number | null;
  pe: number | null;
  /** industry P/E */
  ipe: number | null;
  pb: number | null;
  /** return on equity, % */
  roe: number | null;
  de: number | null;
  /** dividend yield, % */
  dy: number | null;
  eps: number | null;
  /** revenue and profit growth as fractions (0.12 = 12%): last year, and 3-year yearly average */
  rev1: number | null;
  rev3: number | null;
  pr1: number | null;
  pr3: number | null;
  /** latest yearly profit ÷ revenue */
  margin: number | null;
  loss: boolean | null;
  /** promoter holding now and about a year ago, % */
  prom: number | null;
  promYr: number | null;
  cap: Cap | null;
  groww: string | null;
}

export interface MarketStock {
  isin: string;
  search_id: string | null;
  nse: string | null;
  name: string | null;
  industry: string | null;
  info: StockInfo | null;
  fetched_at: string | null;
  miss: string | null;
}

export interface MarketData {
  funds: Record<string, MarketFund>;
  stocks: Record<string, MarketStock>;
  klass: Record<string, MarketClass>;
}
