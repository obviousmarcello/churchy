import type { Denomination, TermForms } from "@churchy/contracts";
import { defaultThemeConfig, type ThemeConfig } from "@churchy/themes";

/**
 * Mock site configuration (Phase A). The root layout turns `theme` into CSS variables with
 * `themeAttributes()`, so when this is later loaded per tenant from `tenants.site_config` a change
 * in the admin re-themes the site on the next render, with no rebuild. Until the data adapter
 * lands it returns the Klasszikus defaults.
 */
export interface SiteConfig {
  /** Tenant name (`tenants.name`). */
  name: string;
  theme: ThemeConfig;
  /** Denomination preset key; selects the default terminology (SDD §5.2, §5.3). */
  denomination: Denomination;
  /** The church's own term overrides, merged over the preset (`siteConfig.terminology`). */
  terminology: Record<string, TermForms>;
}

export function getSiteConfig(): SiteConfig {
  return {
    name: "Belvárosi Plébánia",
    theme: defaultThemeConfig("klasszikus"),
    denomination: "rk",
    terminology: {},
  };
}
