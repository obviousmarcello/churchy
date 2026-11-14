import { cache } from "react";
import { ANONYMOUS_ACTOR, type Repositories } from "@churchy/contracts";
import {
  FALLBACK_SITE_CONFIG,
  siteConfigForOrganization,
  siteConfigForTenant,
  type SiteConfig,
} from "@/lib/site-config";
import { demoStateFrom, getDemoState, type CookieReader, type DemoState } from "@/server/demo";
import { repositoriesForDemo } from "@/server/repositories";
import { requestContextFrom, type RequestContext } from "@/server/session";

/**
 * The site config of a request context, read through the repository interfaces (contract first):
 *
 * - a church: `tenants.current` — its denomination, term overrides, name and theme;
 * - the diocese: `organizations.current` — the neutral preset and the organization's name
 *   (`siteConfigForOrganization`);
 * - a tenant id the data does not know: `FALLBACK_SITE_CONFIG`.
 *
 * Public data, so it is read as an anonymous visitor whoever is signed in.
 */
export async function resolveSiteConfig(
  repos: Pick<Repositories, "tenants" | "organizations">,
  context: RequestContext,
): Promise<SiteConfig> {
  if (context.tenantId !== undefined) {
    const tenant = await repos.tenants.current({
      tenantId: context.tenantId,
      actor: ANONYMOUS_ACTOR,
    });
    return tenant ? siteConfigForTenant(tenant) : FALLBACK_SITE_CONFIG;
  }
  const org = await repos.organizations.current({ orgId: context.orgId, actor: ANONYMOUS_ACTOR });
  return siteConfigForOrganization(org);
}

function siteConfigForDemo(demo: DemoState | null): Promise<SiteConfig> {
  return resolveSiteConfig(repositoriesForDemo(demo), requestContextFrom(demo));
}

/**
 * The site config of the current request: the church (or diocese) `getRequestContext()` names,
 * from the visitor's own demo data in demo mode. Once per request.
 */
export const getSiteConfig = cache(async (): Promise<SiteConfig> =>
  siteConfigForDemo(await getDemoState()),
);

/** `getSiteConfig()` for the proxy, which has the request's cookies but no `next/headers`. */
export function siteConfigForRequest(cookie: CookieReader): Promise<SiteConfig> {
  return siteConfigForDemo(demoStateFrom(cookie));
}
