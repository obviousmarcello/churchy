import "server-only";

import { z } from "zod";

import { requireUser, type CurrentUser } from "@/server/music/auth";
import { ConflictError, ForbiddenError } from "@/server/music/errors";
import { createRateLimiter, type RateLimiter } from "@/lib/requests/rate-limit";
import { getMusicSupabase } from "@/server/music/db";
import type { RealtimeConnection } from "@/lib/music/realtime/client";
import { playKeySchema } from "./arrangements";
import { canSeeEvent, visibleEventsFilter } from "./event-access";
import { listPeople } from "./profiles";
import { notifyLiveSessionStarted } from "./live-push";
import { getConnection } from "./realtime-access";
import { SETLIST_MAX_ITEMS } from "./setlists";
import { databaseError, idSchema, isId, parseInput } from "./shared";

// Live sessions: many users follow one leader on the chord sheet of an event
// or a rehearsal. The browsers talk on the Realtime channel `live:<id>`; this
// model only starts, ends and changes the sessions.
//
// Who has access. Keep it in sync with `private.live_session_access()` in
// `supabase/migrations/20261203120000_private_events.sql`, which checks the
// same for Realtime:
// - an event session: the volunteers of the event, and the music leaders and
//   the superadmins who can see the event (`./event-access`). Only a volunteer
//   can start it.
// - a rehearsal session: every signed-in user with the link.
//
// The leader can give the lead to another user with access. A music leader or
// a superadmin can take the lead of an event session, e.g. when the leader is offline. Realtime
// keeps the result of its check for each connection: after a change of the
// leader, the browsers must join the channel again.

/** A session ends this long after its start. Keep it in sync with the migration. */
export const LIVE_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export type LiveSessionDTO = {
  id: string;
  /** The Realtime channel of the session. */
  topic: string;
  /** Null for a rehearsal session. */
  eventId: string | null;
  /** A rehearsal session: the arrangements in playing order. Empty for an event session. */
  arrangementIds: string[];
  /**
   * A rehearsal session: the key of each arrangement, in English note names.
   * Null: the key of the chart.
   */
  musicalKeys: (string | null)[];
  leaderId: string;
  /** ISO 8601 timestamp in UTC. */
  startedAt: string;
  /** The signed-in user leads the session. */
  isLeader: boolean;
  /**
   * A music leader or a superadmin in an event session: can take the lead, and can end the
   * session, also without the lead. The leader can always end it.
   */
  isSessionAdmin: boolean;
};

/** A running event session, for the search palette. */
export type LiveSessionSummaryDTO = {
  id: string;
  eventId: string;
  eventTitle: string;
  /** The display name of the leader, or null when they have none. */
  leaderName: string | null;
  /** ISO 8601 timestamp in UTC. */
  startedAt: string;
};

/**
 * What the browser needs to connect to Realtime. The publishable key is not
 * secret: Row Level Security blocks it from all tables, and the policies on
 * `realtime.messages` check the user's access token.
 */

/** What the browser needs to connect to the realtime transport. */
export type LiveConnectionDTO = RealtimeConnection;

const rehearsalInputSchema = z
  .strictObject({
    arrangementIds: z.array(idSchema).min(1).max(SETLIST_MAX_ITEMS),
    // One for each arrangement. Null or left out: the key of the chart.
    musicalKeys: z.array(playKeySchema.nullable()).max(SETLIST_MAX_ITEMS).optional(),
  })
  .refine(
    (input) => !input.musicalKeys || input.musicalKeys.length === input.arrangementIds.length,
    {
      path: ["musicalKeys"],
    },
  );

const SESSION_COLUMNS = "id, event_id, arrangement_ids, musical_keys, leader_id, created_at";

const sessionRowSchema = z.object({
  id: z.uuid(),
  event_id: z.uuid().nullable(),
  arrangement_ids: z.array(z.uuid()).nullable(),
  musical_keys: z.array(z.string().nullable()).nullable(),
  leader_id: z.uuid(),
  created_at: z.string(),
});

type SessionRow = z.infer<typeof sessionRowSchema>;

const sessionSummaryRowSchema = z.object({
  id: z.uuid(),
  event_id: z.uuid(),
  leader_id: z.uuid(),
  created_at: z.string(),
  event: z.object({ title: z.string() }),
});

/** At most this many rehearsal sessions per user and hour (each start is a new row). */
export const REHEARSAL_SESSIONS_PER_HOUR = 20;
const REHEARSAL_LIMITER = "__churchyRehearsalSessionLimiter";

function rehearsalLimiter(): RateLimiter {
  const store = globalThis as unknown as Record<string, RateLimiter | undefined>;
  return (store[REHEARSAL_LIMITER] ??= createRateLimiter(REHEARSAL_SESSIONS_PER_HOUR));
}

const LEADER_CHANGED = () => new ConflictError(({ m }) => m.server.liveSessions.leaderChanged);

export function getLiveConnection(): Promise<LiveConnectionDTO> {
  return getConnection();
}

