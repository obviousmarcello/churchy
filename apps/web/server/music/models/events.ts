import { queueEventAddedNotifications } from "@/server/music/notifications";
import "server-only";

import { randomUUID } from "node:crypto";

import { expandEvents, tryParseRRule, type ExpandWindow } from "@churchy/events";
import { slugify } from "@churchy/hu";
import { z } from "zod";

import {
  EVENT_AREAS_MAX,
  forbiddenEventAreaChanges,
  type EventScopeOptions,
} from "@/lib/music/event-scopes";
import { splitEventsByTime } from "@/lib/music/event-time";
import { pathLabel, treeOrder } from "@/lib/music/groups";
import { VOLUNTEER_REPLIES, type VolunteerReply } from "@/lib/music/volunteer-replies";
import { toYoutubeUrl } from "@/lib/music/youtube";
import {
  requireEventAdmin,
  requireEventAdminIn,
  requireUser,
  type CurrentUser,
} from "@/server/music/auth";
import { getMusicSupabase } from "@/server/music/db";
import { ConflictError, ProjectionOpenError, ValidationError } from "@/server/music/errors";
import { zodMessage } from "@/server/music/zod-i18n";
import { readEventBlocks, type EventBlockDTO } from "./event-blocks";
import { listGroups } from "./groups";
import { listPeople, type PersonDTO } from "./profiles";
import {
  canSeeEvent,
  eventAreaRightsOf,
  requireEventAdminOf,
  visibleEventsFilter,
  withFilter,
} from "./event-access";
import { readAttachmentSetIds } from "./announcements";
import {
  copyEventImageFiles,
  listEventImagePaths,
  listSetImagePaths,
  removeEventImageFiles,
  removeUntakenCopies,
} from "./event-images";
import {
  readSetlistItems,
  setlistItemsInputSchema,
  toItemsArgument,
  type SetlistItemDTO,
  type SetlistItemInput,
} from "./setlists";
import { playKeySchema } from "./arrangements";
import {
  databaseError,
  withAuthor,
  endingProjections,
  idSchema,
  isId,
  lowerIdSchema,
  parseInput,
  requiredText,
} from "./shared";

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
  /** The music areas that see the event (the root area: everyone). */
  areaIds: string[];
  /** The event's own setlist, else null. */
  setlistId: string | null;
  /** The projection theme of the event. Null: the default theme. */
  projectionThemeId: string | null;
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
  /** The music areas that see the event. Left out: the root area (everyone). */
  areaIds: z.array(lowerIdSchema).min(1).max(EVENT_AREAS_MAX).optional(),
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

/** An event admin gives any area; the leader of an area only their own (`forbiddenEventAreaChanges`). */
async function checkAreaRights(
  user: CurrentUser,
  next: readonly string[] | undefined,
  previous: readonly string[],
) {
  if (next === undefined || user.canEditEvents) return;
  const rights = await eventAreaRightsOf(user);
  if (forbiddenEventAreaChanges(next, previous, rights, null).length > 0) {
    throw new ValidationError([
      { path: "areaIds", message: ({ m }) => m.server.events.areasNotYours },
    ]);
  }
}

export type EventInput = z.input<typeof eventInputSchema>;
export type NewEventInput = z.input<typeof newEventInputSchema>;
export type EventPatchInput = z.input<typeof eventPatchInputSchema>;

const EVENT_COLUMNS =
  "id, title, starts_at, ends_at, youtube_url, is_private, area_ids, rrule, exdates, parent_event_id, recurrence_id, setlist_id, projection_theme_id, created_by";

const eventRowSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  starts_at: z.string(),
  ends_at: z.string().nullable(),
  youtube_url: z.string().nullable(),
  is_private: z.boolean(),
  area_ids: z.array(lowerIdSchema),
  rrule: z.string().nullable(),
  exdates: z.array(z.string()),
  parent_event_id: z.uuid().nullable(),
  recurrence_id: z.string().nullable(),
  setlist_id: z.uuid().nullable(),
  projection_theme_id: z.uuid().nullable(),
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
    areaIds: row.area_ids,
    rrule: row.rrule,
    exdates: row.exdates,
    parentEventId: row.parent_event_id?.toLowerCase() ?? null,
    recurrenceId: row.recurrence_id === null ? null : iso(row.recurrence_id),
    setlistId: row.setlist_id?.toLowerCase() ?? null,
    projectionThemeId: row.projection_theme_id?.toLowerCase() ?? null,
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

