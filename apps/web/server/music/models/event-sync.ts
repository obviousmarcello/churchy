import "server-only";

import { z } from "zod";

import { requireUser } from "@/server/music/auth";
import { getMusicSupabase } from "@/server/music/db";
import { canSeeEvent } from "./event-access";
import { listPeople, type PersonDTO } from "./profiles";
import { canProjectEvent, eventTopic, getConnection } from "./realtime-access";
import type { RealtimeConnection } from "@/lib/music/realtime/client";
import { databaseError, idSchema, isId, parseInput } from "./shared";

// The pages of an event stay in sync: the database sends a message to the
// Realtime topic `event:<event id>` after each change, with the user who
// made it (see the `event_sync` migration). Each user who can see the event
// gets the messages, and those of its projection, e.g. the live item.
//
// The open controllers of a projection tell that they are open (see
// `event_projection_controllers`): while one is open, the event cannot be
// deleted, and no change can take the projection from its user.

/** What the browser needs to join the topics of the event. */
export type EventConnectionDTO = { connection: RealtimeConnection; topic: string };

const authorIdsSchema = z.array(idSchema).max(20);

/** The connection for the messages of the event. Null when the user cannot see the event. */
export async function getEventConnection(eventId: string): Promise<EventConnectionDTO | null> {
  const user = await requireUser();
  if (!(await canSeeEvent(user.id, eventId, user.canEditEvents))) return null;
  return { connection: await getConnection(), topic: eventTopic(eventId) };
}

/**
 * The users who made changes of the event, for the notices of the changes:
 * their names and avatars, without emails. Empty when the user cannot see the event.
 */
export async function listEventAuthors(eventId: string, userIds: unknown): Promise<PersonDTO[]> {
  const user = await requireUser();
  const ids = parseInput(authorIdsSchema, userIds);
  if (ids.length === 0 || !(await canSeeEvent(user.id, eventId))) return [];
  return listPeople(ids, { emails: false });
}

/**
 * The setlist of the items of the event now (null: no items), e.g. to tell an
 * old answer from a change. Undefined when the user cannot see the event, or
 * there is no such event.
 */
export async function getEventSetlistId(eventId: string): Promise<string | null | undefined> {
  const user = await requireUser();
  if (!(await canSeeEvent(user.id, eventId))) return undefined;

  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("events")
    .select("setlist_id")
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw databaseError("read event setlist", error);
  return data ? z.object({ setlist_id: z.uuid().nullable() }).parse(data).setlist_id : undefined;
}

/**
 * The controller `controllerId` (random, one per tab) of the user is open.
 * False when the user cannot project the event, or there is no such event.
 */
export async function touchProjectionController(
  eventId: string,
  controllerId: string,
): Promise<boolean> {
  const user = await requireUser();
  if (!isId(controllerId) || !(await canProjectEvent(eventId))) return false;

  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("touch_projection_controller", {
    p_id: controllerId,
    p_event_id: eventId,
    p_user_id: user.id,
  });
  if (error) throw databaseError("touch projection controller", error);
  return z.boolean().parse(data);
}

/** The controller of the user closed. */
export async function closeProjectionController(
  eventId: string,
  controllerId: string,
): Promise<void> {
  const user = await requireUser();
  if (!isId(eventId) || !isId(controllerId)) return;

  const { error } = await (
    await getMusicSupabase()
  )
    .from("event_projection_controllers")
    .delete()
    .eq("id", controllerId)
    .eq("event_id", eventId)
    .eq("user_id", user.id);
  if (error) throw databaseError("close projection controller", error);
}
