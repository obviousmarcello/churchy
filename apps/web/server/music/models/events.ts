import "server-only";

import { randomUUID } from "node:crypto";

import { expandEvents, tryParseRRule, type ExpandWindow } from "@churchy/events";
import { slugify } from "@churchy/hu";
import { z } from "zod";

import { toYoutubeUrl } from "@/lib/music/youtube";
import { requireEventAdmin, requireUser, type CurrentUser } from "@/server/music/auth";
import { getMusicSupabase } from "@/server/music/db";
import { ConflictError } from "@/server/music/errors";
import { zodMessage } from "@/server/music/zod-i18n";
import { readEventBlocks, type EventBlockDTO } from "./event-blocks";
import {
  readSetlistItems,
  setlistItemsInputSchema,
  toItemsArgument,
  type SetlistItemDTO,
} from "./setlists";
import { playKeySchema } from "./arrangements";
import { databaseError, idSchema, isId, lowerIdSchema, parseInput, requiredText } from "./shared";

// Music events (Music Sheet DB `events.ts`, merged into Churchy's one `events` table, PLAN §11).
// Every music event lives in the tenant's music calendar (`music_calendar_id()`, internal
// visibility); the music role's RLS (`music_scope`, 0011) cannot reach any other event. A private
// event is seen by its creator and by event admins only. A series is one master with an RFC 5545
// `rrule` (+ `exdates`); one changed occurrence is a child event (`parent_event_id` +
// `recurrence_id`), as everywhere in Churchy. Setlist items, blocks, volunteers and the
// announcements come with the next slices.

export type EventDTO = {
  id: string;
  title: string;
  /** ISO 8601 timestamp in UTC. */
  startsAt: string;
  durationMinutes: number;
  /** ISO 8601 timestamp in UTC: `startsAt` plus the duration. */
  endsAt: string;
  /** An https link to YouTube, e.g. the live stream, or null. */
  youtubeUrl: string | null;
  /** Only its creator and the event admins see it. */
  isPrivate: boolean;
  /** RFC 5545 rule of a series master, else null. */
  rrule: string | null;
  /** Dates (YYYY-MM-DD) left out of the series. */
  exdates: string[];
  /** The master of a changed occurrence, else null. */
  parentEventId: string | null;
  /** The original start of a changed occurrence, else null. */
  recurrenceId: string | null;
  /** The event's own setlist, else null. */
  setlistId: string | null;
  createdBy: string | null;
};

/** One occurrence of an event in a window: a single event, a series occurrence or a change. */
export type EventOccurrenceDTO = {
  event: EventDTO;
  startsAt: string;
  endsAt: string;
  /** The series master's id for an occurrence of a series, else the event's id. */
  seriesId: string;
  /** The original start of a series occurrence, else null. */
  recurrenceId: string | null;
};

export const DEFAULT_EVENT_DURATION_MINUTES = 90;
/** An occurrence window is at most this many days (as `expandEvents`). */
export const MAX_SERIES_WINDOW_DAYS = 400;

const YOUTUBE_URL_INVALID = zodMessage(({ m }) => m.server.events.youtubeUrlInvalid);
const RRULE_INVALID = zodMessage(({ m }) => m.server.events.rruleInvalid);

const youtubeUrlSchema = z
  .string()
  .nullable()
  .transform((value, ctx) => {
    if (!value?.trim()) return null;
    const url = toYoutubeUrl(value);
    if (url === null) {
      ctx.addIssue({ code: "custom", message: YOUTUBE_URL_INVALID });
      return z.NEVER;
    }
    return url;
  });

const rruleSchema = z
  .string()
  .min(1)
  .max(500)
  .refine((value) => tryParseRRule(value) !== null, { message: RRULE_INVALID });

export const eventInputSchema = z.strictObject({
  title: requiredText(200),
  // An explicit offset is required, so the stored instant is never ambiguous.
  startsAt: z.iso.datetime({ offset: true }),
  durationMinutes: z.number().int().min(1).max(1440),
  youtubeUrl: youtubeUrlSchema,
  isPrivate: z.boolean(),
  /** Makes the event a series master. */
  rrule: rruleSchema.nullable(),
});

