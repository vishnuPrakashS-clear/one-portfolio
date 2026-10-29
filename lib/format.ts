/* Money formatting. Indian amounts use lakh / crore grouping; a "short" form (₹6.75 L, ₹1.2 Cr) keeps headline figures readable. */
export type Currency = "INR" | "USD";

export const sgn = (v: number) => (v >= 0 ? "+" : "−");
export const inr = (v: number) => (v < 0 ? "−" : "") + "₹" + Math.round(Math.abs(v)).toLocaleString("en-IN");
export const inr2 = (v: number) => "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const usdRaw = (v: number) =>
  (v < 0 ? "−" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const usd2 = (v: number) => (v < 0 ? "−" : "") + "$" + Math.abs(v).toFixed(2);
export const pctf = (v: number) => sgn(v) + Math.abs(v * 100).toFixed(1) + "%";
export const pct1 = (v: number | null | undefined) => (v == null || !isFinite(v) ? "—" : pctf(v));
export const pctPlain = (v: number, dp = 0) => (v * 100).toFixed(dp) + "%";
export const tone = (v: number) => (v > 0.0049 ? "pos" : v < -0.0049 ? "neg" : "");
export const tk = (s: string) => String(s).replace("LSE~", "");
export const qty = (n: number) => (+n).toLocaleString("en-IN", { maximumFractionDigits: 3 });
export const fmtQ = (q: number) => (+q).toFixed(q < 1 ? 4 : 2);

const trim2 = (x: number) => x.toFixed(2).replace(/\.?0+$/, "");
/** ₹6.75 L, ₹1.2 Cr, ₹43,982; in dollars $7.1k or $1.24M */
export function short(v: number, cur: Currency = "INR", fx = 95): string {
  if (cur === "USD") {
    const d = v / fx,
      a = Math.abs(d);
    return (
      (d < 0 ? "−" : "") +
      "$" +
      (a >= 1e6
        ? (a / 1e6).toFixed(2) + "M"
        : a >= 1e4
          ? (a / 1e3).toFixed(1) + "k"
          : a.toLocaleString("en-US", { maximumFractionDigits: 0 }))
    );
  }
  const a = Math.abs(v),
    s = v < 0 ? "−" : "";
  return (
    s + (a >= 1e7 ? "₹" + trim2(a / 1e7) + " Cr" : a >= 1e5 ? "₹" + trim2(a / 1e5) + " L" : "₹" + Math.round(a).toLocaleString("en-IN"))
  );
}
/** a rupee amount in the chosen currency, full precision */
export function money(v: number, cur: Currency = "INR", fx = 95): string {
  return cur === "USD" ? usdRaw(v / fx) : inr(v);
}
/** a dollar amount (abroad sleeve) in the chosen currency */
export function usd(v: number, cur: Currency = "USD", fx = 95): string {
  return cur === "INR" ? inr(v * fx) : usdRaw(v);
}
