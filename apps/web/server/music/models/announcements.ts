import "server-only";

import { lookup } from "node:dns/promises";
import { after } from "next/server";
import { z } from "zod";

import {
  CalendarBudgetError,
  CalendarParseError,
  parseCalendar,
} from "@/lib/music/announcements/ics";
import {
  ANNOUNCEMENT_LIMITS,
  announcementSettingsInputSchema,
  calendarStatusSchema,
  entrySettingsInputSchema,
  manualEntryInputSchema,
  parseSnapshot,
  type AnnouncementDTO,
  type AnnouncementEntryDTO,
  type CalendarEntry,
  type CalendarStatus,
  type EventAnnouncementsDTO,
} from "@/lib/music/announcements/schema";
import { churchDay, endOfMonth, startOfNextMonth } from "@/lib/music/church-time";
import { ipLiteral, isPublicAddress } from "@/lib/music/public-address";
import { requireEventAdmin, requireUser } from "@/server/music/auth";
import { ConflictError } from "@/server/music/errors";
import { isWorkspaceModuleOn } from "@/server/workspace-nav";
import { readAtMost } from "@/server/music/read-limited";
import { getMusicSupabase } from "@/server/music/db";
import {
  readCalendarOptions,
  readCalendarSources,
  readExcludeWords,
} from "./announcement-calendars";
import { canSeeEvent, requireEventAdminOf, visibleEventsFilter, withFilter } from "./event-access";
import { copyEventImageFiles, listSetImagePaths, removeUntakenCopies } from "./event-images";
import { databaseError, idSchema, isId, parseInput } from "./shared";
import { STRAY_FILE_MAX_AGE_MS } from "./stray-files";

// The announcements items of the events (see the migration `announcements` and
// `src/lib/announcements/`). Every signed-in user can see them, as the event.
// The event admins change them.
//
// An announcement keeps a snapshot of the entries of its calendars. A page
// that shows it (the event, the controller) reads the calendars again when the
// snapshot is older than 1 hour and the event did not end: it waits at most
// `REFRESH_WAIT_MS`, then shows the old snapshot, and the read goes on after
// the answer. A calendar that fails keeps its old entries. After the event,
// the snapshot stays as it was.

/** How long a page waits for a read of the calendars before it shows the old snapshot. */
const REFRESH_WAIT_MS = 3000;
/** How long a "Refresh" waits: the editor shows the result. */
const FORCED_REFRESH_WAIT_MS = 15_000;
/** How long one calendar may take. */
const FETCH_TIMEOUT_MS = 10_000;
/** The largest calendar file. */
const MAX_CALENDAR_BYTES = 5 * 1024 * 1024;
/** The most redirects of one calendar read. */
const MAX_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

const ENTRY_COLUMNS =
  "id, calendar_id, uid, occurrence, title, starts_at, ends_at, start_date, end_date, location, description, position, highlighted, excluded, show_time, show_location, show_description, attachment_set_id, qr_text, qr_caption, text_first";

const ANNOUNCEMENT_COLUMNS = `id, event_id, calendar_ids, show_time, show_location, show_description, title_next_week, title_this_month, title_next_month, snapshot, calendar_status, refreshed_at, entries:event_announcement_entries (${ENTRY_COLUMNS})`;

const entryRowSchema = z.object({
  id: z.uuid(),
  calendar_id: z.uuid().nullable(),
  uid: z.string().nullable(),
  occurrence: z.string().nullable(),
  title: z.string().nullable(),
  starts_at: z.string().nullable(),
  ends_at: z.string().nullable(),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
  location: z.string().nullable(),
  description: z.string().nullable(),
  position: z.number().int().nullable(),
  highlighted: z.boolean(),
  excluded: z.boolean(),
  show_time: z.boolean().nullable(),
  show_location: z.boolean().nullable(),
  show_description: z.boolean().nullable(),
  attachment_set_id: z.uuid().nullable(),
  qr_text: z.string().nullable(),
  qr_caption: z.string().nullable(),
  text_first: z.boolean(),
});