// Only a new event gets the defaults. An update without them is an error, so it cannot reset
// them by mistake.
const newEventInputSchema = eventInputSchema.extend({
  durationMinutes: eventInputSchema.shape.durationMinutes.default(DEFAULT_EVENT_DURATION_MINUTES),
  youtubeUrl: youtubeUrlSchema.default(null),
  isPrivate: eventInputSchema.shape.isPrivate.default(false),
  rrule: eventInputSchema.shape.rrule.default(null),
});

/** A change of some of the details: the others keep the values that the event has. */
const eventPatchInputSchema = eventInputSchema.omit({ rrule: true }).partial();

export type EventInput = z.input<typeof eventInputSchema>;
export type NewEventInput = z.input<typeof newEventInputSchema>;
export type EventPatchInput = z.input<typeof eventPatchInputSchema>;

const EVENT_COLUMNS =
  "id, title, starts_at, ends_at, youtube_url, is_private, rrule, exdates, parent_event_id, recurrence_id, setlist_id, created_by";

const eventRowSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  starts_at: z.string(),
  ends_at: z.string().nullable(),
  youtube_url: z.string().nullable(),
  is_private: z.boolean(),
  rrule: z.string().nullable(),
  exdates: z.array(z.string()),
  parent_event_id: z.uuid().nullable(),
  recurrence_id: z.string().nullable(),
  setlist_id: z.uuid().nullable(),
  created_by: z.uuid().nullable(),
});

type EventRow = z.infer<typeof eventRowSchema>;

const iso = (value: string) => new Date(value).toISOString();

function toEvent(row: EventRow): EventDTO {
  const startsAt = iso(row.starts_at);
  const endsAt = row.ends_at === null ? startsAt : iso(row.ends_at);
  return {
    id: row.id.toLowerCase(),
    title: row.title,
    startsAt,
    durationMinutes: Math.max(1, Math.round((Date.parse(endsAt) - Date.parse(startsAt)) / 60000)),
    endsAt,
    youtubeUrl: row.youtube_url,
    isPrivate: row.is_private,
    rrule: row.rrule,
    exdates: row.exdates,
    parentEventId: row.parent_event_id?.toLowerCase() ?? null,
    recurrenceId: row.recurrence_id === null ? null : iso(row.recurrence_id),
    setlistId: row.setlist_id?.toLowerCase() ?? null,
    createdBy: row.created_by?.toLowerCase() ?? null,
  };
}

const endOf = (startsAt: string, durationMinutes: number) =>
  new Date(Date.parse(startsAt) + durationMinutes * 60000).toISOString();

/** The slug of a music event: unique per tenant, from the title and date. */
function eventSlug(title: string, startsAt: string): string {
  const base = slugify(title).slice(0, 60) || "esemeny";
  return `${base}-${startsAt.slice(0, 10)}-${randomUUID().slice(0, 8)}`;
}

/** The filter (`.or()`) for the events that the user sees; null for an event admin: all. */
function visibleFilter(user: CurrentUser): string | null {
  return user.canEditEvents ? null : `is_private.eq.false,created_by.eq.${user.id}`;
}

async function musicCalendarId(): Promise<string> {
  const { data, error } = await (await getMusicSupabase()).rpc("music_calendar_id");
  if (error) throw databaseError("find the music calendar", error);
  return z.uuid().parse(data);
}

// The reads check the session too, not only the proxy.

/** The events (series masters and changed occurrences included) that the user can see. */
export async function listEvents(): Promise<EventDTO[]> {
  const user = await requireUser();
  const filter = visibleFilter(user);
  let query = (await getMusicSupabase()).from("events").select(EVENT_COLUMNS);
  if (filter !== null) query = query.or(filter);
  const { data, error } = await query.order("starts_at", { ascending: true });
  if (error) throw databaseError("list events", error);
  return z.array(eventRowSchema).parse(data).map(toEvent);
}

/**
 * The occurrences in the window, series expanded in Europe/Budapest, changed occurrences in
 * place of the originals. The window is at most `MAX_SERIES_WINDOW_DAYS`.
 */
