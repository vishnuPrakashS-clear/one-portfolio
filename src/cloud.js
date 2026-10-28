/* One Portfolio — sign-in, saving and the optional AI helper, all on Supabase's free tier.
   The publishable key below is meant to be public: what each signed-in person can read or change is decided in the
   database by row-level security (see supabase/migrations), and sign-up is refused for any email not on the allow-list. */
const OP = {
  url: "https://iyzxzurxeddznihyrhfw.supabase.co",
  key: "sb_publishable_oeiH76MPVzHDtxx4tFv91A_yKXzSwKZ",
  user: null, rowId: null, at: null, recovery: false, freshLogin: 0,
};
const sbc = window.supabase.createClient(OP.url, OP.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
sbc.auth.onAuthStateChange((ev, session) => {
  if (ev === "PASSWORD_RECOVERY") { OP.recovery = true; showLogin("newpass"); }
  if (ev === "SIGNED_OUT") { OP.user = null; }
  if (session && session.user) OP.user = session.user;
});

/* ---------- data ---------- */
async function cloudLoad() {
  const { data, error } = await sbc.from("portfolio").select("id,data,updated_at").eq("user_id", OP.user.id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  OP.rowId = data.id; OP.at = data.updated_at; return data.data;
}
async function cloudSave(state) {
  const row = { id: OP.rowId || OP.user.id, user_id: OP.user.id, data: state };
  const { data, error } = await sbc.from("portfolio").upsert(row, { onConflict: "id" }).select("id,updated_at").single();
  if (error) throw error;
  OP.rowId = data.id; OP.at = data.updated_at;
}
async function cloudDelete() {
  const { error } = await sbc.from("portfolio").delete().eq("user_id", OP.user.id);
  if (error) throw error; OP.rowId = null; OP.at = null;
}
async function cloudStamp() {
  const { data, error } = await sbc.from("portfolio").select("updated_at").eq("user_id", OP.user.id).maybeSingle();
  if (error) throw error; return data && data.updated_at;
}
function cloudErr(e) {
  const m = String((e && (e.message || e.error_description || e.msg)) || e || "");
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(m)) return "Can't reach Supabase. Check your internet connection; a paused free project wakes up within a minute.";
  if (/JWT|token|session/i.test(m)) return "Your sign-in has expired. Sign in again.";
  if ((e && e.code === "42501") || /row-level security|permission denied/i.test(m)) return "This account isn't allowed to use this app.";
  return m || "Something went wrong talking to Supabase.";
}
async function refreshPricesNow() {
  const { data, error } = await sbc.functions.invoke("refresh-prices", { body: {} });
  if (error) throw error; return data;
}

/* ---------- sign-in screen ---------- */
function showLogin(view, msg) {
  let d = $("#loginscr");
  if (!d) { d = document.createElement("div"); d.id = "loginscr"; d.className = "lockscr loginscr"; d.setAttribute("role", "dialog"); d.setAttribute("aria-modal", "true"); d.setAttribute("aria-label", "Sign in"); document.body.appendChild(d); }
  d.hidden = false; document.body.classList.add("locked");
  const V = view || "signin";
  const title = { signin: "Sign in to One Portfolio", signup: "Create your account", forgot: "Reset your password", newpass: "Choose a new password", check: "Check your email" }[V];
  const sub = { signin: "Your investments in India, the US and Japan, in one place.", signup: "Use your email and a new password. Everything you upload is private to your account.", forgot: "We'll email you a link to set a new password. If it doesn't arrive within a few minutes, ask the person who runs this app to reset it for you.", newpass: "Pick a password you don't use anywhere else.", check: msg || "We sent you a link. Open it on this device to finish." }[V];
  const email = `<label class="lf" for="lg-email"><span>Email</span><input id="lg-email" type="email" autocomplete="email" inputmode="email" required></label>`;
  const pass = (ac, lbl) => `<label class="lf" for="lg-pass"><span>${lbl || "Password"}</span><input id="lg-pass" type="password" autocomplete="${ac}" minlength="${ac === "new-password" ? 10 : 1}" required></label>`;
  const body = V === "check" ? `<button class="btn primary" type="button" data-lv="signin">Back to sign in</button>`
    : `${V !== "newpass" ? email : ""}${V === "signin" ? pass("current-password") : V === "signup" ? pass("new-password", "Password (10+ characters)") : V === "newpass" ? pass("new-password", "New password (10+ characters)") : ""}
       <p class="um-err" id="lg-err" ${msg && V !== "check" ? "" : "hidden"}>${esc(msg || "")}</p>
       <button class="btn primary" type="submit" id="lg-go">${{ signin: "Sign in", signup: "Create account", forgot: "Email me a link", newpass: "Save password" }[V]}</button>
       <div class="lg-links">${V === "signin" ? `<button type="button" class="linkbtn" data-lv="forgot">Forgot password?</button><button type="button" class="linkbtn" data-lv="signup">First time? Create your account</button>` : V !== "newpass" ? `<button type="button" class="linkbtn" data-lv="signin">Back to sign in</button>` : ""}</div>`;
  d.innerHTML = `<form class="lock-card login-card" id="lgform" novalidate><div class="login-logo" aria-hidden="true"><svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="8.5"/><path d="M16 7.5V16h8.5"/></svg></div><h2>${title}</h2><p class="note">${esc(sub)}</p>${body}
    <p class="note lg-foot">Secured by Supabase Auth · your data is readable only by your account.</p></form>`;
  d.querySelectorAll("[data-lv]").forEach((b) => (b.onclick = () => showLogin(b.dataset.lv)));
  const f = $("#lgform"), err = (t) => { const e = $("#lg-err"); if (e) { e.hidden = false; e.textContent = t; } };
  setTimeout(() => { const i = d.querySelector("input"); if (i) i.focus(); }, 60);
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    const go = $("#lg-go"); if (go) { go.disabled = true; go.textContent = "Please wait…"; }
    const em = $("#lg-email") && $("#lg-email").value.trim(), pw = $("#lg-pass") && $("#lg-pass").value;
    const back = () => { if (go) { go.disabled = false; go.textContent = { signin: "Sign in", signup: "Create account", forgot: "Email me a link", newpass: "Save password" }[V]; } };
    const here = location.origin + location.pathname;
    try {
      if (V === "signin") { const { error } = await sbc.auth.signInWithPassword({ email: em, password: pw }); if (error) throw error; OP.freshLogin = Date.now(); hideLogin(); boot(); return; }
      if (V === "signup") { if ((pw || "").length < 10) throw new Error("Use at least 10 characters."); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em || "")) throw new Error("Enter a valid email address.");
        const { data, error } = await sbc.auth.signUp({ email: em, password: pw, options: { emailRedirectTo: here } }); if (error) throw error; if (data.session) { OP.freshLogin = Date.now(); hideLogin(); boot(); return; }
        if (data.user && Array.isArray(data.user.identities) && !data.user.identities.length) throw new Error("already registered");
        return showLogin("check", "We sent a confirmation link to " + em + ". Open it, then sign in."); }
      if (V === "forgot") { const { error } = await sbc.auth.resetPasswordForEmail(em, { redirectTo: here }); if (error) throw error; return showLogin("check", "If " + em + " has an account, a reset link is on its way. Open it on this device."); }
      if (V === "newpass") { if ((pw || "").length < 10) throw new Error("Use at least 10 characters."); const { error } = await sbc.auth.updateUser({ password: pw }); if (error) throw error; OP.recovery = false; OP.freshLogin = Date.now(); history.replaceState(null, "", here); hideLogin(); boot(); return; }
    } catch (e) {
      back();
      const m = String(e && e.message || e);
      err(/Invalid login/i.test(m) ? "That email and password don't match." : /Email not confirmed/i.test(m) ? "Confirm your email first: open the link we sent you." : /already registered|already been registered|User already/i.test(m) ? "That email already has an account. Sign in instead." : /Sign-up is full|Database error saving new user/i.test(m) ? "Sign-up is full or closed for this app right now." : /Password should|weak/i.test(m) ? "Pick a longer, less common password." : /rate limit/i.test(m) ? "Too many attempts. Wait a few minutes and try again." : cloudErr(e));
    }
  };
}
function hideLogin() { const d = $("#loginscr"); if (d) d.hidden = true; if (!LOCKED) document.body.classList.remove("locked"); }
async function signOut() { try { await sbc.auth.signOut(); } catch (e) {} OP.user = null; OP.rowId = null; S = null; HELD = null; LOCKED = false; mode = "signedout"; try { sessionStorage.removeItem("op-unlock"); } catch (e) {} const l = $("#lockscr"); if (l) l.hidden = true; renderAll(); showLogin("signin"); }

