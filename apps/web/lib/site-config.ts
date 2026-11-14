import type {
  Denomination,
  Organization,
  SiteConfig as StoredSiteConfig,
  Tenant,
  TermForms,
} from "@churchy/contracts";
import { effectiveConfig } from "@churchy/presets";
import {
  FONT_PAIRINGS,
  THEMES,
  defaultThemeConfig,
  resolveThemeConfig,
  validateThemeConfig,
  type FontPairingId,
  type RadiusStep,
  type ThemeConfig,
} from "@churchy/themes";

/**
 * What the app shell renders a request with (SDD §5.1): the church's name, theme and terminology.
 * Built from the request's tenant (`tenants.current`) by `server/site-config.ts`; the pure
 * mapping lives here so it can be unit tested and used by the proxy and email contexts alike.
 * The root layout turns `theme` into CSS variables with `themeAttributes()`, so a change in the
 * admin re-themes the site on the next render, with no rebuild.
 */
export interface SiteConfig {
  /** The tenant this config belongs to; null for the diocese context and the fallback. */
  tenantId: string | null;
  /** Tenant name (`tenants.name`), or the organization's name in the diocese context. */
  name: string;
  theme: ThemeConfig;
  /** Denomination preset key; selects the default terminology (SDD §5.2, §5.3). */
  denomination: Denomination;
  /** The church's own term overrides, merged over the preset (`siteConfig.terminology`). */
  terminology: Record<string, TermForms>;
}

/**
 * Used only when the request names a tenant the data does not know (never in the demo): the
 * platform defaults with the Catholic preset, as before tenants were resolved per request.
 */
export const FALLBACK_SITE_CONFIG: SiteConfig = Object.freeze({
  tenantId: null,
  name: "Belvárosi Plébánia",
  theme: defaultThemeConfig("klasszikus"),
  denomination: "rk",
  terminology: {},
});

type StoredTheme = StoredSiteConfig["theme"];

/** Contract font pairings (SDD §5.2) → the pairing ids of `@churchy/themes`. */
const FONT_PAIRING: Record<StoredTheme["fontPairing"], FontPairingId> = {
  "serif-classic": "klasszikus",
  humanist: "letisztult",
  "modern-sans": "kozossegi",
};

/** Contract radius steps → `@churchy/themes` radius steps. */
const RADIUS: Record<StoredTheme["radius"], RadiusStep> = {
  none: "square",
  small: "soft",
  large: "round",
};

/**
 * The stored site theme (`siteConfig.theme`, contract shape) as a `@churchy/themes` config:
 *
 * - `colors.secondary` (the decorative colour) is the themes' `accent`;
 * - a theme whose stylesheet has not shipped yet (`THEMES[id].available`) renders on the
 *   Klasszikus stylesheet, and an unshipped font pairing falls back to Klasszikus fonts, so a
 *   tenant never gets an unstyled page; its colours, radius and hero style still apply;
 * - a primary colour that fails contrast on the surface (FR-103) is replaced by its nearest
 *   accessible shade.
 */
export function themeFromSiteTheme(theme: StoredTheme): ThemeConfig {
  const themeId = THEMES[theme.themeId].available ? theme.themeId : "klasszikus";
  const pairing = FONT_PAIRING[theme.fontPairing];
  const resolved = resolveThemeConfig({
    themeId,
    colors: { primary: theme.colors.primary, accent: theme.colors.secondary },
    fontPairing: FONT_PAIRINGS[pairing].shipped ? pairing : defaultThemeConfig(themeId).fontPairing,
    heroStyle: theme.heroStyle,
    radius: RADIUS[theme.radius],
  });
  const [issue] = validateThemeConfig(resolved);
  return issue
    ? { ...resolved, colors: { ...resolved.colors, primary: issue.suggestion } }
    : resolved;
}

/** A church's site config: its denomination, term overrides and theme over the platform defaults. */
export function siteConfigForTenant(tenant: Tenant): SiteConfig {
  const config = effectiveConfig({
    name: tenant.name,
    denomination: tenant.denomination,
    siteConfig: tenant.siteConfig,
  });
  return {
    tenantId: tenant.id,
    name: tenant.name,
    theme: themeFromSiteTheme(config.theme),
    denomination: tenant.denomination,
    terminology: tenant.siteConfig.terminology ?? {},
  };
}

/**
 * The diocese context (SDD §25.7) has no church and no public site of its own: it renders with
 * the neutral *Általános keresztény* preset (no denomination's words, e.g. no *szentmise*), the
 * platform theme and the organization's name.
 */
export function siteConfigForOrganization(org: Pick<Organization, "name"> | null): SiteConfig {
  return {
    tenantId: null,
    name: org?.name ?? FALLBACK_SITE_CONFIG.name,
    theme: defaultThemeConfig("klasszikus"),
    denomination: "general",
    terminology: {},
  };
}
