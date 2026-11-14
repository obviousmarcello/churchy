import { NextResponse, type NextRequest } from "next/server";
import {
  DEMO_SESSION_COOKIE,
  demoCookieOptions,
  isDemoSessionId,
  newDemoSessionId,
} from "@/lib/demo/cookies";
import { demoModeEnabled } from "@/lib/demo/flag";

/**
 * Demo mode (D-92): gives every visitor a demo session id before the first render, so each
 * visitor works on their own in-memory copy of the demo data from the first request on. The id is
 * also put on the forwarded request, so that very request already uses it. Without demo mode this
 * does nothing (and never sets a cookie).
 */
export function proxy(request: NextRequest): NextResponse {
  if (!demoModeEnabled()) return NextResponse.next();
  if (isDemoSessionId(request.cookies.get(DEMO_SESSION_COOKIE)?.value)) return NextResponse.next();

  const sessionId = newDemoSessionId();
  request.cookies.set(DEMO_SESSION_COOKIE, sessionId);
  const response = NextResponse.next({ request: { headers: request.headers } });
  response.cookies.set(
    DEMO_SESSION_COOKIE,
    sessionId,
    demoCookieOptions(request.nextUrl.protocol === "https:"),
  );
  return response;
}

export const config = {
  // Pages, route handlers and server actions; not build assets or public files.
  matcher: ["/((?!_next/|favicon\\.ico|demo/|.*\\.(?:svg|png|jpg|jpeg|webp|ico|pdf|woff2?)$).*)"],
};
