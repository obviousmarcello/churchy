import { NextResponse, type NextRequest } from "next/server";
import { getTerms } from "@/i18n/terms";
import {
  DEMO_SESSION_COOKIE,
  demoCookieOptions,
  isDemoSessionId,
  newDemoSessionId,
} from "@/lib/demo/cookies";
import { demoModeEnabled } from "@/lib/demo/flag";
import { TERM_ROUTE_HEADER, termRouteTarget } from "@/lib/term-routes";

/**
 * Runs before every page request:
 *
 * - Term routes (SDD §6, `lib/term-routes.ts`): the tenant's term slug (`/miserend`,
 *   `/istentiszteleti-rend`, …) is rewritten to the one internal page that renders it, and the
 *   request is marked so that page knows it was reached through its public URL.
 * - Demo mode (D-92): gives every visitor a demo session id before the first render, so each
 *   visitor works on their own in-memory copy of the demo data from the first request on. The id
 *   is also put on the forwarded request, so that very request already uses it. Without demo mode
 *   no cookie is ever set.
 */
export function proxy(request: NextRequest): NextResponse {
  // The mark is only ever set here, never taken from the client.
  const hadMark = request.headers.has(TERM_ROUTE_HEADER);
  request.headers.delete(TERM_ROUTE_HEADER);
  const termRoute = termRouteTarget(request.nextUrl.pathname, getTerms());
  if (termRoute) request.headers.set(TERM_ROUTE_HEADER, termRoute.key);

  let newSessionId: string | null = null;
  if (demoModeEnabled() && !isDemoSessionId(request.cookies.get(DEMO_SESSION_COOKIE)?.value)) {
    newSessionId = newDemoSessionId();
    request.cookies.set(DEMO_SESSION_COOKIE, newSessionId);
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

export const config = {
  // Pages, route handlers and server actions; not build assets or public files. iCalendar feeds
  // (`.ics`) are skipped too: calendar clients keep no cookies and public hosts set none (D-15).
  matcher: [
    "/((?!_next/|favicon\\.ico|demo/|.*\\.(?:svg|png|jpg|jpeg|webp|ico|pdf|woff2?|ics)$).*)",
  ],
};