const announcementRowSchema = z.object({
  id: z.uuid(),
  event_id: z.uuid(),
  calendar_ids: z.array(z.uuid()).nullable(),
  show_time: z.boolean(),
  show_location: z.boolean(),
  show_description: z.boolean(),
  title_next_week: z.string().nullable(),
  title_this_month: z.string().nullable(),
  title_next_month: z.string().nullable(),
  snapshot: z.unknown(),
  calendar_status: z.unknown(),
  refreshed_at: z.string().nullable(),
  entries: z.array(entryRowSchema),
});

/** A calendar entry by its calendar, UID and occurrence, or any entry by its row. */
const entryTargetSchema = z.union([
  z.strictObject({ entryId: z.uuid() }),
  z.strictObject({
    calendarId: z.uuid(),
    uid: z.string().min(1).max(1000),
    occurrence: z.string().min(1).max(40),
  }),
]);

export type EntryTarget = z.input<typeof entryTargetSchema>;

function toEntry(row: z.infer<typeof entryRowSchema>): AnnouncementEntryDTO {
  const settings = {
    id: row.id,
    highlighted: row.highlighted,
    excluded: row.excluded,
    showTime: row.show_time,
    showLocation: row.show_location,
    showDescription: row.show_description,
    attachmentSetId: row.attachment_set_id,
    qrText: row.qr_text,
    qrCaption: row.qr_caption,
    textFirst: row.text_first,
  };
  if (row.calendar_id && row.uid && row.occurrence) {
    return {
      ...settings,
      source: "calendar",
      calendarId: row.calendar_id,
      uid: row.uid,
      occurrence: row.occurrence,
    };
  }
  return {
    ...settings,
    source: "manual",
    title: row.title ?? "",
    startsAt: row.starts_at && new Date(row.starts_at).toISOString(),
    endsAt: row.ends_at && new Date(row.ends_at).toISOString(),
    startDate: row.start_date,
    endDate: row.end_date,
    location: row.location,
    description: row.description,
    position: row.position ?? 0,
  };
}

function parseStatus(value: unknown): CalendarStatus {
  const result = calendarStatusSchema.safeParse(value);
  return result.success ? result.data : {};
}

function toAnnouncement(row: z.infer<typeof announcementRowSchema>): AnnouncementDTO {
  return {
    id: row.id,
    eventId: row.event_id,
    calendarIds: row.calendar_ids,
    showTime: row.show_time,
    showLocation: row.show_location,
    showDescription: row.show_description,
    titles: {
      nextWeek: row.title_next_week,
      thisMonth: row.title_this_month,
      nextMonth: row.title_next_month,
    },
    snapshot: parseSnapshot(row.snapshot),
    calendarStatus: parseStatus(row.calendar_status),
    refreshedAt: row.refreshed_at,
    entries: row.entries.map(toEntry),
  };
}

/**
 * The announcements of the event, with the calendars and the exclude words.
 * It does not check the session: the caller does, e.g. the page of the event.
 */
export async function readEventAnnouncements(eventId: string): Promise<EventAnnouncementsDTO> {
  if (!isId(eventId)) return { announcements: {}, calendars: [], excludeWords: [] };
  const [{ data, error }, calendars, excludeWords] = await Promise.all([
    (await getMusicSupabase())
      .from("event_announcements")
      .select(ANNOUNCEMENT_COLUMNS)
      .eq("event_id", eventId),
    readCalendarOptions(),
    readExcludeWords(),
  ]);
  if (error) throw databaseError("list event announcements", error);
  const announcements = z.array(announcementRowSchema).parse(data).map(toAnnouncement);
  return {
    announcements: Object.fromEntries(announcements.map((a) => [a.id, a])),
    calendars,
    excludeWords,
  };
}

/**
 * The announcements of the event for a signed-in user, after a read of the old
 * snapshots. None if the user cannot see the event.
 */
