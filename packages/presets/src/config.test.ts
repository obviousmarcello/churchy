import { describe, expect, it } from "vitest";
import { SiteConfigSchema, type SiteConfigOverridesInput } from "@churchy/contracts";
import { buildNavigation, effectiveConfig, term } from "./config";
import { PLATFORM_DEFAULTS } from "./defaults";
import { forms } from "./forms";
import { deepMerge } from "./merge";
import { DENOMINATIONS, PRESETS } from "./presets";

describe("deepMerge", () => {
  type Cfg = { a: number; b: { c: string; d: string; e?: { f: number } }; list: number[] };
  const platform: Cfg = { a: 1, b: { c: "platform", d: "platform" }, list: [1, 2, 3] };

  it("later layers win: platform < preset < tenant", () => {
    const merged = deepMerge(platform, { b: { c: "preset", d: "preset" } }, { b: { d: "tenant" } });
    expect(merged).toEqual({ a: 1, b: { c: "preset", d: "tenant" }, list: [1, 2, 3] });
  });

  it("removing an override restores the preset value", () => {
    const preset = { b: { c: "preset" } };
    expect(deepMerge(platform, preset, { b: { c: "tenant" } }).b.c).toBe("tenant");
    expect(deepMerge(platform, preset, { b: {} }).b.c).toBe("preset");
    expect(deepMerge(platform, preset, { b: { c: undefined } }).b.c).toBe("preset");
    expect(deepMerge(platform, preset, {}).b.c).toBe("preset");
    expect(deepMerge(platform, preset, undefined).b.c).toBe("preset");
  });

  it("replaces arrays and scalars instead of merging them; keeps null", () => {
    expect(deepMerge(platform, { list: [9] }).list).toEqual([9]);
    expect(deepMerge(platform, { a: 5 }).a).toBe(5);
    const withNull = deepMerge<{ x: string | null }>({ x: "y" }, { x: null });
    expect(withNull.x).toBeNull();
  });

  it("adds nested keys missing from lower layers", () => {
    expect(deepMerge(platform, { b: { e: { f: 7 } } }).b.e).toEqual({ f: 7 });
  });

  it("never mutates or aliases its inputs", () => {
    const preset = { b: { c: "preset" }, list: [4] };
    const snapshot = structuredClone({ platform, preset });
    const merged = deepMerge(platform, preset);
    merged.b.c = "changed";
    merged.list.push(5);
    expect({ platform, preset }).toEqual(snapshot);
  });
});

