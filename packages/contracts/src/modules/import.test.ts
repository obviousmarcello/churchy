import { describe, expect, it } from "vitest";
import { isLowConfidence, parseImportUrl } from "./import";

describe("parseImportUrl", () => {
  it("adds https and trims", () => {
    expect(parseImportUrl("  pelda.example.test ")).toBe("https://pelda.example.test/");
    expect(parseImportUrl("http://pelda.example.test/rolunk")).toBe(
      "http://pelda.example.test/rolunk",
    );
  });

  it("rejects what is not a web address", () => {
    for (const bad of [
      "",
      "   ",
      "nem cím",
      "localhost",
      "ftp://pelda.example.test",
      "mailto:a@b.hu",
    ]) {
      expect(parseImportUrl(bad)).toBeNull();
    }
  });
});

describe("isLowConfidence", () => {
  it("flags below 0.7", () => {
    expect(isLowConfidence({ confidence: 0.69 })).toBe(true);
    expect(isLowConfidence({ confidence: 0.7 })).toBe(false);
  });
});
