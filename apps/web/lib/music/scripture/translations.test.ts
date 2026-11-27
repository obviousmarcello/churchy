import { describe, expect, it } from "vitest";

import {
  defaultTranslationFor,
  enabledTranslations,
  fullTextTranslations,
  resolveTranslation,
  scriptureTranslation,
} from "./translations";

const ids = (list: { id: string }[]) => list.map(({ id }) => id);

describe("Bible translation settings", () => {
  it("gives RÚF the source of its mode", () => {
    expect(
      enabledTranslations({ karoli: true, ruf: "pasted" }).map(({ id, source }) => [id, source]),
    ).toEqual([
      ["karoli1908", "files"],
      ["ruf2014", "pasted"],
    ]);
    expect(
      enabledTranslations({ karoli: true, ruf: "permit" }).map(({ id, source }) => [id, source]),
    ).toEqual([
      ["karoli1908", "files"],
      ["ruf2014", "database"],
    ]);
    expect(ids(enabledTranslations({ karoli: false, ruf: "off" }))).toEqual([]);
    // The catalog keeps its own entry.
    expect(scriptureTranslation("ruf2014").source).toBe("pasted");
  });

  it("keeps the same lists for the same settings", () => {
    const list = enabledTranslations({ karoli: true, ruf: "permit" });
    expect(enabledTranslations({ karoli: true, ruf: "permit" })).toBe(list);
    expect(fullTextTranslations(list)).toBe(fullTextTranslations(list));
  });

  it("gives the Bible panel only the translations with their full text", () => {
    expect(ids(fullTextTranslations(enabledTranslations({ karoli: true, ruf: "pasted" })))).toEqual(
      ["karoli1908"],
    );
    expect(
      ids(fullTextTranslations(enabledTranslations({ karoli: false, ruf: "permit" }))),
    ).toEqual(["ruf2014"]);
    expect(
      ids(fullTextTranslations(enabledTranslations({ karoli: false, ruf: "pasted" }))),
    ).toEqual([]);
  });

  it("replaces a translation that is off", () => {
    const rufOnly = enabledTranslations({ karoli: false, ruf: "pasted" });
    expect(resolveTranslation("karoli1908", rufOnly)?.id).toBe("ruf2014");
    expect(resolveTranslation(null, rufOnly)?.id).toBe("ruf2014");
    expect(
      resolveTranslation("ruf2014", enabledTranslations({ karoli: true, ruf: "off" }))?.id,
    ).toBe("karoli1908");
    expect(
      resolveTranslation("ruf2014", enabledTranslations({ karoli: false, ruf: "off" })),
    ).toBeNull();
  });

  it("starts a new reading in a translation that is on", () => {
    expect(defaultTranslationFor("hu", enabledTranslations({ karoli: false, ruf: "permit" }))).toBe(
      "ruf2014",
    );
    expect(defaultTranslationFor("en", enabledTranslations({ karoli: true, ruf: "off" }))).toBe(
      "karoli1908",
    );
    expect(
      defaultTranslationFor("hu", enabledTranslations({ karoli: false, ruf: "off" })),
    ).toBeNull();
  });
});
