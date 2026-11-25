import "server-only";

import { cache } from "react";
import { notFound } from "next/navigation";
import { can } from "@churchy/policy";
import { getActor } from "@/server/session";
import { isWorkspaceModuleOn, requireWorkspaceModule } from "@/server/workspace-nav";
import { getMusicSupabase, musicUserId } from "./db";
import { ForbiddenError, UnauthorizedError } from "./errors";

/**
 * Music Sheet DB's `src/server/auth.ts`, reduced to the user checks of its models and pages and
 * backed by Churchy: the actor from `getActor()` and the permissions from `can()` (their login,
 * MFA and roles are gone, PLAN §11). The models still check, as in the music app; server actions
 * go through `withPolicy` first.
 *
 * - `canEditSongs`: `music.song.manage` (leader, music leader);
 * - `canEditEvents`: `music.event.manage` (leader, music leader);
 * - `isSuperadmin`: `music.songRights.manage` — in the music app only the superadmin opened the
 *   song-rights research; Churchy maps it to the same roles (owner decision 2026-11-24).
 */
export type CurrentUser = {
  /** Profile id as the music tables store it. */
  id: string;
  tenantId: string;
  isSuperadmin: boolean;
  canEditSongs: boolean;
  /** `music.event.manage` (leader, music leader): sees and changes all music events. */
  canEditEvents: boolean;
  /** Leads a music area (a leader of an area may manage its team). */
  leadsGroups: boolean;
};

/** Whether the user leads a music area (one query; only with the events module on). */
async function leadsAnyGroup(userId: string): Promise<boolean> {
  if (!(await isWorkspaceModuleOn("ws.music.events"))) return false;
  return (await getLedGroupIds(userId)).size > 0;
}

/** The ids of the music areas that the user leads, with the areas below them. */
export async function getLedGroupIds(userId: string): Promise<Set<string>> {
  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("led_area_ids", { p_user_id: userId });
  if (error) throw new Error(`led_area_ids: ${error.message}`);
  const rows = (data ?? []) as { id?: string; led_area_ids?: string }[] | string[];
  return new Set(
    rows
      .map((row) => (typeof row === "string" ? row : (row.id ?? row.led_area_ids ?? "")))
      .filter(Boolean),
  );
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const actor = await getActor();
  if (actor.kind !== "tenant" || actor.userId === null) return null;
  const resource = { tenantId: actor.tenantId };
  if (!can(actor, "music.song.view", resource)) return null;
  return {
    id: musicUserId(actor.userId),
    tenantId: actor.tenantId,
    isSuperadmin: can(actor, "music.songRights.manage", resource),
    canEditSongs: can(actor, "music.song.manage", resource),
    canEditEvents: can(actor, "music.event.manage", resource),
    leadsGroups: await leadsAnyGroup(musicUserId(actor.userId)),
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

/** Any music user, for a page: 404 when the module is off or the actor has no access. */
export async function requirePageUser(): Promise<CurrentUser> {
  await requireWorkspaceModule("ws.music.songs");
  const user = await getCurrentUser();
  if (!user) notFound();
  return user;
}

/** A user who may manage music events: 403 (`ForbiddenError`) otherwise. */
export async function requireEventAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.canEditEvents) throw new ForbiddenError();
  return user;
}

/** Any music user, for an events page: 404 when the events module is off. */
export async function requireEventsPageUser(): Promise<CurrentUser> {
  await requireWorkspaceModule("ws.music.events");
  const user = await getCurrentUser();
  if (!user) notFound();
  return user;
}

/** An event admin, or the leader of a music area (they manage the teams of their areas). */
export async function requireGroupManager(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.canEditEvents && !user.leadsGroups) throw new ForbiddenError();
  return user;
}

export async function requireSuperadmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.isSuperadmin) throw new ForbiddenError();
  return user;
}

/**
 * Whether the user may read a stored file of the music module (their `requirePrivateFileAccess`):
 * any music user of the church; Storage RLS keeps the tenant prefix (files: phase 2, second slice).
 */
export async function requirePrivateFileAccess(_bucket: string, _path: string): Promise<boolean> {
  return (await getCurrentUser()) !== null;
}

/** May add, change and delete songs. */
export async function requireSongAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.canEditSongs) throw new ForbiddenError();
  return user;
}
