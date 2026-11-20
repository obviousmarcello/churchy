/**
 * Structure and syntax checks for messages/hu.json (PRD L-01): namespaces, ICU syntax, terms.
 */
import { readFileSync } from "node:fs";
import { IntlMessageFormat } from "intl-messageformat";
import { describe, expect, it } from "vitest";
import {
  resolveCatalogTerms,
  resolveTerms,
  presetTermSource,
  termPlaceholders,
  type MessageTree,
} from "./index";

const catalog = JSON.parse(
  readFileSync(new URL("../../../messages/hu.json", import.meta.url), "utf8"),
) as MessageTree;

const NAMESPACES = ["common", "public", "admin", "munkater", "portal", "dev", "email"];

function leaves(node: MessageTree, prefix = ""): Array<[string, unknown]> {
  return Object.entries(node).flatMap(([k, v]) =>
    typeof v === "object" && v !== null && !Array.isArray(v)
      ? leaves(v, `${prefix}${k}.`)
      : [[`${prefix}${k}`, v] as [string, unknown]],
  );
}

const all = leaves(catalog);

describe("messages/hu.json", () => {
  it("has only the agreed top-level namespaces", () => {
    expect(Object.keys(catalog).sort()).toEqual([...NAMESPACES].sort());
  });

  it("contains only non-empty strings", () => {
    expect(all.length).toBeGreaterThan(100);
    for (const [key, value] of all) {
      expect(typeof value, key).toBe("string");
      expect((value as string).trim(), key).not.toBe("");
    }
  });

  it("uses the formal address (no informal forms)", () => {
    for (const [key, value] of all) {
      expect(value as string, key).not.toMatch(/\b(te|neked|téged|kérlek|add meg|kattints)\b/i);
    }
  });

  it("references only terms and forms that every demo denomination provides", () => {
    for (const denomination of ["rk", "ref", "bapt"] as const) {
      const terms = resolveTerms({ source: presetTermSource, denomination });
      for (const [key, value] of all) {
        for (const [term, form] of termPlaceholders(value as string)) {
          expect(() => terms.form(term, form), `${denomination} ${key}`).not.toThrow();
        }
      }
    }
  });

  it("is valid ICU MessageFormat once terms are resolved, for every denomination", () => {
    for (const denomination of ["rk", "ref", "bapt"] as const) {
      const terms = resolveTerms({ source: presetTermSource, denomination });
      const resolved = leaves(resolveCatalogTerms(catalog, terms));
      for (const [key, value] of resolved) {
        expect(
          () => new IntlMessageFormat(value as string, "hu"),
          `${denomination} ${key}`,
        ).not.toThrow();
      }
    }
  });

  it("term-driven messages differ per denomination", () => {
    const render = (denomination: "rk" | "ref" | "bapt") => {
      const resolved = resolveCatalogTerms(
        catalog,
        resolveTerms({ source: presetTermSource, denomination }),
      ) as { public: { home: { nextServices: string; welcome: string } } };
      return resolved.public.home;
    };
    expect(render("rk").nextServices).toBe("Következő szentmisék");
    expect(render("ref").nextServices).toBe("Következő istentiszteletek");
    expect(render("rk").welcome).toBe("Üdvözöljük a plébánia oldalán!");
    expect(render("ref").welcome).toBe("Üdvözöljük az egyházközség oldalán!");
    expect(render("bapt").welcome).toBe("Üdvözöljük a gyülekezet oldalán!");
  });
});
