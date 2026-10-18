// One Portfolio — optional AI helper (Supabase Edge Function).
// Reads screenshots / image-only PDFs and answers questions, using Google Gemini's free API tier.
// Off until you save a key:  Supabase dashboard → Edge Functions → Secrets → GEMINI_API_KEY  (optional GEMINI_MODEL).
// Only signed-in users on public.allowed_users can call it. Note: Google may use free-tier requests to improve its models.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const out = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return out({ ok: true });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u } = await admin.auth.getUser(jwt);
  const email = u?.user?.email?.toLowerCase();
  if (!email) return out({ error: "Sign in first." }, 401);
  const { data: ok } = await admin.from("allowed_users").select("email").ilike("email", email).maybeSingle();
  if (!ok) return out({ error: "This account isn't allowed to use the AI helper." }, 403);

  const key = Deno.env.get("GEMINI_API_KEY"), model = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";
  let body: { ping?: boolean; prompt?: string; images?: { type: string; data: string }[]; json?: boolean } = {};
  try { body = await req.json(); } catch { /* empty */ }
  if (body.ping) return out({ configured: !!key, model });
  if (!key) return out({ error: "The AI helper is off: add a GEMINI_API_KEY secret in Supabase." }, 503);
  if (!body.prompt || body.prompt.length > 200000) return out({ error: "Missing or too long prompt." }, 400);
  const parts: unknown[] = [{ text: body.prompt }];
  for (const im of (body.images || []).slice(0, 4)) parts.push({ inline_data: { mime_type: im.type || "image/png", data: im.data } });
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: body.json ? { responseMimeType: "application/json", temperature: 0 } : { temperature: 0.4 } }),
    signal: AbortSignal.timeout(90000),
  }).catch(() => null);
  if (!r) return out({ error: "Gemini didn't answer in time." }, 504);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return out({ error: j?.error?.message || `Gemini error ${r.status}` }, r.status === 429 ? 429 : 502);
  const text = (j?.candidates?.[0]?.content?.parts || []).map((p: { text?: string }) => p.text || "").join("");
  return out({ text });
});
