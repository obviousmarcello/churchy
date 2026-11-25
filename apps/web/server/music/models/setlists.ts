import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  EVENT_ITEM_DESCRIPTION_MAX_LENGTH,
  EVENT_ITEM_HIGHLIGHT_MAX_LENGTH,
  EVENT_ITEM_NOTES_MAX_LENGTH,
  EVENT_ITEM_TITLE_MAX_LENGTH,
} from "@/lib/music/event-items";
import { EVENT_ITEM_DURATION_MAX_SECONDS } from "@/lib/music/event-timing";
import {
  ARRANGEMENT_SUMMARY_COLUMNS,
  arrangementSummaryRowSchema,
  playKeySchema,
  toArrangementSummary,
  type ArrangementSummaryDTO,
} from "./arrangements";
import { zodMessage } from "@/server/music/zod-i18n";
import { getMusicSupabase } from "@/server/music/db";
import { databaseError, optionalText, requiredText } from "./shared";
import {
  SONG_SUMMARY_COLUMNS,
  songSummaryRowSchema,
  toSongSummary,
  type SongSummaryDTO,
} from "./songs";

// Setlists are hidden: the app shows the items of an event, and each event has
// its own setlist. An item is a song (an arrangement) or a text item, e.g.
// "Announcement". A text item can be a scripture reading: its title is the
// reference, e.g. "John 3:16-21". A text item can also have images to project
// (see `event-images.ts`): its title is e.g. the name of the file. Or it can
// be an announcements item (see `announcements.ts`). A setlist never changes: when the items of an event change,
// the event gets a new setlist (see `setEventItems` and the
// `one_setlist_per_event` and `event_items` migrations).

export type SetlistItemDTO =
  | {
      kind: "song";
      /** The slot. Slot annotations belong to it; the capo belongs to the arrangement. */
      id: string;
      /** The same in each new setlist of the event, while the item stays. */
      key: string;
      song: SongSummaryDTO;
      arrangement: ArrangementSummaryDTO;
      /** The key to play the song in, in English note names. Null: the key of the chart. */
      musicalKey: string | null;
      /** The user id of the assigned volunteer of the event, or null. */
      volunteerId: string | null;
      /** The projection theme of the item. Null: the theme of the event. */
      themeId: string | null;
      /** The planned time of the item in seconds. Null: the duration of the arrangement (see `plannedSeconds`). */
      durationSeconds: number | null;
      /** The key of the block of the item (see `EventBlockDTO`). Null: none. */
      blockKey: string | null;
    }
  | {
      kind: "text";
      id: string;
      key: string;
      /** The reference of a scripture reading. */
      title: string;
      notes: string | null;
      /** A scripture reading. */
      scripture: boolean;
      /** The translation of a scripture reading (see `TRANSLATIONS`). Null: the default one. */
      scriptureTranslation: string | null;
      /** The set of the images of an image item (see `EventImageSetsDTO`). Null: no images. */
      imageSetId: string | null;
      /** The announcement of an announcements item (see `EventAnnouncementsDTO`). Null: none. */
      announcementId: string | null;
      /** A text slide: its description and its highlighted text show on the projection. The notes do not. */
      textSlide: boolean;
      /** The description of a text slide. */
      description: string | null;
      /** The highlighted text of a text slide, after its description. */
      highlight: string | null;
      volunteerId: string | null;
      themeId: string | null;
      /** The planned time of the item in seconds. Null: no time. */
      durationSeconds: number | null;
      blockKey: string | null;
    };

export const SETLIST_MAX_ITEMS = 100;

const TOO_MANY_ITEMS = zodMessage(({ m, format }) =>
  format(m.server.setlists.tooManyItems, { max: SETLIST_MAX_ITEMS }),
);

// A volunteer of the event, or null for none. Without it, a song keeps the
// volunteer of the same arrangement and a text item gets none.
const volunteerIdSchema = z.uuid().nullable().optional();

// A projection theme, or null for the theme of the event. Without it, the
// item keeps its theme: a song by its arrangement, a text item by its text.
const themeIdSchema = z.uuid().nullable().optional();

// The planned time in seconds, or null for none. Without it, the item keeps
// its time, as the theme.
const durationSecondsSchema = z
  .number()
  .int()
  .min(1)
  .max(EVENT_ITEM_DURATION_MAX_SECONDS)
  .nullable()
  .optional();

// The block of the item (see `event-blocks.ts`), or null for none. Without
// it, the item keeps its block, as the time. A block that the event does not
// have anymore: none.
const blockKeySchema = z.uuid().nullable().optional();

// The key of an item that the event has, or a new key for a new item. Left
// out: the key of an item of the same arrangement or text, or a new key.
const keySchema = z.uuid().optional();

/**
 * One item of the input for the items of an event. A text item has a title
 * and optional notes, and can be a scripture reading.
 */