/* ---------- optional AI helper (free Gemini key kept as a Supabase secret; a daily cap per person) ---------- */
const blobB64 = (b) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res({ type: b.type || "image/png", data: String(r.result).split(",")[1] }); r.onerror = rej; r.readAsDataURL(b); });
async function aiCall(body) {
  const { data, error } = await sbc.functions.invoke("ai", { body });
  if (error) { let m = error.message; try { const j = await error.context.json(); m = j.error || m; } catch (e) {} throw { code: "ai_error", message: m }; }
  return data;
}
async function aiSetup() {
  try { const r = await aiCall({ ping: true }); if (r && r.configured) {
    const f = async (input, opts = {}) => { const prompt = typeof input === "string" ? input : input.map((m) => `${m.role}: ${m.content}`).join("\n\n"); const r2 = await aiCall({ prompt }); if (opts.onText) opts.onText({ text: r2.text }); return { text: r2.text }; };
    f.json = async (prompt, opts = {}) => { const images = await Promise.all((opts.images || []).map(blobB64)); const r2 = await aiCall({ prompt, images, json: true }); return JSON.parse(String(r2.text).replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "")); };
    f.limits = async () => ({ images: true });
    sampleFn = f; canImages = true;
  } } catch (e) { sampleFn = null; canImages = false; }
}
