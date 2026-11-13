import { defaultThemeConfig, type ThemeConfig } from "@churchy/themes";

/**
 * Mock site configuration (Phase A). The root layout turns `theme` into CSS variables with
 * `themeAttributes()`, so when this is later loaded per tenant from `tenants.site_config` a change
 * in the admin re-themes the site on the next render, with no rebuild. Until the data adapter
 * lands it returns the Klasszikus defaults.
 */
export interface SiteConfig {
  theme: ThemeConfig;
}

export function getSiteConfig(): SiteConfig {
  return { theme: defaultThemeConfig("klasszikus") };
}
