import "server-only";

import { z } from "zod";

import { getRequestI18n } from "@/i18n/music/server";
import { canonicalKey, parseKey } from "@/lib/music/chords/key";
/** The longest search text (their `lib/search-palette`, the search palette comes later). */
const SEARCH_QUERY_MAX_LENGTH = 100;
import { parseSnippet, type SnippetPart } from "@/lib/music/snippet";
import {
  BPM_MAX,
  BPM_MIN,
  DEFAULT_SONG_SORT,
  SONG_SORTS,
  SONGS_PAGE_SIZE,
  type SongFilters,
  type SongSort,
} from "@/lib/music/song-filters";
import { searchKey } from "@/lib/music/search-text";
import { SONG_COPYRIGHT_MAX_LENGTH } from "@/lib/music/song-copyright";
import {
  SONG_AUTHORS_MAX_LENGTH,
  SONG_ORIGINAL_TITLE_MAX_LENGTH,
  SONG_RIGHTS_NOTE_MAX_LENGTH,
  SONG_RIGHTS_STATUSES,
  SONG_TRANSLATOR_MAX_LENGTH,
  type SongRightsStatus,
} from "@/lib/music/song-rights";
import { SONG_SONGBOOK_MAX_LENGTH } from "@/lib/music/song-songbook";
import { SONG_TAG_MAX_LENGTH, SONG_TAGS_MAX, normalizeTags } from "@/lib/music/song-tags";
import { requireSongAdmin, requireUser } from "@/server/music/auth";
import { ConflictError, ValidationError } from "@/server/music/errors";
import { getMusicSupabase } from "@/server/music/db";
import { zodMessage } from "@/server/music/zod-i18n";
import {
  ARRANGEMENT_COLUMNS,
  ARRANGEMENT_SUMMARY_COLUMNS,
  arrangementContentShape,
  arrangementRowSchema,
  arrangementSummaryRowSchema,
  getArrangement,
  toArrangement,
  toArrangementSummary,
  normalizeContent,
  updateArrangement,
  type ArrangementDTO,
  type ArrangementSummaryDTO,
} from "./arrangements";
import {
  IMAGE_COLUMNS,
  imageRowSchema,
  listImagePaths,
  removeImageFiles,
  sortImages,
  toSongImage,
  type SongImageDTO,
} from "./images";
import { LINK_COLUMNS, linkRowSchema, sortLinks, toSongLink, type SongLinkDTO } from "./links";
import {
  PDF_COLUMNS,
  listPdfPaths,
  pdfRowSchema,
  removePdfFiles,
  sortPdfs,
  toSongPdf,
  type SongPdfDTO,
} from "./pdfs";
import {
  SCORE_COLUMNS,
  listScorePaths,
  removeScoreFiles,
  scoreRowSchema,
  sortScores,
  toSongScore,
  type SongScoreDTO,
} from "./scores";
import { databaseError, idSchema, isId, optionalText, parseInput, requiredText } from "./shared";
import {
  SOUND_FILE_COLUMNS,
  listSoundFilePaths,
  removeSoundFiles,
  sortSoundFiles,
  soundFileRowSchema,
  toSongSoundFile,
  type SongSoundFileDTO,
} from "./sound-files";

// Songs are lightweight: a title and an artist. The music itself (ChordPro
// chart and section order) lives in arrangements. Every song has a default
// arrangement. Anyone can read songs; only song admins and superadmins can
// change them.

export type SongSummaryDTO = {
  id: string;
  title: string;
  artist: string | null;
};

export type SongWithArrangementsDTO = SongSummaryDTO & {
  /** The book and the number of the song in it, e.g. "Dicsérd az Urat 123". The song searches use it. */
  songbook: string | null;
  /** The default arrangement first, then by name. */
  arrangements: ArrangementSummaryDTO[];
};

