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
  type DemoDirectory,
  type DemoSelection,
} from "@/lib/demo/personas";
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
  const jar = await cookies();
  return demoStateFrom((name) => jar.get(name)?.value);
});

/** Reads one request cookie by name. */
export type CookieReader = (name: string) => string | undefined;

/**
 * The demo state for a request's cookies, or `null` when demo mode is off. `getDemoState()` reads
 * them through `next/headers`; the proxy, which runs before that is available, passes its own.
 */
export function demoStateFrom(cookie: CookieReader): DemoState | null {
  if (!demoModeEnabled()) return null;
  const directory = demoDirectory();
  const sessionId = cookie(DEMO_SESSION_COOKIE);
  return {
    sessionId: isDemoSessionId(sessionId) ? sessionId : null,
    selection: decodeSelection(directory, cookie(DEMO_SELECTION_COOKIE)),
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
