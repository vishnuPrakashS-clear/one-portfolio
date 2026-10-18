/* ===== Core logic: no DOM. Shared by the page and the node test. ===== */
const EPS = 1e-7;
const CATALOG = {
  "LSE~CSPX": { name: "iShares Core S&P 500 UCITS (Acc)", bucket: "US core", plan: "core" },
  "LSE~CNDX": { name: "iShares Nasdaq 100 UCITS (Acc)", bucket: "US tech", plan: "core" },
  "LSE~IJPA": { name: "iShares Core MSCI Japan IMI UCITS (Acc)", bucket: "Japan", plan: "core" },
  "LSE~CPPR": { name: "Sprott Pure Play Copper Miners UCITS (Acc)", bucket: "Copper", plan: "core" },
  "LSE~COPX": { name: "Global X Copper Miners UCITS (Acc)", bucket: "Copper", plan: "core" },
  TSM: { name: "Taiwan Semiconductor (ADR)", bucket: "Satellite", plan: "core" },
  VOO: { name: "Vanguard S&P 500 ETF", bucket: "US core", plan: "keep" },
  VT: { name: "Vanguard Total World ETF", bucket: "US core", plan: "keep" },
  QQQ: { name: "Invesco QQQ (Nasdaq 100)", bucket: "US tech", plan: "keep" },
  EWJ: { name: "iShares MSCI Japan ETF", bucket: "Japan", plan: "keep" },
  SCHD: { name: "Schwab US Dividend Equity ETF", bucket: "US core", plan: "legacy" },
  VIG: { name: "Vanguard Dividend Appreciation ETF", bucket: "US core", plan: "legacy" },
  AAPL: { name: "Apple", bucket: "US tech", plan: "legacy" },
  AMZN: { name: "Amazon", bucket: "US tech", plan: "legacy" },
  GOOGL: { name: "Alphabet (Google)", bucket: "US tech", plan: "legacy" },
  META: { name: "Meta Platforms", bucket: "US tech", plan: "legacy" },
  MSFT: { name: "Microsoft", bucket: "US tech", plan: "legacy" },
  NVDA: { name: "Nvidia", bucket: "US tech", plan: "legacy" },
  ASML: { name: "ASML (ADR)", bucket: "US tech", plan: "legacy" },
  SPCX: { name: "SpaceX", bucket: "Satellite", plan: "legacy" },
  EWZ: { name: "iShares MSCI Brazil ETF", bucket: "Emerging", plan: "legacy" },
  EWY: { name: "iShares MSCI South Korea ETF", bucket: "Emerging", plan: "legacy" },
  EWT: { name: "iShares MSCI Taiwan ETF", bucket: "Emerging", plan: "legacy" },
};
const DEFAULT_TARGETS = [
  { bucket: "US core", w: 45, buy: "LSE~CSPX" },
  { bucket: "Japan", w: 20, buy: "LSE~IJPA" },
  { bucket: "US tech", w: 20, buy: "LSE~CNDX" },
  { bucket: "Copper", w: 10, buy: "LSE~COPX" },
  { bucket: "Satellite", w: 5, buy: "TSM" },
  { bucket: "Emerging", w: 0, buy: "" },
];
function freshState() {
  return {
    v: 1,
    settings: { monthlyInr: 10000, fx: 96.78, fxAt: "2026-10-09", feePct: 1, slab: 30, cess: 4 },
    targets: JSON.parse(JSON.stringify(DEFAULT_TARGETS)),
    holdings: [], sales: [], seenTx: [], checklist: {}, log: [], imports: [], updatedAt: null,
  };
}