/** The session, while it runs and the user has access. Else null. */
export async function getLiveSession(id: string): Promise<LiveSessionDTO | null> {
  const user = await requireUser();
  if (!isId(id)) return null;

  const row = await readRunningSession("id", id);
  return row && (await hasAccess(user, row)) ? toSession(row, user) : null;
}

/** The running session of an event, when the user has access. Else null. */
export async function getEventLiveSession(eventId: string): Promise<LiveSessionDTO | null> {
  const user = await requireUser();
  if (!isId(eventId)) return null;

  const row = await readRunningSession("event_id", eventId);
  return row && (await hasAccess(user, row)) ? toSession(row, user) : null;
}

/**
 * The running event sessions that the user can join, the newest first: all
 * of them for music leaders and superadmins, else the sessions of the events
 * that the user volunteers for. Not the rehearsal sessions: they are for the
 * users who have the link.
 */
export async function listMyLiveSessions(): Promise<LiveSessionSummaryDTO[]> {
  const user = await requireUser();
  const admin = await getMusicSupabase();

  // A music leader: the private events only when they can see them. Null for a superadmin.
  const filter = user.canEditEvents ? await visibleEventsFilter(user) : null;
  // The running sessions first: they are few. A user can volunteer for many
  // events, and a long list of ids does not fit in the URL of the query.
  const query = admin
    .from("live_sessions")
    .select("id, event_id, leader_id, created_at, event:events!inner (title)")
    .not("event_id", "is", null)
    .is("ended_at", null)
    .gt("created_at", new Date(Date.now() - LIVE_SESSION_MAX_AGE_MS).toISOString());
  const { data, error } = await (
    filter === null ? query : query.or(filter, { referencedTable: "event" })
  ).order("created_at", {
    ascending: false,
  });
  if (error) throw databaseError("list live sessions", error);

  let rows = z.array(sessionSummaryRowSchema).parse(data);
  if (!user.canEditEvents && rows.length > 0) {
    const { data: volunteers, error: volunteerError } = await admin
      .from("event_volunteers")
      .select("event_id")
      .eq("user_id", user.id)
      .in("event_id", [...new Set(rows.map((row) => row.event_id))]);
    if (volunteerError) throw databaseError("list volunteer events", volunteerError);
    const eventIds = new Set(
      z
        .array(z.object({ event_id: z.uuid() }))
        .parse(volunteers)
        .map((row) => row.event_id),
    );
    rows = rows.filter((row) => eventIds.has(row.event_id));
  }
  if (rows.length === 0) return [];

  const leaders = new Map(
    (await listPeople([...new Set(rows.map((row) => row.leader_id))])).map((person) => [
      person.id,
      person,
    ]),
  );
  return rows.map((row) => ({
    id: row.id,
    eventId: row.event_id,
    eventTitle: row.event.title,
    leaderName: leaders.get(row.leader_id)?.displayName ?? null,
    startedAt: new Date(row.created_at).toISOString(),
  }));
}

/** The user can start the session of the event (see `startEventLiveSession`). */
export async function canStartEventLiveSession(eventId: string): Promise<boolean> {
  const user = await requireUser();
  return isId(eventId) && canStart(user, eventId);
}

/**
 * Starts the session of an event, with the user as the leader. A volunteer
 * of the event only. When the event has a session already, returns it: the
 * user joins it. Null when there is no such event.
 */
export async function startEventLiveSession(eventId: string): Promise<LiveSessionDTO | null> {
  const user = await requireUser();
  if (!isId(eventId)) return null;
  if (!(await canStart(user, eventId))) throw new ForbiddenError();

  const running = await readRunningSession("event_id", eventId);
  if (running) return toSession(running, user);

  // An old session that nobody ended still holds the place of the event's one session.
  // Only the old ones: another volunteer may have started a new one since the read.
  const { error: endError } = await (
    await getMusicSupabase()
  )
    .from("live_sessions")
    .update({ ended_at: new Date().toISOString() })
    .eq("event_id", eventId)
    .is("ended_at", null)
    .lte("created_at", new Date(Date.now() - LIVE_SESSION_MAX_AGE_MS).toISOString());
  if (endError) throw databaseError("end old live sessions", endError);

  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("live_sessions")
    .insert({ event_id: eventId, leader_id: user.id })
    .select(SESSION_COLUMNS)
    .single();
  if (error?.code === "23503") return null;
  if (error?.code === "23505") {
    // Another volunteer started it at the same time.
    const other = await readRunningSession("event_id", eventId);
    if (other) return toSession(other, user);
  }
  if (error) throw databaseError("start event live session", error);

  const session = sessionRowSchema.parse(data);
  // Only for a new session: a user who joins a running one tells nobody.
  await notifyLiveSessionStarted(eventId, session.id, user.id);
  return toSession(session, user);
}

