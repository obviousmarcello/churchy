import { describe, expect, it } from "vitest";
import {
  PlanTemplateSchema,
  SlugSchema,
  TermFormsSchema,
  type Denomination,
  type TermForms,
} from "@churchy/contracts";
import { LITURGICAL_FAMILIES } from "@churchy/calendar";
import { article, slugify } from "@churchy/hu";
import { effectiveConfig } from "./config";
import { PLATFORM_SECTION_TERMS } from "./defaults";
import { forms } from "./forms";
import {
  DENOMINATIONS,
  PRESETS,
  getPreset,
  isBeta,
  presetPlanTemplates,
  presetsAwaitingSignOff,
} from "./presets";
import { gk } from "./data/catholic";
import { PresetSchema, TERM_KEYS } from "./schema";
import { findSlugConflicts } from "./validate";

const all = DENOMINATIONS.map((d) => [d, PRESETS[d]] as const);

function expectWellFormed(f: TermForms, where: string) {
  expect(TermFormsSchema.safeParse(f).success, where).toBe(true);
  expect(f.nom.length, where).toBeGreaterThan(0);
  expect(f.lower.length, where).toBeGreaterThan(0);
  expect(SlugSchema.safeParse(f.slug).success, `${where}: slug ${f.slug}`).toBe(true);
  expect(f.slug, `${where}: slug is diacritic-free ASCII`).toMatch(/^[a-z0-9-]+$/);
  expect(f.article, `${where}: article`).toBe(article(f.nom));
  expect(article(f.lower), `${where}: lower form takes the same article`).toBe(f.article);
}

describe("preset registry", () => {
  it("defines exactly the 7 denominations of PRD §5.1, in order", () => {
    expect(DENOMINATIONS).toEqual(["rk", "gk", "ref", "ev", "bapt", "unit", "general"]);
    expect(Object.keys(PRESETS)).toEqual(DENOMINATIONS);
    for (const [d, p] of all) {
      expect(p.key).toBe(d);
      expect(getPreset(d)).toBe(p);
    }
  });

  it.each(all)("%s validates against PresetSchema", (_d, p) => {
    expect(PresetSchema.parse(p)).toEqual(p);
  });

  it("names the presets as in PRD §5.1", () => {
    expect(DENOMINATIONS.map((d) => PRESETS[d].name)).toEqual([
      "Római katolikus",
      "Görögkatolikus",
      "Református",
      "Evangélikus",
      "Baptista / szabadegyházi",
      "Unitárius",
      "Általános keresztény",
    ]);
  });
});

describe("review status (D-23 AC4)", () => {
  it("flags gk, unit and general as beta", () => {
    expect(DENOMINATIONS.filter(isBeta)).toEqual(["gk", "unit", "general"]);
  });

  it("keeps the pilot denominations pending until the clergy sign off", () => {
    expect(presetsAwaitingSignOff()).toEqual(["rk", "ref", "ev", "bapt"]);
    for (const d of presetsAwaitingSignOff()) expect(PRESETS[d].signOff).toBeNull();
  });

  it("requires a sign-off exactly for reviewed presets", () => {
    expect(PresetSchema.safeParse({ ...gk, reviewStatus: "reviewed" }).success).toBe(false);
    expect(
      PresetSchema.safeParse({
        ...gk,
        reviewStatus: "reviewed",
        signOff: { reviewer: "Pilot parish priest", date: "2026-12-01" },
      }).success,
    ).toBe(true);
    expect(
      PresetSchema.safeParse({
        ...gk,
        signOff: { reviewer: "Pilot parish priest", date: "2026-12-01" },
      }).success,
    ).toBe(false);
  });
});

describe("calendar family", () => {
  it("maps rk and gk to catholic, everything else to protestant (calendar README)", () => {
    const families = Object.fromEntries(all.map(([d, p]) => [d, p.calendarFamily]));
    expect(families).toEqual({
      rk: "catholic",
      gk: "catholic",
      ref: "protestant",
      ev: "protestant",
      bapt: "protestant",
      unit: "protestant",
      general: "protestant",
    });
    for (const [, p] of all) expect(LITURGICAL_FAMILIES).toContain(p.calendarFamily);
  });
});

describe.each(all)("%s terminology", (d, p) => {
  const config = effectiveConfig({ name: "Teszt", denomination: d });

  it("defines every term key with nom/lower/slug/article and the a/az of @churchy/hu", () => {
    for (const key of TERM_KEYS) expectWellFormed(config.terminology[key], `${d}.${key}`);
  });

  it("has unique slugs across all terms", () => {
    expect(findSlugConflicts(config.terminology)).toEqual({});
  });

  it("well-formed rites, service types and rota positions with unique slugs", () => {
    for (const list of [p.rites.map((r) => r.forms), p.serviceTypes.map((s) => s.forms)]) {
      list.forEach((f, i) => expectWellFormed(f, `${d}[${i}] ${f.nom}`));
      expect(new Set(list.map((f) => f.slug)).size).toBe(list.length);
    }
    p.rotaPositions.forEach((f) => expectWellFormed(f, `${d} rota ${f.nom}`));
    expect(new Set(p.rotaPositions.map((f) => f.slug)).size).toBe(p.rotaPositions.length);
  });

  it("generates slugs with slugify() unless a short slug is intended", () => {
    for (const key of TERM_KEYS) {
      const f = config.terminology[key];
      if (key === "livestreamSection") expect(f.slug).toBe("elo");
      else expect(f.slug).toBe(slugify(f.nom));
    }
  });

  it("has a unique reference prefix per rite", () => {
    expect(new Set(p.rites.map((r) => r.referencePrefix)).size).toBe(p.rites.length);
  });
});

