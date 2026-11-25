import "server-only";

import { cache } from "react";
import { z } from "zod";

import type { GroupRights } from "@/lib/music/groups";
import { requireEventAdmin, requireGroupManager, type CurrentUser } from "@/server/music/auth";
import { getMusicSupabase } from "@/server/music/db";
import { groupRightsOf } from "./groups";
import { databaseError, isId } from "./shared";

// Who sees an event. A public event: the members of its groups and of the
// groups below them (`events.area_ids`; the root group: every signed-in
// user). A private event: nobody by its groups. The volunteers, the user who
// created the event and the superadmins always see it. The rule is
// `can_see_event()` of `20270103120000_event_scopes.sql`. The lists use a
// filter of the same rule.

/** The user can see the event. False when there is no such event. Checked once per request. */
export const canSeeEvent = cache(
  async (userId: string, eventId: string, isAdmin = false): Promise<boolean> => {
    if (!isId(userId) || !isId(eventId)) return false;
    const { data, error } = await (
      await getMusicSupabase()
    ).rpc("can_see_event", { p_event_id: eventId, p_user_id: userId, p_is_admin: isAdmin });
    if (error) throw databaseError("check event access", error);
    return z.boolean().parse(data);
  },
);

/**
 * An event admin or a superadmin who can see the event: else `requireEventAdmin()`
 * throws, or null when the user cannot see the event or there is no such event.
 */
export async function requireEventAdminOf(eventId: string): Promise<CurrentUser | null> {
  const user = await requireEventAdmin();
  return (await canSeeEvent(user.id, eventId, user.canEditEvents)) ? user : null;
}

/**
 * Who can change the teams of the event: an event admin or a superadmin (all
 * groups), or a leader (the groups that they lead), who can see the event.
 * Else `requireGroupManager()` throws, or null when the user cannot see the
 * event or there is no such event.
 */
export async function requireTeamEditorOf(
  eventId: string,
): Promise<{ user: CurrentUser; rights: GroupRights } | null> {
  const user = await requireGroupManager();
  const [visible, rights] = await Promise.all([
    canSeeEvent(user.id, eventId, user.canEditEvents),
    groupRightsOf(user),
  ]);
  return visible ? { user, rights } : null;
}

/**
 * The filter of PostgREST (`.or()`) for the events that the user can see, on
 * the columns of `events`. Null for a superadmin: all events.
 */
export async function visibleEventsFilter(user: CurrentUser): Promise<string | null> {
  if (user.canEditEvents) return null;
  const access = await eventMemberAccess(user.id);
  // The extra events: the user volunteers for few of them, so their ids fit in the URL.
  return [
    `and(is_private.is.false,area_ids.ov.{${access.areaIds.join(",")}})`,
    `created_by.eq.${user.id}`,
    ...(access.extraEventIds.length > 0 ? [`id.in.(${access.extraEventIds.join(",")})`] : []),
  ].join(",");
}

/** The columns of an event that `memberSeesEvent()` reads. */
export type EventAccessFields = {
  id: string;
  isPrivate: boolean;
  areaIds: readonly string[];
  createdBy: string | null;
};

/**
 * The test of the events that the user sees without the superadmin role: the
 * rule of `visibleEventsFilter()` for a user who is not a superadmin. For the
 * "Show hidden events" filter of the events page.
 */
export async function memberSeesEvent(
  user: CurrentUser,
): Promise<(event: EventAccessFields) => boolean> {
  const access = await eventMemberAccess(user.id);
  const areaIds = new Set(access.areaIds);
  const extraEventIds = new Set(access.extraEventIds);
  return (event) =>
    (!event.isPrivate && event.areaIds.some((id) => areaIds.has(id))) ||
    event.createdBy === user.id ||
    extraEventIds.has(event.id);
}

const memberAccessSchema = z
  .object({ area_ids: z.array(z.uuid()), extra_event_ids: z.array(z.uuid()) })
  .transform((row) => ({ areaIds: row.area_ids, extraEventIds: row.extra_event_ids }));

/**
 * The groups of the user (with the groups above them and the root group), and
 * the events that they see only as a volunteer. See `event_member_access()`.
 */
const eventMemberAccess = cache(
  async (userId: string): Promise<z.output<typeof memberAccessSchema>> => {
    const { data, error } = await (
      await getMusicSupabase()
    ).rpc("event_member_access", { p_user_id: userId });
    if (error) throw databaseError("read event access", error);
    return memberAccessSchema.parse(data);
  },
);

/**
 * The groups that the user can give to an event: "all" for a superadmin, else
 * the groups of the user, with the groups above them and the root group.
 */
export async function eventAreaRightsOf(user: CurrentUser): Promise<"all" | ReadonlySet<string>> {
  if (user.canEditEvents) return "all";
  return new Set((await eventMemberAccess(user.id)).areaIds);
}

/** The query with the filter of `visibleEventsFilter()`, if any. */
export function withFilter<Query extends { or(filter: string): Query }>(
  query: Query,
  filter: string | null,
): Query {
  return filter === null ? query : query.or(filter);
}
