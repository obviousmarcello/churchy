import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { REMINDER_DAYS, SETLIST_HOURS } from "@/lib/music/notifications";
import { requireUser } from "@/server/music/auth";
import { getMusicSupabase } from "@/server/music/db";
import { zodMessage } from "@/server/music/zod-i18n";
import { databaseError, isId, parseInput } from "./shared";

// The notifications of each user: the emails (the outbox) and push. All are on until the user turns
// them off on the notifications page. The kinds are the same for both. The push goes to the
// devices where the user turned it on (`./push-subscriptions.ts`). They go out from
// `@/server/music/notifications`. The time zone of the times is the church's (Europe/Budapest).

export type NotificationPreferencesDTO = {
  /** The emails. Off: only push, on the devices that have it. */
  email: boolean;
  /** "Added to an event". */
  eventAdded: boolean;
  /** "Event is within n days". */
  eventReminder: boolean;
  reminderDays: number;
  /** "The setlist n hours before the event". */
  setlist: boolean;
  setlistHours: number;
  /** "A live session of my event started". Push only. */
  liveSession: boolean;
};

// For a user who never saved the preferences. Keep in sync with the column defaults and
// `list_due_notifications()` (migration 0022).
const DEFAULT_PREFERENCES: NotificationPreferencesDTO = {
  email: true,
  eventAdded: true,
  eventReminder: true,
  reminderDays: REMINDER_DAYS.default,
  setlist: true,
  setlistHours: SETLIST_HOURS.default,
  liveSession: true,
};

const REQUIRED = zodMessage(({ m }) => m.common.validation.required);

// The number of a kind that is off can be empty: then the saved number stays.
const preferencesInputSchema = z
  .strictObject({
    email: z.boolean(),
    eventAdded: z.boolean(),
    eventReminder: z.boolean(),
    reminderDays: z.number().int().min(REMINDER_DAYS.min).max(REMINDER_DAYS.max).optional(),
    setlist: z.boolean(),
    setlistHours: z.number().int().min(SETLIST_HOURS.min).max(SETLIST_HOURS.max).optional(),
  })
  .refine((input) => !input.eventReminder || input.reminderDays !== undefined, {
    path: ["reminderDays"],
    message: REQUIRED,
  })
  .refine((input) => !input.setlist || input.setlistHours !== undefined, {
    path: ["setlistHours"],
    message: REQUIRED,
  });

const PREFERENCES_COLUMNS =
  "user_id, email, event_added, event_reminder, reminder_days, setlist, setlist_hours, live_session";

const preferencesRowSchema = z.object({
  user_id: z.uuid(),
  email: z.boolean(),
  event_added: z.boolean(),
  event_reminder: z.boolean(),
  reminder_days: z.number().int(),
  setlist: z.boolean(),
  setlist_hours: z.number().int(),
  live_session: z.boolean(),
});

export async function getMyNotificationPreferences(): Promise<NotificationPreferencesDTO> {
  const user = await requireUser();
  return (await listNotificationPreferences([user.id])).get(user.id) ?? DEFAULT_PREFERENCES;
}

export async function updateMyNotificationPreferences(input: unknown): Promise<void> {
  const user = await requireUser();
  const preferences = parseInput(preferencesInputSchema, input);

  // An upsert changes only the columns that it sends. A new row gets the column defaults for the others
  // (`live_session` is saved on the push settings).
  const { error } = await (await getMusicSupabase()).from("notification_preferences").upsert(
    {
      user_id: user.id,
      email: preferences.email,
      event_added: preferences.eventAdded,
      event_reminder: preferences.eventReminder,
      ...(preferences.reminderDays !== undefined && { reminder_days: preferences.reminderDays }),
      setlist: preferences.setlist,
      ...(preferences.setlistHours !== undefined && { setlist_hours: preferences.setlistHours }),
    },
    { onConflict: "tenant_id,user_id" },
  );
  if (error) throw databaseError("save notification preferences", error);
}

// For the sender of the notifications. It does not check the session: the caller does.

/** The preferences of these users. A user without saved preferences gets the defaults. */
export async function listNotificationPreferences(
  userIds: string[],
  db?: SupabaseClient,
): Promise<Map<string, NotificationPreferencesDTO>> {
  const ids = userIds.filter(isId);
  if (ids.length === 0) return new Map();

  const { data, error } = await (db ?? (await getMusicSupabase()))
    .from("notification_preferences")
    .select(PREFERENCES_COLUMNS)
    .in("user_id", ids);
  if (error) throw databaseError("list notification preferences", error);

  const saved = new Map(
    z
      .array(preferencesRowSchema)
      .parse(data)
      .map((row) => [
        row.user_id,
        {
          email: row.email,
          eventAdded: row.event_added,
          eventReminder: row.event_reminder,
          reminderDays: row.reminder_days,
          setlist: row.setlist,
          setlistHours: row.setlist_hours,
          liveSession: row.live_session,
        },
      ]),
  );
  return new Map(ids.map((id) => [id, saved.get(id) ?? DEFAULT_PREFERENCES]));
}