export async function listEventAnnouncements(eventId: string): Promise<EventAnnouncementsDTO> {
  const user = await requireUser();
  if (!(await canSeeEvent(user.id, eventId)))
    return { announcements: {}, calendars: [], excludeWords: [] };
  await ensureFreshAnnouncements(eventId);
  return readEventAnnouncements(eventId);
}

// Reads of the calendars ---------------------------------------------------------------

/** Why a calendar did not read: kept in `calendar_status`, the editor shows a text for it. */
class CalendarReadError extends Error {}

function readFailure(error: unknown): CalendarReadError {
  return new CalendarReadError(
    error instanceof Error && error.name === "TimeoutError" ? "timeout" : "network",
  );
}

/** Rejects when the signal aborts, e.g. at the timeout. */
function whenAborted(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

/**
 * Throws "blocked" for an address that is not https or whose host is not
 * public (also a name with one address that is not public, e.g. "localhost"):
 * a superadmin must not reach the internal network of the server with it.
 * The status says nothing more of the host. A gap stays: the DNS can give an
 * other address to the fetch than to this lookup (DNS rebinding).
 */
async function checkPublicUrl(url: URL, signal: AbortSignal): Promise<void> {
  if (url.protocol !== "https:") throw new CalendarReadError("blocked");
  const literal = ipLiteral(url.hostname);
  if (literal !== null) {
    if (!isPublicAddress(literal)) throw new CalendarReadError("blocked");
    return;
  }
  let addresses: { address: string }[];
  try {
    addresses = await Promise.race([lookup(url.hostname, { all: true }), whenAborted(signal)]);
  } catch (error) {
    throw readFailure(error);
  }
  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicAddress(address)))
    throw new CalendarReadError("blocked");
}

async function fetchCalendar(address: string): Promise<string> {
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  let url = new URL(address);
  let response: Response;
  // The redirects are followed here, so each host is checked before its read.
  for (let hop = 0; ; hop++) {
    await checkPublicUrl(url, signal);
    try {
      response = await fetch(url, {
        signal,
        headers: { accept: "text/calendar, */*;q=0.5" },
        cache: "no-store",
        redirect: "manual",
      });
    } catch (error) {
      throw readFailure(error);
    }
    const location = REDIRECT_STATUSES.has(response.status)
      ? response.headers.get("location")
      : null;
    if (location === null) break;
    await response.body?.cancel().catch(() => {});
    if (hop >= MAX_REDIRECTS) throw new CalendarReadError("redirects");
    if (!URL.canParse(location, url)) throw new CalendarReadError(`http_${response.status}`);
    url = new URL(location, url);
  }
  if (!response.ok || !response.body) throw new CalendarReadError(`http_${response.status}`);
  let body: Buffer | null;
  try {
    body = await readAtMost(response.body, MAX_CALENDAR_BYTES);
  } catch (error) {
    throw readFailure(error);
  }
  if (body === null) throw new CalendarReadError("too_large");
  return new TextDecoder().decode(body);
}

/**
 * Reads the calendars of the announcement again, if no other read runs and
 * its event did not end; without `force`, only when the snapshot is older
 * than 1 hour. Returns false when it did not read. It does not check the
 * session: the caller does.
 */