export type SongDTO = SongWithArrangementsDTO & {
  /** E.g. "Christmas", in the order of the song form. */
  tags: string[];
  /** Free text for the title slide of the projection, e.g. "© 2010 Hillsong". Can have line breaks. */
  copyright: string | null;
  /** The authors of the lyrics and the music, e.g. "Reuben Morgan". The artist is the performer. */
  authors: string | null;
  /** Only for a translation: the title of the original song. It helps to find the original publisher. */
  originalTitle: string | null;
  /** Only for a translation. */
  translator: string | null;
  /** The state of the permission to use the song. For a translation, the weaker side. */
  rightsStatus: SongRightsStatus;
  /** The source of the permission, e.g. "kottatar.hu, 10 copies". Can have line breaks. */
  rightsNote: string | null;
  /** The MusicXML scores, by name. */
  scores: SongScoreDTO[];
  /** The PDF files, by name. */
  pdfs: SongPdfDTO[];
  /** The images, by name. */
  images: SongImageDTO[];
  /** The sound files, by name. */
  soundFiles: SongSoundFileDTO[];
  /** The links, e.g. to YouTube, by name. */
  links: SongLinkDTO[];
};

const TAG_TOO_LONG = zodMessage(({ m, format }) =>
  format(m.server.songs.tagTooLong, { max: SONG_TAG_MAX_LENGTH }),
);
const TOO_MANY_TAGS = zodMessage(({ m, format }) =>
  format(m.server.songs.tooManyTags, { max: SONG_TAGS_MAX }),
);

/** Trimmed, without empty tags and without tags that differ only in case. */
const tagsSchema = z
  .array(z.string())
  .max(100)
  .transform(normalizeTags)
  .pipe(
    z
      .array(z.string().max(SONG_TAG_MAX_LENGTH, { message: TAG_TOO_LONG }))
      .max(SONG_TAGS_MAX, { message: TOO_MANY_TAGS }),
  );

export const songInputSchema = z.strictObject({
  title: requiredText(200),
  artist: optionalText(200),
  // Left out: an update keeps the tags, and a new song gets none.
  tags: tagsSchema.optional(),
  // Left out: an update keeps the copyright, and a new song gets none. Blank: none.
  copyright: optionalText(SONG_COPYRIGHT_MAX_LENGTH).optional(),
  // Left out: an update keeps the songbook, and a new song gets none. Blank: none.
  songbook: optionalText(SONG_SONGBOOK_MAX_LENGTH).optional(),
  // Left out: an update keeps the rights, and a new song gets none (the status `unknown`). Blank: none.
  authors: optionalText(SONG_AUTHORS_MAX_LENGTH).optional(),
  originalTitle: optionalText(SONG_ORIGINAL_TITLE_MAX_LENGTH).optional(),
  translator: optionalText(SONG_TRANSLATOR_MAX_LENGTH).optional(),
  rightsStatus: z.enum(SONG_RIGHTS_STATUSES).optional(),
  rightsNote: optionalText(SONG_RIGHTS_NOTE_MAX_LENGTH).optional(),
});

/** A new song, with the content of its default arrangement. Only `title` is required. */
export const newSongInputSchema = z
  .strictObject({ ...songInputSchema.shape, ...arrangementContentShape })
  .transform(normalizeContent);

export type SongInput = z.input<typeof songInputSchema>;
export type NewSongInput = z.input<typeof newSongInputSchema>;

/** The most songs that `searchSongs()` gives. */
export const SONG_SEARCH_MAX_RESULTS = 10;

const searchQuerySchema = requiredText(SEARCH_QUERY_MAX_LENGTH);

export const SONG_SUMMARY_COLUMNS = "id, title, artist";

export const songSummaryRowSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  artist: z.string().nullable(),
});

const songWithArrangementsRowSchema = songSummaryRowSchema.extend({
  songbook: z.string().nullable(),
  arrangements: z.array(arrangementSummaryRowSchema),
});

