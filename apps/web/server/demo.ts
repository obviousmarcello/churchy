import { cache } from "react";
import { cookies, headers } from "next/headers";
import {
  DEMO_SELECTION_COOKIE,
  DEMO_SESSION_COOKIE,
  demoCookieOptions,
  isDemoSessionId,
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
}

/**
 * The demo state of this request, or `null` when demo mode is off. `DEMO_MODE` is read at
 * runtime; the root layout renders every page per request, so the flag is never baked into a
 * static page of the build.
 */
export const getDemoState = cache(async (): Promise<DemoState | null> => {
  if (!demoModeEnabled()) return null;
  const jar = await cookies();
  const directory = demoDirectory();
  const sessionId = jar.get(DEMO_SESSION_COOKIE)?.value;
  return {
    sessionId: isDemoSessionId(sessionId) ? sessionId : null,
    selection: decodeSelection(directory, jar.get(DEMO_SELECTION_COOKIE)?.value),
    directory,
  };
});

/** Stores the selection in the demo cookie (server actions only). */
export async function saveDemoSelection(selection: DemoSelection): Promise<void> {
  const secure = (await headers()).get("x-forwarded-proto") === "https";
  (await cookies()).set(
    DEMO_SELECTION_COOKIE,
    encodeSelection(selection),
    demoCookieOptions(secure),
  );
}
