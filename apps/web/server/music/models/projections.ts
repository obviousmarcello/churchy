import "server-only";

import { z } from "zod";

import { getRequestI18n } from "@/i18n/music/server";
import { announcementSource, groupHeadings } from "@/lib/music/announcements/present";
import { activeCalendarIds } from "@/lib/music/announcements/schema";
import { buildAnnouncementView } from "@/lib/music/announcements/sections";
import { withBlocksAfterReorder } from "@/lib/music/event-blocks";
import { itemPlannedSeconds } from "@/lib/music/event-timing";
import type { EventImageSetsDTO } from "@/lib/music/projection/images";
import type { ProjectionSource } from "@/lib/music/projection/slides";
import type { ProjectionThemeChoice } from "@/lib/music/projection/themes";
import { TRANSLATION_IDS } from "@/lib/music/scripture/translations";
import { requireEventAdmin, requireUser } from "@/server/music/auth";
import { ConflictError, ForbiddenError } from "@/server/music/errors";
import { isWorkspaceModuleOn } from "@/server/workspace-nav";
import type { RealtimeConnection } from "@/lib/music/realtime/client";
import { getMusicSupabase } from "@/server/music/db";
import { ensureFreshAnnouncements, readEventAnnouncements } from "./announcements";
import { canSeeEvent } from "./event-access";
import { itemsOn } from "@/lib/music/event-items-modules";
import { readEventBlocks, type EventBlockDTO } from "./event-blocks";
import { readEventImageSets } from "./event-images";
import { getEventDetail, setEventItems } from "./events";
import { listPeople, type PersonDTO } from "./profiles";
import { canProjectEvent, getConnection, projectionTopic } from "./realtime-access";
import { readProjectionThemes, themeMissingError } from "./projection-themes";
import { SETLIST_MAX_ITEMS, type SetlistItemDTO, type SetlistItemInput } from "./setlists";
import { databaseError, idSchema, isId, parseInput, withAuthor } from "./shared";

// Projection: a controller shows the lyrics of a setlist on screens, e.g. a
// projector (see `src/app/[lang]/project/`). The browsers talk directly, so
// this model only gives them the songs and checks the access.
//
// Who has access to the projection of an event. Keep it in sync with
// `private.projection_access()` in `supabase/migrations/20270111120000_projection_module.sql`
// (also closed while the module "projection" is off),
// which checks the same for Realtime: the volunteers of the event, and the
// music leaders and the superadmins who can see the event (the same users as
// for its live session).
// A rehearsal projection runs in one browser, so every signed-in user can use it.
//
// The users who can project an event also read the projection themes, and
// can change the theme of the event and of its items during the event, e.g.
// for a song that needs another background. The event admins can too, from
// the page of the event. An image item shows its images (see `event-images.ts`).
// An announcements item shows its entries (see `announcements.ts`), with the
// texts in the language of the request.

export type EventProjectionDTO = {
  eventId: string;
  title: string;
  /** Changes when the items of the event change: the event then gets a new setlist. */
  setlistId: string | null;
  /** In order, by the key of the item (see `SetlistItemDTO.key`). A song without its arrangement (deleted) is left out. */
  items: ProjectionSource[];
  /** The themes of the library and which theme each item uses. */
  themes: ProjectionThemeChoice;
  /** The run sheet of the items, for the comparison with the clock. */
  schedule: EventScheduleDTO;
  /** The volunteer of each item that has one, by the key of the item. Without emails. */
  assignees: Record<string, PersonDTO>;
};

/**
 * The planned start of the event, the planned time of each item in seconds
 * (see `plannedSeconds`; null: no time) and its block, and the blocks with
 * their countdowns (see `@/lib/event-blocks`).
 */
export type EventScheduleDTO = {
  startsAt: string;
  items: { key: string; seconds: number | null; blockKey: string | null }[];
  blocks: EventBlockDTO[];
};

type SongContent = Omit<Extract<ProjectionSource, { kind: "song" }>, "kind" | "key">;

/** A song of a rehearsal projection, by arrangement. */
export type RehearsalProjectionSongDTO = SongContent & { arrangementId: string };

/** What the browser needs to join the Realtime channel of an event's projection. */
export type ProjectionConnectionDTO = { connection: RealtimeConnection; topic: string };

const arrangementIdsSchema = z.array(idSchema).max(SETLIST_MAX_ITEMS);

const reorderInputSchema = z.strictObject({
  /** The setlist that the controller shows. */
  setlistId: idSchema,
  /** The keys of all items of that setlist, in the new order. */
  keys: z.array(idSchema).max(SETLIST_MAX_ITEMS),
});

/** The event after a reorder. The items keep their keys. */
export type ReorderedEventProjectionDTO = { setlistId: string | null };