describe("effectiveConfig", () => {
  it.each(DENOMINATIONS)("%s yields a valid SiteConfig with no overrides", (denomination) => {
    const config = effectiveConfig({ name: "Teszt Egyház", denomination });
    expect(SiteConfigSchema.parse(config)).toBeTruthy();
    expect(config.denomination).toBe(denomination);
    expect(config.identity).toEqual({ name: "Teszt Egyház", shortName: "Teszt Egyház" });
    expect(config.terminology.community).toEqual(PRESETS[denomination].terminology.community);
    expect(config.calendarFamily).toBe(PRESETS[denomination].calendarFamily);
    expect(config.preset.reviewStatus).toBe(PRESETS[denomination].reviewStatus);
    expect(config.planTemplates.length).toBe(PRESETS[denomination].planTemplates.length);
  });

  it("takes platform defaults where neither preset nor tenant says anything", () => {
    const config = effectiveConfig({ name: "X", denomination: "rk" });
    expect(config.theme).toEqual(PLATFORM_DEFAULTS.theme);
    expect(config.terminology.newsSection.nom).toBe("Hírek");
    expect(config.modules.news).toBe(true);
    expect(config.modules.massIntentions).toBe(true); // preset
    expect(effectiveConfig({ name: "X", denomination: "ref" }).modules.massIntentions).toBe(false);
  });

  it("applies tenant overrides over the preset; removing them restores the preset", () => {
    const overrides: SiteConfigOverridesInput = {
      identity: { shortName: "Belvárosi Plébánia" },
      terminology: { community: forms("Közösség") },
      theme: { themeId: "letisztult" },
      modules: { gallery: false, massIntentions: false },
    };
    const config = effectiveConfig({
      name: "Teszt Főplébánia",
      denomination: "rk",
      siteConfig: overrides,
    });
    expect(config.identity).toEqual({ name: "Teszt Főplébánia", shortName: "Belvárosi Plébánia" });
    expect(term(config, "community").nom).toBe("Közösség");
    expect(term(config, "service").nom).toBe("Szentmise");
    expect(config.theme.themeId).toBe("letisztult");
    expect(config.theme.fontPairing).toBe(PLATFORM_DEFAULTS.theme.fontPairing);
    expect(config.modules.gallery).toBe(false);
    expect(config.modules.massIntentions).toBe(false);

    const restored = effectiveConfig({
      name: "Teszt Főplébánia",
      denomination: "rk",
      siteConfig: { ...overrides, terminology: {}, modules: { gallery: false } },
    });
    expect(term(restored, "community").nom).toBe("Plébánia");
    expect(restored.modules.massIntentions).toBe(true);
  });

  it("validates the stored overrides", () => {
    expect(() =>
      effectiveConfig({
        name: "X",
        denomination: "rk",
        siteConfig: { terminology: { community: { nom: "Közösség" } } } as never,
      }),
    ).toThrow();
  });

  it("uses the tenant row's denomination, not siteConfig.denomination", () => {
    const config = effectiveConfig({
      name: "X",
      denomination: "ref",
      siteConfig: { denomination: "rk" },
    });
    expect(config.denomination).toBe("ref");
    expect(term(config, "service").nom).toBe("Istentisztelet");
  });

  it("builds the SDD §6 default navigation for rk", () => {
    const config = effectiveConfig({ name: "X", denomination: "rk" });
    expect(config.navigation.map((n) => `${n.label} ${n.href}`)).toEqual([
      "Kezdőlap /",
      "Miserend /miserend",
      "Hirdetések /hirdetesek",
      "Események /esemenyek",
      "Szentségek /szentsegek",
      "Rólunk /rolunk",
      "Kapcsolat /kapcsolat",
    ]);
    // sermons are off for rk by default, so Homíliák is not offered
    expect(config.navigation[5]?.children.map((c) => c.href)).toEqual([
      "/munkatarsaink",
      "/templomaink",
      "/kozossegeink",
      "/galeria",
      "/dokumentumok",
    ]);
  });

  it("a term override renames and re-slugs the nav item (FR-102)", () => {
    const config = effectiveConfig({
      name: "X",
      denomination: "rk",
      siteConfig: { terminology: { serviceSchedule: forms("Szertartásrend") } },
    });
    expect(config.navigation[1]).toEqual({
      label: "Szertartásrend",
      href: "/szertartasrend",
      external: false,
      children: [],
    });
  });

  it("module toggles remove nav items and home sections (FR-105)", () => {
    const config = effectiveConfig({
      name: "X",
      denomination: "bapt",
      siteConfig: { modules: { schedule: false, livestream: false, news: false } },
    });
    expect(config.navigation.map((n) => n.href)).not.toContain("/alkalmaink");
    expect(config.navigation.flatMap((n) => n.children.map((c) => c.href))).not.toContain("/elo");
    expect(config.home.map((s) => s.type)).toEqual(["hero", "events", "announcements", "cta"]);
  });

  it("stored navigation and home order replace the preset's", () => {
    const navigation = [{ label: "Főoldal", href: "/", external: false, children: [] }];
    const home = [
      { id: "h1", type: "news" as const, settings: {} },
      { id: "h2", type: "hero" as const, settings: {} },
    ];
    const config = effectiveConfig({
      name: "X",
      denomination: "ev",
      siteConfig: { navigation, home, modules: { news: false } },
    });
    expect(config.navigation).toEqual(navigation);
    expect(config.home.map((s) => s.id)).toEqual(["h2"]);
  });

  it("home order differs by preset", () => {
    const order = (d: (typeof DENOMINATIONS)[number]) =>
      effectiveConfig({ name: "X", denomination: d }).home.map((s) => s.type);
    expect(order("rk")).toEqual(["hero", "nextServices", "announcements", "news", "events", "map"]);
    expect(order("bapt")).toEqual([
      "hero",
      "nextServices",
      "events",
      "news",
      "livestream",
      "announcements",
      "cta",
    ]);
  });

  it("returns fresh objects: mutating a config never changes the preset", () => {
    const a = effectiveConfig({ name: "X", denomination: "rk" });
    a.terminology.community.nom = "Mutált";
    a.rites.pop();
    a.home.pop();
    const b = effectiveConfig({ name: "X", denomination: "rk" });
    expect(b.terminology.community.nom).toBe("Plébánia");
    expect(b.rites).toHaveLength(6);
    expect(b.home).toHaveLength(6);
  });
});

describe("term()", () => {
  it("returns the forms and throws for an unknown key", () => {
    const config = effectiveConfig({ name: "X", denomination: "ref" });
    expect(term(config, "serviceSchedule")).toEqual({
      nom: "Istentiszteleti rend",
      lower: "istentiszteleti rend",
      slug: "istentiszteleti-rend",
      article: "az",
    });
    expect(() => term({ terminology: {} }, "community")).toThrow('Unknown term "community"');
  });
});

describe("buildNavigation", () => {
  it("keeps a parent whose children are all disabled, with its own link", () => {
    const terms = effectiveConfig({ name: "X", denomination: "rk" }).terminology;
    const nav = buildNavigation(
      [{ term: "aboutPage", children: [{ term: "gallerySection", module: "gallery" }] }],
      terms,
      { gallery: false },
    );
    expect(nav).toEqual([{ label: "Rólunk", href: "/rolunk", external: false, children: [] }]);
  });
});
