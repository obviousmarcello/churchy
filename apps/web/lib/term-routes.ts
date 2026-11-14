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
} as const;

export type TermRouteKey = keyof typeof TERM_ROUTES;

/** What the proxy needs from the tenant's terminology. */
export interface TermSlugs {
  term(key: string): { slug: string };
}

/** The public path of a term route for this terminology, e.g. `/miserend`. */
export function termRoutePath(terms: TermSlugs, key: TermRouteKey): string {
  return `/${terms.term(key).slug}`;
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
