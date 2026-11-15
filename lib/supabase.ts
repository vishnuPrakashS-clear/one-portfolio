/* Supabase on the free tier: sign-in, the person's own portfolio row (row-level security), "refresh now" and the optional AI helper. */
import type { MarketClass, MarketData, MarketFund, MarketStock } from "@/types/market";
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

/* ---------- shared market data for Portfolio health (public data; readable by anyone signed in) ---------- */
/** what's known about the funds and stocks you hold: fund holdings and report-card numbers, stock fundamentals, NSE lists */
export async function loadMarketData(fundIsins: string[], stockIsins: string[]): Promise<MarketData> {
  const out: MarketData = { funds: {}, stocks: {}, klass: {} };
  const chunks = (a: string[]) => Array.from({ length: Math.ceil(a.length / 150) }, (_, i) => a.slice(i * 150, i * 150 + 150));
  const jobs: Promise<void>[] = [];
  for (const c of chunks(fundIsins))
    jobs.push(
      (async () => {
        const { data, error } = await sb()
          .from("market_fund")
          .select("isin,search_id,name,info,holdings,as_of,fetched_at,miss")
          .in("isin", c);
        if (error) throw error;
        for (const r of (data || []) as MarketFund[]) out.funds[r.isin] = r;
      })(),
    );
  for (const c of chunks(stockIsins))
    jobs.push(
      (async () => {
        const { data, error } = await sb()
          .from("market_stock")
          .select("isin,search_id,nse,name,industry,info,fetched_at,miss")
          .in("isin", c);
        if (error) throw error;
        for (const r of (data || []) as MarketStock[]) out.stocks[r.isin] = r;
      })(),
    );
  for (const c of chunks(stockIsins))
    jobs.push(
      (async () => {
        const { data, error } = await sb().from("market_class").select("isin,symbol,name,industry,cap").in("isin", c);
        if (error) throw error;
        for (const r of (data || []) as MarketClass[]) out.klass[r.isin] = r;
      })(),
    );
  await Promise.all(jobs);
  return out;
}
/** ask the server to fetch market data for what you hold (a small batch; call again until nothing is left) */
export async function fillMarketData(): Promise<{ funds?: number; stocks?: number; todo?: { funds: number; stocks: number } }> {
  const { data, error } = await sb().functions.invoke("market-data", { body: {} });
  if (error) throw error;
  return data;
}
