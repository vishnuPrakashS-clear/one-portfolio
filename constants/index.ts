/* Fixed content: the four categories and their colours, return assumptions, navigation, checklist and copy used across screens. */
import type { IndType } from "@/types/portfolio";

export type CatId = "funds" | "stocks" | "bonds" | "abroad";

export interface Category {
  id: CatId;
  name: string;
  short: string;
  /** the category colour on planets, tabs, charts and dots */
  hex: string;
  /** a second tone for planet bands and gradients */
  hex2: string;
  types?: IndType[];
  /** yearly return assumptions: cautious, likely, strong */
  rates: [number, number, number];
  route: string;
  what: string;
}

export const CATEGORIES: Record<CatId, Category> = {
  funds: {
    id: "funds",
    name: "Mutual funds",
    short: "Funds",
    hex: "#c084fc",
    hex2: "#7c3aed",
    types: ["mf"],
    rates: [0.08, 0.11, 0.14],
    route: "/funds",
    what: "equity, hybrid and debt funds, SIPs",
  },
  stocks: {
    id: "stocks",
    name: "Stocks",
    short: "Stocks",
    hex: "#22d3ee",
    hex2: "#0e7490",
    types: ["stock", "etf", "invit"],
    rates: [0.07, 0.12, 0.16],
    route: "/stocks",
    what: "shares, ETFs and InvITs",
  },
  bonds: {
    id: "bonds",
    name: "Bonds",
    short: "Bonds",
    hex: "#fbbf24",
    hex2: "#b45309",
    types: ["bond"],
    rates: [0.065, 0.08, 0.095],
    route: "/bonds",
    what: "bonds and NCDs",
  },
  abroad: {
    id: "abroad",
    name: "Abroad",
    short: "Abroad",
    hex: "#fb7185",
    hex2: "#be123c",
    rates: [0.07, 0.11, 0.14],
    route: "/abroad",
    what: "US, Japan and London funds",
  },
};
export const CAT_ORDER: CatId[] = ["funds", "stocks", "bonds", "abroad"];
export const RATE_NAMES = ["Cautious", "Likely", "Strong"] as const;
export const GOAL_COLOR = "#34d399";

export interface NavItem {
  href: string;
  label: string;
  short: string;
  color?: string;
  more?: boolean;
  moreOnPhone?: boolean;
}
export const NAV: NavItem[] = [
  { href: "/", label: "Home", short: "Home" },
  { href: "/funds", label: "Mutual funds", short: "Funds", color: CATEGORIES.funds.hex },
  { href: "/stocks", label: "Stocks", short: "Stocks", color: CATEGORIES.stocks.hex },
  { href: "/bonds", label: "Bonds", short: "Bonds", color: CATEGORIES.bonds.hex },
  { href: "/abroad", label: "Abroad", short: "Abroad", color: CATEGORIES.abroad.hex, moreOnPhone: true },
  { href: "/goals", label: "Goals", short: "Goals", color: GOAL_COLOR },
  { href: "/plan", label: "Monthly plan", short: "Plan", more: true },
  { href: "/tax", label: "Sell & tax", short: "Tax", more: true },
  { href: "/checklist", label: "Checklist", short: "Checklist", more: true },
  { href: "/ask", label: "Ask", short: "Ask", more: true },
  { href: "/upload", label: "Upload", short: "Upload", more: true },
];

/** goal amounts and extra monthly amounts offered as chips (no typing) */
export const GOAL_AMOUNTS = [1e6, 2.5e6, 5e6, 1e7, 2e7, 5e7];
export const EXTRA_MONTHLY = [0, 5000, 10000, 25000, 50000];
export const PROJECTION_YEARS = [5, 10, 15, 20];

