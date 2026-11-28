/**
 * Where a church's public site is served from (SDD §6 host resolution, simulated).
 *
 * Production resolves the church from the request host (`parokia.example.hu/miserend`), so its
 * pages live at the root and need no prefix. The demo has no hosts: the three demo churches are
 * served under a path prefix (`/demo/szent-tivadar/miserend`) and the proxy resolves the church
 * from it. Every internal link of a public site goes through {@link siteHref} with the site's base,
 * so the same components work with and without the prefix.
 *
 * Pure and client-safe; the request's base comes from `server/site-base.ts` (server components) or
 * `SiteBaseProvider` (client components).
 */

/**
 * Request header the proxy sets on every request served as a church site: the base path ("" when
 * the site has its own host). Only ever set by the proxy, never taken from the client.
 */
export const SITE_BASE_HEADER = "x-churchy-site-base";

/** Request header with the church (tenant id) a prefixed demo site belongs to. Proxy only. */
export const SITE_TENANT_HEADER = "x-churchy-site-tenant";

/** Path prefix of the demo churches' public sites. */
export const DEMO_SITE_PREFIX = "/demo";

/** Internal route that renders a church's home page (the church root `/` of a site). */
export const SITE_HOME_ROUTE = "/site-home";

/** First segments that belong to the platform, never to a church site served under a prefix. */
const PLATFORM_ROOTS: ReadonlySet<string> = new Set([
  "admin",
  "munkater",
  "egyhazmegye",
  "fejlesztes",
  "uj-egyhaz",
  "belepes",
  "demo",
  "site-home",
  "term",
  "api",
]);

/**
 * The link to the platform's sign-in from a church's site. Signing in from a church's demo site
 * keeps that church (`?egyhaz=<slug>`); a site on its own host needs no hint.
 */
export function loginHref(base: string): string {
  const prefix = `${DEMO_SITE_PREFIX}/`;
  const slug = base.startsWith(prefix) ? base.slice(prefix.length) : "";
  return slug === "" ? "/belepes" : `/belepes?egyhaz=${slug}`;
}

/** The base path of a demo church's site. */
export function demoSiteBase(slug: string): string {
  return `${DEMO_SITE_PREFIX}/${slug}`;
}

const DEMO_SITE_PATH = /^\/demo\/([a-z0-9]+(?:-[a-z0-9]+)*)(\/.*)?$/;

/** Splits `/demo/<slug>/rest` into its slug and the church-relative path (`/` for the home). */
export function splitDemoSitePath(pathname: string): { slug: string; rest: string } | null {
  const match = DEMO_SITE_PATH.exec(pathname);
  if (!match) return null;
  return { slug: match[1]!, rest: match[2] === undefined || match[2] === "" ? "/" : match[2] };
}

/** Whether a church-relative path may be served under a church's prefix at all. */
export function isSitePath(rest: string): boolean {
  const first = rest.split("/")[1] ?? "";
  return !PLATFORM_ROOTS.has(first);
}

/**
 * The link to a church-site `path` (`/kapcsolat`, `/hirek?oldal=2`, `/`) for a site served from
 * `base` (`""` on its own host, `/demo/<slug>` in the demo). Anything that is not an absolute path
 * of the site (full URLs, `mailto:`, `#anchors`, `?query`) is returned unchanged, as is a path that
 * already carries the base.
 */
export function siteHref(base: string, path: string): string {
  if (base === "" || !path.startsWith("/") || path.startsWith("//")) return path;
  if (path === base || path.startsWith(`${base}/`) || path.startsWith(`${base}?`)) return path;
  if (path === "/") return base;
  if (path.startsWith("/?") || path.startsWith("/#")) return `${base}${path.slice(1)}`;
  return `${base}${path}`;
}