/** The items of the event to project. Null when there is no such event or the user has no access. */
export async function getEventProjection(eventId: string): Promise<EventProjectionDTO | null> {
  if (!(await canProjectEvent(eventId))) return null;

  // A child module that is off: no themes (the look from before the themes), no images, no announcements.
  const [themesOn, imagesOn, announcementsOn] = await Promise.all([
    isWorkspaceModuleOn("ws.music.projection.themes"),
    isWorkspaceModuleOn("ws.music.events.images"),
    isWorkspaceModuleOn("ws.music.events.announcements"),
  ]);
  const [event, themes, imageSets, announcements, i18n] = await Promise.all([
    getEventDetail(eventId),
    themesOn ? readProjectionThemes() : [],
    imagesOn ? readEventImageSets(eventId) : ({} as EventImageSetsDTO),
    // After a read of the calendars of an old snapshot, at most some seconds.
    announcementsOn
      ? ensureFreshAnnouncements(eventId).then(() => readEventAnnouncements(eventId))
      : null,
    getRequestI18n(),
  ]);
  if (!event) return null;
  // The text items of a module that is off do not show (see `src/lib/modules/items.ts`).
  const shownItems = itemsOn(event.items, await onModules());
  const arrangementIds = event.items.flatMap((item) =>
    item.kind === "song" ? [item.arrangement.id] : [],
  );
  const volunteerIds = event.items.flatMap((item) => (item.volunteerId ? [item.volunteerId] : []));
  const [songs, people] = await Promise.all([listSongs(arrangementIds), listPeople(volunteerIds)]);
  const peopleById = new Map(people.map((person) => [person.id, person]));

  return {
    eventId: event.id,
    title: event.title,
    setlistId: event.setlistId,
    items: shownItems.flatMap((item): ProjectionSource[] => {
      if (item.kind === "text" && item.announcementId) {
        // `visibleItems` leaves these items out while their module is off.
        const announcement = announcements?.announcements[item.announcementId];
        if (!announcement) return [];
        const view = buildAnnouncementView({
          announcement,
          eventStartsAt: event.startsAt,
          calendarIds: activeCalendarIds(announcement, announcements.calendars),
          excludeWords: announcements.excludeWords,
        });
        const t = i18n.m.project.announcements;
        return [
          announcementSource({
            key: item.key,
            title: item.title,
            themeId: item.themeId,
            view,
            titles: {
              nextWeek: announcement.titles.nextWeek ?? t.nextWeek,
              thisMonth: announcement.titles.thisMonth ?? t.thisMonth,
              nextMonth: announcement.titles.nextMonth ?? t.nextMonth,
            },
            groupTitles: groupHeadings(t.groups, view.eventDay, i18n),
            images: imageSets,
            locale: i18n.locale,
          }),
        ];
      }
      if (item.kind === "text" && item.imageSetId) {
        const images = imageSets[item.imageSetId] ?? [];
        return [
          {
            kind: "images",
            key: item.key,
            title: item.title,
            imageSetId: item.imageSetId,
            images,
            themeId: item.themeId,
          },
        ];
      }
      if (item.kind === "text" && item.textSlide) {
        return [
          {
            kind: "textSlide",
            key: item.key,
            title: item.title,
            description: item.description,
            highlight: item.highlight,
            themeId: item.themeId,
          },
        ];
      }
      if (item.kind === "text") {
        return [
          {
            kind: "text",
            key: item.key,
            title: item.title,
            scripture: item.scripture,
            translation: item.scriptureTranslation,
            themeId: item.themeId,
          },
        ];
      }
      const song = songs.get(item.arrangement.id);
      return song ? [{ kind: "song", key: item.key, ...song, themeId: item.themeId }] : [];
    }),
    themes: {
      themes,
      eventThemeId: event.projectionThemeId,
      itemThemeIds: Object.fromEntries(event.items.map((item) => [item.key, item.themeId])),
    },
    schedule: {
      startsAt: event.startsAt,
      items: event.items.map((item) => ({
        key: item.key,
        seconds: itemPlannedSeconds(item),
        blockKey: item.blockKey,
      })),
      blocks: event.blocks,
    },
    assignees: Object.fromEntries(
      event.items.flatMap((item) => {
        const person = item.volunteerId ? peopleById.get(item.volunteerId) : undefined;
        return person ? [[item.key, person]] : [];
      }),
    ),
  };
}

/**
 * Sets the projection theme of the event, or none (null) for the default
 * theme. For the users who can project the event and the event admins.
 * Returns false if there is no such event.
 */
