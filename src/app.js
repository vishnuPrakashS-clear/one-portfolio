/* ===== App: everything comes from uploaded files; nothing is typed in ===== */
let S = null, db = null, docRef = null, sampleFn = null, canImages = false, mode = "none", saving = false, again = false, timer = null, pending = null;
const TODAY = todayIso();
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const usdRaw = (v) => (v < 0 ? "−" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inr = (v) => (v < 0 ? "−" : "") + "₹" + Math.round(Math.abs(v)).toLocaleString("en-IN");
/* Show money in dollars (default) or rupees at INDmoney's latest rate; one currency at a time. Tax and growth pages stay in rupees. */
let CUR = "USD"; try { CUR = localStorage.getItem("gbp-cur") === "INR" ? "INR" : "USD"; } catch (e) {}
const fxNow = () => (S && S.settings && S.settings.fx) || 95;
const usd = (v) => (CUR === "INR" ? inr(v * fxNow()) : usdRaw(v));
function setCur(c) { CUR = c; try { localStorage.setItem("gbp-cur", c); } catch (e) {} document.querySelectorAll("[data-cur]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cur === c))); renderAll(); }
document.addEventListener("click", (e) => { const b = e.target.closest("[data-cur]"); if (b && b.dataset.cur !== CUR) setCur(b.dataset.cur); });
const sgn = (v) => (v >= 0 ? "+" : "−");
const pctf = (v) => sgn(v) + Math.abs(v * 100).toFixed(1) + "%";
const cls = (v) => (v > 0.0049 ? "pos" : v < -0.0049 ? "neg" : "");
const tk = (s) => esc(String(s).replace("LSE~", ""));
const BCOL = { "US core": "--b-core", "US tech": "--b-tech", Japan: "--b-japan", Copper: "--b-copper", Satellite: "--b-sat", Emerging: "--b-em" };
const bcol = (b) => `var(${BCOL[b] || "--b-em"})`;
const PLAN = { core: ["good", "In plan"], keep: ["neutral", "Hold"], legacy: ["wait", "Exit later"] };
const daysTxt = (n) => (n <= 0 ? "long-term now" : n < 60 ? `${n} days` : `${Math.round(n / 30.4)} months`);
const hasData = () => S && S.holdings.some((h) => qtyOf(h) > 1e-7);

function setStatus(kind, text) { $("#status").innerHTML = `<span class="dot ${kind}"></span><span>${esc(text)}</span>`; }
function oldestPrice() { return S ? S.holdings.filter((h) => qtyOf(h) > 1e-7 && h.priceAt).map((h) => h.priceAt).sort()[0] : null; }
function statusIdle() {
  if (mode === "none") return setStatus("busy", "Loading…");
  if (mode === "sberr") return setStatus("err", "Supabase isn't reachable · nothing can be saved");
  if (mode === "signedout") return setStatus("busy", "Signed out");
  const p = oldestPrice();
  setStatus(mode === "sb" ? "ok" : "err", (mode === "sb" ? `Saved to your account${OP.user ? " · " + OP.user.email : ""}` : "Not connected to Supabase") + (p ? ` · US prices: close of ${fmtDate(p)}` : ""));
}
function dirty() { if (!S || LOCKED) return; S.updatedAt = new Date().toISOString(); clearTimeout(timer); timer = setTimeout(save, 600); setStatus("busy", "Saving…"); }
async function save() {
  timer = null;
  if (!S || LOCKED || mode !== "sb") return;
  if (saving) { again = true; return; }
  saving = true;
  try { await cloudSave(S); sbBanner(null); statusIdle(); }
  catch (e) { const t = cloudErr(e); setStatus("err", "Not saved: " + t); sbBanner({ text: t }, () => save(), "Save again"); }
  saving = false; if (again) { again = false; save(); }
}
function sbBanner(w, act, label) {
  let b = $("#sbbanner"); if (!w) { if (b) b.hidden = true; return; }
  if (!b) { b = document.createElement("div"); b.id = "sbbanner"; b.className = "sbbanner"; b.setAttribute("role", "alert"); document.body.appendChild(b); }
  b.hidden = false; b.innerHTML = `<b>Supabase</b><span>${esc(w.text)}</span>${act ? `<button class="btn primary" type="button">${esc(label || "Try again")}</button>` : ""}`;
  if (act) b.querySelector("button").onclick = () => { b.hidden = true; act(); };
}
function adopt(d) { if (!d) return null; const n = Object.assign(freshState(), d); n.settings = Object.assign(freshState().settings, d.settings); n.imports = n.imports || []; if (n.targets) n.targets.forEach((t) => { if (t.buy === "LSE~CPPR") t.buy = "LSE~COPX"; }); return n; }
function syncUserBtn() { const b = $("#signout"); if (b) { b.hidden = !OP.user; b.title = OP.user ? `Sign out (${OP.user.email})` : "Sign out"; } }
async function boot() {
  const { data: { session } } = await sbc.auth.getSession();
  if (!session || OP.recovery) { mode = "signedout"; S = null; renderAll(); syncUserBtn(); showLogin(OP.recovery ? "newpass" : "signin"); return; }
  OP.user = session.user; hideLogin(); syncUserBtn();
  mode = "none"; statusIdle();
  let d;
  try { d = await cloudLoad(); } catch (e) { mode = "sberr"; renderAll(); sbBanner({ text: cloudErr(e) }, () => boot()); return; }
  mode = "sb"; sbBanner(null); S = adopt(d);
  if (S && S.lock && !sessOk() && !(OP.freshLogin && Date.now() - OP.freshLogin < 60000)) { HELD = S; S = null; LOCKED = true; showLock(); } else { if (OP.freshLogin) touchSess(); armIdle(); }
  renderAll();
  if (!aiTried) { aiTried = true; await aiSetup(); renderAsk(); renderHeader(); }
}
let aiTried = false;
// pick up prices written by the daily refresh when you come back to the tab
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible" || mode !== "sb" || saving || timer || !OP.user) return;
  try { const at = await cloudStamp(); if (at && at !== OP.at && !saving && !timer) { const d = await cloudLoad(); const n = adopt(d); if (LOCKED) HELD = n; else { S = n; renderAll(); } } } catch (e) {}
});

/* ---------- tabs ---------- */
const TAB_TITLE = { overview: "Overview", india: "India", upload: "Upload", holdings: "Abroad", plan: "Monthly plan", tax: "Sell & tax", growth: "Growth plan", calendar: "Yearly checklist", ask: "Ask about your money" };
function showTab(t, scroll) {
  document.querySelectorAll("#tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === t)));
  document.body.dataset.tab = t; const mbtn = $("#morebtn"); if (mbtn) mbtn.classList.toggle("on", !!document.querySelector(`#tabs .xtra[data-tab="${t}"]`)); const pt = $("#pt"); if (pt) pt.textContent = TAB_TITLE[t] || "One Portfolio";
  document.title = t === "overview" ? "One Portfolio" : `${TAB_TITLE[t] || t} · One Portfolio`;
  const sel = document.querySelector(`#tabs [data-tab="${t}"]`); if (sel && sel.scrollIntoView && innerWidth < 1180) sel.scrollIntoView({ block: "nearest", inline: "center" });
  document.querySelectorAll("section.panel").forEach((p) => (p.hidden = p.id !== "p-" + t));
  try { localStorage.setItem("gbp-tab", t); } catch (e) {}
  if (scroll) { const m = document.querySelector("main"), top = m ? m.getBoundingClientRect().top : 0; if (m && (top > innerHeight * 0.6 || top < 0)) m.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); }
}
addEventListener("scroll", () => document.body.classList.toggle("scrolled", scrollY > 4), { passive: true });
$("#tabs").addEventListener("click", (e) => {
  const nav = $("#tabs"), mb = $("#morebtn");
  if (e.target.closest("#morebtn")) { const open = !nav.classList.contains("open"); nav.classList.toggle("open", open); mb.setAttribute("aria-expanded", String(open)); return; }
  const b = e.target.closest("button[data-tab]"); if (b) { nav.classList.remove("open"); if (mb) mb.setAttribute("aria-expanded", "false"); showTab(b.dataset.tab, true); }
});
document.addEventListener("keydown", (e) => { const nav = $("#tabs"); if (e.key === "Escape" && nav && nav.classList.contains("open")) { nav.classList.remove("open"); $("#morebtn").setAttribute("aria-expanded", "false"); $("#morebtn").focus(); } });
document.addEventListener("click", (e) => { const g = e.target.closest("[data-go]"); if (g) showTab(g.dataset.go, true); });

/* ---------- app lock: a PIN on top of your Claude sign-in ----------
   The PIN is never stored: only a salted PBKDF2-SHA256 hash of it, inside your private data. Unlocking lasts for this
   browser tab until 10 minutes without activity. */
let LOCKED = false, HELD = null, lockTimer = null, lockTries = 0, lockWait = 0;
const LOCK_IDLE = 10 * 60 * 1000, PIN_ITER = 210000;
const b64 = (u8) => btoa(String.fromCharCode(...u8)), unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function pinHash(pin, salt, iter) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(pin)), "PBKDF2", false, ["deriveBits"]);
  return b64(new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: unb64(salt), iterations: iter }, k, 256)));
}
async function pinOk(pin) { const L = (S || HELD || {}).lock; return !!L && (await pinHash(pin, L.salt, L.iter)) === L.hash; }
function sessOk() { try { return Date.now() - (+sessionStorage.getItem("op-unlock") || 0) < LOCK_IDLE; } catch (e) { return false; } }
let lastTouch = 0;
function touchSess() { const n = Date.now(); if (n - lastTouch < 5000) return; lastTouch = n; try { sessionStorage.setItem("op-unlock", String(n)); } catch (e) {} armIdle(); }
function armIdle() { clearTimeout(lockTimer); if (S && S.lock && !LOCKED) lockTimer = setTimeout(lockNow, LOCK_IDLE); }
function lockNow() {
  if (!S || !S.lock || LOCKED) return;
  clearTimeout(timer); if (timer && !saving) save();
  HELD = S; S = null; LOCKED = true; try { sessionStorage.removeItem("op-unlock"); } catch (e) {}
  document.querySelectorAll("dialog[open]").forEach((d) => d.close()); renderAll(); showLock();
}
function syncLockBtn() { const b = $("#lockbtn"); if (b) b.hidden = !(S && S.lock); }
function showLock() {
  let d = $("#lockscr"); if (!d) { d = document.createElement("div"); d.id = "lockscr"; d.className = "lockscr"; d.setAttribute("role", "dialog"); d.setAttribute("aria-modal", "true"); d.setAttribute("aria-label", "App locked"); document.body.appendChild(d); }
  d.hidden = false; document.body.classList.add("locked");
  d.innerHTML = `<form class="lock-card" id="lockform" autocomplete="off"><div class="lock-ic" aria-hidden="true"><svg viewBox="0 0 24 24">${UI_IC.lock}</svg></div><h2>One Portfolio is locked</h2><p class="note">Enter your PIN to see your investments.</p>
    <label class="sr" for="lockpin">PIN</label><input id="lockpin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="off" placeholder="PIN" required>
    <p class="um-err" id="lockerr" hidden></p><button class="btn primary" type="submit">Unlock</button>
    <p class="note">Forgot your PIN? <button type="button" class="linkbtn" onclick="signOut()">Sign out</button> and sign in again with your password; then turn the lock off or set a new PIN.</p></form>`;
  const inp = $("#lockpin"), err = $("#lockerr"); setTimeout(() => inp.focus(), 60);
  $("#lockform").onsubmit = async (e) => {
    e.preventDefault(); const now = Date.now();
    if (lockWait > now) { err.hidden = false; err.textContent = `Too many wrong tries. Try again in ${Math.ceil((lockWait - now) / 1000)} seconds.`; return; }
    if (await pinOk(inp.value)) { lockTries = 0; S = HELD; HELD = null; LOCKED = false; lastTouch = 0; touchSess(); d.hidden = true; document.body.classList.remove("locked"); renderAll(); return; }
    lockTries++; if (lockTries >= 5) lockWait = Date.now() + 30000 * Math.pow(2, lockTries - 5);
    err.hidden = false; err.textContent = lockTries >= 5 ? `Wrong PIN. Locked for ${Math.round((lockWait - Date.now()) / 1000)} seconds.` : `Wrong PIN (${5 - lockTries} tr${5 - lockTries === 1 ? "y" : "ies"} left before a pause).`; inp.value = ""; inp.focus();
  };
}
["pointerdown", "keydown", "scroll", "touchstart"].forEach((ev) => addEventListener(ev, () => { if (!LOCKED && S && S.lock) touchSess(); }, { passive: true, capture: true }));
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && !LOCKED && S && S.lock && !sessOk()) lockNow(); });
function securityCard() {
  const L = S && S.lock;
  return `<div class="card" id="seccard"><div class="fields" style="justify-content:space-between;align-items:flex-start"><div><div class="eyebrow">Security</div><h2>App lock ${L ? `<span class="chip good">On</span>` : `<span class="chip neutral">Off</span>`}</h2>
    <p class="note">Your data is private to your login: the database only lets your signed-in account read or change it. ${L ? `A PIN is also asked whenever you open the app, and after 10 minutes without activity. PIN set on ${fmtDate(L.set)}.` : `Add a PIN so the app also asks for it when opened, and locks itself after 10 minutes without activity. Useful if someone else uses your phone or laptop while you're signed in.`}</p></div>
    <div class="fields">${L ? `<button class="btn" type="button" data-sec="lock">Lock now</button><button class="btn" type="button" data-sec="change">Change PIN</button><button class="btn" type="button" data-sec="off">Turn off</button>` : `<button class="btn primary" type="button" data-sec="set" ${S ? "" : "disabled"}>Set a PIN</button>`}</div></div>
    <details class="danger-zone"><summary>Delete all my data</summary><p class="note">Removes your portfolio and its saved versions from the database for good. Your login stays, so you can start again by uploading reports.</p><button class="btn danger" type="button" id="del-data" ${S ? "" : "disabled"}>Delete my data permanently</button></details></div>`;
}
function wireSecurity() {
  document.querySelectorAll("[data-sec]").forEach((b) => (b.onclick = () => (b.dataset.sec === "lock" ? lockNow() : pinDialog(b.dataset.sec))));
  const del = $("#del-data"); if (del) del.onclick = async () => {
    if (!confirm("Delete your whole portfolio and every saved version? This can't be undone.")) return;
    if (prompt('Type DELETE to confirm') !== "DELETE") return;
    del.disabled = true; del.textContent = "Deleting…";
    try { await cloudDelete(); S = null; HELD = null; LOCKED = false; renderAll(); resultModal([{ name: "Your data", what: "Deleted. Upload reports any time to start again." }], [], ""); }
    catch (e) { del.disabled = false; del.textContent = "Delete my data permanently"; resultModal([], ["Couldn't delete: " + cloudErr(e)], ""); }
  };
}
function pinDialog(kind) {
  let d = $("#pinmodal"); if (!d) { d = document.createElement("dialog"); d.id = "pinmodal"; d.className = "upmodal pwbox"; document.body.appendChild(d); }
  const needOld = kind !== "set" && !(OP.freshLogin && Date.now() - OP.freshLogin < 10 * 60 * 1000), needNew = kind !== "off";
  const f = (id, label, ac) => `<label class="pinf" for="${id}"><span>${label}</span><input id="${id}" type="password" inputmode="numeric" pattern="[0-9]*" minlength="4" maxlength="8" autocomplete="${ac}" required></label>`;
  d.innerHTML = `<div class="um-ic mix" aria-hidden="true"><svg viewBox="0 0 24 24">${UI_IC.lock}</svg></div><h2>${kind === "set" ? "Set a PIN" : kind === "change" ? "Change your PIN" : "Turn off the app lock"}</h2>
    <form id="pinform">${needOld ? f("pin-old", "Current PIN", "current-password") : ""}${needNew ? f("pin-new", "New PIN (4 to 8 digits)", "new-password") + f("pin-new2", "Type it again", "new-password") : ""}
    <p class="um-err" id="pinerr" hidden></p><p class="note">${needNew ? "Pick digits that aren't your card PIN or birthday. The PIN itself is never saved, only a scrambled check value." : "The app will open straight away when you're signed in to Claude."}</p>
    <div class="fields"><button class="btn primary" type="submit">${kind === "off" ? "Turn off" : "Save PIN"}</button><button class="btn" type="button" id="pincancel">Cancel</button></div></form>`;
  const err = d.querySelector("#pinerr"), bad = (m) => { err.hidden = false; err.textContent = m; };
  d.querySelector("#pincancel").onclick = () => d.close();
  d.querySelector("#pinform").onsubmit = async (e) => {
    e.preventDefault();
    const recent = OP.freshLogin && Date.now() - OP.freshLogin < 10 * 60 * 1000; // just signed in with the password: no PIN needed to change it
    if (needOld && !recent && !(await pinOk(d.querySelector("#pin-old").value))) return bad("The current PIN isn't right.");
    if (needNew) { const p1 = d.querySelector("#pin-new").value, p2 = d.querySelector("#pin-new2").value;
      if (!/^\d{4,8}$/.test(p1)) return bad("Use 4 to 8 digits."); if (p1 !== p2) return bad("The two PINs don't match."); if (/^(\d)\1+$/.test(p1) || "0123456789".includes(p1) || "9876543210".includes(p1)) return bad("That PIN is too easy to guess. Try another.");
      const salt = b64(crypto.getRandomValues(new Uint8Array(16))); S.lock = { salt, iter: PIN_ITER, hash: await pinHash(p1, salt, PIN_ITER), set: TODAY }; }
    else delete S.lock;
    dirty(); d.close(); lastTouch = 0; touchSess(); renderAll();
    resultModal([{ name: "App lock", what: kind === "off" ? "Turned off" : kind === "set" ? "PIN set · the app will ask for it when opened" : "PIN changed" }], [], "");
  };
  if (d.showModal) { try { d.showModal(); } catch (e) { d.setAttribute("open", ""); } } else d.setAttribute("open", "");
  setTimeout(() => { const i = d.querySelector("input"); if (i) i.focus(); }, 60);
}
function renderAll() { syncLockBtn(); statusIdle(); renderIndia(); renderHeader(); renderPlayer(); renderStage(); renderOverview(); renderUpload(); renderHoldings(); renderPlan(); renderTax(); renderCalendar(); renderGrowth(); renderAsk(); }
const emptyCard = () => `<div class="card empty"><h2>Start with two uploads</h2><p class="muted">Your INDmoney <b>Transactions Report</b> and <b>Holdings Report</b>, from US Stocks → Taxation Documents. They are enough for your monthly list and every tax date. Nothing needs typing.</p><div><button class="btn primary" data-go="upload">Go to Upload</button></div></div>`;

/* ---------- the four INDmoney reports ---------- */
function lastImport(kind) { return ((S && S.imports) || []).filter((x) => x.kind === kind).sort((a, b) => String(a.period || "").localeCompare(String(b.period || ""))).slice(-1)[0]; }
function uploadHistory() {
  const list = ((S && S.imports) || []).slice().sort((a, b) => String(b.at || b.period || "").localeCompare(String(a.at || a.period || "")));
  const when = (x) => (x.at ? new Date(x.at).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—");
  const what = (x) => (/orders$/.test(x.kind) ? `${x.count} orders` : /^(gr|zd)-/.test(x.kind) ? `${x.count} holdings` : x.kind === "ib-cf" ? `${x.count} payouts` : x.kind === "divs" ? `${x.count} dividends` : x.kind === "mf-lots" ? `${x.count} purchases` : x.kind === "hold-shot" ? `${x.count} buy price${x.count === 1 ? "" : "s"}` : x.kind === "wint" || x.kind === "bond-shot" || x.kind === "ib-bonds" ? `${x.count} bond${x.count === 1 ? "" : "s"}` : x.kind === "cas" ? `${x.count} holdings · ${inr(x.total || 0)}` : x.count ? `${x.count} ${x.kind === "report" ? (x.count === 1 ? "holding" : "holdings") : x.count === 1 ? "trade" : "trades"}` : x.kind === "statement" && x.total ? `Total ${usd(x.total)}` : x.kind === "1042s" ? `Withheld $${x.withheld}` : "");
  return `<div class="card"><div class="fields" style="justify-content:space-between;align-items:center"><div><div class="eyebrow">History</div><h2>Uploaded reports</h2></div><span class="chip neutral">${list.length} uploaded</span></div>
    ${list.length ? `<div class="tbl-wrap"><table class="up-tbl"><thead><tr><th>Report</th><th>Covers</th><th>Uploaded on</th><th>Added</th><th>Status</th></tr></thead><tbody>
    ${list.map((x) => `<tr><td><b>${esc(KIND[x.kind] || x.kind)}</b><span class="nm">${esc(x.file || "")}</span></td><td class="num">${x.period ? fmtDate(x.period) : "—"}</td><td class="num">${esc(when(x))}</td><td>${esc(what(x))}</td><td><span class="chip good">${ic("check")}Saved</span></td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">Nothing uploaded yet.</p>`}</div>`;
}
function reportCards() {
  const tx = lastImport("transactions"), rep = lastImport("report"), st = lastImport("statement"), f1042 = lastImport("1042s");
  const d0 = new Date(TODAY + "T00:00:00Z"), lastMonthEnd = iso(d0.getUTCFullYear(), d0.getUTCMonth(), 0);
  const repFresh = rep && daysBetween(rep.period, TODAY) <= 31, stFresh = st && st.period >= lastMonthEnd;
  const y = +TODAY.slice(0, 4), m = +TODAY.slice(5, 7);
  const txStale = tx && daysBetween(tx.period, TODAY) > 95;
  const cas = lastImport("cas"), casFresh = cas && cas.period >= lastMonthEnd;
  return [
    { name: "CDSL / NSDL CAS (India)", tone: casFresh ? "good" : cas ? "wait" : "act", tag: casFresh ? "Up to date" : cas ? "New month due" : "Upload now", when: cas ? `As of ${fmtDate(cas.period)}` : "Emailed monthly by CDSL / NSDL", why: "Every Indian share, mutual fund, ETF and bond under your PAN. Upload each month's PDF." },
    { name: "Order / Transactions Report", tone: tx && !txStale ? "good" : "act", tag: tx ? (txStale ? "Refresh" : "Received") : "Upload now", when: tx ? `Covers up to ${fmtDate(tx.period)} · ${tx.count} trades` : "Pick the full period: Feb 2026 to today", why: "Every buy and sell with its date, so each purchase's 12.5% date is exact. Re-upload every quarter." },
    { name: "Holdings Report", tone: repFresh ? "good" : rep ? "wait" : "act", tag: repFresh ? "Up to date" : rep ? "Refresh monthly" : "Upload now", when: rep ? `As of ${fmtDate(rep.period)}` : "Today's snapshot", why: "Units and cost today. Used to double-check the transaction history." },
    { name: "Account Statement", tone: stFresh ? "good" : "wait", tag: stFresh ? "Up to date" : "Latest month", when: st ? `Latest: ${monthName(st.period.slice(0, 7))}` : "Last month's PDF", why: "Month-end prices and a total to reconcile against. Only the latest month is needed." },
    { name: "Form 1042-S", tone: f1042 ? "good" : "neutral", tag: f1042 ? "Received" : y <= 2026 ? "Not yet" : m >= 3 ? "Download now" : `From Mar ${y}`, when: f1042 ? `For Jan–Dec ${f1042.period}` : y <= 2026 ? "Your first one, for 2026, arrives around March 2027" : `For Jan–Dec ${y - 1}`, why: "US tax withheld on your dividends, for Form 67 and your ITR. Issued once a year." },
  ];
}
/* ---------- overview ---------- */
const nextYm = (ym) => { const [y, m] = ym.split("-").map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`; };
const longMonth = (ym) => new Date(ym + "-01T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
/* This month's plan-fund buys, from your recorded purchases. Once they reach 80% of the monthly amount, the month is done and the list shows next month. */
function monthStatus() {
  const ym = TODAY.slice(0, 7), s = S.settings, budget = (s.monthlyInr / s.fx) * (1 - (s.feePct || 0) / 100), by = {};
  for (const h of S.holdings) if (h.plan === "core") for (const l of h.lots) if (l.d.startsWith(ym)) by[h.sym] = (by[h.sym] || 0) + l.q * l.p;
  const buys = Object.entries(by).map(([sym, v]) => ({ sym, v })).sort((a, b) => b.v - a.v), spent = buys.reduce((a, b) => a + b.v, 0);
  const done = spent >= 0.8 * budget, target = done ? nextYm(ym) : ym;
  return { ym, buys, spent, done, target, label: longMonth(target), short: done ? "next month" : "this month", boughtTxt: buys.map((b) => `<b>${tk(b.sym)}</b> ${usd(b.v)}`).join(" · ") };
}
function orders() {
  const rows = holdingRows(S, TODAY), sp = monthlySplit(S), out = [], ms = monthStatus();
  if (ms.done) out.push({ mid: "buy", tone: "good", tag: "Done", title: `${longMonth(ms.ym)} is invested`, body: `You bought ${ms.boughtTxt} (${usd(ms.spent)}). Nothing more to buy this month.` });
  out.push({ mid: ms.done ? "" : "buy", tone: ms.done ? "neutral" : "good", tag: ms.done ? "Next" : "Monthly", title: ms.done ? `${ms.label}: invest ${inr(S.settings.monthlyInr)} mid-month` : `Invest ${inr(S.settings.monthlyInr)} this month`, body: `${ms.done ? "Planned split (it updates with prices until you buy):" : "Buy in INDmoney:"} ${sp.rows.filter((r) => r.reb >= 1).map((r) => `<b>${tk(r.buy)}</b> ${r.shares ? `${r.shares} whole share${r.shares > 1 ? "s" : ""} (≈${usd(r.reb)})` : usd(r.reb)}`).join(" · ")}.${sp.rows.some((r) => r.paused || (r.whole && !r.shares)) ? ` Nothing for ${sp.rows.filter((r) => r.paused || (r.whole && !r.shares)).map((r) => tk(r.buy)).join(", ")} ${ms.short}.` : ""}${sp.rows.filter((r) => r.shares).map((r) => ` ${tk(r.buy)} is sold in whole shares only: enter 1 in Qty. ${esc(r.vc ? r.vc.text : "")}.`).join("")} Same day each month.` });
  const harvest = rows.filter((r) => r.plan === "legacy" && r.gain < 0);
  if (harvest.length) out.push({ mid: "harvest", tone: "act", tag: "Do once", title: `Sell ${harvest.map((r) => tk(r.sym)).join(", ")} (${usd(-harvest.reduce((a, r) => a + r.gain, 0))} loss)`, body: "No tax on a loss. The loss reduces any other capital gain this financial year, or carries forward 8 years if you file your ITR on time. Put the cash into this month's buys." });
  const txi = lastImport("transactions");
  if (!txi || daysBetween(txi.period, TODAY) >= 95) out.push({ mid: "tx", tone: "act", tag: "Upload", title: "Upload a fresh Transactions Report", body: "INDmoney → US Stocks → Taxation Documents → Transactions Report, full period from Feb 2026. It turns every estimated long-term date (marked *) into an exact one." });
  const conc = rows.filter((r) => SINGLE.has(r.sym) && r.value / rows.reduce((a, x) => a + x.value, 0) > 0.1);
  if (conc.length) out.push({ tone: "wait", tag: "Pause", title: `Pause buying ${conc.map((r) => tk(r.sym)).join(", ")}`, body: "Over 10% of the sleeve in one company. Its monthly share stays unspent until it falls below 10%; this month's split already leaves it out." });
  out.push({ mid: "hold", tone: "neutral", tag: "Don't", title: "Don't sell anything else that's in profit before its long-term date", body: "Check Sell & tax for each date. Selling earlier taxes the gain at your slab rate instead of 12.5%." });
  const lots = lotRows(S, TODAY), nx = lots.find((l) => l.left > 0);
  if (nx) out.push({ tone: "neutral", tag: daysTxt(nx.left), title: `Next long-term date: ${tk(nx.sym)} on ${fmtDate(nx.ltd)}`, body: "Nothing else turns long-term before this." });
  return out;
}
function renderOverview() {
  const el = $("#p-overview");
  if (!hasData()) { el.innerHTML = emptyCard(); return; }
  const rows = holdingRows(S, TODAY), fx = S.settings.fx;
  const cost = rows.reduce((a, r) => a + r.cost, 0), val = rows.reduce((a, r) => a + r.value, 0), g = val - cost;
  const buckets = bucketView(S).filter((b) => b.w > 0 || b.value > 0), p = oldestPrice(), hc = health(S, TODAY), bad = hc.filter((h) => !h.ok);
  const month = new Date(TODAY + "T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  el.innerHTML = `
  <div class="bento">
    ${(() => { const ms = monthStatus(); return `<div class="card b12 reveal"><div><div class="eyebrow">${ms.done ? `${longMonth(ms.ym)} done · next: ${ms.label}` : `Step 1 · ${month}`}</div><h2>${ms.done ? `${ms.label.split(" ")[0]}'s buys` : "This month's buys"}</h2>${ms.done ? `<p class="done-note"><span class="chip good">${ic("check")}Bought ${new Date(TODAY + "T00:00:00Z").toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })}</span> ${ms.boughtTxt}</p><p class="note">Next month's plan below. Amounts update with prices until you buy, around mid-${ms.label.split(" ")[0]}. Tap a card to see why.</p>` : `<p class="note">Tap a card to flip it and see why.</p>`}</div>${buyCards()}</div>`; })()}
    ${questCard(month)}
    <div class="b5 reveal">${badgesCard()}</div>
    <div class="card glass b7 reveal"><div><h2>Allocation vs target</h2><p class="note">Dot is today, ring is the target. Monthly buys close the gaps, so you never sell to rebalance. Within 5 points counts as on target.</p></div>
      ${allocChart(buckets)}
      <p class="note">Single US stocks you hold (Apple, Nvidia…) count as US tech; SCHD and VIG count as US core.</p></div>
    ${countriesCard(true)}
    <div class="card glass b6 reveal"><h2>Data health</h2><p class="note">Checked on every upload, before any number here is trusted.</p>
      <div class="health">${hc.map((h) => `<div class="hrow"><span class="chip ${h.ok ? "good" : "act"}">${h.ok ? "Pass" : "Fix"}</span><div><b>${esc(h.name)}</b> <span class="muted">${esc(h.text)}</span>${!h.ok && h.affects ? `<br><span class="note">Affects: ${esc(h.affects)}</span>` : ""}</div></div>`).join("")}</div></div>
    <div class="card glass b6 reveal"><h2>How this sleeve protects you</h2>
      <ol class="rules">
        <li><b>Different currency.</b> Your money sits in dollars and yen. When the rupee weakens, these holdings gain in rupee terms even if their markets are flat.</li>
        <li><b>Different businesses.</b> Indian indices lean on banks and financials. This sleeve holds US tech, Japanese manufacturers and copper miners.</li>
        <li><b>Tax kept low.</b> New money goes into Ireland-domiciled accumulating (UCITS Acc) funds: no dividends to report each year, less US withholding, no US estate tax.</li>
        <li><b>Patience on exits.</b> Each purchase is held past 24 months, then taxed at 12.5% instead of your slab rate.</li>
      </ol><p class="note">It cushions over 5+ years. In a global crash almost everything falls together.</p></div>
  </div>`;
  countUp(el);
}
/* numbers roll up once when a panel first shows (they're correct before and after; this is just motion) */
const counted = new WeakSet();
function countUp(root) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  root.querySelectorAll("[data-count]").forEach((n) => {
    if (counted.has(n)) return; counted.add(n);
    const end = +n.dataset.count, fmt = n.dataset.fmt === "usd" ? usd : n.dataset.fmt === "nw" ? (v) => (CUR === "INR" ? inr(v) : usdRaw(v)) : (v) => v.toFixed(0), t0 = performance.now(), D = 900;
    const tick = (now) => { const k = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - k, 3); n.textContent = fmt(end * e); if (k < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
}
/* small confirmation toasts for things that changed */
function toast(msg, tone) {
  let box = $("#toasts"); if (!box) { box = document.createElement("div"); box.id = "toasts"; box.setAttribute("role", "status"); box.setAttribute("aria-live", "polite"); document.body.appendChild(box); }
  const t = document.createElement("div"); t.className = "toast " + (tone || "good"); t.textContent = msg; box.appendChild(t);
  setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 400); }, 3200);
}

/* ---------- upload ---------- */
function renderUpload() {
  const el = $("#p-upload");
  
  el.innerHTML = `
  <div class="card"><h2>Upload</h2>
    <p class="note">Drop any mix of files at once: holdings reports (.xls), monthly statements (.pdf), order confirmations or INDmoney screenshots (.png, .jpg). Statements and reports are read in your browser. Anything else is read by Claude, and you confirm what it found before it's saved.</p>
    <label class="drop big" for="f-any" id="dropzone"><span class="up-ic" aria-hidden="true">${icon3d("coins")}</span><b>Drop your statements and reports here</b><span class="note">INDmoney, CDSL / NSDL CAS, Groww, Zerodha, Wint Wealth. Several at once is fine.</span><span class="pick" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5M4 16v4h16v-4"/></svg>Choose files</span><input id="f-any" type="file" multiple accept=".xls,.xlsx,.csv,.pdf,.png,.jpg,.jpeg,.webp"></label>
    <div id="pending"></div>
  </div>
  <div class="card"><div><div class="eyebrow">INDmoney → US Stocks → Reports / Taxation Documents</div><h2>What's pending</h2><p class="note">Tap a report to upload it.</p></div>
    <div class="reports">${reportCards().map((r) => `<button type="button" class="rep tilt ${r.tone === "good" ? "done" : ""}" data-pick="1"><span class="chip ${r.tone}">${esc(r.tag)}</span><h3>${esc(r.name)}</h3><span class="when">${esc(r.when)}</span><span class="note">${esc(r.why)}</span>${r.tone === "good" ? "" : `<span class="rep-go">Upload ${esc(r.name.split(" /")[0])} →</span>`}</button>`).join("")}</div>
    <p class="note">After buying a London-listed fund, a screenshot of the INDmoney Orders tab works too. It starts that purchase's clock right away instead of waiting for the next report.</p>
  </div>
  ${uploadHistory()}
  ${securityCard()}
  <details class="card"><summary><b>Activity log</b></summary><div class="log" id="implog">${S ? logView(S.log) : ""}</div></details>`;
  wireSecurity();
  const inp = $("#f-any");
  el.querySelectorAll("[data-pick]").forEach((b) => (b.onclick = () => inp.click()));
  inp.onchange = () => handleFiles([...inp.files]);
  const dz = $("#dropzone");
  dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("over"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("over"));
  dz.addEventListener("drop", (e) => { e.preventDefault(); dz.classList.remove("over"); handleFiles([...e.dataTransfer.files]); });
  if (pending) renderPending();
}
function logView(log) { const out = []; for (const l of log) { const s = `${l.d}  ${l.text}`, p = out[out.length - 1]; if (p && p.s === s) p.n++; else out.push({ s, n: 1 }); } return out.slice(-8).reverse().map((x) => esc(x.s + (x.n > 1 ? `  (×${x.n})` : ""))).join("\n"); }
function logLines(lines) { S.log.push(...lines.map((t) => ({ d: TODAY, text: t }))); S.log = S.log.slice(-60); }
function showLog(msg) { const l = $("#implog"); if (l) { l.hidden = false; l.textContent = msg + (l.textContent ? "\n" + l.textContent : ""); } }
let upErrs = [];
const KIND = { cas: "CDSL / NSDL CAS (India)", "gr-stocks": "Groww stocks holdings", "zd-hold": "Zerodha holdings", "gr-mf": "Groww mutual fund holdings", "gr-st-orders": "Groww stock order history", "gr-mf-orders": "Groww MF order history", wint: "Wint Wealth master report (bonds)", report: "Holdings Report", statement: "Account Statement", transactions: "Order / Transactions Report", screenshot: "Order screenshot", "bond-shot": "Bond screenshot (India)", "hold-shot": "Holdings screenshot (India)", "ib-bonds": "IndiaBonds transaction statement", "ib-cf": "IndiaBonds interest / cashflow report", "zd-div": "Zerodha dividend report", divs: "Dividends (India)", "mf-lots": "Fund purchases (e.g. ELSS statement)", "1042s": "Form 1042-S" };
function stampImport(file) { const rec = S.imports[S.imports.length - 1]; if (rec && !rec.file) rec.file = file; if (rec && !rec.at) rec.at = new Date().toISOString(); }
function resultModal(done, errs, note) {
  let d = $("#upmodal"); if (!d) { d = document.createElement("dialog"); d.id = "upmodal"; d.className = "upmodal"; document.body.appendChild(d); }
  const ok = done.length && !errs.length;
  d.innerHTML = `<div class="um-ic ${ok ? "ok" : errs.length && !done.length ? "bad" : "mix"}" aria-hidden="true">${ok ? ic("check") : done.length ? ic("alert") : ic("x")}</div>
    <h2>${done.length ? `${done.length === 1 ? "Report" : done.length + " reports"} updated successfully` : "Nothing was updated"}</h2>
    ${done.length ? `<ul>${done.map((x) => `<li><b>${esc(x.name)}</b><span>${esc(x.what)}</span></li>`).join("")}</ul>` : ""}
    ${errs.length ? `<p class="um-err">${errs.map(esc).join("<br>")}</p>` : ""}${note ? `<p class="note">${esc(note)}</p>` : ""}
    <div class="fields"><button class="btn primary" type="button" data-um="close">Done</button>${done.length ? `<button class="btn" type="button" data-um="holdings">See holdings</button>` : ""}</div>`;
  d.querySelectorAll("[data-um]").forEach((b) => (b.onclick = () => { d.close ? d.close() : d.removeAttribute("open"); if (b.dataset.um === "holdings") showTab("holdings", true); }));
  if (d.showModal) { try { d.showModal(); } catch (e) { d.setAttribute("open", ""); } } else d.setAttribute("open", "");
}
async function handleFiles(files) {
  if (!files.length || LOCKED) return;
  if (mode !== "sb") { resultModal([], [mode === "signedout" ? "Sign in first." : "Nothing was saved: the app can't reach Supabase right now. Fix the message at the bottom of the page, then upload again."], ""); return; }
  S = S || freshState(); upErrs = [];
  // statements oldest first so lots and prices settle in order
  const typed = [];
  for (const f of files) {
    const n = f.name.toLowerCase();
    if (/\.(xls|xlsx|csv)$/.test(n)) typed.push({ f, kind: "xls" });
    else if (n.endsWith(".pdf")) typed.push({ f, kind: "pdf" });
    else if (/\.(png|jpe?g|webp)$/.test(n) || (f.type || "").startsWith("image/")) typed.push({ f, kind: "img" });
    else { showLog(`${f.name}: this file type isn't supported. Use .xls, .pdf, .png or .jpg.`); upErrs.push(`${f.name}: file type not supported (use .xls, .pdf, .png or .jpg)`); }
  }
  const parsed = [];
  for (const t of typed) {
    setStatus("busy", `Reading ${t.f.name}…`);
    try {
      if (t.kind === "xls") {
        await loadScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js");
        const wb = XLSX.read(await t.f.arrayBuffer(), { type: "array" });
        const names = wb.SheetNames.slice().sort((a, b) => (/combined/i.test(b) ? 1 : 0) - (/combined/i.test(a) ? 1 : 0));
        let ind = rowsFromWintBook(Object.fromEntries(wb.SheetNames.map((sn) => [sn, XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true })])));
        if (!ind) for (const sn of names) { ind = rowsFromIndiaSheet(XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true }), t.f.name); if (ind) break; }
        if (ind) { parsed.push({ name: t.f.name, kind: "india-sheet", data: ind, sortKey: "4" + ind.kind }); continue; }
        const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true });
        const rep = rowsFromHoldingsSheet(aoa);
        if (rep) parsed.push({ name: t.f.name, kind: "report", data: rep, sortKey: "1" });
        else { const txs = rowsFromTransactionsSheet(aoa); if (txs) parsed.push({ name: t.f.name, kind: "transactions", data: txs, sortKey: "2" }); else await smartExtract(t.f.name, aoa.map((r) => (r || []).join(" | ")).join("\n"), null); }
      } else if (t.kind === "pdf") {
        pwName = t.f.name; const lines = await pdfLines(await t.f.arrayBuffer());
        const cas = parseCAS(lines.pages);
        if (cas) { parsed.push({ name: t.f.name, kind: "cas", data: cas, sortKey: "3" + (cas.asOf || "") }); continue; }
        const st = parseStatementLines(lines);
        if (st.holdings.length || st.tx.length) parsed.push({ name: t.f.name, kind: "statement", data: st, sortKey: "0" + (st.periodEnd || "") });
        else if (lines.join("").replace(/\s/g, "").length < 40 && lines.doc) { // printed-to-PDF statements with no text layer: read the pages as images
          const imgs = []; for (let i = 1; i <= Math.min(3, lines.doc.numPages); i++) { const pg = await lines.doc.getPage(i), vp = pg.getViewport({ scale: 2 }), cv = document.createElement("canvas"); cv.width = vp.width; cv.height = vp.height; await pg.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise; const blob = await new Promise((r) => cv.toBlob(r, "image/png")); imgs.push(new File([blob], `${t.f.name}-p${i}.png`, { type: "image/png" })); }
          await smartExtract(t.f.name, null, imgs);
        } else await smartExtract(t.f.name, lines.join("\n"), null);
      } else await smartExtract(t.f.name, null, t.f);
    } catch (err) { showLog(`${t.f.name}: couldn't read it. ${err && err.message ? err.message : err}`); upErrs.push(`${t.f.name}: couldn't read it`); }
  }
  parsed.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  const done = [];
  for (const p of parsed) {
    const nImp = (S.imports || []).length;
    if (p.kind === "india-sheet" && !S.india) { upErrs.push(`${p.name}: upload your CDSL or NSDL consolidated statement (CAS) first; broker reports add to it`); continue; }
    if (p.kind === "statement") { const ch = applyStatement(S, p.data); logLines([`${p.name}: statement for ${p.data.periodEnd}, ${ch.length} updates`, ...ch]); }
    else if (p.kind === "india-sheet") { const ch = applyIndiaSheet(S, p.data, p.name); logLines([`${p.name}: ${KIND_IN[p.data.kind] || "Indian report"}`, ...ch]); if ((S.imports || []).length === nImp && ch.length) { upErrs.push(`${p.name}: ${ch[0]}`); continue; } }
    else if (p.kind === "cas") { const ch = applyCAS(S, p.data); logLines([`${p.name}: consolidated account statement`, ...ch]); }
    else if (p.kind === "transactions") { const ch = applyTransactions(S, p.data); logLines([`${p.name}: transaction history, ${p.data.length} trades`, ...ch]); }
    else { const ch = applyHoldingsReport(S, p.data, TODAY); logLines([`${p.name}: holdings report${p.data.asOf ? " of " + p.data.asOf : ""}, ${ch.length} changes`, ...ch]); }
    stampImport(p.name);
    const rec = S.imports[S.imports.length - 1]; if (!rec) continue; done.push({ name: p.name, what: `${KIND[rec.kind] || rec.kind}${rec.period ? " · up to " + fmtDate(rec.period) : ""}${rec.count ? ` · ${rec.count} ${/orders$/.test(rec.kind) ? "orders" : rec.kind === "ib-cf" ? "payouts" : rec.kind === "wint" || rec.kind === "ib-bonds" ? "bonds" : ["report", "cas", "gr-stocks", "gr-mf", "zd-hold"].includes(rec.kind) ? "holdings" : rec.count === 1 ? "trade" : "trades"}` : ""}` });
  }
  if (parsed.length) dirty();
  renderAll(); showTab("upload");
  if (done.length || upErrs.length) resultModal(done, upErrs, pending && pending.length ? "The AI helper also read some files. Check what it found under Upload and tap \u201cLooks right, add it\u201d." : "");
}
async function smartExtract(name, text, imageFile) {
  if (!sampleFn) { showLog(`${name}: not a statement or holdings report. Reading screenshots and other documents needs the optional AI helper (see the README).`); upErrs.push(`${name}: this kind of document needs the optional AI helper`); return; }
  if (imageFile && !canImages) { showLog(`${name}: images can't be read on this view. Upload the PDF version instead.`); upErrs.push(`${name}: images can't be read here; upload the PDF instead`); return; }
  setStatus("busy", `The AI helper is reading ${name}…`);
  const prompt = `Extract investment data from this ${imageFile ? "screenshot" : "document"} (INDmoney / Alpaca / bank). Reply with only JSON in this shape:
{"doc_type":"transactions report|order confirmation|portfolio screen|remittance|form 1042-S|tax report|other","as_of":"YYYY-MM-DD or null","trades":[{"date":"YYYY-MM-DD","side":"buy|sell","symbol":"VOO","units":0.123,"price_usd":100.5}],"prices":[{"symbol":"VOO","price_usd":100.5,"as_of":"YYYY-MM-DD"}],"fx_inr_per_usd":null,"in_bonds":[{"isin":"INE... or null","name":"issuer as shown","units":1,"invested_inr":10000,"date":"YYYY-MM-DD or null","ytm":11.2,"maturity":"YYYY-MM-DD or null"}],"in_lots":[{"fund":"SBI LONG TERM EQUITY FUND - DIRECT PLAN","folio":"12345678","symbol":null,"isin":null,"platform":"Groww|Zerodha|null","date":"YYYY-MM-DD","units":1.021,"amount_inr":499.95,"tag":"IPO|bonus|null"}],"in_dividends":[{"symbol":"ACMESOLAR","ex_date":"YYYY-MM-DD","qty":51,"per_share_inr":0.2,"total_inr":10.2}],"in_holdings":[{"name":"NHPC","isin":"INE... or null","units":1,"avg_inr":80.08,"platform":"INDstocks|Groww|Zerodha|other"}],"notes":"one short sentence"}
in_lots is for individual Indian purchases: mutual fund purchases (e.g. a Zerodha ELSS statement) or share purchases from a broker's per-stock breakdown (e.g. Zerodha Console: date, qty, price, an "IPO" tag; put the stock's symbol or, if no symbol is shown, its name in "symbol", the ISIN if shown, and the app in "platform", and amount_inr = qty × price). One entry per purchase. in_dividends is for Indian dividends received (e.g. a Zerodha "Dividend and Interest" screen). in_holdings is for Indian shares, ETFs or funds shown in rupees on a holdings screen, with the average buy price per unit. in_bonds is only for Indian bonds / NCDs in rupees (e.g. an INDmoney, Groww or Wint bond screen): the total amount invested in that bond, not a per-unit price, unless only a per-unit price is shown (then invested_inr = units × that price). For a Form 1042-S also add "f1042":{"year":2026,"gross_income_usd":0,"tax_withheld_usd":0}. Rules: include only values you can see; never guess or compute missing ones; leave arrays empty if none. Executed trades only (not pending or cancelled). London-listed funds get the prefix "LSE~" (e.g. "LSE~CSPX"). fx_inr_per_usd only if the document shows the rupee-dollar rate actually applied.${text ? "\n\nDocument text:\n" + text.slice(0, 60000) : ""}`;
  try {
    const ex = await sampleFn.json(prompt, imageFile ? { images: Array.isArray(imageFile) ? imageFile : [imageFile] } : {});
    const n = (ex.trades || []).length + (ex.prices || []).length + (ex.in_bonds || []).filter((b) => +b.invested_inr > 0).length + (ex.in_holdings || []).filter((b) => +b.avg_inr > 0).length + (ex.in_lots || []).filter((b) => +b.units > 0).length + (ex.in_dividends || []).filter((b) => +b.total_inr > 0).length + (ex.fx_inr_per_usd ? 1 : 0) + (ex.f1042 ? 1 : 0);
    if (!n) { showLog(`${name}: ${ex.doc_type || "document"} read, but it has no trades, prices or exchange rate to add.${ex.notes ? " " + ex.notes : ""}`); statusIdle(); return; }
    pending = pending || [];
    pending.push({ name, ex });
    renderPending(); statusIdle();
  } catch (e) { showLog(`${name}: the AI helper couldn't read it (${e && e.code ? e.code : "error"}). Try a clearer screenshot or the PDF.`); statusIdle(); }
}
function renderPending() {
  const box = $("#pending"); if (!box) return;
  if (!pending || !pending.length) { box.innerHTML = ""; return; }
  box.innerHTML = pending.map((p, i) => `<div class="confirm"><b>${esc(p.name)}</b> <span class="muted">${esc(p.ex.doc_type || "")}${p.ex.notes ? " · " + esc(p.ex.notes) : ""}</span>
    <div class="tbl-wrap"><table><thead><tr><th>What</th><th>Symbol</th><th>Date</th><th class="r">Units</th><th class="r">Price</th></tr></thead><tbody>
    ${(p.ex.trades || []).map((t) => `<tr><td>${esc(t.side)}</td><td class="sym">${tk(t.symbol)}</td><td class="num">${esc(t.date)}</td><td class="r num">${esc(t.units)}</td><td class="r num">${esc(t.price_usd)}</td></tr>`).join("")}
    ${(p.ex.prices || []).map((t) => `<tr><td>price</td><td class="sym">${tk(t.symbol)}</td><td class="num">${esc(t.as_of || "")}</td><td></td><td class="r num">${esc(t.price_usd)}</td></tr>`).join("")}
    ${(p.ex.in_bonds || []).filter((b) => +b.invested_inr > 0).map((b) => `<tr><td>bond bought</td><td class="sym">${esc(b.name || b.isin || "")}</td><td class="num">${esc(b.date || "")}</td><td class="r num">${esc(b.units)}</td><td class="r num">${inr(+b.invested_inr)} total</td></tr>`).join("")}
    ${(p.ex.in_lots || []).filter((b) => +b.units > 0).map((b) => `<tr><td>fund purchase</td><td class="sym">${esc(b.fund || "")}${b.folio ? ` <span class="nm">folio ${esc(b.folio)}</span>` : ""}</td><td class="num">${esc(b.date || "")}</td><td class="r num">${esc(b.units)}</td><td class="r num">${inr(+b.amount_inr || 0)}</td></tr>`).join("")}
    ${(p.ex.in_dividends || []).filter((b) => +b.total_inr > 0).map((b) => `<tr><td>dividend</td><td class="sym">${esc(b.symbol || "")}</td><td class="num">${esc(b.ex_date || "")}</td><td class="r num">${esc(b.qty)}</td><td class="r num">${inr(+b.total_inr)}</td></tr>`).join("")}
    ${(p.ex.in_holdings || []).filter((b) => +b.avg_inr > 0).map((b) => `<tr><td>buy price</td><td class="sym">${esc(b.name || b.isin || "")}${b.platform ? ` <span class="nm">${esc(b.platform)}</span>` : ""}</td><td></td><td class="r num">${esc(b.units)}</td><td class="r num">₹${(+b.avg_inr).toFixed(2)} avg</td></tr>`).join("")}
    ${p.ex.fx_inr_per_usd ? `<tr><td>₹ per $</td><td></td><td class="num">${esc(p.ex.as_of || "")}</td><td></td><td class="r num">${esc(p.ex.fx_inr_per_usd)}</td></tr>` : ""}
    </tbody></table></div>
    <div class="fields"><button class="btn primary" data-acc="${i}">Looks right, add it</button><button class="btn" data-rej="${i}">Discard</button></div></div>`).join("");
  box.querySelectorAll("[data-acc]").forEach((b) => (b.onclick = () => { const p = pending.splice(+b.dataset.acc, 1)[0];
    let ch;
    if (((p.ex.in_bonds || []).some((b) => +b.invested_inr > 0) || (p.ex.in_holdings || []).some((b) => +b.avg_inr > 0) || (p.ex.in_lots || []).length || (p.ex.in_dividends || []).length) && !(p.ex.trades || []).length) ch = [...applyInBonds(S, p.ex.in_bonds || []), ...applyInHoldings(S, p.ex.in_holdings || []), ...applyInLots(S, p.ex.in_lots || []), ...applyInDivs(S, (p.ex.in_dividends || []).map((d) => ({ sym: d.symbol, d: parseLooseDate(d.ex_date), q: +d.qty, dps: +d.per_share_inr, amt: +d.total_inr })))];
    else if (/transaction/i.test(p.ex.doc_type || "") && (p.ex.trades || []).length) {
      const txs = p.ex.trades.map((t) => ({ d: parseLooseDate(t.date), side: String(t.side || "").toLowerCase(), sym: String(t.symbol || "").trim().toUpperCase().replace(/^LSE[~:\s]+/, "LSE~"), q: +t.units, price: +t.price_usd })).filter((t) => t.d && t.sym && t.q > 0 && t.price > 0 && (t.side === "buy" || t.side === "sell"));
      ch = applyTransactions(S, txs);
    } else { ch = applyExtracted(S, p.ex, TODAY); if (ch.length) noteImport(S, { kind: "screenshot", period: parseLooseDate(p.ex.as_of) || TODAY, count: (p.ex.trades || []).length, doc: p.ex.doc_type || "" }); }
    stampImport(p.name);
    if (p.ex.f1042) { noteImport(S, { kind: "1042s", period: String(p.ex.f1042.year || ""), income: p.ex.f1042.gross_income_usd, withheld: p.ex.f1042.tax_withheld_usd }); ch.push(`Form 1042-S ${p.ex.f1042.year}: income $${p.ex.f1042.gross_income_usd}, US tax withheld $${p.ex.f1042.tax_withheld_usd}`); } logLines([`${p.name}: ${ch.length} items added`, ...ch]); dirty(); renderAll(); showTab("upload"); resultModal([{ name: p.name, what: ch.slice(0, 4).join(" · ") || "no changes" }], [], ""); }));
  box.querySelectorAll("[data-rej]").forEach((b) => (b.onclick = () => { pending.splice(+b.dataset.rej, 1); renderPending(); }));
}
const loaded = {};
function loadScript(src) {
  if (loaded[src]) return loaded[src];
  return (loaded[src] = new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => { delete loaded[src]; rej(new Error("A helper library couldn't load. Check your connection and try again.")); }; document.head.appendChild(s); }));
}
let pwName = "";
function askPassword(wrong) {
  return new Promise((res) => {
    let d = $("#pwmodal"); if (!d) { d = document.createElement("dialog"); d.id = "pwmodal"; d.className = "upmodal pwbox"; document.body.appendChild(d); }
    d.innerHTML = `<div class="um-ic mix" aria-hidden="true"><svg viewBox="0 0 24 24">${UI_IC.lock}</svg></div><h2>${wrong ? "That password didn't work" : "This PDF is password-protected"}</h2>
      <p class="note">${esc(pwName)} needs its password to open. For a CDSL or NSDL statement it's usually based on your PAN; the exact rule is printed in the email it came with.</p>
      <form method="dialog" id="pwform"><label class="sr" for="pwin">PDF password</label><input id="pwin" type="password" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Password">
      <p class="note">Used only to open this file in your browser. It is never saved or sent anywhere.</p>
      <div class="fields"><button class="btn primary" value="ok">Open</button><button class="btn" value="cancel" type="button" id="pwcancel">Cancel</button></div></form>`;
    const done = (v) => { d.close ? d.close() : d.removeAttribute("open"); res(v); };
    d.querySelector("#pwform").onsubmit = (e) => { e.preventDefault(); done(d.querySelector("#pwin").value); };
    d.querySelector("#pwcancel").onclick = () => done(null);
    d.oncancel = () => res(null);
    if (d.showModal) d.showModal(); else d.setAttribute("open", "");
    setTimeout(() => d.querySelector("#pwin").focus(), 50);
  });
}
async function pdfLines(buf) {
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js");
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js");
  const lib = window.pdfjsLib || window["pdfjs-dist/build/pdf"];
  const task = lib.getDocument({ data: new Uint8Array(buf) });
  // Password-protected statements (CDSL/NSDL CAS, CAMS): ask for the password; it is used only to open the file here and never saved.
  task.onPassword = (update, reason) => { askPassword(reason === 2).then((pw) => (pw == null ? task.destroy() : update(pw))); };
  const doc = await task.promise;
  const lines = [], pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent(), rows = [];
    pages.push(tc.items.filter((it) => it.str && it.str.trim()).map((it) => ({ x: it.transform[4], y: it.transform[5], s: it.str })));
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const y = it.transform[5], x = it.transform[4];
      let r = rows.find((r) => Math.abs(r.y - y) < 2.5); if (!r) rows.push((r = { y, items: [] }));
      r.items.push({ x, s: it.str });
    }
    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) lines.push(r.items.sort((a, b) => a.x - b.x).map((i) => i.s).join(" "));
  }
  lines.pages = pages; lines.doc = doc;
  return lines;
}

