import { describe, expect, test } from "vitest";
import { parseCAS, type PdfItem } from "@/lib/core/cas";

/** one made-up CDSL page laid out like the real statement: a demat table and a mutual fund folio table */
function page(): PdfItem[] {
  const at = (x: number, y: number, s: string): PdfItem => ({ x, y, s });
  return [
    at(40, 800, "CONSOLIDATED ACCOUNT STATEMENT"),
    at(40, 790, "CDSL"),
    at(40, 780, "for the period from 01-Sep-2026 to 30-Sep-2026"),
    at(40, 770, "Total Portfolio Value 1,23,456.00"),
    at(40, 750, "DEMAT ACCOUNTS HELD WITH CDSL"),
    at(40, 740, "DP Name :"),
    at(120, 740, "GROWW INVEST TECH PRIVATE LIMITED"),
    at(40, 680, "HOLDING STATEMENT AS ON 30-09-2026"),
    at(40, 660, "INE848E01016"),
    at(100, 660, "NHPC LIMITED#EQUITY SHARES"),
    at(330, 660, "100"),
    at(400, 660, "84.20"),
    at(470, 660, "8,420.00"),
    at(40, 630, "MUTUAL FUND UNITS HELD AS ON 30-09-2026"),
    at(20, 580, "B21G - SBI SMALL CAP FUND - DIRECT PLAN - GROWTH"),
    at(200, 580, "INF200K01VK1"),
    at(240, 580, "1234567/89"),
    at(330, 580, "50.000"),
    at(400, 580, "180.00"),
    at(470, 580, "8,000.00"),
    at(540, 580, "9,000.00"),
  ];
}

describe("CDSL / NSDL statement", () => {
  test("reads the period, total, holdings, account and folio", () => {
    const r = parseCAS([page()])!;
    expect(r).not.toBeNull();
    expect(r.asOf).toBe("2026-09-30");
    expect(r.total).toBe(123456);
    const nhpc = r.holdings.find((h) => h.isin === "INE848E01016")!;
    expect(nhpc).toMatchObject({ type: "stock", units: 100, price: 84.2, value: 8420, acct: "Groww", name: "NHPC" });
    const fund = r.holdings.find((h) => h.isin === "INF200K01VK1")!;
    expect(fund).toMatchObject({
      type: "mf",
      units: 50,
      price: 180,
      cost: 8000,
      value: 9000,
      acct: "MF folios (CAMS/KFin)",
      name: "SBI SMALL CAP FUND",
    });
    expect(fund.folio).toBe("1234567/89");
  });
  test("ignores PDFs that aren't a consolidated statement", () => expect(parseCAS([[{ x: 0, y: 0, s: "Account statement" }]])).toBeNull());
});