export async function refreshAnnouncement(id: string, force: boolean): Promise<boolean> {
  const supabase = await getMusicSupabase();
  const { data: claimed, error: claimError } = await supabase.rpc("claim_announcement_refresh", {
    p_id: id,
    p_force: force,
  });
  if (claimError) throw databaseError("claim announcement refresh", claimError);
  const row = z
    .array(
      z.object({
        calendar_ids: z.array(z.uuid()).nullable(),
        snapshot: z.unknown(),
        calendar_status: z.unknown(),
        starts_at: z.string(),
      }),
    )
    .parse(claimed)[0];
  if (!row) return false;

  try {
    const eventDay = churchDay(row.starts_at);
    const lastDay = endOfMonth(startOfNextMonth(eventDay));
    const chosen = row.calendar_ids && new Set(row.calendar_ids);
    const sources = (await readCalendarSources()).filter(
      (source) => source.enabled && (!chosen || chosen.has(source.id)),
    );
    const oldSnapshot = parseSnapshot(row.snapshot);
    const oldStatus = parseStatus(row.calendar_status);
    const now = new Date().toISOString();

    const results = await Promise.all(
      sources.map(
        async (
          source,
        ): Promise<{ id: string; entries: CalendarEntry[] | null; error?: string }> => {
          try {
            return {
              id: source.id,
              entries: parseCalendar(await fetchCalendar(source.url), source.id, eventDay, lastDay),
            };
          } catch (error) {
            const code =
              error instanceof CalendarReadError
                ? error.message
                : error instanceof CalendarBudgetError
                  ? "too_many"
                  : error instanceof CalendarParseError
                    ? "parse"
                    : "other";
            if (code === "other")
              console.error("[announcements] Failed to read a calendar:", error);
            return { id: source.id, entries: null, error: code };
          }
        },
      ),
    );

    const snapshot: CalendarEntry[] = [];
    const status: CalendarStatus = {};
    for (const result of results) {
      if (result.entries) {
        snapshot.push(...result.entries);
        status[result.id] = { refreshedAt: now };
      } else {
        // A calendar that did not read keeps its old entries.
        snapshot.push(...oldSnapshot.filter((entry) => entry.calendarId === result.id));
        status[result.id] = { ...oldStatus[result.id], failedAt: now, error: result.error };
      }
    }
    const { error } = await supabase
      .from("event_announcements")
      .update({
        snapshot: snapshot.slice(0, ANNOUNCEMENT_LIMITS.snapshotEntries),
        calendar_status: status,
        refreshed_at: now,
        refresh_started_at: null,
      })
      .eq("id", id);
    if (error) throw databaseError("save announcement snapshot", error);
    return true;
  } catch (error) {
    // The next page can try again at once.
    await supabase.from("event_announcements").update({ refresh_started_at: null }).eq("id", id);
    throw error;
  }
}

/**
 * Reads the calendars of the announcements of the event whose snapshot is
 * old, waiting at most `REFRESH_WAIT_MS`: the reads go on after the answer.
 * A failure is only logged. It does not check the session: the caller does.
 */
export async function ensureFreshAnnouncements(eventId: string): Promise<void> {
  // No refresh while the module is off: a no-op, not an error (the callers expect no throw).
  if (!(await isWorkspaceModuleOn("ws.music.events.announcements"))) return;
  if (!isId(eventId)) return;
  try {
    const { data, error } = await (
      await getMusicSupabase()
    )
      .from("event_announcements")
      .select("id, refreshed_at, refresh_started_at")
      .eq("event_id", eventId);
    if (error) throw databaseError("list announcements to refresh", error);
    const now = Date.now();
    const stale = z
      .array(
        z.object({
          id: z.uuid(),
          refreshed_at: z.string().nullable(),
          refresh_started_at: z.string().nullable(),
        }),
      )
      .parse(data)
      .filter(
        (row) =>
          (row.refreshed_at === null || Date.parse(row.refreshed_at) < now - HOUR_MS) &&
          (row.refresh_started_at === null || Date.parse(row.refresh_started_at) < now - MINUTE_MS),
      );
    if (stale.length === 0) return;
    const work = Promise.allSettled(stale.map((row) => refreshAnnouncement(row.id, false))).then(
      (results) => {
        for (const result of results) {
          if (result.status === "rejected")
            console.error("[announcements] Failed to refresh an announcement:", result.reason);
        }
      },
    );
    after(() => work);
    await Promise.race([work, new Promise((resolve) => setTimeout(resolve, REFRESH_WAIT_MS))]);
  } catch (error) {
    console.error("[announcements] Failed to refresh the announcements:", error);
  }
}

// Changes by the event admins ------------------------------------------------------

