/* Market leaders the plan can suggest: companies that are the only player, one of two, or a clear No. 1 in what they
   do. A strong position isn't a reason to buy at any price, so the plan only puts forward the ones whose numbers are
   good and whose price is fair against their industry today. Keep the symbols in step with LEADERS in
   supabase/functions/market-data/index.ts (a test checks this). */

export interface Leader {
  /** NSE symbol */
  sym: string;
  /** what makes it a leader, in a line */
  why: string;
}

export const LEADERS: Leader[] = [
  { sym: "IRCTC", why: "The only seller of online train tickets and the caterer on Indian Railways" },
  { sym: "CDSL", why: "One of India's two share depositories, holding most demat accounts" },
  { sym: "MCX", why: "India's main commodity exchange, with almost all of its trading" },
  { sym: "IEX", why: "Runs most of India's exchange trading in electricity" },
  { sym: "CAMS", why: "Keeps the records for most of India's mutual fund money" },
  { sym: "KFINTECH", why: "The other big registrar for mutual funds and listed companies" },
  { sym: "BSE", why: "One of India's two stock exchanges" },
  { sym: "HAL", why: "Builds most of India's military aircraft and helicopters" },
  { sym: "BEL", why: "The main maker of radars and defence electronics for India's forces" },
  { sym: "BDL", why: "Makes India's missiles" },
  { sym: "MAZDOCK", why: "Builds submarines and destroyers for the Navy" },
  { sym: "COALINDIA", why: "Mines most of India's coal" },
  { sym: "POWERGRID", why: "Runs most of India's inter-state power lines" },
  { sym: "CONCOR", why: "India's largest rail container operator" },
  { sym: "IRFC", why: "Raises the money for Indian Railways' trains and tracks" },
  { sym: "GAIL", why: "Owns most of India's gas pipelines" },
  { sym: "PETRONET", why: "India's largest importer of liquefied natural gas" },
  { sym: "IGL", why: "The main city gas supplier in Delhi and nearby" },
  { sym: "MGL", why: "The main city gas supplier in Mumbai" },
  { sym: "HINDZINC", why: "India's only large zinc maker, among the world's lowest-cost" },
  { sym: "NMDC", why: "India's largest iron ore miner" },
  { sym: "ITC", why: "Sells most of India's cigarettes; also foods, paper and farm business" },
  { sym: "ASIANPAINT", why: "India's largest paint company" },
  { sym: "PIDILITIND", why: "Fevicol's maker, far ahead in adhesives" },
  { sym: "NAUKRI", why: "Runs Naukri, India's leading job site" },
  { sym: "INDIGO", why: "Flies most of India's domestic air passengers" },
  { sym: "MARUTI", why: "Sells the most cars in India" },
  { sym: "HINDUNILVR", why: "India's largest consumer goods company" },
  { sym: "NESTLEIND", why: "Maggi and Nescafé: leads instant noodles and baby food" },
  { sym: "LICI", why: "Holds most of India's life insurance business" },
  { sym: "ONGC", why: "Produces most of India's crude oil and gas" },
  { sym: "NTPC", why: "India's largest power producer" },
  { sym: "NHPC", why: "India's largest hydropower company" },
  { sym: "POLYCAB", why: "India's largest maker of wires and cables" },
  { sym: "SOLARINDS", why: "India's largest maker of industrial explosives, also supplies defence" },
  { sym: "DIXON", why: "India's largest contract maker of phones and electronics" },
  { sym: "CRISIL", why: "India's largest credit rating agency" },
];
