import { describe, expect, it } from "vitest";
import type { Tenant } from "@churchy/contracts";
import { PLATFORM_DEFAULTS } from "@churchy/presets";
import { contrastRatio, defaultThemeConfig, THEMES } from "@churchy/themes";
import {
  FALLBACK_SITE_CONFIG,
  siteConfigForOrganization,
  siteConfigForTenant,
  themeFromSiteTheme,
} from "./site-config";

const tenant = (overrides: Partial<Tenant> = {}): Tenant => ({
  id: "t-minta",
  slug: "minta",
  name: "Minta Egyházközség",
  denomination: "ref",
  status: "active",
  siteConfig: {},
  planKey: "ingyenes",
  wsTier: "none",
  organizationId: null,
  launchedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("themeFromSiteTheme", () => {
  it("maps the platform default theme to the Klasszikus defaults", () => {
    expect(themeFromSiteTheme(PLATFORM_DEFAULTS.theme)).toEqual(defaultThemeConfig("klasszikus"));
  });

  it("maps colours, font pairing, radius and hero style of a Klasszikus site", () => {
    expect(
      themeFromSiteTheme({
        themeId: "klasszikus",
        colors: { primary: "#7A2E3B", secondary: "#c9a227", accent: "#2f4858" },
        fontPairing: "serif-classic",
        heroStyle: "text-only",
        radius: "large",
      }),
    ).toEqual({
      themeId: "klasszikus",
      colors: { primary: "#7a2e3b", accent: "#c9a227" },
      fontPairing: "klasszikus",
      heroStyle: "text-only",
      radius: "round",
    });
  });

  it("renders themes and fonts that have not shipped on Klasszikus, keeping colours and radius", () => {
    expect(THEMES.letisztult.available).toBe(false);
    const theme = themeFromSiteTheme({
      themeId: "letisztult",
      colors: { primary: "#1f4e79", secondary: "#8a6d3b" },
      fontPairing: "humanist",
      heroStyle: "image-split",
      radius: "none",
    });
    expect(theme).toEqual({
      themeId: "klasszikus",
      colors: { primary: "#1f4e79", accent: "#8a6d3b" },
      fontPairing: "klasszikus",
      heroStyle: "image-split",
      radius: "square",
    });
  });

  it("replaces a primary colour that fails contrast with its nearest accessible shade", () => {
    const theme = themeFromSiteTheme({
      ...PLATFORM_DEFAULTS.theme,
      colors: { primary: "#f0e68c", secondary: "#c9a24b" },
    });
    expect(theme.colors.primary).not.toBe("#f0e68c");
    expect(contrastRatio(theme.colors.primary, THEMES.klasszikus.surface)).toBeGreaterThanOrEqual(
      4.5,
    );
  });
});

describe("siteConfigForTenant", () => {
  it("takes denomination, name, term overrides and theme from the tenant", () => {
    const terminology = {
      serviceSchedule: {
        nom: "Alkalmaink",
        lower: "alkalmaink",
        slug: "alkalmaink",
        article: "az",
      },
    } as const;
    const config = siteConfigForTenant(
      tenant({
        siteConfig: {
          terminology,
          theme: { colors: { primary: "#1f4e79", secondary: "#8a6d3b" } },
        },
      }),
    );
    expect(config).toMatchObject({
      tenantId: "t-minta",
      name: "Minta Egyházközség",
      denomination: "ref",
      terminology,
    });
    expect(config.theme.colors).toEqual({ primary: "#1f4e79", accent: "#8a6d3b" });
  });

  it("uses the platform theme and no overrides when the tenant stores none", () => {
    const config = siteConfigForTenant(tenant({ denomination: "bapt" }));
    expect(config.terminology).toEqual({});
    expect(config.theme).toEqual(defaultThemeConfig("klasszikus"));
  });
});

describe("fallbacks", () => {
  it("the diocese gets the neutral preset and its own name", () => {
    expect(siteConfigForOrganization({ name: "Minta Egyházmegye" })).toMatchObject({
      tenantId: null,
      name: "Minta Egyházmegye",
      denomination: "general",
      terminology: {},
    });
    expect(siteConfigForOrganization(null).name).toBe(FALLBACK_SITE_CONFIG.name);
  });

  it("an unknown tenant falls back to the Catholic platform default", () => {
    expect(FALLBACK_SITE_CONFIG).toMatchObject({ tenantId: null, denomination: "rk" });
  });
});
