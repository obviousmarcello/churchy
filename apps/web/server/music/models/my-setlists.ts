import "server-only";

import { z } from "zod";

import type { SongViews } from "@/lib/music/sheet-view";
import { requireUser } from "@/server/music/auth";
import { getMusicSupabase } from "@/server/music/db";
import {
  ANNOTATION_COLUMNS,
  annotationRowSchema,
  toAnnotation,
  type AnnotationDTO,
} from "./annotations";
import {
  ARRANGEMENT_COLUMNS,
  arrangementRowSchema,
  toArrangement,
  type ArrangementDTO,
} from "./arrangements";
import { plannedSeconds } from "@/lib/music/event-timing";
import { canSeeEvent } from "./event-access";
import { readEventBlocks, type EventBlockDTO } from "./event-blocks";
import { settingsByArrangement } from "./my-arrangements";
import { databaseError, isId } from "./shared";
import {
  SONG_SUMMARY_COLUMNS,
  songSummaryRowSchema,
  toSongSummary,
  type SongSummaryDTO,
} from "./songs";

// The signed-in user's own version of the items of an event: each song slot's
// arrangement plus the user's capo and key for it (see `my-arrangements.ts`) and
// annotations (see `setlists.ts`), and the volunteer of each item. Text items
// have no personal data. Every function is scoped to the signed-in user.

export type PersonalAnnotationDTO = AnnotationDTO & {
  /**
   * False when the annotation names a section this arrangement does not have.
   * Show those apart, e.g. in a list under the chart.
   */
  inArrangement: boolean;
};

export type PersonalSetlistItemDTO =
  | {
      kind: "song";
      id: string;
      /** The same in each new setlist of the event, while the item stays (see `SetlistItemDTO.key`). */
      key: string;
      song: SongSummaryDTO;
      arrangement: ArrangementDTO;
      /** The user's capo for the arrangement. Null to use the chart's `{capo}`. */
      capo: number | null;
      /** The key of the slot, in English note names. Null: the key of the chart. */
      slotKey: string | null;
      /** The user's key for the arrangement. Null: the key of the slot or the chart. */
      ownKey: string | null;
      /** The user's layout of the arrangement on the sheet, by device type. */
      views: SongViews;
      /** The user id of the volunteer of the item, or null. */
      volunteerId: string | null;
      /** The block of the item (see `EventBlockDTO`). Null: none. */
      blockKey: string | null;
      /** The planned time of the item in seconds (see `plannedSeconds`). Null: none. */
      plannedSeconds: number | null;
      /** Reusable annotations on this song, plus the ones for this slot only. */
      annotations: PersonalAnnotationDTO[];
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
      /** The translation of a scripture reading. Null: the default translation. */
      scriptureTranslation: string | null;
      /** An image item: the set of its images. */
      imageSetId: string | null;
      /** An announcements item. */
      announcementId: string | null;
      /** A text slide, with its description and its highlighted text. */
      textSlide: boolean;
      description: string | null;
      highlight: string | null;
      volunteerId: string | null;
      blockKey: string | null;
      plannedSeconds: number | null;
    };

const ITEM_COLUMNS = `id, key, position, title, notes, scripture, scripture_translation, image_set_id, announcement_id, text_slide, description, highlight, musical_key, arrangement:arrangements (${ARRANGEMENT_COLUMNS}, song:songs (${SONG_SUMMARY_COLUMNS}))`;

const itemRowSchema = z.object({
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
  arrangement: arrangementRowSchema.extend({ song: songSummaryRowSchema }).nullable(),
  // Read by item id (their keys are composite, so no embed): see `withExtras`.
  volunteer: z.object({ user_id: z.uuid() }).nullable().default(null),
  duration: z.object({ seconds: z.number().int() }).nullable().default(null),
  block: z.object({ block_key: z.uuid() }).nullable().default(null),
});

type ItemRow = z.infer<typeof itemRowSchema>;

/**
 * The event's title, its start, its items in order and the blocks of the
 * items, or null if there is no such event, or the user cannot see it.
 */
export async function getMyEventSetlist(eventId: string): Promise<{
  title: string;
  startsAt: string;
  items: PersonalSetlistItemDTO[];
  blocks: EventBlockDTO[];
} | null> {
  const user = await requireUser();
  if (!(await canSeeEvent(user.id, eventId))) return null;

  const supabase = await getMusicSupabase();
  const { data, error } = await supabase
    .from("events")
    .select("title, starts_at, setlist_id")
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw databaseError("get event items", error);
  if (!data) return null;
  const row = z
    .object({ title: z.string(), starts_at: z.string(), setlist_id: z.uuid().nullable() })
    .parse(data);

  let items: ItemRow[] = [];
  if (row.setlist_id !== null) {
    const rows = await supabase
      .from("setlist_items")
      .select(ITEM_COLUMNS)
      .eq("setlist_id", row.setlist_id);
    if (rows.error) throw databaseError("get event items", rows.error);
    items = (await withExtras(z.array(itemRowSchema).parse(rows.data))).toSorted(
      (a, b) => a.position - b.position,
    );
  }
  return {
    title: row.title,
    startsAt: new Date(row.starts_at).toISOString(),
    items: await personalize(user.id, items),
    blocks: (await readEventBlocks(eventId)) ?? [],
  };
}

