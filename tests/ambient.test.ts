import { describe, expect, test } from "vitest";
import { lookFor } from "@/components/main/ambient/ambient";

describe("ambient scene per page", () => {
  test("each page gets its own colours and pace; unknown pages fall back to the brand look", () => {
    const funds = lookFor("/one-portfolio/funds/", false),
      check = lookFor("/checklist", true),
      home = lookFor("/", false);
    expect(funds.colors[1]).toBe("#8b6cf6");
    expect(check.mood).toBeLessThan(funds.mood);
    expect(check.dark).toBe(true);
    expect(lookFor("/goals", false)).toEqual(lookFor("/future", false));
    expect(home.colors[1]).toBe("#149a68");
  });
});