/* ---- dates (ISO yyyy-mm-dd strings, UTC math) ---- */
const MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
function iso(y, m, d) { return new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10); }
function parseLooseDate(s) {
  if (s instanceof Date) return s.toISOString().slice(0, 10);
  s = String(s || "").trim();
  let m = s.match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/);
  if (m && MON[m[2].toLowerCase()] != null) return iso(+m[3], MON[m[2].toLowerCase()], +m[1]);
  m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return iso(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/); // US mm/dd/yyyy
  if (m) return iso(+m[3], +m[1] - 1, +m[2]);
  return null;
}
function addDays(isoD, n) { const d = new Date(isoD + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
/* Long-term = held MORE than 24 months: first long-term sale day is buy date + 24 months + 1 day */
function ltcgDate(isoD) {
  const d = new Date(isoD + "T00:00:00Z");
  const y = d.getUTCFullYear() + 2, m = d.getUTCMonth(), day = d.getUTCDate();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return addDays(iso(y, m, Math.min(day, last)), 1);
}
function daysBetween(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 864e5); }
function todayIso() { const d = new Date(); return iso(d.getFullYear(), d.getMonth(), d.getDate()); }

/* ---- holdings helpers ---- */
function getH(state, sym, name) {
  let h = state.holdings.find((x) => x.sym === sym);
  if (!h) {
    const c = CATALOG[sym] || {};
    h = { sym, name: c.name || name || sym, bucket: c.bucket || "Satellite", plan: c.plan || "keep", price: null, priceAt: null, lots: [] };
    state.holdings.push(h);
  }
  return h;
}
const qtyOf = (h) => h.lots.reduce((s, l) => s + l.q, 0);
const costOf = (h) => h.lots.reduce((s, l) => s + l.q * l.p, 0);
function fifoReduce(h, q) { // returns cost removed
  h.lots.sort((a, b) => a.d.localeCompare(b.d));
  let left = q, cost = 0, removed = [];
  for (const l of h.lots) {
    if (left <= EPS) break;
    const take = Math.min(l.q, left);
    l.q -= take; left -= take; cost += take * l.p; removed.push({ d: l.d, q: take, p: l.p });
  }
  h.lots = h.lots.filter((l) => l.q > EPS);
  return { cost, removed };
}
function addLot(h, lot) { h.lots.push(lot); h.lots.sort((a, b) => a.d.localeCompare(b.d)); }

/* ---- INDmoney holdings report (.xls) rows: {sym, since, q, avg} ---- */
function rowsFromHoldingsSheet(aoa) {
  const hi = aoa.findIndex((r) => r && String(r[0] || "").toLowerCase().includes("stock symbol") && r.some((c) => /holding since/i.test(String(c || ""))));
  if (hi < 0) return null;
  const head = aoa[hi].map((c) => String(c || "").toLowerCase());
  const col = (k) => head.findIndex((c) => c.includes(k));
  const cS = 0, cD = col("holding since"), cQ = col("quantity"), cA = col("avg");
  let asOf = null;
  for (const r of aoa.slice(0, hi)) if (r && /holdings as on/i.test(String(r[0]))) asOf = parseLooseDate(r[1]);
  const rows = [];
  for (const r of aoa.slice(hi + 1)) {
    if (!r || !r[0]) { if (rows.length) break; else continue; }
    const sym = String(r[0]).trim();
    if (/disclaimer/i.test(sym)) break;
    const q = parseFloat(r[cQ]), avg = parseFloat(r[cA]);
    if (!sym || !(q > 0)) continue;
    rows.push({ sym, since: parseLooseDate(r[cD]), q, avg });
  }
  return { asOf, rows };
}
function applyHoldingsReport(state, rep, importDate) {
  const changes = [];
  const when = rep.asOf || importDate;
  const seen = new Set();
  for (const r of rep.rows) {
    seen.add(r.sym);
    const h = getH(state, r.sym);
    h.reportQty = r.q; h.reportAt = when;
    const q0 = qtyOf(h), c0 = costOf(h);
    if (!h.lots.length) {
      addLot(h, { d: r.since || when, q: r.q, p: r.avg, src: "report" });
      changes.push(`${r.sym}: added ${fmtQ(r.q)} units (first bought ${r.since || "?"})`);
    } else if (r.q > q0 + 1e-6) {
      const dq = r.q - q0, p = Math.max(0, (r.q * r.avg - c0) / dq);
      addLot(h, { d: when, q: dq, p, src: "report-new" });
      changes.push(`${r.sym}: +${fmtQ(dq)} new units, dated ${when} (check the exact buy date in INDmoney orders)`);
    } else if (r.q < q0 - 1e-6) {
      const dq = q0 - r.q, { cost, removed } = fifoReduce(h, dq);
      state.sales.push({ d: when, sym: r.sym, q: dq, price: h.price, cost, lots: removed, est: true });
      changes.push(`${r.sym}: ${fmtQ(dq)} units sold (oldest units first)`);
    }
  }
  for (const h of state.holdings) {
    if (!seen.has(h.sym) && qtyOf(h) > EPS && !h.sym.startsWith("LSE~")) {
      const q = qtyOf(h), { cost, removed } = fifoReduce(h, q);
      state.sales.push({ d: when, sym: h.sym, q, price: h.price, cost, lots: removed, est: true });
      changes.push(`${h.sym}: no longer in the report, marked as sold`);
    }
  }
  noteImport(state, { kind: "report", period: when, count: rep.rows.length, total: rep.rows.reduce((a, r) => a + r.q * r.avg, 0) });
  return changes;
}
function noteImport(state, rec) {
  state.imports = state.imports || [];
  state.imports = state.imports.filter((x) => !(x.kind === rec.kind && x.period === rec.period && (!rec.file || x.file === rec.file)));
  rec.at = rec.at || new Date().toISOString();
  state.imports.push(rec);
}


/* ---- INDmoney Transactions Report (spreadsheet): every buy/sell since the account opened ---- */
function rowsFromTransactionsSheet(aoa) {
  const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z]/g, "");
  const hi = aoa.findIndex((r) => r && r.some((c) => /symbol|ticker/.test(norm(c))) && r.some((c) => /quantity|qty|units|shares/.test(norm(c))));
  if (hi < 0) return null;
  const head = aoa[hi].map(norm);
  const find = (...ks) => { for (const k of ks) { const i = head.findIndex((h) => h.includes(k)); if (i >= 0) return i; } return -1; }; // keys in priority order
  const cSym = find("symbol", "ticker"), cQ = find("quantity", "qty", "units", "shares");
  const cD = find("executiontime", "executiondate", "tradedate", "transactiondate", "settlementdate", "orderdate", "date", "time");
  const cT = find("transactiontype", "ordertype", "type", "side", "action", "buysell", "activity");
  const cP = find("executionprice", "tradeprice", "avgprice", "price", "rate");
  const cStat = find("status");
  const cA = find("amount", "value", "total");
  if (cD < 0 || cT < 0) return null;
  const out = [];
  for (const r of aoa.slice(hi + 1)) {
    if (!r || !r[cSym]) continue;
    const t = String(r[cT] ?? "").toLowerCase(), side = /\bsell|\bsold/.test(t) ? "sell" : /\bbuy|\bbought|purchase/.test(t) ? "buy" : null;
    if (!side) continue;
    if (cStat >= 0 && /cancel|reject|expire|fail|pending/.test(String(r[cStat] ?? "").toLowerCase())) continue; // only filled orders count
    const q = Math.abs(parseFloat(String(r[cQ]).replace(/[,$]/g, "")));
    let p = cP >= 0 ? Math.abs(parseFloat(String(r[cP]).replace(/[,$]/g, ""))) : NaN;
    if (!(p > 0) && cA >= 0 && q > 0) p = Math.abs(parseFloat(String(r[cA]).replace(/[,$]/g, ""))) / q;
    const d = typeof r[cD] === "number" ? excelDate(r[cD]) : parseLooseDate(r[cD]);
    if (!d || !(q > 0) || !(p > 0)) continue;
    let sym = String(r[cSym]).trim().toUpperCase().replace(/^LSE[~:\s]+/, "LSE~");
    out.push({ d, side, sym, q, price: p });
  }
  return out.length ? out : null;
}
function excelDate(n) { return new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 864e5).toISOString().slice(0, 10); }
/* The full history is the best source of purchase dates: rebuild every lot from it (oldest first, sales FIFO). */
function applyTransactions(state, txs) {
  const changes = [], bySym = {};
  for (const t of [...txs].sort((a, b) => a.d.localeCompare(b.d))) (bySym[t.sym] = bySym[t.sym] || []).push(t);
  state.sales = (state.sales || []).filter((s) => !bySym[s.sym]);
  for (const sym of Object.keys(bySym)) {
    const h = getH(state, sym); h.lots = [];
    for (const t of bySym[sym]) {
      if (t.side === "buy") addLot(h, { d: t.d, q: t.q, p: t.price, src: "transactions", ...(fxOn(state, t.d) ? { fx: fxOn(state, t.d) } : {}) });
      else { const { cost, removed } = fifoReduce(h, Math.min(t.q, qtyOf(h))); state.sales.push({ d: t.d, sym, q: t.q, price: t.price, cost, lots: removed }); }
      const key = `${t.d}|${t.side}|${sym}|${t.q}`; if (!state.seenTx.includes(key)) state.seenTx.push(key);
    }
    if (!h.price && h.lots.length) { const l = h.lots[h.lots.length - 1]; h.price = l.p; h.priceAt = l.d; }
    const buys = bySym[sym].filter((t) => t.side === "buy").length, sells = bySym[sym].length - buys;
    changes.push(`${sym}: ${buys} buy${buys === 1 ? "" : "s"}${sells ? `, ${sells} sale${sells === 1 ? "" : "s"}` : ""}; first on ${bySym[sym][0].d}`);
    if (h.reportQty != null && Math.abs(qtyOf(h) - h.reportQty) > 1e-4) changes.push(`  check ${sym}: history gives ${fmtQ(qtyOf(h))} units, holdings report says ${fmtQ(h.reportQty)}`);
  }
  noteImport(state, { kind: "transactions", period: txs.map((t) => t.d).sort().slice(-1)[0], count: txs.length });
  return changes;
}
/* Units counted in a report lot that a dated trade now accounts for: shrink the report lot. */
function reconcileReportLots(h) {
  const target = h.reportQty; if (target == null) return;
  let excess = qtyOf(h) - target; if (excess <= 1e-6) return;
  for (const l of h.lots.filter((l) => l.src && l.src.startsWith("report")).sort((a, b) => b.q - a.q)) { if (excess <= 1e-6) break; const t = Math.min(l.q, excess); l.q -= t; excess -= t; }
  h.lots = h.lots.filter((l) => l.q > EPS);
}

