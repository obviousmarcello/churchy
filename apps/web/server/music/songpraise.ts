import "server-only";

import { cacheLife } from "next/cache";
import { z } from "zod";

import {
  SONGPRAISE_ID,
  SONGPRAISE_SEARCH_LIMIT,
  searchSongpraise as searchSongs,
  songbookNumber,
  songbookQuery,
  songpraiseSongbook,
  songpraiseToChordPro,
  type SongpraiseBookEntry,
  type SongpraiseLanguageDTO,
  type SongpraiseResultDTO,
  type SongpraiseSongDTO,
  type SongpraiseTitle,
} from "@/lib/music/songpraise";
import { searchKey } from "@/lib/music/search-text";
import { requireSongAdmin } from "./auth";

// The lyrics of SongPraise for the song form. The server reads the public
// API of the website (the one its own pages use), so the browser of the user
// never connects to it. The requests contain no data about the members: the
// search runs here, on the titles of a language.

const API = "https://www.songpraise.com/api";
const FETCH_TIMEOUT_MS = 15_000;

const languagesSchema = z.array(
  z.object({ uuid: z.string(), englishName: z.string(), nativeName: z.string(), size: z.number() }),
);

const titlesSchema = z.array(
  z.object({
    id: z.string(),
    title: z.string(),
    deleted: z.boolean().optional(),
    views: z.number().optional(),
  }),
);

const songSchema = z.object({
  uuid: z.string(),
  title: z.string(),
  author: z.string().nullish(),
  deleted: z.boolean().optional(),
  songVerseDTOS: z.array(
    z.object({ text: z.string(), chorus: z.boolean(), type: z.number().nullish() }),
  ),
  verseOrderList: z.array(z.number().int()).nullish(),
});

const collectionsSchema = z.array(
  z.object({
    name: z.string(),
    languageUuid: z.string().nullish(),
    songCollectionElements: z
      .array(z.object({ ordinalNumber: z.string().nullish(), songUuid: z.string().nullish() }))
      .nullish(),
  }),
);

/** The JSON of an API path. Null for an empty response: SongPraise sends one for an unknown song. */
async function getJson(path: string): Promise<unknown> {
  const response = await fetch(`${API}/${path}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`[songpraise] ${path} failed: ${response.status}`);
  const text = await response.text();
  return text.trim() ? JSON.parse(text) : null;
}

/** The languages of SongPraise with songs, the largest first. */
async function readLanguages(): Promise<SongpraiseLanguageDTO[]> {
  "use cache";
  cacheLife("days");
  return languagesSchema
    .parse(await getJson("languages"))
    .filter((language) => SONGPRAISE_ID.test(language.uuid) && language.size > 0)
    .map((language) => ({
      id: language.uuid,
      name: language.nativeName,
      englishName: language.englishName,
      songCount: language.size,
    }))
    .sort((a, b) => b.songCount - a.songCount);
}

/** The titles of the songs of a language with their search keys: about 1 MB from SongPraise, so the server keeps them. */
async function readTitles(languageId: string): Promise<SongpraiseTitle[]> {
  "use cache";
  cacheLife("hours");
  return titlesSchema
    .parse(await getJson(`songTitlesAfterModifiedDate/0/language/${languageId}`))
    .filter((song) => !song.deleted && SONGPRAISE_ID.test(song.id))
    .map((song) => ({
      id: song.id,
      title: song.title,
      views: song.views ?? 0,
      key: searchKey(song.title),
    }));
}

/**
 * The songs in the songbooks of SongPraise, by the id of the language.
 * SongPraise sends the songbooks of all languages together (about 700 kB,
 * slowly), so the server keeps them once for all languages.
 */
async function readBookEntries(): Promise<Record<string, SongpraiseBookEntry[]>> {
  "use cache";
  cacheLife("hours");
  const entries: Record<string, SongpraiseBookEntry[]> = {};
  for (const collection of collectionsSchema.parse(await getJson("songCollections"))) {
    const book = collection.name.trim().replace(/\s+/g, " ");
    const languageId = collection.languageUuid;
    // Only ids are keys, never e.g. "__proto__".
    if (!languageId || !SONGPRAISE_ID.test(languageId) || !book) continue;
    const language = (entries[languageId] ??= []);
    for (const element of collection.songCollectionElements ?? []) {
      const number = element.ordinalNumber ? songbookNumber(element.ordinalNumber) : "";
      if (element.songUuid && number) language.push({ songId: element.songUuid, book, number });
    }
  }
  return entries;
}

export async function listSongpraiseLanguages(): Promise<SongpraiseLanguageDTO[]> {
  await requireSongAdmin();
  return readLanguages();
}

/**
 * The songs of the language for `query`, the best first: by a songbook number
 * ("324", "Hit hangjai 324"), then by the title. Without a number in the
 * query, the songbooks do not load.
 */
export async function searchSongpraise(
  languageId: string,
  query: string,
): Promise<SongpraiseResultDTO[]> {
  await requireSongAdmin();
  if (!SONGPRAISE_ID.test(languageId)) return [];
  const [titles, entries] = await Promise.all([
    readTitles(languageId),
    songbookQuery(query) ? readBookEntries().then((entries) => entries[languageId] ?? []) : null,
  ]);
  return searchSongs(titles, entries, query, SONGPRAISE_SEARCH_LIMIT);
}

/** The lyrics of a song as a ChordPro chart. Null when SongPraise has no such song. */
export async function readSongpraiseSong(id: string): Promise<SongpraiseSongDTO | null> {
  await requireSongAdmin();
  if (!SONGPRAISE_ID.test(id)) return null;
  const [json, songbook] = await Promise.all([getJson(`song/${id}`), readSongbook(id)]);
  if (json === null) return null;
  // Only the fields that the form uses: the song has more, e.g. the emails of its editors.
  const song = songSchema.parse(json);
  if (song.deleted) return null;
  return {
    id: song.uuid,
    title: song.title.trim(),
    author: song.author?.trim() || null,
    songbook,
    ...songpraiseToChordPro(song.songVerseDTOS, song.verseOrderList),
  };
}

/** The songbooks of a song on SongPraise ("Hit hangjai 12"). Null without one, or when they did not load: the lyrics still come. */
async function readSongbook(id: string): Promise<string | null> {
  try {
    const collections = collectionsSchema.parse(
      (await getJson(`songCollections/song/${id}`)) ?? [],
    );
    return songpraiseSongbook(
      collections.map((collection) => ({
        name: collection.name,
        number:
          collection.songCollectionElements?.find((element) => element.songUuid === id)
            ?.ordinalNumber ?? null,
      })),
    );
  } catch (error) {
    console.warn("[songpraise] Failed to read the songbooks:", error);
    return null;
  }
}
