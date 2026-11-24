import "server-only";

import type { PolicyScope } from "@/server/policy";
import { getRequestContext } from "@/server/session";
import { isWorkspaceModuleOn } from "@/server/workspace-nav";

/**
 * Resource resolver of the music server actions (`withPolicy(action, musicTenant, …)`): the
 * request's church, or `null` (404) without one or while the music module is off.
 */
export async function musicTenant(
  _scope: PolicyScope,
  ..._args: unknown[]
): Promise<{ tenantId: string } | null> {
  const { tenantId } = await getRequestContext();
  if (tenantId === undefined) return null;
  return (await isWorkspaceModuleOn("ws.music.songs")) ? { tenantId } : null;
}