/** The volunteer, the planned time and the block of each item (read by item id). */
async function withExtras(items: ItemRow[]): Promise<ItemRow[]> {
  if (items.length === 0) return items;
  const ids = items.map((item) => item.id);
  const supabase = await getMusicSupabase();
  const [volunteers, durations, blocks] = await Promise.all([
    supabase
      .from("setlist_item_volunteers")
      .select("setlist_item_id, user_id")
      .in("setlist_item_id", ids),
    supabase
      .from("setlist_item_durations")
      .select("setlist_item_id, seconds")
      .in("setlist_item_id", ids),
    supabase
      .from("setlist_item_blocks")
      .select("setlist_item_id, block_key")
      .in("setlist_item_id", ids),
  ]);
  for (const result of [volunteers, durations, blocks]) {
    if (result.error) throw databaseError("get item details", result.error);
  }
  const by = <T extends { setlist_item_id: string }>(data: T[] | null) =>
    new Map((data ?? []).map((row) => [row.setlist_item_id, row]));
  const volunteerOf = by(volunteers.data);
  const durationOf = by(durations.data);
  const blockOf = by(blocks.data);
  return items.map((item) => ({
    ...item,
    volunteer: volunteerOf.get(item.id) ? { user_id: volunteerOf.get(item.id)!.user_id } : null,
    duration: durationOf.get(item.id) ? { seconds: durationOf.get(item.id)!.seconds } : null,
    block: blockOf.get(item.id) ? { block_key: blockOf.get(item.id)!.block_key } : null,
  }));
}

export async function getMySetlistItem(itemId: string): Promise<PersonalSetlistItemDTO | null> {
  const user = await requireUser();
  if (!isId(itemId)) return null;

  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("setlist_items")
    .select(ITEM_COLUMNS)
    .eq("id", itemId)
    .maybeSingle();
  if (error) throw databaseError("get setlist item", error);
  if (!data) return null;

  const [item] = await personalize(user.id, await withExtras([itemRowSchema.parse(data)]));
  return item ?? null;
}

async function personalize(userId: string, items: ItemRow[]): Promise<PersonalSetlistItemDTO[]> {
  if (items.length === 0) return [];

  const arrangements = items.flatMap((item) => (item.arrangement ? [item.arrangement] : []));
  const songIds = [...new Set(arrangements.map((arrangement) => arrangement.song.id))];

  const [settings, annotations] = await Promise.all([
    settingsByArrangement(
      userId,
      arrangements.map((arrangement) => arrangement.id),
    ),
    (await getMusicSupabase())
      .from("annotations")
      .select(ANNOTATION_COLUMNS)
      .eq("user_id", userId)
      .in("song_id", songIds)
      .order("created_at", { ascending: true }),
  ]);
  if (annotations.error) throw databaseError("load annotations", annotations.error);

  const allAnnotations = z.array(annotationRowSchema).parse(annotations.data).map(toAnnotation);

  return items.map((item): PersonalSetlistItemDTO => {
    const volunteerId = item.volunteer?.user_id ?? null;
    const blockKey = item.block?.block_key ?? null;
    const ownSeconds = item.duration?.seconds ?? null;
    if (!item.arrangement) {
      return {
        kind: "text",
        id: item.id,
        key: item.key,
        title: item.title ?? "",
        notes: item.notes,
        scripture: item.scripture,
        scriptureTranslation: item.scripture_translation,
        imageSetId: item.image_set_id,
        announcementId: item.announcement_id,
        textSlide: item.text_slide,
        description: item.description,
        highlight: item.highlight,
        volunteerId,
        blockKey,
        plannedSeconds: ownSeconds,
      };
    }

    const arrangement = toArrangement(item.arrangement);
    const sections = new Set(arrangement.sections.map((label) => label.toLowerCase()));
    return {
      kind: "song",
      id: item.id,
      key: item.key,
      song: toSongSummary(item.arrangement.song),
      arrangement,
      capo: settings.get(arrangement.id)?.capo ?? null,
      slotKey: item.musical_key,
      ownKey: settings.get(arrangement.id)?.key ?? null,
      views: settings.get(arrangement.id)?.views ?? {},
      volunteerId,
      blockKey,
      plannedSeconds: plannedSeconds(ownSeconds, arrangement.durationSeconds),
      annotations: allAnnotations
        .filter(
          (a) =>
            a.songId === arrangement.songId &&
            (a.setlistItemId === null || a.setlistItemId === item.id),
        )
        .map((a) => ({
          ...a,
          inArrangement: a.sectionLabel === null || sections.has(a.sectionLabel.toLowerCase()),
        })),
    };
  });
}
