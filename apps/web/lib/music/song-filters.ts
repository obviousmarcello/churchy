// The filters of the songs page live in the URL, e.g.
// `/munkater/enektar?q=grace&key=G&minBpm=60&maxBpm=90&time=3/4&tag=Christmas&sort=recent&page=2`, so a filtered
// list can be shared and the back button works.

import { SONG_TAG_MAX_LENGTH } from "./song-tags";

export const SONGS_PAGE_SIZE = 25;

export const SONG_FILTER_PARAMS = {
  query: "q",
  key: "key",
  timeSignature: "time",
  bpmMin: "minBpm",
  bpmMax: "maxBpm",
  tag: "tag",
} as const;

export const PAGE_PARAM = "page";

/** The order of the list. It is not a filter: "Clear filters" keeps it. */
export const SORT_PARAM = "sort";

/**
 * - "title": title matches first, then by title.
 * - "recent": the songs played most recently first.
 * - "oldest": the songs played longest ago first.
 * Songs that were never played go last in both play sorts.
 */
export const SONG_SORTS = ["title", "recent", "oldest"] as const;

export type SongSort = (typeof SONG_SORTS)[number];

export const DEFAULT_SONG_SORT: SongSort = "title";

export const BPM_MIN = 1;
export const BPM_MAX = 400;

export type SongFilters = {
  /** Part of the title, the artist, a tag or the songbook, or words that start a word in the lyrics of an arrangement. */
  query?: string;
  key?: string;
  timeSignature?: string;
  bpmMin?: number;
  bpmMax?: number;
  /** Songs with this tag, in any case. */
  tag?: string;
};

type SearchParams = Record<string, string | string[] | undefined>;

/** Unknown or invalid values give no filter, never an error. */
export function parseSongFilters(params: SearchParams): SongFilters {
  return {
    query: textParam(params[SONG_FILTER_PARAMS.query], 100),
    key: textParam(params[SONG_FILTER_PARAMS.key], 20),
    timeSignature: textParam(params[SONG_FILTER_PARAMS.timeSignature], 10),
    bpmMin: bpmParam(params[SONG_FILTER_PARAMS.bpmMin]),
    bpmMax: bpmParam(params[SONG_FILTER_PARAMS.bpmMax]),
    tag: textParam(params[SONG_FILTER_PARAMS.tag], SONG_TAG_MAX_LENGTH),
  };
}

/** The page number, from 1. */
export function parsePage(params: SearchParams): number {
  const value = Number(firstParam(params[PAGE_PARAM]));
  return Number.isSafeInteger(value) && value >= 1 ? value : 1;
}

/** An unknown value gives the default sort. */
export function parseSongSort(params: SearchParams): SongSort {
  const value = firstParam(params[SORT_PARAM]);
  return SONG_SORTS.find((sort) => sort === value) ?? DEFAULT_SONG_SORT;
}

export function hasSongFilters(filters: SongFilters): boolean {
  return Object.values(filters).some((value) => value !== undefined);
}

export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function textParam(value: string | string[] | undefined, max: number): string | undefined {
  const text = firstParam(value)?.trim();
  return text && text.length <= max ? text : undefined;
}

function bpmParam(value: string | string[] | undefined): number | undefined {
  const text = firstParam(value)?.trim();
  if (!text || !/^\d{1,3}$/.test(text)) return undefined;
  const bpm = Number(text);
  return bpm >= BPM_MIN && bpm <= BPM_MAX ? bpm : undefined;
}