const songRowSchema = songWithArrangementsRowSchema.extend({
  tags: z.array(z.string()),
  copyright: z.string().nullable(),
  authors: z.string().nullable(),
  original_title: z.string().nullable(),
  translator: z.string().nullable(),
  rights_status: z.enum(SONG_RIGHTS_STATUSES),
  rights_note: z.string().nullable(),
  song_scores: z.array(scoreRowSchema),
  song_pdfs: z.array(pdfRowSchema),
  song_images: z.array(imageRowSchema),
  song_sound_files: z.array(soundFileRowSchema),
  song_links: z.array(linkRowSchema),
});

const SONG_WITH_ARRANGEMENTS_COLUMNS = `${SONG_SUMMARY_COLUMNS}, songbook, arrangements (${ARRANGEMENT_SUMMARY_COLUMNS})`;
const SONG_COLUMNS = `${SONG_WITH_ARRANGEMENTS_COLUMNS}, tags, copyright, authors, original_title, translator, rights_status, rights_note, song_scores (${SCORE_COLUMNS}), song_pdfs (${PDF_COLUMNS}), song_images (${IMAGE_COLUMNS}), song_sound_files (${SOUND_FILE_COLUMNS}), song_links (${LINK_COLUMNS})`;

// The reads check the session too, not only the proxy: a new route or a
// change of the proxy matcher must not make them public. `requireUser()` is
// cached for each request, so the check is cheap.

export async function listSongs(): Promise<SongSummaryDTO[]> {
  await requireUser();
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("songs")
    .select(SONG_SUMMARY_COLUMNS)
    .order("title", { ascending: true });
  if (error) throw databaseError("list songs", error);

  return z.array(songSummaryRowSchema).parse(data).map(toSongSummary);
}

/** PostgREST gives at most `max_rows` rows (see `supabase/config.toml`): a longer list reads more pages. */
const SONG_LIST_PAGE_SIZE = 1000;

/** Every song with its arrangements, by title. E.g. to choose the songs of an event. Without the scores. */
export async function listSongsWithArrangements(): Promise<SongWithArrangementsDTO[]> {
  await requireUser();
  const rows: unknown[] = [];
  for (let from = 0; ; from += SONG_LIST_PAGE_SIZE) {
    const { data, error } = await (
      await getMusicSupabase()
    )
      .from("songs")
      .select(SONG_WITH_ARRANGEMENTS_COLUMNS)
      .order("title", { ascending: true })
      // A second order: songs with the same title stay in the same order on each page.
      .order("id", { ascending: true })
      .range(from, from + SONG_LIST_PAGE_SIZE - 1);
    if (error) throw databaseError("list songs", error);
    rows.push(...data);
    if (data.length < SONG_LIST_PAGE_SIZE) break;
  }

  const { compare } = await getRequestI18n();
  return z
    .array(songWithArrangementsRowSchema)
    .parse(rows)
    .map((row) => toSongWithArrangements(row, compare));
}

/** An event in the play history of a song. */
export type SongPlayEventDTO = {
  id: string;
  title: string;
  /** ISO 8601 timestamp in UTC. */
  startsAt: string;
};

/**
 * When events used the song. A song is played at an event when the event has
 * started and has an arrangement of the song. A later event plans it.
 */
export type SongPlaysDTO = {
  /** The number of events in the last 12 months that played the song. */
  recentCount: number;
  /** The last 5 events that played the song, the most recent first. */
  recentEvents: SongPlayEventDTO[];
  /** The next event that plans the song, or null. */
  nextEvent: SongPlayEventDTO | null;
};

/** A song of the songs page, with its play history. */
export type SongListItemDTO = SongDTO & { plays: SongPlaysDTO };

/** The lyrics of an arrangement that match the search. */
export type SongSnippetDTO = {
  /** The name of the arrangement, or null for the default arrangement. */
  arrangementName: string | null;
  parts: SnippetPart[];
};

