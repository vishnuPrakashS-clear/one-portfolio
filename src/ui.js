/* ===== One Portfolio screens: Home, Mutual funds, Stocks, Bonds, Abroad, Goals =====
   Loaded after app.js and reuses its data helpers (indHoldings, holdingRows, xirr, holdingDetail, bondCard ...).
   Every figure comes from uploaded statements and the daily prices; month-end prices (data.pxm, filled by the
   price-history job) draw growth over time. The goal check is the only place you choose anything, by tapping. */

const CATS = {
  funds: { id: "funds", name: "Mutual funds", short: "Funds", hex: "#c084fc", cv: "var(--c-funds)", types: ["mf"], rates: [0.08, 0.11, 0.14], what: "equity and hybrid funds, SIPs" },
  stocks: { id: "stocks", name: "Stocks", short: "Stocks", hex: "#22d3ee", cv: "var(--c-stocks)", types: ["stock", "etf", "invit"], rates: [0.07, 0.12, 0.16], what: "shares, ETFs and InvITs" },
  bonds: { id: "bonds", name: "Bonds", short: "Bonds", hex: "#fbbf24", cv: "var(--c-bonds)", types: ["bond"], rates: [0.065, 0.08, 0.095], what: "bonds and NCDs" },
  abroad: { id: "abroad", name: "Abroad", short: "Abroad", hex: "#fb7185", cv: "var(--c-abroad)", rates: [0.07, 0.11, 0.14], what: "US, Japan and London funds" },
};
const CAT_ORDER = ["funds", "stocks", "bonds", "abroad"];
const TAB_OF = { funds: "funds", stocks: "stocks", bonds: "bonds", abroad: "holdings" };
const RATE_NAMES = ["Cautious", "Likely", "Strong"];
const GOALS = [1e6, 2.5e6, 5e6, 1e7, 2e7, 5e7];
CUR = (() => { try { return localStorage.getItem("gbp-cur") === "USD" ? "USD" : "INR"; } catch (e) { return "INR"; } })();