/* ---- trades/prices extracted by Claude from any other document ---- */
function applyExtracted(state, ex, when) {
  const changes = [];
  for (const t of ex.trades || []) {
    const d = parseLooseDate(t.date), q = +t.units, p = +t.price_usd, side = String(t.side || "").toLowerCase();
    let sym = String(t.symbol || "").trim().toUpperCase().replace(/^LSE[~:\s]+/, "LSE~");
    if (!d || !sym || !(q > 0) || !(p > 0) || !["buy", "sell"].includes(side)) continue;
    const key = `${d}|${side}|${sym}|${q}`;
    if (state.seenTx.includes(key)) continue;
    state.seenTx.push(key);
    const h = getH(state, sym);
    if (side === "buy") { addLot(h, { d, q, p, src: "document", ...(fxOn(state, d) ? { fx: fxOn(state, d) } : {}) }); reconcileReportLots(h); if (!h.price) { h.price = p; h.priceAt = d; } changes.push(`${sym}: buy of ${fmtQ(q)} on ${d} recorded`); }
    else { const { cost, removed } = fifoReduce(h, Math.min(q, qtyOf(h))); state.sales.push({ d, sym, q, price: p, cost, lots: removed }); changes.push(`${sym}: sale of ${fmtQ(q)} on ${d} recorded`); }
  }
  for (const pr of ex.prices || []) {
    let sym = String(pr.symbol || "").trim().toUpperCase().replace(/^LSE[~:\s]+/, "LSE~");
    const h = state.holdings.find((x) => x.sym === sym), p = +pr.price_usd, d = parseLooseDate(pr.as_of) || when;
    if (h && p > 0 && (!h.priceAt || d >= h.priceAt)) { h.price = p; h.priceAt = d; changes.push(`${sym}: price ${p} as of ${d}`); }
  }
  const fx = +ex.fx_inr_per_usd;
  if (fx > 50 && fx < 200) { const fd = parseLooseDate(ex.as_of) || when; state.settings.fxHistory = Object.assign({}, state.settings.fxHistory, { [fd]: fx }); state.settings.fx = fx; state.settings.fxAt = parseLooseDate(ex.as_of) || when; changes.push(`₹ per $ set to ${fx}`); }
  return changes;
}
/* ---- Alpaca monthly statement (PDF text lines) ---- */
function money(s) { return parseFloat(String(s).replace(/[$,\s]/g, "")); }
function parseStatementLines(lines) {
  const out = { periodEnd: null, holdings: [], tx: [], longTotal: null };
  const all = lines.join("\n");
  const pm = all.match(/Period:\s*([A-Z]+)\s*-\s*(\d{4})/i);
  if (pm && MON[pm[1].slice(0, 3).toLowerCase()] != null) out.periodEnd = iso(+pm[2], MON[pm[1].slice(0, 3).toLowerCase()] + 1, 0);
  const hRe = /^([A-Z][A-Z0-9.]{0,6})\s+.+?\s+(\d+(?:\.\d+)?)\s+\$([\d,]+\.\d+)\s+-?\$([\d,]+\.\d+)\s+\$([\d,]+\.\d+)\s+(-?)\$([\d,]+\.\d+)\s+\$([\d,]+\.\d+)\s*$/;
  const tRe = /^(\d{2}\/\d{2}\/\d{4})\s+Trade Entry\s+(buy|sell)\s+([A-Z][A-Z0-9.]{0,6})\s+.*?(\d+\.\d+|\d+)\s+\$([\d,]+\.\d+)\s+(-?)\$([\d,]+\.\d+)/i;
  for (const raw of lines) {
    const ln = raw.replace(/\s+/g, " ").trim();
    const lt = ln.match(/^Long\s+\$([\d,]+\.\d+)$/);
    if (lt) out.longTotal = money(lt[1]);
    let m = ln.match(hRe);
    if (m && m[1] !== "USD") { out.holdings.push({ sym: m[1], q: +m[2], price: money(m[3]), value: money(m[4]), costBasis: money(m[8]) }); continue; }
    m = ln.match(tRe);
    if (m) out.tx.push({ d: parseLooseDate(m[1]), side: m[2].toLowerCase(), sym: m[3], q: +m[4], price: money(m[5]) });
  }
  return out;
}
function applyStatement(state, st) {
  const changes = [];
  for (const t of st.tx) {
    const key = `${t.d}|${t.side}|${t.sym}|${t.q}`;
    if (state.seenTx.includes(key)) continue;
    state.seenTx.push(key);
    const h = getH(state, t.sym);
    if (t.side === "buy") {
      addLot(h, { d: t.d, q: t.q, p: t.price, src: "statement" });
      changes.push(`${t.sym}: buy of ${fmtQ(t.q)} on ${t.d} recorded`);
    } else {
      const { cost, removed } = fifoReduce(h, t.q);
      state.sales.push({ d: t.d, sym: t.sym, q: t.q, price: t.price, cost, lots: removed });
      changes.push(`${t.sym}: sale of ${fmtQ(t.q)} on ${t.d} recorded`);
    }
  }
  for (const s of st.holdings) {
    const h = getH(state, s.sym);
    // reconcile: the report lot already counted units the statement lists as separate buys
    let excess = qtyOf(h) - s.q;
    if (excess > 1e-6) {
      const reps = h.lots.filter((l) => l.src && l.src.startsWith("report")).sort((a, b) => b.q - a.q);
      for (const l of reps) { if (excess <= 1e-6) break; const t = Math.min(l.q, excess); l.q -= t; excess -= t; }
      h.lots = h.lots.filter((l) => l.q > EPS);
    }
    if (!h.lots.length && s.q > 0) addLot(h, { d: st.periodEnd, q: s.q, p: s.costBasis / s.q, src: "statement-unknown-date" });
    // match total cost basis by adjusting the report lot price
    const rep = h.lots.find((l) => l.src && l.src.startsWith("report"));
    if (rep && s.costBasis > 0) {
      const other = h.lots.filter((l) => l !== rep).reduce((a, l) => a + l.q * l.p, 0);
      const p = (s.costBasis - other) / rep.q;
      if (p > 0 && isFinite(p)) rep.p = p;
    }
    if (!h.priceAt || !st.periodEnd || st.periodEnd >= h.priceAt) { h.price = s.price; h.priceAt = st.periodEnd; }
  }
  noteImport(state, { kind: "statement", period: st.periodEnd, total: st.longTotal });
  if (st.holdings.length) changes.push(`Prices updated for ${st.holdings.length} holdings (as of ${st.periodEnd})`);
  return changes;
}
function fmtQ(q) { return (+q).toFixed(q < 1 ? 4 : 2); }