export type SongPageDTO = {
  /** The songs of the page, in the order of the sort, with their arrangements. */
  songs: SongListItemDTO[];
  /** By song id: the lyrics that match the search, for the songs whose title, artist and songbook do not match. */
  snippets: Record<string, SongSnippetDTO>;
  /** The number of songs that match the filters, on all pages. */
  total: number;
  page: number;
  pageCount: number;
};

/** A song that matches a search of the search palette. */
export type SongSearchResultDTO = SongSummaryDTO & {
  /** The palette shows it when it matches the search. */
  songbook: string | null;
  /** The lyrics that match, when the title, the artist and the songbook do not. */
  snippet: SongSnippetDTO | null;
};

export type SongSearchDTO = {
  /** The first songs, in the order of the songs page. */
  songs: SongSearchResultDTO[];
  /** The number of songs that match, also those that are not in `songs`. */
  total: number;
};

export type SongFilterOptionsDTO = {
  /**
   * The keys and other keys of the arrangements, in usual English names, by
   * note from C: e.g. ["C", "Eb", "G", "Am"]. Major keys come first.
   */
  keys: string[];
  /** The time signatures that the arrangements use, e.g. ["3/4", "4/4"]. */
  timeSignatures: string[];
  /** The tags of the songs, by name. Of tags that differ only in case, one. */
  tags: string[];
};

const songPageInputSchema = z.strictObject({
  query: optionalText(100),
  key: optionalText(20),
  timeSignature: optionalText(10),
  bpmMin: z.number().int().min(BPM_MIN).max(BPM_MAX).nullish(),
  bpmMax: z.number().int().min(BPM_MIN).max(BPM_MAX).nullish(),
  tag: optionalText(SONG_TAG_MAX_LENGTH),
  sort: z.enum(SONG_SORTS).default(DEFAULT_SONG_SORT),
  page: z.number().int().min(1).default(1),
});

const filterSongsResultSchema = z.object({
  total: z.number().int(),
  ids: z.array(z.uuid()),
  snippets: z.record(
    z.uuid(),
    z.object({ arrangement: z.string(), is_default: z.boolean(), text: z.string() }),
  ),
});

const playEventRowSchema = z.object({ id: z.uuid(), title: z.string(), starts_at: z.string() });

const songPlayStatsSchema = z.record(
  z.uuid(),
  z.object({
    recent_count: z.number().int(),
    recent_events: z.array(playEventRowSchema),
    next_event: playEventRowSchema.nullable(),
  }),
);

const NO_PLAYS: SongPlaysDTO = { recentCount: 0, recentEvents: [], nextEvent: null };

/**
 * One page of the songs that match the filters (see `filter_songs`). A song
 * matches the key, tempo and time signature filters if one of its
 * arrangements matches all of them.
 */
export async function findSongs(
  input: SongFilters & { sort?: SongSort; page?: number },
): Promise<SongPageDTO> {
  const user = await requireUser();
  const { page, ...filters } = parseInput(songPageInputSchema, input);

  const { total, ids, snippets } = await filterSongIds(
    filters,
    SONGS_PAGE_SIZE,
    (page - 1) * SONGS_PAGE_SIZE,
  );
  const pageCount = Math.ceil(total / SONGS_PAGE_SIZE);
  if (ids.length === 0) return { songs: [], snippets: {}, total, page, pageCount };

  const [{ data: rows, error: rowsError }, plays] = await Promise.all([
    (await getMusicSupabase()).from("songs").select(SONG_COLUMNS).in("id", ids),
    readSongPlays(ids, user.id),
  ]);
  if (rowsError) throw databaseError("list songs", rowsError);

  const { compare } = await getRequestI18n();
  const songsById = new Map(
    z
      .array(songRowSchema)
      .parse(rows)
      .map((row) => [row.id, toSong(row, compare)]),
  );
  const songs = inOrder(ids, songsById).map((song) => ({
    ...song,
    plays: plays.get(song.id) ?? NO_PLAYS,
  }));
  return { songs, snippets, total, page, pageCount };
}

type FilterSongsInput = Omit<z.output<typeof songPageInputSchema>, "page">;