async function musicCalendarId(): Promise<string> {
  const { data, error } = await (await getMusicSupabase()).rpc("music_calendar_id");
  if (error) throw databaseError("find the music calendar", error);
  return z.uuid().parse(data);
}

// The reads check the session too, not only the proxy.

/** The events (series masters and changed occurrences included) that the user can see. */
export async function listEvents(): Promise<EventDTO[]> {
  const user = await requireUser();
  const { data, error } = await withFilter(
    (await getMusicSupabase()).from("events").select(EVENT_COLUMNS),
    await visibleEventsFilter(user),
  ).order("starts_at", { ascending: true });
  if (error) throw databaseError("list events", error);
  return z.array(eventRowSchema).parse(data).map(toEvent);
}

export type EventWithItemCountDTO = EventDTO & { itemCount: number };

/**
 * The events (series masters once, not their changed occurrences) split into upcoming and past, each
 * with the number of items of its setlist: for the "Save to event" panel of the rehearsal page.
 */
export async function listEventsByTime() {
  const events = (await listEvents()).filter((event) => event.parentEventId === null);
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("setlists")
    .select("id, item_count");
  if (error) throw databaseError("count setlist items", error);
  const counts = new Map(
    z
      .array(z.object({ id: z.uuid(), item_count: z.number().int() }))
      .parse(data)
      .map((row) => [row.id, row.item_count]),
  );
  const withCounts: EventWithItemCountDTO[] = events.map((event) => ({
    ...event,
    itemCount: (event.setlistId && counts.get(event.setlistId)) || 0,
  }));
  return splitEventsByTime(withCounts, Date.now());
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
  const { data, error } = await withFilter(
    (await getMusicSupabase()).from("events").select(EVENT_COLUMNS).eq("id", id),
    await visibleEventsFilter(user),
  ).maybeSingle();
  if (error) throw databaseError("read an event", error);
  return data === null ? null : toEvent(eventRowSchema.parse(data));
}

/** Adds an event, or a series when `rrule` is given. */
export async function createEvent(input: NewEventInput): Promise<EventDTO> {
  const event = parseInput(newEventInputSchema, input);
  const user = await requireEventAdminIn(event.areaIds ?? []);
  await checkAreaRights(user, event.areaIds, []);
  const startsAt = iso(event.startsAt);
  const supabase = await getMusicSupabase();
  const { data, error } = await supabase
    .from("events")
    .insert({
      calendar_id: await musicCalendarId(),
      visibility: "staff",
      status: "published",
      slug: eventSlug(event.title, startsAt),
      title: event.title,
      starts_at: startsAt,
      ends_at: endOf(startsAt, event.durationMinutes),
      youtube_url: event.youtubeUrl,
      is_private: event.isPrivate,
      ...(event.areaIds !== undefined && { area_ids: event.areaIds }),
      rrule: event.rrule,
      created_by: user.id,
    })
    .select(EVENT_COLUMNS)
    .single();
  if (error) throw databaseError("create an event", error);
  return toEvent(eventRowSchema.parse(data));
}

const newEventWithItemsInputSchema = newEventInputSchema.extend({ items: setlistItemsInputSchema });

/**
 * A new event with its items, e.g. from the rehearsal page. Churchy has no single-transaction
 * `create_event_with_items`: the event is created, then its items are set; when that fails the event
 * is removed again, so no empty event stays.
 */
export async function createEventWithItems(input: unknown): Promise<EventDTO> {
  const { items, ...details } = parseInput(newEventWithItemsInputSchema, input);
  const event = await createEvent(details);
  try {
    await applyEventItems(event.id, items);
  } catch (error) {
    await (await getMusicSupabase()).from("events").delete().eq("id", event.id);
    throw error;
  }
  return (await getEvent(event.id)) ?? event;
}

/**
 * Changes the details of an event (a series master changes the whole series; use
 * `changeOccurrence()` for one occurrence). Null when the event is not there or not visible.
 */
