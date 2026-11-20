import {
  ModuleKeySchema,
  SiteConfigOverridesSchema,
  type Denomination,
  type HomeSection,
  type ModuleKey,
  type NavItem,
  type PlanTemplate,
  type SiteConfig,
  type SiteConfigOverridesInput,
  type TermForms,
} from "@churchy/contracts";
import type { LiturgicalFamily } from "@churchy/calendar";
import { PLATFORM_DEFAULTS, type PlatformDefaults } from "./defaults";
import { deepMerge } from "./merge";
import { getPreset, presetPlanTemplates } from "./presets";
import {
  SECTION_TERM_KEYS,
  TERM_KEYS,
  type NavTemplateItem,
  type ReviewStatus,
  type Rite,
  type ServiceType,
  type TermKey,
} from "./schema";

/** Where a tenant's config comes from: the tenant row (name, denomination) + stored overrides. */
export interface TenantConfigSource {
  name: string;
  denomination: Denomination;
  /** `tenants.site_config` — overrides only (validated with `SiteConfigOverridesSchema`). */
  siteConfig?: SiteConfigOverridesInput;
}

/**
 * The configuration the site renders with: a complete `SiteConfig` plus what the preset brings
 * beyond the stored config (rites, service types, calendar family, plan templates).
 */
export interface EffectiveConfig extends SiteConfig {
  terminology: Record<TermKey, TermForms> & Record<string, TermForms>;
  modules: Record<ModuleKey, boolean>;
  preset: { key: Denomination; name: string; reviewStatus: ReviewStatus };
  calendarFamily: LiturgicalFamily;
  rites: Rite[];
  serviceTypes: ServiceType[];
  rotaPositions: TermForms[];
  planTemplates: PlanTemplate[];
}

/** Modules a home section depends on; the section disappears when the module is off (FR-105). */
const HOME_SECTION_MODULE: Partial<Record<HomeSection["type"], ModuleKey>> = {
  nextServices: "schedule",
  announcements: "announcements",
  news: "news",
  events: "events",
  livestream: "livestream",
};

function navLink(
  link: Omit<NavTemplateItem, "children">,
  terms: Record<string, TermForms>,
): Omit<NavItem, "children"> {
  const t = terms[link.term] as TermForms;
  return { label: t.nom, href: link.href ?? `/${t.slug}`, external: false };
}

/**
 * Builds the default navigation from the preset's template, with labels and paths taken from the
 * **effective** terminology (so a term override renames and re-slugs the nav item, FR-102) and
 * items of disabled modules left out (FR-105). A parent left without children keeps its own link.
 */
export function buildNavigation(
  template: readonly NavTemplateItem[],
  terms: Record<string, TermForms>,
  modules: Partial<Record<ModuleKey, boolean>>,
): NavItem[] {
  const enabled = (m: ModuleKey | undefined) => m === undefined || modules[m] === true;
  return template
    .filter((item) => enabled(item.module))
    .map((item) => ({
      ...navLink(item, terms),
      children: (item.children ?? [])
        .filter((c) => enabled(c.module))
        .map((c) => navLink(c, terms)),
    }));
}

/**
 * `effectiveConfig = deepMerge(platformDefaults, preset, tenantOverrides)` (SDD §5.1).
 *
 * - Only overrides are stored; deleting one restores the preset (or platform) value.
 * - Terms are layered per key: an overridden term replaces the preset's `TermForms` entirely.
 * - The denomination is the tenant row's; `siteConfig.denomination` is ignored.
 * - `identity` defaults to the tenant name.
 * - `navigation`: the stored navigation if any, else built from the preset template with the
 *   effective terms and modules. `home`: the stored order if any, else the preset's; sections of
 *   disabled modules are dropped either way.
 */
export function effectiveConfig(source: TenantConfigSource): EffectiveConfig {
  const preset = getPreset(source.denomination);
  const overrides = SiteConfigOverridesSchema.parse(source.siteConfig ?? {});

  const base: PlatformDefaults = PLATFORM_DEFAULTS;
  const merged = deepMerge<PlatformDefaults>(
    base,
    { modules: preset.modules },
    {
      theme: overrides.theme,
      modules: overrides.modules,
      footer: overrides.footer,
      contact: overrides.contact,
      legal: overrides.legal,
      giving: overrides.giving,
      integrations: overrides.integrations,
    },
  );
  const modules = merged.modules as Record<ModuleKey, boolean>;
  // A term is replaced as a whole, never merged field by field: an override without `plural`
  // must not inherit the preset's plural of a different word.
  const terminology = structuredClone({
    ...PLATFORM_DEFAULTS.terminology,
    ...preset.terminology,
    ...overrides.terminology,
  }) as EffectiveConfig["terminology"];

  const identity = deepMerge<SiteConfig["identity"]>(
    { name: source.name, shortName: source.name },
    overrides.identity,
  );
  const home = (overrides.home ?? preset.home).filter((s) => {
    const m = HOME_SECTION_MODULE[s.type];
    return m === undefined || modules[m];
  });
  const navigation =
    overrides.navigation ?? buildNavigation(preset.navigation, terminology, modules);

  return {
    ...merged,
    identity,
    denomination: source.denomination,
    terminology,
    modules,
    navigation,
    home: structuredClone(home),
    preset: { key: preset.key, name: preset.name, reviewStatus: preset.reviewStatus },
    calendarFamily: preset.calendarFamily,
    rites: structuredClone(preset.rites),
    serviceTypes: structuredClone(preset.serviceTypes),
    rotaPositions: structuredClone(preset.rotaPositions),
    planTemplates: presetPlanTemplates(preset.key),
  };
}