/* ---- analytics ---- */
function taxRates(s) { const k = 1 + (s.cess || 0) / 100; return { st: (s.slab / 100) * k, lt: 0.125 * k }; }
/* Rupee rate on a date: the newest recorded rate on or before it (INDmoney's rate, saved daily). */
function fxOn(state, d) {
  const hist = (state.settings && state.settings.fxHistory) || {};
  const keys = Object.keys(hist).filter((k) => k <= d).sort();
  return keys.length ? hist[keys[keys.length - 1]] : null;
}
function lotRows(state, today) {
  const { st, lt } = taxRates(state.settings), fx = state.settings.fx;
  const rows = [];
  for (const h of state.holdings) for (const l of h.lots) {
    const price = h.price ?? l.p, gain = (price - l.p) * l.q, ltd = ltcgDate(l.d), left = daysBetween(today, ltd);
    const known = l.fx || fxOn(state, l.d), fxBuy = known || fx, gainInr = price * l.q * fx - l.p * l.q * fxBuy;
    rows.push({ sym: h.sym, plan: h.plan, d: l.d, q: l.q, p: l.p, price, gain, gainInr, fxBuy, fxKnown: !!known, ltd, left, isLT: left <= 0,
      taxNow: gainInr > 0 ? gainInr * (left <= 0 ? lt : st) : 0, taxLT: gainInr > 0 ? gainInr * lt : 0 });
  }
  return rows.sort((a, b) => a.ltd.localeCompare(b.ltd));
}
function holdingRows(state, today) {
  return state.holdings.filter((h) => qtyOf(h) > EPS).map((h) => {
    const q = qtyOf(h), cost = costOf(h), price = h.price ?? cost / q, value = q * price, gain = value - cost;
    const lots = h.lots.map((l) => ({ ...l, ltd: ltcgDate(l.d) }));
    const firstLT = lots.map((l) => l.ltd).sort()[0], lastLT = lots.map((l) => l.ltd).sort().slice(-1)[0];
    return { ...h, lots, q, cost, price, value, gain, pct: cost ? gain / cost : 0, firstLT, lastLT, allLT: lastLT <= today, action: actionFor(h.plan, gain, lastLT, today) };
  });
}
function actionFor(plan, gain, lastLT, today) {
  if (plan === "core") return { tone: "good", label: "Keep buying", why: "Part of your monthly plan." };
  if (plan === "keep") return { tone: "neutral", label: "Hold", why: "Good fund, but new money goes to the UCITS version. No need to sell." };
  if (gain < 0) return { tone: "act", label: "Sell: harvest loss", why: "Selling at a loss costs no tax, and the loss can cancel gains or carry forward 8 years." };
  if (lastLT > today) return { tone: "wait", label: `Hold to ${fmtDate(lastLT)}`, why: "Selling earlier taxes the gain at your slab rate; after this date it is 12.5%." };
  return { tone: "act", label: "Sell now (12.5%)", why: "Past 24 months. Exit and move the money into your plan funds." };
}
function bucketView(state, extraUsd = 0) {
  const rows = holdingRows(state, todayIso());
  const total = rows.reduce((s, r) => s + r.value, 0);
  const by = {};
  for (const r of rows) by[r.bucket] = (by[r.bucket] || 0) + r.value;
  const ORDER = ["US core", "Japan", "US tech", "Copper", "Satellite", "Emerging"], ord = (b) => (ORDER.indexOf(b) < 0 ? 99 : ORDER.indexOf(b));
  return [...state.targets].sort((a, b) => ord(a.bucket) - ord(b.bucket)).map((t) => ({ ...t, value: by[t.bucket] || 0, pct: total ? (100 * (by[t.bucket] || 0)) / total : 0 }))
    .concat(Object.keys(by).filter((b) => !state.targets.some((t) => t.bucket === b)).map((b) => ({ bucket: b, w: 0, buy: "", value: by[b], pct: (100 * by[b]) / total })))
    .map((x) => ({ ...x, total }));
}
/* Split this month's money. Standard = fixed weights. Rebalanced = fill the biggest gaps first, never selling. */
function monthlySplit(state) {
  const s = state.settings, usd = (s.monthlyInr / s.fx) * (1 - (s.feePct || 0) / 100);
  const buckets = bucketView(state), total = buckets[0] ? buckets[0].total : 0;
  // a single company above 10% of the sleeve gets no new money until it falls back
  const paused = (b) => SINGLE.has(b.buy) && total && (holdingRows(state, todayIso()).find((r) => r.sym === b.buy)?.value || 0) / total > 0.1;
  const active = buckets.filter((b) => b.w > 0 && b.buy).map((b) => (paused(b) ? { ...b, w: 0, paused: true, w0: b.w } : b));
  const wsum = active.reduce((a, b) => a + b.w, 0) || 1;
  const after = total + usd;
  let gaps = active.map((b) => (b.paused ? 0 : Math.max(0, (after * b.w) / wsum - b.value)));
  const gsum = gaps.reduce((a, b) => a + b, 0);
  let fill;
  if (gsum <= usd) fill = active.map((b, i) => gaps[i] + ((usd - gsum) * b.w) / wsum);
  else fill = gaps.map((g) => (g / gsum) * usd);
  // Half the money follows the standard split, half fills the gaps: steady, but drifts back to target.
  const rows = active.map((b, i) => { const std = (usd * b.w) / wsum; return { bucket: b.bucket, buy: b.buy, w: b.paused ? b.w0 : b.w, paused: !!b.paused, std, reb: b.paused ? 0 : 0.5 * std + 0.5 * fill[i], nowPct: b.pct, gapUsd: b.paused ? 0 : (after * b.w) / wsum - b.value }; });
  // Funds INDmoney sells only in whole shares: buy n shares when the bucket is at least half a share under target, otherwise skip it this month.
  let freed = 0, taken = 0;
  for (const r of rows) {
    if (!WHOLE[r.buy] || r.paused) continue;
    const held = state.holdings.find((h) => h.sym === r.buy), px = ((held && held.price) || WHOLE[r.buy]) * 1.0075;
    const vc = valueCheck(state, r.buy), behind = r.gapUsd >= 0.5 * px, fits = px <= 0.8 * usd;
    const n = behind && fits && vc.zone !== "expensive" ? 1 : 0;
    r.whole = true; r.px = px; r.shares = n; r.vc = vc;
    if (n > 0) { taken += n * px - r.reb; r.reb = n * px; } else { freed += r.reb; r.reb = 0; r.skipWhy = !fits ? "1 share costs more than this month's money" : !behind ? "at or above its 10% target; next share when it falls behind" : "expensive right now (near its 1-year high); waiting for a better price"; }
  }
  const delta = freed - taken, rest = rows.filter((r) => !r.whole && !r.paused && r.reb > 0), rs = rest.reduce((a, r) => a + r.reb, 0);
  if (rs > 0 && delta) rest.forEach((r) => (r.reb = Math.max(0, r.reb + (delta * r.reb) / rs)));
  return { usd, rows };
}
/* Value check for a whole-share fund, from the US-listed twin that tracks the same index (written by the daily refresh):
   where today's price sits in its 1-year range. Bottom 40% = good value, 40–75% = fair, top 25% = expensive (skip). */