export async function listEventOccurrences(window: ExpandWindow): Promise<EventOccurrenceDTO[]> {
  const events = await listEvents();
  const byId = new Map(events.map((event) => [event.id, event]));
  return expandEvents(
    events.map((event) => ({
      id: event.id,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      allDay: false,
      rrule: event.rrule,
      exdates: event.exdates,
      parentEventId: event.parentEventId,
      recurrenceId: event.recurrenceId,
    })),
    window,
  ).map((occurrence) => ({
    event: byId.get(occurrence.event.id)!,
    startsAt: occurrence.start,
    endsAt: occurrence.end,
    seriesId: occurrence.seriesId ?? occurrence.event.id,
    recurrenceId: occurrence.recurrenceId,
  }));
}

/** One event, or null when it does not exist or the user cannot see it. */
export async function getEvent(id: string): Promise<EventDTO | null> {
  const user = await requireUser();
  if (!isId(id)) return null;
  const filter = visibleFilter(user);
  let query = (await getMusicSupabase()).from("events").select(EVENT_COLUMNS).eq("id", id);
  if (filter !== null) query = query.or(filter);
  const { data, error } = await query.maybeSingle();
  if (error) throw databaseError("read an event", error);
  return data === null ? null : toEvent(eventRowSchema.parse(data));
}

/** Adds an event, or a series when `rrule` is given. */
export async function createEvent(input: NewEventInput): Promise<EventDTO> {
  const user = await requireEventAdmin();
  const event = parseInput(newEventInputSchema, input);
  const startsAt = iso(event.startsAt);
  const supabase = await getMusicSupabase();
  const { data, error } = await supabase
    .from("events")
    .insert({
      tenant_id: user.tenantId,
      calendar_id: await musicCalendarId(),
      visibility: "staff",
      status: "published",
      slug: eventSlug(event.title, startsAt),
      title: event.title,
      starts_at: startsAt,
      ends_at: endOf(startsAt, event.durationMinutes),
      youtube_url: event.youtubeUrl,
      is_private: event.isPrivate,
      rrule: event.rrule,
      created_by: user.id,
    })
    .select(EVENT_COLUMNS)
    .single();
  if (error) throw databaseError("create an event", error);
  return toEvent(eventRowSchema.parse(data));
}

/**
 * Changes the details of an event (a series master changes the whole series; use
 * `changeOccurrence()` for one occurrence). Null when the event is not there or not visible.
 */
export async function updateEvent(id: string, patch: EventPatchInput): Promise<EventDTO | null> {
  await requireEventAdmin();
  if (!isId(id)) return null;
  const changes = parseInput(eventPatchInputSchema, patch);
  const current = await getEvent(id);
  if (current === null) return null;
  const startsAt = iso(changes.startsAt ?? current.startsAt);
  const durationMinutes = changes.durationMinutes ?? current.durationMinutes;
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("events")
    .update({
      title: changes.title ?? current.title,
      starts_at: startsAt,
      ends_at: endOf(startsAt, durationMinutes),
      youtube_url: changes.youtubeUrl === undefined ? current.youtubeUrl : changes.youtubeUrl,
      is_private: changes.isPrivate ?? current.isPrivate,
    })
    .eq("id", id)
    .select(EVENT_COLUMNS)
    .maybeSingle();
  if (error) throw databaseError("update an event", error);
  return data === null ? null : toEvent(eventRowSchema.parse(data));
}

/** Deletes an event (with its changed occurrences). False when it is not there. */
export async function deleteEvent(id: string): Promise<boolean> {
  await requireEventAdmin();
  if (!isId(id) || (await getEvent(id)) === null) return false;
  const { error } = await (await getMusicSupabase()).from("events").delete().eq("id", id);
  if (error) throw databaseError("delete an event", error);
  return true;
}

const occurrenceInputSchema = z.strictObject({
  masterId: lowerIdSchema,
  /** The original start of the occurrence (an instant of the series). */
  recurrenceId: z.iso.datetime({ offset: true }),
});