/** Starts a session for the songs of a rehearsal, with the user as the leader. */
export async function startRehearsalLiveSession(input: unknown): Promise<LiveSessionDTO> {
  const user = await requireUser();
  const { arrangementIds, musicalKeys } = parseInput(rehearsalInputSchema, input);
  // Each start is a new row: a limit, so one user cannot fill the table.
  if (!rehearsalLimiter().take(`${user.tenantId}|${user.id}`, Date.now())) {
    throw new ConflictError(({ m }) => m.server.liveSessions.tooManyRehearsals);
  }
  // A song can come more than once, each time with its own key.
  const keys = arrangementIds.map((_, index) => musicalKeys?.[index] ?? null);
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("live_sessions")
    .insert({
      arrangement_ids: arrangementIds,
      musical_keys: keys.some((key) => key !== null) ? keys : null,
      leader_id: user.id,
    })
    .select(SESSION_COLUMNS)
    .single();
  if (error) throw databaseError("start rehearsal live session", error);

  return toSession(sessionRowSchema.parse(data), user);
}

/**
 * Gives the lead to another user with access. The leader only. Returns false
 * when the session or the user does not exist.
 */
export async function handOverLiveSession(sessionId: string, userId: string): Promise<boolean> {
  const user = await requireUser();
  if (!isId(sessionId) || !isId(userId)) return false;

  const row = await readRunningSession("id", sessionId);
  if (!row) return false;
  if (row.leader_id !== user.id) throw LEADER_CHANGED();
  if (userId === user.id) return true;

  if (row.event_id) {
    // The lead goes to a volunteer of the event (a music leader takes it with `takeLiveSessionLead`).
    if (!(await isEventVolunteer(row.event_id, userId))) {
      throw new ConflictError(({ m }) => m.server.liveSessions.notParticipant);
    }
  }

  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("live_sessions")
    .update({ leader_id: userId })
    .eq("id", sessionId)
    .eq("leader_id", user.id)
    .is("ended_at", null)
    .select("id");
  // The user was deleted.
  if (error?.code === "23503") return false;
  if (error) throw databaseError("hand over live session", error);
  if (data.length === 0) throw LEADER_CHANGED();

  return true;
}

/** A music leader or a superadmin takes the lead of an event session. Returns false when the session does not exist. */
export async function takeLiveSessionLead(sessionId: string): Promise<boolean> {
  const user = await requireUser();
  if (!isId(sessionId)) return false;

  const row = await readRunningSession("id", sessionId);
  if (!row) return false;
  if (!canTakeLead(user, row) || !(await hasAccess(user, row))) throw new ForbiddenError();
  if (row.leader_id === user.id) return true;

  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("live_sessions")
    .update({ leader_id: user.id })
    .eq("id", sessionId)
    .is("ended_at", null)
    .select("id");
  if (error) throw databaseError("take live session lead", error);

  return data.length > 0;
}

/** Ends the session for all. Returns false when the session does not exist or has ended. */
export async function endLiveSession(sessionId: string): Promise<boolean> {
  const user = await requireUser();
  if (!isId(sessionId)) return false;

  const row = await readRunningSession("id", sessionId);
  if (!row) return false;
  if (!(await canEnd(user, row))) throw new ForbiddenError();

  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("live_sessions")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", sessionId)
    .is("ended_at", null)
    .select("id");
  if (error) throw databaseError("end live session", error);

  return data.length > 0;
}

/** The session that has not ended and is not too old. */
async function readRunningSession(
  column: "id" | "event_id",
  value: string,
): Promise<SessionRow | null> {
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("live_sessions")
    .select(SESSION_COLUMNS)
    .eq(column, value)
    .is("ended_at", null)
    .gt("created_at", new Date(Date.now() - LIVE_SESSION_MAX_AGE_MS).toISOString())
    .maybeSingle();
  if (error) throw databaseError("read live session", error);

  return data ? sessionRowSchema.parse(data) : null;
}

async function hasAccess(user: CurrentUser, row: SessionRow): Promise<boolean> {
  if (!row.event_id) return true;
  // `canSeeEvent()` includes the volunteers.
  if (user.canEditEvents) return canSeeEvent(user.id, row.event_id);
  return isEventVolunteer(row.event_id, user.id);
}

/** Only a volunteer of the event can start its session. */
function canStart(user: CurrentUser, eventId: string): Promise<boolean> {
  return isEventVolunteer(eventId, user.id);
}

/** The user is a volunteer of the event, whatever their reply. */
export async function isEventVolunteer(eventId: string, userId: string): Promise<boolean> {
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("event_volunteers")
    .select("user_id")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw databaseError("check event volunteer", error);

  return data !== null;
}

function canTakeLead(user: CurrentUser, row: SessionRow) {
  return row.event_id !== null && user.canEditEvents;
}

/** The leader, or a user who can take the lead and has access. */
async function canEnd(user: CurrentUser, row: SessionRow): Promise<boolean> {
  return row.leader_id === user.id || (canTakeLead(user, row) && (await hasAccess(user, row)));
}

function toSession(row: SessionRow, user: CurrentUser): LiveSessionDTO {
  return {
    id: row.id,
    topic: `live:${row.id}`,
    eventId: row.event_id,
    arrangementIds: row.arrangement_ids ?? [],
    musicalKeys: (row.arrangement_ids ?? []).map((_, index) => row.musical_keys?.[index] ?? null),
    leaderId: row.leader_id,
    startedAt: new Date(row.created_at).toISOString(),
    isLeader: row.leader_id === user.id,
    isSessionAdmin: canTakeLead(user, row),
  };
}
