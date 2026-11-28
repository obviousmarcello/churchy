import "server-only";

import type { PolicyScope } from "@/server/policy";
import { setPolicyActorEnricher } from "@/server/policy";
import { loadAreaGrants } from "./area-grants";
import { getEvent } from "./models/events";
import { musicUserId } from "./db";
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

/** The mixer module (`ws.music.mixer`) must be on too. */
export async function musicMixer(
  scope: PolicyScope,
  ...args: unknown[]
): Promise<{ tenantId: string } | null> {
  const tenant = await musicTenant(scope, ...args);
  if (tenant === null) return null;
  return (await isWorkspaceModuleOn("ws.music.mixer")) ? tenant : null;
}

/** The rehearsal page and its projection (`ws.music.rehearsal`) must be on too. */
export async function musicRehearsal(
  scope: PolicyScope,
  ...args: unknown[]
): Promise<{ tenantId: string } | null> {
  const tenant = await musicTenant(scope, ...args);
  if (tenant === null) return null;
  return (await isWorkspaceModuleOn("ws.music.rehearsal")) ? tenant : null;
}

/** The training courses (`ws.music.courses`) must be on too. */
export async function musicCourses(
  scope: PolicyScope,
  ...args: unknown[]
): Promise<{ tenantId: string } | null> {
  const tenant = await musicTenant(scope, ...args);
  if (tenant === null) return null;
  return (await isWorkspaceModuleOn("ws.music.courses")) ? tenant : null;
}

/**
 * For `music.course.manage`: the `course_admin` role of any group counts, so the resource names all the
 * groups of the actor (the policy enricher then loads the grants).
 */
export async function musicCourseManage(
  scope: PolicyScope,
  ...args: unknown[]
): Promise<{ tenantId: string; areaIds: string[] } | null> {
  const tenant = await musicCourses(scope, ...args);
  if (tenant === null) return null;
  const actor = scope.actor;
  if (actor.kind !== "tenant" || actor.userId === null) return { ...tenant, areaIds: [] };
  const grants = await loadAreaGrants(musicUserId(actor.userId));
  return { ...tenant, areaIds: grants.map((grant) => grant.areaId) };
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

// Area roles: for a music action whose resource names areas, `can()` also sees the roles that
// the actor's music areas give (loaded once per request and user).
setPolicyActorEnricher(async (actor, resource) => {
  if (actor.kind !== "tenant" || actor.userId === null || !("areaIds" in resource)) return actor;
  try {
    return { ...actor, musicAreaGrants: await loadAreaGrants(musicUserId(actor.userId)) };
  } catch {
    return actor;
  }
});

/**
 * Resolver of an event action that names the event (an `id` form field, or a first string
 * argument): the tenant and the areas of the event, so area roles can apply. An event the actor
 * cannot see resolves to `null` (404). Without an id (a new event) the areas come from `areaIds` fields.
 */
export async function musicEventIn(
  scope: PolicyScope,
  ...args: unknown[]
): Promise<{ tenantId: string; areaIds?: string[] } | null> {
  const tenant = await musicEvents(scope, ...args);
  if (tenant === null) return null;
  const form = args.find((arg): arg is FormData => arg instanceof FormData);
  const id = typeof args[0] === "string" ? args[0] : form?.get("id");
  if (typeof id !== "string" || id === "") {
    const areaIds = form?.getAll("areaIds").map(String);
    return areaIds && areaIds.length > 0 ? { ...tenant, areaIds } : tenant;
  }
  const event = await getEvent(id);
  return event === null ? null : { ...tenant, areaIds: event.areaIds };
}

/** The projection (`ws.music.projection`, and its child module when named) must be on too. */
export async function musicProjection(
  scope: PolicyScope,
  ..._args: unknown[]
): Promise<{ tenantId: string } | null> {
  const tenant = await musicEvents(scope);
  if (tenant === null) return null;
  return (await isWorkspaceModuleOn("ws.music.projection")) ? tenant : null;
}

/** Like `musicProjection`, for a child module of the projection. */
export function musicProjectionChild(
  child: "themes" | "text-slides" | "overlay" | "countdown" | "quick-add",
) {
  return async (scope: PolicyScope, ..._args: unknown[]): Promise<{ tenantId: string } | null> => {
    const tenant = await musicProjection(scope);
    if (tenant === null) return null;
    return (await isWorkspaceModuleOn(`ws.music.projection.${child}`)) ? tenant : null;
  };
}

/**
 * For the actions of the image sets and the announcements of an event: the music events module and
 * the child module (`ws.music.events.<module>`) must be on. The first argument can be an id of an
 * image or an announcement (not an event), so no area context is resolved; the models check the
 * event and its areas again.
 */
export function musicEventModule(module: "images" | "announcements") {
  return async (scope: PolicyScope, ..._args: unknown[]): Promise<{ tenantId: string } | null> => {
    const tenant = await musicEvents(scope);
    if (tenant === null) return null;
    return (await isWorkspaceModuleOn(`ws.music.events.${module}`)) ? tenant : null;
  };
}

/** Scripture (`ws.music.scripture`, a child of the events module) must be on too. */
export async function musicScripture(
  scope: PolicyScope,
  ..._args: unknown[]
): Promise<{ tenantId: string } | null> {
  const tenant = await musicEvents(scope);
  if (tenant === null) return null;
  return (await isWorkspaceModuleOn("ws.music.scripture")) ? tenant : null;
}