async function seriesMaster(masterId: string, recurrenceId: string): Promise<EventDTO> {
  const master = await getEvent(masterId);
  if (master === null || master.rrule === null) {
    throw new ConflictError(({ m }) => m.server.events.occurrenceMissing);
  }
  const start = Date.parse(recurrenceId);
  const hit = expandEvents(
    [
      {
        id: master.id,
        startsAt: master.startsAt,
        endsAt: master.endsAt,
        allDay: false,
        rrule: master.rrule,
        exdates: master.exdates,
        parentEventId: null,
        recurrenceId: null,
      },
    ],
    { from: new Date(start - 1000).toISOString(), to: new Date(start + 1000).toISOString() },
  ).some((o) => Date.parse(o.start) === start);
  if (!hit) throw new ConflictError(({ m }) => m.server.events.occurrenceMissing);
  return master;
}

/**
 * Changes one occurrence of a series: a child event (`parent_event_id` + `recurrence_id`) with
 * its own details and, later, its own setlist. The same call changes an existing child.
 */
export async function changeOccurrence(
  input: z.input<typeof occurrenceInputSchema>,
  patch: EventPatchInput,
): Promise<EventDTO> {
  const user = await requireEventAdmin();
  const { masterId, recurrenceId } = parseInput(occurrenceInputSchema, input);
  const changes = parseInput(eventPatchInputSchema, patch);
  const master = await seriesMaster(masterId, recurrenceId);
  const supabase = await getMusicSupabase();
  const startsAt = iso(changes.startsAt ?? recurrenceId);
  const durationMinutes = changes.durationMinutes ?? master.durationMinutes;
  const values = {
    title: changes.title ?? master.title,
    starts_at: startsAt,
    ends_at: endOf(startsAt, durationMinutes),
    youtube_url: changes.youtubeUrl === undefined ? master.youtubeUrl : changes.youtubeUrl,
    is_private: changes.isPrivate ?? master.isPrivate,
  };
  const existing = await supabase
    .from("events")
    .select("id")
    .eq("parent_event_id", masterId)
    .eq("recurrence_id", iso(recurrenceId))
    .maybeSingle();
  if (existing.error) throw databaseError("find a changed occurrence", existing.error);
  const { data, error } = existing.data
    ? await supabase
        .from("events")
        .update(values)
        .eq("id", existing.data.id)
        .select(EVENT_COLUMNS)
        .single()
    : await supabase
        .from("events")
        .insert({
          ...values,
          tenant_id: user.tenantId,
          calendar_id: await musicCalendarId(),
          visibility: "staff",
          status: "published",
          slug: eventSlug(values.title, startsAt),
          parent_event_id: masterId,
          recurrence_id: iso(recurrenceId),
          created_by: user.id,
        })
        .select(EVENT_COLUMNS)
        .single();
  if (error) throw databaseError("change an occurrence", error);
  return toEvent(eventRowSchema.parse(data));
}

/** Leaves one occurrence out of a series (an `exdate`, Europe/Budapest day). */
export async function skipOccurrence(input: z.input<typeof occurrenceInputSchema>): Promise<void> {
  await requireEventAdmin();
  const { masterId, recurrenceId } = parseInput(occurrenceInputSchema, input);
  const master = await seriesMaster(masterId, recurrenceId);
  const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Budapest" }).format(
    new Date(recurrenceId),
  );
  if (master.exdates.includes(day)) return;
  const { error } = await (
    await getMusicSupabase()
  )
    .from("events")
    .update({ exdates: [...master.exdates, day] })
    .eq("id", masterId);
  if (error) throw databaseError("skip an occurrence", error);
}

export type EventDetailDTO = EventDTO & {
  /** In order. */
  items: SetlistItemDTO[];
  /** The blocks of the items, in the order of their creation. */
  blocks: EventBlockDTO[];
};

/** One event with its items and blocks, or null when it is not there or not visible. */
export async function getEventDetail(id: string): Promise<EventDetailDTO | null> {
  const event = await getEvent(id);
  if (event === null) return null;
  const [items, blocks] = await Promise.all([
    event.setlistId === null ? [] : readSetlistItems(event.setlistId),
    readEventBlocks(event.id),
  ]);
  return { ...event, items, blocks: blocks ?? [] };
}

/** The items of an event, in order. */
export const eventItemsInputSchema = z.strictObject({
  items: setlistItemsInputSchema,
  /**
   * The setlist that the change is based on (null: no items). The save changes nothing when the
   * event has another setlist now. Left out: no check.
   */
  baseSetlistId: idSchema.nullable().optional(),
});