/** The ids of the songs that match, in order, with their total and the lyrics that match (see `filter_songs`). */
async function filterSongIds(filters: FilterSongsInput, limit: number, offset: number) {
  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("filter_songs", {
    p_query: filters.query,
    // The usual English name, as in `arrangements.key_names`. Also finds "A#" for "Bb".
    p_key: filters.key ? (canonicalKey(filters.key) ?? filters.key) : filters.key,
    p_time_signature: filters.timeSignature,
    p_bpm_min: filters.bpmMin ?? null,
    p_bpm_max: filters.bpmMax ?? null,
    p_tag: filters.tag,
    p_sort: filters.sort,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw databaseError("filter songs", error);

  const { total, ids, snippets } = filterSongsResultSchema.parse(data);
  return { total, ids, snippets: toSnippets(snippets) };
}

/** The songs in the order of `filter_songs`. A song deleted between the two queries is left out. */
function inOrder<Song>(ids: string[], songsById: Map<string, Song>): Song[] {
  return ids.flatMap((id) => {
    const song = songsById.get(id);
    return song === undefined ? [] : [song];
  });
}

/** The snippets of `filter_songs` with a highlighted search word, by song id. */
function toSnippets(
  rows: z.infer<typeof filterSongsResultSchema>["snippets"],
): Record<string, SongSnippetDTO> {
  const snippets: Record<string, SongSnippetDTO> = {};
  for (const [id, row] of Object.entries(rows)) {
    const parts = parseSnippet(row.text);
    if (parts.some((part) => part.match)) {
      snippets[id] = { arrangementName: row.is_default ? null : row.arrangement, parts };
    }
  }
  return snippets;
}

/** The song with its play history, e.g. a song of the songs page that is not on the current page. */
export async function getSongWithPlays(id: string): Promise<SongListItemDTO | null> {
  // The session first: `readSongPlays` does not check it.
  const user = await requireUser();
  if (!isId(id)) return null;
  const [song, plays] = await Promise.all([getSong(id), readSongPlays([id], user.id)]);
  if (!song) return null;
  return { ...song, plays: plays.get(song.id) ?? NO_PLAYS };
}

/**
 * The play history of the songs (see `song_play_stats`), with the events that
 * the user can see. Songs without events are left out. The caller checks the session.
 */
async function readSongPlays(ids: string[], userId: string): Promise<Map<string, SongPlaysDTO>> {
  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("song_play_stats", { p_song_ids: ids, p_user_id: userId });
  if (error) throw databaseError("read song plays", error);

  return new Map(
    Object.entries(songPlayStatsSchema.parse(data)).map(([id, row]) => [
      id,
      {
        recentCount: row.recent_count,
        recentEvents: row.recent_events.map(toSongPlayEvent),
        nextEvent: row.next_event && toSongPlayEvent(row.next_event),
      },
    ]),
  );
}

function toSongPlayEvent(row: z.infer<typeof playEventRowSchema>): SongPlayEventDTO {
  return { id: row.id, title: row.title, startsAt: new Date(row.starts_at).toISOString() };
}

export async function listSongFilterOptions(): Promise<SongFilterOptionsDTO> {
  await requireUser();
  const { data, error } = await (await getMusicSupabase()).rpc("song_filter_options");
  if (error) throw databaseError("list song filter options", error);

  const options = z
    .object({
      keys: z.array(z.string()),
      timeSignatures: z.array(z.string()),
      tags: z.array(z.string()),
    })
    .parse(data);
  const { compare } = await getRequestI18n();
  return { ...options, keys: options.keys.toSorted(byKey), tags: options.tags.toSorted(compare) };
}

/**
 * The tags of all songs, by name, e.g. for the suggestions of the song form.
 * Of tags that differ only in case, the most used one (see `song_tags()`).
 */
export async function listSongTags(): Promise<string[]> {
  await requireUser();
  const { data, error } = await (await getMusicSupabase()).rpc("song_tags");
  if (error) throw databaseError("list song tags", error);

  const { compare } = await getRequestI18n();
  return z.array(z.string()).parse(data).toSorted(compare);
}

/**
 * Fails if the database does not accept the tags (`valid_song_tags()`). After
 * `tagsSchema`, only two tags that differ only in case can fail: `lower()` in
 * the database can differ from the `toLowerCase` of `normalizeTags`.
 */
async function checkTags(tags: string[]): Promise<void> {
  if (tags.length === 0) return;
  const { data, error } = await (await getMusicSupabase()).rpc("valid_song_tags", { p_tags: tags });
  if (error) throw databaseError("check song tags", error);
  if (data !== true)
    throw new ValidationError([{ path: "tags", message: ({ m }) => m.server.songs.duplicateTags }]);
}

function byKey(a: string, b: string) {
  const first = parseKey(a);
  const second = parseKey(b);
  if (!first || !second) return a.localeCompare(b);
  return Number(first.minor) - Number(second.minor) || first.tonic - second.tonic;
}

/**
 * The first songs that match the search text, for the search palette: as on
 * the songs page without other filters (see `filter_songs`), with the lyrics
 * that match in any arrangement. Accents, case and punctuation do not count.
 */
export async function searchSongs(query: string, limit: number): Promise<SongSearchDTO> {
  await requireUser();
  const parsed = searchQuerySchema.safeParse(query);
  // Only punctuation, e.g. "?": `filter_songs` would give all songs.
  if (!parsed.success || searchKey(parsed.data) === "") return { songs: [], total: 0 };

  const { total, ids, snippets } = await filterSongIds(
    {
      query: parsed.data,
      key: null,
      timeSignature: null,
      bpmMin: null,
      bpmMax: null,
      tag: null,
      sort: DEFAULT_SONG_SORT,
    },
    Math.min(Math.max(Math.trunc(limit) || 1, 1), SONG_SEARCH_MAX_RESULTS),
    0,
  );
  if (ids.length === 0) return { songs: [], total };

  const { data: rows, error: rowsError } = await (
    await getMusicSupabase()
  )
    .from("songs")
    .select(`${SONG_SUMMARY_COLUMNS}, songbook`)
    .in("id", ids);
  if (rowsError) throw databaseError("list songs", rowsError);

  const songsById = new Map(
    z
      .array(songSummaryRowSchema.extend({ songbook: z.string().nullable() }))
      .parse(rows)
      .map((row) => [row.id, { ...toSongSummary(row), songbook: row.songbook }]),
  );
  const songs = inOrder(ids, songsById).map((song) => ({
    ...song,
    snippet: snippets[song.id] ?? null,
  }));
  return { songs, total };
}

export async function getSong(id: string): Promise<SongDTO | null> {
  await requireUser();
  if (!isId(id)) return null;

  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("songs")
    .select(SONG_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw databaseError("get song", error);
  if (!data) return null;

  return toSong(songRowSchema.parse(data), (await getRequestI18n()).compare);
}

/**
 * The arrangements with their songs, in the order of `ids`, e.g. for a
 * setlist that is not saved yet, with a repeated id each time. Leaves out the
 * ids of arrangements that do not exist. The caller limits the number of ids.
 */
export async function listArrangementsWithSongs(
  ids: string[],
): Promise<{ song: SongSummaryDTO; arrangement: ArrangementDTO }[]> {
  await requireUser();
  const validIds = [...new Set(ids.filter(isId))];
  if (validIds.length === 0) return [];

  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("arrangements")
    .select(`${ARRANGEMENT_COLUMNS}, song:songs (${SONG_SUMMARY_COLUMNS})`)
    .in("id", validIds);
  if (error) throw databaseError("list arrangements", error);

  const rows = z.array(arrangementRowSchema.extend({ song: songSummaryRowSchema })).parse(data);
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [{ song: toSongSummary(row.song), arrangement: toArrangement(row) }] : [];
  });
}

/** Creates the song and its default arrangement in one transaction. */
export async function createSong(input: unknown): Promise<SongDTO> {
  await requireSongAdmin();
  const song = parseInput(newSongInputSchema, input);
  if (song.tags) await checkTags(song.tags);

  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("create_song", {
    p_title: song.title,
    p_artist: song.artist,
    p_tags: song.tags ?? [],
    p_chordpro: song.chordpro,
    p_section_order: song.sectionOrder,
    p_copyright: song.copyright ?? null,
    p_songbook: song.songbook ?? null,
    p_authors: song.authors ?? null,
    p_original_title: song.originalTitle ?? null,
    p_translator: song.translator ?? null,
    p_rights_status: song.rightsStatus ?? null,
    p_rights_note: song.rightsNote ?? null,
  });
  if (error) throw databaseError("create song", error);

  const created = await getSong(idSchema.parse(data));
  if (!created) throw new Error("Failed to create song");
  return created;
}

/** Replaces the title, the artist, and the tags, the copyright, the songbook and the rights (if given). Returns null if there is no such song. */
export async function updateSong(id: string, input: unknown): Promise<SongDTO | null> {
  await requireSongAdmin();
  if (!isId(id)) return null;
  const song = parseInput(songInputSchema, input);
  if (song.tags) await checkTags(song.tags);

  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("songs")
    .update({
      title: song.title,
      artist: song.artist,
      ...(song.tags && { tags: song.tags }),
      ...(song.copyright !== undefined && { copyright: song.copyright }),
      ...(song.songbook !== undefined && { songbook: song.songbook }),
      ...(song.authors !== undefined && { authors: song.authors }),
      ...(song.originalTitle !== undefined && { original_title: song.originalTitle }),
      ...(song.translator !== undefined && { translator: song.translator }),
      ...(song.rightsStatus !== undefined && { rights_status: song.rightsStatus }),
      ...(song.rightsNote !== undefined && { rights_note: song.rightsNote }),
    })
    .eq("id", id)
    .select("id");
  if (error) throw databaseError("update song", error);

  return data.length > 0 ? getSong(id) : null;
}

/**
 * Replaces the title, the artist, the tags, the copyright, the songbook and the rights, and the content of one of the song's
 * arrangements (as `createSong` takes it). `themeId` (if given) is the
 * projection theme of the arrangement, null for none. Checks all the input
 * before it changes anything. Returns null if there is no such song or arrangement.
 */
export async function updateSongWithArrangement(
  id: string,
  arrangementId: string,
  input: unknown,
  themeId?: string | null,
): Promise<SongDTO | null> {
  await requireSongAdmin();
  const {
    title,
    artist,
    tags,
    copyright,
    songbook,
    authors,
    originalTitle,
    translator,
    rightsStatus,
    rightsNote,
    ...content
  } = parseInput(newSongInputSchema, input);

  const arrangement = await getArrangement(arrangementId);
  if (!arrangement || arrangement.songId !== id) return null;
  // The tags are saved last: the database must accept them before the arrangement changes.
  if (tags) await checkTags(tags);

  // `newSongInputSchema` already converted the chart as the input asks and wrote the metadata into it.
  if (!(await updateArrangement(arrangementId, { ...content, keepPlainSections: true, themeId })))
    return null;
  return updateSong(id, {
    title,
    artist,
    tags,
    copyright,
    songbook,
    authors,
    originalTitle,
    translator,
    rightsStatus,
    rightsNote,
  });
}

/**
 * Deletes the song with all its arrangements, scores, PDFs, images, sound files and links. Returns false if
 * there is no such song. Fails if an event uses one of its arrangements.
 */
export async function deleteSong(id: string): Promise<boolean> {
  await requireSongAdmin();
  if (!isId(id)) return false;

  // The rows of the scores, PDFs, images and sound files go with the song, but their files stay in the buckets.
  const [scorePaths, pdfPaths, imagePaths, soundFilePaths] = await Promise.all([
    listScorePaths(id),
    listPdfPaths(id),
    listImagePaths(id),
    listSoundFilePaths(id),
  ]);
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("songs")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) {
    throw databaseError("delete song", error, {
      "23503": () => new ConflictError(({ m }) => m.server.songs.usedByEvent),
    });
  }

  if (data.length === 0) return false;
  await Promise.all([
    removeScoreFiles(scorePaths),
    removePdfFiles(pdfPaths),
    removeImageFiles(imagePaths),
    removeSoundFiles(soundFilePaths),
  ]);
  return true;
}