/** The event of an announcement, or null if there is no such announcement. */
async function eventOf(announcementId: string): Promise<string | null> {
  if (!isId(announcementId)) return null;
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("event_announcements")
    .select("event_id")
    .eq("id", announcementId)
    .maybeSingle();
  if (error) throw databaseError("get event announcement", error);
  return data ? z.object({ event_id: z.uuid() }).parse(data).event_id : null;
}

/** The user is an event admin who can see the event of the announcement: else `requireEventAdmin()` throws, or false. */
async function canChangeAnnouncement(announcementId: string): Promise<boolean> {
  const user = await requireEventAdmin();
  const eventId = await eventOf(announcementId);
  return eventId !== null && (await canSeeEvent(user.id, eventId));
}

/**
 * A new announcement of the event, for a new announcements item, with its
 * first read. Returns its id, or null if there is no such event, or the user
 * cannot see it.
 */
export async function createAnnouncement(eventId: string): Promise<string | null> {
  if (!(await requireEventAdminOf(eventId))) return null;
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("event_announcements")
    .insert({ event_id: eventId })
    .select("id")
    .single();
  if (error?.code === "23503") return null;
  if (error) throw databaseError("create event announcement", error);
  const id = z.object({ id: z.uuid() }).parse(data).id;
  await waitForRefresh(id, REFRESH_WAIT_MS);
  return id;
}

/** Reads the calendars of the announcement now, waiting at most `wait`; the read goes on after the answer. */
async function waitForRefresh(id: string, wait: number): Promise<void> {
  const work = refreshAnnouncement(id, true).catch((error) =>
    console.error("[announcements] Failed to refresh an announcement:", error),
  );
  after(() => work);
  await Promise.race([work, new Promise((resolve) => setTimeout(resolve, wait))]);
}

/**
 * Changes the calendars, the details and the titles of the sections. A change
 * of the calendars reads them again. False if there is no such announcement,
 * or the user cannot see its event.
 */
export async function updateAnnouncement(id: string, input: unknown): Promise<boolean> {
  if (!(await canChangeAnnouncement(id))) return false;
  const settings = parseInput(announcementSettingsInputSchema, input);
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("event_announcements")
    .update({
      ...(settings.calendarIds !== undefined && { calendar_ids: settings.calendarIds }),
      ...(settings.showTime !== undefined && { show_time: settings.showTime }),
      ...(settings.showLocation !== undefined && { show_location: settings.showLocation }),
      ...(settings.showDescription !== undefined && { show_description: settings.showDescription }),
      ...(settings.titles?.nextWeek !== undefined && { title_next_week: settings.titles.nextWeek }),
      ...(settings.titles?.thisMonth !== undefined && {
        title_this_month: settings.titles.thisMonth,
      }),
      ...(settings.titles?.nextMonth !== undefined && {
        title_next_month: settings.titles.nextMonth,
      }),
    })
    .eq("id", id)
    .select("id");
  if (error) throw databaseError("update event announcement", error);
  if (data.length === 0) return false;
  if (settings.calendarIds !== undefined) await waitForRefresh(id, FORCED_REFRESH_WAIT_MS);
  return true;
}

/** Reads the calendars of the announcement now. False if there is no such announcement, or the user cannot see its event. */
export async function refreshAnnouncementNow(id: string): Promise<boolean> {
  if (!(await canChangeAnnouncement(id))) return false;
  await waitForRefresh(id, FORCED_REFRESH_WAIT_MS);
  return true;
}

const UNDATED_HIGHLIGHT: () => Error = () =>
  new ConflictError(({ m }) => m.server.announcements.undatedHighlight);

/** The entry has a QR code. False when it has no row yet. */
async function hasQrText(
  announcementId: string,
  target: z.output<typeof entryTargetSchema>,
): Promise<boolean> {
  const query = (await getMusicSupabase())
    .from("event_announcement_entries")
    .select("qr_text")
    .eq("announcement_id", announcementId);
  const { data, error } = await (
    "entryId" in target
      ? query.eq("id", target.entryId)
      : query
          .eq("calendar_id", target.calendarId)
          .eq("uid", target.uid)
          .eq("occurrence", target.occurrence)
  ).maybeSingle();
  if (error) throw databaseError("get announcement entry QR code", error);
  return z.object({ qr_text: z.string().nullable() }).nullable().parse(data)?.qr_text != null;
}