/* ---------- money and months ---------- */
const fmt = (v) => (CUR === "USD" ? usdRaw(v / fxNow()) : inr(v));
const short = (v) => {
  if (CUR === "USD") { const d = v / fxNow(), a = Math.abs(d); return (d < 0 ? "−" : "") + "$" + (a >= 1e6 ? (a / 1e6).toFixed(2) + "M" : a >= 1e4 ? (a / 1e3).toFixed(1) + "k" : a.toLocaleString("en-US", { maximumFractionDigits: 0 })); }
  const a = Math.abs(v), s = v < 0 ? "−" : "";
  const t2 = (x) => x.toFixed(2).replace(/\.?0+$/, "");
  return s + (a >= 1e7 ? "₹" + t2(a / 1e7) + " Cr" : a >= 1e5 ? "₹" + t2(a / 1e5) + " L" : "₹" + Math.round(a).toLocaleString("en-IN"));
};
const cnt = (v) => `data-fmt="nw" data-count="${CUR === "USD" ? v / fxNow() : v}"`;
const pct1 = (v) => (v == null || !isFinite(v) ? "—" : (v >= 0 ? "+" : "−") + Math.abs(v * 100).toFixed(1) + "%");
const ymOf = (d) => d.slice(0, 7);
const ymAdd = (ym, n) => { const [y, m] = ym.split("-").map(Number), d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
const monthEnd = (ym) => { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const mShort = (ym) => new Date(ym + "-01T00:00:00Z").toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
const mLong = (ym) => new Date(ym + "-01T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const NMONTHS = 12;
const curYm = () => ymOf(TODAY);
const monthsList = () => Array.from({ length: NMONTHS }, (_, i) => ymAdd(curYm(), i - NMONTHS + 1));
const fxAt = (d) => { const h = (S && S.settings && S.settings.fxHistory) || {}, k = Object.keys(h).filter((x) => x <= d).sort().pop(); return k ? h[k] : fxNow(); };
const steady = (a) => { if (!a.length) return 0; const mx = Math.max(...a), rest = a.slice(); rest.splice(a.indexOf(mx), 1); const m = rest.reduce((x, y) => x + y, 0) / (rest.length || 1); return mx > 2.5 * m && rest.length ? m : a.reduce((x, y) => x + y, 0) / a.length; };
const median = (a) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const fv = (pv, sip, r, yrs) => { const i = Math.pow(1 + r, 1 / 12) - 1, n = Math.round(yrs * 12), g = Math.pow(1 + i, n); return pv * g + (i ? (sip * (g - 1) / i) * (1 + i) : sip * n); };

/* ---------- the model: every holding with its value, cost, lots and month-by-month value ---------- */
let MODEL = null;
function buildModel() {
  const months = monthsList(), cur = curYm(), pxm = (S && S.pxm) || {}, I = S && S.india, fx = fxNow();
  const cats = Object.fromEntries(CAT_ORDER.map((id) => [id, { ...CATS[id], items: [], value: 0, cost: 0, known: 0, val: months.map(() => 0), inv: months.map(() => 0), covered: 0, histMissing: 0 }]));
  const add = (catId, it) => {
    const c = cats[catId]; c.items.push(it); c.value += it.value; if (it.cost != null) c.cost += it.cost, c.known += it.value;
    if (!it.lots || !it.lots.length) return;
    c.covered += it.value;
    it.val = months.map(() => 0); it.inv = months.map(() => 0);
    months.forEach((m, i) => {
      const end = m === cur ? TODAY : monthEnd(m), held = it.lots.filter((l) => l.d <= end);
      const units = held.reduce((a, l) => a + l.q, 0), inv = held.reduce((a, l) => a + l.q * l.p * (it.usd ? l.fx || fxAt(l.d) : 1), 0);
      let px = m === cur ? it.price : pxm[it.pxKey] && pxm[it.pxKey][m];
      if (px == null) { if (it.bond) px = units ? inv / units : 0; else if (units) { c.histMissing++; px = units ? inv / units : 0; } else px = 0; }
      const v = units * px * (it.usd ? (m === cur ? fx : fxAt(monthEnd(m))) : 1);
      it.val[i] = v; it.inv[i] = inv; c.val[i] += v; c.inv[i] += inv;
    });
  };
  if (I) for (const h of indHoldings(I)) {
    const catId = Object.keys(CATS).find((k) => CATS[k].types && CATS[k].types.includes(h.type)); if (!catId) continue;
    const v = indCur(h, I), px = h.lp && h.lpAt > (h.asOf || I.asOf) ? h.lp : h.price;
    add(catId, { id: h.key, h, name: h.name, sub: [h.type === "etf" ? "ETF" : h.type === "invit" ? "InvIT" : h.type === "bond" ? "Bond / NCD" : h.type === "mf" ? h.cls : "Share", h.via || h.acct].filter(Boolean).join(" · "), value: v, cost: h.cost != null ? h.cost : null, lots: (h.lots || []).filter((l) => l && l.d && l.q > 0 && l.p > 0), price: px, pxKey: h.type === "mf" && !h.isin ? "MF:" + nameKey(h.name) : h.isin, bond: h.type === "bond" });
  }
  if (hasData()) for (const r of holdingRows(S, TODAY)) {
    const hh = S.holdings.find((x) => x.sym === r.sym), lots = ((hh && hh.lots) || []).filter((l) => l.q > 0);
    add("abroad", { id: r.sym, sym: r.sym, name: tk(r.sym), sub: r.name, value: r.value * fx, cost: r.cost * fx, lots, price: hh && hh.price, pxKey: r.sym, usd: true });
  }
  let total = 0, cost = 0;
  for (const c of Object.values(cats)) {
    c.items.sort((a, b) => b.value - a.value); total += c.value; cost += c.cost;
    c.gain = c.known ? c.items.filter((x) => x.cost != null).reduce((a, x) => a + x.value - x.cost, 0) : null;
    c.gainPct = c.known && c.cost ? c.gain / c.cost : null;
    // past yearly return from dated purchases
    const cf = []; for (const it of c.items) if (it.lots && it.lots.length) { for (const l of it.lots) cf.push({ d: l.d, v: -l.q * l.p * (it.usd ? l.fx || fxAt(l.d) : 1) }); }
    const cov = c.items.filter((x) => x.lots && x.lots.length).reduce((a, x) => a + x.value, 0);
    cf.sort((a, b) => a.d.localeCompare(b.d)); if (cov) cf.push({ d: TODAY, v: cov });
    const first = cf.length ? cf[0].d : null;
    c.xirr = c.id !== "bonds" && first && daysBetween(first, TODAY) > 120 ? xirr(cf) : null; c.since = first;
    // monthly investing: the median of what went in over the last six complete months
    const ins = []; for (let i = NMONTHS - 7; i < NMONTHS - 1; i++) if (i > 0) ins.push(Math.max(0, c.inv[i] - c.inv[i - 1]));
    c.sip = c.id === "abroad" ? (S && S.settings && S.settings.monthlyInr) || 0 : Math.round(steady(ins) / 100) * 100;
    c.sipSrc = c.id === "abroad" ? "your monthly plan" : "the average of your last six months of purchases";
    c.coverage = c.value ? c.covered / c.value : 0;
  }
  const val = months.map((_, i) => CAT_ORDER.reduce((a, id) => a + cats[id].val[i], 0)), inv = months.map((_, i) => CAT_ORDER.reduce((a, id) => a + cats[id].inv[i], 0));
  MODEL = { months, cats, total, cost, val, inv, fx };
  return MODEL;
}

/* ---------- the 3D city ---------- */
let cityFed = null;
function feedCity() {
  const C = window.City; if (!C || !MODEL) return;
  const sig = MODEL.total.toFixed(0) + "|" + CUR + "|" + MODEL.months.join();
  if (cityFed !== sig) {
    cityFed = sig;
    C.setData({ months: MODEL.months, districts: CAT_ORDER.filter((id) => MODEL.cats[id].items.length).map((id) => { const c = MODEL.cats[id]; return { id, name: c.name, color: c.hex, value: c.value, valueText: short(c.value), holdings: c.items.slice(0, 64).map((it) => ({ id: it.id, name: it.name, value: it.value, gainPct: it.cost ? ((it.value - it.cost) / it.cost) * 100 : 0, series: it.val || null, valueText: fmt(it.value) })) }; }) });
    C.onPick((p) => { if (p.id) openItem(p.district, p.id); else showTab(TAB_OF[p.district]); });
    C.onHover((h, x, y) => { const tip = $("#city-tip"); if (!h) { tip.hidden = true; document.body.style.cursor = ""; return; } tip.hidden = false; document.body.style.cursor = "pointer"; tip.innerHTML = `<b>${esc(h.name)}</b><span>${h.valueText}${h.gainPct ? ` · <em class="${h.gainPct >= 0 ? "pos" : "neg"}">${h.gainPct >= 0 ? "+" : "−"}${Math.abs(h.gainPct).toFixed(1)}%</em>` : ""}</span>`; tip.style.transform = `translate(${Math.min(innerWidth - 240, x + 14)}px, ${y + 14}px)`; });
  }
  const t = document.body.dataset.tab, focus = { funds: "funds", stocks: "stocks", bonds: "bonds", holdings: "abroad" }[t] || "all";
  C.focus(focus);
}
window.addEventListener("city-ready", () => { if (MODEL) feedCity(); });
addEventListener("scroll", () => { if (window.City) window.City.setScroll(Math.min(1, scrollY / (innerHeight * 1.2))); }, { passive: true });
function openItem(catId, id) {
  const c = MODEL && MODEL.cats[catId], it = c && c.items.find((x) => x.id === id); if (!it) return;
  if (it.h) holdingDetail(it.h, S.india); else { showTab("holdings"); }
}

/* ---------- charts (SVG, drawn from the model) ---------- */
const CW = () => (innerWidth < 640 ? 400 : 760);
let cwLast = CW(); addEventListener("resize", () => { if (CW() !== cwLast && MODEL) { cwLast = CW(); renderAll(); } });
function niceMax(v) { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p; return ([1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((x) => f <= x) || 10) * p; }
function axisMoney(v) { return short(v).replace(".00", ""); }
/* stacked areas of each category's value over the months, with what went in drawn as a dashed line */
function stackChart(M) {
  const W = CW(), H = 260, pl = 56, pr = 14, pt = 16, pb = 30, n = M.months.length;
  const stacks = []; let base = M.months.map(() => 0);
  for (const id of CAT_ORDER) { const c = M.cats[id]; if (!c.covered) continue; const top = base.map((b, i) => b + c.val[i]); stacks.push({ c, lo: base, hi: top }); base = top; }
  const max = niceMax(Math.max(...base, ...M.inv) * 1.05), X = (i) => pl + (i * (W - pl - pr)) / (n - 1), Y = (v) => pt + (1 - v / max) * (H - pt - pb);
  const path = (arr) => arr.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("");
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  return `<svg class="chart stack" viewBox="0 0 ${W} ${H}" role="img" aria-label="Value by category over the last ${n} months">
    <defs>${stacks.map((s) => `<linearGradient id="g-${s.c.id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.c.hex}" stop-opacity=".9"/><stop offset="1" stop-color="${s.c.hex}" stop-opacity=".25"/></linearGradient>`).join("")}</defs>
    ${ticks.map((v) => `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${Y(v)}" y2="${Y(v)}"/><text class="yl" x="${pl - 8}" y="${Y(v) + 4}" text-anchor="end">${axisMoney(v)}</text>`).join("")}
    <g class="draw">${stacks.map((s) => `<path d="${path(s.hi)}L${X(n - 1)},${Y(s.lo[n - 1])}${s.lo.map((v, i) => `L${X(n - 1 - i).toFixed(1)},${Y(s.lo[n - 1 - i]).toFixed(1)}`).join("")}Z" fill="url(#g-${s.c.id})"/><path d="${path(s.hi)}" fill="none" stroke="${s.c.hex}" stroke-width="2"/>`).join("")}
    <path d="${path(M.inv)}" class="inv" fill="none"/></g>
    ${M.months.map((m, i) => (i % 2 === (n - 1) % 2 ? `<text class="xl" x="${X(i)}" y="${H - 8}" text-anchor="${i === 0 ? "start" : i === n - 1 ? "end" : "middle"}">${mShort(m)}</text>` : "")).join("")}
    ${M.months.map((m, i) => `<rect class="hit" data-i="${i}" x="${X(i) - (W - pl - pr) / (n - 1) / 2}" y="${pt}" width="${(W - pl - pr) / (n - 1)}" height="${H - pt - pb}"/>`).join("")}
    <line class="cursor" x1="0" x2="0" y1="${pt}" y2="${H - pb}"/>
  </svg>`;
}
/* one category: value (glowing area) against money put in (dashed) */
function lineChart(c, months) {
  const W = CW(), H = 240, pl = 56, pr = 14, pt = 16, pb = 30, n = months.length;
  const max = niceMax(Math.max(...c.val, ...c.inv) * 1.08), X = (i) => pl + (i * (W - pl - pr)) / (n - 1), Y = (v) => pt + (1 - v / max) * (H - pt - pb);
  const path = (arr) => arr.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("");
  return `<svg class="chart line" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(c.name)}: value and money put in over the last ${n} months" style="--c:${c.hex}">
    <defs><linearGradient id="a-${c.id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.hex}" stop-opacity=".45"/><stop offset="1" stop-color="${c.hex}" stop-opacity="0"/></linearGradient>
      <filter id="glow-${c.id}" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    ${[0, 0.25, 0.5, 0.75, 1].map((f) => `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${Y(f * max)}" y2="${Y(f * max)}"/><text class="yl" x="${pl - 8}" y="${Y(f * max) + 4}" text-anchor="end">${axisMoney(f * max)}</text>`).join("")}
    <g class="draw"><path d="${path(c.val)}L${X(n - 1)},${Y(0)}L${X(0)},${Y(0)}Z" fill="url(#a-${c.id})"/>
    <path d="${path(c.inv)}" class="inv" fill="none"/>
    <path d="${path(c.val)}" fill="none" stroke="${c.hex}" stroke-width="3" filter="url(#glow-${c.id})" stroke-linejoin="round"/></g>
    <circle cx="${X(n - 1)}" cy="${Y(c.val[n - 1])}" r="5" fill="${c.hex}" class="end"/>
    ${months.map((m, i) => (i % 2 === (n - 1) % 2 ? `<text class="xl" x="${X(i)}" y="${H - 8}" text-anchor="${i === 0 ? "start" : i === n - 1 ? "end" : "middle"}">${mShort(m)}</text>` : "")).join("")}
    ${months.map((m, i) => `<rect class="hit" data-i="${i}" x="${X(i) - (W - pl - pr) / (n - 1) / 2}" y="${pt}" width="${(W - pl - pr) / (n - 1)}" height="${H - pt - pb}"/>`).join("")}
    <line class="cursor" x1="0" x2="0" y1="${pt}" y2="${H - pb}"/>
  </svg>`;
}
function wireChart(root, months, rowsAt) {
  const svg = root.querySelector("svg.chart"), tip = root.querySelector(".ctip"), cur = svg && svg.querySelector(".cursor"); if (!svg || !tip) return;
  const show = (i) => { const r = svg.querySelector(`.hit[data-i="${i}"]`), bx = +r.getAttribute("x") + +r.getAttribute("width") / 2; cur.setAttribute("x1", bx); cur.setAttribute("x2", bx); cur.classList.add("on");
    tip.hidden = false; tip.innerHTML = `<b>${mLong(months[i])}</b>${rowsAt(i)}`; const vb = svg.viewBox.baseVal, rect = svg.getBoundingClientRect(), px = (bx / vb.width) * rect.width; tip.style.left = Math.max(70, Math.min(rect.width - 70, px)) + "px"; };
  svg.querySelectorAll(".hit").forEach((r) => { r.addEventListener("pointerenter", () => show(+r.dataset.i)); r.addEventListener("click", () => show(+r.dataset.i)); });
  svg.addEventListener("pointerleave", () => { tip.hidden = true; cur.classList.remove("on"); });
}

/* ---------- small pieces ---------- */
const delta = (v, p) => `<span class="delta ${v >= 0 ? "pos" : "neg"}">${v >= 0 ? "▲" : "▼"} ${short(Math.abs(v))}${p != null ? ` · ${pct1(p)}` : ""}</span>`;
const stat = (k, v, s, cls) => `<div class="stat ${cls || ""}"><span class="k">${k}</span><b class="v num">${v}</b>${s ? `<span class="s">${s}</span>` : ""}</div>`;
function sipLine(c) { return c.sip ? `${fmt(c.sip)} a month` : "No regular monthly buying found"; }
function projCard(c, label) {
  const yrs = [5, 10, 15, 20];
  return `<div class="glass card proj" style="--c:${c.hex}"><div class="ch"><h2>${label || "Where this could be"}</h2><p class="note">Today ${fmt(c.value)}${c.sip ? `, adding ${fmt(c.sip)} a month (${c.sipSrc})` : ", with nothing more added"}. Range: cautious ${(c.rates[0] * 100).toFixed(1).replace(".0", "")}%, likely ${(c.rates[1] * 100).toFixed(1).replace(".0", "")}%, strong ${(c.rates[2] * 100).toFixed(1).replace(".0", "")}% a year${c.xirr != null ? `. Your own past return: ${pct1(c.xirr)} a year` : ""}.</p></div>
    <div class="proj-grid">${yrs.map((y) => { const v = c.rates.map((r) => fv(c.value, c.sip, r, y)), put = c.value + c.sip * 12 * y, mx = fv(c.value, c.sip, c.rates[2], 20);
      return `<div class="pj"><span class="yr">In ${y} years</span><b class="num">${short(v[1])}</b><span class="rng">${short(v[0])} – ${short(v[2])}</span><span class="bar"><i class="put" style="width:${(100 * put) / mx}%"></i><i class="lo" style="width:${(100 * v[0]) / mx}%"></i><i class="hi" style="left:${(100 * v[0]) / mx}%;width:${(100 * (v[2] - v[0])) / mx}%"></i></span><span class="note">you put in ${short(put)}</span></div>`; }).join("")}</div></div>`;
}
function holdList(c, limit) {
  const rows = c.items.slice(0, limit || c.items.length), mx = Math.max(1, ...c.items.map((x) => x.value));
  return `<ol class="hlist" style="--c:${c.hex}">${rows.map((it) => { const g = it.cost != null ? it.value - it.cost : null, gp = it.cost ? g / it.cost : null;
    return `<li><button type="button" class="hl" data-cat="${c.id}" data-id="${esc(it.id)}"><span class="nm"><b>${esc(it.name)}</b><span>${esc(it.sub || "")}</span></span><span class="bar"><i style="width:${(100 * it.value) / mx}%"></i></span><span class="val num">${fmt(it.value)}</span><span class="gn num ${g == null ? "" : g >= 0 ? "pos" : "neg"}">${g == null ? "buy price not uploaded" : `${g >= 0 ? "+" : "−"}${short(Math.abs(g))} · ${pct1(gp)}`}</span></button></li>`; }).join("")}</ol>`;
}
function wireList(root) { root.querySelectorAll(".hl[data-id]").forEach((b) => (b.onclick = () => openItem(b.dataset.cat, b.dataset.id))); }

/* ---------- Home ---------- */
function renderHome() {
  const el = $("#p-overview"), M = MODEL;
  if (!M.total) {
    el.innerHTML = `<div class="hero"><div class="hero-l"><p class="kick">Your money, as a city</p><h1 class="big">Upload a statement to build your city</h1><p class="lead">Each building is one of your investments. Start with the CDSL or NSDL statement (CAS) that is emailed to you every month; it lists every share, mutual fund and bond under your PAN. Nothing is typed in.</p><div class="row"><button class="btn primary" data-go="upload">Upload your CAS</button></div></div></div>`;
    return;
  }
  const n = M.months.length, last = M.val[n - 1], prev = M.val[n - 2], putIn = M.inv[n - 1] - M.inv[n - 2], growth = last - prev - putIn;
  const gain = M.cost ? CAT_ORDER.reduce((a, id) => a + (M.cats[id].gain || 0), 0) : null, known = CAT_ORDER.reduce((a, id) => a + M.cats[id].cost, 0);
  const sipAll = CAT_ORDER.reduce((a, id) => a + M.cats[id].sip, 0);
  const tenY = CAT_ORDER.reduce((a, id) => a + fv(M.cats[id].value, M.cats[id].sip, M.cats[id].rates[1], 10), 0);
  const goal = S.settings.goal;
  el.innerHTML = `
  <div class="hero">
    <div class="hero-l">
      <p class="kick">All investments · ${new Date(TODAY + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}</p>
      <h1 class="big num" aria-label="All investments ${fmt(M.total)}"><span ${cnt(M.total)}>${fmt(M.total)}</span></h1>
      <div class="chips">${gain != null ? `<span class="pill ${gain >= 0 ? "pos" : "neg"}">${gain >= 0 ? "+" : "−"}${short(Math.abs(gain))} gain on ${short(known)} put in</span>` : ""}
        <span class="pill">${short(growth >= 0 ? growth : -growth)} ${growth >= 0 ? "growth" : "fall"} in ${mShort(M.months[n - 1])} (besides ${short(Math.max(0, putIn))} added)</span>
        ${sipAll ? `<span class="pill">${fmt(sipAll)} going in each month</span>` : ""}</div>
    </div>
    <div class="districts">${CAT_ORDER.map((id) => { const c = M.cats[id]; if (!c.items.length) return ""; return `<button type="button" class="dist glass" data-go="${TAB_OF[id]}" style="--c:${c.hex}"><span class="dn">${c.name}</span><b class="num">${short(c.value)}</b><span class="dm"><span>${((100 * c.value) / M.total).toFixed(0)}% of all</span>${c.gainPct != null ? `<span class="${c.gainPct >= 0 ? "pos" : "neg"}">${pct1(c.gainPct)}</span>` : ""}</span><span class="dbar"><i style="width:${(100 * c.value) / M.total}%"></i></span></button>`; }).join("")}</div>
    <div class="replay glass" id="replay"><button type="button" class="playbtn" id="play" aria-label="Replay the last 12 months"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg></button><div><label for="mslider">Replay the city: <b id="mlabel">today</b></label><input type="range" id="mslider" min="0" max="${n - 1}" value="${n - 1}" step="1"></div></div>
  </div>
  <div class="grid g2">
    <div class="glass card span2" id="growth-card"><div class="ch"><h2>How your money grew</h2><p class="note">Month-end value of each category for the holdings with purchase dates (${(100 * CAT_ORDER.reduce((a, id) => a + M.cats[id].covered, 0) / M.total).toFixed(0)}% of your money). The dashed line is what you put in.</p></div>
      <div class="chart-wrap">${stackChart(M)}<div class="ctip" hidden></div></div>
      <div class="legend">${CAT_ORDER.filter((id) => M.cats[id].covered).map((id) => `<span><i style="background:${M.cats[id].hex}"></i>${M.cats[id].name}</span>`).join("")}<span><i class="dash"></i>Money put in</span></div>
      ${histNote()}</div>
    <a class="glass card goal-teaser" href="#goals" data-go="goals"><div class="ch"><h2>${goal ? `Goal: ${short(goal.amt)} by ${goal.year}` : "Will you reach your goal?"}</h2></div>
      ${goal ? goalVerdictMini(goal) : `<p class="lead-s">In 10 years at likely rates, with today's monthly investing, your money could be about <b>${short(tenY)}</b>.</p><span class="btn primary">Pick a goal</span>`}</a>
    <div class="glass card"><div class="ch"><h2>Going in every month</h2><p class="note">Read from your purchases, not typed in.</p></div>
      <ul class="sips">${CAT_ORDER.map((id) => { const c = M.cats[id]; if (!c.items.length) return ""; return `<li style="--c:${c.hex}"><span class="dot"></span><span>${c.name}</span><b class="num">${c.sip ? fmt(c.sip) : "—"}</b></li>`; }).join("")}<li class="tot"><span></span><span>Total</span><b class="num">${fmt(sipAll)}</b></li></ul></div>
  </div>
  ${gameBlock()}
  <div class="grid g2">${freshCard()}${aiCard()}</div>`;
  countUp(el);
  wireChart($("#growth-card"), M.months, (i) => CAT_ORDER.filter((id) => M.cats[id].covered).map((id) => `<span><i style="background:${M.cats[id].hex}"></i>${M.cats[id].short} <b>${short(M.cats[id].val[i])}</b></span>`).join("") + `<span class="tt">Total <b>${short(M.val[i])}</b> · put in ${short(M.inv[i])}</span>`);
  const sl = $("#mslider"), lab = $("#mlabel"), set = (i) => { sl.value = i; lab.textContent = i >= n - 1 ? "today" : mLong(M.months[i]); if (window.City) window.City.setMonth(i >= n - 1 ? -1 : i); };
  sl.oninput = () => set(+sl.value);
  let timer = null; $("#play").onclick = () => { clearInterval(timer); let i = 0; set(0); timer = setInterval(() => { i++; set(i); if (i >= n - 1) clearInterval(timer); }, 650); };
  wireGame(el); wireAi(el);
}
function histNote() {
  const miss = CAT_ORDER.reduce((a, id) => a + MODEL.cats[id].histMissing, 0);
  return miss ? `<p class="note warn">Some month-end prices are still being collected (the nightly job fills a few holdings at a time), so a few earlier months use the buy price for now.</p>` : "";
}
/* the game layer: level, quests and badges */
function gameBlock() {
  if (!hasData() && !(S && S.india)) return "";
  const p = player(), got = p.ach.filter((a) => a.got).length, pct = p.mis.length ? (100 * p.done) / p.mis.length : 0;
  const month = new Date(TODAY + "T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  return `<div class="grid g3 game">
    <div class="glass card level"><div class="medal3d" aria-hidden="true"><i></i><b>${p.lvl}</b></div><div><span class="kick">Level ${p.lvl}</span><h2>${esc(p.rank)}</h2><p class="note">${p.nextR ? `${p.nextR[0] - p.months} more investing month${p.nextR[0] - p.months === 1 ? "" : "s"} to ${esc(p.nextR[1])}` : "Top rank"} · ${p.streak}-month streak</p>
      <div class="xp" role="progressbar" aria-valuemin="0" aria-valuemax="${p.mis.length}" aria-valuenow="${p.done}" aria-label="Missions this month"><i style="width:${pct}%"></i><span>${p.done}/${p.mis.length} missions this month</span></div></div></div>
    <div class="glass card"><div class="ch"><h2>Missions for ${month}</h2></div><ul class="missions">${p.mis.map((m) => `<li class="${m.done ? "done" : ""}"><span class="mk" aria-hidden="true">${m.done ? ic("check") : ""}</span><span>${m.title}</span><span class="xpb">+${m.xp} XP</span></li>`).join("")}</ul></div>
    <div class="glass card"><div class="ch"><h2>Badges</h2><p class="note">${got} of ${p.ach.length} unlocked</p></div><div class="badges">${p.ach.map((a) => `<div class="badge ${a.got ? "got" : ""} tilt" title="${esc(a.how)}"><span class="bi">${svg(a.k)}</span><b>${esc(a.name)}</b></div>`).join("")}</div></div>
  </div>`;
}
function wireGame() {}
function freshCard() {
  const ref = S.settings.refreshedAt ? ist(Date.parse(S.settings.refreshedAt)) : "not yet", nx = nextRefresh(Date.now());
  return `<div class="glass card fresh"><div class="ch"><h2>Prices</h2></div><p class="lead-s">Last refreshed <b>${esc(ref)}</b>${nx ? `, next ${ist(nx)} IST` : ""}. Indian prices as of ${S.india && S.india.pricedAt ? fmtDate(S.india.pricedAt) : "your statement"}, ₹${S.settings.fx} per $.</p><div><button type="button" class="btn" id="fr-now">Refresh my prices now</button></div></div>`;
}
function aiCard() {
  const M = MODEL, cs = CAT_ORDER.map((id) => M.cats[id]).filter((c) => c.items.length), best = cs.filter((c) => c.xirr != null).sort((a, b) => b.xirr - a.xirr)[0];
  const lines = [best ? `${best.name} ${best.id === "abroad" ? "investments have" : "have"} returned ${pct1(best.xirr)} a year since ${fmtDate(best.since)}.` : "", `${cs.sort((a, b) => b.value - a.value)[0].name} hold ${((100 * cs[0].value) / M.total).toFixed(0)}% of your money.`].filter(Boolean);
  return `<div class="glass card insight"><div class="ch"><h2>AI take</h2></div><p class="lead-s">${lines.map(esc).join(" ")}</p><div class="ans" id="ins-a" hidden></div>
    <form class="ask" id="ins-form"><label class="sr" for="ins-q">Ask about your portfolio</label><input id="ins-q" placeholder="${sampleFn ? "Ask anything about your money" : "AI helper is off"}" ${sampleFn ? "" : "disabled"} autocomplete="off"><button class="btn send" type="submit" aria-label="Ask" ${sampleFn ? "" : "disabled"}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg></button></form></div>`;
}
function wireAi(root) { const f = root.querySelector("#ins-form"); if (f) f.onsubmit = (e) => { e.preventDefault(); const q = $("#ins-q").value.trim(); if (q) ask(q, $("#ins-a")); }; const b = root.querySelector("#fr-now"); if (b) b.onclick = () => refreshNowClick(b); }

/* ---------- one category screen ---------- */
function renderCat(id) {
  const el = $("#p-" + id), M = MODEL, c = M.cats[id];
  if (!c.items.length) {
    el.innerHTML = `<div class="hero cat" style="--c:${c.hex}"><div class="hero-l"><p class="kick">${c.name}</p><h1 class="big">No ${c.name.toLowerCase()} yet</h1><p class="lead">They appear here from your CDSL or NSDL statement (CAS) and broker reports.</p><div class="row"><button class="btn primary" data-go="upload">Upload reports</button></div></div></div>`; return;
  }
  const n = M.months.length, last = c.val[n - 1], prev = c.val[n - 2], putIn = c.inv[n - 1] - c.inv[n - 2];
  const extras = id === "funds" ? fundMix(c) : id === "bonds" ? bondCard(indHoldings(S.india), S.india).replace(/class="card\b[^"]*"/, 'class="glass card"') : id === "stocks" ? movers(c) : "";
  el.innerHTML = `
  <div class="hero cat" style="--c:${c.hex}">
    <div class="hero-l">
      <p class="kick">${c.name} · ${c.items.length} holding${c.items.length === 1 ? "" : "s"}</p>
      <h1 class="big num"><span ${cnt(c.value)}>${fmt(c.value)}</span></h1>
      <div class="chips">${c.gain != null ? `<span class="pill ${c.gain >= 0 ? "pos" : "neg"}">${c.gain >= 0 ? "+" : "−"}${short(Math.abs(c.gain))} · ${pct1(c.gainPct)} on ${short(c.cost)} put in</span>` : ""}
        ${c.xirr != null ? `<span class="pill">${pct1(c.xirr)} a year since ${fmtDate(c.since)}</span>` : ""}
        <span class="pill">${sipLine(c)}</span></div>
    </div>
    <div class="statrow glass">${stat("Value", short(c.value))}${stat("Put in", c.cost ? short(c.cost) : "—", c.known < c.value - 1 ? `buy price known for ${((100 * c.known) / c.value).toFixed(0)}%` : "")}${stat("Gain", c.gain != null ? (c.gain >= 0 ? "+" : "−") + short(Math.abs(c.gain)) : "—", c.gainPct != null ? pct1(c.gainPct) : "", c.gain == null ? "" : c.gain >= 0 ? "pos" : "neg")}${stat("This month", (last - prev - putIn >= 0 ? "+" : "−") + short(Math.abs(last - prev - putIn)), "market move, besides money added", last - prev - putIn >= 0 ? "pos" : "neg")}</div>
  </div>
  <div class="grid g2">
    <div class="glass card span2" id="cat-chart-${id}"><div class="ch"><h2>Growth over the last ${n} months</h2><p class="note">Value of ${c.coverage < 0.995 ? `the holdings with purchase dates (${(100 * c.coverage).toFixed(0)}% of ${c.name.toLowerCase()})` : `your ${c.name.toLowerCase()}`} at each month end, against the money put in (dashed).${id === "bonds" ? " Bonds are shown at the price you paid; their interest arrives as payouts below." : ""}</p></div>
      <div class="chart-wrap">${lineChart(c, M.months)}<div class="ctip" hidden></div></div>${histNote()}</div>
  </div>
  <div class="cols"><div class="col">${projCard(c)}${id === "bonds" ? "" : extras}</div>
    <div class="col"><div class="glass card"><div class="ch"><h2>Your ${c.name.toLowerCase()}</h2><p class="note">Largest first. Tap one for its purchases, returns and tax.</p></div>${holdList(c)}</div></div></div>${id === "bonds" ? extras : ""}`;
  countUp(el);
  wireChart($("#cat-chart-" + id), M.months, (i) => `<span><i style="background:${c.hex}"></i>Value <b>${short(c.val[i])}</b></span><span><i class="dash"></i>Put in <b>${short(c.inv[i])}</b></span>`);
  wireList(el);
  if (id === "bonds") el.querySelectorAll(".hrow").forEach((tr) => { tr.onclick = () => { const h = indHoldings(S.india).find((x) => x.key === tr.dataset.hk); if (h) holdingDetail(h, S.india); }; });
}
function fundMix(c) {
  const by = {}; for (const it of c.items) { const k = (it.h && it.h.cls) || "Other"; by[k] = (by[k] || 0) + it.value; }
  const rows = Object.entries(by).sort((a, b) => b[1] - a[1]), col = { Equity: "#c084fc", Hybrid: "#f472b6", Debt: "#fbbf24", "Gold & silver": "#facc15", International: "#fb7185", Other: "#94a3b8" };
  return `<div class="glass card"><div class="ch"><h2>What your funds hold</h2></div><div class="mixbar">${rows.map(([k, v]) => `<i style="width:${(100 * v) / c.value}%;background:${col[k] || "#94a3b8"}" title="${esc(k)}"></i>`).join("")}</div>
    <ul class="mix">${rows.map(([k, v]) => `<li><span class="dot" style="background:${col[k] || "#94a3b8"}"></span><span>${esc(k)}</span><b class="num">${short(v)}</b><em>${((100 * v) / c.value).toFixed(0)}%</em></li>`).join("")}</ul></div>`;
}
function movers(c) {
  const g = c.items.filter((x) => x.cost).map((x) => ({ x, p: (x.value - x.cost) / x.cost })).sort((a, b) => b.p - a.p), up = g.slice(0, 4), dn = g.slice(-4).reverse().filter((r) => r.p < 0);
  const row = (r) => `<li><button type="button" class="hl mini" data-cat="${c.id}" data-id="${esc(r.x.id)}"><span>${esc(r.x.name)}</span><b class="num ${r.p >= 0 ? "pos" : "neg"}">${pct1(r.p)}</b></button></li>`;
  return `<div class="glass card"><div class="ch"><h2>Best and worst</h2><p class="note">Return on what you paid.</p></div><h3 class="sub">Best</h3><ul class="movers">${up.map(row).join("")}</ul>${dn.length ? `<h3 class="sub">Down</h3><ul class="movers">${dn.map(row).join("")}</ul>` : ""}</div>`;
}

/* ---------- Abroad: a header over the existing holdings table ---------- */
function abroadHero() {
  const el = $("#p-holdings"), c = MODEL.cats.abroad; if (!c.items.length || el.querySelector(".hero")) return;
  const box = document.createElement("div");
  box.innerHTML = `<div class="hero cat" style="--c:${c.hex}"><div class="hero-l"><p class="kick">Abroad · US, Japan and London</p><h1 class="big num">${fmt(c.value)}</h1>
    <div class="chips">${c.gain != null ? `<span class="pill ${c.gain >= 0 ? "pos" : "neg"}">${c.gain >= 0 ? "+" : "−"}${short(Math.abs(c.gain))} · ${pct1(c.gainPct)}</span>` : ""}<span class="pill">${sipLine(c)}</span><button class="pill linkish" data-go="plan">This month's buys</button></div></div></div>
    <div class="grid g2"><div class="glass card span2" id="cat-chart-abroad"><div class="ch"><h2>Growth over the last ${MODEL.months.length} months</h2><p class="note">In rupees at INDmoney's rate on each date. Dashed: money put in.</p></div><div class="chart-wrap">${lineChart(c, MODEL.months)}<div class="ctip" hidden></div></div>${histNote()}</div>${projCard(c)}</div>`;
  el.prepend(...box.children);
  wireChart($("#cat-chart-abroad"), MODEL.months, (i) => `<span><i style="background:${c.hex}"></i>Value <b>${short(c.val[i])}</b></span><span><i class="dash"></i>Put in <b>${short(c.inv[i])}</b></span>`);
}

/* ---------- Goals: tap a goal and a year; see whether today's investing gets there ---------- */
function goalCalc(goal) {
  const M = MODEL, yrs = Math.max(0.5, goal.year - +TODAY.slice(0, 4) + (12 - +TODAY.slice(5, 7)) / 12 - 1 + 1);
  const at = (k) => CAT_ORDER.reduce((a, id) => a + fv(M.cats[id].value, M.cats[id].sip, M.cats[id].rates[k], yrs), 0);
  const ex = goal.extra || 0, wk = (k) => CAT_ORDER.reduce((a, id) => a + M.cats[id].value * M.cats[id].rates[k], 0) / (M.total || 1);
  const v = [0, 1, 2].map((k) => at(k) + fv(0, ex, wk(k), yrs)), sip = CAT_ORDER.reduce((a, id) => a + M.cats[id].sip, 0) + ex;
  // blended likely rate (weighted by money) to work out the monthly amount the goal needs
  const w = CAT_ORDER.reduce((a, id) => a + M.cats[id].value * M.cats[id].rates[1], 0) / (M.total || 1), i = Math.pow(1 + w, 1 / 12) - 1, n = Math.round(yrs * 12), g = Math.pow(1 + i, n);
  const need = Math.max(0, (goal.amt - M.total * g) / (((g - 1) / i) * (1 + i)));
  const level = v[0] >= goal.amt ? 3 : v[1] >= goal.amt ? 2 : v[2] >= goal.amt ? 1 : 0;
  return { yrs, v, sip, need, level, w, ex, wk };
}
const VERDICT = [
  ["off", "Not on track yet", (g, r) => `Even a strong market gets you to about ${short(r.v[2])}. Investing about ${fmt(Math.ceil(r.need / 500) * 500)} a month (now ${fmt(r.sip)}) reaches ${short(g.amt)} at the likely rate.`],
  ["edge", "Only in a strong market", (g, r) => `Likely about ${short(r.v[1])}. To reach ${short(g.amt)} at the likely rate, invest about ${fmt(Math.ceil(r.need / 500) * 500)} a month instead of ${fmt(r.sip)}.`],
  ["on", "On track at the likely rate", (g, r) => `Likely about ${short(r.v[1])} by ${g.year}. A cautious market would leave you at ${short(r.v[0])}.`],
  ["sure", "On track, even in a cautious market", (g, r) => `Cautious ${short(r.v[0])}, likely ${short(r.v[1])} by ${g.year}.`],
];
function goalVerdictMini(goal) { const r = goalCalc(goal), [cls, title] = VERDICT[r.level]; return `<p class="verdict ${cls}"><b>${title}</b><span>likely ${short(r.v[1])} by ${goal.year}</span></p>`; }
function goalChart(goal, r) {
  const M = MODEL, W = CW(), H = 280, pl = 64, pr = 18, pt = 20, pb = 34, Y0 = +TODAY.slice(0, 4), years = Math.max(1, Math.ceil(r.yrs)), pts = years * 4;
  const at = (k, t) => CAT_ORDER.reduce((a, id) => a + fv(M.cats[id].value, M.cats[id].sip, M.cats[id].rates[k], t), 0) + fv(0, r.ex, r.wk(k), t);
  const ser = [0, 1, 2].map((k) => Array.from({ length: pts + 1 }, (_, j) => at(k, (j / pts) * r.yrs))), put = Array.from({ length: pts + 1 }, (_, j) => M.total + r.sip * 12 * (j / pts) * r.yrs);
  const max = niceMax(Math.max(goal.amt, ser[2][pts]) * 1.08), X = (j) => pl + (j / pts) * (W - pl - pr), Y = (v) => pt + (1 - v / max) * (H - pt - pb);
  const path = (a) => a.map((v, j) => `${j ? "L" : "M"}${X(j).toFixed(1)},${Y(v).toFixed(1)}`).join("");
  const cross = ser[1].findIndex((v) => v >= goal.amt);
  return `<svg class="chart goal" viewBox="0 0 ${W} ${H}" role="img" aria-label="Projected value to ${goal.year} against the goal of ${short(goal.amt)}">
    <defs><linearGradient id="band" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#34d399" stop-opacity=".35"/><stop offset="1" stop-color="#22d3ee" stop-opacity=".12"/></linearGradient>
      <filter id="glowg" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    ${[0, 0.25, 0.5, 0.75, 1].map((f) => `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${Y(f * max)}" y2="${Y(f * max)}"/><text class="yl" x="${pl - 8}" y="${Y(f * max) + 4}" text-anchor="end">${axisMoney(f * max)}</text>`).join("")}
    <g class="draw"><path d="${path(ser[2])}${ser[0].map((v, j) => `L${X(pts - j).toFixed(1)},${Y(ser[0][pts - j]).toFixed(1)}`).join("")}Z" fill="url(#band)"/>
    <path d="${path(put)}" class="inv" fill="none"/>
    <path d="${path(ser[1])}" fill="none" stroke="#34d399" stroke-width="3" filter="url(#glowg)"/></g>
    <line class="goal-line" x1="${pl}" x2="${W - pr}" y1="${Y(goal.amt)}" y2="${Y(goal.amt)}"/>
    <text class="goal-lab" x="${W - pr}" y="${Y(goal.amt) - 8}" text-anchor="end">Goal ${short(goal.amt)}</text>
    ${cross > 0 ? `<circle cx="${X(cross)}" cy="${Y(ser[1][cross])}" r="7" class="hit-goal"/><text class="cross-lab" x="${X(cross)}" y="${Y(ser[1][cross]) + 24}" text-anchor="middle">reached ${Y0 + Math.floor((cross / pts) * r.yrs + (+TODAY.slice(5, 7) - 1) / 12)}</text>` : ""}
    ${Array.from({ length: Math.floor(r.yrs) + 1 }, (_, k) => k).filter((k) => k % Math.max(1, Math.ceil(years / 6)) === 0 && k / r.yrs < 0.9).map((k) => `<text class="xl" x="${X(Math.round((k / r.yrs) * pts))}" y="${H - 10}" text-anchor="${k ? "middle" : "start"}">${Y0 + k}</text>`).join("")}<text class="xl" x="${X(pts)}" y="${H - 10}" text-anchor="end">${goal.year}</text>
  </svg>`;
}
function meter(goal, r) {
  const top = Math.max(goal.amt, r.v[2]) * 1.04, at = (v) => Math.min(100, (100 * v) / top);
  const marks = [["Today", MODEL.total, "now"], ["Cautious", r.v[0], "k0"], ["Likely", r.v[1], "k1"], ["Strong", r.v[2], "k2"]];
  return `<div class="meter" role="img" aria-label="By ${goal.year}: cautious ${short(r.v[0])}, likely ${short(r.v[1])}, strong ${short(r.v[2])}, against a goal of ${short(goal.amt)}; today ${short(MODEL.total)}">
    <div class="mbar"><i style="width:${at(MODEL.total)}%"></i><span class="band" style="left:${at(r.v[0])}%;width:${at(r.v[2]) - at(r.v[0])}%"></span>
      ${marks.map(([n, v, k]) => `<em class="mk ${k}" style="left:${at(v)}%"><span>${n}<b>${short(v)}</b></span></em>`).join("")}
      <b class="goalmark" style="left:${at(goal.amt)}%"><span>Goal ${short(goal.amt)}</span></b></div></div>`;
}
function renderGoals() {
  const el = $("#p-goals"), M = MODEL;
  if (!M.total) { el.innerHTML = `<div class="hero"><div class="hero-l"><p class="kick">Goals</p><h1 class="big">Upload a statement first</h1><p class="lead">The goal check works out where your current investments and monthly investing lead.</p><div class="row"><button class="btn primary" data-go="upload">Upload</button></div></div></div>`; return; }
  const Y = +TODAY.slice(0, 4), years = [5, 10, 15, 20, 25].map((k) => Y + k), goal = S.settings.goal, age = S.settings.age && S.settings.ageYear ? (y) => S.settings.age + (y - S.settings.ageYear) : null;
  const r = goal ? goalCalc(goal) : null, vd = r ? VERDICT[r.level] : null;
  el.innerHTML = `
  <div class="hero goal-hero">
    <div class="hero-l"><p class="kick">Goal check</p><h1 class="big">${goal ? `${short(goal.amt)} by ${goal.year}` : "Pick a goal and a year"}</h1>
      <p class="lead">Tap an amount and a year. The check uses what you hold today and what goes in each month, read from your statements.</p></div>
    <div class="glass card picker"><div><span class="kick">Goal</span><div class="seg">${GOALS.map((a) => `<button type="button" class="chipbtn" data-gamt="${a}" aria-pressed="${!!goal && goal.amt === a}">${short(a)}</button>`).join("")}</div></div>
      <div><span class="kick">Each month, on top of today's ${fmt(r ? r.sip - r.ex : CAT_ORDER.reduce((a, id) => a + M.cats[id].sip, 0))}</span><div class="seg">${[0, 5000, 10000, 25000, 50000].map((x) => `<button type="button" class="chipbtn" data-gex="${x}" aria-pressed="${(goal ? goal.extra || 0 : 0) === x}">${x ? "+" + short(x) : "Same"}</button>`).join("")}</div></div>
      <div><span class="kick">By</span><div class="seg">${years.map((y) => `<button type="button" class="chipbtn" data-gyr="${y}" aria-pressed="${!!goal && goal.year === y}">${y}${age ? `<small>age ${age(y)}</small>` : ""}</button>`).join("")}</div></div></div>
  </div>
  ${goal ? `<div class="glass card verdict-card ${vd[0]}"><div class="vd-ic" aria-hidden="true">${vd[0] === "off" ? ic("alert") : vd[0] === "edge" ? ic("up") : ic("check")}</div><div><h2>${vd[1]}</h2><p class="lead-s">${vd[2](goal, r)}</p></div>
      ${meter(goal, r)}</div>
    <div class="grid g2"><div class="glass card span2"><div class="ch"><h2>Your path to ${goal.year}</h2><p class="note">Green line: likely. Shaded: cautious to strong. Dashed: what you'd have put in by then.</p></div>${goalChart(goal, r)}</div>
      <div class="glass card span2"><div class="ch"><h2>By category in ${goal.year}</h2><p class="note">At the likely rate, with today's monthly investing continuing.</p></div>
        <div class="tbl-wrap"><table class="gtab"><thead><tr><th>Category</th><th class="r">Today</th><th class="r">Each month</th><th class="r">Likely rate</th><th class="r">In ${goal.year}</th></tr></thead><tbody>
        ${CAT_ORDER.filter((id) => M.cats[id].items.length).map((id) => { const c = M.cats[id]; return `<tr style="--c:${c.hex}"><td class="nowrap"><span class="dot"></span>${c.name}</td><td class="r num">${short(c.value)}</td><td class="r num">${c.sip ? fmt(c.sip) : "—"}</td><td class="r num">${(c.rates[1] * 100).toFixed(1).replace(".0", "")}%</td><td class="r num"><b>${short(fv(c.value, c.sip, c.rates[1], r.yrs))}</b></td></tr>`; }).join("")}
        </${r.ex ? `<tr><td class="nowrap"><span class="dot" style="--c:#fff"></span>Extra you add</td><td class="r num">—</td><td class="r num">${fmt(r.ex)}</td><td class="r num">${(r.w * 100).toFixed(1)}%</td><td class="r num"><b>${short(fv(0, r.ex, r.w, r.yrs))}</b></td></tr>` : ""}</tbody><tfoot><tr><td>Total</td><td class="r num">${short(M.total)}</td><td class="r num">${fmt(r.sip)}</td><td class="r num">${(r.w * 100).toFixed(1)}%</td><td class="r num">${short(r.v[1])}</td></tr></tfoot></table></div></div></div>` : `<div class="grid g4">${CAT_ORDER.filter((id) => M.cats[id].items.length).map((id) => projCard(M.cats[id], M.cats[id].name)).join("")}</div>`}
  <p class="note fine">Rates are long-run assumptions, not promises: equity funds 8–14%, stocks 7–16%, bonds 6.5–9.5%, abroad in rupees 7–14% a year. Monthly investing is read from your last six months of purchases (abroad: your monthly plan). Inflation is not taken out.</p>`;
  el.querySelectorAll("[data-gamt]").forEach((b) => (b.onclick = () => { S.settings.goal = { ...(S.settings.goal || {}), amt: +b.dataset.gamt, year: (S.settings.goal && S.settings.goal.year) || Y + 10 }; dirty(); renderGoals(); renderHomeTeaser(); }));
  el.querySelectorAll("[data-gex]").forEach((b) => (b.onclick = () => { S.settings.goal = { amt: (S.settings.goal && S.settings.goal.amt) || 1e7, year: (S.settings.goal && S.settings.goal.year) || Y + 10, extra: +b.dataset.gex }; dirty(); renderGoals(); renderHomeTeaser(); }));
  el.querySelectorAll("[data-gyr]").forEach((b) => (b.onclick = () => { S.settings.goal = { ...(S.settings.goal || {}), amt: (S.settings.goal && S.settings.goal.amt) || 1e7, year: +b.dataset.gyr }; dirty(); renderGoals(); renderHomeTeaser(); }));
}
function renderHomeTeaser() { if (document.body.dataset.tab !== "overview") renderHome(); }

/* ---------- Upload: what to upload next to fill in buy prices ---------- */
function uploadGuide() {
  const el = $("#p-upload"), I = S && S.india; if (!I || el.querySelector(".guide")) return;
  const H = indHoldings(I), need = (acct, types) => H.filter((h) => h.acct === acct && types.includes(h.type) && h.cost == null).length;
  const g = [
    ["Groww", "Reports → Stocks → Holdings report (Excel)", "buy price of each share and ETF", need("Groww", ["stock", "etf", "invit"])],
    ["Groww", "Reports → Mutual funds → Holdings report (Excel)", "amount invested in each fund", need("Groww", ["mf"])],
    ["Groww", "Reports → Transactions → Mutual Funds - Order history", "the date of each SIP instalment, for growth charts and tax dates", I.src && I.src.grMFO ? 0 : H.filter((h) => h.type === "mf" && h.acct === "Groww").length],
    ["Zerodha", "Console → Portfolio → Holdings → Download (Excel)", "buy price of each Zerodha holding", need("Zerodha", ["stock", "etf", "mf"])],
  ].filter((x) => x[3] > 0);
  if (!g.length) return;
  const box = document.createElement("div"); box.className = "glass card guide";
  box.innerHTML = `<div class="ch"><h2>Fill in the rest</h2><p class="note">These reports add buy prices and purchase dates the statement doesn't carry.</p></div><ol class="guide-list">${g.map((x) => `<li><b>${x[0]}</b> <span>${x[1]}</span><span class="note">Adds the ${x[2]} · ${x[3]} holding${x[3] > 1 ? "s" : ""}</span></li>`).join("")}</ol>`;
  el.prepend(box);
}
/* Sell & tax: the Indian long-term / short-term card on top */
function taxExtras() {
  const el = $("#p-tax"), I = S && S.india; if (!I || el.querySelector(".in-tax-card")) return;
  const html = inTaxCard(inTaxSummary(indHoldings(I), I)); if (!html) return;
  const box = document.createElement("div"); box.innerHTML = html; const card = box.firstElementChild; if (!card) return; card.classList.add("in-tax-card", "glass"); el.prepend(card);
}

/* ---------- tabs, page title, render ---------- */
const TABS2 = { overview: "Home", funds: "Mutual funds", stocks: "Stocks", bonds: "Bonds", holdings: "Abroad", goals: "Goals", plan: "Monthly plan", tax: "Sell & tax", calendar: "Yearly checklist", ask: "Ask about your money", upload: "Upload" };
const ALIAS = { india: "funds", growth: "goals" };
function showTab(t, scroll) {
  t = ALIAS[t] || t; if (!document.getElementById("p-" + t)) t = "overview";
  document.querySelectorAll("#tabs button[data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === t)));
  document.querySelectorAll("section.panel").forEach((p) => (p.hidden = p.id !== "p-" + t));
  document.body.dataset.tab = t; document.title = t === "overview" ? "One Portfolio" : `${TABS2[t] || t} · One Portfolio`;
  const mb = $("#morebtn"); if (mb) mb.classList.toggle("on", !!document.querySelector(`#tabs .xtra[data-tab="${t}"], #tabs .xtra-m[data-tab="${t}"]`));
  try { localStorage.setItem("gbp-tab", t); } catch (e) {}
  if (history.replaceState) history.replaceState(null, "", "#" + t);
  const p = document.getElementById("p-" + t); if (p) p.querySelectorAll(".chart .draw").forEach((g) => { g.classList.remove("go"); void g.getBoundingClientRect(); g.classList.add("go"); });
  if (scroll) window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  feedCity();
}
function renderAll() {
  syncLockBtn(); statusIdle();
  if (!S) { buildModelEmpty(); return; }
  buildModel();
  renderHome(); CAT_ORDER.slice(0, 3).forEach(renderCat); renderGoals();
  renderUpload(); uploadGuide(); renderHoldings(); abroadHero(); renderPlan(); renderTax(); taxExtras(); renderCalendar(); renderAsk();
  document.querySelectorAll("[data-cur]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cur === CUR)));
  feedCity();
}
function buildModelEmpty() { MODEL = { months: monthsList(), cats: Object.fromEntries(CAT_ORDER.map((id) => [id, { ...CATS[id], items: [], value: 0, cost: 0, known: 0, val: [], inv: [], covered: 0, histMissing: 0, sip: 0 }])), total: 0, cost: 0, val: [], inv: [] }; renderHome(); }
document.addEventListener("click", (e) => { const a = e.target.closest("a[data-go]"); if (a) e.preventDefault(); });

/* ---------- boot ---------- */
(function initTab() { let t = (location.hash || "").slice(1); try { t = t || localStorage.getItem("gbp-tab") || ""; } catch (e) {} showTab(t || "overview"); })();
renderAll();
boot();
