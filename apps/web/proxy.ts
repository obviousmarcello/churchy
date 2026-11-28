import { NextResponse, type NextRequest } from "next/server";
import { termsForSiteConfig } from "@/i18n/terms";
import {
  DEMO_SESSION_COOKIE,
  demoCookieOptions,
  isDemoSessionId,
  newDemoSessionId,
} from "@/lib/demo/cookies";
import { demoModeEnabled } from "@/lib/demo/flag";
import {
  SITE_BASE_HEADER,
  SITE_HOME_ROUTE,
  SITE_TENANT_HEADER,
  demoSiteBase,
  isSitePath,
  siteHref,
  splitDemoSitePath,
} from "@/lib/site-base";
import { TERM_ROUTE_HEADER, isTermRouteCandidate, termRouteTarget } from "@/lib/term-routes";
import { demoDirectory } from "@/server/data-adapters";
import { siteConfigForRequest } from "@/server/site-config";
import { redirectForRequest } from "@/server/term-redirects";

/**
 * Runs before every page request:
 *
 * - Term routes (SDD §6, `lib/term-routes.ts`): the request church's term slug (`/miserend` for
 *   the Catholic parish, `/istentiszteleti-rend` for the Reformed church, …) is rewritten to the
 *   one internal page that renders it, and the request is marked so that page knows it was
 *   reached through its public URL. Another denomination's slug is not rewritten, so it is a 404.
 * - Renamed terms (D-23): the old slug of a renamed section answers 301 to the new one, from the
 *   church's stored redirects.
 * - Church sites under a prefix (`/demo/<slug>/…`, SDD §6 host resolution simulated): the church
 *   comes from the path instead of a host. The request is marked with the site's base path and
 *   church (headers only the proxy sets) and rewritten to the church-relative route, so the same
 *   public routes serve every church; the church's home is `/site-home`. All links of the pages
 *   go through `siteHref()` with that base.
 * - Demo mode (D-92): gives every visitor a demo session id before the first render, so each
 *   visitor works on their own in-memory copy of the demo data from the first request on. The id
 *   is also put on the forwarded request, so that very request already uses it. Without demo mode
 *   no cookie is ever set.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  // The marks are only ever set here, never taken from the client.
  const hadMark =
    request.headers.has(TERM_ROUTE_HEADER) ||
    request.headers.has(SITE_BASE_HEADER) ||
    request.headers.has(SITE_TENANT_HEADER);
  request.headers.delete(TERM_ROUTE_HEADER);
  request.headers.delete(SITE_BASE_HEADER);
  request.headers.delete(SITE_TENANT_HEADER);

  const site = demoSiteOf(request.nextUrl.pathname);
  const sitePath = site?.rest ?? request.nextUrl.pathname;
  if (site) {
    request.headers.set(SITE_BASE_HEADER, site.base);
    request.headers.set(SITE_TENANT_HEADER, site.tenantId);
  }

  // Crawlers and calendar clients keep no cookies, so their feeds never start a demo session.
  let newSessionId: string | null = null;
  if (
    demoModeEnabled() &&
    !isCookieFree(sitePath) &&
    !isDemoSessionId(request.cookies.get(DEMO_SESSION_COOKIE)?.value)
  ) {
    newSessionId = newDemoSessionId();
    request.cookies.set(DEMO_SESSION_COOKIE, newSessionId);
  }

  const termRoute = await requestTermRoute(request, sitePath, site?.tenantId);
  if (termRoute) request.headers.set(TERM_ROUTE_HEADER, termRoute.key);

  // A renamed term's old URL answers 301 to the new one (FR-102).
  const moved = termRoute ? null : await requestRedirect(request, sitePath, site?.tenantId);
  if (moved) {
    const target = request.nextUrl.clone();
    target.pathname = siteHref(site?.base ?? "", moved.toPath);
    const redirect = NextResponse.redirect(target, moved.code);
    // Terms can be renamed back, so browsers must not remember the move for good.
    redirect.headers.set("cache-control", "no-store");
    if (newSessionId !== null) {
      redirect.cookies.set(
        DEMO_SESSION_COOKIE,
        newSessionId,
        demoCookieOptions(request.nextUrl.protocol === "https:"),
      );
    }
    return redirect;
  }

  const forward = { request: { headers: request.headers } };
  let response: NextResponse;
  if (termRoute) {
    const url = request.nextUrl.clone();
    url.pathname = termRoute.target;
    response = NextResponse.rewrite(url, forward);
  } else if (site) {
    const url = request.nextUrl.clone();
    url.pathname = site.rest === "/" ? SITE_HOME_ROUTE : site.rest;
    response = NextResponse.rewrite(url, forward);
  } else if (newSessionId !== null || hadMark) {
    response = NextResponse.next(forward);
  } else {
    response = NextResponse.next();
  }

  if (newSessionId !== null) {
    response.cookies.set(
      DEMO_SESSION_COOKIE,
      newSessionId,
      demoCookieOptions(request.nextUrl.protocol === "https:"),
    );
  }
  return response;
}

/**
 * The term route of this request for its own church: the tenant comes from the same seam as
 * `getRequestContext()` (the demo selection cookie today, the host from D-03), its terms from
 * `tenants.current`. Only single-segment paths can be a term slug, so every other request skips
 * the lookup; the lookup itself is in memory (mock store) and parses one small config.
 */