export async function setEventProjectionTheme(eventId: string, themeId: unknown): Promise<boolean> {
  if (!(await canChooseThemes(eventId))) return false;
  const theme = parseInput(themeIdSchema, themeId);
  const user = await requireUser();

  const { data, error } = await withAuthor(
    (await getMusicSupabase())
      .from("events")
      .update({ projection_theme_id: theme })
      .eq("id", eventId)
      .select("id"),
    user.id,
  );
  if (error)
    throw databaseError("set event projection theme", error, { "23503": themeMissingError });
  return data.length > 0;
}

/**
 * Sets the projection theme of an item of the event (by its key), or none
 * (null) for the theme of the event. The items keep their setlist. For the
 * users who can project the event and the event admins. Returns false if
 * there is no such event.
 */
export async function setEventItemProjectionTheme(
  eventId: string,
  itemKey: string,
  themeId: unknown,
): Promise<boolean> {
  if (!(await canChooseThemes(eventId))) return false;
  const theme = parseInput(themeIdSchema, themeId);
  if (!isId(itemKey)) throw itemMissingError();
  const user = await requireUser();

  const { data, error } = await withAuthor(
    (await getMusicSupabase()).rpc("set_event_item_theme", {
      p_event_id: eventId,
      p_item_id: itemKey,
      p_theme_id: theme,
    }),
    user.id,
  );
  if (error)
    throw databaseError("set item projection theme", error, { "23503": themeMissingError });
  const result = z.enum(["saved", "no_item", "no_event"]).parse(data);
  if (result === "no_item") throw itemMissingError();
  return result === "saved";
}

/**
 * Moves the items of the event to a new order, e.g. by a drag on the
 * controller. Only for event admins, as `setEventItems`. Each item keeps all
 * its values, also its key, its volunteer and its theme. Null when there is
 * no such event. "changed" when the items of the event are not the items of
 * `setlistId` anymore, e.g. after an edit on another device: then the
 * controller merges its order with the new items and tries again.
 */
export async function reorderEventProjection(
  eventId: string,
  input: unknown,
): Promise<ReorderedEventProjectionDTO | "changed" | null> {
  await requireEventAdmin();
  if (!isId(eventId)) return null;
  const { setlistId, keys } = parseInput(reorderInputSchema, input);

  const event = await getEventDetail(eventId);
  if (!event) return null;
  // The controller shows only the items of the modules that are on: the others keep their places.
  const shown = new Set(itemsOn(event.items, await onModules()).map((item) => item.key));
  const items = new Map(event.items.map((item) => [item.key, item]));
  const sameItems =
    keys.length === shown.size &&
    new Set(keys).size === keys.length &&
    keys.every((key) => shown.has(key));
  if (event.setlistId !== setlistId || !sameItems) return "changed";
  const moved = keys.map((key) => items.get(key)!);
  const reordered = event.items.map((item) => (shown.has(item.key) ? moved.shift()! : item));

  // The moved item joins or leaves a block (see `withBlocksAfterReorder`). The others keep their blocks by key.
  const ordered = withBlocksAfterReorder(event.items, reordered);
  const itemsInput = ordered.map((item) => {
    const blockKey =
      items.get(item.key)!.blockKey === item.blockKey ? {} : { blockKey: item.blockKey };
    return { ...toItemInput(item), ...blockKey };
  });
  // The check of the setlist is in the same transaction as the save.
  const result = await setEventItems(eventId, { items: itemsInput, baseSetlistId: setlistId });
  if (!result) return null;
  return result.status === "changed" ? "changed" : { setlistId: result.setlistId };
}

// Without `durationSeconds` and `blockKey`: each item keeps its time and its
// block by its key, so a change of a time during the reorder stays.
function toItemInput(item: SetlistItemDTO): SetlistItemInput {
  const { key, volunteerId, themeId } = item;
  if (item.kind === "song") {
    return {
      kind: "song",
      key,
      arrangementId: item.arrangement.id,
      musicalKey: item.musicalKey,
      volunteerId,
      themeId,
    };
  }
  // A translation that the app does not have anymore becomes the default one, as in the items form.
  const translation = TRANSLATION_IDS.find((id) => id === item.scriptureTranslation) ?? null;
  return {
    kind: "text",
    key,
    title: item.title,
    notes: item.notes,
    scripture: item.scripture,
    scriptureTranslation: item.scripture ? translation : null,
    imageSetId: item.imageSetId,
    announcementId: item.announcementId,
    textSlide: item.textSlide,
    description: item.description,
    highlight: item.highlight,
    volunteerId,
    themeId,
  };
}

/**
 * Starts the countdown "remaining" of the block of the event, when an item of
 * it goes live: now, when it has not started or its earlier run ended long
 * ago, or always with `restart` (see `start_event_block()`). For the users who
 * can project the event. Returns the start (null for another countdown), or
 * undefined when there is no such event or block, or the user has no access.
 */
