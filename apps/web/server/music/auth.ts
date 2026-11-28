import "server-only";

import { cache } from "react";
import { notFound } from "next/navigation";
import { can, type TenantActor } from "@churchy/policy";
import { getActor } from "@/server/session";
import { isWorkspaceModuleOn, requireWorkspaceModule } from "@/server/workspace-nav";
import { loadAreaGrants } from "./area-grants";
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
 * - `isSuperadmin`: `music.songRights.manage` (the song-rights research only);
 * - the other superadmin-only features of the music app have their own actions (PLAN §32):
 *   `canManageGroupRoles`, `canManageAnnouncements`, `canViewPeopleEmails`, `canSetDefaultTheme`;
 * - `leadsGroups` / `leadsCourseGroups`: `music.group.manageLed` / `music.course.editLed` with the
 *   areas the user leads as area context.
 */
export type CurrentUser = {
  /** Profile id as the music tables store it. */
  id: string;
  tenantId: string;
  isSuperadmin: boolean;
  /** `music.group.roles.manage`: edits the roles that the areas give. */
  canManageGroupRoles: boolean;
  /** `music.announcement.manage`: announcement sources and calendars. */
  canManageAnnouncements: boolean;
  /** `music.people.emails.view`: sees the email addresses of people. */
  canViewPeopleEmails: boolean;
  /** `music.projection.themes.setDefault`. */
  canSetDefaultTheme: boolean;
  canEditSongs: boolean;
  /** `music.event.manage` (leader, music leader): sees and changes all music events. */
  canEditEvents: boolean;
  /**
   * Whether the user may manage events (or songs, with `"song"`) of these areas: the tenant-wide
   * permission, or an area role (`music.event.manage` / `music.song.manage` with area context).
   */
  canManageIn: (kind: "event" | "song", areaIds: readonly string[]) => Promise<boolean>;
  /** The areas where an area role lets the user manage events (empty: none). */
  eventAreaIds: () => Promise<string[]>;
  /** Leads a music area (a leader of an area may manage its team). */
  leadsGroups: boolean;
  /**
   * `music.course.manage` (leader, or the `course_admin` role of any group): changes all courses.
   * False while the courses module is off.
   */
  canEditCourses: boolean;
  /** Leads a group and may make the courses of their groups. False while the courses module is off. */
  leadsCourseGroups: boolean;
};

/** Whether the user leads a music area (one query; only with the events module on). */
async function leadsAnyGroup(actor: TenantActor, userId: string): Promise<boolean> {
  if (!(await isWorkspaceModuleOn("ws.music.events"))) return false;
  return leadsAny(actor, userId, "music.group.manageLed");
}

/** `can()` for a led-area action, with the areas the user leads as the area context. */
async function leadsAny(
  actor: TenantActor,
  userId: string,
  action: "music.group.manageLed" | "music.course.editLed",
): Promise<boolean> {
  const led = [...(await getLedGroupIds(userId))];
  return can({ ...actor, musicLedAreaIds: led }, action, {
    tenantId: actor.tenantId,
    areaIds: led,
  });
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

/**
 * The course rights of the actor (one query for the area roles and one for the led groups, only with the
 * courses module on): `course_admin` of any group, or the church leader, changes all courses; a leader of
 * groups makes the courses of their groups (`can_edit_course()` checks each course).
 */
async function courseRights(
  actor: TenantActor,
  userId: string,
): Promise<{ canEditCourses: boolean; leadsCourseGroups: boolean }> {
  if (!(await isWorkspaceModuleOn("ws.music.courses"))) {
    return { canEditCourses: false, leadsCourseGroups: false };
  }
  const grants = await loadAreaGrants(userId);
  const canEditCourses = can({ ...actor, musicAreaGrants: grants }, "music.course.manage", {
    tenantId: actor.tenantId,
    areaIds: grants.map((grant) => grant.areaId),
  });
  return {
    canEditCourses,
    leadsCourseGroups: !canEditCourses && (await leadsAny(actor, userId, "music.course.editLed")),
  };
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const actor = await getActor();
  if (actor.kind !== "tenant" || actor.userId === null) return null;
  const resource = { tenantId: actor.tenantId };
  if (!can(actor, "music.song.view", resource)) return null;
  const { canEditCourses, leadsCourseGroups } = await courseRights(
    actor,
    musicUserId(actor.userId),
  );
  const leadsGroups = await leadsAnyGroup(actor, musicUserId(actor.userId));
  return {
    id: musicUserId(actor.userId),
    tenantId: actor.tenantId,
    isSuperadmin: can(actor, "music.songRights.manage", resource),
    canEditSongs: can(actor, "music.song.manage", resource),
    canEditEvents: can(actor, "music.event.manage", resource),
    canManageGroupRoles: can(actor, "music.group.roles.manage", resource),
    canManageAnnouncements: can(actor, "music.announcement.manage", resource),
    canViewPeopleEmails: can(actor, "music.people.emails.view", resource),
    canSetDefaultTheme: can(actor, "music.projection.themes.setDefault", resource),
    leadsGroups,
    canEditCourses,
    leadsCourseGroups,
    eventAreaIds: async () => {
      const grants = await loadAreaGrants(musicUserId(actor.userId!));
      return grants
        .filter((grant) =>
          grant.roles.some((role) => role === "event_admin" || role === "music_leader"),
        )
        .map((grant) => grant.areaId);
    },
    canManageIn: async (kind, areaIds) => {
      const action = kind === "event" ? "music.event.manage" : "music.song.manage";
      if (can(actor, action, resource)) return true;
      if (areaIds.length === 0) return false;
      const grants = await loadAreaGrants(musicUserId(actor.userId!));
      return can({ ...actor, musicAreaGrants: grants }, action, { ...resource, areaIds });
    },
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

/** May manage events of these areas (tenant-wide permission or an area role): else `ForbiddenError`. */
export async function requireEventAdminIn(areaIds: readonly string[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!(await user.canManageIn("event", areaIds))) throw new ForbiddenError();
  return user;
}

/** An event admin, or the leader of a music area (they manage the teams of their areas). */
export async function requireGroupManager(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.canEditEvents && !user.leadsGroups) throw new ForbiddenError();
  return user;
}

/** Song-rights research and settings: `music.songRights.manage`. */
export async function requireSuperadmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.isSuperadmin) throw new ForbiddenError();
  return user;
}

/** May edit the roles that music areas give: `music.group.roles.manage`. */
export async function requireGroupRoleAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.canManageGroupRoles) throw new ForbiddenError();
  return user;
}

/** May manage announcement sources and calendars: `music.announcement.manage`. */
export async function requireAnnouncementAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.canManageAnnouncements) throw new ForbiddenError();
  return user;
}

/** May set the default projection theme: `music.projection.themes.setDefault`. */
export async function requireThemeDefaultAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.canSetDefaultTheme) throw new ForbiddenError();
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

/** A course admin: `music.course.manage`, or a `course_admin` role of any group. */
export async function requireCourseAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.canEditCourses) throw new ForbiddenError();
  return user;
}