export async function updateEvent(
  id: string,
  patch: EventPatchInput,
  { endProjections = false }: { endProjections?: boolean } = {},
): Promise<EventDTO | null> {
  const user = await requireEventAdminOf(id);
  if (user === null) return null;
  if (!isId(id)) return null;
  const changes = parseInput(eventPatchInputSchema, patch);
  const current = await getEvent(id);
  if (current === null) return null;
  await checkAreaRights(user, changes.areaIds, current.areaIds);
  const startsAt = iso(changes.startsAt ?? current.startsAt);
  const durationMinutes = changes.durationMinutes ?? current.durationMinutes;
  const { data, error } = await endingProjections(
    (await getMusicSupabase())
      .from("events")
      .update({
        title: changes.title ?? current.title,
        starts_at: startsAt,
        ends_at: endOf(startsAt, durationMinutes),
        youtube_url: changes.youtubeUrl === undefined ? current.youtubeUrl : changes.youtubeUrl,
        is_private: changes.isPrivate ?? current.isPrivate,
        ...(changes.areaIds !== undefined && { area_ids: changes.areaIds }),
      })
      .eq("id", id)
      .select(EVENT_COLUMNS)
      .maybeSingle(),
    endProjections,
  );
  if (error) throw databaseError("update an event", error);
  return data === null ? null : toEvent(eventRowSchema.parse(data));
}

