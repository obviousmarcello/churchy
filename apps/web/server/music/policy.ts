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

/** Like `musicTenant`, and the file module (`ws.music.songs.pdfs` …) must be on too. */
export function musicFiles(module: "pdfs" | "images" | "scores" | "sound-files" | "links") {
  return async (scope: PolicyScope, ...args: unknown[]): Promise<{ tenantId: string } | null> => {
    const tenant = await musicTenant(scope, ...args);
    if (tenant === null) return null;
    return (await isWorkspaceModuleOn(`ws.music.songs.${module}`)) ? tenant : null;
  };
}
