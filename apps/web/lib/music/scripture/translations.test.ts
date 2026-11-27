import { describe, expect, it } from "vitest";

import {
  KAROLI,
  type ScriptureTranslation,
  defaultTranslationFor,
  enabledTranslations,
  fullTextTranslations,
  resolveTranslation,
  scriptureTranslation,
} from "./translations";

const own = (id: string, source: "pasted" | "database"): ScriptureTranslation => ({
  id,
  language: "hu",
  name: `Fordítás ${id}`,
  shortName: id,
  notice: "Saját engedéllyel.",
  deuterocanon: false,
  source,
});
const pasted = own("proba", "pasted");
const stored = own("tarolt", "database");
const config = (karoli: boolean, list: ScriptureTranslation[]) => ({ karoli, own: list });
const ids = (list: ScriptureTranslation[]) => list.map(({ id }) => id);

describe("enabledTranslations", () => {
  it("lists Károli first, then the church's own translations", () => {
    expect(ids(enabledTranslations(config(true, [pasted, stored])))).toEqual([
      "karoli1908",
      "proba",
      "tarolt",
    ]);
    expect(ids(enabledTranslations(config(false, [pasted])))).toEqual(["proba"]);
    expect(enabledTranslations(config(false, []))).toEqual([]);
  });

  it("returns the same list for the same configuration", () => {
    const list = [pasted];
    expect(enabledTranslations(config(true, list))).toBe(enabledTranslations(config(true, list)));
  });
});

describe("fullTextTranslations", () => {
  it("leaves out the pasted ones", () => {
    expect(ids(fullTextTranslations(enabledTranslations(config(true, [pasted, stored]))))).toEqual([
      "karoli1908",
      "tarolt",
    ]);
  });
});

describe("resolveTranslation", () => {
  it("takes the own translation when it is on, else the first one in its language", () => {
    const enabled = enabledTranslations(config(true, [pasted]));
    expect(resolveTranslation("proba", enabled)?.id).toBe("proba");
    expect(resolveTranslation("megszunt", enabled)?.id).toBe("karoli1908");
    expect(resolveTranslation("proba", enabledTranslations(config(false, [])))).toBeNull();
  });
});

describe("scriptureTranslation and defaultTranslationFor", () => {
  it("names a translation of the church, else Károli", () => {
    expect(scriptureTranslation("proba", [pasted])).toBe(pasted);
    expect(scriptureTranslation("proba")).toBe(KAROLI);
    expect(scriptureTranslation(null)).toBe(KAROLI);
  });

  it("defaults to the first translation in the language", () => {
    expect(defaultTranslationFor("hu", enabledTranslations(config(false, [stored])))).toBe(
      "tarolt",
    );
    expect(defaultTranslationFor("hu", enabledTranslations(config(true, [])))).toBe("karoli1908");
    expect(defaultTranslationFor("hu", [])).toBeNull();
  });
});
