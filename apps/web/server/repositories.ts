import type { Repositories } from "@churchy/contracts";
import { repositoriesFor, setDemoSessionNow } from "@/server/data-adapters";
import { getDemoState, type DemoState } from "@/server/demo";

/**
 * The repositories of the current request: in demo mode bound to the visitor's own demo session
 * (D-91 AC1, D-92), otherwise to the default store. Server components and actions use this
 * instead of `getRepositories()` so demo visitors never see each other's changes.
 */
export async function getRequestRepositories(): Promise<Repositories> {
  const demo = await getDemoState();
  // Demo time travel (D-13) applies to the visitor's own session only, never to the shared store.
  if (demo && demo.sessionId !== null) setDemoSessionNow(demo.sessionId, demo.nowOverride);
  return repositoriesForDemo(demo);
}

/** The repositories for a request's demo state (`null`: no demo mode); used by the proxy. */
export function repositoriesForDemo(demo: Pick<DemoState, "sessionId"> | null): Repositories {
  return repositoriesFor(demo?.sessionId ?? null);
}

/** The demo session of the current request, or null (no demo mode / no session cookie). */
export async function getRequestDemoSessionId(): Promise<string | null> {
  return (await getDemoState())?.sessionId ?? null;
}
