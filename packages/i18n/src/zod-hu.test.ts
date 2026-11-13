import { describe, expect, it } from "vitest";
import { z } from "zod";
import { configureZodHungarian, huZodErrorMap, huZodLocale } from "./index";

const messages = (schema: z.ZodType, input: unknown): string[] => {
  const r = schema.safeParse(input, { error: huZodErrorMap });
  return r.success ? [] : r.error.issues.map((i) => i.message);
};

describe("Hungarian Zod error map", () => {
  it("required fields", () => {
    expect(messages(z.string(), undefined)).toEqual(["Ez a mező kötelező."]);
    expect(messages(z.string(), null)).toEqual(["Ez a mező kötelező."]);
    expect(messages(z.string().min(1), "")).toEqual(["Ez a mező kötelező."]);
  });

  it("wrong types", () => {
    expect(messages(z.string(), 5)).toEqual(["Kérjük, szöveget adjon meg."]);
    expect(messages(z.number(), "x")).toEqual(["Kérjük, számot adjon meg."]);
    expect(messages(z.boolean(), "x")).toEqual(["Kérjük, igen vagy nem értéket adjon meg."]);
    expect(messages(z.array(z.string()), "x")).toEqual([
      "Kérjük, válasszon ki legalább egy elemet.",
    ]);
    expect(messages(z.date(), "x")).toEqual(["Kérjük, érvényes dátumot adjon meg."]);
    expect(messages(z.object({}), "x")).toEqual(["A megadott érték érvénytelen."]);
  });

  it("string length", () => {
    expect(messages(z.string().min(3), "ab")).toEqual(["Legalább 3 karakter szükséges."]);
    expect(messages(z.string().max(2), "abc")).toEqual(["Legfeljebb 2 karakter adható meg."]);
    expect(messages(z.string().length(4), "abc")).toEqual(["Pontosan 4 karakter szükséges."]);
    expect(messages(z.string().length(2), "abc")).toEqual(["Pontosan 2 karakter szükséges."]);
  });

  it("number ranges use Hungarian number formatting", () => {
    expect(messages(z.number().min(5), 1)).toEqual(["Az érték nem lehet kisebb, mint 5."]);
    expect(messages(z.number().gt(5), 5)).toEqual(["Az értéknek nagyobbnak kell lennie, mint 5."]);
    expect(messages(z.number().max(2.5), 3)).toEqual(["Az érték nem lehet nagyobb, mint 2,5."]);
    expect(messages(z.number().lt(2), 2)).toEqual(["Az értéknek kisebbnek kell lennie, mint 2."]);
    expect(messages(z.number().multipleOf(5), 7)).toEqual(["Az érték nem osztható ezzel: 5."]);
  });

  it("arrays", () => {
    expect(messages(z.array(z.string()).min(1), [])).toEqual([
      "Kérjük, válasszon ki legalább egy elemet.",
    ]);
    expect(messages(z.array(z.string()).min(2), ["a"])).toEqual(["Legalább 2 elem szükséges."]);
    expect(messages(z.array(z.string()).max(1), ["a", "b"])).toEqual([
      "Legfeljebb 1 elem adható meg.",
    ]);
  });

  it("dates are shown in Hungarian format", () => {
    const min = new Date("2026-11-12T12:00:00Z");
    expect(messages(z.date().min(min), new Date("2020-01-01"))).toEqual([
      "A dátum nem lehet korábbi, mint 2026. november 12., csütörtök.",
    ]);
    expect(messages(z.date().max(min), new Date("2030-01-01"))).toEqual([
      "A dátum nem lehet későbbi, mint 2026. november 12., csütörtök.",
    ]);
  });

  it("string formats", () => {
    expect(messages(z.email(), "nem-email")).toEqual(["Adjon meg érvényes e-mail-címet."]);
    expect(messages(z.url(), "nem url")).toEqual(["Adjon meg érvényes webcímet."]);
    expect(messages(z.uuid(), "x")).toEqual(["A megadott azonosító formátuma nem megfelelő."]);
    expect(messages(z.string().regex(/^\d+$/), "x")).toEqual([
      "A megadott érték formátuma nem megfelelő.",
    ]);
    expect(messages(z.string().startsWith("ab"), "x")).toEqual([
      "A szövegnek ezzel kell kezdődnie: „ab”.",
    ]);
    expect(messages(z.string().endsWith("yz"), "x")).toEqual([
      "A szövegnek ezzel kell végződnie: „yz”.",
    ]);
    expect(messages(z.string().includes("mm"), "x")).toEqual([
      "A szövegnek tartalmaznia kell ezt: „mm”.",
    ]);
    expect(messages(z.iso.date(), "x")).toEqual(["Adjon meg érvényes dátumot."]);
    expect(messages(z.iso.time(), "x")).toEqual(["Adjon meg érvényes időpontot."]);
  });

  it("enums, literals, unions, unknown keys", () => {
    expect(messages(z.enum(["a", "b"]), "c")).toEqual([
      "Kérjük, válasszon a felkínált lehetőségek közül.",
    ]);
    expect(messages(z.literal("a"), "c")).toEqual(["A megadott érték nem fogadható el."]);
    expect(messages(z.union([z.string(), z.number()]), true)).toEqual([
      "A megadott érték érvénytelen.",
    ]);
    expect(messages(z.strictObject({ a: z.string() }), { a: "x", b: 1 })).toEqual([
      "Ismeretlen mező: b.",
    ]);
    expect(messages(z.strictObject({}), { b: 1, c: 2 })).toEqual(["Ismeretlen mezők: b, c."]);
  });

  it("custom schema messages win over the map", () => {
    expect(messages(z.string().min(1, "Adja meg a nevét."), "")).toEqual(["Adja meg a nevét."]);
    expect(
      messages(
        z.string().refine(() => false),
        "x",
      ),
    ).toEqual(["A megadott érték érvénytelen."]);
  });

  it("no English leaks into any default message", () => {
    const out = [
      ...messages(z.string(), undefined),
      ...messages(z.email(), "x"),
      ...messages(z.number().min(3), 1),
    ].join(" ");
    expect(out).not.toMatch(/\b(Invalid|Too|expected|received|String|Number)\b/);
  });
});

describe("global configuration", () => {
  it("configureZodHungarian() makes Hungarian the default", () => {
    expect(huZodLocale().localeError).toBe(huZodErrorMap);
    const before = z.string().safeParse(undefined);
    expect(before.success).toBe(false);
    configureZodHungarian();
    const after = z.string().safeParse(undefined);
    expect(after.success ? [] : after.error.issues.map((i) => i.message)).toEqual([
      "Ez a mező kötelező.",
    ]);
    z.config(z.locales.en());
  });
});