/** Deletes an event (with its changed occurrences). False when it is not there. */
export async function deleteEvent(
  id: string,
  options: { endProjections?: boolean } = {},
): Promise<boolean> {
  if ((await requireEventAdminOf(id)) === null) return false;
  // The files go after the rows (a stray-file row keeps them if this stops in between).
  const paths = await listEventImagePaths(id);
  // An open projection stops the delete; with `endProjections` the open controllers close.
  const { error } = await endingProjections(
    (await getMusicSupabase()).from("events").delete().eq("id", id),
    options.endProjections === true,
  );
  if (error?.hint === "projection_open") throw new ProjectionOpenError();
  if (error) throw databaseError("delete an event", error);
  await removeEventImageFiles(paths);
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
  const { masterId, recurrenceId } = parseInput(occurrenceInputSchema, input);
  const user = await requireEventAdminOf(masterId);
  if (user === null) throw new ConflictError(({ m }) => m.server.events.occurrenceMissing);
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
  const { masterId, recurrenceId } = parseInput(occurrenceInputSchema, input);
  if ((await requireEventAdminOf(masterId)) === null)
    throw new ConflictError(({ m }) => m.server.events.occurrenceMissing);
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

export type SetEventItemsResult =
  | { status: "saved"; setlistId: string | null }
  | { status: "changed"; setlistId: string | null; items: SetlistItemDTO[] }
  | null;

/**
 * Saves the items of an event (the event gets a new setlist when they changed). `changed`: the
 * event has another setlist than `baseSetlistId` now, nothing was saved. Null: no such event.
 */
export async function setEventItems(
  id: string,
  input: EventItemsInput,
): Promise<SetEventItemsResult> {
  if ((await requireEventAdminOf(id)) === null) return null;
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
  if (!result) return null;
  const setlistId = result.setlist_id?.toLowerCase() ?? null;
  if (result.status === "saved") return { status: "saved", setlistId };
  // Another change came first and was kept: the caller merges with the items that the event has now.
  return {
    status: "changed",
    setlistId,
    items: setlistId === null ? [] : await readSetlistItems(setlistId),
  };
}

/**
 * Saves the items of an event for the plan sync (`server/music/plan-link.ts`): the caller already
 * checked that the user may edit the linked plan, so there is no event-admin check here.
 */
export async function applyEventItems(id: string, items: SetlistItemInput[]): Promise<boolean> {
  if (!isId(id) || (await getEvent(id)) === null) return false;
  const parsed = parseInput(eventItemsInputSchema, { items });
  const { error } = await (
    await getMusicSupabase()
  ).rpc("set_event_items", {
    p_event_id: id,
    p_items: toItemsArgument(parsed.items),
    p_base_setlist_id: null,
    p_check_base: false,
  });
  if (error) throw databaseError("save event items", error);
  return true;
}

export const ADD_TO_EVENT_RESULTS = ["added", "too_many_items", "no_event"] as const;
export type AddToEventResult = (typeof ADD_TO_EVENT_RESULTS)[number];

/** Adds items after the item of `afterKey` (a block around the place keeps the new items). */
export async function addEventItems(
  id: string,
  input: z.input<typeof addItemsInputSchema>,
): Promise<AddToEventResult> {
  if ((await requireEventAdminOf(id)) === null) return "no_event";
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
  if (!isId(key) || (await requireEventAdminOf(id)) === null) return false;
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
  const { eventId, arrangementId, musicalKey } = parseInput(addArrangementInputSchema, input);
  if ((await requireEventAdminOf(eventId)) === null) return "no_event";
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

const replyInputSchema = z.strictObject({ reply: z.enum(["yes", "maybe", "no"]) });

/**
 * Saves the reply of the signed-in user to an event that they volunteer for. False when there is no
 * such event, or the user is not a volunteer of it. An event that has ended takes no reply.
 */
export async function setMyReply(eventId: string, input: unknown): Promise<boolean> {
  const user = await requireUser();
  if (!isId(eventId)) return false;
  const { reply } = parseInput(replyInputSchema, input);
  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("set_volunteer_reply", {
    p_event_id: eventId,
    p_user_id: user.id,
    p_reply: reply,
  });
  if (error) throw databaseError("set reply", error);
  const result = z.enum(["not_volunteer", "ended", "saved"]).parse(data);
  if (result === "ended") throw new ConflictError(({ m }) => m.server.events.replyClosed);
  return result === "saved";
}

const copyEventInputSchema = eventInputSchema.omit({ rrule: true }).extend({
  areaIds: eventInputSchema.shape.areaIds,
  copyItems: z.boolean(),
  copyVolunteers: z.boolean(),
});

export type CopyEventInput = z.input<typeof copyEventInputSchema>;

/** A copy of an event with new details; the items and the team are optional. Null: no such event. */
export async function copyEvent(sourceId: string, input: CopyEventInput): Promise<EventDTO | null> {
  const user = await requireEventAdminOf(sourceId);
  if (user === null) return null;
  const source = await getEvent(sourceId);
  if (source === null) return null;
  const copy = parseInput(copyEventInputSchema, input);
  await checkAreaRights(user, copy.areaIds, source.areaIds);
  const startsAt = iso(copy.startsAt);
  const id = randomUUID();
  // The images of the image items and of the announcements go with the items: first copies of their
  // files, in the folder of the new event.
  let files: Record<string, string> = {};
  if (copy.copyItems) {
    const detail = await getEventDetail(sourceId);
    const textItems = (detail?.items ?? []).flatMap((item) => (item.kind === "text" ? [item] : []));
    const setIds = [
      ...textItems.flatMap((item) => (item.imageSetId ? [item.imageSetId] : [])),
      ...(await readAttachmentSetIds(
        textItems.flatMap((item) => (item.announcementId ? [item.announcementId] : [])),
      )),
    ];
    files = await copyEventImageFiles(id, await listSetImagePaths(setIds));
  }
  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("copy_event", {
    p_id: id,
    p_source_id: sourceId,
    p_title: copy.title,
    p_starts_at: startsAt,
    p_duration_minutes: copy.durationMinutes,
    p_youtube_url: copy.youtubeUrl,
    p_copy_items: copy.copyItems,
    p_copy_volunteers: copy.copyVolunteers,
    p_files: files,
    p_is_private: copy.isPrivate,
    p_created_by: user.id,
    p_area_ids: copy.areaIds ?? null,
  });
  if (error) throw databaseError("copy an event", error);
  if (data === null) return null;
  await removeUntakenCopies(id, files);
  if (copy.copyVolunteers) {
    const { data: volunteers, error: volunteersError } = await (
      await getMusicSupabase()
    )
      .from("event_volunteers")
      .select("user_id")
      .eq("event_id", id);
    if (volunteersError) throw databaseError("list copied volunteers", volunteersError);
    await queueEventAddedNotifications(
      id,
      z
        .array(z.object({ user_id: z.uuid() }))
        .parse(volunteers)
        .map((volunteer) => volunteer.user_id)
        .filter((volunteerId) => volunteerId !== user.id),
    );
  }
  return getEvent(id);
}

// ---------------------------------------------------------------------------------------------
// The volunteers of an event and the groups of the event forms (the copied event editor).
// ---------------------------------------------------------------------------------------------

export type VolunteerDTO = PersonDTO & { reply: VolunteerReply | null };

/** An upcoming event for "Add to event" of a user. */
export type EventForVolunteerDTO = EventDTO & {
  /** True when the event has started but not ended yet. */
  hasStarted: boolean;
  /** The user volunteers for the event already. */
  isVolunteer: boolean;
};

/**
 * The volunteers of the event, with their profiles and replies, by name. Everyone who can see the
 * event sees them, but only superadmins get the emails. Empty when the event is not there or not
 * visible.
 */
export async function listEventVolunteers(eventId: string): Promise<VolunteerDTO[]> {
  const user = await requireUser();
  if (!(await canSeeEvent(user.id, eventId, user.canEditEvents))) return [];
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("event_volunteers")
    .select("user_id, reply")
    .eq("event_id", eventId);
  if (error) throw databaseError("list event volunteers", error);
  const rows = z
    .array(z.object({ user_id: z.uuid(), reply: z.enum(VOLUNTEER_REPLIES).nullable() }))
    .parse(data);
  const replies = new Map(rows.map((row) => [row.user_id, row.reply]));
  const people = await listPeople([...replies.keys()], { emails: user.canViewPeopleEmails });
  return people.map((person) => ({ ...person, reply: replies.get(person.id) ?? null }));
}

/** Marks a user as a volunteer. False when there is no such event or user, or the event is not the user's to change. */
export async function addEventVolunteer(eventId: string, userId: string): Promise<boolean> {
  const current = await requireEventAdminOf(eventId);
  if (!current || !isId(userId)) return false;
  // Returns the row only if it is new.
  const { data, error } = await withAuthor(
    (await getMusicSupabase())
      .from("event_volunteers")
      .upsert(
        { event_id: eventId, user_id: userId },
        { onConflict: "tenant_id,event_id,user_id", ignoreDuplicates: true },
      )
      .select("created_at"),
    current.id,
  );
  if (error?.code === "23503") return false;
  if (error) throw databaseError("add event volunteer", error);
  if (data.length > 0 && userId !== current.id) {
    await queueEventAddedNotifications(eventId, [userId]);
  }
  return true;
}

/** False when the user is not a volunteer of the event. With `endProjections`, an open projection of the user closes. */
export async function removeEventVolunteer(
  eventId: string,
  userId: string,
  { endProjections = false }: { endProjections?: boolean } = {},
): Promise<boolean> {
  const current = await requireEventAdminOf(eventId);
  if (!current || !isId(userId)) return false;
  const { data, error } = await endingProjections(
    withAuthor(
      (await getMusicSupabase())
        .from("event_volunteers")
        .delete()
        .eq("event_id", eventId)
        .eq("user_id", userId)
        .select("event_id"),
      current.id,
    ),
    endProjections,
  );
  if (error) throw databaseError("remove event volunteer", error);
  return data.length > 0;
}

/** The upcoming events (not ended) with whether the user volunteers for each, for "Add to event" of a user. */
export async function listUpcomingEventsForVolunteer(
  userId: string,
): Promise<EventForVolunteerDTO[]> {
  await requireEventAdmin();
  if (!isId(userId)) return [];
  const now = Date.now();
  const events = (await listEvents()).filter(
    (event) => event.rrule === null && Date.parse(event.endsAt) > now,
  );
  if (events.length === 0) return [];
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("event_volunteers")
    .select("event_id")
    .eq("user_id", userId)
    .in(
      "event_id",
      events.map((event) => event.id),
    );
  if (error) throw databaseError("list volunteer events", error);
  const mine = new Set(
    z
      .array(z.object({ event_id: z.uuid() }))
      .parse(data)
      .map((row) => row.event_id),
  );
  return events
    .toSorted((a, b) => a.startsAt.localeCompare(b.startsAt))
    .map((event) => ({
      ...event,
      hasStarted: Date.parse(event.startsAt) <= now,
      isVolunteer: mine.has(event.id),
    }));
}

/** All groups in the order of the tree, the root group first, each with its path. */
export async function listGroupLabels(): Promise<EventScopeOptions["groups"]> {
  return treeOrder(await listGroups()).map((group) => ({
    id: group.id,
    label: pathLabel(group),
    isRoot: group.isRoot,
  }));
}

/**
 * The data of the "Groups" field of the event forms: all groups, and the groups that the user can
 * change. For the event admins.
 */
export async function loadEventScopeOptions(
  groupLabels?: Promise<EventScopeOptions["groups"]>,
  admin?: CurrentUser,
): Promise<EventScopeOptions> {
  // The caller can name the user it checked (an area role does not pass `requireEventAdmin`).
  const user = admin ?? (await requireEventAdmin());
  const [groups, rights] = await Promise.all([
    groupLabels ?? listGroupLabels(),
    eventAreaRightsOf(user),
  ]);
  return { groups, editable: rights === "all" ? "all" : [...rights] };
}

/** The labels of the groups of the events, without the root group: for the badges of the events. */
export function usedGroupLabels(
  groups: EventScopeOptions["groups"],
  events: readonly Pick<EventDTO, "areaIds">[],
): Record<string, string> {
  const used = new Set(events.flatMap((event) => event.areaIds));
  return Object.fromEntries(
    groups
      .filter((group) => !group.isRoot && used.has(group.id))
      .map((group) => [group.id, group.label]),
  );
}