describe("denominational vocabulary never leaks", () => {
  const text = (d: Denomination) => JSON.stringify(effectiveConfig({ name: "X", denomination: d }));

  it.each(["ref", "ev", "bapt", "unit", "general"] as const)(
    "%s never mentions mise, plébánia or szentség",
    (d) => {
      expect(text(d)).not.toMatch(/mise|plébáni|plebani|szentség|szentseg|homíli/i);
    },
  );

  it.each(["rk", "gk"] as const)("%s never mentions presbitérium or istentisztelet", (d) => {
    expect(text(d)).not.toMatch(/presbit|istentisztelet|igehirdetés|lelkész/i);
  });
});

describe("service types and plan templates (FR-802)", () => {
  it.each(all)("%s has ≥ 2 plan templates, one per main service type", (d, p) => {
    expect(p.planTemplates.length).toBeGreaterThanOrEqual(2);
    const templated = p.planTemplates.map((t) => t.serviceType);
    expect(new Set(templated).size).toBe(templated.length);
    for (const s of p.serviceTypes.filter((s) => s.main)) expect(templated).toContain(s.key);
    for (const t of presetPlanTemplates(d)) {
      expect(PlanTemplateSchema.parse(t)).toEqual(t);
      expect(t.id).toBe(`preset-${d}-${t.serviceType}`);
      expect(t.tenantId).toBeNull();
      expect(t.denomination).toBe(d);
    }
  });

  const titles = (d: Denomination, serviceType: string) =>
    PRESETS[d].planTemplates.find((t) => t.serviceType === serviceType)?.items.map((i) => i.title);

  it("encodes the FR-802 examples verbatim", () => {
    expect(titles("rk", "szentmise")).toEqual([
      "Bevonulás",
      "Kyrie",
      "Glória",
      "Válaszos zsoltár",
      "Alleluja",
      "Felajánlás",
      "Sanctus",
      "Agnus Dei",
      "Áldozás",
      "Kivonulás",
    ]);
    expect(titles("ref", "istentisztelet")).toEqual([
      "Fennálló ének",
      "Lekció",
      "Igehirdetés előtti ének",
      "Igehirdetés",
      "Igehirdetés utáni ének",
      "Áldás",
    ]);
    expect(titles("bapt", "istentisztelet")).toEqual([
      "Dicsőítés blokk",
      "Igehirdetés",
      "Válaszének",
    ]);
  });

  it("rejects a template for an unknown service type and a main type without template", () => {
    const broken = { ...gk, planTemplates: [...gk.planTemplates.slice(0, 1)] };
    broken.planTemplates.push({ serviceType: "nincs-ilyen", name: "X", items: [] });
    const issues = PresetSchema.safeParse(broken).error?.issues.map((i) => i.message) ?? [];
    expect(issues.some((m) => m.includes("nincs-ilyen"))).toBe(true);
    expect(issues.some((m) => m.includes('"vecsernye" has no plan template'))).toBe(true);
  });

  it("rejects rites and service types whose key differs from the slug", () => {
    const rites = [{ key: "mas", forms: forms("Keresztelő"), referencePrefix: "KER" }];
    const serviceTypes = [{ ...gk.serviceTypes[0]!, key: "mas" }];
    const result = PresetSchema.safeParse({ ...gk, rites, serviceTypes });
    const paths = result.error?.issues.map((i) => i.path.join(".")) ?? [];
    expect(paths).toContain("rites.0.key");
    expect(paths).toContain("serviceTypes.0.key");
  });
});

describe("platform section terms", () => {
  it("follow the SDD §6 URL map", () => {
    const slugs = Object.fromEntries(
      Object.entries(PLATFORM_SECTION_TERMS).map(([k, f]) => [k, f.slug]),
    );
    expect(slugs).toMatchObject({
      announcementsSection: "hirdetesek",
      newsSection: "hirek",
      eventsSection: "esemenyek",
      locationsSection: "templomaink",
      staffSection: "munkatarsaink",
      groupsSection: "kozossegeink",
      livestreamSection: "elo",
      gallerySection: "galeria",
      documentsSection: "dokumentumok",
      givingSection: "tamogatas",
      contactPage: "kapcsolat",
    });
  });

  it("rk uses /miserend, /szentsegek and /homiliak; ref uses /alkalmak", () => {
    const rk = effectiveConfig({ name: "X", denomination: "rk" }).terminology;
    const ref = effectiveConfig({ name: "X", denomination: "ref" }).terminology;
    expect([rk.serviceSchedule.slug, rk.ritesSection.slug, rk.sermonsSection.slug]).toEqual([
      "miserend",
      "szentsegek",
      "homiliak",
    ]);
    expect([ref.serviceSchedule.slug, ref.ritesSection.slug, ref.sermonsSection.slug]).toEqual([
      "istentiszteleti-rend",
      "alkalmak",
      "igehirdetesek",
    ]);
  });
});

describe("forms()", () => {
  it("derives lower, slug and article and keeps explicit values", () => {
    expect(forms("Istentiszteleti rend")).toEqual({
      nom: "Istentiszteleti rend",
      lower: "istentiszteleti rend",
      slug: "istentiszteleti-rend",
      article: "az",
    });
    expect(forms("Szent Liturgia", { lower: "Szent Liturgia", plural: "Szent Liturgiák" })).toEqual(
      {
        nom: "Szent Liturgia",
        lower: "Szent Liturgia",
        slug: "szent-liturgia",
        plural: "Szent Liturgiák",
        article: "a",
      },
    );
  });
});
