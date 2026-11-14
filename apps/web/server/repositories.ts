import type { Repositories } from "@churchy/contracts";
import { repositoriesFor } from "@/server/data-adapters";
import { getDemoState } from "@/server/demo";

/**
 * The repositories of the current request: in demo mode bound to the visitor's own demo session
 * (D-91 AC1, D-92), otherwise to the default store. Server components and actions use this
 * instead of `getRepositories()` so demo visitors never see each other's changes.
 */
export async function getRequestRepositories(): Promise<Repositories> {
  return repositoriesFor((await getDemoState())?.sessionId ?? null);
}

/** The demo session of the current request, or null (no demo mode / no session cookie). */
export async function getRequestDemoSessionId(): Promise<string | null> {
  return (await getDemoState())?.sessionId ?? null;
}
