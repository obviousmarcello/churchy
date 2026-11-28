import { cache } from "react";
import { headers } from "next/headers";
import { demoModeEnabled } from "@/lib/demo/flag";
import { SITE_BASE_HEADER, demoSiteBase, siteHref } from "@/lib/site-base";
import { demoDirectory } from "@/server/data-adapters";
import { requestOrigin } from "@/server/public-events";

/**
 * The base path the current request's church site is served under: `""` when the church has its
 * own host, `/demo/<slug>` in the demo. The proxy sets it (never the client); a request that did
 * not come through a church site (the admin, a direct URL) has none.
 */
export const getSiteBase = cache(async (): Promise<string> => {
  return (await headers()).get(SITE_BASE_HEADER) ?? "";
});

/** `siteHref()` bound to the current request's base: `const href = await getSiteHref()`. */
export async function getSiteHref(): Promise<(path: string) => string> {
  const base = await getSiteBase();
  return (path) => siteHref(base, path);
}

/** `https://host` plus the site's base: the root URL of the church's site, for absolute URLs. */
export async function siteOrigin(): Promise<string> {
  const [origin, base] = await Promise.all([requestOrigin(), getSiteBase()]);
  return `${origin}${base}`;
}

/**
 * The public site of a demo church (`/demo/<slug>`), for "view site" links from the admin and
 * workspace, which know the church only from the demo cookie. Without demo mode (or for the
 * diocese) the church root.
 */
export function demoSiteBaseOf(tenantId: string | undefined): string {
  if (!demoModeEnabled() || tenantId === undefined) return "";
  const slug = demoDirectory().contexts.find((c) => c.kind === "tenant" && c.id === tenantId)?.slug;
  return slug === undefined ? "" : demoSiteBase(slug);
}