export type EventItemsInput = z.input<typeof eventItemsInputSchema>;

const setEventItemsResultSchema = z
  .object({ status: z.enum(["saved", "changed"]), setlist_id: z.uuid().nullable() })
  .nullable();

/** `afterKey` for the start of the items. */
export const START_KEY = "00000000-0000-0000-0000-000000000000";

/** Items to add after the item of `afterKey`, or at the end (null, or a key that the event does not have). */
const addItemsInputSchema = z.strictObject({
  items: setlistItemsInputSchema.min(1),
  afterKey: z.union([idSchema, z.literal(START_KEY)]).nullable(),
});

export type SetEventItemsResult = { status: "saved" | "changed"; setlistId: string | null } | null;

/**
 * Saves the items of an event (the event gets a new setlist when they changed). `changed`: the
 * event has another setlist than `baseSetlistId` now, nothing was saved. Null: no such event.
 */
export async function setEventItems(
  id: string,
  input: EventItemsInput,
): Promise<SetEventItemsResult> {
  await requireEventAdmin();
  if (!isId(id) || (await getEvent(id)) === null) return null;
  const { items, baseSetlistId } = parseInput(eventItemsInputSchema, input);
  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("set_event_items", {
    p_event_id: id,
    p_items: toItemsArgument(items),
    p_base_setlist_id: baseSetlistId ?? null,
    p_check_base: baseSetlistId !== undefined,
  });
  if (error) throw databaseError("save event items", error);
  const result = setEventItemsResultSchema.parse(data);
  return result && { status: result.status, setlistId: result.setlist_id?.toLowerCase() ?? null };
}

export const ADD_TO_EVENT_RESULTS = ["added", "too_many_items", "no_event"] as const;
export type AddToEventResult = (typeof ADD_TO_EVENT_RESULTS)[number];

/** Adds items after the item of `afterKey` (a block around the place keeps the new items). */
export async function addEventItems(
  id: string,
  input: z.input<typeof addItemsInputSchema>,
): Promise<AddToEventResult> {
  await requireEventAdmin();
  if (!isId(id) || (await getEvent(id)) === null) return "no_event";
  const { items, afterKey } = parseInput(addItemsInputSchema, input);
  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("add_event_items", {
    p_event_id: id,
    p_items: toItemsArgument(items),
    p_after_key: afterKey,
  });
  if (error) throw databaseError("add event items", error);
  return z.enum(ADD_TO_EVENT_RESULTS).parse(data);
}

/** Removes the item of the key. False when the event or the item is not there. */
export async function removeEventItem(id: string, key: string): Promise<boolean> {
  await requireEventAdmin();
  if (!isId(id) || !isId(key) || (await getEvent(id)) === null) return false;
  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("remove_event_item", {
    p_event_id: id,
    p_key: key,
  });
  if (error) throw databaseError("remove an event item", error);
  return z.enum(["removed", "no_item", "no_event"]).parse(data) === "removed";
}

const addArrangementInputSchema = z.strictObject({
  eventId: idSchema,
  arrangementId: idSchema,
  /** Null or left out: the key of the chart. */
  musicalKey: playKeySchema.nullish(),
});

export const ADD_ARRANGEMENT_RESULTS = [
  "added",
  "too_many_items",
  "ended",
  "no_event",
  "no_arrangement",
] as const;
export type AddArrangementResult = (typeof ADD_ARRANGEMENT_RESULTS)[number];

/** "Add to event" of a song: one arrangement at the end of an event that has not ended. */
export async function addEventArrangement(
  input: z.input<typeof addArrangementInputSchema>,
): Promise<AddArrangementResult> {
  await requireEventAdmin();
  const { eventId, arrangementId, musicalKey } = parseInput(addArrangementInputSchema, input);
  if ((await getEvent(eventId)) === null) return "no_event";
  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("add_event_arrangement", {
    p_event_id: eventId,
    p_arrangement_id: arrangementId,
    p_musical_key: musicalKey ?? null,
  });
  if (error) throw databaseError("add an arrangement to an event", error);
  return z.enum(ADD_ARRANGEMENT_RESULTS).parse(data);
}
