import { describe, expect, it } from "vitest";
import { ImportResultSchema, isLowConfidence } from "@churchy/contracts";
import { mockImportResult } from "./import-job";

describe("mock import fixture", () => {
  const result = mockImportResult("https://pelda.example.test/");

  it("is a valid ImportResult", () => {
    expect(ImportResultSchema.safeParse(result).success).toBe(true);
  });

  it("has items the wizard must flag and people to opt in", () => {
    const flagged = [
      ...result.serviceTimes,
      ...result.locations,
      result.theme,
      ...Object.values(result.terminology),
    ].filter(isLowConfidence);
    expect(flagged.length).toBeGreaterThanOrEqual(3);
    expect(result.staff.some((p) => p.hasPhoto)).toBe(true);
  });

  it("only refers to locations it returns", () => {
    const ids = new Set(result.locations.map((l) => l.id));
    for (const s of result.serviceTimes) {
      expect(s.location === null || ids.has(s.location)).toBe(true);
    }
  });
});