export async function startEventBlock(
  eventId: string,
  key: string,
  restart: boolean,
): Promise<string | null | undefined> {
  if (!(await canProjectEvent(eventId)) || !isId(key)) return undefined;
  const user = await requireUser();

  const { data, error } = await withAuthor(
    (await getMusicSupabase()).rpc("start_event_block", {
      p_event_id: eventId,
      p_key: key,
      p_restart: restart,
    }),
    user.id,
  );
  if (error) throw databaseError("start event block", error);

  const result = z.object({ started_at: z.string().nullable() }).nullable().parse(data);
  if (!result) return undefined;
  return result.started_at === null ? null : new Date(result.started_at).toISOString();
}

/**
 * The blocks of the event (`EventScheduleDTO.blocks`), after a change of a
 * block, e.g. its name or the start of its countdown: the controller does not
 * load all the items again. Null when the user has no access, or there is no
 * such event.
 */
export async function getEventProjectionBlocks(eventId: string): Promise<EventBlockDTO[] | null> {
  if (!(await canProjectEvent(eventId))) return null;
  return readEventBlocks(eventId);
}

/** The Realtime channel of the event's projection. Null when the user has no access. */
export async function getEventProjectionConnection(
  eventId: string,
): Promise<ProjectionConnectionDTO | null> {
  if (!(await canProjectEvent(eventId))) return null;
  return { connection: await getConnection(), topic: projectionTopic(eventId) };
}

/** The songs of a rehearsal, e.g. from the draft in the browser. Leaves out the arrangements that do not exist. */
export async function listRehearsalProjectionSongs(
  arrangementIds: unknown,
): Promise<RehearsalProjectionSongDTO[]> {
  await requireUser();
  const songs = await listSongs([...new Set(parseInput(arrangementIdsSchema, arrangementIds))]);
  return [...songs].map(([arrangementId, song]) => ({ arrangementId, ...song }));
}

const projectionSongRowSchema = z.object({
  id: z.uuid(),
  chordpro: z.string(),
  section_order: z.array(z.string()),
  projection_theme_id: z.uuid().nullable(),
  song: z.object({
    title: z.string(),
    copyright: z.string().nullable(),
    songbook: z.string().nullable(),
    artist: z.string().nullable(),
    authors: z.string().nullable(),
  }),
});

/** By arrangement id, in the order of `arrangementIds`. */
async function listSongs(arrangementIds: string[]): Promise<Map<string, SongContent>> {
  const validIds = [...new Set(arrangementIds.filter(isId))];
  if (validIds.length === 0) return new Map();
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("arrangements")
    .select(
      "id, chordpro, section_order, projection_theme_id, song:songs (title, copyright, songbook, artist, authors)",
    )
    .in("id", validIds);
  if (error) throw databaseError("list projection songs", error);

  const byId = new Map(
    z
      .array(projectionSongRowSchema)
      .parse(data)
      .map((row) => [row.id, row]),
  );
  return new Map(
    validIds.flatMap((id): [string, SongContent][] => {
      const row = byId.get(id);
      if (!row) return [];
      const { title, copyright, songbook, artist, authors } = row.song;
      return [
        [
          id,
          {
            title,
            copyright,
            songbook,
            artist,
            authors,
            chordpro: row.chordpro,
            sectionOrder: row.section_order,
            arrangementThemeId: row.projection_theme_id,
          },
        ],
      ];
    }),
  );
}

/** The workspace modules that are on, as the ids `itemsOn` knows (the item kinds of a module). */
async function onModules(): Promise<string[]> {
  const [images, announcements, textSlides] = await Promise.all([
    isWorkspaceModuleOn("ws.music.events.images"),
    isWorkspaceModuleOn("ws.music.events.announcements"),
    isWorkspaceModuleOn("ws.music.projection.text-slides"),
  ]);
  return [
    ...(images ? ["images"] : []),
    ...(announcements ? ["announcements"] : []),
    ...(textSlides ? ["textSlide"] : []),
    // The scripture module comes with phase 6: its items show as their reference until then.
    "scripture",
  ];
}

const themeIdSchema = idSchema.nullable();

/**
 * The user can change the themes of the event: an event admin who can see it,
 * or a user who can project it. False when there is no such event or an event
 * admin cannot see it. Throws otherwise.
 */
async function canChooseThemes(eventId: string): Promise<boolean> {
  const user = await requireUser();
  if (!isId(eventId)) return false;
  // The users who can project the event see it too.
  if (user.canEditEvents) return canSeeEvent(user.id, eventId, true);
  if (await canProjectEvent(eventId)) return true;
  throw new ForbiddenError();
}

function itemMissingError(): ConflictError {
  return new ConflictError(({ m }) => m.server.projectionThemes.itemMissing);
}