/* ---------- holdings ---------- */
function renderHoldings() {
  const el = $("#p-holdings");
  if (!hasData()) { el.innerHTML = emptyCard(); return; }
  const rows = holdingRows(S, TODAY), order = { core: 0, keep: 1, legacy: 2 };
  rows.sort((a, b) => order[a.plan] - order[b.plan] || b.value - a.value);
  const tc = rows.reduce((a, r) => a + r.cost, 0), tv = rows.reduce((a, r) => a + r.value, 0);
  const exact = (l) => ["statement", "document", "transactions"].includes(l.src);
  const fk = (r) => (r.action.tone === "act" ? "sell" : r.action.tone === "wait" ? "wait" : "keep"), cnt = { sell: 0, wait: 0, keep: 0 }; rows.forEach((r) => cnt[fk(r)]++);
  const F = [["all", "All", rows.length], ["sell", "Sell now", cnt.sell], ["wait", "Wait for 12.5% date", cnt.wait], ["keep", "Keep", cnt.keep]];
  el.innerHTML = `
  <div class="hf" role="group" aria-label="Filter holdings">${F.filter((f) => f[2] || f[0] === "all").map((f) => `<button class="btn ${HF === f[0] ? "primary" : ""}" type="button" data-hf="${f[0]}" aria-pressed="${HF === f[0]}">${f[1]}<b>${f[2]}</b></button>`).join("")}</div>
  <div class="tbl-wrap hold-wrap"><table class="hold-tbl">
    <thead><tr><th>Holding</th><th>Plan</th><th class="r">Units</th><th class="r">Avg cost</th><th class="r">Price</th><th class="r">Value</th><th class="r">Gain</th><th>Long-term from</th><th>Action</th></tr></thead>
    <tbody>${rows.map((r) => `<tr data-k="${fk(r)}" ${HF !== "all" && HF !== fk(r) ? "hidden" : ""}>
      <td class="c-name"><span class="sym">${flag(SYM_CC[r.sym] || "WORLD")} ${tk(r.sym)}</span><span class="nm">${esc(r.name)}${r.sym.startsWith("LSE~") ? " · London" : ""}</span></td>
      <td class="c-plan"><span class="chip ${PLAN[r.plan][0]}">${PLAN[r.plan][1]}</span></td>
      <td class="r num" data-l="Units">${r.q.toFixed(4)}</td>
      <td class="r num" data-l="Avg cost">${usd(r.cost / r.q)}</td>
      <td class="r num" data-l="Price">${usd(r.price)}<span class="nm" style="text-align:right">${r.priceAt ? fmtDate(r.priceAt) : "no price yet"}</span></td>
      <td class="r num" data-l="Value">${usd(r.value)}</td>
      <td class="r num ${cls(r.gain)}" data-l="Gain">${sgn(r.gain)}${usd(Math.abs(r.gain))}<span class="nm" style="text-align:right">${pctf(r.pct)}</span></td>
      <td class="num c-lt" data-l="Long-term from">${r.lots.map((l) => `${fmtDate(l.ltd)}${exact(l) ? "" : '<sup title="Date from the holdings report (first purchase). Exact once the Transactions Report is uploaded.">*</sup>'}${r.lots.length > 1 ? ` <span class="muted">(${l.q.toFixed(4)})</span>` : ""}`).join("<br>")}</td>
      <td class="c-act"><span class="chip ${r.action.tone}" title="${esc(r.action.why)}">${esc(r.action.label)}</span><span class="nm act-why">${esc(r.action.why)}</span></td></tr>`).join("")}</tbody>
    <tfoot><tr><td colspan="5">Total</td><td class="r num">${usd(tv)}</td><td class="r num ${cls(tv - tc)}">${sgn(tv - tc)}${usd(Math.abs(tv - tc))}</td><td colspan="2"></td></tr></tfoot>
  </table></div>
  <p class="note">Hover an action to see why. "Long-term from" is the first day a sale counts as long-term (held more than 24 months); each purchase has its own date. <b>*</b> means the date is the first-purchase date from the holdings report and becomes exact once your Transactions Report is uploaded. Prices refresh every weekday morning.</p>
  ${trackingCard()}`;
  el.querySelectorAll("[data-hf]").forEach((b) => (b.onclick = () => { HF = b.dataset.hf; renderHoldings(); }));
}
let HF = "all";

