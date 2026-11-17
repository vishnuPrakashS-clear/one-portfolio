import { describe, expect, test } from "vitest";
import { answer, topicOf, TOPICS } from "@/lib/ask-local";
import { buildModel } from "@/lib/model";

describe("answers without the AI helper", () => {
  test("typed questions go to the closest topic", () => {
    expect(topicOf("when can I sell ITC with less tax?")).toBe("tax");
    expect(topicOf("should I exit HDFC Bank")).toBe("sell");
    expect(topicOf("will I reach 1 crore by 2035")).toBe("goal");
    expect(topicOf("which report is missing")).toBe("upload");
    expect(topicOf("hello")).toBeNull();
  });
  test("every topic answers even with no data", () => {
    const M = buildModel(null);
    for (const t of TOPICS) {
      const a = answer(t.id, null, M);
      expect(a.title.length).toBeGreaterThan(0);
      expect(a.lines.length).toBeGreaterThan(0);
    }
  });
});
