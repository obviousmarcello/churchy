import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import huMessages from "@messages/hu.json";
import { after } from "next/server";
import { z } from "zod";

import type { NotificationKind } from "@/lib/music/notifications";
import { getMusicSupabase } from "@/server/music/db";
import {
  enqueueMusicOutbox,
  eventLink,
  outboxSessionId,
  type MusicOutboxMessage,
} from "@/server/music/outbox";
import { isPushEnabled, sendPush } from "@/server/music/push";
import { getActor } from "@/server/session";
import {
  listNotificationPreferences,
  type NotificationPreferencesDTO,
} from "./models/notification-preferences";
import { listPushTargets, removeGoneEndpoints } from "./models/push-subscriptions";
import { databaseError } from "./models/shared";

// The notifications of the events (merged Music Sheet DB, `src/server/notifications.ts`): "added
// to an event" goes out when an event admin adds the volunteer; the event reminder and the setlist
// go out from the scheduled job (`sendDueNotifications()`, phase 8c). Each user turns the kinds on
// on the notifications page; the emails can be turned off. The message is an outbox entry
// (`./outbox.ts`: Churchy has no mail transport yet, and no Resend) and, on the devices where the
// user turned push on, a push. Both carry no name and no title: only the start time of the event
// (email), a fixed text and the link. `notification_deliveries` keeps each reminder that went out,
// so that each goes out once; it also keeps each "added" notice: a user who got it within the time
// of the reminder gets no reminder, because the notice told them already.
//
// A failed notification is logged and never fails the action of the user. The functions take the
// client of one church (`db`): a request's, or a job's for each church in turn.

/** How long a push service keeps a message for a device that is offline. */
const PUSH_MAX_TTL_S = 7 * 24 * 60 * 60;
const DAY_MS = 24 * 60 * 60 * 1000;

const KIND_TEMPLATE = {
  event_added: "music.eventAdded",
  event_reminder: "music.eventReminder",
  setlist: "music.setlist",
} as const satisfies Record<NotificationKind, MusicOutboxMessage["template"]>;

const KIND_TEXT = {
  event_added: huMessages.email.music.eventAdded,
  event_reminder: huMessages.email.music.eventReminder,
  setlist: huMessages.email.music.setlist,
} as const satisfies Record<NotificationKind, { pushTitle: string; pushBody: string }>;

const uuidList = z.array(z.uuid());

/** Puts a message in the outbox (the request's demo session, or the default store). */
type Enqueue = (message: MusicOutboxMessage) => Promise<void>;

/**
 * Tells each of `userIds` that they were added to the event, after the response, if they turned it
 * on and the event has not started. A user who added themselves is left out by the caller.
 */
export async function queueEventAddedNotifications(
  eventId: string,
  userIds: readonly string[],
): Promise<void> {
  if (userIds.length === 0) return;
  try {
    // Resolved inside the request: after the response the cookies are not read again.
    const actor = await getActor();
    if (actor.kind !== "tenant") return;
    const db = await getMusicSupabase();
    const sessionId = await outboxSessionId();
    after(async () => {
      try {
        await notifyEventAdded(db, actor.tenantId, eventId, userIds, (message) =>
          enqueueMusicOutbox(message, sessionId),
        );
      } catch (error) {
        console.error(
          "[notifications] event_added failed:",
          error instanceof Error ? error.name : "error",
        );
      }
    });
  } catch (error) {
    console.error(
      "[notifications] could not queue event_added:",
      error instanceof Error ? error.name : "error",
    );
  }
}

export async function notifyEventAdded(
  db: SupabaseClient,
  tenantId: string,
  eventId: string,
  userIds: readonly string[],
  enqueue: Enqueue = enqueueMusicOutbox,
): Promise<number> {
  const preferences = await listNotificationPreferences([...userIds], db);
  const wanted = [...preferences].filter(([, p]) => p.eventAdded).map(([id]) => id);
  if (wanted.length === 0) return 0;
  const startsAt = await readStart(db, eventId);
  // The notice is of no use after the start of the event.
  if (startsAt === null || Date.parse(startsAt) <= Date.now()) return 0;

  const devices = isPushEnabled() ? await listPushTargets(wanted, db) : new Map();
  let sent = 0;
  for (const userId of wanted) {
    const userPreferences = preferences.get(userId);
    if (!userPreferences) continue;
    const delivered = await deliver(
      enqueue,
      db,
      tenantId,
      "event_added",
      eventId,
      startsAt,
      userId,
      userPreferences,
      devices.get(userId) ?? [],
    );
    // Only after a delivery that went out: the reminder is skipped only for a notice that the user got.
    if (delivered && (await claimDelivery(db, "event_added", eventId, userId))) sent++;
  }
  return sent;
}

/**
 * Sends the reminders that are due in the church of `db`: event reminders and setlists. Returns the
 * number that went out and that failed. A failed one goes out in a later run.
 */
