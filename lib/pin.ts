/* App lock: a PIN on top of the sign-in. The PIN is never stored: only a salted PBKDF2-SHA256 hash of it, inside the person's own
   data. Unlocking lasts for this browser tab until 10 minutes without activity. */
import type { PinLock } from "@/types/portfolio";

export const LOCK_IDLE = 10 * 60 * 1000;
export const PIN_ITER = 210000;
const b64 = (u8: Uint8Array) => btoa(String.fromCharCode(...u8));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function pinHash(pin: string, salt: string, iter: number): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(pin)), "PBKDF2", false, ["deriveBits"]);
  return b64(
    new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: unb64(salt), iterations: iter }, k, 256)),
  );
}
export async function pinMatches(pin: string, lock: PinLock | undefined) {
  return !!lock && (await pinHash(pin, lock.salt, lock.iter)) === lock.hash;
}
export async function makeLock(pin: string, today: string): Promise<PinLock> {
  const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
  return { salt, iter: PIN_ITER, hash: await pinHash(pin, salt, PIN_ITER), set: today };
}
export function pinProblem(p1: string, p2: string): string | null {
  if (!/^\d{4,8}$/.test(p1)) return "Use 4 to 8 digits.";
  if (p1 !== p2) return "The two PINs don't match.";
  if (/^(\d)\1+$/.test(p1) || "0123456789".includes(p1) || "9876543210".includes(p1)) return "That PIN is too easy to guess. Try another.";
  return null;
}
const KEY = "op-unlock";
export const sessionUnlocked = () => {
  try {
    return Date.now() - +(sessionStorage.getItem(KEY) || 0) < LOCK_IDLE;
  } catch {
    return false;
  }
};
export const touchSession = () => {
  try {
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* private mode */
  }
};
export const clearSession = () => {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
};