/**
 * The grammatical forms of a term (SDD §5.3): `term(config, "serviceSchedule").nom`.
 * Throws for a key the config does not define (a programming error, never user input).
 */
export function term(config: Pick<SiteConfig, "terminology">, key: TermKey): TermForms {
  const forms = config.terminology[key];
  if (!forms) throw new Error(`Unknown term "${key}"`);
  return forms;
}

// ---------------------------------------------------------------------------------------------
// Diffs (denomination-change preview, D-23 AC3; term-override redirects, FR-102)
// ---------------------------------------------------------------------------------------------

export interface TermChange {
  key: TermKey;
  from: TermForms;
  to: TermForms;
}
export interface ModuleChange {
  key: ModuleKey;
  from: boolean;
  to: boolean;
}
export interface RiteChange {
  key: string;
  from: Rite;
  to: Rite;
}
export interface PathRedirect {
  fromPath: string;
  toPath: string;
}

export interface ConfigDiff {
  terms: TermChange[];
  modules: ModuleChange[];
  rites: { added: Rite[]; removed: Rite[]; renamed: RiteChange[] };
  serviceTypes: { added: ServiceType[]; removed: ServiceType[] };
  calendarFamily: { from: LiturgicalFamily; to: LiturgicalFamily } | null;
  /** 301 redirects to store when the change is applied (old section / rite paths). */
  redirects: PathRedirect[];
}

export interface PresetDiff extends ConfigDiff {
  from: Denomination;
  to: Denomination;
  /** Terms whose preset value changes but which the church has overridden — they stay. */
  keptOverrides: TermKey[];
}

/** Terms that are URL segments of the public site (SDD §6). */
const ROUTED_TERMS: readonly TermKey[] = [
  "serviceSchedule",
  ...SECTION_TERM_KEYS.filter((k) => k !== "homePage"),
];

const sameForms = (a: TermForms, b: TermForms) =>
  a.nom === b.nom &&
  a.lower === b.lower &&
  a.slug === b.slug &&
  a.plural === b.plural &&
  a.article === b.article;

/** What changes between two effective configs (terms, modules, rites, paths). */
export function configDiff(before: EffectiveConfig, after: EffectiveConfig): ConfigDiff {
  const terms: TermChange[] = [];
  for (const key of TERM_KEYS) {
    const from = before.terminology[key];
    const to = after.terminology[key];
    if (!sameForms(from, to)) terms.push({ key, from, to });
  }

  const modules: ModuleChange[] = [];
  for (const key of ModuleKeySchema.options) {
    if (before.modules[key] !== after.modules[key]) {
      modules.push({ key, from: before.modules[key], to: after.modules[key] });
    }
  }

  const beforeRites = new Map(before.rites.map((r) => [r.key, r]));
  const afterRites = new Map(after.rites.map((r) => [r.key, r]));
  const renamed: RiteChange[] = [];
  for (const [key, from] of beforeRites) {
    const to = afterRites.get(key);
    if (to && !sameForms(from.forms, to.forms)) renamed.push({ key, from, to });
  }

  const beforeTypes = new Set(before.serviceTypes.map((s) => s.key));
  const afterTypes = new Set(after.serviceTypes.map((s) => s.key));

  const redirects: PathRedirect[] = [];
  for (const key of ROUTED_TERMS) {
    const from = before.terminology[key].slug;
    const to = after.terminology[key].slug;
    if (from !== to) redirects.push({ fromPath: `/${from}`, toPath: `/${to}` });
  }
  const ritesFrom = before.terminology.ritesSection.slug;
  const ritesTo = after.terminology.ritesSection.slug;
  if (ritesFrom !== ritesTo) {
    for (const key of beforeRites.keys()) {
      if (afterRites.has(key)) {
        redirects.push({ fromPath: `/${ritesFrom}/${key}`, toPath: `/${ritesTo}/${key}` });
      }
    }
  }

  return {
    terms,
    modules,
    rites: {
      added: after.rites.filter((r) => !beforeRites.has(r.key)),
      removed: before.rites.filter((r) => !afterRites.has(r.key)),
      renamed,
    },
    serviceTypes: {
      added: after.serviceTypes.filter((s) => !beforeTypes.has(s.key)),
      removed: before.serviceTypes.filter((s) => !afterTypes.has(s.key)),
    },
    calendarFamily:
      before.calendarFamily === after.calendarFamily
        ? null
        : { from: before.calendarFamily, to: after.calendarFamily },
    redirects,
  };
}

/**
 * Preview of a denomination change (FR-101, D-23 AC3): what the church would see change if it
 * switched from `from` to `to` while keeping its stored `overrides`. Overridden terms and
 * module toggles stay as they are and are therefore not listed as changes.
 */
export function presetDiff(
  from: Denomination,
  to: Denomination,
  overrides: SiteConfigOverridesInput = {},
): PresetDiff {
  const source = { name: "-", siteConfig: overrides };
  const diff = configDiff(
    effectiveConfig({ ...source, denomination: from }),
    effectiveConfig({ ...source, denomination: to }),
  );
  const fromTerms = { ...PLATFORM_DEFAULTS.terminology, ...getPreset(from).terminology };
  const toTerms = { ...PLATFORM_DEFAULTS.terminology, ...getPreset(to).terminology };
  const overridden = new Set(Object.keys(overrides.terminology ?? {}));
  const keptOverrides = TERM_KEYS.filter(
    (k) => overridden.has(k) && !sameForms(fromTerms[k] as TermForms, toTerms[k] as TermForms),
  );
  return { from, to, ...diff, keptOverrides };
}
