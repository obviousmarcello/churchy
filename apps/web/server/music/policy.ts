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

/** The chord sheet (`ws.music.sheet`, and its child module when named) must be on too. */
export function musicSheet(module?: "marks" | "metronome") {
  return async (scope: PolicyScope, ...args: unknown[]): Promise<{ tenantId: string } | null> => {
    const tenant = await musicTenant(scope, ...args);
    if (tenant === null || !(await isWorkspaceModuleOn("ws.music.sheet"))) return null;
    return module === undefined || (await isWorkspaceModuleOn(`ws.music.sheet.${module}`))
      ? tenant
      : null;
  };
}

/** The music events (`ws.music.events`) must be on too. */
export async function musicEvents(
  scope: PolicyScope,
  ...args: unknown[]
): Promise<{ tenantId: string } | null> {
  const tenant = await musicTenant(scope, ...args);
  if (tenant === null) return null;
  return (await isWorkspaceModuleOn("ws.music.events")) ? tenant : null;
}