async function requestTermRoute(request: NextRequest, pathname: string, siteTenantId?: string) {
  if (!isTermRouteCandidate(pathname)) return null;
  const config = await siteConfigForRequest(
    (name) => request.cookies.get(name)?.value,
    siteTenantId,
  );
  return termRouteTarget(pathname, termsForSiteConfig(config));
}

/** The stored redirect of this request's path (only paths that could be a term URL). */
async function requestRedirect(request: NextRequest, pathname: string, siteTenantId?: string) {
  if (!isTermRouteCandidate(pathname)) return null;
  return redirectForRequest((name) => request.cookies.get(name)?.value, pathname, siteTenantId);
}

/**
 * The demo church a `/demo/<slug>/…` path belongs to, or null (not a church prefix, an unknown
 * slug, a platform area under a prefix, or demo mode off — then the path is simply a 404). This is
 * the simulated host resolution: a real deployment maps the request host to a church here instead,
 * with an empty base.
 */
function demoSiteOf(pathname: string): { base: string; tenantId: string; rest: string } | null {
  if (!demoModeEnabled()) return null;
  const parts = splitDemoSitePath(pathname);
  if (parts === null || !isSitePath(parts.rest)) return null;
  const church = demoDirectory().contexts.find((c) => c.kind === "tenant" && c.slug === parts.slug);
  if (church === undefined) return null;
  return { base: demoSiteBase(parts.slug), tenantId: church.id, rest: parts.rest };
}

/** Paths whose clients keep no cookies: iCalendar feeds, the sitemap and robots.txt (D-15, D-17). */
function isCookieFree(pathname: string): boolean {
  return /(?:\.ics|^\/sitemap\.xml|^\/robots\.txt)$/.test(pathname);
}

export const config = {
  // Pages, route handlers and server actions; not build assets or public files. iCalendar feeds
  // (`.ics`) are skipped too: calendar clients keep no cookies and public hosts set none (D-15).
  // So are `/sitemap.xml` and `/robots.txt`: crawlers keep no cookies either (D-17).
  matcher: [
    // A demo church's own site: its feeds (`.ics`, sitemap, robots) are rewritten too. Files under
    // `/demo/` (images, the sample PDF) never match a church slug and pass straight through.
    "/demo/:path*",
    "/((?!_next/|favicon\\.ico|demo/|sitemap\\.xml$|robots\\.txt$|.*\\.(?:svg|png|jpg|jpeg|webp|ico|pdf|woff2?|ics)$).*)",
  ],
};
