import "server-only";

import { createHash, randomBytes } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { buildCalendar } from "@/lib/music/ical";
import { requireUser } from "@/server/music/auth";
import { getMusicSupabase } from "@/server/music/db";
import { LOG_MESSAGES } from "@/server/music/errors";
import { databaseError } from "./shared";
import { readSetlistItems } from "./setlists";

// The calendar feed of each user who turns it on: a secret link to an iCalendar file with the events
// that the user volunteers for and replied "yes" to or did not reply to yet ("maybe" and "no" stay
// out). Calendar apps cannot sign in, so the token in the link is the only check
// (`app/api/music/calendar/[file]/route.ts`); it is looked up in the tenant of the request.
// The feed works only after the consent of the user (`consented_at`), it holds only the data of
// the user (no names of other volunteers), and the table keeps only the SHA-256 of the token.

const TOKEN_PATTERN = /^[0-9a-f]{64}$/;
/** Ended events stay in the feed for this number of days. */
const PAST_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Whether the feed of the signed-in user is on. The link itself is never stored. */
export async function hasMyCalendarFeed(): Promise<boolean> {
  const user = await requireUser();
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("calendar_feeds")
    .select("user_id")
    .eq("user_id", user.id)
    .not("consented_at", "is", null)
    .maybeSingle();
  if (error) throw databaseError("get calendar feed", error);
  return data !== null;
}

/** Turns the feed on after the consent; the new link, or null when the feed is on already. */
export async function enableMyCalendarFeed(origin: string): Promise<string | null> {
  const user = await requireUser();
  const token = newToken();
  const now = new Date().toISOString();
  const supabase = await getMusicSupabase();
  const consented = await supabase
    .from("calendar_feeds")
    .update({ token_hash: tokenHash(token), created_at: now, consented_at: now })
    .eq("user_id", user.id)
    .is("consented_at", null)
    .select("user_id");
  if (consented.error) throw databaseError("enable calendar feed", consented.error);
  if (consented.data.length > 0) return feedUrl(origin, token);
  const { data, error } = await supabase
    .from("calendar_feeds")
    .upsert(
      { user_id: user.id, token_hash: tokenHash(token), created_at: now, consented_at: now },
      { onConflict: "tenant_id,user_id", ignoreDuplicates: true },
    )
    .select("user_id");
  if (error) throw databaseError("enable calendar feed", error);
  return data.length > 0 ? feedUrl(origin, token) : null;
}

/** A new link; the old one stops working. Null when the feed is off. */
export async function renewMyCalendarFeed(origin: string): Promise<string | null> {
  const user = await requireUser();
  const token = newToken();
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("calendar_feeds")
    .update({ token_hash: tokenHash(token), created_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .not("consented_at", "is", null)
    .select("user_id");
  if (error) throw databaseError("renew calendar feed", error);
  return data.length > 0 ? feedUrl(origin, token) : null;
}

/** Turns the feed off: the link stops working. */
export async function deleteMyCalendarFeed(): Promise<void> {
  const user = await requireUser();
  const { error } = await (
    await getMusicSupabase()
  )
    .from("calendar_feeds")
    .delete()
    .eq("user_id", user.id);
  if (error) throw databaseError("delete calendar feed", error);
}

const eventRow = z.object({
  id: z.uuid(),
  title: z.string(),
  starts_at: z.string(),
  ends_at: z.string().nullable(),
  youtube_url: z.string().nullable(),
  setlist_id: z.uuid().nullable(),
});

/**
 * The iCalendar text of the feed with this token. Null for an unknown token. It does not check a
 * session: `supabase` is the tenant's feed client (see `feedClient`), `origin` the site's origin.
 */
export async function readCalendarFeed(
  supabase: SupabaseClient,
  token: string,
  origin: string,
): Promise<string | null> {
  if (!TOKEN_PATTERN.test(token)) return null;
  const feed = await supabase
    .from("calendar_feeds")
    .select("user_id")
    .eq("token_hash", tokenHash(token))
    .not("consented_at", "is", null)
    .maybeSingle();
  if (feed.error) throw databaseError("read calendar feed", feed.error);
  if (!feed.data) return null;
  const userId = z.object({ user_id: z.uuid() }).parse(feed.data).user_id;

  const volunteering = await supabase
    .from("event_volunteers")
    .select("event_id, reply")
    .eq("user_id", userId);
  if (volunteering.error) throw databaseError("read volunteer events", volunteering.error);
  const ids = z
    .array(z.object({ event_id: z.uuid(), reply: z.string().nullable() }))
    .parse(volunteering.data)
    .filter((row) => row.reply === null || row.reply === "yes")
    .map((row) => row.event_id);

  const now = Date.now();
  const rows =
    ids.length === 0
      ? { data: [], error: null }
      : await supabase
          .from("events")
          .select("id, title, starts_at, ends_at, youtube_url, setlist_id")
          .in("id", ids)
          .gte("starts_at", new Date(now - PAST_DAYS * DAY_MS).toISOString())
          .order("starts_at");
  if (rows.error) throw databaseError("read volunteer events", rows.error);

  const m = LOG_MESSAGES.events.calendar;
  const events = await Promise.all(
    z
      .array(eventRow)
      .parse(rows.data)
      .map(async (event) => {
        const items =
          event.setlist_id === null ? [] : await readSetlistItems(event.setlist_id, supabase);
        const link = new URL(`/munkater/esemenyek/${event.id}`, origin).href;
        const startsAt = new Date(event.starts_at).toISOString();
        return {
          uid: `${event.id}@churchy-music`,
          start: startsAt,
          end: new Date(event.ends_at ?? Date.parse(startsAt) + 90 * 60000).toISOString(),
          title: event.title,
          description: [
            items
              .map(
                (item, index) =>
                  `${index + 1}. ${item.kind === "song" ? item.song.title : item.title}`,
              )
              .join("\n"),
            `${m.eventLink} ${link}`,
            ...(event.youtube_url ? [`${m.youtubeLink} ${event.youtube_url}`] : []),
          ]
            .filter((part) => part !== "")
            .join("\n\n"),
          url: link,
        };
      }),
  );
  return buildCalendar({ name: m.name, now, events });
}

function feedUrl(origin: string, token: string): string {
  return new URL(`/api/music/calendar/${token}.ics`, origin).href;
}

/** 32 random bytes as 64 hex digits. */
function newToken(): string {
  return randomBytes(32).toString("hex");
}

/** The SHA-256 of the token as 64 hex digits: the value of `token_hash`. */
function tokenHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