export function toSongSummary(row: z.infer<typeof songSummaryRowSchema>): SongSummaryDTO {
  return { id: row.id, title: row.title, artist: row.artist };
}

/** The default arrangement first, then by name. `compare` is `i18n.compare` of the request. */
function toSongWithArrangements(
  row: z.infer<typeof songWithArrangementsRowSchema>,
  compare: (a: string, b: string) => number,
): SongWithArrangementsDTO {
  return {
    ...toSongSummary(row),
    songbook: row.songbook,
    arrangements: row.arrangements
      .map(toArrangementSummary)
      .toSorted((a, b) => Number(b.isDefault) - Number(a.isDefault) || compare(a.name, b.name)),
  };
}

/** With the scores, the PDFs, the images, the sound files and the links, by name. */
function toSong(
  row: z.infer<typeof songRowSchema>,
  compare: (a: string, b: string) => number,
): SongDTO {
  return {
    ...toSongWithArrangements(row, compare),
    tags: row.tags,
    copyright: row.copyright,
    authors: row.authors,
    originalTitle: row.original_title,
    translator: row.translator,
    rightsStatus: row.rights_status,
    rightsNote: row.rights_note,
    scores: sortScores(row.song_scores.map(toSongScore), compare),
    pdfs: sortPdfs(row.song_pdfs.map(toSongPdf), compare),
    images: sortImages(row.song_images.map(toSongImage), compare),
    soundFiles: sortSoundFiles(row.song_sound_files.map(toSongSoundFile), compare),
    links: sortLinks(row.song_links.map(toSongLink), compare),
  };
}

