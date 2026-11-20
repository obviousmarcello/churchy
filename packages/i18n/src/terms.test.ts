import { describe, expect, it } from "vitest";
import { article } from "@churchy/hu";
import type { TermForms } from "@churchy/contracts";
import { effectiveConfig } from "@churchy/presets";
import {
  MissingTermError,
  escapeIcu,
  interpolateTerms,
  resolveCatalogTerms,
  resolveTerms,
  presetTermSource,
  termPlaceholders,
  termsFromConfig,
  termsFromMap,
  withTerms,
} from "./index";

const terms = (denomination: "rk" | "ref" | "bapt", overrides?: Record<string, TermForms>) =>
  resolveTerms({ source: presetTermSource, denomination, overrides });

describe("t.term() with the real presets (@churchy/presets)", () => {
  // [nom, lower, slug, plural, article] — PRD §5.2, as built by @churchy/presets.
  const expected = {
    rk: {
      service: ["Szentmise", "szentmise", "szentmise", "szentmisék", "a"],
      serviceSchedule: ["Miserend", "miserend", "miserend", undefined, "a"],
      leadClergy: ["Plébános", "plébános", "plebanos", "plébánosok", "a"],
      community: ["Plébánia", "plébánia", "plebania", "plébániák", "a"],
    },
    ref: {
      service: ["Istentisztelet", "istentisztelet", "istentisztelet", "istentiszteletek", "az"],
      serviceSchedule: [
        "Istentiszteleti rend",
        "istentiszteleti rend",
        "istentiszteleti-rend",
        undefined,
        "az",
      ],
      leadClergy: ["Lelkipásztor", "lelkipásztor", "lelkipasztor", "lelkipásztorok", "a"],
      community: ["Egyházközség", "egyházközség", "egyhazkozseg", "egyházközségek", "az"],
    },
    bapt: {
      service: ["Istentisztelet", "istentisztelet", "istentisztelet", "istentiszteletek", "az"],
      serviceSchedule: ["Alkalmaink", "alkalmaink", "alkalmaink", undefined, "az"],
      leadClergy: ["Lelkipásztor", "lelkipásztor", "lelkipasztor", "lelkipásztorok", "a"],
      community: ["Gyülekezet", "gyülekezet", "gyulekezet", "gyülekezetek", "a"],
    },
  } as const;

  for (const [denomination, byKey] of Object.entries(expected)) {
    for (const [key, [nom, lower, slug, plural, art]] of Object.entries(byKey)) {
      it(`${denomination}.${key}`, () => {
        const t = terms(denomination as "rk");
        const forms = t.term(key);
        expect(forms.nom).toBe(nom);
        expect(forms.lower).toBe(lower);
        expect(forms.slug).toBe(slug);
        expect(forms.plural).toBe(plural);
        expect(forms.article).toBe(art);
      });
    }
  }

  it("a Reformed church has no szentmise", () => {
    const t = terms("ref");
    const all = JSON.stringify(
      ["service", "serviceSchedule", "leadClergy", "community"].map(t.term),
    );
    expect(all.toLowerCase()).not.toContain("mise");
    expect(all.toLowerCase()).not.toContain("plébán");
  });

  it("preset articles agree with the Hungarian article rule of @churchy/hu", () => {
    for (const denomination of ["rk", "ref", "bapt"] as const) {
      const t = terms(denomination);
      for (const key of ["service", "serviceSchedule", "leadClergy", "community"]) {
        const forms = t.term(key);
        expect(forms.article, `${denomination}.${key}`).toBe(article(forms.lower));
      }
    }
  });

  it("slugs are URL-safe (no diacritics)", () => {
    for (const denomination of ["rk", "ref", "bapt"] as const) {
      for (const key of ["service", "serviceSchedule", "leadClergy", "community"]) {
        expect(terms(denomination).term(key).slug).toMatch(/^[a-z0-9-]+$/);
      }
    }
  });
});