export const setlistItemInputSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("song"),
    key: keySchema,
    arrangementId: z.uuid(),
    // The key to play the song in. Null or left out: the key of the chart.
    musicalKey: playKeySchema.nullish(),
    volunteerId: volunteerIdSchema,
    themeId: themeIdSchema,
    durationSeconds: durationSecondsSchema,
    blockKey: blockKeySchema,
  }),
  z.strictObject({
    kind: z.literal("text"),
    key: keySchema,
    title: requiredText(EVENT_ITEM_TITLE_MAX_LENGTH),
    notes: optionalText(EVENT_ITEM_NOTES_MAX_LENGTH),
    scripture: z.boolean().optional(),
    // Only for a scripture reading. Null or left out: the default translation.
    scriptureTranslation: z.string().trim().min(1).max(20).nullish(),
    // An image item: a set of images of the event. Not a scripture reading.
    imageSetId: z.uuid().nullish(),
    // An announcements item: an announcement of the event. Not a scripture reading, no images.
    announcementId: z.uuid().nullish(),
    // A text slide: none of the above. Only a text slide keeps its description and highlighted text.
    textSlide: z.boolean().optional(),
    description: optionalText(EVENT_ITEM_DESCRIPTION_MAX_LENGTH),
    highlight: optionalText(EVENT_ITEM_HIGHLIGHT_MAX_LENGTH),
    volunteerId: volunteerIdSchema,
    themeId: themeIdSchema,
    durationSeconds: durationSecondsSchema,
    blockKey: blockKeySchema,
  }),
]);

const DUPLICATE_KEY = zodMessage(({ m }) => m.server.setlists.duplicateKey);

/** The items of an event, in order. Each key can appear only once. */
export const setlistItemsInputSchema = z
  .array(setlistItemInputSchema)
  .max(SETLIST_MAX_ITEMS, TOO_MANY_ITEMS)
  .refine(
    (items) => {
      const keys = items.flatMap((item) => (item.key ? [item.key] : []));
      return new Set(keys).size === keys.length;
    },
    { message: DUPLICATE_KEY },
  );

export type SetlistItemInput = z.input<typeof setlistItemInputSchema>;

/** The `p_items` argument of `set_event_items()` and `create_event_with_items()`. */
export function toItemsArgument(items: z.output<typeof setlistItemsInputSchema>) {
  return items.map((item) => ({
    ...(item.key && { key: item.key }),
    ...(item.kind === "song"
      ? {
          arrangement_id: item.arrangementId,
          ...(item.musicalKey && { musical_key: item.musicalKey }),
        }
      : {
          title: item.title,
          notes: item.notes,
          ...(item.announcementId
            ? { announcement_id: item.announcementId }
            : item.imageSetId
              ? { image_set_id: item.imageSetId }
              : item.scripture
                ? {
                    scripture: true,
                    ...(item.scriptureTranslation && { translation: item.scriptureTranslation }),
                  }
                : item.textSlide && {
                    text_slide: true,
                    description: item.description,
                    highlight: item.highlight,
                  }),
        }),
    ...(item.volunteerId !== undefined && { volunteer_id: item.volunteerId }),
    ...(item.themeId !== undefined && { theme_id: item.themeId }),
    ...(item.durationSeconds !== undefined && { duration_seconds: item.durationSeconds }),
    ...(item.blockKey !== undefined && { block_key: item.blockKey }),
  }));
}

/** Embed in a select on `setlists`. */
export const SETLIST_ITEMS_COLUMNS = `setlist_items (id, key, position, title, notes, scripture, scripture_translation, image_set_id, announcement_id, text_slide, description, highlight, musical_key, arrangement:arrangements (${ARRANGEMENT_SUMMARY_COLUMNS}, song:songs (${SONG_SUMMARY_COLUMNS})))`;

export const setlistItemsRowSchema = z.array(
  z.object({
    id: z.uuid(),
    key: z.uuid(),
    position: z.number().int(),
    title: z.string().nullable(),
    notes: z.string().nullable(),
    scripture: z.boolean(),
    scripture_translation: z.string().nullable(),
    image_set_id: z.uuid().nullable(),
    announcement_id: z.uuid().nullable(),
    text_slide: z.boolean(),
    description: z.string().nullable(),
    highlight: z.string().nullable(),
    musical_key: z.string().nullable(),
    arrangement: arrangementSummaryRowSchema.extend({ song: songSummaryRowSchema }).nullable(),
    theme: z.object({ theme_id: z.uuid() }).nullable().optional(),
    duration: z.object({ seconds: z.number().int() }).nullable().optional(),
    block: z.object({ block_key: z.uuid() }).nullable().optional(),
    volunteer: z.object({ user_id: z.uuid() }).nullable().optional(),
  }),
);

