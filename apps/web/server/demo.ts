import { cache } from "react";
import { cookies, headers } from "next/headers";
import {
  DEMO_NOW_COOKIE,
  DEMO_SELECTION_COOKIE,
  DEMO_SESSION_COOKIE,
  demoCookieOptions,
  isDemoSessionId,
  parseDemoNow,
} from "@/lib/demo/cookies";
import { demoModeEnabled } from "@/lib/demo/flag";
import {
  decodeSelection,
  encodeSelection,
  selectContext,
  type DemoDirectory,
  type DemoSelection,
} from "@/lib/demo/personas";
import { SITE_TENANT_HEADER } from "@/lib/site-base";
import { demoDirectory } from "@/server/data-adapters";

/** Demo state of the current request (D-92). */
export interface DemoState {
  /** The visitor's demo session (their own mock store); null only if the cookie is missing. */
  readonly sessionId: string | null;
  readonly selection: DemoSelection;
  readonly directory: DemoDirectory;
  /** Demo time travel (`churchy_demo_now` cookie), or null for the real time. */
  readonly nowOverride: Date | null;
}

/**
 * The demo state of this request, or `null` when demo mode is off. `DEMO_MODE` is read at
 * runtime; the root layout renders every page per request, so the flag is never baked into a
 * static page of the build.
 */
export const getDemoState = cache(async (): Promise<DemoState | null> => {
  if (!demoModeEnabled()) return null;
  const [jar, requestHeaders] = await Promise.all([cookies(), headers()]);
  // A church's demo site (`/demo/<slug>`): the proxy names its church in a request header.
  return demoStateFrom(
    (name) => jar.get(name)?.value,
    requestHeaders.get(SITE_TENANT_HEADER) ?? undefined,
  );
});

/** Reads one request cookie by name. */
export type CookieReader = (name: string) => string | undefined;

/**
 * The demo state for a request's cookies, or `null` when demo mode is off. `getDemoState()` reads
 * them through `next/headers`; the proxy, which runs before that is available, passes its own.
 * `siteTenantId` is the church of a `/demo/<slug>` site, when the request is for one.
 */
export function demoStateFrom(cookie: CookieReader, siteTenantId?: string): DemoState | null {
  if (!demoModeEnabled()) return null;
  const directory = demoDirectory();
  const sessionId = cookie(DEMO_SESSION_COOKIE);
  const selection = decodeSelection(directory, cookie(DEMO_SELECTION_COOKIE));
  const siteChurch = directory.contexts.find((c) => c.kind === "tenant" && c.id === siteTenantId);
  return {
    sessionId: isDemoSessionId(sessionId) ? sessionId : null,
    // On a church's own demo site the church is the one in the URL, whatever the cookie says.
    selection: siteChurch ? selectContext(directory, selection, siteChurch.id) : selection,
    directory,
    nowOverride: parseDemoNow(cookie(DEMO_NOW_COOKIE)),
  };
}

/** Stores the selection in the demo cookie (server actions only). */
export async function saveDemoSelection(selection: DemoSelection): Promise<void> {
  const secure = (await headers()).get("x-forwarded-proto") === "https";
  (await cookies()).set(
    DEMO_SELECTION_COOKIE,
    encodeSelection(selection),
    demoCookieOptions(secure),
  );
}