export const IND_CLASS_COLOR: Record<string, string> = {
  Equity: "#c084fc",
  Hybrid: "#f472b6",
  Debt: "#fbbf24",
  "Gold & silver": "#facc15",
  International: "#fb7185",
  Other: "#94a3b8",
};
export const BUCKET_COLOR: Record<string, string> = {
  "US core": "#38bdf8",
  "US tech": "#2dd4bf",
  Japan: "#fb7185",
  Copper: "#fb923c",
  Satellite: "#facc15",
  Emerging: "#a99fd0",
};
export const TYPE_NAME: Record<string, string> = { stock: "Share", mf: "Mutual fund", etf: "ETF", bond: "Bond / NCD", invit: "InvIT" };

export const BUY_WHY: Record<string, string> = {
  "LSE~CSPX": "The 500 biggest US companies. The core of the sleeve: 0.07% a year and dividends reinvested.",
  "LSE~CNDX": "The 100 biggest Nasdaq companies, mostly tech. Your single US stocks already add tech, so it gets less.",
  "LSE~IJPA": "About 1,000 Japanese companies. Different economy, different currency: the heart of the backup.",
  "LSE~CPPR": "Pure-play copper miners: grids, EVs and data centres need copper. Volatile, so capped at 10%.",
  "LSE~COPX":
    "Copper miners: grids, EVs and data centres need copper. Volatile, so capped at 10%. Whole shares only: 1 share in a month when copper is below target and the price isn't near its 1-year high.",
  TSM: "Taiwan Semiconductor. Paused while it is over 10% of the sleeve.",
};

export const UPLOAD_KIND: Record<string, string> = {
  cas: "CDSL / NSDL CAS (India)",
  "gr-stocks": "Groww stocks holdings",
  "zd-hold": "Zerodha holdings",
  "gr-mf": "Groww mutual fund holdings",
  "gr-st-orders": "Groww stock order history",
  "gr-mf-orders": "Groww MF order history",
  wint: "Wint Wealth master report (bonds)",
  report: "Holdings Report",
  statement: "Account Statement",
  transactions: "Order / Transactions Report",
  screenshot: "Order screenshot",
  "bond-shot": "Bond screenshot (India)",
  "hold-shot": "Holdings screenshot (India)",
  "ib-bonds": "IndiaBonds transaction statement",
  "ib-cf": "IndiaBonds interest / cashflow report",
  "zd-div": "Zerodha dividend report",
  divs: "Dividends (India)",
  "mf-lots": "Fund purchases (e.g. ELSS statement)",
  "1042s": "Form 1042-S",
};

export const CHECKLIST = [
  { m: 0, id: "jan-import", text: "Upload December's statement and a fresh holdings report" },
  { m: 0, id: "jan-rebal", text: "Rebalance check: look at the monthly plan's targets" },
  { m: 2, id: "mar-harvest", text: "Before 31 Mar: sell anything below cost that you'd book as a loss this year" },
  { m: 2, id: "mar-ltcg", text: "Before 31 Mar: book up to ₹1.25 lakh of Indian long-term gains tax-free" },
  { m: 3, id: "apr-1042", text: "Download Form 1042-S (US tax withheld on dividends) and upload it" },
  { m: 5, id: "jun-pnl", text: "Download INDmoney's tax P&L for the last financial year and upload it" },
  { m: 6, id: "jul-67", text: "File Form 67 (foreign tax credit) before your return" },
  { m: 6, id: "jul-itr", text: "By 31 Jul: file ITR-2 with Schedule FA (Jan–Dec holdings), FSI, TR and CG" },
  { m: 6, id: "jul-rebal", text: "Rebalance check: look at the monthly plan's targets" },
  { m: 11, id: "dec-exit", text: "Before 31 Dec: finish any planned exits so next year's Schedule FA is shorter" },
];

export const ASK_PRESETS = [
  "Will I reach my goal, and what should I change?",
  "What exactly should I buy this month, and why?",
  "Should I sell any holding now?",
  "When is my next tax-saving sell date, and what will I save?",
  "What should I upload next?",
];

export const RANKS: [number, string][] = [
  [0, "Rookie"],
  [3, "Saver"],
  [6, "Investor"],
  [12, "Compounder"],
  [24, "Long-term legend"],
];
