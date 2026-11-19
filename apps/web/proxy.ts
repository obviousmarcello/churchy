import { NextResponse, type NextRequest } from "next/server";
import { termsForSiteConfig } from "@/i18n/terms";
import {
  DEMO_SESSION_COOKIE,
  demoCookieOptions,
  isDemoSessionId,
  newDemoSessionId,
} from "@/lib/demo/cookies";
import { demoModeEnabled } from "@/lib/demo/flag";
import { TERM_ROUTE_HEADER, isTermRouteCandidate, termRouteTarget } from "@/lib/term-routes";
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
 * - Demo mode (D-92): gives every visitor a demo session id before the first render, so each
 *   visitor works on their own in-memory copy of the demo data from the first request on. The id
 *   is also put on the forwarded request, so that very request already uses it. Without demo mode
 *   no cookie is ever set.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  let newSessionId: string | null = null;
  if (demoModeEnabled() && !isDemoSessionId(request.cookies.get(DEMO_SESSION_COOKIE)?.value)) {
    newSessionId = newDemoSessionId();
    request.cookies.set(DEMO_SESSION_COOKIE, newSessionId);
  }

  // The mark is only ever set here, never taken from the client.
  const hadMark = request.headers.has(TERM_ROUTE_HEADER);
  request.headers.delete(TERM_ROUTE_HEADER);
  const termRoute = await requestTermRoute(request);
  if (termRoute) request.headers.set(TERM_ROUTE_HEADER, termRoute.key);

  // A renamed term's old URL answers 301 to the new one (FR-102).
  const moved = termRoute ? null : await requestRedirect(request);
  if (moved) {
    const target = request.nextUrl.clone();
    target.pathname = moved.toPath;
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
async function requestTermRoute(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!isTermRouteCandidate(pathname)) return null;
  const config = await siteConfigForRequest((name) => request.cookies.get(name)?.value);
  return termRouteTarget(pathname, termsForSiteConfig(config));
}

/** The stored redirect of this request's path (only paths that could be a term URL). */
async function requestRedirect(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!isTermRouteCandidate(pathname)) return null;
  return redirectForRequest((name) => request.cookies.get(name)?.value, pathname);
}

export const config = {
  // Pages, route handlers and server actions; not build assets or public files. iCalendar feeds
  // (`.ics`) are skipped too: calendar clients keep no cookies and public hosts set none (D-15).
  // So are `/sitemap.xml` and `/robots.txt`: crawlers keep no cookies either (D-17).
  matcher: [
    "/((?!_next/|favicon\\.ico|demo/|sitemap\\.xml$|robots\\.txt$|.*\\.(?:svg|png|jpg|jpeg|webp|ico|pdf|woff2?|ics)$).*)",
  ],
};
