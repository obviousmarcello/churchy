// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { LlmPlanSchema, planJsonSchema } from "./plan-schema";
import { estimateTokens } from "./prompt";
import { costUsd } from "./llm";
import { sundayOnOrAfter, validIsoDate, uniqueSlug, toRichText, denominationVote } from "./map";
import { extractPage } from "./extract";

describe("plan schema", () => {
  it("produces an object schema for the strict tool without unsupported keywords", () => {
    const schema = planJsonSchema();
    const text = JSON.stringify(schema);
    expect(schema.type).toBe("object");
    expect(text).not.toMatch(
      /"(minLength|maxLength|pattern|minItems|maxItems|format|minimum|maximum)"/,
    );
    expect(text).toContain('"additionalProperties":false');
  });

  it("rejects an unknown denomination, role or weekday", () => {
    expect(LlmPlanSchema.safeParse({}).success).toBe(false);
  });
});

describe("helpers", () => {
  it("prices a run with the Sonnet rates", () => {
    expect(
      costUsd({ inputTokens: 1_000_000, outputTokens: 100_000, cacheReadTokens: 0 }),
    ).toBeCloseTo(3);
    expect(estimateTokens("a".repeat(250))).toBe(100);
  });

  it("handles dates and slugs", () => {
    expect(validIsoDate("2026-02-30")).toBeNull();
    expect(validIsoDate("2026-05-01T10:00:00Z")).toBe("2026-05-01");
    expect(sundayOnOrAfter("2026-11-28")).toBe("2026-11-29");
    expect(sundayOnOrAfter("2026-11-29")).toBe("2026-11-29");
    const taken = new Set<string>();
    expect(uniqueSlug("Rólunk!", "x", taken)).toBe("rolunk");
    expect(uniqueSlug("rolunk", "x", taken)).toBe("rolunk-2");
    expect(uniqueSlug("", "Árvíztűrő tükörfúrógép", taken)).toBe("arvizturo-tukorfurogep");
  });

  it("converts blocks to Tiptap JSON", () => {
    const doc = toRichText([
      { type: "heading", level: 1, text: "H" },
      { type: "paragraph", text: "p" },
      { type: "list", items: ["a", "b"] },
    ]);
    expect(doc.type).toBe("doc");
    expect(doc.content.map((n) => n.type)).toEqual(["heading", "paragraph", "bulletList"]);
  });

  it("votes the denomination from the wording and abstains on a tie", () => {
    const p = extractPage(
      "<html><body><main><p>Szentmise, plébános, plébánia, szentmise a templomban sok szöveggel itt, hogy elég hosszú legyen a főtartalom a feldolgozáshoz és a szavazáshoz is.</p></main></body></html>",
      "https://x.hu/",
    );
    expect(denominationVote([p])?.value).toBe("rk");
    expect(denominationVote([])).toBeNull();
  });
});