/** The row of the entry: by its id, or the settings of a calendar entry, made when it has none. Null if there is no such entry. */
async function entryRow(
  announcementId: string,
  target: z.output<typeof entryTargetSchema>,
  columns: Record<string, unknown>,
): Promise<string | null> {
  const supabase = await getMusicSupabase();
  if ("entryId" in target && Object.keys(columns).length === 0) {
    const { data, error } = await supabase
      .from("event_announcement_entries")
      .select("id")
      .eq("id", target.entryId)
      .eq("announcement_id", announcementId)
      .maybeSingle();
    if (error) throw databaseError("get announcement entry", error);
    return data ? z.object({ id: z.uuid() }).parse(data).id : null;
  }
  if ("entryId" in target) {
    const { data, error } = await supabase
      .from("event_announcement_entries")
      .update(columns)
      .eq("id", target.entryId)
      .eq("announcement_id", announcementId)
      .select("id");
    if (error)
      throw databaseError("update announcement entry", error, { "23514": UNDATED_HIGHLIGHT });
    return data[0] ? z.object({ id: z.uuid() }).parse(data[0]).id : null;
  }
  const { data, error } = await supabase
    .from("event_announcement_entries")
    .upsert(
      {
        announcement_id: announcementId,
        calendar_id: target.calendarId,
        uid: target.uid,
        occurrence: target.occurrence,
        ...columns,
      },
      { onConflict: "announcement_id,calendar_id,uid,occurrence" },
    )
    .select("id");
  // 23503: no such announcement or calendar.
  if (error?.code === "23503") return null;
  if (error) throw databaseError("save announcement entry settings", error);
  return z.array(z.object({ id: z.uuid() })).parse(data)[0]?.id ?? null;
}

/** Saves the settings of an entry (see `EntrySettingsInput`). Returns false if there is no such entry, or the user cannot see its event. */
export async function saveEntrySettings(
  announcementId: string,
  target: unknown,
  input: unknown,
): Promise<boolean> {
  if (!(await canChangeAnnouncement(announcementId))) return false;
  const entry = parseInput(entryTargetSchema, target);
  const settings = parseInput(entrySettingsInputSchema, input);
  // A caption needs a QR code (`event_announcement_entries_qr_check`).
  if (
    settings.qrCaption &&
    settings.qrText === undefined &&
    !(await hasQrText(announcementId, entry))
  ) {
    throw new ConflictError(({ m }) => m.server.announcements.qrCaptionWithoutText);
  }
  const columns = {
    ...(settings.highlighted !== undefined && { highlighted: settings.highlighted }),
    ...(settings.excluded !== undefined && { excluded: settings.excluded }),
    ...(settings.showTime !== undefined && { show_time: settings.showTime }),
    ...(settings.showLocation !== undefined && { show_location: settings.showLocation }),
    ...(settings.showDescription !== undefined && { show_description: settings.showDescription }),
    ...(settings.qrText !== undefined && { qr_text: settings.qrText }),
    // A caption needs a QR code.
    ...((settings.qrCaption !== undefined || settings.qrText === null) && {
      qr_caption: settings.qrText === null ? null : settings.qrCaption,
    }),
    ...(settings.textFirst !== undefined && { text_first: settings.textFirst }),
  };
  return (await entryRow(announcementId, entry, columns)) !== null;
}

/**
 * Adds a manual entry (without `entryId`) or changes one. An entry without a
 * date is always highlighted. False if there is no such entry, or the user
 * cannot see its event.
 */
