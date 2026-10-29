/* Supabase on the free tier: sign-in, the person's own portfolio row (row-level security), "refresh now" and the optional AI helper. */
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { supabaseConfig } from "@/config";
import type { Portfolio } from "@/types/portfolio";

let client: SupabaseClient | null = null;
export function sb(): SupabaseClient {
  if (!client)
    client = createClient(supabaseConfig.url, supabaseConfig.key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  return client;
}

/** the row id and its last update time, so a save never overwrites someone else's row */
export const cloud = { rowId: null as string | null, at: null as string | null };

export async function cloudLoad(user: User): Promise<Partial<Portfolio> | null> {
  const { data, error } = await sb().from("portfolio").select("id,data,updated_at").eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  cloud.rowId = data.id;
  cloud.at = data.updated_at;
  return data.data as Partial<Portfolio>;
}
export async function cloudSave(user: User, state: Portfolio) {
  const row = { id: cloud.rowId || user.id, user_id: user.id, data: state };
  const { data, error } = await sb().from("portfolio").upsert(row, { onConflict: "id" }).select("id,updated_at").single();
  if (error) throw error;
  cloud.rowId = data.id;
  cloud.at = data.updated_at;
}
export async function cloudDelete(user: User) {
  const { error } = await sb().from("portfolio").delete().eq("user_id", user.id);
  if (error) throw error;
  cloud.rowId = null;
  cloud.at = null;
}
export async function cloudStamp(user: User): Promise<string | null> {
  const { data, error } = await sb().from("portfolio").select("updated_at").eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  return data?.updated_at ?? null;
}
export function cloudErr(e: unknown): string {
  const o = (e || {}) as { message?: string; error_description?: string; msg?: string; code?: string };
  const m = String(o.message || o.error_description || o.msg || e || "");
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(m))
    return "Can't reach Supabase. Check your internet connection; a paused free project wakes up within a minute.";
  if (/JWT|token|session/i.test(m)) return "Your sign-in has expired. Sign in again.";
  if (o.code === "42501" || /row-level security|permission denied/i.test(m)) return "This account isn't allowed to use this app.";
  return m || "Something went wrong talking to Supabase.";
}
export interface RefreshResult {
  ok?: boolean;
  us?: number;
  india?: number;
  fx?: number;
  skipped?: string | string[];
}
export async function refreshPricesNow(): Promise<RefreshResult> {
  const { data, error } = await sb().functions.invoke("refresh-prices", { body: {} });
  if (error) throw error;
  return data as RefreshResult;
}

/* ---------- optional AI helper (a free Gemini key kept as a Supabase secret; a daily cap per person) ---------- */
async function aiCall(body: Record<string, unknown>): Promise<{ text: string; configured?: boolean }> {
  const { data, error } = await sb().functions.invoke("ai", { body });
  if (error) {
    let m = error.message;
    try {
      const j = await (error as { context?: Response }).context?.json();
      m = j?.error || m;
    } catch {
      /* keep the message */
    }
    throw Object.assign(new Error(m), { code: "ai_error" });
  }
  return data;
}
const blobB64 = (b: Blob) =>
  new Promise<{ type: string; data: string }>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res({ type: b.type || "image/png", data: String(r.result).split(",")[1] });
    r.onerror = rej;
    r.readAsDataURL(b);
  });
export interface AiHelper {
  ask: (prompt: string) => Promise<string>;
  json: <T>(prompt: string, images?: Blob[]) => Promise<T>;
}
export async function aiSetup(): Promise<AiHelper | null> {
  try {
    const r = await aiCall({ ping: true });
    if (!r?.configured) return null;
    return {
      ask: async (prompt) => (await aiCall({ prompt })).text,
      json: async <T>(prompt: string, images: Blob[] = []) => {
        const r2 = await aiCall({ prompt, images: await Promise.all(images.map(blobB64)), json: true });
        return JSON.parse(String(r2.text).replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "")) as T;
      },
    };
  } catch {
    return null;
  }
}