describe("resolveTerms", () => {
  it("merges tenant overrides over the preset, per key", () => {
    const override: TermForms = {
      nom: "Szentmise-rend",
      lower: "szentmise-rend",
      slug: "szentmise-rend",
      article: "a",
    };
    const t = terms("rk", { serviceSchedule: override });
    expect(t.term("serviceSchedule")).toEqual(override);
    expect(t.term("service").nom).toBe("Szentmise");
    expect(t.has("serviceSchedule")).toBe(true);
    expect(t.has("nope")).toBe(false);
  });

  it("form() returns one form and throws for a missing one", () => {
    const t = terms("bapt");
    expect(t.form("service", "plural")).toBe("istentiszteletek");
    expect(() => t.form("serviceSchedule", "plural")).toThrow(MissingTermError);
  });

  it("throws MissingTermError for an unknown key, including prototype keys", () => {
    const t = terms("rk");
    expect(() => t.term("unknown")).toThrow(MissingTermError);
    expect(() => t.term("constructor")).toThrow(MissingTermError);
    expect(() => t.term("unknown")).toThrow('Missing term "unknown"');
  });

  it("works with a source that knows no denomination (overrides only)", () => {
    const t = resolveTerms({ source: { termsFor: () => undefined }, denomination: "gk" });
    expect(t.has("service")).toBe(false);
  });

  it("covers the section and page terms of the presets too", () => {
    const t = terms("rk");
    expect(t.term("ritesSection").nom).toBe("Szentségek");
    expect(t.term("ritesSection").slug).toBe("szentsegek");
    expect(terms("ref").term("ritesSection").slug).not.toBe("szentsegek");
    expect(t.term("announcementsSection").nom).toBeTruthy();
  });

  it("termsFromConfig() wraps an effective config", () => {
    const config = effectiveConfig({ name: "Minta", denomination: "ref" });
    const t = termsFromConfig(config);
    expect(t.denomination).toBe("ref");
    expect(t.term("serviceSchedule").nom).toBe("Istentiszteleti rend");
  });

  it("fingerprint changes with the effective terminology", () => {
    expect(terms("rk").fingerprint).not.toBe(terms("ref").fingerprint);
    expect(terms("rk").fingerprint).toBe(terms("rk").fingerprint);
  });
});

describe("serialisation", () => {
  it("all() round-trips through termsFromMap", () => {
    const original = terms("ref");
    const json = JSON.parse(JSON.stringify(original.all()));
    const copy = termsFromMap("ref", json);
    expect(copy.term("serviceSchedule")).toEqual(original.term("serviceSchedule"));
    expect(copy.fingerprint).toBe(original.fingerprint);
  });
});

describe("message placeholders", () => {
  it("interpolates term forms into a message", () => {
    expect(interpolateTerms("Következő {service.plural}", terms("rk"))).toBe(
      "Következő szentmisék",
    );
    expect(interpolateTerms("Következő {service.plural}", terms("ref"))).toBe(
      "Következő istentiszteletek",
    );
    expect(
      interpolateTerms("{serviceSchedule.article} {serviceSchedule.lower}", terms("ref")),
    ).toBe("az istentiszteleti rend");
  });

  it("leaves other ICU placeholders alone", () => {
    expect(interpolateTerms("{count} {service.lower}, {name}", terms("rk"))).toBe(
      "{count} szentmise, {name}",
    );
  });

  it("escapes ICU syntax in substituted values", () => {
    const t = terms("rk", {
      service: { nom: "A'B", lower: "a{b}c", slug: "x", plural: "<i>", article: "a" },
    });
    expect(interpolateTerms("{service.nom}|{service.lower}|{service.plural}", t)).toBe(
      "A''B|a'{'b'}'c|'<'i'>'",
    );
    expect(escapeIcu("plain")).toBe("plain");
  });

  it("lists placeholders and fails on unknown terms", () => {
    expect(termPlaceholders("{a.nom} és {b.plural}, {c}")).toEqual([
      ["a", "nom"],
      ["b", "plural"],
    ]);
    expect(() => interpolateTerms("{missing.nom}", terms("rk"))).toThrow(MissingTermError);
  });

  it("resolves a whole catalog without mutating it", () => {
    const catalog = {
      home: { next: "Következő {service.plural}", other: "Más" },
      top: "{community.nom}",
    };
    const out = resolveCatalogTerms(catalog, terms("bapt"));
    expect(out).toEqual({
      home: { next: "Következő istentiszteletek", other: "Más" },
      top: "Gyülekezet",
    });
    expect(catalog.home.next).toBe("Következő {service.plural}");
  });
});

describe("withTerms", () => {
  it("adds .term() and keeps the translator's own members", () => {
    const base = Object.assign((key: string) => `t:${key}`, { raw: (key: string) => `raw:${key}` });
    const t = withTerms(base, terms("ref"));
    expect(t("a")).toBe("t:a");
    expect(t.raw("a")).toBe("raw:a");
    expect(t.term("serviceSchedule").nom).toBe("Istentiszteleti rend");
  });
});
