import "server-only";

import { z } from "zod";

import type { SupabaseClient } from "@supabase/supabase-js";

import { requireUser } from "@/server/music/auth";
import { getMusicSupabase } from "@/server/music/db";
import { databaseError, idSchema, parseInput } from "./shared";

// The push devices of the user and the preference for the live session push (tables
// `push_subscriptions`, `notification_preferences`; tenant isolation by RLS). A user may have many
// devices. Only the user's own rows change; the sender reads the volunteers' rows
// (`listLivePushTargets`).

const subscriptionSchema = z.strictObject({
  endpoint: z.url().max(2048).startsWith("https://"),
  p256dh: z.string().regex(/^[A-Za-z0-9_-]{1,128}={0,2}$/),
  auth: z.string().regex(/^[A-Za-z0-9_-]{1,64}={0,2}$/),
});

/** At most this many devices per user: a new one beyond it replaces the oldest. */
export const PUSH_DEVICES_PER_USER = 10;

/** Saves the device of the user (the subscription of the browser). Returns false when it is refused. */
export async function savePushSubscription(input: unknown): Promise<boolean> {
  const user = await requireUser();
  const subscription = parseInput(subscriptionSchema, input);
  const db = await getMusicSupabase();
  const { error } = await db
    .from("push_subscriptions")
    .upsert(
      { user_id: user.id, ...subscription, consented_at: new Date().toISOString() },
      { onConflict: "endpoint" },
    );
  // The endpoint belongs to another church's row (the same browser used there): not ours to take.
  if (error?.code === "23505") return false;
  if (error) throw databaseError("save push subscription", error);

  const { data, error: listError } = await db
    .from("push_subscriptions")
    .select("id")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });
  if (listError) throw databaseError("list push subscriptions", listError);
  const stale = z
    .array(z.object({ id: idSchema }))
    .parse(data)
    .slice(PUSH_DEVICES_PER_USER);
  if (stale.length > 0) {
    await db
      .from("push_subscriptions")
      .delete()
      .in(
        "id",
        stale.map((row) => row.id),
      );
  }
  return true;
}

/** Removes the device of the user. */
export async function removePushSubscription(endpoint: unknown): Promise<void> {
  const user = await requireUser();
  const { endpoint: value } = parseInput(subscriptionSchema.pick({ endpoint: true }), { endpoint });
  const { error } = await (
    await getMusicSupabase()
  )
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", value);
  if (error) throw databaseError("remove push subscription", error);
}

/** Removes endpoints that the push service reports as gone (after a send). */
export async function removeGoneEndpoints(
  endpoints: readonly string[],
  client?: SupabaseClient,
): Promise<void> {
  if (endpoints.length === 0) return;
  const { error } = await (client ?? (await getMusicSupabase()))
    .from("push_subscriptions")
    .delete()
    .in("endpoint", [...endpoints]);
  if (error) console.error("[push] could not remove gone devices:", error.code);
}

/** Whether the user gets the push of a live session (default: yes) and how many devices they have. */
export async function getLivePushSettings(): Promise<{ liveSession: boolean; devices: number }> {
  const user = await requireUser();
  const db = await getMusicSupabase();
  const [preference, devices] = await Promise.all([
    db.from("notification_preferences").select("live_session").eq("user_id", user.id).maybeSingle(),
    db
      .from("push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
  ]);
  if (preference.error) throw databaseError("read notification preference", preference.error);
  if (devices.error) throw databaseError("count push subscriptions", devices.error);
  const row = preference.data
    ? z.object({ live_session: z.boolean() }).parse(preference.data)
    : { live_session: true };
  return { liveSession: row.live_session, devices: devices.count ?? 0 };
}

/** Sets whether the user gets the push of a live session. */
export async function setLivePushPreference(enabled: unknown): Promise<void> {
  const user = await requireUser();
  const { enabled: value } = parseInput(z.strictObject({ enabled: z.boolean() }), { enabled });
  const { error } = await (
    await getMusicSupabase()
  )
    .from("notification_preferences")
    .upsert({ user_id: user.id, live_session: value }, { onConflict: "tenant_id,user_id" });
  if (error) throw databaseError("save notification preference", error);
}

export type PushTargetRow = { endpoint: string; p256dh: string; auth: string };

/**
 * The devices of the volunteers of the event who get the live session push: not the leader, not
 * the volunteers who replied "no", not those who switched it off.
 */
export async function listLivePushTargets(
  eventId: string,
  leaderId: string,
): Promise<PushTargetRow[]> {
  const db = await getMusicSupabase();
  const { data: volunteers, error } = await db
    .from("event_volunteers")
    .select("user_id, reply")
    .eq("event_id", eventId)
    .neq("user_id", leaderId);
  if (error) throw databaseError("list volunteers for push", error);
  const ids = z
    .array(z.object({ user_id: idSchema, reply: z.string().nullable() }))
    .parse(volunteers)
    .filter((row) => row.reply !== "no")
    .map((row) => row.user_id);
  if (ids.length === 0) return [];

  const [off, devices] = await Promise.all([
    db
      .from("notification_preferences")
      .select("user_id")
      .in("user_id", ids)
      .eq("live_session", false),
    db.from("push_subscriptions").select("user_id, endpoint, p256dh, auth").in("user_id", ids),
  ]);
  if (off.error) throw databaseError("read notification preferences", off.error);
  if (devices.error) throw databaseError("list push subscriptions", devices.error);
  const silent = new Set(
    z
      .array(z.object({ user_id: idSchema }))
      .parse(off.data)
      .map((r) => r.user_id),
  );
  return z
    .array(
      z.object({ user_id: idSchema, endpoint: z.string(), p256dh: z.string(), auth: z.string() }),
    )
    .parse(devices.data)
    .filter((row) => !silent.has(row.user_id))
    .map(({ endpoint, p256dh, auth }) => ({ endpoint, p256dh, auth }));
}

/**
 * The devices with the push consent of these users, by user (for the notifications of the events).
 * `db` is the tenant client of the caller (a request, or a job for one church).
 */
export async function listPushTargets(
  userIds: readonly string[],
  db: SupabaseClient,
): Promise<Map<string, PushTargetRow[]>> {
  const ids = userIds.filter((id) => idSchema.safeParse(id).success);
  const targets = new Map<string, PushTargetRow[]>();
  if (ids.length === 0) return targets;
  const { data, error } = await db
    .from("push_subscriptions")
    .select("user_id, endpoint, p256dh, auth")
    .in("user_id", ids)
    .not("consented_at", "is", null);
  if (error) throw databaseError("list push devices", error);
  for (const row of z
    .array(
      z.object({ user_id: idSchema, endpoint: z.string(), p256dh: z.string(), auth: z.string() }),
    )
    .parse(data)) {
    targets.set(row.user_id, [
      ...(targets.get(row.user_id) ?? []),
      { endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth },
    ]);
  }
  return targets;
}