export async function saveManualEntry(
  announcementId: string,
  entryId: string | null,
  input: unknown,
): Promise<boolean> {
  if (!(await canChangeAnnouncement(announcementId))) return false;
  const entry = parseInput(manualEntryInputSchema, input);
  if (entryId !== null && !isId(entryId)) return false;
  const undated = entry.startsAt === null && entry.startDate === null;
  const columns = {
    title: entry.title,
    starts_at: entry.startsAt,
    ends_at: entry.endsAt,
    start_date: entry.startDate,
    end_date: entry.endDate,
    location: entry.location,
    description: entry.description,
    ...(undated && { highlighted: true }),
  };
  const supabase = await getMusicSupabase();
  if (entryId) {
    const { data, error } = await supabase
      .from("event_announcement_entries")
      .update(columns)
      .eq("id", entryId)
      .eq("announcement_id", announcementId)
      .is("calendar_id", null)
      .select("id");
    if (error) throw databaseError("update manual announcement entry", error);
    return data.length > 0;
  }
  const { data: rows, error: countError } = await supabase
    .from("event_announcement_entries")
    .select("position")
    .eq("announcement_id", announcementId)
    .is("calendar_id", null);
  if (countError) throw databaseError("count manual announcement entries", countError);
  const positions = z.array(z.object({ position: z.number().int() })).parse(rows);
  if (positions.length >= ANNOUNCEMENT_LIMITS.manualEntries) {
    throw new ConflictError(({ m, format }) =>
      format(m.server.announcements.tooManyEntries, { max: ANNOUNCEMENT_LIMITS.manualEntries }),
    );
  }
  const position = positions.reduce((max, row) => Math.max(max, row.position + 1), 0);
  const { error } = await supabase
    .from("event_announcement_entries")
    .insert({ announcement_id: announcementId, position, ...columns });
  if (error?.code === "23503") return false;
  if (error) throw databaseError("add manual announcement entry", error);
  return true;
}

/** Removes a manual entry, or the settings of a calendar entry. False if there is no such entry, or the user cannot see its event. */
export async function removeEntry(announcementId: string, entryId: string): Promise<boolean> {
  if (!(await canChangeAnnouncement(announcementId))) return false;
  if (!isId(entryId)) return false;
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("event_announcement_entries")
    .delete()
    .eq("id", entryId)
    .eq("announcement_id", announcementId)
    .select("id");
  if (error) throw databaseError("remove announcement entry", error);
  return data.length > 0;
}

/**
 * Gives a set of images of the event to an entry (see `createEventImageSet`),
 * or none for null. Returns the id of the row of the entry, or null if there
 * is no such entry, or the user cannot see its event.
 */
export async function setEntryAttachment(
  announcementId: string,
  target: unknown,
  setId: string | null,
): Promise<string | null> {
  if (!(await canChangeAnnouncement(announcementId))) return null;
  const entry = parseInput(entryTargetSchema, target);
  const attachment = setId === null ? null : parseInput(idSchema, setId);
  const entryId = await entryRow(announcementId, entry, {});
  if (!entryId) return null;
  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("set_announcement_entry_attachment", { p_entry_id: entryId, p_set_id: attachment });
  if (error) {
    throw databaseError("set announcement attachment", error, {
      "P0001:event_image_set": () =>
        new ConflictError(({ m }) => m.server.eventImages.imageSetMissing),
    });
  }
  return data === true ? entryId : null;
}

/** An event with an announcements item, to copy its entries. */
export type AnnouncementSourceDTO = {
  announcementId: string;
  eventId: string;
  title: string;
  startsAt: string;
};

/**
 * The recent and the next events with announcements items that the user can
 * see, the newest first, without the event `eventId`.
 */
