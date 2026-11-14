/**
 * Term-driven public routes (SDD §6): some public URLs are the slug of a denomination term, e.g.
 * the service schedule is `/miserend` for a Catholic parish and `/istentiszteleti-rend` for a
 * Reformed congregation. One page serves every denomination: the proxy rewrites the tenant's slug
 * to a fixed internal route and marks the request with {@link TERM_ROUTE_HEADER}; the page answers
 * 404 without the mark, so the internal path is never a second public URL.
 */

/** Request header set by the proxy on a rewritten term route (value: the term key). */
export const TERM_ROUTE_HEADER = "x-churchy-term-route";

/** Term key → internal route that renders it. */
export const TERM_ROUTES = {
  serviceSchedule: "/term/service-schedule",
  // Weekly announcements (D-14): `/hirdetesek` unless the church renames the section.
  announcementsSection: "/term/announcements",
} as const;

export type TermRouteKey = keyof typeof TERM_ROUTES;

export function isTermRouteKey(value: unknown): value is TermRouteKey {
  return typeof value === "string" && Object.hasOwn(TERM_ROUTES, value);
}

/** What the proxy needs from the tenant's terminology. */
export interface TermSlugs {
  term(key: string): { slug: string };
}

/** The public path of a term route for this terminology, e.g. `/miserend`. */
export function termRoutePath(terms: TermSlugs, key: TermRouteKey): string {
  return `/${terms.term(key).slug}`;
}

/** Term slugs are one lowercase kebab-case segment (`SlugSchema`); nothing else can match. */
const TERM_ROUTE_CANDIDATE = /^\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Whether `pathname` could be a term route at all (lets the proxy skip the tenant lookup). */
export function isTermRouteCandidate(pathname: string): boolean {
  return TERM_ROUTE_CANDIDATE.test(pathname);
}

/**
 * The internal rewrite target of a public path, or null when the path is not a term route of this
 * terminology. Only exact matches count (no prefix or case folding): `/miserend` matches,
 * `/miserend/x` and `/Miserend` do not.
 */
export function termRouteTarget(
  pathname: string,
  terms: TermSlugs,
): { key: TermRouteKey; target: string } | null {
  for (const key of Object.keys(TERM_ROUTES) as TermRouteKey[]) {
    if (pathname === termRoutePath(terms, key)) return { key, target: TERM_ROUTES[key] };
  }
  return null;
}
