import { cache } from "react";
import { notFound } from "next/navigation";
import type { Ctx, ModuleKey } from "@churchy/contracts";
import { entitlements, includesModule, type Entitlements } from "@/lib/plans/entitlements";
import { getPublicSite } from "@/server/public-seo";
import { getRequestRepositories } from "@/server/repositories";

/**
 * Server side of plans & entitlements (D-87): reads the plan sources through `BillingRepo` and
 * merges them with `entitlements()`. Every feature gate (module registry, domain, quota,
 * invitations, workspace tiers) goes through here; nothing else looks at plan keys.
 */

/** The entitlements of the church `ctx` names. */
export async function entitlementsFor(ctx: Ctx): Promise<Entitlements> {
  const repos = await getRequestRepositories();
  return entitlements(await repos.billing.getEntitlementSources(ctx));
}

/** The entitlements of the request's church as a public visitor sees the site. */
export const getPublicEntitlements = cache(async (): Promise<Entitlements | null> => {
  const site = await getPublicSite();
  return site === null ? null : entitlementsFor(site.ctx);
});

/**
 * The website modules that are on for the public site (D-25): switched on in the church's
 * settings **and** included in its plan (a downgrade hides paid modules, content is kept).
 */
export const getEnabledPublicModules = cache(async (): Promise<ReadonlySet<ModuleKey>> => {
  const [site, ent] = await Promise.all([getPublicSite(), getPublicEntitlements()]);
  if (site === null || ent === null) return new Set();
  const on = (Object.entries(site.config.modules) as [ModuleKey, boolean][])
    .filter(([key, enabled]) => enabled && includesModule(ent, key))
    .map(([key]) => key);
  return new Set(on);
});

/** 404 unless the website module is on: the nav hides it and the route must not work either. */
export async function requirePublicModule(key: ModuleKey): Promise<void> {
  if (!(await getEnabledPublicModules()).has(key)) notFound();
}
