/* Dates are ISO yyyy-mm-dd strings and all arithmetic is in UTC, so a holding's dates never shift with the viewer's time zone. */
import type { ISODate, YearMonth } from "@/types/portfolio";

export const MON: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

export function iso(y: number, m: number, d: number): ISODate {
  return new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
}
export function todayIso(): ISODate {
  const d = new Date();
  return iso(d.getFullYear(), d.getMonth(), d.getDate());
}

/** "today" for every calculation; tests pin it with setToday() */
let today: ISODate = todayIso();
export const TODAY = (): ISODate => today;
export function setToday(d: ISODate) {
  today = d;
}

export function parseLooseDate(s: unknown): ISODate | null {
  if (s instanceof Date) return s.toISOString().slice(0, 10);
  const t = String(s ?? "").trim();
  let m = t.match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/);
  if (m && MON[m[2].toLowerCase()] != null) return iso(+m[3], MON[m[2].toLowerCase()], +m[1]);
  m = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return iso(+m[1], +m[2] - 1, +m[3]);
  m = t.match(/(\d{2})\/(\d{2})\/(\d{4})/); // US mm/dd/yyyy
  if (m) return iso(+m[3], +m[1] - 1, +m[2]);
  return null;
}
/** dd-mm-yyyy or dd/mm/yyyy (Indian reports), else any loose date */
export function dmy(s: unknown): ISODate | null {
  const t = String(s ?? "").trim();
  const m = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (m) return iso(+m[3], +m[2] - 1, +m[1]);
  return parseLooseDate(t);
}
/** 12-Mar-26 or 12 Mar 2026 (IndiaBonds), else dmy */
export function ddmmmyy(s: unknown): ISODate | null {
  const m = String(s ?? "").match(/(\d{1,2})[-\s]([A-Za-z]{3})[a-z]*[-\s](\d{2,4})/);
  if (!m || MON[m[2].toLowerCase()] == null) return dmy(s);
  const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
  return iso(y, MON[m[2].toLowerCase()], +m[1]);
}
export function excelDate(n: number): ISODate {
  return new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 864e5).toISOString().slice(0, 10);
}
export function addDays(d: ISODate, n: number): ISODate {
  const t = new Date(d + "T00:00:00Z");
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
/** first day after n months (the day a holding bought on d turns long-term) */
export function addMonths(d: ISODate, n: number): ISODate {
  const t = new Date(d + "T00:00:00Z");
  t.setUTCMonth(t.getUTCMonth() + n);
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}
/** Long-term abroad = held MORE than 24 months: first long-term sale day is buy date + 24 months + 1 day */
export function ltcgDate(d: ISODate): ISODate {
  const t = new Date(d + "T00:00:00Z");
  const y = t.getUTCFullYear() + 2,
    m = t.getUTCMonth(),
    day = t.getUTCDate();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return addDays(iso(y, m, Math.min(day, last)), 1);
}
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
}
export const ymOf = (d: ISODate): YearMonth => d.slice(0, 7);
export function ymAdd(ym: YearMonth, n: number): YearMonth {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}
export const nextYm = (ym: YearMonth): YearMonth => ymAdd(ym, 1);
export function monthEnd(ym: YearMonth): ISODate {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
/** 1 April of the current Indian financial year */
export function fyStart(t: ISODate = TODAY()): ISODate {
  const y = +t.slice(0, 4),
    m = +t.slice(5, 7);
  return `${m >= 4 ? y : y - 1}-04-01`;
}

/* ---------- display ---------- */
const UTC = { timeZone: "UTC" } as const;
export function fmtDate(d: ISODate | null | undefined): string {
  if (!d) return "—";
  return new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", ...UTC });
}
export const monthShort = (ym: YearMonth) => new Date(ym + "-01T00:00:00Z").toLocaleDateString("en-GB", { month: "short", ...UTC });
export const monthLong = (ym: YearMonth) =>
  new Date(ym + "-01T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", ...UTC });
export const monthName = (ym: YearMonth) =>
  new Date(ym + "-01T00:00:00Z").toLocaleDateString("en-GB", { month: "short", year: "numeric", ...UTC });
export const longDate = (d: ISODate) =>
  new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", ...UTC });
export const daysTxt = (n: number) => (n <= 0 ? "long-term now" : n < 60 ? `${n} days` : `${Math.round(n / 30.4)} months`);

/* ---------- India time (the daily refresh runs 07:10 IST, Tuesday to Saturday) ---------- */
function tzOffsetMin(tz: string, t: number) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(new Date(t))
      .map((x) => [x.type, x.value]),
  );
  return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute) - t) / 6e4;
}
export function localToUtc(d: ISODate, tz: string, hh: number, mm: number) {
  const [y, m, dd] = d.split("-").map(Number),
    guess = Date.UTC(y, m - 1, dd, hh, mm);
  return guess - tzOffsetMin(tz, guess) * 6e4;
}
export const ist = (t: number, o?: Intl.DateTimeFormatOptions) =>
  new Date(t).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    ...(o || {}),
  });
export function nextRefresh(now: number): number | null {
  for (let k = 0; k < 8; k++) {
    const t = new Date(now + k * 864e5),
      d = new Date(t.getTime() + 5.5 * 36e5).toISOString().slice(0, 10);
    const u = localToUtc(d, "Asia/Kolkata", 7, 10),
      wd = new Date(d + "T00:00:00Z").getUTCDay();
    if (wd >= 2 && wd <= 6 && u > now) return u;
  }
  return null;
}