function valueCheck(state, sym) {
  const g = ((state.settings && state.settings.signals) || {})[sym];
  if (!g || !(g.hi52 > g.lo52) || !g.price) return { zone: null, text: "No value check yet; treated as fair" };
  const pos = Math.min(1, Math.max(0, (g.price - g.lo52) / (g.hi52 - g.lo52))), off = 1 - g.price / g.hi52;
  const zone = pos <= 0.4 ? "cheap" : pos <= 0.75 ? "fair" : "expensive";
  const label = { cheap: "Good value", fair: "Fair value", expensive: "Expensive" }[zone];
  return { zone, pos, label, text: `${label}: ${g.ref || "the fund"} is at ${Math.round(pos * 100)}% of its 1-year range ($${g.lo52}–$${g.hi52}), ${Math.round(off * 100)}% below its high${g.pe ? `, P/E ${g.pe}` : ""} (${g.at})` };
}
/* whole-share-only funds on INDmoney, with a fallback price (USD) used until the fund is held and priced */
const WHOLE = { "LSE~COPX": 63.59, "LSE~CPPR": 22.12 };
/* Monthly statements received vs needed (first purchase month up to last finished month) */
function coverage(state, today) {
  const first = state.holdings.flatMap((h) => h.lots.map((l) => l.d)).concat((state.sales || []).map((s) => s.d)).sort()[0];
  if (!first) return [];
  const got = new Set((state.imports || []).filter((x) => x.kind === "statement" && x.period).map((x) => x.period.slice(0, 7)));
  const out = []; let y = +first.slice(0, 4), m = +first.slice(5, 7) - 1;
  const ty = +today.slice(0, 4), tm = +today.slice(5, 7) - 1;
  while (y < ty || (y === ty && m < tm)) { const k = `${y}-${String(m + 1).padStart(2, "0")}`; out.push({ month: k, have: got.has(k) }); m++; if (m > 11) { m = 0; y++; } }
  return out;
}
const SINGLE = new Set(["AAPL", "AMZN", "GOOGL", "META", "MSFT", "NVDA", "ASML", "SPCX", "TSM"]);
/* Data-health checks, run before any figure is trusted (adapted from a seven-check holdings sanity pass) */
function health(state, today) {
  const rows = holdingRows(state, today), total = rows.reduce((a, r) => a + r.value, 0), out = [];
  const st = (state.imports || []).filter((x) => x.kind === "statement" && x.total).sort((a, b) => a.period.localeCompare(b.period)).slice(-1)[0];
  if (st) {
    const atSt = rows.filter((r) => r.priceAt === st.period).reduce((a, r) => a + r.value, 0);
    const all = rows.every((r) => r.priceAt === st.period);
    const diff = all ? atSt - st.total : null;
    out.push(diff == null ? { name: "Reconciliation", ok: true, text: `Last statement total ${usd2(st.total)} (${st.period}). Some prices are newer, so totals aren't compared.`, affects: "" }
      : { name: "Reconciliation", ok: Math.abs(diff) <= Math.max(0.5, st.total * 0.01), text: `App total ${usd2(atSt)} vs statement ${usd2(st.total)}: difference ${usd2(diff)}.`, affects: "Every value and gain figure" });
  } else out.push({ name: "Reconciliation", ok: false, text: "No monthly statement imported yet, so totals can't be checked.", affects: "Every value and gain figure" });
  const stale = rows.filter((r) => !r.priceAt || daysBetween(r.priceAt, today) > 45);
  out.push({ name: "Freshness", ok: !stale.length, text: stale.length ? `${stale.map((r) => r.sym.replace("LSE~", "")).join(", ")}: price older than 45 days. Upload the latest statement.` : "All prices are from the last 45 days.", affects: "Value, gain, allocation" });
  const txImp = (state.imports || []).find((x) => x.kind === "transactions");
  const estLots = rows.flatMap((r) => r.lots.filter((l) => !["transactions", "statement", "document"].includes(l.src)).map(() => r.sym));
  out.push({ name: "Purchase dates", ok: !!txImp || !estLots.length, text: txImp ? `Every purchase date comes from your Transactions Report (up to ${txImp.period}).` : `${[...new Set(estLots)].length} holdings still use the first-buy date from the holdings report. Upload the Transactions Report to get every purchase's exact date.`, affects: "Long-term dates and tax estimates" });
  const started = state.settings && state.settings.startedOn;
  const early = started ? rows.filter((r) => r.lots.some((l) => l.d < started)) : [];
  if (early.length) out.push({ name: "Start date", ok: false, text: `${early.map((r) => r.sym).join(", ")}: dated before you started (${started}). The Transactions Report confirms the real date, which decides when it can be sold at 12.5%.`, affects: "That holding's long-term date" });
  const conc = rows.filter((r) => SINGLE.has(r.sym) && total && r.value / total > 0.1);
  out.push({ name: "Concentration", ok: !conc.length, text: conc.length ? conc.map((r) => `${r.sym} is ${((100 * r.value) / total).toFixed(0)}% of the sleeve (limit 10%). Stop adding until it drops below.`).join(" ") : "No single company above 10%.", affects: "Risk" });
  const big = rows.filter((r) => r.pct > 0.6 || r.pct < -0.4);
  out.push({ name: "Unusual moves", ok: !big.length, text: big.length ? big.map((r) => `${r.sym} ${(r.pct * 100).toFixed(0)}%`).join(", ") + ": check the price before acting." : "No gain or loss looks out of range.", affects: "Sell decisions" });
  const has = (s) => rows.some((r) => r.sym === s);
  const dup = [["VOO", "LSE~CSPX"], ["VT", "LSE~CSPX"], ["QQQ", "LSE~CNDX"], ["EWJ", "LSE~IJPA"]].filter(([a, b]) => has(a) && has(b));
  out.push({ name: "Overlap", ok: true, text: dup.length ? `${dup.map(([a, b]) => `${a} and ${b.replace("LSE~", "")}`).join("; ")} track the same market. That's expected while old holdings wait out their 24 months.` : "No two funds track the same index.", affects: "" });
  return out;
}
function monthName(k) { return new Date(k + "-01T00:00:00Z").toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }); }
function usd2(v) { return (v < 0 ? "−" : "") + "$" + Math.abs(v).toFixed(2); }
function fmtDate(isoD) { if (!isoD) return "—"; const d = new Date(isoD + "T00:00:00Z"); return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }); }