export async function sendDueNotifications(
  db: SupabaseClient,
  tenantId: string,
  { limit = 40, enqueue = enqueueMusicOutbox }: { limit?: number; enqueue?: Enqueue } = {},
): Promise<{ sent: number; failed: number }> {
  const { data, error } = await db.rpc("list_due_notifications", { p_limit: limit });
  if (error) throw databaseError("list due notifications", error);
  const due = z
    .array(
      z.object({
        kind: z.enum(["event_reminder", "setlist"]),
        event_id: z.uuid(),
        user_id: z.uuid(),
      }),
    )
    .parse(data);
  if (due.length === 0) return { sent: 0, failed: 0 };

  const userIds = [...new Set(due.map((row) => row.user_id))];
  const eventIds = [...new Set(due.map((row) => row.event_id))];
  const [preferences, starts, told, devices] = await Promise.all([
    listNotificationPreferences(userIds, db),
    readStarts(db, eventIds),
    listAddedTimes(db, eventIds, userIds),
    isPushEnabled() ? listPushTargets(userIds, db) : Promise.resolve(new Map()),
  ]);

  let sent = 0;
  let failed = 0;
  for (const { kind, event_id: eventId, user_id: userId } of due) {
    const startsAt = starts.get(eventId);
    const userPreferences = preferences.get(userId);
    // Marked before the send, also for a user who gets nothing: else the row stays due and fills each run.
    if (!(await claimDelivery(db, kind, eventId, userId))) continue;
    if (!startsAt || !userPreferences) continue;
    if (
      kind === "event_reminder" &&
      toldWhenAdded(startsAt, userPreferences, told.get(`${eventId}/${userId}`))
    ) {
      continue;
    }
    try {
      const delivered = await deliver(
        enqueue,
        db,
        tenantId,
        kind,
        eventId,
        startsAt,
        userId,
        userPreferences,
        devices.get(userId) ?? [],
      );
      // No email and no device: the reminder stays marked, but it is not sent.
      if (delivered) sent++;
    } catch (error) {
      console.error(
        `[notifications] ${kind} failed:`,
        error instanceof Error ? error.name : "error",
      );
      await releaseDelivery(db, kind, eventId, userId);
      failed++;
    }
  }
  return { sent, failed };
}

/**
 * The outbox entry (the email), if the user gets emails, and the push to the devices. False when
 * nothing went out because the user gets no email and has no device. Throws when the push fails
 * for a user who gets no email: then a later run can try again.
 */
async function deliver(
  enqueue: Enqueue,
  db: SupabaseClient,
  tenantId: string,
  kind: NotificationKind,
  eventId: string,
  startsAt: string,
  userId: string,
  preferences: NotificationPreferencesDTO,
  devices: { endpoint: string; p256dh: string; auth: string }[],
): Promise<boolean> {
  const message = {
    tenantId,
    profileId: userId,
    template: KIND_TEMPLATE[kind],
    eventId,
    startsAt,
  } as const;
  if (preferences.email) await enqueue({ ...message, channel: "email" });

  let pushed = false;
  if (isPushEnabled() && devices.length > 0) {
    const text = KIND_TEXT[kind];
    const untilStart = Math.floor((Date.parse(startsAt) - Date.now()) / 1000);
    const { gone, sent, failed } = await sendPush(
      devices,
      {
        title: text.pushTitle,
        body: text.pushBody,
        url: eventLink(eventId, KIND_TEMPLATE[kind]),
        tag: `${kind}/${eventId}`,
      },
      { ttlSeconds: Math.max(60, Math.min(PUSH_MAX_TTL_S, untilStart)), urgency: "normal" },
    );
    await removeGoneEndpoints(gone, db);
    if (sent > 0) {
      pushed = true;
      await enqueue({ ...message, channel: "push" });
    } else if (!preferences.email && failed > 0) {
      throw new Error("push failed");
    }
  }
  return preferences.email || pushed;
}

async function readStart(db: SupabaseClient, eventId: string): Promise<string | null> {
  return (await readStarts(db, [eventId])).get(eventId) ?? null;
}

async function readStarts(db: SupabaseClient, eventIds: string[]): Promise<Map<string, string>> {
  const { data, error } = await db.from("events").select("id, starts_at").in("id", eventIds);
  if (error) throw databaseError("read event starts", error);
  return new Map(
    z
      .array(z.object({ id: z.uuid(), starts_at: z.string() }))
      .parse(data)
      .map((row) => [row.id, row.starts_at]),
  );
}

// When the "added" notice went out, by `${eventId}/${userId}`. Only for the current start time: a new
// start time removes these rows.
async function listAddedTimes(
  db: SupabaseClient,
  eventIds: string[],
  userIds: string[],
): Promise<Map<string, string>> {
  const { data, error } = await db
    .from("notification_deliveries")
    .select("event_id, user_id, created_at")
    .eq("kind", "event_added")
    .in("event_id", uuidList.parse(eventIds))
    .in("user_id", uuidList.parse(userIds));
  if (error) throw databaseError("list event_added deliveries", error);
  return new Map(
    z
      .array(z.object({ event_id: z.uuid(), user_id: z.uuid(), created_at: z.string() }))
      .parse(data)
      .map((row) => [`${row.event_id}/${row.user_id}`, row.created_at]),
  );
}

/** True if the "added" notice went out within the time of the reminder: it gave the user the date already. */
export function toldWhenAdded(
  startsAt: string,
  preferences: Pick<NotificationPreferencesDTO, "reminderDays">,
  toldAt: string | undefined,
): boolean {
  if (toldAt === undefined) return false;
  return Date.parse(toldAt) >= Date.parse(startsAt) - preferences.reminderDays * DAY_MS;
}

// Marks the reminder as sent before the send, so that two runs at the same time do not both send
// it. False if it is marked already, or if the user is no longer a volunteer of the event.
async function claimDelivery(
  db: SupabaseClient,
  kind: NotificationKind,
  eventId: string,
  userId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("notification_deliveries")
    .upsert(
      { event_id: eventId, user_id: userId, kind },
      { onConflict: "tenant_id,event_id,user_id,kind", ignoreDuplicates: true },
    )
    .select("kind");
  if (error?.code === "23503") return false;
  if (error) throw databaseError("claim notification", error);
  return data.length > 0;
}

// After a failed send: a later run tries again.
async function releaseDelivery(
  db: SupabaseClient,
  kind: NotificationKind,
  eventId: string,
  userId: string,
): Promise<void> {
  const { error } = await db
    .from("notification_deliveries")
    .delete()
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .eq("kind", kind);
  if (error) console.error("[notifications] could not release a notification:", error.code);
}
