import { cache } from "react";
import type { Denomination, TermForms } from "@churchy/contracts";
import { resolveCatalogTerms, termsFromConfig, type MessageTree, type Terms } from "@churchy/i18n";
import { effectiveConfig } from "@churchy/presets";
import type { SiteConfig } from "@/lib/site-config";
import { getSiteConfig } from "@/server/site-config";

/**
 * Effective terminology of the current request's tenant (SDD §5.1, §5.3): platform defaults, the
 * denomination preset and the church's own term overrides, layered by `effectiveConfig()` from
 * `@churchy/presets`. The tenant is the one `getRequestContext()` names (the demo church switcher
 * today, the host from D-03); the diocese context gets the neutral preset (`lib/site-config.ts`).
 */
export const getTerms = cache(async (): Promise<Terms> =>
  termsForSiteConfig(await getSiteConfig()),
);

/** Effective terminology of a site config (see `getTerms()`); used by the proxy. */
export function termsForSiteConfig({ name, denomination, terminology }: SiteConfig): Terms {
  return termsFromConfig(effectiveConfig({ name, denomination, siteConfig: { terminology } }));
}

/** Preset terminology of a denomination, without tenant overrides (showcase, setup wizard). */
export function termsForDenomination(denomination: Denomination): Terms {
  return termsFromConfig(effectiveConfig({ name: denomination, denomination }));
}

/** Effective terminology of any tenant (its denomination preset plus its own overrides). */
export function termsForTenant(tenant: {
  name: string;
  denomination: Denomination;
  terminology?: Record<string, TermForms>;
}): Terms {
  return termsFromConfig(
    effectiveConfig({
      name: tenant.name,
      denomination: tenant.denomination,
      siteConfig: { terminology: tenant.terminology ?? {} },
    }),
  );
}

const catalogs = new Map<string, MessageTree>();

/** The message catalog with `{service.plural}`-style term placeholders resolved for `terms`. */
export function catalogFor(catalog: MessageTree, terms: Terms): MessageTree {
  const hit = catalogs.get(terms.fingerprint);
  if (hit) return hit;
  const resolved = resolveCatalogTerms(catalog, terms);
  catalogs.set(terms.fingerprint, resolved);
  return resolved;
}