/* ---------- plan ---------- */
function renderPlan() {
  const el = $("#p-plan");
  if (!S) { el.innerHTML = emptyCard(); return; }
  const s = S.settings, sp = monthlySplit(S);
  el.innerHTML = `
  ${(() => { const ms = monthStatus(); return ms.done ? `<div class="card"><p class="done-note"><span class="chip good">${ic("check")}${longMonth(ms.ym)} invested</span> ${ms.boughtTxt}</p></div>` : ""; })()}
  <div class="card"><h2>${monthStatus().done ? `Next month's investment · ${monthStatus().label}` : "This month's investment"}</h2>
    <div class="facts"><div><span class="eyebrow">Monthly amount</span><span class="num">${inr(s.monthlyInr)}</span></div><div><span class="eyebrow">₹ per $</span><span class="num">${s.fx}</span><span class="note">${s.fxAt ? "as of " + fmtDate(s.fxAt) : ""}</span></div><div><span class="eyebrow">Bank + brokerage</span><span class="num">~${s.feePct}%</span></div><div><span class="eyebrow">You invest</span><span class="num">${usd(sp.usd)}</span></div></div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Bucket</th><th>Buy</th><th class="r">Target</th><th class="r">Now</th><th class="r">Standard split</th><th class="r">${monthStatus().done ? "Next month" : "This month"}</th></tr></thead>
      <tbody>${sp.rows.map((r) => `<tr><td><span style="display:inline-flex;gap:8px;align-items:center"><span class="sw" style="background:${bcol(r.bucket)}"></span>${esc(r.bucket)}</span></td>
        <td><span class="sym">${tk(r.buy)}</span><span class="nm">${esc((CATALOG[r.buy] || {}).name || "")}${r.buy.startsWith("LSE~") ? " · London" : ""}</span></td>
        <td class="r num">${r.w}%</td><td class="r num">${r.nowPct.toFixed(0)}%</td>
        <td class="r num">${usd(r.std)}</td>
        <td class="r num"><b>${r.shares ? `${r.shares} share${r.shares > 1 ? "s" : ""}` : usd(r.reb)}</b>${r.whole ? `<span class="nm" style="text-align:right">${r.shares ? "≈" + usd(r.reb) : "skip: " + esc(r.skipWhy)}${r.vc && r.vc.label ? " · " + esc(r.vc.label) : ""}</span>` : ""}</td></tr>`).join("")}</tbody>
      <tfoot><tr><td colspan="4">Total</td><td class="r num">${usd(sp.usd)}</td><td class="r num">${usd(sp.rows.reduce((a, r) => a + r.reb, 0))}</td></tr></tfoot>
    </table></div>
    <p class="note">"This month" tilts towards whatever is below target, so you rebalance without selling or paying tax. A company above 10% of the sleeve gets nothing until it drops back. The exchange rate updates when you upload an INDmoney remittance receipt. To change the amount or targets, tell Claude in chat.</p>
  </div>
  <div class="grid2">
    <div class="card"><h3>Why the London-listed (UCITS Acc) versions</h3>
      <ol class="rules">
        <li><b>No dividends paid to you.</b> The fund reinvests them, so there is nothing to declare each year at your slab rate.</li>
        <li><b>Lower US withholding.</b> An Irish fund pays 15% US tax on US dividends. A US-listed ETF paying you directly loses 25%.</li>
        <li><b>No US estate tax.</b> The US can tax a non-resident's US-listed assets above $60,000 at death. Irish funds are outside that.</li>
        <li><b>Same Indian tax on sale:</b> held more than 24 months, 12.5%. INDmoney buys them from your existing US wallet, from $1.</li>
      </ol>
      <p class="note">Trade-off: slightly higher fees than VOO/QQQ and London trading hours (about 1:30 pm to 10 pm IST). The fund name in INDmoney should say "Acc".</p></div>
    <div class="card"><h3>Copper rules</h3>
      <ol class="rules">
        <li>Copper miners swing far more than the S&amp;P 500. Keep them at <b>10% or less</b> of this sleeve.</li>
        <li>Buy only through the monthly plan, never a lump sum.</li>
        <li>Use <span class="hl">COPX on London (UCITS Acc)</span>, not the US-listed COPX, whose dividends are taxed twice. INDmoney sells it in <b>whole shares only</b>, so the plan buys <b>1 share</b> in a month when copper is below its 10% target <b>and</b> the value check isn't "Expensive". Other months, copper's money goes to the other funds.</li>
        <li><b>Value check:</b> where the copper miners index sits in its 1-year price range (from the US-listed COPX, same index). Bottom 40% = good value, middle = fair, top 25% = expensive, so wait.</li>
        <li>Avoid copper-futures funds such as CPER. They are US partnerships, and foreign holders face extra withholding when they sell.</li>
      </ol></div>
  </div>`;
  // the satellite (TSM) gets nothing while it is over 10%
}

/* ---------- tax ---------- */
function renderTax() {
  const el = $("#p-tax");
  if (!hasData()) { el.innerHTML = emptyCard(); return; }
  const s = S.settings, lots = lotRows(S, TODAY), groups = {};
  for (const l of lots) (groups[l.ltd] = groups[l.ltd] || []).push(l);
  const keys = Object.keys(groups).sort();
  const lastLegacy = lots.filter((l) => l.plan === "legacy").map((l) => l.ltd).sort().slice(-1)[0];
  const exitYear = lastLegacy ? lastLegacy.slice(0, 4) : null;
  const totNow = lots.reduce((a, l) => a + l.taxNow, 0), totLT = lots.reduce((a, l) => a + l.taxLT, 0);
  const fy = (d) => { const y = +d.slice(0, 4), m = +d.slice(5, 7); return m >= 4 ? `FY ${y}-${String(y + 1).slice(2)}` : `FY ${y - 1}-${String(y).slice(2)}`; };
  const sales = {};
  for (const x of S.sales || []) {
    const k = fy(x.d); sales[k] = sales[k] || { st: 0, lt: 0, n: 0 }; sales[k].n++;
    for (const l of x.lots || []) { const g = ((x.price ?? l.p) - l.p) * l.q; if (x.d >= ltcgDate(l.d)) sales[k].lt += g; else sales[k].st += g; }
  }
  el.innerHTML = `
  <div class="card"><h2>When to sell, and what it costs</h2>
    <p class="note">Estimates use a ${s.slab}% slab plus ${s.cess}% cess. Gains are in rupees: value now at ₹${s.fx}/$, minus what each purchase cost at the rupee rate on its buy date.${lots.some((l) => !l.fxKnown) ? " Purchases made before rupee rates were being recorded use the current rate, so the currency part of their gain isn't counted yet." : ""} Tell Claude in chat if your slab is different.</p>
    <p>Selling everything today: about <b class="num">${inr(totNow)}</b> tax. Waiting for each long-term date: about <b class="num">${inr(totLT)}</b>. Losses would reduce both.</p>
    ${lastLegacy ? `<p><span class="chip wait">Exit window</span> Everything marked "Exit later" is long-term by <b>${fmtDate(lastLegacy)}</b>. Sell those together between then and <b>31 Dec ${exitYear}</b>: one financial year (losses offset gains), 12.5% on the rest, and a short Schedule FA from ${+exitYear + 1}. Put the money into the plan funds the same week.</p>` : ""}
  </div>
  <div class="tbl-wrap"><table>
    <thead><tr><th>Long-term from</th><th>Wait</th><th>Lots</th><th class="r">Gain now</th><th class="r">Tax if sold today</th><th class="r">Tax after date</th><th class="r">You save</th></tr></thead>
    <tbody>${keys.map((k) => { const g = groups[k], gain = g.reduce((a, l) => a + l.gain, 0), tn = g.reduce((a, l) => a + l.taxNow, 0), tl = g.reduce((a, l) => a + l.taxLT, 0), left = g[0].left;
      return `<tr><td class="num">${fmtDate(k)}</td><td><span class="chip ${left <= 0 ? "good" : "wait"}">${esc(daysTxt(left))}</span></td>
      <td>${g.map((l) => `<span class="sym">${tk(l.sym)}</span>${l.gain < 0 ? ' <span class="chip act" style="padding:1px 6px">loss</span>' : ""}`).join(", ")}</td>
      <td class="r num ${cls(gain)}">${sgn(gain)}${usd(Math.abs(gain))}</td><td class="r num">${inr(tn)}</td><td class="r num">${inr(tl)}</td><td class="r num pos">${inr(tn - tl)}</td></tr>`; }).join("")}</tbody>
  </table></div>
  <div class="grid2">
    <div class="card"><h3>Rules for selling at low tax</h3>
      <ol class="rules">
        <li><b>Gains:</b> sell only after the "long-term from" date. Before it, the gain is added to your salary income and taxed at your slab.</li>
        <li><b>Losses:</b> sell any time. A loss costs no tax and cancels gains in the same April–March year, including gains on Indian shares.</li>
        <li><b>Pair them:</b> in a year you sell winners, sell losers in the same April–March year.</li>
        <li><b>March review:</b> if a plan fund is well below cost, sell and buy it back to book the loss. India has no wash-sale rule, but confirm with your CA first.</li>
        <li><b>Oldest first:</b> sales take the oldest units first, so recent monthly buys keep their clock.</li>
        <li><b>Big exits before 31 Dec:</b> everything held in a calendar year goes into that year's Schedule FA.</li>
      </ol></div>
    <div class="card"><h3>Sales recorded</h3>
      ${Object.keys(sales).length ? `<div class="tbl-wrap"><table><thead><tr><th>Year</th><th class="r">Sales</th><th class="r">Short-term</th><th class="r">Long-term</th></tr></thead><tbody>${Object.keys(sales).sort().map((k) => `<tr><td>${k}</td><td class="r num">${sales[k].n}</td><td class="r num ${cls(sales[k].st)}">${usd(sales[k].st)}</td><td class="r num ${cls(sales[k].lt)}">${usd(sales[k].lt)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">No sales yet. Sales found in your statements appear here by financial year, ready for Schedule CG.</p>`}
      <p class="note">Rebalance check every January and July. Fix drift with new money. Sell to rebalance only if a bucket is more than 10 points off target <i>and</i> those units are already long-term.</p></div>
  </div>`;
}

/* ---------- yearly checklist (ticks, auto-filled where uploads prove it) ---------- */
const CAL = [
  { m: 0, id: "jan-import", text: "Upload December's statement and a fresh holdings report" },
  { m: 0, id: "jan-rebal", text: "Rebalance check: look at Allocation vs target" },
  { m: 2, id: "mar-harvest", text: "Before 31 Mar: sell anything below cost that you'd book as a loss this year" },
  { m: 3, id: "apr-1042", text: "Download Form 1042-S (US tax withheld on dividends) and upload it" },
  { m: 5, id: "jun-pnl", text: "Download INDmoney's tax P&L for the last financial year and upload it" },
  { m: 6, id: "jul-67", text: "File Form 67 (foreign tax credit) before your return" },
  { m: 6, id: "jul-itr", text: "By 31 Jul: file ITR-2 with Schedule FA (Jan–Dec holdings), FSI, TR and CG" },
  { m: 6, id: "jul-rebal", text: "Rebalance check: look at Allocation vs target" },
  { m: 11, id: "dec-exit", text: "Before 31 Dec: finish any planned exits so next year's Schedule FA is shorter" },
];
const MNAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
let calYear = +TODAY.slice(0, 4);
function autoDone(year) {
  const done = {};
  if (!S) return done;
  for (const h of S.holdings) for (const l of h.lots) if (+l.d.slice(0, 4) === year) done["sip-" + (+l.d.slice(5, 7) - 1)] = true;
  if ((S.imports || []).some((x) => x.kind === "statement" && x.period === `${year - 1}-12-31`)) done["jan-import"] = true;
  return done;
}
function renderCalendar() {
  const el = $("#p-calendar");
  if (!S) { el.innerHTML = emptyCard(); return; }
  const mine = (S.checklist[calYear] = S.checklist[calYear] || {}), auto = autoDone(calYear);
  const isDone = (id) => !!(auto[id] || mine[id]);
  const months = [...new Set(CAL.map((c) => c.m))];
  el.innerHTML = `
  <div class="card"><div class="fields" style="justify-content:space-between"><h2>Yearly checklist</h2>
    <div class="seg" role="group" aria-label="Year">${[calYear - 1, calYear, calYear + 1].map((y) => `<button class="btn ${y === calYear ? "primary" : ""}" data-year="${y}">${y}</button>`).join("")}</div></div>
    <div><div class="eyebrow" style="margin-bottom:6px">Months with a purchase (filled from your statements)</div>
    <div class="sipgrid">${MNAMES.map((n, i) => `<span class="cov ${auto["sip-" + i] ? "have" : ""}">${n}</span>`).join("")}</div></div>
    <div class="cal">${months.map((m) => `<div class="month"><div class="m">${MNAMES[m]}</div><div class="checks">${CAL.filter((c) => c.m === m).map((c) => `<label for="ck-${c.id}"><input type="checkbox" id="ck-${c.id}" data-ck="${c.id}" ${isDone(c.id) ? "checked" : ""} ${auto[c.id] ? "disabled" : ""}><span>${esc(c.text)}${auto[c.id] ? ' <span class="chip good" style="padding:1px 6px">from uploads</span>' : ""}</span></label>`).join("")}</div></div>`).join("")}</div>
    <p class="note">Schedule FA lists every foreign holding you held at any time from January to December, even with no sale. Missing it can bring heavy penalties under the Black Money Act. TCS starts only above ₹10 lakh of foreign remittances in a financial year; ${inr(S.settings.monthlyInr * 12)} a year stays clear.</p>
  </div>`;
  el.querySelectorAll("[data-year]").forEach((b) => (b.onclick = () => { calYear = +b.dataset.year; renderCalendar(); }));
  el.querySelectorAll("[data-ck]").forEach((c) => c.addEventListener("change", () => { mine[c.dataset.ck] = c.checked; dirty(); }));
}

/* ---------- ask ---------- */
const PRESETS = ["What exactly should I buy this month, and why?", "Should I sell any holding now?", "When is my next tax-saving sell date, and what will I save?", "Is my copper allocation still sensible?", "What should I upload next?"];
function renderAsk() {
  const el = $("#p-ask");
  el.innerHTML = `<div class="card"><h2>Ask about your portfolio</h2>
    <p class="note">Answers use the holdings, purchase dates, targets and tax settings in this app.</p>
    <div class="presets">${PRESETS.map((q, i) => `<button class="btn" data-pq="${i}" ${sampleFn ? "" : "disabled"}>${esc(q)}</button>`).join("")}</div>
    <form id="askform" class="checks"><label class="field" for="ask-q">Or ask your own question<textarea id="ask-q" placeholder="Anything about selling, tax dates or this month's buys"></textarea></label>
    <div><button class="btn primary" id="ask-go" type="submit" ${sampleFn ? "" : "disabled"}>Ask</button></div></form>
    <div class="answer" id="ask-a" hidden></div>
    <p class="note" ${sampleFn ? "hidden" : ""}>Asking needs the optional AI helper: a free Gemini key saved as a Supabase secret (see the README).</p></div>`;
  el.querySelectorAll("[data-pq]").forEach((b) => (b.onclick = () => ask(PRESETS[+b.dataset.pq])));
  $("#askform").onsubmit = (e) => { e.preventDefault(); const q = $("#ask-q").value.trim(); if (q) ask(q); };
}
async function ask(q, a) {
  if (!sampleFn) return;
  a = a || $("#ask-a"); a.hidden = false; a.textContent = "Thinking…";
  el2disable(true);
  const ctx = S ? { today: TODAY, settings: S.settings, targets: S.targets, health: health(S, TODAY), holdings: holdingRows(S, TODAY).map((r) => ({ sym: r.sym, plan: r.plan, bucket: r.bucket, units: +r.q.toFixed(6), cost: +r.cost.toFixed(2), value: +r.value.toFixed(2), priceAt: r.priceAt, lots: r.lots.map((l) => ({ bought: l.d, units: +l.q.toFixed(6), price: +l.p.toFixed(2), longTermFrom: l.ltd, dateExact: ["statement", "document", "transactions"].includes(l.src) })) })), sales: S.sales, thisMonth: monthlySplit(S), reportsReceived: S.imports } : null;
  const prompt = `You are the user's investing guide for the US/Japan/copper "backup" sleeve they hold through INDmoney under LRS; their main portfolio is Indian. They follow instructions, so be direct: give the action, the date and the amount, then the reason in one or two sentences.
Rules: foreign shares/ETFs held more than 24 months -> 12.5% LTCG plus cess; otherwise slab rate (settings.slab) plus cess. Losses offset gains in the same April-March year and carry forward 8 years. US dividends to them are withheld at 25%. New money goes to Ireland-domiciled UCITS Acc funds on the London Stock Exchange (LSE~ tickers). plan: core = keep buying, keep = hold, legacy = exit after its long-term date or now if at a loss. Rebalance with new money; band ±5 points; no single company above 10%. Copper max 10%, monthly buys only.
Never invent numbers not in the data. If data is missing (see health, reportsReceived, dateExact=false), say which upload would fix it; the four INDmoney reports are the Transactions Report (all trades), Holdings Report, Account Statement (monthly PDF) and Form 1042-S (yearly). Mention a CA only for filing questions. Not SEBI-registered advice: say so once, briefly, only if recommending a sale.
Data (JSON): ${JSON.stringify(ctx)}
Question: ${q}`;
  try { const r = await sampleFn(prompt, { onText: ({ text }) => { a.textContent = text; } }); a.textContent = r.text; }
  catch (err) { a.textContent = err && err.code === "rate_limited" ? "Too many questions in a short time. Try again in a minute." : err && err.code === "not_granted" ? "Asking isn't allowed on this view." : "Couldn't get an answer. Try again."; }
  el2disable(false);
}
function el2disable(v) { document.querySelectorAll("#p-ask button").forEach((b) => (b.disabled = v || !sampleFn)); }

/* ---------- small helpers kept from the old 3D stage ---------- */
function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }

/* gentle 3D tilt on raised tiles */
document.addEventListener("pointermove", (e) => {
  const el = e.target.closest && e.target.closest(".tilt"); if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
  el.style.transform = `perspective(700px) rotateX(${(-y * 6).toFixed(2)}deg) rotateY(${(x * 8).toFixed(2)}deg) translateZ(4px)`;
});
document.addEventListener("pointerout", (e) => { const el = e.target.closest && e.target.closest(".tilt"); if (el && !el.contains(e.relatedTarget)) el.style.transform = ""; });

/* ---------- this month's buys as 3D flip cards ---------- */
function unitsHint(r) { const h = S.holdings.find((x) => x.sym === r.buy); return h && h.price ? `≈ ${(r.reb / h.price).toFixed(4)} units` : "by dollar amount"; }
function buyCards() {
  const sp = monthlySplit(S), fx = S.settings.fx;
  const why = {
    "LSE~CSPX": "The 500 biggest US companies. The core of the sleeve: 0.07% a year and dividends reinvested.",
    "LSE~CNDX": "The 100 biggest Nasdaq companies, mostly tech. Your single US stocks already add tech, so it gets less.",
    "LSE~IJPA": "About 1,000 Japanese companies. Different economy, different currency: the heart of the backup.",
    "LSE~CPPR": "Pure-play copper miners: grids, EVs and data centres need copper. Volatile, so capped at 10%. INDmoney sells it in whole units only, so it's bought a few units at a time when copper falls behind target.",
    "LSE~COPX": "Copper miners: grids, EVs and data centres need copper. Volatile, so capped at 10%. Whole shares only: 1 share in a month when copper is below target and the price isn't near its 1-year high.",
    TSM: "Taiwan Semiconductor. Paused while it is over 10% of the sleeve.",
  };
  return `<div class="flips">${sp.rows.map((r) => `<button class="flip" type="button" aria-label="${tk(r.buy)}: ${usd(r.reb)}. Tap for why.">
    <span class="flip-in"><span class="face front" style="--c:${bcol(r.bucket)}"><span class="eyebrow">${flag(SYM_CC[r.buy] || "WORLD")}${esc(r.bucket)}</span><span class="tick-big">${tk(r.buy)}</span><span class="amt num">${r.shares ? `${r.shares} share${r.shares > 1 ? "s" : ""}` : r.reb >= 1 ? usd(r.reb) : r.whole ? "Skip" : "Paused"}</span><span class="note">${r.shares ? `≈ ${usd(r.reb)} · enter 1 in Qty` : r.reb >= 1 ? unitsHint(r) : r.whole ? esc(r.skipWhy) : "Nothing this month"}</span>${r.whole && r.vc && r.vc.label ? `<span class="gap">${esc(r.vc.label)} · ${Math.round(r.vc.pos * 100)}% of 1-yr range</span>` : ""}<span class="gap">Now ${r.nowPct.toFixed(0)}% · target ${r.w}%</span></span>
    <span class="face back"><span class="eyebrow">Why ${tk(r.buy)}</span><span>${esc(why[r.buy] || "")}</span><span class="note">${r.buy.startsWith("LSE~") ? "London-listed. Buy between 1 pm and 8:30 pm IST." : "US-listed."}</span></span></span></button>`).join("")}</div>`;
}
document.addEventListener("click", (e) => { const f = e.target.closest(".flip"); if (f) f.classList.toggle("on"); });

/* ---------- growth plan ---------- */
const SCEN = [{ r: 0.08, label: "Cautious · 8%" }, { r: 0.11, label: "Middle · 11%" }, { r: 0.13, label: "Strong · 13%" }];
const HORIZ = [5, 10, 15, 20, 30];
const INFL = 0.05;
let G = { r: 0.11, step: 0, yrs: 20 };
try { const g = JSON.parse(localStorage.getItem("gbp-growth") || "null"); if (g) G = Object.assign(G, g); } catch (e) {}
function saveG() { try { localStorage.setItem("gbp-growth", JSON.stringify(G)); } catch (e) {} }
function project(monthly, annual, years, step, cost, startVal, startCost) {
  const r = Math.pow(1 + annual, 1 / 12) - 1, rows = [];
  let bal = startVal, inv = startCost, m = monthly;
  for (let y = 1; y <= years; y++) { for (let k = 0; k < 12; k++) { bal = bal * (1 + r) + m * (1 - cost); inv += m; } rows.push({ y, inv, bal, m }); m *= 1 + step; }
  return rows;
}
const lakh = (v) => (Math.abs(v) >= 1e7 ? "₹" + (v / 1e7).toFixed(2) + " Cr" : "₹" + (v / 1e5).toFixed(1) + " L");
function growthNumbers(p, s, yrs) {
  const taxRate = 0.125 * (1 + (s.cess ?? 4) / 100), gain = Math.max(0, p.bal - p.inv), tax = gain * taxRate, keep = p.bal - tax, factor = Math.pow(1 + INFL, yrs);
  return { taxRate, gain, tax, keep, profit: keep - p.inv, factor, real: keep / factor };
}
/* ---------- click a slice (or its label): that bucket's details ---------- */
const BUCKET_ABOUT = {
  "US core": "The broad US market: the 500 biggest US companies. The steady base of the sleeve.",
  "US tech": "The biggest US tech and growth companies. Faster growth, bigger swings.",
  Japan: "Japanese companies of every size. A different economy and currency from India and the US.",
  Copper: "Companies that mine copper. Tied to electrification; the most volatile part of the plan.",
  Satellite: "Single companies you believe in. Kept to 5% so no one company can hurt the plan.",
  Emerging: "Brazil, Korea and Taiwan funds from before the plan. They move with India, so they're being phased out.",
};
document.addEventListener("click", (e) => { const b = e.target.closest("#legend [data-bucket]"); if (b) showBucket(b.dataset.bucket); });
function showBucket(name) {
  const box = $("#bucket"); if (!box) return;
  document.querySelectorAll("#legend [data-bucket]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.bucket === name)));
  document.querySelectorAll("#capsules [data-cap]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cap === name)));
  const t = ((S && S.targets) || DEFAULT_TARGETS).find((x) => x.bucket === name) || { w: 0, buy: "" };
  const color = bcol(name);
  let body;
  if (hasData()) {
    const all = holdingRows(S, TODAY), total = all.reduce((a, r) => a + r.value, 0);
    const rows = all.filter((r) => r.bucket === name).sort((a, b) => b.value - a.value);
    const val = rows.reduce((a, r) => a + r.value, 0), cost = rows.reduce((a, r) => a + r.cost, 0), g = val - cost;
    const sp = monthlySplit(S).rows.find((r) => r.bucket === name);
    body = `<div class="mini"><div><span class="eyebrow">Now</span><span class="num">${total ? ((100 * val) / total).toFixed(1) : 0}%</span></div><div><span class="eyebrow">Target</span><span class="num">${t.w}%</span></div><div><span class="eyebrow">This month</span><span class="num">${sp && sp.reb >= 1 ? usd(sp.reb) : "—"}</span></div></div>
      <p class="note">${esc(BUCKET_ABOUT[name] || "")}${t.buy ? ` New money goes into <b>${tk(t.buy)}</b>.` : " No new money goes here."}</p>
      ${rows.length ? `<div class="tbl-wrap"><table><thead><tr><th>Holding</th><th class="r">Paid</th><th class="r">Value</th><th class="r">Gain</th><th>Plan</th></tr></thead><tbody>${rows.map((r) => `<tr><td><span class="sym">${tk(r.sym)}</span><span class="nm">${esc(r.name)}</span></td><td class="r num">${usd(r.cost)}</td><td class="r num">${usd(r.value)}</td><td class="r num ${cls(r.gain)}">${sgn(r.gain)}${usd(Math.abs(r.gain))}<span class="nm" style="text-align:right">${pctf(r.pct)}</span></td><td><span class="chip ${PLAN[r.plan][0]}">${PLAN[r.plan][1]}</span></td></tr>`).join("")}</tbody>
      <tfoot><tr><td>Total</td><td class="r num">${usd(cost)}</td><td class="r num">${usd(val)}</td><td class="r num ${cls(g)}">${sgn(g)}${usd(Math.abs(g))}</td><td></td></tr></tfoot></table></div>` : `<p class="muted">Nothing held here yet. It fills up from this month's buys.</p>`}`;
  } else {
    body = `<div class="mini"><div><span class="eyebrow">Target</span><span class="num">${t.w}%</span></div><div><span class="eyebrow">Fund</span><span class="num">${t.buy ? tk(t.buy) : "—"}</span></div><div><span class="eyebrow">Per ₹10k</span><span class="num">${inr(100 * t.w)}</span></div></div><p class="note">${esc(BUCKET_ABOUT[name] || "")}</p>`;
  }
  box.style.setProperty("--c", color);
  box.innerHTML = `<div class="bh"><div><div class="eyebrow">Bucket</div><h2>${bucketFlags(name)}${esc(name)}</h2></div><button class="x" type="button" aria-label="Close details">×</button></div>${body}`;
  box.hidden = false;
  const dlg = $("#bucketdlg"), reset = () => document.querySelectorAll("#legend [data-bucket], #capsules [data-cap]").forEach((b) => b.setAttribute("aria-pressed", "false"));
  if (dlg) { if (!dlg.open) dlg.showModal(); dlg.onclose = reset; dlg.onclick = (e) => { if (e.target === dlg) dlg.close(); }; }
  box.querySelector(".x").onclick = () => { if (dlg && dlg.open) dlg.close(); else { box.hidden = true; reset(); } };
}

/* ---------- how buy prices are tracked ---------- */
function trackingCard() {
  const tx = lastImport("transactions"), lse = S.holdings.filter((h) => h.sym.startsWith("LSE~") && qtyOf(h) > 1e-7);
  const hist = Object.keys((S.settings && S.settings.fxHistory) || {}).sort();
  return `<div class="card"><h3>How your buy prices are tracked</h3>
    <ol class="track-steps">
      <li><b>Every purchase is kept separately</b> with its date, units and dollar price, so each has its own 24-month date and its own gain.</li>
      <li><b>Where the buy prices come from:</b> the Transactions Report gives every past buy exactly${tx ? ` (received, up to ${fmtDate(tx.period)})` : " (not uploaded yet, so older purchases use the average price and first-buy date from the Holdings Report)"}. New London purchases come from your order screenshot, then get confirmed by the next Holdings and Transactions Reports. Duplicates are recognised and skipped.</li>
      <li><b>Today's value</b> uses closing prices refreshed every weekday morning. Gain = today's value minus what you paid.</li>
      <li><b>Rupee cost:</b> ${hist.length ? `INDmoney's rupee rate is saved daily (since ${fmtDate(hist[0])}), so each new purchase also records what it cost in rupees.` : "from now on INDmoney's rupee rate is saved daily, so each new purchase also records what it cost in rupees."} India taxes the rupee gain, which includes any fall in the rupee.</li>
    </ol>
    <p class="note">${lse.length ? `London funds held: ${lse.map((h) => tk(h.sym)).join(", ")}.` : "No London funds yet: after today's buys, upload the order screenshots or the Holdings Report and they'll appear here with their buy prices."}</p></div>`;
}

/* ---------- allocation: dumbbell chart, now (dot) vs target (ring) ---------- */
function allocChart(buckets) {
  const top = Math.ceil(Math.max(40, ...buckets.map((b) => Math.max(b.pct, b.w))) / 10) * 10, ticks = [];
  for (let t = 0; t <= top; t += 10) ticks.push(t);
  const pos = (v) => `${(100 * v) / top}%`;
  return `<div class="dumb" role="table" aria-label="Allocation now versus target">
    <div class="dkey"><span><i class="dk-now"></i>Now</span><span><i class="dk-tgt"></i>Target</span></div>
    ${buckets.map((b) => { const d = b.pct - b.w, st = b.w === 0 ? (b.pct > 0.5 ? "over" : "ok") : Math.abs(d) <= 5 ? "ok" : d > 0 ? "over" : "under";
      const pill = st === "ok" ? `<span class="chip good">${ic("check")}On target</span>` : st === "over" ? `<span class="chip wait">${ic("up")}${Math.abs(d).toFixed(0)} pts over</span>` : `<span class="chip neutral">${ic("down")}${Math.abs(d).toFixed(0)} pts under</span>`;
      const lo = Math.min(b.pct, b.w), hi = Math.max(b.pct, b.w);
      return `<div class="drow" role="row" title="${esc(b.bucket)}: now ${b.pct.toFixed(1)}% (${usd(b.value)}), target ${b.w}%">
        <span class="dlab" role="cell"><span class="sw" style="background:${bcol(b.bucket)}"></span>${bucketFlags(b.bucket)}${esc(b.bucket)}</span>
        <span class="dplot" role="cell">${ticks.map((t) => `<i class="dgrid" style="left:${pos(t)}"></i>`).join("")}
          <i class="dline ${st}" style="left:${pos(lo)};width:calc(${pos(hi - lo)})"></i>
          <i class="dtgt" style="left:${pos(b.w)}"></i>
          <i class="dnow" style="left:${pos(b.pct)};background:${bcol(b.bucket)}"><em>${b.pct.toFixed(0)}%</em></i></span>
        <span class="dstat" role="cell">${pill}<span class="note">target ${b.w}%</span></span></div>`; }).join("")}
    <div class="drow daxis" aria-hidden="true"><span></span><span class="dplot">${ticks.map((t) => `<b style="left:${pos(t)}">${t}%</b>`).join("")}</span><span></span></div>
  </div>`;
}

/* ---------- game layer: player card, missions, achievements (all computed from your data) ---------- */
const ICON = {
  star: '<path d="M12 2l3 6.5 7 .8-5.2 4.8 1.5 7L12 17.6 5.7 21l1.5-7L2 9.3l7-.8z"/>',
  globe: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" fill="none" stroke="currentColor" stroke-width="2"/>',
  pick: '<path d="M4 20l9-9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><path d="M8 5c4-2 9-1 12 3-4-1-7-1-9 1z"/>',
  shield: '<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z"/><path d="M8 12l3 3 5-6" fill="none" stroke="var(--surface)" stroke-width="2"/>',
  hourglass: '<path d="M6 2h12v4l-4 6 4 6v4H6v-4l4-6-4-6z"/>',
  flame: '<path d="M12 2c1 4 6 6 6 12a6 6 0 01-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-4-1-6 1-9z"/>',
  target: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="1.8"/>',
  scroll: '<path d="M6 3h10a3 3 0 013 3v13a2 2 0 01-2 2H8a3 3 0 01-3-3V5"/><path d="M9 8h7M9 12h7M9 16h4" stroke="var(--surface)" stroke-width="1.6"/>',
};
const UI_IC = {
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', lock: '<rect x="5" y="10.5" width="14" height="10" rx="3"/><path d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5"/>',
  refresh: '<path d="M20 12a8 8 0 11-2.3-5.6M20 4v5h-5"/>', bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0012 3z"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>', down: '<path d="M12 5v14M6 13l6 6 6-6"/>', rupee: '<path d="M7 5h10M7 9.5h10M7 5h3.5a4.5 4.5 0 010 9H7l7.5 6"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.2v.1"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
};
const ic = (k) => `<span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24">${UI_IC[k]}</svg></span>`;
const svg = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">${ICON[k]}</svg>`;
function buyMonths() { const s = new Set(); if (S) for (const h of S.holdings) for (const l of h.lots) s.add(l.d.slice(0, 7)); return [...s].sort(); }
function streak() {
  const set = new Set(buyMonths()); let d = new Date(TODAY + "T00:00:00Z"), n = 0;
  const key = () => d.toISOString().slice(0, 7);
  if (!set.has(key())) d.setUTCMonth(d.getUTCMonth() - 1);
  while (set.has(key())) { n++; d.setUTCMonth(d.getUTCMonth() - 1); }
  return n;
}
const RANKS = [[0, "Rookie"], [3, "Saver"], [6, "Investor"], [12, "Compounder"], [24, "Long-term legend"]];
function player() {
  const months = buyMonths().length, lvl = Math.max(1, months), rank = RANKS.filter(([m]) => months >= m).slice(-1)[0][1];
  const nextR = RANKS.find(([m]) => m > months), rows = hasData() ? holdingRows(S, TODAY) : [];
  const val = rows.reduce((a, r) => a + r.value, 0) * ((S && S.settings.fx) || 96.8), mis = missions(), done = mis.filter((m) => m.done).length;
  return { months, lvl, rank, nextR, val, streak: streak(), mis, done, ach: achievements() };
}
function missions() {
  if (!hasData()) return [];
  const thisMonth = TODAY.slice(0, 7), boughtNow = S.holdings.some((h) => h.lots.some((l) => l.d.startsWith(thisMonth) && h.sym.startsWith("LSE~")));
  const rows = holdingRows(S, TODAY), losers = rows.filter((r) => r.plan === "legacy" && r.gain < 0);
  const tx = lastImport("transactions");
  return [
    { id: "buy", xp: 100, done: boughtNow, title: `Invest ${inr(S.settings.monthlyInr)} in the plan funds` },
    { id: "harvest", xp: 50, done: !losers.length, title: losers.length ? `Sell ${losers.map((r) => tk(r.sym)).join(", ")} to bank the loss tax-free` : "No loss-making legacy holdings left" },
    { id: "tx", xp: 50, done: !!tx && daysBetween(tx.period, TODAY) < 95, title: "Upload a fresh Transactions Report" },
    { id: "hold", xp: 25, done: true, title: "Don't sell winners before their 12.5% date" },
  ];
}
function achievements() {
  const rows = hasData() ? holdingRows(S, TODAY) : [], has = (s) => rows.some((r) => r.sym === s);
  const b = hasData() ? bucketView(S) : [], val = (n) => (b.find((x) => x.bucket === n) || {}).value || 0;
  const lots = hasData() ? lotRows(S, TODAY) : [], firstLT = lots.map((l) => l.ltd).sort()[0];
  const lossSold = (S && S.sales || []).some((x) => (x.lots || []).some((l) => (x.price ?? l.p) < l.p));
  const onTarget = b.filter((x) => x.w > 0).every((x) => Math.abs(x.pct - x.w) <= 5);
  const st = streak();
  return [
    { k: "star", name: "First trade", got: rows.length > 0, how: "Make your first purchase" },
    { k: "globe", name: "Globe trotter", got: val("Japan") > 0 && val("US core") > 0, how: "Own both US and Japan funds" },
    { k: "pick", name: "Copper miner", got: has("LSE~CPPR") || has("LSE~COPX"), how: "Own the copper miners fund" },
    { k: "shield", name: "Tax-smart", got: lossSold, how: "Bank a loss tax-free" },
    { k: "hourglass", name: "Patience pays", got: !!firstLT && firstLT <= TODAY, how: firstLT ? `Unlocks ${fmtDate(firstLT)}, when your first purchase turns long-term` : "Hold a purchase for 24 months" },
    { k: "flame", name: "3-month streak", got: st >= 3, how: `${st}/3 months in a row` },
    { k: "target", name: "Bullseye", got: hasData() && onTarget, how: "Every bucket within 5 points of target" },
    { k: "scroll", name: "Paperwork pro", got: !!lastImport("transactions"), how: "Upload the Transactions Report" },
  ];
}
function renderPlayer() {
  const el = $("#player"); if (!el) return;
  const steps = document.querySelector(".hero .steps");
  if (!hasData()) { el.hidden = true; if (steps) steps.hidden = false; return; }
  if (steps) steps.hidden = true;
  const p = player(), got = p.ach.filter((a) => a.got).length, pct = p.mis.length ? (100 * p.done) / p.mis.length : 0;
  el.hidden = false;
  el.innerHTML = `<div class="pc-lvl" role="img" aria-label="Level ${p.lvl}"><i class="medal" aria-hidden="true"></i><span aria-hidden="true">Level</span><b aria-hidden="true">${p.lvl}</b></div>
    <div class="pc-main"><div class="pc-top"><b>${esc(p.rank)}</b><span class="note">${p.nextR ? `${p.nextR[0] - p.months} more investing month${p.nextR[0] - p.months === 1 ? "" : "s"} to ${esc(p.nextR[1])}` : "Top rank"}</span></div>
      <div class="xp" role="progressbar" aria-valuemin="0" aria-valuemax="${p.mis.length}" aria-valuenow="${p.done}" aria-label="This month's missions"><i style="width:${pct}%"></i><span>${p.done}/${p.mis.length} missions this month</span></div>
      <div class="pc-stats"><span>${svg("star")}<b class="num">${lakh(p.val)}</b> abroad</span><span>${svg("flame")}<b class="num">${p.streak}</b> month streak</span><span>${svg("shield")}<b class="num">${got}/${p.ach.length}</b> badges</span></div></div>`;
}
function questCard(month) {
  const byId = Object.fromEntries(missions().map((m) => [m.id, m])), list = orders();
  const xs = list.map((o) => byId[o.mid]).filter(Boolean), tot = xs.reduce((a, m) => a + m.xp, 0), got = xs.filter((m) => m.done).reduce((a, m) => a + m.xp, 0);
  return `<div class="card b7 reveal"><div class="fields" style="justify-content:space-between;align-items:center"><div><div class="eyebrow">Your quest for ${month}</div><h2>Do these, in this order</h2></div><span class="chip ${got === tot ? "good" : "neutral"}">${got}/${tot} XP</span></div>
    <ol class="orders">${list.map((o) => { const m = byId[o.mid]; return `<li class="${m && m.done ? "done" : ""}"><span class="chip ${o.tone}">${esc(o.tag)}</span><div><b>${o.title}</b><br><span class="muted">${o.body}</span></div>${m ? `<span class="xpb">${m.done ? "Earned " : ""}+${m.xp} XP</span>` : "<span></span>"}</li>`; }).join("")}</ol>
    <p class="note">Tasks tick themselves when your uploads show they're done.</p></div>`;
}
function missionsCard() {
  const mis = missions(); if (!mis.length) return "";
  return `<div class="card"><div class="fields" style="justify-content:space-between;align-items:center"><div><div class="eyebrow">${new Date(TODAY + "T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}</div><h2>Missions</h2></div><span class="chip ${mis.every((m) => m.done) ? "good" : "neutral"}">${mis.filter((m) => m.done).length}/${mis.length} complete</span></div>
    <ul class="missions">${mis.map((m) => `<li class="${m.done ? "done" : ""}"><span class="mk" aria-hidden="true">${m.done ? ic("check") : ""}</span><span>${m.title}</span><span class="xpb">+${m.xp} XP</span></li>`).join("")}</ul>
    <p class="note">Missions tick themselves when your uploads show they're done.</p></div>`;
}
function badgesCard() {
  const a = achievements();
  return `<div class="card"><h2>Badges</h2>
    <div class="badges">${a.map((x) => `<div class="badge ${x.got ? "got" : ""} tilt" title="${esc(x.how)}"><span class="bi">${svg(x.k)}</span><b>${esc(x.name)}</b><span class="note">${x.got ? "Unlocked" : esc(x.how)}</span></div>`).join("")}</div>
    ${(() => { const g = a.filter((x) => x.got).length; return `<div class="badge-next"><div class="xp" role="progressbar" aria-valuemin="0" aria-valuemax="${a.length}" aria-valuenow="${g}" aria-label="Badges unlocked"><i style="width:${(100 * g) / a.length}%"></i><span>${g} of ${a.length} badges unlocked</span></div></div>`; })()}</div>`;
}
/* pause 3D loops while they're scrolled out of view (saves battery) */
const onScreen = new WeakMap();
function watchVisible(el) { onScreen.set(el, true); if (!window.IntersectionObserver) return; new IntersectionObserver((es) => es.forEach((e) => onScreen.set(el, e.isIntersecting))).observe(el); }

/* ---------- dashboard header: status chips, the big number, bucket capsules, tilted card, Claude's take ---------- */
const MI = {
  cal: '<svg viewBox="0 0 24 24"><path d="M4 6h16v14H4zM8 3v5M16 3v5M4 11h16"/></svg>',
  pulse: '<svg viewBox="0 0 24 24"><path d="M3 12h4l3-7 4 14 3-7h4"/></svg>',
  tag: '<svg viewBox="0 0 24 24"><path d="M3 12V4h8l9 9-8 8z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>',
};
/* small 3D objects drawn in flat tones: a lit top face, a darker side and a soft contact shadow (no gradients) */
function icon3d(kind) {
  const shadow = '<ellipse cx="32" cy="57" rx="19" ry="4" fill="rgba(14,15,12,.16)"/>';
  const body = {
    coins: shadow + [44, 35, 26].map((y) => `<path d="M12 ${y}v6a20 7 0 0040 0v-6z" fill="#7fcf55"/><ellipse cx="32" cy="${y}" rx="20" ry="7" fill="#9fe870"/><ellipse cx="32" cy="${y}" rx="13" ry="4" fill="none" stroke="#6fbf43" stroke-width="2"/>`).join(""),
    globe: shadow + `<circle cx="32" cy="30" r="22" fill="#0a8bcc"/><path d="M32 8a22 22 0 010 44 16 22 0 010-44z" fill="#087bb4"/><path d="M19 16c6 2 7 8 3 11s-1 9 4 10M44 14c-4 5-1 9 4 10M40 40c3-3 8-3 10-1" fill="none" stroke="#9fe870" stroke-width="4" stroke-linecap="round"/>`,
    chart: shadow + [[12, 34, 20], [26, 24, 30], [40, 14, 40]].map(([x, y, h]) => `<path d="M${x} ${y}h11v${h}H${x}z" fill="#38c8ff"/><path d="M${x + 11} ${y}l4-3v${h}l-4 3z" fill="#0a8bcc"/><path d="M${x} ${y}l4-3h11l-4 3z" fill="#9be3ff"/>`).join(""),
    shield: shadow + `<path d="M32 6l20 7v14c0 13-9 22-20 26-11-4-20-13-20-26V13z" fill="#9fe870"/><path d="M32 6l20 7v14c0 13-9 22-20 26z" fill="#7fcf55"/><path d="M23 30l6 6 12-12" fill="none" stroke="#0e0f0c" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
  }[kind];
  return `<svg class="k3d" viewBox="0 0 64 64" aria-hidden="true">${body}</svg>`;
}
/* ---------- when were prices refreshed, and which market close they are */
function tzOffsetMin(tz, t) { const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(t)).map((x) => [x.type, x.value])); return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute) - t) / 6e4; }
function localToUtc(isoD, tz, hh, mm) { const [y, m, d] = isoD.split("-").map(Number), guess = Date.UTC(y, m - 1, d, hh, mm); return guess - tzOffsetMin(tz, guess) * 6e4; }
const ist = (t, o) => new Date(t).toLocaleString("en-IN", Object.assign({ timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }, o || {}));
function nextRefresh(now) { for (let k = 0; k < 8; k++) { const t = new Date(now + k * 864e5), dIso = new Date(t.getTime() + 5.5 * 36e5).toISOString().slice(0, 10), u = localToUtc(dIso, "Asia/Kolkata", 7, 10), wd = new Date(dIso + "T00:00:00Z").getUTCDay(); if (wd >= 2 && wd <= 6 && u > now) return u; } return null; }
async function refreshNowClick(b) {
  b.disabled = true; b.textContent = "refreshing…";
  try { const r = await refreshPricesNow(); if (r && r.skipped && !r.us) { b.textContent = "done earlier today"; return; } const d = await cloudLoad(); S = adopt(d); renderAll(); resultModal([{ name: "Prices refreshed", what: `${r.us} US/London and ${r.india} Indian prices${r.fx ? ` · ₹${r.fx} per $` : ""}${r.skipped && r.skipped.length ? ` · skipped ${r.skipped.length}` : ""}` }], [], ""); }
  catch (e) { b.disabled = false; b.textContent = "refresh now"; resultModal([], ["Couldn't refresh prices: " + cloudErr(e)], ""); }
}
function renderFresh() {
  const el = $("#fresh"); if (!el) return;
  if (!hasData()) { el.hidden = true; return; }
  const hs = S.holdings.filter((h) => qtyOf(h) > 1e-7), dates = (lse) => hs.filter((h) => h.sym.startsWith("LSE~") === lse && h.priceAt).map((h) => h.priceAt).sort();
  const us = dates(false), ls = dates(true), now = Date.now();
  const lastLog = (S.log || []).filter((l) => /^Daily price refresh/.test(l.text)).slice(-1)[0];
  const ref = S.settings.refreshedAt ? ist(Date.parse(S.settings.refreshedAt)) : lastLog ? `${fmtDate(lastLog.d)}, morning run` : "not yet";
  const nx = nextRefresh(now), lonOpen = localToUtc(TODAY, "Europe/London", 8, 0);
  const mkt = (cc, name, arr, tz, hh, mm) => { if (!arr.length) return ""; const newest = arr[arr.length - 1], older = arr.filter((d) => d < newest).length, closeAt = localToUtc(newest, tz, hh, mm);
    return `<div class="fr"><span class="fr-f">${flag(cc)}</span><span><small>${name} prices</small><b>Close of ${new Date(newest + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}</b><em>closed ${ist(closeAt)} IST${older ? ` · ${older} older` : ""}</em></span></div>`; };
  el.hidden = false;
  el.innerHTML = `<div class="fr"><span class="fr-ic" aria-hidden="true"><svg viewBox="0 0 24 24">${UI_IC.refresh}</svg></span><span><small>Last refreshed</small><b>${esc(ref)}</b><em>${nx ? "next " + ist(nx) + " IST" : ""} · <button type="button" class="linkbtn" id="fr-now">refresh now</button></em></span></div>
    ${mkt("US", "US", us, "America/New_York", 16, 0)}${mkt("GB", "London", ls, "Europe/London", 16, 30)}
    <div class="fr"><span class="fr-ic" aria-hidden="true"><svg viewBox="0 0 24 24">${UI_IC.rupee}</svg></span><span><small>Rupee rate</small><b>₹${S.settings.fx} per $</b><em>INDmoney, ${fmtDate(S.settings.fxAt)}</em></span></div>
    <p class="fr-tip">To match INDmoney exactly, compare after the morning refresh and before London opens at ${ist(lonOpen, { weekday: undefined, day: undefined, month: undefined })} IST on weekdays, or any time at the weekend. Both markets are closed then, so both show the same closing prices.</p>`;
  const fb = $("#fr-now"); if (fb) fb.onclick = () => refreshNowClick(fb);
}
function renderHeader() {
  const meta = $("#meta"), big = $("#bigval"), sub = $("#bigsub"), caps = $("#capsules"), tilt = $("#tiltcard"), ins = $("#insight");
  if (!meta) return;
  const today = new Date(TODAY + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  if (tilt) tilt.innerHTML = "";
  renderNetWorth();
  if (!hasData()) {
    meta.innerHTML = `<span class="mchip"><span class="ic">${MI.cal}</span><b>${today}</b></span>`;
    big.textContent = "—"; sub.innerHTML = `<span>Upload your INDmoney reports to see this</span>`;
    caps.innerHTML = `<p class="note">Your US, Japan and London funds appear here, split into buckets, once your INDmoney Transactions and Holdings reports are uploaded.</p><div><button class="btn" type="button" data-go="upload">Upload INDmoney reports</button></div>`;
    ins.hidden = true; $("#fresh").hidden = true; return;
  }
  const rows = holdingRows(S, TODAY), fx = S.settings.fx, val = rows.reduce((a, r) => a + r.value, 0), cost = rows.reduce((a, r) => a + r.cost, 0), g = val - cost;
  const hc = health(S, TODAY), bad = hc.filter((h) => !h.ok).length;
  meta.innerHTML = `<span class="mchip"><span class="ic">${MI.cal}</span><b>${today}</b></span>
    <span class="mchip"><span class="ic">${MI.pulse}</span><b>${bad ? `${bad} check${bad > 1 ? "s" : ""} to fix` : "All data checks pass"}</b></span>`;
  big.textContent = usd(val);
  sub.innerHTML = `<span>Invested <b>${usd(cost)}</b></span><span class="${cls(g)}">${g >= 0 ? "Gain" : "Loss"} <b>${sgn(g)}${usd(Math.abs(g))} (${pctf(cost ? g / cost : 0)})</b></span>`;
  $("#ab-sub").textContent = `${rows.length} holdings · ${CUR === "INR" ? `at ₹${fx} per $` : "US, Japan and London funds"}`;
  renderFresh();
  const b = bucketView(S).filter((x) => x.value > 0.005);
  caps.innerHTML = b.map((x) => `<div class="cap"><button type="button" data-cap="${esc(x.bucket)}" aria-pressed="false" aria-label="${esc(x.bucket)}: ${usd(x.value)}, ${x.pct.toFixed(0)} percent. Show details"><span class="sw" style="background:${bcol(x.bucket)}"></span><span class="cn">${bucketFlags(x.bucket)}${esc(x.bucket)}</span><span class="cv">${usd(x.value)}</span><span class="cp">${x.pct.toFixed(0)}%</span></button></div>`).join("");
  caps.querySelectorAll("[data-cap]").forEach((bt) => (bt.onclick = () => showBucket(bt.dataset.cap)));
  // the AI take: computed locally from your data, then ask anything
  const sp = monthlySplit(S), gaps = bucketView(S).filter((x) => x.w > 0).map((x) => ({ ...x, gap: x.pct - x.w })).sort((a, c) => a.gap - c.gap);
  const under = gaps[0], over = gaps[gaps.length - 1], nx = lotRows(S, TODAY).find((l) => l.left > 0), put = under && sp.rows.find((r) => r.bucket === under.bucket);
  const lines = [
    under ? `${under.bucket} is ${Math.abs(under.gap).toFixed(0)} points under target${put ? `, so it gets ${usd(put.reb)} of ${monthStatus().short}'s money` : ""}.` : "",
    over && over.gap > 5 ? `${over.bucket} is ${over.gap.toFixed(0)} points over, so it gets less until the gap closes.` : "",
    nx ? `Next 12.5% date: ${tk(nx.sym)} on ${fmtDate(nx.ltd)}.` : "",
    bad ? `${bad} data check${bad > 1 ? "s need" : " needs"} an upload.` : "",
  ].filter(Boolean);
  ins.hidden = false;
  ins.innerHTML = `<div class="ihead"><b><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z"/></svg>AI take</b><span class="note">${today}</span></div>
    <p>${lines.map(esc).join(" ")}</p>
    <div class="ans" id="ins-a" hidden></div>
    <form class="ask" id="ins-form"><label class="sr" for="ins-q">Ask about your portfolio</label><input id="ins-q" placeholder="${sampleFn ? "Ask anything about your portfolio" : "AI helper is off"}" ${sampleFn ? "" : "disabled"} autocomplete="off"><button class="btn primary send" type="submit" aria-label="Ask" ${sampleFn ? "" : "disabled"}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg></button></form>`;
  $("#ins-form").onsubmit = (e) => { e.preventDefault(); const q = $("#ins-q").value.trim(); if (q) ask(q, $("#ins-a")); };
}

/* ---------- countries: flags, where each holding's money actually is ---------- */
const SYM_CC = { VOO: "US", QQQ: "US", SCHD: "US", VIG: "US", AAPL: "US", AMZN: "US", GOOGL: "US", META: "US", MSFT: "US", NVDA: "US", SPCX: "US", "LSE~CSPX": "US", "LSE~CNDX": "US", EWJ: "JP", "LSE~IJPA": "JP", EWZ: "BR", EWY: "KR", EWT: "TW", TSM: "TW", ASML: "NL", "LSE~COPX": "CA", "LSE~CPPR": "CA", VT: "WORLD" };
const BUCKET_CC = { "US core": ["US"], "US tech": ["US"], Japan: ["JP"], Copper: ["CA", "AU", "CL"], Satellite: ["TW"], Emerging: ["BR", "KR", "TW"] };
const CC = {
  US: { name: "United States", id: "840", ll: [39, -98] }, JP: { name: "Japan", id: "392", ll: [36.5, 138] }, TW: { name: "Taiwan", id: "158", ll: [23.7, 121] },
  BR: { name: "Brazil", id: "076", ll: [-10, -52] }, KR: { name: "South Korea", id: "410", ll: [36.4, 127.9] }, NL: { name: "Netherlands", id: "528", ll: [52.2, 5.3] },
  CA: { name: "Canada", id: "124", ll: [58, -105] }, AU: { name: "Australia", id: "036", ll: [-25, 134] }, CL: { name: "Chile", id: "152", ll: [-31, -71] }, GB: { name: "United Kingdom", id: null, ll: null }, IN: { name: "India", id: "356", ll: [22, 79] }, WORLD: { name: "Worldwide", id: null, ll: null },
};
let flagN = 0;
function flag(cc, title) {
  const fid = "fc" + ++flagN, t = `<title>${esc(title || (CC[cc] || {}).name || cc)}</title>`, wrap = (inner) => `<svg class="flag" viewBox="0 0 30 20" role="img">${t}<clipPath id="${fid}"><rect width="30" height="20" rx="3"/></clipPath><g clip-path="url(#${fid})">${inner}</g><rect width="30" height="20" rx="3" fill="none" stroke="rgba(0,0,0,.18)"/></svg>`;
  switch (cc) {
    case "US": { let s = '<rect width="30" height="20" fill="#fff"/>'; for (let i = 0; i < 7; i++) s += `<rect y="${i * 2.86}" width="30" height="1.43" fill="#b22234"/>`; s += '<rect width="13" height="10.7" fill="#3c3b6e"/>'; for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) s += `<circle cx="${1.6 + c * 2.4 + (r % 2) * 1.2}" cy="${1.6 + r * 2.4}" r=".55" fill="#fff"/>`; return wrap(s); }
    case "JP": return wrap('<rect width="30" height="20" fill="#fff"/><circle cx="15" cy="10" r="5.6" fill="#bc002d"/>');
    case "TW": return wrap('<rect width="30" height="20" fill="#fe0000"/><rect width="15" height="10" fill="#000095"/><circle cx="7.5" cy="5" r="2.6" fill="#fff"/><circle cx="7.5" cy="5" r="1.7" fill="#000095"/><circle cx="7.5" cy="5" r="1.3" fill="#fff"/>');
    case "BR": return wrap('<rect width="30" height="20" fill="#009b3a"/><path d="M15 2.5L27 10 15 17.5 3 10z" fill="#fedf00"/><circle cx="15" cy="10" r="4.2" fill="#002776"/>');
    case "KR": return wrap('<rect width="30" height="20" fill="#fff"/><path d="M11 10a4 4 0 018 0z" fill="#cd2e3a"/><path d="M11 10a4 4 0 008 0z" fill="#0047a0"/><g fill="#000"><rect x="4" y="4" width="4" height=".9" transform="rotate(-34 6 4.5)"/><rect x="22" y="4" width="4" height=".9" transform="rotate(34 24 4.5)"/><rect x="4" y="15" width="4" height=".9" transform="rotate(34 6 15.5)"/><rect x="22" y="15" width="4" height=".9" transform="rotate(-34 24 15.5)"/></g>');
    case "NL": return wrap('<rect width="30" height="6.67" fill="#ae1c28"/><rect y="6.67" width="30" height="6.67" fill="#fff"/><rect y="13.33" width="30" height="6.67" fill="#21468b"/>');
    case "CA": return wrap('<rect width="30" height="20" fill="#fff"/><rect width="7.5" height="20" fill="#d52b1e"/><rect x="22.5" width="7.5" height="20" fill="#d52b1e"/><path d="M15 4l1.3 2.6 2-.6-.7 3 1.9 1-3 1.2.4 2.3H14l.4-2.3-3-1.2 1.9-1-.7-3 2 .6z" fill="#d52b1e"/>');
    case "AU": return wrap('<rect width="30" height="20" fill="#00008b"/><path d="M0 0l12 8M12 0L0 8" stroke="#fff" stroke-width="1.6"/><path d="M6 0v8M0 4h12" stroke="#fff" stroke-width="2.6"/><path d="M6 0v8M0 4h12" stroke="#e4002b" stroke-width="1.4"/><circle cx="6" cy="14.5" r="1.6" fill="#fff"/><circle cx="22" cy="6" r=".9" fill="#fff"/><circle cx="25" cy="10" r=".9" fill="#fff"/><circle cx="22" cy="16" r=".9" fill="#fff"/><circle cx="19" cy="10" r=".9" fill="#fff"/>');
    case "IN": return wrap('<rect width="30" height="20" fill="#fff"/><rect width="30" height="6.67" fill="#FF9933"/><rect y="13.33" width="30" height="6.67" fill="#138808"/><circle cx="15" cy="10" r="2.6" fill="none" stroke="#000080" stroke-width=".7"/><circle cx="15" cy="10" r=".6" fill="#000080"/>');
    case "GB": return wrap('<rect width="30" height="20" fill="#012169"/><path d="M0 0L30 20M30 0L0 20" stroke="#fff" stroke-width="4"/><path d="M0 0L30 20M30 0L0 20" stroke="#C8102E" stroke-width="1.5"/><path d="M15 0v20M0 10h30" stroke="#fff" stroke-width="6"/><path d="M15 0v20M0 10h30" stroke="#C8102E" stroke-width="3.4"/>');
    case "CL": return wrap('<rect width="30" height="20" fill="#fff"/><rect y="10" width="30" height="10" fill="#d52b1e"/><rect width="10" height="10" fill="#0039a6"/><circle cx="5" cy="5" r="1.8" fill="#fff"/>');
    default: return `<svg class="flag" viewBox="0 0 30 20" role="img">${t}<rect width="30" height="20" rx="3" fill="#1f6e44"/><circle cx="15" cy="10" r="6.5" fill="none" stroke="#bff0d2" stroke-width="1.4"/><path d="M8.5 10h13M15 3.5c3 2 3 11 0 13M15 3.5c-3 2-3 11 0 13" fill="none" stroke="#bff0d2" stroke-width="1.1"/></svg>`;
  }
}
const bucketFlags = (b) => (BUCKET_CC[b] ? `<span class="flags" aria-hidden="true">${BUCKET_CC[b].map((c) => flag(c)).join("")}</span>` : "");
/* how much of the sleeve sits in each country (by where each fund invests) */
function countryExposure() {
  if (!hasData()) return [];
  const rows = holdingRows(S, TODAY), tot = rows.reduce((a, r) => a + r.value, 0), by = {};
  for (const r of rows) { const c = SYM_CC[r.sym] || "WORLD"; by[c] = (by[c] || 0) + r.value; }
  return Object.entries(by).map(([cc, v]) => ({ cc, v, pct: tot ? (100 * v) / tot : 0 })).sort((a, b) => b.v - a.v);
}
function countriesCard(compact) {
  const ex = countryExposure(); if (!ex.length) return "";
  return `<div class="card glass ${compact ? "b5" : "b12"} reveal"><div><h2>Where your money is</h2><p class="note">By the country each holding's companies are based in. The copper miners fund is counted under Canada, where most of its miners are listed.</p></div>
    <div class="ctry ${compact ? "compact" : ""}">${(compact ? ex.slice(0, 5) : ex).map((e) => `<div class="ct" style="--w:${Math.max(2, e.pct).toFixed(1)}%">${flag(e.cc)}<span><b>${esc((CC[e.cc] || { name: e.cc }).name)}</b><span class="note">${usd(e.v)}</span></span><span class="num">${e.pct.toFixed(0)}%</span><i></i></div>`).join("")}</div>
    ${compact && ex.length > 5 ? `<p class="note">Also ${ex.slice(5).map((e) => `${esc((CC[e.cc] || { name: e.cc }).name)} ${e.pct.toFixed(0)}%`).join(", ")}.</p>` : ""}</div>`;
}

/* NSE symbols for listed holdings (used by the weekly price refresh); unknown ones are looked up by the refresh itself */
const IN_NSE = { INE848E01016: "NHPC", INE622W01025: "ACMESOLAR", INE0V6F01027: "HYUNDAI", INE742F01042: "ADANIPORTS", INE885A01032: "ARE&M", INE208A01029: "ASHOKLEY", INE238A01034: "AXISBANK", INE028A01039: "BANKBARODA", INE263A01024: "BEL", INE397D01024: "BHARTIARTL", INE029A01011: "BPCL", INE486A01021: "CESC", INE522F01014: "COALINDIA", INE299U01018: "CROMPTON", INE089A01031: "DRREDDY", INE129A01019: "GAIL", INE860A01027: "HCLTECH", INE040A01034: "HDFCBANK", INE267A01025: "HINDZINC", INE030A01027: "HINDUNILVR", INE094A01015: "HINDPETRO", INE090A01021: "ICICIBANK", INE242A01010: "IOC", INE053F01010: "IRFC", INE009A01021: "INFY", INE962Y01021: "IRCON", INE335Y01020: "IRCTC", INE379A01028: "ITCHOTELS", INE154A01025: "ITC", INE237A01036: "KOTAKBANK", INE04I401011: "KPITTECH", INE139A01034: "NATIONALUM", INE987B01026: "NATCOPHARM", INE095N01031: "NBCC", INE589A01014: "NLCINDIA", INE0ONG01011: "NTPCGREEN", INE733E01010: "NTPC", INE274J01014: "OIL", INE213A01029: "ONGC", INE134E01011: "PFC", INE415G01027: "RVNL", INE0DD101019: "RAILTEL", INE020B01018: "RECLTD", INE002A01018: "RELIANCE", INE320J01015: "RITES", INE062A01020: "SBIN", INE002L01015: "SJVN", INE467B01029: "TCS", INE669C01036: "TECHM", INE615H01020: "TITAGARH", INE075A01022: "WIPRO" };
/* latest value of an Indian holding: weekly refreshed price if newer than the statement, else the statement value */
const indCur = (h, I) => (h.lp && h.lpAt && h.lpAt > (h.asOf || (I && I.asOf) || "") ? h.units * h.lp : h.value);
/* ---- Indian broker reports: Groww / Zerodha holdings and Groww order histories ---- */
const dmy = (s) => { s = String(s ?? "").trim(); let m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/); if (m) return iso(+m[3], +m[2] - 1, +m[1]); return parseLooseDate(s); };
const inNum = (v) => (typeof v === "number" ? v : casNum(String(v ?? "").replace(/[₹%]/g, "")));
/* Wint Wealth "Master Report" workbook: Holding Statement (value, cost, YTM, interest so far), Investment Summary (purchase dates),
   Upcoming Cashflow Statement (future interest and principal) and Repayment Summary (interest already paid) */
function rowsFromWintBook(sheets) {
  const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z]/g, "");
  const table = (pred) => { for (const aoa of Object.values(sheets)) { const hi = aoa.findIndex((r) => r && pred(r.map(norm))); if (hi >= 0) return { aoa, hi, h: aoa[hi].map(norm) }; } return null; };
  const col = (h, ...ks) => { for (const k of ks) { const i = h.indexOf(k); if (i >= 0) return i; } for (const k of ks) { const i = h.findIndex((x) => x.startsWith(k)); if (i >= 0) return i; } return -1; };
  const isin = (v) => String(v ?? "").trim().toUpperCase(), ok = (v) => ISIN_RE.test(isin(v)), n = (v) => inNum(v) || 0;
  const hs = table((h) => h.includes("nameofbond") && h.includes("isin") && h.includes("totalinvested") && h.includes("currentvalue")); if (!hs) return null;
  let asOf = null; for (const aoa of Object.values(sheets)) for (const r of aoa) if (r && /date of report/i.test(String(r[0] || ""))) asOf = asOf || dmy(r[1]);
  const H = hs.h, c = { n: col(H, "nameofbond"), i: col(H, "isin"), m: col(H, "maturitydate"), u: col(H, "units"), y: col(H, "ytm"), v: col(H, "currentvalue"), ui: col(H, "upcominginterest"), up: col(H, "upcomingprincipal"), t: col(H, "totalinvested"), pr: col(H, "principalrepaid"), ig: col(H, "interestpaidbefore"), ia: col(H, "interestpaidafter"), tds: col(H, "tdsdeducted"), pt: col(H, "principalrepaymenttype"), it: col(H, "interestrepaymenttype") };
  const by = {};
  for (const r of hs.aoa.slice(hs.hi + 1)) {
    if (!r || !ok(r[c.i]) || !(n(r[c.u]) > 0)) continue;
    const k = isin(r[c.i]), v = n(r[c.v]), o = by[k] || (by[k] = { isin: k, name: String(r[c.n] || "").trim(), mat: dmy(r[c.m]), units: 0, value: 0, invested: 0, upInt: 0, upPrin: 0, prinRep: 0, intG: 0, intN: 0, tds: 0, yv: 0, pType: String(r[c.pt] || ""), iType: String(r[c.it] || ""), lots: [] });
    o.units += n(r[c.u]); o.value += v; o.invested += n(r[c.t]); o.upInt += n(r[c.ui]); o.upPrin += n(r[c.up]); o.prinRep += n(r[c.pr]); o.intG += n(r[c.ig]); o.intN += n(r[c.ia]); o.tds += n(r[c.tds]); o.yv += n(r[c.y]) * v;
  }
  const rows = Object.values(by).map(({ yv, ...o }) => ({ ...o, ytm: o.value ? yv / o.value : 0 }));
  const totRow = hs.aoa.slice(hs.hi + 1).find((r) => r && /^total$/i.test(String(r[c.n] || "").trim())), ytmAll = totRow ? n(totRow[c.y]) : 0;
  if (!rows.length) return null;
  const inv = table((h) => h.includes("bondname") && h.includes("isin") && h.includes("investedamount") && h.includes("dateofinvestment"));
  if (inv) { const c2 = { i: col(inv.h, "isin"), u: col(inv.h, "noofunits"), a: col(inv.h, "investedamount"), d: col(inv.h, "dateofinvestment"), x: col(inv.h, "xirr") };
    for (const r of inv.aoa.slice(inv.hi + 1)) { if (!r || !ok(r[c2.i]) || !by[isin(r[c2.i])]) continue; const q = n(r[c2.u]), d = dmy(r[c2.d]); if (q > 0 && d) by[isin(r[c2.i])].lots.push({ d, q, p: n(r[c2.a]) / q, x: n(r[c2.x]) }); } }
  for (const o of rows) o.lots = (by[o.isin].lots || []).sort((x, y) => x.d.localeCompare(y.d));
  const names = Object.fromEntries(rows.map((o) => [o.isin, o.name]));
  const cf = table((h) => h.includes("nameofbond") && h.includes("isin") && h.includes("date") && h.includes("transactiontype")), flows = [];
  if (cf) { const c3 = { i: col(cf.h, "isin"), n: col(cf.h, "nameofbond"), d: col(cf.h, "date"), b: col(cf.h, "amountinbank"), p: col(cf.h, "principalrepaid"), ia: col(cf.h, "interestpaidafter"), ig: col(cf.h, "interestpaidbefore") };
    for (const r of cf.aoa.slice(cf.hi + 1)) { if (!r || !ok(r[c3.i])) continue; const d = dmy(r[c3.d]); if (d) flows.push({ d, isin: isin(r[c3.i]), n: names[isin(r[c3.i])] || String(r[c3.n] || "").trim(), bank: n(r[c3.b]), prin: n(r[c3.p]), int: n(r[c3.ia]), intG: n(r[c3.ig]) }); } }
  const rp = table((h) => h[0] === "date" && h.includes("nameofbond") && h.includes("isin") && h.some((x) => x.startsWith("tdsdeducted"))), paid = [];
  if (rp) { const c4 = { i: col(rp.h, "isin"), n: col(rp.h, "nameofbond"), d: col(rp.h, "date"), p: col(rp.h, "principalrepaid"), ia: col(rp.h, "interestpaidafter"), ig: col(rp.h, "interestpaidbefore"), t: col(rp.h, "tdsdeducted") };
    for (const r of rp.aoa.slice(rp.hi + 1)) { if (!r || !ok(r[c4.i])) continue; const d = dmy(r[c4.d]); if (d) paid.push({ d, isin: isin(r[c4.i]), n: String(r[c4.n] || "").trim(), prin: n(r[c4.p]), int: n(r[c4.ia]), intG: n(r[c4.ig]), tds: n(r[c4.t]) }); } }
  flows.sort((x, y) => x.d.localeCompare(y.d)); paid.sort((x, y) => x.d.localeCompare(y.d));
  return { kind: "wint", asOf: asOf || TODAY, rows, flows, paid, ytmAll };
}
function rowsFromIndiaSheet(aoa, fname) {
  const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z]/g, "");
  const find = (pred) => aoa.findIndex((r) => r && pred(r.map(norm)));
  const col = (head, ...ks) => { for (const k of ks) { const i = head.findIndex((h) => h === k); if (i >= 0) return i; } for (const k of ks) { const i = head.findIndex((h) => h.includes(k)); if (i >= 0) return i; } return -1; };
  const textAll = aoa.slice(0, 20).map((r) => (r || []).join(" ")).join(" ");
  let hi;
  // IndiaBonds: transaction statement (Buy Transactions sheet)
  if ((hi = find((h) => h.includes("isin") && h.includes("issuername") && h.includes("qty") && h.some((x) => x.startsWith("dateofallotment")) && h.some((x) => x.startsWith("settlementallotmentamount")))) >= 0) {
    const h = aoa[hi].map(norm), cI = col(h, "isin"), cN = col(h, "issuername"), cS = col(h, "securityname"), cC = col(h, "coupon"), cQ = col(h, "qty"), cD = col(h, "dateofallotment"), cM = col(h, "maturitydate"), cA = col(h, "settlementallotmentamount"), cP = col(h, "principalamount"), cAI = col(h, "accruedinterestrs");
    const ddmmmyy = (s) => { const m = String(s ?? "").match(/(\d{1,2})[-\s]([A-Za-z]{3})[a-z]*[-\s](\d{2,4})/); if (!m || MON[m[2].toLowerCase()] == null) return dmy(s); const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; return iso(y, MON[m[2].toLowerCase()], +m[1]); };
    const rows = aoa.slice(hi + 1).filter((r) => r && ISIN_RE.test(String(r[cI] || "").trim())).map((r) => ({ isin: String(r[cI]).trim(), name: String(r[cN] || "").replace(/\s+/g, " ").trim(), sec: String(r[cS] || "").trim(), coupon: inNum(r[cC]) || null, q: inNum(r[cQ]), amt: inNum(r[cA]), prin: inNum(r[cP]), ai: cAI >= 0 ? inNum(r[cAI]) : null, d: ddmmmyy(r[cD]), mat: ddmmmyy(r[cM]) })).filter((r) => r.q > 0 && r.amt > 0 && r.d);
    return rows.length ? { kind: "ib-bonds", asOf: TODAY, rows } : null;
  }
  // IndiaBonds: Cashflow report (all interest and principal, past and future) or Interest report (indicative payouts for a year)
  const ibDate = (s) => { const m = String(s ?? "").match(/(\d{1,2})[-\s]([A-Za-z]{3})[a-z]*[-\s](\d{2,4})/); if (!m || MON[m[2].toLowerCase()] == null) return dmy(s); const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; return iso(y, MON[m[2].toLowerCase()], +m[1]); };
  if ((hi = find((h) => h.includes("nameofbond") && h.includes("isin") && h.includes("date") && h.includes("amountinbank") && h.includes("transactiontype"))) >= 0) {
    const h = aoa[hi].map(norm), cN = col(h, "nameofbond"), cI = col(h, "isin"), cD = col(h, "date"), cB = col(h, "amountinbank"), cP = col(h, "principalrepaid"), cA = col(h, "interestamountafter", "interestpaidafter"), cG = col(h, "interestamountbefore", "interestpaidbefore"), cT = col(h, "tds");
    const rows = aoa.slice(hi + 1).filter((r) => r && ISIN_RE.test(String(r[cI] || "").trim())).map((r) => ({ d: ibDate(r[cD]), isin: String(r[cI]).trim(), n: String(r[cN] || "").replace(/\s+/g, " ").trim(), bank: inNum(r[cB]) || 0, prin: inNum(r[cP]) || 0, int: inNum(r[cA]) || 0, intG: inNum(r[cG]) || 0, tds: inNum(r[cT]) || 0 })).filter((r) => r.d);
    return rows.length ? { kind: "ib-cf", asOf: TODAY, rows, full: true } : null;
  }
  if ((hi = find((h) => h.includes("isin") && h.includes("issuername") && h.some((x) => x.startsWith("indicativeinterestpayment")))) >= 0) {
    const h = aoa[hi].map(norm), cN = col(h, "issuername"), cI = col(h, "isin"), cD = col(h, "indicativeinterestpayment"), amt = h.map((x, i) => (x.startsWith("indicativeinterestamount") ? i : -1)).filter((i) => i >= 0), cT = col(h, "indicativetds"), cF = col(h, "interestpaymentfrequency");
    const cG = amt[0], cA = amt[amt.length - 1];
    const rows = aoa.slice(hi + 1).filter((r) => r && ISIN_RE.test(String(r[cI] || "").trim())).map((r) => ({ d: ibDate(r[cD]), isin: String(r[cI]).trim(), n: String(r[cN] || "").replace(/\s+/g, " ").trim(), prin: 0, intG: inNum(r[cG]) || 0, tds: inNum(r[cT]) || 0, int: inNum(r[cA]) || 0, freq: String(r[cF] || "") })).map((r) => ({ ...r, bank: r.int })).filter((r) => r.d);
    return rows.length ? { kind: "ib-cf", asOf: TODAY, rows, full: false } : null;
  }
  // Zerodha Console: Dividend and Interest (CSV)
  if ((hi = find((h) => h.includes("symbol") && h.some((x) => x.startsWith("exdate")) && h.some((x) => x.startsWith("totaldividend") || x === "netdividendamount" || x.startsWith("dividendamount")))) >= 0) {
    const h = aoa[hi].map(norm), cS = col(h, "symbol"), cD = col(h, "exdate"), cQ = col(h, "qty", "quantity"), cP = col(h, "dividendpershare"), cT = col(h, "totaldividend", "netdividendamount", "dividendamount");
    const rows = aoa.slice(hi + 1).filter((r) => r && r[cS] && inNum(r[cT]) > 0).map((r) => ({ sym: String(r[cS]).trim(), d: dmy(r[cD]) || parseLooseDate(r[cD]), q: inNum(r[cQ]) || null, dps: inNum(r[cP]) || null, amt: inNum(r[cT]) })).filter((r) => r.d);
    return rows.length ? { kind: "zd-div", asOf: TODAY, rows } : null;
  }
  // Groww: Stocks - Holdings statement
  if ((hi = find((h) => h.includes("stockname") && h.includes("isin") && h.includes("averagebuyprice"))) >= 0) {
    const h = aoa[hi].map(norm), cN = col(h, "stockname"), cI = col(h, "isin"), cQ = col(h, "quantity"), cA = col(h, "averagebuyprice"), cC = col(h, "closingprice");
    const m = textAll.match(/as on (\d{2}-\d{2}-\d{4})/i);
    const rows = aoa.slice(hi + 1).filter((r) => r && ISIN_RE.test(String(r[cI] || "").trim())).map((r) => ({ isin: String(r[cI]).trim(), name: String(r[cN] || "").trim(), q: inNum(r[cQ]), avg: inNum(r[cA]) || 0, close: inNum(r[cC]) || 0 })).filter((r) => r.q > 0);
    return rows.length ? { kind: "gr-stocks", asOf: m ? dmy(m[1]) : TODAY, rows } : null;
  }
  // Zerodha Console holdings (Equity / Mutual Funds / Combined sheets)
  if ((hi = find((h) => h.includes("symbol") && h.includes("isin") && h.includes("averageprice") && h.some((x) => x.startsWith("quantityavailable")))) >= 0) {
    const h = aoa[hi].map(norm), cS = col(h, "symbol"), cI = col(h, "isin"), cQ = col(h, "quantityavailable"), cA = col(h, "averageprice"), cC = col(h, "previousclosingprice"), cT = col(h, "instrumenttype");
    const rows = aoa.slice(hi + 1).filter((r) => r && ISIN_RE.test(String(r[cI] || "").trim())).map((r) => ({ isin: String(r[cI]).trim(), name: String(r[cS] || "").trim(), q: inNum(r[cQ]), avg: inNum(r[cA]) || 0, close: inNum(r[cC]) || 0, mf: cT >= 0 && /fund|elss|mutual/i.test(String(r[cT] || "")) || /^INF/.test(String(r[cI])) })).filter((r) => r.q > 0);
    return rows.length ? { kind: "zd-hold", asOf: TODAY, rows } : null;
  }
  // Groww: Mutual Funds - Holdings statement
  if ((hi = find((h) => h.includes("schemename") && h.includes("investedvalue") && h.includes("currentvalue"))) >= 0) {
    const h = aoa[hi].map(norm), cN = col(h, "schemename"), cAmc = col(h, "amc"), cCat = col(h, "category"), cSub = col(h, "subcategory"), cF = col(h, "foliono", "folio"), cSrc = col(h, "source"), cU = col(h, "units"), cV = col(h, "investedvalue"), cC = col(h, "currentvalue");
    const m = textAll.match(/HOLDINGS AS ON (\d{4}-\d{2}-\d{2})/i);
    const rows = aoa.slice(hi + 1).filter((r) => r && r[cN] && inNum(r[cU]) > 0).map((r) => ({ name: String(r[cN]).trim(), amc: String(r[cAmc] || ""), cat: String(r[cCat] || ""), sub: String(r[cSub] || ""), folio: String(r[cF] || ""), src: String(r[cSrc] || ""), units: inNum(r[cU]), invested: inNum(r[cV]) || 0, value: inNum(r[cC]) || 0 }));
    return rows.length ? { kind: "gr-mf", asOf: m ? m[1] : TODAY, rows } : null;
  }
  // Groww: Stocks - Order history
  if ((hi = find((h) => h.includes("isin") && h.includes("type") && h.includes("quantity") && h.some((x) => x.startsWith("executiondate")))) >= 0) {
    const h = aoa[hi].map(norm), cI = col(h, "isin"), cT = col(h, "type"), cQ = col(h, "quantity"), cV = col(h, "value"), cD = col(h, "executiondateandtime", "executiondate"), cSt = col(h, "orderstatus"), cN = col(h, "stockname");
    const rows = aoa.slice(hi + 1).filter((r) => r && ISIN_RE.test(String(r[cI] || "").trim()) && (cSt < 0 || /executed|complete/i.test(String(r[cSt])))).map((r) => ({ isin: String(r[cI]).trim(), n: String(r[cN] || "").trim(), s: /sell/i.test(String(r[cT])) ? -1 : 1, q: inNum(r[cQ]), v: inNum(r[cV]), d: dmy(r[cD]) })).filter((r) => r.q > 0 && r.d);
    return rows.length ? { kind: "gr-st-orders", rows } : null;
  }
  // Groww: Mutual Funds - Order history
  if ((hi = find((h) => h.includes("schemename") && h.includes("transactiontype") && h.includes("units") && h.includes("date"))) >= 0) {
    const h = aoa[hi].map(norm), cN = col(h, "schemename"), cT = col(h, "transactiontype"), cU = col(h, "units"), cA = col(h, "amount"), cD = col(h, "date");
    const rows = aoa.slice(hi + 1).filter((r) => r && r[cN] && inNum(r[cU]) > 0).map((r) => ({ n: String(r[cN]).trim(), s: /redeem|sell|switch.?out|withdraw/i.test(String(r[cT])) ? -1 : 1, q: inNum(r[cU]), v: inNum(r[cA]), d: dmy(r[cD]) })).filter((r) => r.d);
    return rows.length ? { kind: "gr-mf-orders", rows } : null;
  }
  return null;
}
const KIND_IN = { "gr-stocks": "Groww stocks holdings", "zd-hold": "Zerodha holdings", "gr-mf": "Groww mutual fund holdings", "gr-st-orders": "Groww stock order history", "gr-mf-orders": "Groww mutual fund order history", wint: "Wint Wealth master report", "ib-bonds": "IndiaBonds transaction statement", "ib-cf": "IndiaBonds interest / cashflow report", "zd-div": "Zerodha dividend report" };
function applyIndiaSheet(state, rep, fname) {
  const I = state.india; if (!I) return [`${fname}: upload your CDSL/NSDL statement (CAS) first`];
  I.src = I.src || {};
  if (rep.kind === "ib-bonds") { // bonds bought on IndiaBonds, delivered into another demat (here Groww)
    I.via = I.via || {}; I.bondCost = I.bondCost || {}; const by = {};
    for (const r of rep.rows) (by[r.isin] = by[r.isin] || []).push(r);
    for (const [isin, rs] of Object.entries(by)) { I.via[isin] = "IndiaBonds"; I.bondCost[isin] = { cost: rs.reduce((s, r) => s + r.amt, 0), prin: rs.reduce((s, r) => s + r.prin, 0), units: rs.reduce((s, r) => s + r.q, 0), lots: rs.map((r) => ({ d: r.d, q: r.q, p: r.amt / r.q })), coupon: rs[0].coupon, mat: rs[0].mat, src: "IndiaBonds", at: TODAY }; }
    I.src.ib = { asOf: TODAY, rows: rep.rows, file: fname };
    noteImport(state, { kind: rep.kind, period: TODAY, count: rep.rows.length });
    const eff = indHoldings(I);
    return [...rep.rows.map((r) => `${r.name}: ${r.q} bought on ${fmtDate(r.d)} for ${inr(r.amt)} (${r.coupon ? r.coupon + "% coupon, " : ""}matures ${fmtDate(r.mat)})`), `Now ${eff.filter((h) => h.cost != null).length} of ${eff.length} Indian holdings have a buy price`];
  }
  if (rep.kind === "zd-div") return applyInDivs(state, rep.rows);
  if (rep.kind === "ib-cf") { // merge by bond + date; the cashflow report wins over the indicative interest report (it also has principal)
    const old = (I.src.ibcf && I.src.ibcf.rows) || [], by = {};
    for (const r of old) by[r.isin + "|" + r.d] = r;
    for (const r of rep.rows) { const k = r.isin + "|" + r.d; if (!by[k] || rep.full || !by[k].full) by[k] = { ...r, full: rep.full }; }
    const rows = Object.values(by).sort((x, y) => x.d.localeCompare(y.d));
    I.src.ibcf = { asOf: TODAY, rows, file: fname };
    noteImport(state, { kind: rep.kind, period: TODAY, count: rep.rows.length, file: fname });
    const past = rows.filter((r) => r.d <= TODAY), fut = rows.filter((r) => r.d > TODAY);
    return [`${rep.rows.length} payouts read (${rep.full ? "cashflow report" : "interest report"})`, `Received so far: ${inr(past.reduce((s, r) => s + r.int, 0))} after ${inr(past.reduce((s, r) => s + r.tds, 0))} TDS`, `Still to come: ${inr(fut.reduce((s, r) => s + r.int, 0))} interest + ${inr(fut.reduce((s, r) => s + r.prin, 0))} principal`];
  }
  const key = { "gr-stocks": "grSt", "zd-hold": "zd", "gr-mf": "grMF", "gr-st-orders": "grStO", "gr-mf-orders": "grMFO", wint: "wint" }[rep.kind];
  I.src[key] = { asOf: rep.asOf || TODAY, rows: rep.rows, file: fname, ...(rep.kind === "wint" ? { flows: rep.flows, paid: rep.paid, ytmAll: rep.ytmAll } : {}) };
  noteImport(state, { kind: rep.kind, period: rep.asOf || TODAY, count: rep.rows.length });
  buildWatch(I);
  const eff = indHoldings(I);
  const withCost = eff.filter((h) => h.cost != null).length, withDate = eff.filter((h) => h.lots && h.lots.some((l) => l.d)).length;
  const extra = rep.kind === "wint" ? [`${rep.rows.length} bonds · invested ${inr(rep.rows.reduce((s, r) => s + r.invested, 0))} · now ${inr(rep.rows.reduce((s, r) => s + r.value, 0))}`, `${rep.flows.length} upcoming payouts and ${rep.paid.length} past payouts read`] : [];
  return [`${KIND_IN[rep.kind]}: ${rep.rows.length} rows`, ...extra, `Now ${withCost} of ${eff.length} Indian holdings have a buy price and ${withDate} have purchase dates`];
}
/* Indian bond buy prices read from a screenshot (e.g. INDmoney bonds bought into the Groww demat) */
function applyInBonds(state, list) {
  const I = state.india; if (!I) return ["Upload your CDSL/NSDL statement (CAS) first"];
  I.bondCost = I.bondCost || {}; const ch = [], bonds = indHoldings(I).filter((h) => h.type === "bond");
  const ABBR = { NFL: "NAVI FINSERV", INDEL: "INDEL MONEY", MFL: "MUTHOOT FINCORP" };
  const words = (s) => String(s || "").toUpperCase().replace(/\b[A-Z]+\b/g, (w) => ABBR[w] || w).replace(/[^A-Z ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !/^(LTD|LIMITED|PVT|PRIVATE|NCD|BOND|SERIES|THE)$/.test(w));
  for (const b of list) {
    if (!(+b.invested_inr > 0)) continue;
    const isin = String(b.isin || "").trim().toUpperCase();
    let h = ISIN_RE.test(isin) && bonds.find((x) => x.isin === isin);
    const mat = parseLooseDate(b.maturity), dm = mat ? mat.slice(8, 10) + mat.slice(5, 7) + mat.slice(0, 4) : null;
    if (!h && dm) { const c = bonds.filter((x) => x.cost == null && x.name.includes(dm)); if (c.length === 1) h = c[0]; }
    if (!h) { const w = words(b.name), c = bonds.filter((x) => x.cost == null && words(x.name + " " + (x.casName || "")).some((y) => w.includes(y) || w.some((z) => y.startsWith(z) || z.startsWith(y)))); if (c.length === 1) h = c[0]; else if (c.length > 1 && +b.units) h = c.find((x) => Math.abs(x.units - +b.units) < 1e-6) || null; }
    if (!h) { ch.push(`${b.name || isin}: couldn't match it to a bond in your statement`); continue; }
    I.bondCost[h.isin] = { cost: +b.invested_inr, units: +b.units || h.units, d: parseLooseDate(b.date) || null, ytm: +b.ytm || null, mat: parseLooseDate(b.maturity) || null, at: TODAY };
    ch.push(`${h.name}: bought for ${inr(+b.invested_inr)}${+b.ytm ? ` at ${(+b.ytm).toFixed(2)}% yield` : ""}`);
  }
  if (ch.some((x) => /bought for/.test(x))) noteImport(state, { kind: "bond-shot", period: TODAY, count: ch.filter((x) => /bought for/.test(x)).length });
  return ch;
}
/* average buy price of Indian shares / funds read from a holdings screenshot (e.g. INDstocks, which has no downloadable report) */
function applyInHoldings(state, list) {
  const I = state.india; if (!I || !list.length) return [];
  I.shotCost = I.shotCost || {}; const ch = [], H = indHoldings(I).filter((h) => h.type !== "bond");
  const key = (s) => String(s || "").toUpperCase().replace(/\b(LTD|LIMITED|INDIA|THE)\b/g, "").replace(/[^A-Z0-9]/g, "");
  for (const b of list) {
    if (!(+b.avg_inr > 0)) continue;
    const isin = String(b.isin || "").trim().toUpperCase(), plat = String(b.platform || "").toLowerCase();
    let c = H.filter((h) => (ISIN_RE.test(isin) ? h.isin === isin : key(h.name) === key(b.name) || (h.nse && key(h.nse) === key(b.name))));
    if (c.length > 1 && plat) c = c.filter((h) => h.acct.toLowerCase().startsWith(plat.slice(0, 4))) || c;
    if (c.length > 1 && +b.units) c = c.filter((h) => Math.abs(h.units - +b.units) < 1e-6);
    if (c.length > 1) c = c.filter((h) => h.cost == null);
    if (c.length !== 1) { ch.push(`${b.name}: couldn't tell which holding this is`); continue; }
    const h = c[0]; I.shotCost[h.isin + "|" + h.acct] = { avg: +b.avg_inr, units: +b.units || h.units, src: (b.platform || h.acct) + " screenshot", at: TODAY };
    ch.push(`${h.name} (${h.acct}): bought at ₹${(+b.avg_inr).toFixed(2)} a unit`);
  }
  if (ch.some((x) => /bought at/.test(x))) noteImport(state, { kind: "hold-shot", period: TODAY, count: ch.filter((x) => /bought at/.test(x)).length });
  return ch;
}
/* individual fund purchases (e.g. Zerodha ELSS statement), keyed by folio, for funds no order history covers */
function applyInLots(state, list) {
  const I = state.india; if (!I || !list.length) return [];
  I.mfLots = I.mfLots || {}; const ch = [], H = indHoldings(I).filter((h) => h.type === "mf"), by = {};
  // share purchases (per-stock breakdown screens): match by ISIN or NSE symbol
  const SH = indHoldings(I).filter((h) => h.type !== "mf" && h.type !== "bond");
  const nk = (s) => String(s || "").toUpperCase().replace(/\b(LTD|LIMITED|INDIA|THE|CORPORATION|CORP)\b/g, "").replace(/[^A-Z0-9]/g, "");
  list = list.filter((b) => { const isin = String(b.isin || "").trim().toUpperCase(), sym = String(b.symbol || "").trim().toUpperCase(); if (!isin && !sym) return true;
    const plat = String(b.platform || "").toLowerCase();
    let c = SH.filter((h) => (ISIN_RE.test(isin) && h.isin === isin) || (sym && h.nse && h.nse.toUpperCase() === sym));
    if (!c.length && sym) c = SH.filter((h) => nk(h.name) === nk(sym) || nk(h.name).startsWith(nk(sym)) && nk(sym).length >= 4);
    if (c.length > 1 && plat) c = c.filter((h) => h.acct.toLowerCase().startsWith(plat.slice(0, 4))).concat([]).length ? c.filter((h) => h.acct.toLowerCase().startsWith(plat.slice(0, 4))) : c;
    const h = c.length === 1 ? c[0] : c.find((x) => !x.lots) || c[0], d = parseLooseDate(b.date), q = +b.units;
    if (!h || !d || !(q > 0)) { ch.push(`${sym || isin}: couldn't match it to a share you hold`); return false; }
    I.stLots = I.stLots || {}; const k = h.isin + "|" + h.acct, old = I.stLots[k] || [];
    if (!old.some((l) => l.d === d && Math.abs(l.q - q) < 1e-6)) old.push({ d, q, p: +b.amount_inr > 0 ? +b.amount_inr / q : null, tag: b.tag || null });
    I.stLots[k] = old.sort((x, y) => x.d.localeCompare(y.d)); ch.push(`${h.name}: ${q} bought on ${fmtDate(d)}${b.tag ? ` (${b.tag})` : ""}`); return false; });
  for (const b of list) { const d = parseLooseDate(b.date), q = +b.units; if (!d || !(q > 0)) continue; const folio = String(b.folio || "").replace(/\D/g, ""); (by[folio + "|" + mfKey(b.fund || "")] = by[folio + "|" + mfKey(b.fund || "")] || []).push({ d, q, p: +b.amount_inr > 0 ? +b.amount_inr / q : null, fund: b.fund, folio }); }
  for (const rs of Object.values(by)) {
    const f = rs[0], h = H.find((x) => f.folio && String(x.folio || "").replace(/\D/g, "") === f.folio) || H.find((x) => mfKey(x.name) === mfKey(f.fund));
    if (!h) { ch.push(`${f.fund}: couldn't match it to a fund you hold`); continue; }
    const k = String(h.folio || f.folio || mfKey(h.name)), old = I.mfLots[k] || [], seen = new Set(old.map((l) => l.d + "|" + l.q));
    const add = rs.filter((l) => !seen.has(l.d + "|" + l.q)).map(({ d, q, p }) => ({ d, q, p }));
    I.mfLots[k] = [...old, ...add].sort((x, y) => x.d.localeCompare(y.d));
    const got = I.mfLots[k].reduce((s, l) => s + l.q, 0);
    ch.push(`${h.name}: ${add.length} purchase${add.length === 1 ? "" : "s"} added · dates known for ${(+got).toFixed(3)} of ${(+h.units).toFixed(3)} units`);
  }
  if (ch.some((x) => /added|bought on/.test(x))) noteImport(state, { kind: "mf-lots", period: TODAY, count: ch.filter((x) => /added|bought on/.test(x)).length });
  return ch;
}
/* dividends received (Zerodha "Dividend and Interest" CSV or screenshot) */
function applyInDivs(state, list) {
  const I = state.india; if (!I || !list.length) return [];
  I.divs = I.divs || []; const seen = new Set(I.divs.map((x) => x.sym + "|" + x.d)); let n = 0, tot = 0;
  for (const x of list) { const sym = String(x.sym || "").trim().toUpperCase(); if (!sym || !x.d || !(x.amt > 0) || seen.has(sym + "|" + x.d)) continue; seen.add(sym + "|" + x.d); I.divs.push({ sym, d: x.d, q: x.q || null, dps: x.dps || null, amt: x.amt, acct: x.acct || "Zerodha" }); n++; tot += x.amt; }
  I.divs.sort((x, y) => x.d.localeCompare(y.d));
  if (n) noteImport(state, { kind: "divs", period: TODAY, count: n });
  return [n ? `${n} dividend${n === 1 ? "" : "s"} added (${inr(tot)})` : "No new dividends (already added)"];
}
/* the holdings the app shows: statement (CAS) baseline, replaced by fresher broker snapshots */
function indClsFromMF(r) {
  const c = (r.cat + " " + r.sub + " " + r.name).toUpperCase();
  if (/COMMODIT|GOLD|SILVER/.test(c)) return "Gold & silver";
  if (/NASDAQ|FANG|S&P 500|GLOBAL|INTERNATIONAL|US EQUITY|OVERSEAS/.test(c)) return "International";
  if (/DEBT|LIQUID|OVERNIGHT|MONEY MARKET|GILT|ARBITRAGE/.test(c)) return "Debt";
  if (/HYBRID/.test(c)) return "Hybrid";
  return "Equity";
}
const mfKey = (s) => String(s).toUpperCase().replace(/\.\.\.$/, "").replace(/\b(DIRECT|DIR|PLAN|GROWTH|OPTION|OPT|FUND|FD|PL|GR|THE)\b/g, " ").replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const nameKey = (s) => String(s).toUpperCase().replace(/\.\.\.$/, "").replace(/[^A-Z0-9]/g, "");
function indHoldings(I) {
  const src = I.src || {}, newer = (s) => s && s.asOf >= I.asOf, casByIsin = {};
  for (const h of I.holdings) casByIsin[h.isin] = h;
  let out = I.holdings.map((h) => ({ ...h, key: h.isin + "|" + h.acct, from: "CAS" }));
  if (newer(src.grSt)) {
    out = out.filter((h) => !(h.acct === "Groww" && h.type !== "mf" && h.type !== "bond")); // bonds keep the statement value (Groww quotes some bonds as % of face value)
    for (const r of src.grSt.rows) {
      const c = casByIsin[r.isin], isMF = c ? c.type === "mf" : /^INF/.test(r.isin) && !/ETF|BEES|EXCHANGE TRADED|GOLD|SILV/i.test(r.name);
      if (isMF) continue; // fund units held in demat are covered by the mutual fund report
      if (c ? c.type === "bond" : /^INE\w{4}07/.test(r.isin)) continue;
      const type = c ? c.type : /^INF/.test(r.isin) ? "etf" : /INVIT/i.test(r.name) ? "invit" : /^INE\w{4}07/.test(r.isin) ? "bond" : "stock";
      if (!(r.close > 0)) continue;
      out.push({ isin: r.isin, name: c ? c.name : r.name, type, cls: c ? c.cls : casClass(r.name, type), acct: "Groww", units: r.q, price: r.close, value: r.q * r.close, ...(r.avg > 0 ? { avg: r.avg, cost: r.avg * r.q } : {}), key: r.isin + "|Groww", from: "Groww " + fmtDate(src.grSt.asOf), asOf: src.grSt.asOf });
    }
  }
  if (newer(src.zd)) {
    out = out.filter((h) => !(h.acct === "Zerodha" && (h.type !== "mf" || !newer(src.grMF))));
    for (const r of src.zd.rows) {
      if (r.mf && newer(src.grMF)) continue;
      const c = casByIsin[r.isin], type = c ? c.type : r.mf ? "mf" : "stock";
      out.push({ isin: r.isin, name: c ? c.name : r.name, type, cls: c ? c.cls : "Equity", acct: "Zerodha", units: r.q, price: r.close, value: r.q * r.close, ...(r.avg > 0 ? { avg: r.avg, cost: r.avg * r.q } : {}), nse: r.mf ? undefined : r.name, key: r.isin + "|Zerodha", from: "Zerodha", asOf: src.zd.asOf });
    }
  }
  if (newer(src.grMF)) {
    out = out.filter((h) => h.type !== "mf");
    for (const r of src.grMF.rows) out.push({ isin: "", name: r.name, type: "mf", cls: indClsFromMF(r), sub: r.sub, acct: r.src === "External" ? "MF folios (CAMS/KFin)" : "Groww", folio: r.folio, units: r.units, price: r.value / r.units, value: r.value, cost: r.invested, key: "MF:" + nameKey(r.name) + "|" + r.folio, mfName: r.name, from: "Groww " + fmtDate(src.grMF.asOf), asOf: src.grMF.asOf });
  }
  // Wint Wealth bonds: the master report has value (with accrued interest), price paid, YTM and purchase dates
  if (src.wint) {
    const WA = "Wint Wealth (NSDL)", by = Object.fromEntries(src.wint.rows.map((r) => [r.isin, r]));
    const bondOf = (r) => ({ ytm: r.ytm, mat: r.mat, intN: r.intN, intG: r.intG, tds: r.tds, upInt: r.upInt, upPrin: r.upPrin, pType: r.pType, iType: r.iType });
    if (newer(src.wint)) {
      out = out.filter((h) => h.acct !== WA);
      for (const r of src.wint.rows) { const c = casByIsin[r.isin];
        out.push({ isin: r.isin, name: r.name, casName: c && c.name, type: "bond", cls: "Debt", acct: WA, units: r.units, price: r.value / r.units, value: r.value, cost: r.invested, avg: r.invested / r.units, lots: r.lots.map((l) => ({ d: l.d, q: l.q, p: l.p })), bond: bondOf(r), key: r.isin + "|Wint", from: "Wint " + fmtDate(src.wint.asOf), asOf: src.wint.asOf }); }
    } else for (const h of out) { const r = h.acct === WA && by[h.isin]; if (!r || Math.abs(r.units - h.units) > 1e-6) continue; // a newer statement: keep its value, add what Wint knows
      Object.assign(h, { name: r.name, casName: h.name, cost: r.invested, avg: r.invested / r.units, lots: r.lots.map((l) => ({ d: l.d, q: l.q, p: l.p })), bond: bondOf(r) }); }
  }
  // weekly prices
  const px = I.px || {};
  for (const h of out) { const p = px[h.type === "mf" && !h.isin ? "MF:" + nameKey(h.name) : h.isin]; if (p && p.p > 0 && p.at > (h.asOf || I.asOf)) { h.lp = p.p; h.lpAt = p.at; } }
  // purchase dates from order histories (FIFO)
  attachLots(out, src);
  // bonds bought elsewhere (e.g. on INDmoney) but held in another demat: platform label and buy price from a screenshot
  for (const h of out) if (h.type === "bond") {
    const via = (I.via || {})[h.isin]; if (via) h.via = via;
    const ibn = src.ib && src.ib.rows.find((r) => r.isin === h.isin); if (ibn && ibn.name) { h.casName = h.name; h.name = ibn.name.replace(/\b(LIMITED|LTD|PRIVATE|PVT)\b\.?/gi, "").trim().toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()); }
    const bc = (I.bondCost || {})[h.isin]; if (bc && h.cost == null && bc.units > 0) { h.cost = bc.cost * (h.units / bc.units); h.avg = bc.cost / bc.units; if (bc.coupon) h.coupon = bc.coupon; if (bc.lots && Math.abs(bc.units - h.units) < 1e-6) h.lots = bc.lots.map((l) => ({ ...l })); else if (bc.d) h.lots = [{ d: bc.d, q: h.units, p: h.avg }]; else if (h.lots) h.lots = h.lots.map((l) => ({ ...l, p: h.avg })); if (bc.ytm) h.ytmBuy = bc.ytm; }
  }
  // IndiaBonds payouts: interest so far, upcoming cash flows and an estimated yield (XIRR of price paid vs all payouts before TDS)
  const ibcf = src.ibcf && src.ibcf.rows;
  if (ibcf) for (const h of out) if (h.type === "bond" && !h.bond) {
    const rs = ibcf.filter((r) => r.isin === h.isin); if (!rs.length) continue;
    const past = rs.filter((r) => r.d <= TODAY), fut = rs.filter((r) => r.d > TODAY), bc = (I.bondCost || {})[h.isin] || {};
    const buy = h.lots && h.lots.length && h.lots.every((l) => l.d && l.p != null) ? h.lots.map((l) => ({ d: l.d, v: -l.q * l.p })) : null;
    const ytm = buy ? xirr([...buy, ...rs.filter((r) => buy.every((b) => r.d > b.d)).map((r) => ({ d: r.d, v: r.prin + r.intG }))]) : null;
    const lastPrin = rs.filter((r) => r.prin > 0).map((r) => r.d).sort().slice(-1)[0];
    h.bond = { ytm: ytm != null ? 100 * ytm : bc.coupon || 0, ytmEst: true, mat: bc.mat || lastPrin || null, intN: past.reduce((s, r) => s + r.int, 0), intG: past.reduce((s, r) => s + r.intG, 0), tds: past.reduce((s, r) => s + r.tds, 0), upInt: fut.reduce((s, r) => s + r.int, 0), upPrin: fut.reduce((s, r) => s + r.prin, 0), iType: (rs.find((r) => r.freq) || {}).freq || "", src: "IndiaBonds" };
  }
  // fund purchases from statements like Zerodha's ELSS statement (by folio), for funds without dated lots
  for (const h of out) if (h.type === "mf") { const L = (I.mfLots || {})[String(h.folio || "")] || (I.mfLots || {})[mfKey(h.name)]; if (!L || (h.lots && h.lots.some((l) => l.d))) continue;
    const lots = L.map((l) => ({ ...l })); let got = lots.reduce((s, l) => s + l.q, 0);
    if (h.units - got > 0.01) { const known = lots.reduce((s, l) => s + l.q * (l.p || 0), 0), rest = h.units - got; lots.unshift({ d: null, q: rest, p: h.cost != null ? Math.max(0, (h.cost - known) / rest) : null }); }
    h.lots = lots; }
  // share purchases from a broker's per-stock breakdown (e.g. Zerodha IPO allotments)
  for (const h of out) if (h.type !== "mf" && h.type !== "bond") { const L = (I.stLots || {})[h.isin + "|" + h.acct]; if (!L) continue;
    if (h.lots && h.lots.some((l) => l.d)) { // order history covers part: use the screenshot only for the undated units
      const und = h.lots.filter((l) => !l.d), need0 = und.reduce((s, l) => s + l.q, 0); if (need0 < 1e-6) continue;
      const have = new Set(h.lots.filter((l) => l.d).map((l) => l.d)); let need = need0; const add = [];
      for (const l of L) { if (have.has(l.d) || need < 1e-6) continue; const t = Math.min(l.q, need); add.push({ ...l, q: t }); need -= t; }
      h.lots = [...h.lots.filter((l) => l.d), ...add, ...(need > 1e-6 ? [{ d: null, q: need, p: und[0].p }] : [])].sort((x, y) => String(x.d || "").localeCompare(String(y.d || "")));
      continue; }
    const lots = L.map((l) => ({ ...l })), got = lots.reduce((s, l) => s + l.q, 0);
    if (h.units - got > 1e-6) lots.unshift({ d: null, q: h.units - got, p: null });
    h.lots = lots; }
  for (const h of out) if (h.type === "mf" && /ELSS|TAX SAVER|LONG TERM EQUITY|TAX ?SAVING/i.test(h.name + " " + (h.sub || ""))) h.elss = true;
  // dividends
  if (I.divs) for (const h of out) { const ds = I.divs.filter((x) => (h.nse && x.sym === h.nse.toUpperCase() && (!x.acct || x.acct === h.acct)) || (x.isin && x.isin === h.isin)); if (ds.length) h.divs = ds; }
  // buy prices read from a broker screenshot (e.g. INDstocks), for holdings no report covers
  for (const h of out) { const sc = (I.shotCost || {})[h.isin + "|" + h.acct]; if (h.cost == null && sc && sc.units > 0) { h.avg = sc.avg; h.cost = sc.avg * h.units; h.costSrc = sc.src; } }
  return out;
}
function fifoLots(orders) { const lots = []; for (const o of orders.slice().sort((a, b) => a.d.localeCompare(b.d) || b.s - a.s)) { if (o.s > 0) lots.push({ d: o.d, q: o.q, p: o.v / o.q }); else { let r = o.q; while (r > 1e-6 && lots.length) { const l = lots[0], t = Math.min(l.q, r); l.q -= t; r -= t; if (l.q <= 1e-6) lots.shift(); } } } return lots; }
function attachLots(out, src) {
  if (src.grStO) {
    const by = {}; for (const o of src.grStO.rows) (by[o.isin] = by[o.isin] || []).push(o);
    for (const h of out.filter((x) => x.acct === "Groww" && x.type !== "mf" && by[x.isin])) {
      let lots = fifoLots(by[h.isin]), got = lots.reduce((a, l) => a + l.q, 0);
      while (got > h.units + 1e-6 && lots.length) { const l = lots[0], t = Math.min(l.q, got - h.units); l.q -= t; got -= t; if (l.q <= 1e-6) lots.shift(); }
      if (h.units - got > 1e-6) { const known = lots.reduce((a, l) => a + l.q * l.p, 0), rest = h.units - got; lots.unshift({ d: null, q: rest, p: h.cost != null ? Math.max(0, (h.cost - known) / rest) : null }); }
      h.lots = lots;
    }
  }
  if (src.grMFO) {
    const by = {}; for (const o of src.grMFO.rows) (by[nameKey(o.n)] = by[nameKey(o.n)] || []).push(o);
    const groups = {}; for (const h of out.filter((x) => x.type === "mf" && x.mfName)) (groups[nameKey(h.mfName)] = groups[nameKey(h.mfName)] || []).push(h);
    for (const [k, hs] of Object.entries(groups)) {
      const ok = Object.keys(by).find((b) => b === k || b.startsWith(k) || k.startsWith(b)); if (!ok) continue;
      let lots = fifoLots(by[ok]); const tot = hs.reduce((a, h) => a + h.units, 0); let got = lots.reduce((a, l) => a + l.q, 0);
      while (got > tot + 0.05 && lots.length) { const l = lots[0], t = Math.min(l.q, got - tot); l.q -= t; got -= t; if (l.q <= 1e-6) lots.shift(); }
      // Groww-sourced folios take the dated lots first; the rest stays undated
      for (const h of hs.sort((a, b) => (a.acct === "Groww" ? -1 : 1) - (b.acct === "Groww" ? -1 : 1))) {
        const mine = []; let need = h.units;
        while (need > 0.01 && lots.length) { const l = lots[0], t = Math.min(l.q, need); mine.push({ d: l.d, q: t, p: l.p }); l.q -= t; need -= t; if (l.q <= 0.01) lots.shift(); }
        if (need > 0.01) mine.unshift({ d: null, q: need, p: null });
        h.lots = mine;
      }
    }
  }
}
/* India capital-gains rules (2026): listed shares, equity & arbitrage funds, ETFs: long-term after 12 months, 12.5% above ₹1.25 lakh a year.
   Gold/silver/international funds of funds: long-term after 24 months, 12.5%. Debt funds bought after Apr 2023: always slab rate. */
function inRule(h) {
  if (h.type === "mf" && h.cls === "Debt" && !/ARBITRAGE/i.test(h.sub + " " + h.name)) return { months: null, label: "Slab rate (debt fund)" };
  if (h.type === "mf" && (h.cls === "Gold & silver" || h.cls === "International")) return { months: 24, label: "24 months" };
  if (h.type === "bond") return { months: 12, label: "12 months (listed bond, interest taxed yearly)" };
  return { months: 12, label: "12 months" };
}
/* annualised return of dated cash flows (negative = money paid in) */
function xirr(cf) {
  if (cf.length < 2 || !cf.some((c) => c.v < 0) || !cf.some((c) => c.v > 0)) return null;
  const t0 = new Date(cf[0].d + "T00:00:00Z"), yrs = cf.map((c) => (new Date(c.d + "T00:00:00Z") - t0) / 31557600000);
  const f = (r) => cf.reduce((s, c, i) => s + c.v / Math.pow(1 + r, yrs[i]), 0);
  let lo = -0.9, hi = 1; if (f(lo) * f(hi) > 0) return null;
  for (let k = 0; k < 100; k++) { const m = (lo + hi) / 2; if (f(lo) * f(m) <= 0) hi = m; else lo = m; }
  return (lo + hi) / 2;
}
const addMonths = (d, n) => { const t = new Date(d + "T00:00:00Z"); t.setUTCMonth(t.getUTCMonth() + n); t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10); };
function inTax(h, curPx) {
  const rule = inRule(h); if (!h.lots || !rule.months) return { rule };
  let lt = 0, st = 0, ltG = 0, stG = 0, unk = 0, next = null;
  for (const l of h.lots) {
    const g = l.p != null ? (curPx - l.p) * l.q : null;
    if (!l.d) { unk += l.q; continue; }
    const from = addMonths(l.d, rule.months);
    if (from <= TODAY) { lt += l.q; ltG += g || 0; } else { st += l.q; stG += g || 0; if (!next || from < next) next = from; }
  }
  return { rule, lt, st, unk, ltG, stG, next };
}
/* list of things the weekly refresh should price (written to the saved data so the scheduled task can read it) */
function buildWatch(I) {
  I.px = I.px || {};
  for (const h of I.holdings) { const k = h.type === "mf" && !h.isin ? "MF:" + nameKey(h.name) : h.isin; if (h.lp && h.lpAt && (!I.px[k] || I.px[k].at < h.lpAt)) I.px[k] = { p: h.lp, at: h.lpAt }; }
  const eff = indHoldings(I), seen = new Set(), old = Object.fromEntries((I.watch || []).map((w) => [w.key, w]));
  I.watch = [];
  for (const h of eff) {
    if (h.type === "bond") continue;
    const key = h.type === "mf" && !h.isin ? "MF:" + nameKey(h.name) : h.isin; if (!key || seen.has(key)) continue; seen.add(key);
    const o = old[key] || {};
    let isin = h.isin || null, code = o.mfcode || h.mfcode || null;
    if (h.type !== "stock" && h.type !== "invit" && !isin) { const k = mfKey(h.name), c = I.holdings.find((x) => (x.type === "mf" || x.type === "etf") && (mfKey(x.name) === k || mfKey(x.name).startsWith(k) || k.startsWith(mfKey(x.name)))); if (c) { isin = c.isin; code = code || c.mfcode || null; } }
    I.watch.push(h.type === "stock" || h.type === "invit" ? { key, kind: "nse", name: h.name, isin: h.isin, nse: o.nse || h.nse || IN_NSE[h.isin] || null } : { key, kind: "mf", name: h.mfName || h.name, isin, mfcode: code });
  }
}

/* ---------- India: holdings from the CDSL / NSDL consolidated statement ---------- */
const IND_ORDER = ["Equity", "Hybrid", "Debt", "Gold & silver", "International", "Other"];
const IND_COL = { Equity: "--b-core", Hybrid: "--b-sat", Debt: "--b-tech", "Gold & silver": "--b-copper", International: "--b-japan", Other: "--b-em" };
const IND_TYPES = [["all", "All"], ["stock", "Shares"], ["mf", "Mutual funds"], ["etf", "ETFs"], ["bond", "Bonds & NCDs"], ["invit", "InvITs"]];
let IF = "all", IALL = false;
const indMoney = (v) => inr(v); // Indian holdings are always shown in rupees
const nwMoney = (v) => (CUR === "INR" ? inr(v) : usdRaw(v / fxNow()));
function applyCAS(state, cas) {
  const prev = state.india;
  const old = {}; for (const h of (prev && prev.holdings) || []) old[h.isin + "|" + h.acct] = h;
  state.india = { asOf: cas.asOf, total: cas.total || cas.holdings.reduce((a, h) => a + h.value, 0), accounts: cas.accounts, mix: cas.mix, history: cas.history, pricedAt: prev && prev.pricedAt,
    holdings: cas.holdings.map(({ raw, ...h }) => { const o = old[h.isin + "|" + h.acct] || {}; const keep = {}; for (const k of ["nse", "mfcode", "lp", "lpAt"]) if (o[k] != null) keep[k] = o[k];
      if (h.cost == null && o.avg) { keep.avg = o.avg; keep.cost = o.avg * h.units; keep.costSrc = o.costSrc; } else if (h.cost == null && o.cost && o.units) { keep.cost = o.cost * (h.units / o.units); keep.costSrc = o.costSrc; }
      if (!keep.nse && IN_NSE[h.isin]) keep.nse = IN_NSE[h.isin]; return Object.assign(h, keep); }) };
  if (prev && prev.src) state.india.src = prev.src; if (prev && prev.px) state.india.px = prev.px; if (prev && prev.watch) state.india.watch = prev.watch;
  buildWatch(state.india);
  noteImport(state, { kind: "cas", period: cas.asOf, count: cas.holdings.length, total: state.india.total });
  const ch = [`India total ${inr(state.india.total)} as of ${fmtDate(cas.asOf)} across ${cas.holdings.length} holdings`];
  if (prev && prev.total) ch.push(`Change since ${fmtDate(prev.asOf)}: ${sgn(state.india.total - prev.total)}${inr(Math.abs(state.india.total - prev.total))}`);
  return ch;
}
function indiaChart(hist) {
  if (!hist || hist.length < 2) return "";
  const W = 640, H = 190, pl = 10, pr = 10, pt = 26, pb = 26, vs = hist.map((h) => h.v), lo = Math.min(...vs) * 0.96, hi = Math.max(...vs) * 1.03;
  const X = (i) => pl + (i * (W - pl - pr)) / (hist.length - 1), Y = (v) => pt + (1 - (v - lo) / (hi - lo)) * (H - pt - pb);
  const line = hist.map((h, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(h.v).toFixed(1)}`).join(""), area = `${line}L${X(hist.length - 1)},${H - pb}L${X(0)},${H - pb}Z`;
  const mlab = (m) => new Date(m + "-01T00:00:00Z").toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  const step = (W - pl - pr) / (hist.length - 1);
  return `<div class="in-chart-wrap"><svg class="in-chart" viewBox="0 0 ${W} ${H}" role="group" aria-label="India portfolio value by month. Use the arrow keys or tap a point for details.">
    <defs><linearGradient id="inarea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".35"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
    <path d="${area}" fill="url(#inarea)"/><path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    <line class="in-guide" x1="0" x2="0" y1="${pt - 8}" y2="${H - pb}" />
    ${hist.map((h, i) => `<circle class="in-dot" data-i="${i}" cx="${X(i)}" cy="${Y(h.v)}" r="3"/>`).join("")}
    ${hist.map((h, i) => (i % 2 === 0 || i === hist.length - 1 ? `<text x="${X(i)}" y="${H - 8}" text-anchor="${i === 0 ? "start" : i === hist.length - 1 ? "end" : "middle"}">${mlab(h.m)}</text>` : "")).join("")}
    ${hist.map((h, i) => `<rect class="in-hit" data-i="${i}" x="${Math.max(0, X(i) - step / 2)}" y="0" width="${step}" height="${H}" tabindex="${i === hist.length - 1 ? 0 : -1}" role="button" aria-label="${mlab(h.m)} ${h.m.slice(0, 4)}: ${inr(h.v)}"/>`).join("")}
  </svg><div class="in-tip" hidden></div></div>
  <div class="in-detail" aria-live="polite"></div>`;
}
/* plain-words tax status for the holdings table */
const stRate = (rule) => (rule.months === 24 ? "your slab rate" : "20%");
const bondMat = (h) => (h.bond && h.bond.mat) || (() => { const m = String(h.name || "").match(/\b(\d{2})(\d{2})(20\d{2})\b/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; })();
function ltCell(h, t) {
  if (h.type === "bond") { const m = bondMat(h); return `<span class="chip neutral">Interest: slab rate</span>${m ? `<span class="nm">matures ${fmtDate(m)}</span>` : ""}`; }
  if (!t.rule.months) return `<span class="chip neutral">Slab rate</span><span class="nm">debt fund: no long-term rate</span>`;
  if (!h.lots) return `<span class="muted">${h.acct !== "Groww" ? "purchase dates not in any report" : "needs order history"}</span>`;
  const tot = t.lt + t.st + t.unk, f = (n) => (+n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  if (t.st <= 1e-6 && t.unk <= 1e-6) return `<span class="chip good">${ic("check")}Long-term</span><span class="nm">12.5% on gains if sold</span>`;
  if (t.lt <= 1e-6 && t.unk <= 1e-6) return `<span class="chip act">Short-term</span><span class="nm">${stRate(t.rule)} if sold now${t.next ? ` · long-term from ${fmtDate(t.next)}` : ""}</span>`;
  return `${t.lt > 1e-6 ? `<span class="chip good">${f(t.lt)} of ${f(tot)} long-term</span>` : ""}${t.next ? `<span class="nm">more turn long-term on ${fmtDate(t.next)}</span>` : ""}${t.unk > 1e-6 ? `<span class="nm" title="Units not in the order history: IPO, bonus, demerger, transfer or a purchase outside Groww">${f(t.unk)} units: purchase date unknown</span>` : ""}`;
}
/* India tax view: unrealised long/short-term gains (from dated lots) and gains already booked this financial year (from Groww orders, FIFO) */
function fyStart() { const y = +TODAY.slice(0, 4), m = +TODAY.slice(5, 7); return `${m >= 4 ? y : y - 1}-04-01`; }
function inRealised(I, H) {
  const src = I.src || {}, fy = fyStart(); let lt = 0, st = 0, n = 0;
  const run = (orders, months) => { const lots = []; for (const o of orders.slice().sort((a, b) => a.d.localeCompare(b.d) || b.s - a.s)) { if (o.s > 0) { lots.push({ d: o.d, q: o.q, p: o.v / o.q }); continue; } let rq = o.q; const px = o.v / o.q; while (rq > 1e-6 && lots.length) { const l = lots[0], t = Math.min(l.q, rq); if (o.d >= fy) { const g = (px - l.p) * t; if (addMonths(l.d, months) <= o.d) lt += g; else st += g; n++; } l.q -= t; rq -= t; if (l.q <= 1e-6) lots.shift(); } } };
  if (src.grStO) { const by = {}; for (const o of src.grStO.rows) (by[o.isin] = by[o.isin] || []).push(o); for (const k in by) run(by[k], 12); }
  if (src.grMFO) { const by = {}; for (const o of src.grMFO.rows) (by[nameKey(o.n)] = by[nameKey(o.n)] || []).push(o); for (const k in by) { const h = H.find((x) => x.mfName && nameKey(x.mfName) === k); const rule = h ? inRule(h) : { months: /GOLD|SILVER|NASDAQ|FANG|GLOBAL/.test(k) ? 24 : 12 }; if (rule.months) run(by[k], rule.months); } }
  return { lt, st, n, has: !!(src.grStO || src.grMFO) };
}
function inTaxSummary(H, I) {
  let ltG = 0, stG = 0, dated = 0, upcoming = [], ltPos = 0, ltNeg = 0, gainers = [];
  for (const h of H) {
    const px = h.lp && h.lpAt > (h.asOf || I.asOf) ? h.lp : h.price, t = inTax(h, px);
    if (!t.rule.months || !h.lots || h.type === "bond") continue; dated++; // bonds: see the bonds card (their value includes accrued interest) ltG += t.ltG; stG += t.stG; if (t.ltG > 0) { ltPos += t.ltG; gainers.push({ name: h.name, g: t.ltG }); } else ltNeg += t.ltG;
    for (const l of h.lots) if (l.d) { const from = addMonths(l.d, t.rule.months); if (from > TODAY) upcoming.push({ name: h.name, from, q: l.q, g: l.p != null ? (px - l.p) * l.q : null }); }
  }
  upcoming.sort((a, b) => a.from.localeCompare(b.from));
  gainers.sort((a, b) => b.g - a.g);
  return { ltG, stG, ltPos, ltNeg, gainers: gainers.slice(0, 4), dated, upcoming: upcoming.slice(0, 6), real: inRealised(I, H) };
}
function inTaxCard(t) {
  if (!t.dated) return "";
  const EX = 125000, used = Math.max(0, t.real.lt), left = Math.max(0, EX - used), harvest = Math.min(left, Math.max(0, t.ltPos));
  const fy = fyStart(), fyLab = `${fy.slice(0, 4)}–${String(+fy.slice(0, 4) + 1).slice(2)}`;
  return `<div class="card glass b12 reveal"><div><div class="eyebrow">Indian tax · financial year ${fyLab}</div><h2>Long-term vs short-term</h2></div>
    <div class="in-tax">
      <div><small>Long-term gain if sold today</small><b class="num ${cls(t.ltG)}">${sgn(t.ltG)}${inr(Math.abs(t.ltG))}</b><em>${t.ltPos > 0 ? `${inr(t.ltPos)} in gainers, −${inr(Math.abs(t.ltNeg))} in losers` : "12.5% above ₹1.25 lakh a year"}</em></div>
      <div><small>Short-term gain if sold today</small><b class="num ${cls(t.stG)}">${sgn(t.stG)}${inr(Math.abs(t.stG))}</b><em>20% on shares and equity funds</em></div>
      <div><small>Booked this year (Groww orders)</small><b class="num">${t.real.has ? `${sgn(t.real.lt + t.real.st)}${inr(Math.abs(t.real.lt + t.real.st))}` : "—"}</b><em>${t.real.has ? `long-term ${sgn(t.real.lt)}${inr(Math.abs(t.real.lt))} · short-term ${sgn(t.real.st)}${inr(Math.abs(t.real.st))}` : "upload order histories"}</em></div>
      <div><small>Tax-free long-term room left</small><b class="num">${inr(left)}</b><em>of ₹1,25,000 this year</em></div>
    </div>
    ${harvest > 500 ? `<p class="in-tip-line">${ic("bulb")}<span>You could book about <b>${inr(harvest)}</b> of long-term gains tax-free before 31 March by selling those units and buying them back the same day${t.gainers.length ? ` (mainly ${t.gainers.map((g) => esc(g.name)).join(", ")})` : ""}. That raises your buy price, so future tax is lower.</span></p>` : ""}
    ${t.upcoming.length ? `<h3 style="margin-top:12px">Next to turn long-term</h3><ul class="in-legend">${t.upcoming.map((u) => `<li><span class="sw" style="background:var(--accent)"></span><b>${esc(u.name)}</b><span class="num">${fmtDate(u.from)}</span><em>${u.g != null ? `${sgn(u.g)}${inr(Math.abs(u.g))}` : ""}</em></li>`).join("")}</ul>` : ""}
    <p class="note">Purchase dates come from your Groww order histories. Units without a date (IPO allotments, bonuses, demergers, funds bought outside Groww) aren't counted here. Gold, silver and international funds of funds need 24 months; debt funds are always taxed at your slab. Estimates only; your CA files the real numbers.</p></div>`;
}
function wireIndiaChart(root, hist) {
  const svg = root.querySelector(".in-chart"); if (!svg) return;
  const tip = root.querySelector(".in-tip"), det = root.querySelector(".in-detail"), guide = svg.querySelector(".in-guide"), dots = [...svg.querySelectorAll(".in-dot")], hits = [...svg.querySelectorAll(".in-hit")];
  const full = (m) => new Date(m + "-01T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  let sel = hist.length - 1;
  const show = (i, pin) => {
    const h = hist[i], p = hist[i - 1], d = dots[i], ch = p ? h.v - p.v : null, pc = p ? ch / p.v : null, fromStart = h.v - hist[0].v;
    dots.forEach((x, k) => x.classList.toggle("on", k === i)); guide.setAttribute("x1", d.getAttribute("cx")); guide.setAttribute("x2", d.getAttribute("cx")); guide.classList.add("on");
    const box = svg.getBoundingClientRect(), sx = box.width / svg.viewBox.baseVal.width, x = +d.getAttribute("cx") * sx, y = +d.getAttribute("cy") * sx;
    tip.hidden = false; tip.innerHTML = `<b>${full(h.m)}</b><span class="num">${inr(h.v)}</span>${ch != null ? `<em class="${cls(ch)}">${sgn(ch)}${inr(Math.abs(ch))} (${pctf(pc)}) vs ${full(p.m).split(" ")[0]}</em>` : `<em>first month shown</em>`}`;
    tip.style.left = `${Math.min(Math.max(x, 80), box.width - 80)}px`; tip.style.top = `${y}px`;
    if (pin) { sel = i; det.innerHTML = `<span class="chip neutral">${full(h.m)}</span> Portfolio ${inr(h.v)}${ch != null ? ` · <span class="${cls(ch)}">${sgn(ch)}${inr(Math.abs(ch))} (${pctf(pc)})</span> from ${full(p.m)}` : ""} · <span class="nowrap">${sgn(fromStart)}${inr(Math.abs(fromStart))}</span> since ${full(hist[0].m)}. <span class="muted">Changes include money you added or withdrew.</span>`; hits.forEach((r, k) => r.setAttribute("tabindex", k === i ? 0 : -1)); }
  };
  const hide = () => { tip.hidden = true; guide.classList.remove("on"); dots.forEach((x, k) => x.classList.toggle("on", k === sel)); };
  hits.forEach((r) => {
    const i = +r.dataset.i;
    r.addEventListener("pointerenter", () => show(i));
    r.addEventListener("click", () => { show(i, true); r.focus(); });
    r.addEventListener("focus", () => show(i, true));
    r.addEventListener("keydown", (e) => { const k = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0; if (k) { e.preventDefault(); const n = Math.max(0, Math.min(hist.length - 1, i + k)); hits[n].focus(); } });
  });
  svg.addEventListener("pointerleave", hide);
  show(sel, true); hide();
}
/* Bonds & NCDs: income, interest received, TDS and money coming back (from the Wint Wealth report) */
function bondCard(H, I) {
  const src = I.src || {}, W = src.wint, IB = src.ibcf, B = H.filter((h) => h.bond); if (!B.length || (!W && !IB)) return "";
  const sum = (xs, f) => xs.reduce((s, x) => s + f(x), 0), val = sum(B, (h) => h.value), inv = sum(B, (h) => h.cost || 0);
  const wB = B.filter((h) => h.bond.src !== "IndiaBonds"), iB = B.filter((h) => h.bond.src === "IndiaBonds"), wVal = sum(wB, (h) => h.value);
  const wY = W && wB.length === W.rows.length && W.ytmAll ? W.ytmAll : wVal ? sum(wB, (h) => h.bond.ytm * h.value) / wVal : 0;
  const ytm = (wY * wVal + sum(iB, (h) => h.bond.ytm * h.value)) / val;
  const ibRows = IB ? IB.rows.filter((r) => iB.some((h) => h.isin === r.isin)) : [];
  const Wp = { paid: [...((W && W.paid) || []), ...ibRows.filter((r) => r.d <= TODAY)], flows: [...((W && W.flows) || []), ...ibRows.filter((r) => r.d > TODAY)].sort((x, y) => x.d.localeCompare(y.d)) };
  const srcLab = [W ? `Wint Wealth (${fmtDate(W.asOf)})` : "", IB && iB.length ? `IndiaBonds (${fmtDate(IB.asOf)})` : ""].filter(Boolean).join(" + ");
  const intN = sum(B, (h) => h.bond.intN), intG = sum(B, (h) => h.bond.intG), tds = sum(B, (h) => h.bond.tds);
  const fy = fyStart(), fyPaid = Wp.paid.filter((p) => p.d >= fy && p.d <= TODAY), fyG = sum(fyPaid, (p) => p.intG), fyT = sum(fyPaid, (p) => p.tds);
  const fut = Wp.flows.filter((f) => f.d >= TODAY), end = addMonths(TODAY, 12), yr = fut.filter((f) => f.d < end), yInt = sum(yr, (f) => f.int), yPrin = sum(yr, (f) => f.prin);
  const months = []; { let ym = TODAY.slice(0, 7); for (let i = 0; i < 12; i++) { months.push({ ym, int: 0, prin: 0 }); ym = nextYm(ym); } }
  for (const f of fut) { const m = months.find((x) => x.ym === f.d.slice(0, 7)); if (m) { m.int += f.int; m.prin += f.prin; } }
  const mx = Math.max(1, ...months.map((m) => m.int + m.prin)), k = (v) => (v >= 1000 ? `₹${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `₹${Math.round(v)}`);
  const back = fut.filter((f) => f.prin > 0).slice(0, 6), next = back[0];
  const groww = H.filter((h) => h.type === "bond" && !h.bond);
  return `<div class="card glass b12 reveal"><div class="fields" style="justify-content:space-between;align-items:flex-start"><div><div class="eyebrow">Bonds &amp; NCDs · ${srcLab}</div><h2>Earning about ${ytm.toFixed(2)}% a year on ${inr(val)}</h2></div><span class="chip ${val >= inv ? "good" : "act"}">${B.length} bonds</span></div>
    <div class="in-tax">
      <div><small>Invested → value now</small><b class="num">${inr(inv)} → ${inr(val)}</b><em>value includes interest earned but not yet paid</em></div>
      <div><small>Interest received so far</small><b class="num pos">+${inr(intN)}</b><em>in your bank, after ${inr(tds)} TDS (gross ${inr(intG)})</em></div>
      <div><small>Interest this year (from 1 Apr)</small><b class="num">${inr(fyG)}</b><em>taxed at your slab · TDS ${inr(fyT)} already paid for you</em></div>
      <div><small>Next 12 months</small><b class="num">${inr(yInt + yPrin)}</b><em>${inr(yInt)} interest + ${inr(yPrin)} principal back</em></div>
    </div>
    <h3 style="margin-top:12px">Money coming to your bank, month by month</h3>
    <div class="bond-bars" role="img" aria-label="${months.map((m) => `${longMonth(m.ym)}: ${inr(m.int + m.prin)}`).join("; ")}">${months.map((m) => `<div class="bb" title="${longMonth(m.ym)}: ${inr(m.int)} interest${m.prin ? ` + ${inr(m.prin)} principal` : ""}"><span class="bv${m.prin ? " big" : ""}">${m.int + m.prin ? k(m.int + m.prin) : ""}</span><div class="bcol"><i class="bp" style="height:${(100 * m.prin) / mx}%"></i><i class="bi" style="height:${Math.max(m.int ? 3 : 0, (100 * m.int) / mx)}%"></i></div><span class="bm">${new Date(m.ym + "-01T00:00:00Z").toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })}</span></div>`).join("")}</div>
    <p class="note"><span class="sw-i"></span> interest (after TDS) &nbsp; <span class="sw-p"></span> principal returned</p>
    ${back.length ? `<h3 style="margin-top:12px">Principal coming back</h3><ul class="in-legend">${back.map((f) => `<li><span class="sw" style="background:var(--accent-2)"></span><b>${esc(f.n)}</b><span class="num">${inr(f.prin)}</span><em class="bdate">${fmtDate(f.d)}</em></li>`).join("")}</ul>` : ""}
    ${next ? `<p class="in-tip-line">${ic("bulb")}<span>${inr(next.prin)} from ${esc(next.n)} lands in your bank on <b>${fmtDate(next.d)}</b>. It doesn't reinvest by itself, so decide beforehand where it goes; otherwise it sits idle in savings.</span></p>` : ""}
    <p class="note">Interest from bonds is taxed every year at your slab rate (as "income from other sources"), whether or not you sell. The 10% TDS shows in your Form 26AS / AIS and counts towards your tax when you file. ${groww.length ? `${groww.map((h) => esc(h.name)).join(" and ")} ${groww.length > 1 ? "aren't" : "isn't"} included yet: upload ${groww.every((h) => h.via === "IndiaBonds") ? "the IndiaBonds Cashflow report" : "its platform's interest report"}. ` : ""}${iB.length ? "Yields for IndiaBonds bonds are worked out from the price you paid and their scheduled payouts. " : ""}Upload fresh Wint and IndiaBonds reports every month or two to keep this current.</p></div>`;
}
/* ---------- holding details sheet (tap a row) ---------- */
function bondFlowsFor(h, I) {
  const s = I.src || {}; let rs = [];
  if (h.bond && h.bond.src === "IndiaBonds" && s.ibcf) rs = s.ibcf.rows.filter((r) => r.isin === h.isin);
  else if (s.wint) rs = [...(s.wint.paid || []).filter((r) => r.isin === h.isin), ...(s.wint.flows || []).filter((r) => r.isin === h.isin && r.d > TODAY)];
  rs = rs.slice().sort((x, y) => x.d.localeCompare(y.d));
  return { past: rs.filter((r) => r.d <= TODAY), fut: rs.filter((r) => r.d > TODAY) };
}
function taxExplain(h, rule) {
  if (h.type === "bond") return `Interest is added to your income and taxed at your slab rate every year; 10% TDS is already deducted from each payout and counts towards that tax. If you hold to maturity you simply get the face value back. If you sell on the exchange before maturity, the gain is long-term after 12 months (12.5%) and taxed at your slab rate before that.`;
  if (h.elss) return `ELSS (tax-saver) fund: each purchase is <b>locked in for 3 years</b> and can't be sold before then. After that, gains are long-term (held over 12 months): taxed at 12.5%, with the first ₹1.25 lakh of long-term gains in a financial year tax-free. Purchases count towards the ₹1.5 lakh Section 80C deduction only under the old tax regime.`;
  if (!rule.months) return `Debt fund bought after April 2023: gains are always added to your income and taxed at your slab rate, however long you hold.`;
  if (rule.months === 24) return `Gold, silver and international funds of funds: units held more than 24 months are long-term (12.5% on gains). Sold earlier, gains are taxed at your slab rate.`;
  return `Units held more than 12 months are <b>long-term</b>: gains are taxed at 12.5%, and the first ₹1.25 lakh of long-term gains in a financial year (across all your holdings) is tax-free. Units held 12 months or less are <b>short-term</b>: gains are taxed at 20%. Losses can be set off against gains. When you sell, the oldest units go first.`;
}
function holdingDetail(h, I) {
  let d = $("#hdm"); if (!d) { d = document.createElement("dialog"); d.id = "hdm"; d.className = "hdm"; document.body.appendChild(d); d.addEventListener("click", (e) => { if (e.target === d) d.close(); }); }
  const r2 = (n) => "₹" + (+n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), q = (n) => (+n).toLocaleString("en-IN", { maximumFractionDigits: 3 });
  const fresh = h.lp && h.lpAt > (h.asOf || I.asOf), px = fresh ? h.lp : h.price, pxAt = fresh ? h.lpAt : h.asOf || I.asOf, v = indCur(h, I), g = h.cost != null ? v - h.cost : null;
  const bp = h.avg || (h.cost != null && h.units ? h.cost / h.units : null), rule = inRule(h), t = inTax(h, px);
  const lots = (h.lots || []).slice().sort((x, y) => String(y.d || "").localeCompare(String(x.d || "")));
  const dated = lots.length && lots.every((l) => l.d && l.p != null);
  const dl = lots.filter((l) => l.d && l.p != null), dq = dl.reduce((s, l) => s + l.q, 0), partial = !dated && dl.length && px != null;
  const xr = h.bond || !(dated || partial) ? null : xirr([...dl.map((l) => ({ d: l.d, v: -l.q * l.p })).sort((x, y) => x.d.localeCompare(y.d)), { d: TODAY, v: dated ? v : dq * px }]);
  const tname = { stock: "Share", mf: "Mutual fund", etf: "ETF", bond: "Bond / NCD", invit: "InvIT" }[h.type] || h.type;
  const ini = String(h.name).replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const where = h.via ? `Bought on ${h.via} · held in your ${h.acct} demat` : h.acct === "MF folios (CAMS/KFin)" ? "Held directly with the fund house" : `Held in ${h.acct}`;
  const ltG = lots.filter((l) => l.d && l.p != null && rule.months && addMonths(l.d, rule.months) <= TODAY).reduce((s, l) => s + (px - l.p) * l.q, 0);
  const stL = lots.filter((l) => l.d && l.p != null && rule.months && addMonths(l.d, rule.months) > TODAY), stG = stL.reduce((s, l) => s + (px - l.p) * l.q, 0);
  const lotSt0 = (l) => (h.type === "bond" ? "" : !rule.months ? `<span class="chip neutral">Slab rate</span>` : !l.d ? `<span class="chip neutral">Date unknown</span>` : addMonths(l.d, rule.months) <= TODAY ? `<span class="chip good">${ic("check")}Long-term</span>` : `<span class="chip act">Short-term</span><span class="nm">long-term from ${fmtDate(addMonths(l.d, rule.months))}</span>`);
  const lotSt = (l) => lotSt0(l) + (h.elss && l.d ? (addMonths(l.d, 36) > TODAY ? `<span class="chip neutral">${ic("lock")}Locked until ${fmtDate(addMonths(l.d, 36))}</span>` : `<span class="nm">lock-in over</span>`) : "");
  let bondHtml = "";
  if (h.type === "bond") {
    const b = h.bond || {}, mat = bondMat(h), F = bondFlowsFor(h, I), nx = F.fut[0], mo = mat ? Math.max(0, Math.round((new Date(mat) - new Date(TODAY)) / 2629800000)) : null;
    const prinBack = F.fut.filter((f) => f.prin > 0), coupon = h.coupon || (String(h.name).match(/\b(\d{1,2}\.\d{1,2})\b/) || [])[1];
    const freq = b.iType || (F.past.length + F.fut.length > 3 ? (() => { const ds = [...F.past, ...F.fut].map((r) => r.d), gap = (new Date(ds[ds.length - 1]) - new Date(ds[0])) / (ds.length - 1) / 86400000; return gap < 45 ? "Monthly" : gap < 120 ? "Quarterly" : gap < 200 ? "Half-yearly" : "Yearly"; })() : "");
    bondHtml = `<section class="hdm-card"><h3>Bond details</h3><dl class="hdm-dl">
      ${coupon ? `<dt>Coupon (interest rate)</dt><dd>${esc(coupon)}% a year</dd>` : ""}
      ${b.ytm ? `<dt>Yield to maturity</dt><dd>${b.ytmEst ? "≈" : ""}${b.ytm.toFixed(2)}% a year</dd>` : ""}
      <dt>Maturity date</dt><dd>${mat ? `${fmtDate(mat)}<span class="nm">${mo != null ? (mo >= 12 ? `in about ${(mo / 12).toFixed(1)} years` : `in about ${mo} month${mo === 1 ? "" : "s"}`) : ""}</span>` : "—"}</dd>
      ${freq ? `<dt>Interest paid</dt><dd>${esc(freq.charAt(0) + freq.slice(1).toLowerCase())}</dd>` : ""}
      ${b.pType ? `<dt>Principal repaid</dt><dd>${esc(b.pType)}</dd>` : ""}
      <dt>Interest received so far</dt><dd class="pos">+${inr(b.intN || 0)}<span class="nm">after ${inr(b.tds || 0)} TDS · gross ${inr(b.intG || 0)}</span></dd>
      ${nx ? `<dt>Next payout</dt><dd>${inr(nx.bank || nx.int + nx.prin)}<span class="nm">on ${fmtDate(nx.d)}${nx.prin ? ` · includes ${inr(nx.prin)} principal` : ""}</span></dd>` : ""}
      <dt>Still to come</dt><dd>${inr(F.fut.reduce((s, f) => s + f.int, 0))} interest + ${inr(F.fut.reduce((s, f) => s + f.prin, 0))} principal</dd>
    </dl>
    ${prinBack.length ? `<h4>Principal coming back</h4><ul class="hdm-lots">${prinBack.map((f) => `<li><div><b>${inr(f.prin)}</b><span class="nm">${fmtDate(f.d)}</span></div></li>`).join("")}</ul>` : ""}
    ${F.fut.length ? `<details class="hdm-more"><summary>All upcoming payouts (${F.fut.length})</summary><ul class="hdm-pay">${F.fut.map((f) => `<li><span>${fmtDate(f.d)}</span><span class="num">${inr(f.bank || f.int + f.prin)}</span><em>${f.prin ? "principal + interest" : "interest"}</em></li>`).join("")}</ul></details>` : ""}
    ${F.past.length ? `<details class="hdm-more"><summary>Payouts received (${F.past.length})</summary><ul class="hdm-pay">${F.past.slice().reverse().map((f) => `<li><span>${fmtDate(f.d)}</span><span class="num">${inr(f.int + (f.prin || 0))}</span><em>TDS ${inr(f.tds || 0)}</em></li>`).join("")}</ul></details>` : ""}</section>`;
  }
  d.innerHTML = `<div class="hdm-top"><button class="btn icon" type="button" data-hdm="close" aria-label="Close">←</button><h2>Holding details</h2></div>
    <div class="hdm-body">
    <div class="hdm-id"><div class="hdm-logo" aria-hidden="true">${esc(ini || "?")}</div><div><b>${esc(h.name)}</b><span class="nm">${px != null ? `${r2(px)} · price on ${fmtDate(pxAt)}` : ""}</span></div><span class="chip neutral">${esc(tname)}</span></div>
    <section class="hdm-card">
      <div class="hdm-two"><div><small>Current</small><b class="num">${r2(v)}</b></div><div class="r"><small>Invested</small><b class="num">${h.cost != null ? r2(h.cost) : "—"}</b></div></div>
      <dl class="hdm-dl">
        <dt>Unrealised returns</dt><dd class="${g != null ? cls(g) : ""}">${g != null ? `${sgn(g)}${r2(Math.abs(g))} (${pctf(h.cost ? g / h.cost : 0)})` : "—"}</dd>
        <dt>${h.type === "mf" ? "NAV" : "Market price"}</dt><dd>${px != null ? r2(px) : "—"}<span class="nm">${fmtDate(pxAt)}</span></dd>
        <dt>Avg buy price</dt><dd>${bp ? r2(bp) : "—"}</dd>
        <dt>Total ${h.type === "mf" ? "units" : "qty"}</dt><dd>${q(h.units)}</dd>
        ${h.type !== "bond" ? `<dt>XIRR <span class="nm" style="display:inline">(yearly return)</span></dt><dd class="${xr != null ? cls(xr) : ""}">${xr != null ? `${pctf(xr)}${partial ? `<span class="nm">on the ${q(dq)} units with a purchase date</span>` : ""}` : `<span class="muted">needs purchase dates</span>`}</dd>` : ""}
        ${h.divs ? `<dt>Total dividends</dt><dd class="pos">+${r2(h.divs.reduce((s, x) => s + x.amt, 0))}<span class="nm">${h.divs.length} payout${h.divs.length === 1 ? "" : "s"} · last ${fmtDate(h.divs[h.divs.length - 1].d)}</span></dd>` : ""}
        ${h.elss ? `<dt>Lock-in (ELSS)</dt><dd class="txt">${(() => { const ds = lots.filter((l) => l.d).map((l) => addMonths(l.d, 36)).sort(); const free = ds.filter((x) => x <= TODAY).length; return ds.length ? `${free ? `${free} of ${ds.length} purchases free to sell` : "all locked"}<span class="nm">${ds.find((x) => x > TODAY) ? `first one free to sell from ${fmtDate(ds.find((x) => x > TODAY))}` : ""}</span>` : "3 years from each purchase"; })()}</dd>` : ""}
        <dt>Where</dt><dd class="txt">${esc(where)}${h.folio ? `<span class="nm">folio ${esc(h.folio)}</span>` : ""}${h.nse ? `<span class="nm">NSE ${esc(h.nse)}</span>` : ""}</dd>
        ${h.type === "mf" && h.sub ? `<dt>Category</dt><dd>${esc(h.cls)}<span class="nm">${esc(h.sub)}</span></dd>` : ""}
      </dl>
    </section>
    ${bondHtml}
    ${h.divs ? `<section class="hdm-card"><h3>Dividends received</h3><ul class="hdm-pay">${h.divs.slice().reverse().map((x) => `<li><span>${fmtDate(x.d)}</span><span class="num">${r2(x.amt)}</span><em>${x.q && x.dps ? `${x.q} × ₹${(+x.dps).toFixed(2)}` : ""}</em></li>`).join("")}</ul><p class="note">Dividends are added to your income and taxed at your slab rate. TDS is deducted only above ₹10,000 a year from one company.</p></section>` : ""}
    <section class="hdm-card"><h3>Tax if you sell today</h3>
      ${h.type !== "bond" && rule.months && lots.length ? `<div class="hdm-two hdm-tax"><div><small>Long-term units</small><b class="num">${q(t.lt || 0)}</b><span class="nm ${cls(ltG)}">gain ${sgn(ltG)}${inr(Math.abs(ltG))} · 12.5%</span></div><div><small>Short-term units</small><b class="num">${q(t.st || 0)}</b><span class="nm ${cls(stG)}">gain ${sgn(stG)}${inr(Math.abs(stG))} · ${stRate(rule)}</span></div></div>
        ${t.next ? `<p class="hdm-hint">${ic("clock")}<span>Next units turn long-term on <b>${fmtDate(t.next)}</b>.</span></p>` : ""}${t.unk > 1e-6 ? `<p class="hdm-hint">${q(t.unk)} ${Math.abs(t.unk - 1) < 1e-6 ? "unit has" : "units have"} no purchase date in the reports you've uploaded${h.type === "mf" ? (h.elss ? " (likely bought in a year whose ELSS statement isn't uploaded yet)" : " (bought outside Groww, or before your order history starts)") : " (IPO, bonus, demerger, transfer or bought outside Groww)"}, so they aren't counted above.</p>` : ""}` : ""}
      <p class="note">${taxExplain(h, rule)}</p></section>
    ${lots.length ? `<section class="hdm-card"><div class="hdm-two"><h3>Breakdown</h3><span class="nm r">Avg price (invested)</span></div><ul class="hdm-lots">${lots.map((l) => { const lg = l.p != null ? (px - l.p) * l.q : null; return `<li><div><b>${q(l.q)} ${h.type === "mf" ? "units" : "qty"}</b><span class="nm">${l.d ? fmtDate(l.d) : "purchase date unknown"}${l.tag ? ` · ${esc(l.tag)}` : ""}${l.d ? ` · held ${Math.round((new Date(TODAY) - new Date(l.d)) / 86400000)} days` : ""}</span>${lotSt(l)}</div><div class="r"><b class="num">${l.p != null ? r2(l.p) : "—"}</b><span class="nm">${l.p != null ? `(${r2(l.p * l.q)})` : ""}</span>${lg != null && h.type !== "bond" ? `<span class="nm ${cls(lg)}">${sgn(lg)}${inr(Math.abs(lg))}</span>` : ""}</div></li>`; }).join("")}</ul>
      ${(h.type === "stock" || h.type === "etf" || h.type === "invit") && h.acct === "Groww" ? `<p class="note">From your Groww order history (oldest units are sold first). Dividends aren't included.</p>` : ""}</section>` : `<section class="hdm-card"><h3>Breakdown</h3><p class="muted">${h.acct === "Zerodha" ? "Zerodha's holdings report has the average price but not each purchase, so the purchase dates aren't known yet." : "No purchase-by-purchase history for this one in your reports yet."}</p></section>`}
    </div>`;
  d.querySelector("[data-hdm=close]").onclick = () => d.close();
  if (d.showModal) { try { d.showModal(); } catch (e) { d.setAttribute("open", ""); } } else d.setAttribute("open", "");
  d.scrollTop = 0;
}
function renderIndia() {
  const el = $("#p-india"); if (!el) return;
  const I = S && S.india;
  if (!I) { el.innerHTML = `<div class="card empty"><h2>${flag("IN")} Add your Indian investments</h2><p class="muted">Upload your <b>CDSL or NSDL Consolidated Account Statement (CAS)</b>, the monthly PDF emailed to you. It lists every share, mutual fund, ETF and bond under your PAN. If it's password-protected, the app asks for the password and uses it only to open the file.</p><div><button class="btn primary" data-go="upload">Go to Upload</button></div></div>`; return; }
  const H = indHoldings(I), cur = (h) => indCur(h, I), tot = H.reduce((a, h) => a + cur(h), 0), hist = I.history || [], prev = hist.length > 1 ? hist[hist.length - 2] : null, last = hist.length ? hist[hist.length - 1] : null, ch = prev && last ? last.v - prev.v : null;
  const priced = H.filter((h) => h.lpAt && h.lpAt > (h.asOf || I.asOf)), pricedAt = priced.map((h) => h.lpAt).sort().slice(-1)[0];
  const latest = [I.asOf, ...Object.values(I.src || {}).map((x) => x.asOf).filter(Boolean), pricedAt].filter(Boolean).sort().slice(-1)[0];
  const tx = inTaxSummary(H, I);
  const known = H.filter((h) => h.cost != null), kCost = known.reduce((a, h) => a + h.cost, 0), kVal = known.reduce((a, h) => a + cur(h), 0);
  const mixV = {}; for (const h of H) mixV[h.cls] = (mixV[h.cls] || 0) + cur(h);
  const mix = IND_ORDER.filter((k) => mixV[k] > 0).map((k) => ({ k, v: mixV[k], p: (100 * mixV[k]) / tot }));
  const accV = {}; for (const h of H) { accV[h.acct] = accV[h.acct] || { v: 0, n: 0 }; accV[h.acct].v += cur(h); accV[h.acct].n++; }
  const cnt = Object.fromEntries(IND_TYPES.map(([t]) => [t, t === "all" ? H.length : H.filter((h) => h.type === t).length]));
  const allRows = H.filter((h) => IF === "all" || h.type === IF).slice().sort((a, b) => cur(b) - cur(a)), rows = IALL ? allRows : allRows.slice(0, 15);
  const tname = { stock: "Share", mf: "Mutual fund", etf: "ETF", bond: "Bond / NCD", invit: "InvIT" };
  const has = (k) => ((S.imports || []).some((x) => x.kind === k));
  const needCost = (acct, types) => H.filter((h) => h.acct === acct && types.includes(h.type) && h.cost == null);
  const guide = [
    { app: "Groww", what: "Reports → Stocks → Holdings report (Excel)", gives: "average buy price of each share and ETF", left: needCost("Groww", ["stock", "etf", "invit"]).length },
    { app: "Groww", what: "Reports → Transactions → Stocks - Order history (from account opening)", gives: "purchase date of each share, for the 12-month long-term rule", left: I.src && I.src.grStO ? 0 : H.filter((h) => h.acct === "Groww" && h.type !== "mf" && h.type !== "bond").length },
    { app: "Groww", what: "Reports → Transactions → Mutual Funds - Order history (from account opening)", gives: "date of each SIP instalment, for the long-term rule", left: I.src && I.src.grMFO ? 0 : H.filter((h) => h.type === "mf").length },
    { app: "Groww", what: "Reports → Mutual funds → Holdings report (Excel)", gives: "amount invested in each fund held in your Groww demat", left: needCost("Groww", ["mf"]).length },
    { app: "Zerodha", what: "Console → Portfolio → Holdings → Download (Excel)", gives: "average buy price of each Zerodha holding", left: needCost("Zerodha", ["stock", "etf", "mf"]).length },
    { app: "Wint Wealth", what: "Master Report (Excel)", gives: "price paid, YTM and payouts for each bond", left: needCost("Wint Wealth (NSDL)", ["bond"]).length },
    ...[...new Set(H.filter((h) => h.type === "bond" && h.via && h.cost == null).map((h) => h.via))].map((v) => { const hs = H.filter((h) => h.type === "bond" && h.via === v && h.cost == null); return { app: v, what: v === "IndiaBonds" ? "transaction statement (Excel)" : "screenshot of each bond's screen showing the amount invested", gives: "price paid for " + hs.map((h) => h.name).join(" and "), left: hs.length }; }),
    { app: "Groww", what: "your bond order confirmations (Groww's holdings report shows ₹0 cost for bonds)", gives: "price paid for bonds bought on Groww", left: H.filter((h) => h.acct === "Groww" && h.type === "bond" && !h.via && h.cost == null).length },
  ].filter((g) => g.left > 0);
  el.innerHTML = `
  <div class="bento">
    <div class="card b7 reveal in-hero"><div class="fields" style="justify-content:space-between;align-items:flex-start"><div><div class="eyebrow">${flag("IN")} India · as of ${fmtDate(latest)}</div><h2 class="in-big num">${indMoney(tot)}</h2>
      ${ch != null ? `<p class="${cls(ch)} in-ch">${sgn(ch)}${indMoney(Math.abs(ch))} (${pctf(prev.v ? ch / prev.v : 0)}) in ${new Date(last.m + "-01T00:00:00Z").toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" })} · statement ${indMoney(I.total)} on ${fmtDate(I.asOf)}</p>` : ""}</div>
      <span class="chip neutral">${H.length} holdings</span></div>
      ${indiaChart(hist)}
      <p class="note">Month-end values from your statements. Tap or hover a month for details. Changes include money you added, so they aren't all return.</p></div>
    <div class="card glass b5 reveal"><h2>What it's made of</h2>
      <div class="in-mix" role="img" aria-label="${mix.map((x) => `${x.k} ${x.p.toFixed(0)}%`).join(", ")}">${mix.map((x) => `<i style="width:${x.p}%;background:var(${IND_COL[x.k]})" title="${esc(x.k)} ${x.p.toFixed(1)}%"></i>`).join("")}</div>
      <ul class="in-legend">${mix.map((x) => `<li><span class="sw" style="background:var(${IND_COL[x.k]})"></span><b>${esc(x.k)}</b><span class="num">${indMoney(x.v)}</span><em>${x.p.toFixed(1)}%</em></li>`).join("")}</ul>
      <h3 style="margin-top:14px">Where it's held</h3>
      <ul class="in-legend">${Object.entries(accV).sort((a, b) => b[1].v - a[1].v).map(([a, o]) => `<li><span class="sw" style="background:var(--muted)"></span><b>${esc(a)}</b><span class="num">${indMoney(o.v)}</span><em>${o.n}</em></li>`).join("")}</ul></div>
    <div class="card b12 reveal"><div class="fields" style="justify-content:space-between;align-items:center"><div><div class="eyebrow">Buy price known for ${known.length} of ${H.length} holdings</div><h2>Invested ${indMoney(kCost)} → now ${indMoney(kVal)}</h2></div>${known.length ? `<span class="chip ${kVal >= kCost ? "good" : "act"}">${sgn(kVal - kCost)}${indMoney(Math.abs(kVal - kCost))} · ${pctf(kCost ? (kVal - kCost) / kCost : 0)}</span>` : ""}</div>
      <div class="in-cov"><i style="width:${(100 * known.reduce((a, h) => a + cur(h), 0)) / tot}%"></i></div>
      <p class="note">${((100 * known.reduce((a, h) => a + cur(h), 0)) / tot).toFixed(0)}% of your Indian money has a known buy price. Your statement (CAS) only includes buy cost for funds held directly with the fund house. ${guide.length ? "Upload these to fill in the rest; nothing needs typing (menu names can differ slightly between app versions):" : "Everything has a buy price."}</p>
      ${guide.length ? `<ol class="in-guide-list">${guide.map((g) => `<li><b>${esc(g.app)}</b> <span class="muted">${esc(g.what)}</span><span class="note">Adds the ${esc(g.gives)} · ${g.left} holding${g.left > 1 ? "s" : ""}</span></li>`).join("")}</ol><div class="fields"><button class="btn primary" data-go="upload">Upload reports</button></div>` : ""}
      <p class="note"><b>Prices:</b> ${pricedAt ? `shares, ETFs and fund NAVs were last refreshed on ${fmtDate(pricedAt)}.` : "broker report prices for now; shares, ETFs and fund NAVs then refresh every weekday morning."} Bonds and NCDs rarely trade, so they keep the value from your latest Wint report or statement.</p></div>
    ${bondCard(H, I)}
    ${inTaxCard(tx)}
    <div class="card b12 reveal"><div><h2>All Indian holdings</h2><p class="note">Largest first. <b>Tap any holding</b> for its full details: each purchase, returns, tax and, for bonds, maturity and payouts. <b>Long-term</b> means held long enough for the lower tax rate (12 months for shares and equity funds: 12.5% instead of 20%).</p></div>
      <div class="hf" role="group" aria-label="Filter">${IND_TYPES.filter(([t]) => cnt[t]).map(([t, l]) => `<button class="btn ${IF === t ? "primary" : ""}" type="button" data-if="${t}" aria-pressed="${IF === t}">${l}<b>${cnt[t]}</b></button>`).join("")}</div>
      <div class="tbl-wrap hold-wrap"><table class="hold-tbl in-tbl"><thead><tr><th>Holding</th><th>Type</th><th class="r">Units</th><th class="r">Buy price</th><th class="r">Price / NAV</th><th class="r">Value</th><th class="r">Invested</th><th class="r">Gain</th><th>Tax if sold today</th></tr></thead><tbody>
      ${rows.map((h) => { const v = cur(h), g = h.cost != null ? v - h.cost : null, px = h.lp && h.lpAt > (h.asOf || I.asOf) ? h.lp : h.price, t = inTax(h, px), bp = h.avg || (h.cost != null && h.units ? h.cost / h.units : null), r2 = (n) => "₹" + (+n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return `<tr class="hrow" data-hk="${esc(h.key)}" tabindex="0" aria-label="Details for ${esc(h.name)}"><td class="c-name"><span class="sym in-nm">${esc(h.name)} <span class="hr-go" aria-hidden="true">›</span></span><span class="nm">${h.via ? `bought on ${esc(h.via)} · ${esc(h.acct)} demat` : esc(h.acct)}${h.coupon ? ` · ${h.coupon}% coupon` : ""}${h.ytmBuy ? ` · ${h.ytmBuy.toFixed(2)}% yield at purchase` : ""}${h.bond ? ` · ${h.bond.ytmEst ? "≈" : ""}${h.bond.ytm.toFixed(2)}% YTM · matures ${fmtDate(h.bond.mat)}` : ""}${h.folio ? " · folio " + esc(h.folio) : ""}${h.nse ? " · NSE " + esc(h.nse) : ""}</span></td><td class="c-plan"><span class="chip neutral">${tname[h.type] || h.type}</span><span class="nm">${h.type === "bond" && bondMat(h) ? `matures ${fmtDate(bondMat(h))}` : esc(h.cls)}</span></td>
        <td class="r num" data-l="Units">${h.units != null ? (+h.units).toLocaleString("en-IN", { maximumFractionDigits: 3 }) : "—"}</td><td class="r num" data-l="Buy price">${bp ? r2(bp) : `<span class="muted nowrap" title="Upload the ${esc(h.acct)} holdings report">—</span>`}</td><td class="r num" data-l="Price / NAV">${px != null ? r2(px) : "—"}<span class="nm" style="text-align:right">${fmtDate(h.lp && h.lpAt > (h.asOf || I.asOf) ? h.lpAt : h.asOf || I.asOf)}</span></td><td class="r num" data-l="Value"><b>${indMoney(v)}</b></td>
        <td class="r num" data-l="Invested">${h.cost != null ? indMoney(h.cost) : "—"}</td><td class="r num ${g != null ? cls(g) : ""}" data-l="Gain">${g != null ? `${sgn(g)}${indMoney(Math.abs(g))}<span class="nm" style="text-align:right">${pctf(h.cost ? g / h.cost : 0)}</span>` : "—"}</td><td class="c-lt" data-l="Tax if sold today">${ltCell(h, t)}</td></tr>`; }).join("")}</tbody></table></div>
      ${allRows.length > 15 ? `<div class="fields" style="justify-content:center;margin-top:12px"><button class="btn" type="button" id="in-more">${IALL ? "Show top 15" : `Show all ${allRows.length}`}</button></div>` : ""}</div>
  </div>`;
  el.querySelectorAll("[data-if]").forEach((b) => (b.onclick = () => { IF = b.dataset.if; IALL = false; renderIndia(); }));
  const more = $("#in-more"); if (more) more.onclick = () => { IALL = !IALL; renderIndia(); };
  el.querySelectorAll(".hrow").forEach((tr) => { const open = () => { const h = H.find((x) => x.key === tr.dataset.hk); if (h) holdingDetail(h, I); }; tr.onclick = open; tr.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } }; });
  wireIndiaChart(el.querySelector(".in-hero"), hist);
}
/* net worth across India + global, shown on the main page */
let totCounted = false;
function renderNetWorth() {
  const el = $("#networth"), isum = $("#india-sum"); if (!el) return;
  const I = S && S.india, has = hasData();
  const rows = has ? holdingRows(S, TODAY) : [], gv = rows.reduce((a, r) => a + r.value, 0), gc = rows.reduce((a, r) => a + r.cost, 0);
  const g = gv * fxNow(), H = I ? indHoldings(I) : [], it = H.reduce((a, h) => a + indCur(h, I), 0), tot = it + g;
  const up = `<button class="btn primary" type="button" data-go="upload"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 16v4h16v-4"/></svg>Upload reports</button>`;
  if (!tot) {
    el.innerHTML = `<div class="tot-head"><h2>All investments</h2></div><div class="tot-v num">${nwMoney(0)}</div>
      <p class="tot-ch">Upload your CDSL or NSDL statement (CAS) for India and your INDmoney reports for the US and Japan. Every number here comes from those files; nothing is typed in.</p>
      <div class="tot-act">${up}</div>`;
    if (isum) isum.hidden = true; return;
  }
  const hist = (I && I.history) || [], last = hist[hist.length - 1], prev = hist[hist.length - 2], ich = last && prev ? last.v - prev.v : null;
  const mName = (m) => new Date(m + "-01T00:00:00Z").toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });
  const gg = gv - gc, ip = (100 * it) / tot, gp = 100 - ip;
  const inAt = I ? [I.asOf, I.pricedAt].filter(Boolean).sort().slice(-1)[0] : null, usAt = has ? oldestPrice() : null, dshort = (d) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const asOf = [inAt ? `India prices ${dshort(inAt)}` : "", usAt ? `US close ${dshort(usAt)}` : ""].filter(Boolean).join(" · ");
  const chg = [
    ich != null ? `<span class="${cls(ich)}">India <b>${sgn(ich)}${indMoney(Math.abs(ich))} (${pctf(prev.v ? ich / prev.v : 0)})</b> in ${mName(last.m)}</span>` : "",
    has ? `<span class="${cls(gg)}">Abroad <b>${sgn(gg)}${usd(Math.abs(gg))} (${pctf(gc ? gg / gc : 0)})</b> since your first buy</span>` : "",
  ].filter(Boolean).join("");
  el.innerHTML = `<div class="tot-head"><h2>All investments</h2>${asOf ? `<span class="tot-asof">${asOf}</span>` : ""}</div>
    <div class="tot-v num" aria-label="Total ${nwMoney(tot)}"><span data-count="${CUR === "INR" ? tot : tot / fxNow()}" data-fmt="nw" aria-hidden="true">${nwMoney(tot)}</span></div>
    ${chg ? `<p class="tot-ch">${chg}</p>` : ""}
    <div class="split" role="img" aria-label="India ${ip.toFixed(0)} percent, abroad ${gp.toFixed(0)} percent">${it ? `<i style="width:${ip}%;background:var(--t-a)"></i>` : ""}${g ? `<i style="width:${gp}%;background:var(--t-b)"></i>` : ""}</div>
    <div class="split-rows">
      <button type="button" class="split-row" data-go="india"><span class="sw" style="background:var(--t-a)"></span><span class="k">India</span><span class="pc">${ip.toFixed(0)}%</span><span class="v num">${nwMoney(it)}</span><span class="go">${I ? `${H.length} holdings` : "Upload your CAS"}</span></button>
      <button type="button" class="split-row" data-go="holdings"><span class="sw" style="background:var(--t-b)"></span><span class="k">Abroad</span><span class="pc">${gp.toFixed(0)}%</span><span class="v num">${nwMoney(g)}</span><span class="go">${has ? `${rows.length} holdings` : "Upload INDmoney reports"}</span></button>
    </div>
    <div class="tot-act">${up}<button class="btn" type="button" data-go="plan">This month's plan</button></div>`;
  if (!totCounted) { totCounted = true; countUp(el); }
  if (!isum) return;
  if (!I) { isum.hidden = true; return; }
  const mixV = {}; for (const h of H) mixV[h.cls] = (mixV[h.cls] || 0) + indCur(h, I);
  const mix = IND_ORDER.filter((k) => mixV[k] > 0).map((k) => ({ k, v: mixV[k], p: (100 * mixV[k]) / it }));
  const accV = {}; for (const h of H) { accV[h.acct] = accV[h.acct] || { v: 0, n: 0 }; accV[h.acct].v += indCur(h, I); accV[h.acct].n++; }
  isum.hidden = false;
  isum.innerHTML = `<div class="is-head"><div><h2>${flag("IN")}India</h2><div class="is-v num">${indMoney(it)}</div>
      ${ich != null ? `<p class="is-ch">${mName(last.m)}: <b class="${cls(ich)}">${sgn(ich)}${indMoney(Math.abs(ich))} (${pctf(prev.v ? ich / prev.v : 0)})</b>, including money you added</p>` : ""}</div>
      <button class="btn" type="button" data-go="india">All Indian holdings</button></div>
    ${indiaChart(hist)}
    <div class="in-mix" role="img" aria-label="${mix.map((x) => `${x.k} ${x.p.toFixed(0)}%`).join(", ")}">${mix.map((x) => `<i style="width:${x.p}%;background:var(${IND_COL[x.k]})" title="${esc(x.k)} ${x.p.toFixed(1)}%"></i>`).join("")}</div>
    <div class="is-cols"><div><h3>What it's made of</h3><ul class="in-legend">${mix.map((x) => `<li><span class="sw" style="background:var(${IND_COL[x.k]})"></span><b>${esc(x.k)}</b><span class="num">${indMoney(x.v)}</span><em>${x.p.toFixed(1)}%</em></li>`).join("")}</ul></div>
    <div><h3>Where it's held</h3><ul class="in-legend">${Object.entries(accV).sort((a, b) => b[1].v - a[1].v).map(([a, o]) => `<li><span class="sw" style="background:var(--control)"></span><b>${esc(a)}</b><span class="num">${indMoney(o.v)}</span><em>${o.n}</em></li>`).join("")}</ul></div></div>`;
  wireIndiaChart(isum, hist);
}

/* ---------- boot ---------- */
document.querySelectorAll("[data-cur]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cur === CUR)));
(function initTab() { let t = (location.hash || "").slice(1); try { t = t || localStorage.getItem("gbp-tab") || ""; } catch (e) {} if (t && document.getElementById("p-" + t)) showTab(t); })();
/* boot() and the first renderAll() run from ui.js, which loads after this file */