export async function listAnnouncementSources(eventId: string): Promise<AnnouncementSourceDTO[]> {
  const user = await requireEventAdmin();
  const now = new Date().toISOString();
  const since = new Date(Date.now() - 120 * 24 * HOUR_MS).toISOString();
  const filter = await visibleEventsFilter(user);
  const supabase = await getMusicSupabase();
  const events = () =>
    withFilter(
      supabase
        .from("events")
        .select(
          "id, title, starts_at, setlist:setlists (setlist_items (announcement_id, position))",
        )
        .neq("id", isId(eventId) ? eventId : "00000000-0000-0000-0000-000000000000"),
      filter,
    );
  // Separate limits, so many future events (e.g. copies) do not push out the last Sunday.
  const [past, next] = await Promise.all([
    events()
      .gte("starts_at", since)
      .lt("starts_at", now)
      .order("starts_at", { ascending: false })
      .limit(60),
    events().gte("starts_at", now).order("starts_at", { ascending: true }).limit(60),
  ]);
  const error = past.error ?? next.error;
  if (error) throw databaseError("list announcement sources", error);
  const data = [...(next.data ?? []).toReversed(), ...(past.data ?? [])];
  return z
    .array(
      z.object({
        id: z.uuid(),
        title: z.string(),
        starts_at: z.string(),
        setlist: z
          .object({
            setlist_items: z.array(
              z.object({ announcement_id: z.uuid().nullable(), position: z.number().int() }),
            ),
          })
          .nullable(),
      }),
    )
    .parse(data)
    .flatMap((event) =>
      (event.setlist?.setlist_items ?? [])
        .filter((item) => item.announcement_id !== null)
        .toSorted((a, b) => a.position - b.position)
        .map((item) => ({
          announcementId: item.announcement_id as string,
          eventId: event.id,
          title: event.title,
          startsAt: event.starts_at,
        })),
    );
}

/** The sets of the attachments of the entries of the announcements. It does not check the session. */
export async function readAttachmentSetIds(announcementIds: string[]): Promise<string[]> {
  const ids = announcementIds.filter(isId);
  if (ids.length === 0) return [];
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("event_announcement_entries")
    .select("attachment_set_id")
    .in("announcement_id", ids)
    .not("attachment_set_id", "is", null);
  if (error) throw databaseError("list announcement attachments", error);
  return z
    .array(z.object({ attachment_set_id: z.uuid() }))
    .parse(data)
    .map((row) => row.attachment_set_id);
}

/**
 * Copies the settings and the entries of the announcement `sourceId` (e.g. of
 * the previous event) to the announcement `id`, in place of its entries, with
 * copies of the files of the attachments; then reads its calendars. The
 * entries that ended before its event stay behind. False if there is no such
 * announcement, or the user cannot see one of the two events.
 */
export async function copyAnnouncement(id: string, sourceId: string): Promise<boolean> {
  const user = await requireEventAdmin();
  const [eventId, sourceEventId] = await Promise.all([eventOf(id), eventOf(sourceId)]);
  if (!eventId || !sourceEventId) return false;
  const [canSeeTarget, canSeeSource] = await Promise.all([
    canSeeEvent(user.id, eventId),
    canSeeEvent(user.id, sourceEventId),
  ]);
  if (!canSeeTarget || !canSeeSource) return false;
  const files = await copyEventImageFiles(
    eventId,
    await listSetImagePaths(await readAttachmentSetIds([sourceId])),
  );
  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("copy_event_announcement", { p_source_id: sourceId, p_target_id: id, p_files: files });
  if (error) throw databaseError("copy event announcement", error);
  await removeUntakenCopies(eventId, files);
  if (data !== true) return false;
  await waitForRefresh(id, FORCED_REFRESH_WAIT_MS);
  return true;
}

/**
 * Deletes the announcements that no item uses and that are
 * `STRAY_FILE_MAX_AGE_MS` old, e.g. of a removed item. Their attachments go
 * with the next `removeUnusedEventImageSets`. The scheduled job calls it. It
 * does not check the session.
 */
export async function removeUnusedAnnouncements(): Promise<void> {
  const before = new Date(Date.now() - STRAY_FILE_MAX_AGE_MS).toISOString();
  const { error } = await (
    await getMusicSupabase()
  ).rpc("delete_unused_event_announcements", { p_before: before });
  if (error)
    console.error("[announcements] Failed to delete the unused announcements:", error.message);
}