// --- Shared song-rights catalog (Churchy, PLAN §11.2) -------------------------

/** The shared facts of a song (`song_rights`): every church's songs feed it (trigger `share_song_rights`). */
export type SharedSongRightsDTO = {
  ccliNumber: string | null;
  authors: string | null;
  originalTitle: string | null;
  translator: string | null;
  songbook: string | null;
  copyright: string | null;
};

const sharedRightsRowSchema = z.object({
  ccli_number: z.string().nullable(),
  authors: z.string().nullable(),
  original_title: z.string().nullable(),
  translator: z.string().nullable(),
  songbook: z.string().nullable(),
  copyright: z.string().nullable(),
});

/**
 * The shared catalog's facts for a song: by the CCLI number in its copyright text, else by its
 * title and authors. Null when the catalog has nothing, or only what the song already says.
 */
export async function findSharedSongRights(
  song: Pick<
    SongDTO,
    "title" | "authors" | "copyright" | "originalTitle" | "translator" | "songbook"
  >,
): Promise<SharedSongRightsDTO | null> {
  await requireUser();
  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("shared_song_rights", {
    p_title: song.title,
    p_authors: song.authors,
    p_copyright: song.copyright,
  });
  if (error) throw databaseError("read shared song rights", error);
  const row = z.array(sharedRightsRowSchema).parse(data)[0];
  if (!row) return null;
  const shared: SharedSongRightsDTO = {
    ccliNumber: row.ccli_number,
    authors: row.authors,
    originalTitle: row.original_title,
    translator: row.translator,
    songbook: row.songbook,
    copyright: row.copyright,
  };
  const adds = (["authors", "originalTitle", "translator", "songbook", "copyright"] as const).some(
    (field) => shared[field] && !song[field],
  );
  return adds ? shared : null;
}