if (typeof module !== "undefined") module.exports = { rowsFromTransactionsSheet, applyTransactions, coverage, health, applyExtracted, CATALOG, DEFAULT_TARGETS, freshState, parseLooseDate, ltcgDate, rowsFromHoldingsSheet, applyHoldingsReport, parseStatementLines, applyStatement, lotRows, holdingRows, bucketView, monthlySplit, qtyOf, costOf, todayIso };

/* ---- CDSL / NSDL Consolidated Account Statement (India): holdings by position on the page ---- */
const ISIN_RE = /^IN[EF][A-Z0-9]{9}$/;
const casNum = (s) => { const t = String(s).replace(/,/g, "").trim(); return /^-?(\d+(\.\d+)?|\.\d+)$/.test(t) ? +t : null; };
const MON3 = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
function parseCAS(pages) {
  const ascii = (s) => !/[^\x00-\x7F₹]/.test(s);
  const all = pages.map((items) => items.filter((i) => i.s && i.s.trim() && ascii(i.s)).map((i) => ({ x: i.x, y: i.y, s: i.s.trim() })));
  const text = all.map((p) => p.slice().sort((a, b) => b.y - a.y || a.x - b.x).map((i) => i.s).join(" ")).join(" \n ");
  if (!/CONSOLIDATED ACCOUNT STATEMENT/i.test(text) || !/(CDSL|NSDL)/.test(text)) return null;
  const out = { holdings: [], accounts: [], history: [], mix: {}, asOf: null, total: null };
  let m = text.match(/period from \d{2}-([A-Za-z]{3})-(\d{4}) to (\d{2})-([A-Za-z]{3})-(\d{4})/);
  if (m) out.asOf = iso(+m[5], MON3[m[4].toLowerCase()], +m[3]);
  m = text.match(/Total Portfolio Value\s+([\d,]+\.\d{2})/); if (m) out.total = casNum(m[1]);
  for (const h of text.matchAll(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4})\s+([\d,]+\.\d{2})/g)) { const k = `${h[2]}-${String(MON3[h[1].toLowerCase()] + 1).padStart(2, "0")}`; if (!out.history.some((x) => x.m === k)) out.history.push({ m: k, v: casNum(h[3]) }); }
  let mode = "none", acct = null, depo = "CDSL";
  const rows = [];
  all.forEach((items, pi) => {
    const sorted = items.slice().sort((a, b) => b.y - a.y || a.x - b.x);
    // events in reading order: section headers and ISIN anchors
    const anchors = [];
    for (const it of sorted) {
      const s = it.s;
      if (/DEMAT ACCOUNTS HELD WITH NSDL/.test(s)) depo = "NSDL";
      else if (/DEMAT ACCOUNTS HELD WITH CDSL/.test(s)) depo = "CDSL";
      if (/^DP Name\s*:?$/.test(s) || /^DP Name :/.test(s)) { const nm = sorted.find((o) => Math.abs(o.y - it.y) < 2 && o.x > it.x + 5 && !/:/.test(o.s)); if (nm && mode !== "summary") { acct = nm.s.replace(/\s+/g, " "); } }
      if (/HOLDING STATEMENT OF BONDS/.test(s)) mode = "bonds";
      else if (/HOLDING STATEMENT AS ON/.test(s)) mode = /Other Details/.test(s) || sorted.some((o) => Math.abs(o.y - it.y) < 2 && /Other Details/.test(o.s)) ? "skip" : "demat";
      else if (/STATEMENT OF TRANSACTIONS/.test(s) || /TER & COMMISSION/.test(s) || /MUTUAL FUND UNITS HELD WITH MF\/RTA/.test(s)) mode = "skip";
      else if (/MUTUAL FUND UNITS HELD AS ON/.test(s)) { mode = "mf"; acct = "Mutual fund folios"; }
      else if (/Portfolio Value/.test(s) && mode === "demat") { /* end of an account's table */ }
      if (ISIN_RE.test(s) && ["demat", "bonds", "mf"].includes(mode)) anchors.push({ it, mode, acct, depo });
    }
    for (const a of anchors) {
      const same = items.filter((o) => Math.abs(o.y - a.it.y) < 2.5 && o.x > a.it.x + 30).sort((p, q) => p.x - q.x);
      const nums = same.map((o) => casNum(o.s)).filter((v) => v !== null);
      if (a.mode === "mf") {
        const folioIt = same.find((o) => o.x < a.it.x + 80 && /\d/.test(o.s) && /[\/\d]/.test(o.s));
        const numItems = same.filter((o) => o.x > a.it.x + 120 && casNum(o.s) !== null).map((o) => casNum(o.s));
        if (numItems.length < 4) continue;
        const [bal, nav, cost, value] = numItems; const profit = numItems.length >= 9 ? numItems[7] : value - cost;
        rows.push({ a, units: bal, price: nav, value, cost, gain: profit, folio: folioIt ? folioIt.s.replace(/­/g, "") : "" });
      } else {
        if (nums.length < 2) continue;
        const value = nums[nums.length - 1], price = nums[nums.length - 2];
        const units = a.mode === "bonds" ? nums[nums.length - 4] : nums[0];
        rows.push({ a, units, price, value });
      }
    }
    // names: text in the name column, given to the nearest anchor of this page
    const pageRows = rows.filter((r) => r.pi === undefined && (r.pi = pi) === pi && items.includes(r.a.it));
    for (const r of pageRows) r.nameParts = [];
    const nameItems = items.filter((o) => !ISIN_RE.test(o.s) && casNum(o.s) === null && o.s !== "--" && o.s !== "-" && !/^(Grand )?Total$|Portfolio Value|^ISIN$|^Security$|HOLDING STATEMENT|Other Details|STATEMENT OF/i.test(o.s));
    for (const o of nameItems) {
      let best = null, bd = 1e9;
      for (const r of pageRows) {
        const ax = r.a.it.x, inCol = r.a.mode === "mf" ? o.x < ax - 2 : o.x > ax + 40 && o.x < ax + (r.a.mode === "bonds" ? 140 : 220);
        if (!inCol) continue;
        const d = Math.abs(o.y - r.a.it.y); if (d < bd && d < 36) { bd = d; best = r; }
      }
      if (best && !/^(ARN-|DIRECT|Regular|Direct)$/i.test(o.s)) best.nameParts.push(o);
    }
  });
  for (const r of rows) {
    const raw = (r.nameParts || []).sort((p, q) => q.y - p.y || p.x - q.x).map((o) => o.s).join(" ").replace(/­\s?/g, "").replace(/\s+/g, " ").trim();
    const isin = r.a.it.s, bondish = r.a.mode === "bonds" || r.a.acct && /FOURDEGREEWATER|WINT|GRIP/i.test(r.a.acct) || / NCD|SEC NGRT|SR [IVX]+ /i.test(raw) || /^INE\w{4}07/.test(isin);
    const type = r.a.mode === "mf" ? "mf" : bondish ? "bond" : /InvIT|REIT/i.test(raw) ? "invit" : isin.startsWith("INF") ? (/ETF|EXCHANGE TRADED|BEES/i.test(raw) && !/FOF|FUND OF FUND/i.test(raw) ? "etf" : "mf") : "stock";
    if (!(r.value > 0)) continue;
    out.holdings.push({ isin, name: casName(raw, type), raw, type, cls: casClass(raw, type), units: r.units, price: r.price, value: r.value, ...(r.cost != null ? { cost: r.cost, gain: r.gain } : {}), acct: casAcct(r.a.acct), depo: r.a.mode === "mf" ? "MF" : r.a.depo, ...(r.folio ? { folio: r.folio } : {}) });
  }
  for (const h of out.holdings) { let a = out.accounts.find((x) => x.name === h.acct); if (!a) out.accounts.push((a = { name: h.acct, value: 0, n: 0 })); a.value += h.value; a.n++; }
  for (const h of out.holdings) out.mix[h.cls] = (out.mix[h.cls] || 0) + h.value;
  out.history.sort((a, b) => a.m.localeCompare(b.m));
  return out.holdings.length ? out : null;
}
function casAcct(a) { if (!a) return "Other"; const s = a.toUpperCase(); return /GROWW/.test(s) ? "Groww" : /ZERODHA/.test(s) ? "Zerodha" : /INDSTOCKS/.test(s) ? "INDstocks" : /FOURDEGREEWATER/.test(s) ? "Wint Wealth (NSDL)" : /UPSTOX|RKSV/.test(s) ? "Upstox" : /ANGEL/.test(s) ? "Angel One" : /Mutual fund folios/i.test(a) ? "MF folios (CAMS/KFin)" : a.replace(/ (PRIVATE )?LIMITED$/i, "").replace(/\b\w+/g, (w) => w[0] + w.slice(1).toLowerCase()); }
function casClass(raw, type) {
  const s = raw.toUpperCase();
  if (type === "bond" || /LIQUID|ARBITRAGE|GILT|OVERNIGHT|MONEY MARKET|CORPORATE BOND|SHORT DURATION|BANKING AND PSU|DEBT/.test(s)) return "Debt";
  if (/GOLD|SILVER/.test(s)) return "Gold & silver";
  if (type !== "stock" && /NASDAQ|FANG|S&P 500|GLOBAL|INTERNATIONAL|US EQUITY|HANG SENG/.test(s)) return "International";
  if (/BALANCED ADVANTAGE|DYNAMIC ASSET|MULTI ASSET|EQUITY SAVINGS|HYBRID|ASSET ALLOCATION/.test(s)) return "Hybrid";
  if (type === "invit") return "Other";
  return "Equity";
}
function casName(raw, type) {
  let s = raw.replace(/^[A-Z0-9]{2,6} - /, "");
  if (type === "stock" || type === "invit") s = s.split("#")[0].replace(/\s*[-–]?\s*(NEW )?(EQUITY|EQ|EQTY) .*$/i, "").replace(/\s*-\s*$/, "");
  else if (type === "etf" || type === "mf") { if (/#/.test(s)) s = s.slice(s.indexOf("#") + 1).trim().replace(/^[A-Z ]*?MF ?- ?/i, ""); }
  else if (type === "bond") s = s.replace(/^ISIN Name /, "").split("#")[0].replace(/ (LIMITED|LTD)$/i, "");
  s = s.trim(); let prev; do { prev = s; s = s.replace(/[\s\-–]+(DIRECT|DIR|DIRAN|PLAN|PL|GROWTH|GR|GRW|OPTION|OPT)\s*$/i, "").replace(/\s*[-–]\s*$/, ""); } while (s !== prev);
  s = s.trim().replace(/ (LIMITED|LTD)\.?$/i, "").trim();
  return s.length >= 2 ? s : raw.slice(0, 40);
}
