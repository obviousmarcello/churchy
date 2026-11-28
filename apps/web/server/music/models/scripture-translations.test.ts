import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/music/db", () => ({ getMusicSupabase: async () => ({}) }));

import { saveTranslationSchema } from "./scripture-translations";

const valid = {
  id: "sajat",
  name: "Saját fordítás",
  shortName: "Saját",
  source: "pasted" as const,
};

describe("saveTranslationSchema", () => {
  it("accepts a translation of the church and fills the defaults", () => {
    expect(saveTranslationSchema.parse(valid)).toMatchObject({
      id: "sajat",
      notice: null,
      deuterocanon: false,
      enabled: true,
      sources: null,
    });
  });

  it("keeps the platform id for Károli and checks the form of the id and the source", () => {
    for (const bad of [
      { ...valid, id: "karoli1908" },
      { ...valid, id: "Saját" },
      { ...valid, id: "" },
      { ...valid, source: "files" },
      { ...valid, name: "  " },
    ]) {
      expect(saveTranslationSchema.safeParse(bad).success).toBe(false);
    }
  });

  it("takes optional website mappings for the paste links, nothing else", () => {
    const sources = { szentiras: "RUF", bibleCom: { id: 920, abbreviation: "RÚF" } };
    expect(saveTranslationSchema.parse({ ...valid, sources }).sources).toEqual(sources);
    expect(saveTranslationSchema.safeParse({ ...valid, sources: { url: "x" } }).success).toBe(
      false,
    );
  });
});