/** In playing order. */
export function toSetlistItems(rows: z.infer<typeof setlistItemsRowSchema>): SetlistItemDTO[] {
  return rows
    .toSorted((a, b) => a.position - b.position)
    .map(
      ({
        id,
        key,
        title,
        notes,
        scripture,
        scripture_translation,
        image_set_id,
        announcement_id,
        text_slide,
        description,
        highlight,
        musical_key,
        arrangement,
        theme,
        duration,
        block,
        volunteer,
      }): SetlistItemDTO => {
        const volunteerId = volunteer?.user_id ?? null;
        const themeId = theme?.theme_id ?? null;
        const durationSeconds = duration?.seconds ?? null;
        const blockKey = block?.block_key ?? null;
        return arrangement
          ? {
              kind: "song",
              id,
              key,
              song: toSongSummary(arrangement.song),
              arrangement: toArrangementSummary(arrangement),
              musicalKey: musical_key,
              volunteerId,
              themeId,
              durationSeconds,
              blockKey,
            }
          : {
              kind: "text",
              id,
              key,
              title: title ?? "",
              notes,
              scripture,
              scriptureTranslation: scripture_translation,
              imageSetId: image_set_id,
              announcementId: announcement_id,
              textSlide: text_slide,
              description,
              highlight,
              volunteerId,
              themeId,
              durationSeconds,
              blockKey,
            };
      },
    );
}

const ITEM_COLUMNS =
  "id, key, position, title, notes, scripture, scripture_translation, image_set_id, announcement_id, text_slide, description, highlight, musical_key, arrangement:arrangements (" +
  `${ARRANGEMENT_SUMMARY_COLUMNS}, song:songs (${SONG_SUMMARY_COLUMNS}))`;

/**
 * The items of a setlist in playing order, with the time, theme and block of each. Themes,
 * durations and blocks are read by item id (their keys are composite, so no embed).
 */
export async function readSetlistItems(
  setlistId: string,
  client?: SupabaseClient,
): Promise<SetlistItemDTO[]> {
  const supabase = client ?? (await getMusicSupabase());
  const items = await supabase
    .from("setlist_items")
    .select(ITEM_COLUMNS)
    .eq("setlist_id", setlistId);
  if (items.error) throw databaseError("read setlist items", items.error);
  const rows = setlistItemsRowSchema.parse(items.data);
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) return [];
  const [themes, durations, blocks, volunteers] = await Promise.all([
    supabase
      .from("setlist_item_themes")
      .select("setlist_item_id, theme_id")
      .in("setlist_item_id", ids),
    supabase
      .from("setlist_item_durations")
      .select("setlist_item_id, seconds")
      .in("setlist_item_id", ids),
    supabase
      .from("setlist_item_blocks")
      .select("setlist_item_id, block_key")
      .in("setlist_item_id", ids),
    supabase
      .from("setlist_item_volunteers")
      .select("setlist_item_id, user_id")
      .in("setlist_item_id", ids),
  ]);
  for (const result of [themes, durations, blocks, volunteers]) {
    if (result.error) throw databaseError("read setlist item details", result.error);
  }
  const byItem = <T extends { setlist_item_id: string }>(data: T[] | null) =>
    new Map((data ?? []).map((row) => [row.setlist_item_id, row]));
  const themeOf = byItem(themes.data);
  const durationOf = byItem(durations.data);
  const blockOf = byItem(blocks.data);
  const volunteerOf = byItem(volunteers.data);
  return toSetlistItems(
    rows.map((row) => ({
      ...row,
      theme: themeOf.get(row.id) ?? null,
      duration: durationOf.get(row.id) ?? null,
      block: blockOf.get(row.id) ?? null,
      volunteer: volunteerOf.get(row.id) ?? null,
    })),
  );
}

/** The `p_items` form of saved items, to save them again with changes (see `toItemsArgument`). */
export function itemsToInput(items: readonly SetlistItemDTO[]): SetlistItemInput[] {
  return items.map((item) =>
    item.kind === "song"
      ? {
          kind: "song",
          key: item.key,
          arrangementId: item.arrangement.id,
          musicalKey: item.musicalKey,
          volunteerId: item.volunteerId,
          themeId: item.themeId,
          durationSeconds: item.durationSeconds,
          blockKey: item.blockKey,
        }
      : {
          kind: "text",
          key: item.key,
          title: item.title,
          notes: item.notes,
          scripture: item.scripture,
          scriptureTranslation: item.scriptureTranslation,
          imageSetId: item.imageSetId,
          announcementId: item.announcementId,
          textSlide: item.textSlide,
          description: item.description,
          highlight: item.highlight,
          volunteerId: item.volunteerId,
          themeId: item.themeId,
          durationSeconds: item.durationSeconds,
          blockKey: item.blockKey,
        },
  );
}
