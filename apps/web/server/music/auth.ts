import "server-only";

import { cache } from "react";
import { notFound } from "next/navigation";
import { can } from "@churchy/policy";
import { getActor } from "@/server/session";
import { requireWorkspaceModule } from "@/server/workspace-nav";
import { musicUserId } from "./db";
import { ForbiddenError, UnauthorizedError } from "./errors";

/**
 * Music Sheet DB's `src/server/auth.ts`, reduced to the user checks of its models and pages and
 * backed by Churchy: the actor from `getActor()` and the permissions from `can()` (their login,
 * MFA and roles are gone, PLAN §11). The models still check, as in the music app; server actions
 * go through `withPolicy` first.
 *
 * - `canEditSongs`: `music.song.manage` (leader, music leader);
 * - `isSuperadmin`: `music.songRights.manage` — in the music app only the superadmin opened the
 *   song-rights research; Churchy maps it to the same roles (owner decision 2026-11-24).
 */
export type CurrentUser = {
  /** Profile id as the music tables store it. */
  id: string;
  isSuperadmin: boolean;
  canEditSongs: boolean;
  /** Events come in phase 4. */
  canEditEvents: boolean;
};

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const actor = await getActor();
  if (actor.kind !== "tenant" || actor.userId === null) return null;
  const resource = { tenantId: actor.tenantId };
  if (!can(actor, "music.song.view", resource)) return null;
  return {
    id: musicUserId(actor.userId),
    isSuperadmin: can(actor, "music.songRights.manage", resource),
    canEditSongs: can(actor, "music.song.manage", resource),
    canEditEvents: false,
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
