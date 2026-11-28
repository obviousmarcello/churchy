// SongPraise (https://www.songpraise.com) is a free database of worship
// songs, with the lyrics of each song in sections, without chords. The song
// form can take the lyrics of a song from it (`src/server/songpraise.ts`).
// These helpers are shared by the server and the tests.

import { parseChordProSections } from "./chordpro";
import { foldText, searchKey } from "./search-text";
import { SONG_SONGBOOK_MAX_LENGTH } from "./song-songbook";

/** The id of a SongPraise song or language: a MongoDB id or a UUID. Other values never go into a URL. */
export const SONGPRAISE_ID =
  /^(?:[0-9a-f]{24}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

/** The language of the search when the user did not choose one: most songs of the band are Hungarian. */
export const SONGPRAISE_DEFAULT_LANGUAGE = "5a2d253b8c270b37345af0c3";

/** The songs that one search shows. */
export const SONGPRAISE_SEARCH_LIMIT = 20;

export type SongpraiseLanguageDTO = {
  id: string;
  /** The name in the language itself, e.g. "Magyar". */
  name: string;
  /** The English name, e.g. "Hungarian". */
  englishName: string;
  songCount: number;
};

/** `key`: `searchKey(title)`, when the server keeps it with the titles, so a search does not fold each title again. */
export type SongpraiseTitle = { id: string; title: string; views: number; key?: string };

/** A song in a songbook of SongPraise. `number` has no leading zeros. */
export type SongpraiseBookEntry = { songId: string; book: string; number: string };

/** A song of a search. `songbook`: the books and numbers that the query found, e.g. "Hit hangjai 324". */
export type SongpraiseResultDTO = {
  id: string;
  title: string;
  views: number;
  songbook: string | null;
};

export type SongpraiseSongDTO = {
  id: string;
  title: string;
  /** As SongPraise writes it, e.g. "Szöveg: …; Zene: …". Null without one. */
  author: string | null;
  /** The songbooks of SongPraise with the number of the song, as the songbook field takes them, e.g. "Hit hangjai 12". */
  songbook: string | null;
  chordpro: string;
  /** The labels of the sections in the playing order of SongPraise. Empty: the order of the chart. */
  sectionOrder: string[];
};

/** A section of a SongPraise song. `type`: 0 intro, 1 verse, 2 pre-chorus, 3 chorus, 4 bridge, 5 coda. */
export type SongpraiseVerse = { text: string; chorus: boolean; type?: number | null };

/** The ChordPro environment and the label of each SongPraise section type. */
const SECTION_TYPES: Record<number, { type: string; label: string }> = {
  0: { type: "intro", label: "Intro" },
  1: { type: "verse", label: "Verse" },
  2: { type: "pre_chorus", label: "Pre-Chorus" },
  3: { type: "chorus", label: "Chorus" },
  4: { type: "bridge", label: "Bridge" },
  5: { type: "outro", label: "Coda" },
};

/** "012" is "12". */
export function songbookNumber(number: string): string {
  return number.trim().replace(/^0+(?=\d)/, "");
}

/**
 * The songs of a search, at most `limit`. A query that ends with a number
 * ("324", "Hit hangjai 324", "HH 324") first finds the songs with that number
 * in a songbook; the text before the number must then be in the name of the
 * book, or be its initials. Then come the songs whose titles contain the
 * query (see `searchSongpraiseTitles`). `entries`: the songbooks of the
 * language, or null when the query has no number.
 */
export function searchSongpraise(
  titles: SongpraiseTitle[],
  entries: SongpraiseBookEntry[] | null,
  query: string,
  limit: number,
): SongpraiseResultDTO[] {
  const results: SongpraiseResultDTO[] = [];
  const parts = songbookQuery(query);
  if (parts && entries) {
    const books = new Map<string, string[]>();
    for (const entry of entries) {
      if (entry.number !== parts.number || !matchesBook(entry.book, parts.book)) continue;
      const found = books.get(entry.songId) ?? [];
      found.push(`${entry.book} ${entry.number}`);
      books.set(entry.songId, found);
    }
    const byId = new Map(titles.map((song) => [song.id, song]));
    for (const [id, found] of books) {
      const song = byId.get(id);
      if (song)
        results.push({
          id,
          title: song.title,
          views: song.views,
          songbook: [...new Set(found)].join("; "),
        });
    }
    results.sort((a, b) => b.views - a.views);
  }
  const found = new Set(results.map((song) => song.id));
  for (const song of searchSongpraiseTitles(titles, query, limit)) {
    if (!found.has(song.id))
      results.push({ id: song.id, title: song.title, views: song.views, songbook: null });
  }
  return results.slice(0, limit);
}

/** The number at the end of a query and the text before it, e.g. "Hit hangjai" and "324". Null without a number. */
export function songbookQuery(query: string): { book: string; number: string } | null {
  const match = /^(.*?)[\s.,:#/-]*(\d+)\.?$/u.exec(query.trim());
  return match ? { book: match[1]!, number: songbookNumber(match[2]!) } : null;
}

const ROMAN_NUMERALS: Record<string, string> = {
  i: "1",
  ii: "2",
  iii: "3",
  iv: "4",
  v: "5",
  vi: "6",
  vii: "7",
  viii: "8",
  ix: "9",
  x: "10",
};

/**
 * True when `query` is empty, a part of the name of the book or its initials
 * ("HH" for "Hit hangjai"). The volume of a book can also be a number:
 * "Dicsérem Neved III" is also "Dicsérem Neved 3" and "DN3".
 */
function matchesBook(book: string, query: string): boolean {
  const key = searchKey(query);
  if (!key) return true;
  const words = foldText(book)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  // A Roman numeral after the first word is a volume.
  const arabic = words.map((word, index) => (index > 0 && ROMAN_NUMERALS[word]) || word);
  return [words, arabic].some((names) => {
    const initials = names
      .map((word, index) =>
        /^\p{N}+$/u.test(word) || (index > 0 && ROMAN_NUMERALS[word]) ? word : word[0],
      )
      .join("");
    return hasKey(names.join(""), key) || hasKey(initials, key, true);
  });
}

/**
 * True when `text` contains `key`, or starts with it with `atStart`. A number
 * at the start or the end of the key is a whole number: "dn1" is not in "dn10".
 */
function hasKey(text: string, key: string, atStart = false): boolean {
  const digit = /\p{N}/u;
  for (let index = text.indexOf(key); index >= 0; index = text.indexOf(key, index + 1)) {
    if (atStart && index > 0) return false;
    const joinsBefore = digit.test(key[0]!) && digit.test(text[index - 1] ?? "");
    const joinsAfter =
      digit.test(key[key.length - 1]!) && digit.test(text[index + key.length] ?? "");
    if (!joinsBefore && !joinsAfter) return true;
  }
  return false;
}

/**
 * The songs whose titles contain `query`, at most `limit`. Punctuation,
 * spaces, case and accents do not count. A title that is the query comes
 * first, then the titles that start with it, then the others; in each
 * group, the songs with more views on SongPraise come first.
 */
export function searchSongpraiseTitles(
  titles: SongpraiseTitle[],
  query: string,
  limit: number,
): SongpraiseTitle[] {
  const key = searchKey(query);
  if (!key) return [];
  const matches: { song: SongpraiseTitle; rank: number }[] = [];
  for (const song of titles) {
    const title = song.key ?? searchKey(song.title);
    const index = title.indexOf(key);
    if (index < 0) continue;
    matches.push({ song, rank: title === key ? 0 : index === 0 ? 1 : 2 });
  }
  return matches
    .sort((a, b) => a.rank - b.rank || b.song.views - a.song.views)
    .slice(0, limit)
    .map((match) => match.song);
}

/**
 * The songbook text of the song collections of SongPraise: each book with
 * the number of the song in it, without leading zeros ("Hit hangjai 12"),
 * joined with "; ". Books that do not fit the songbook field are left out.
 * Null without a book.
 */
export function songpraiseSongbook(
  collections: { name: string; number: string | null }[],
): string | null {
  const books: string[] = [];
  for (const collection of collections) {
    const name = collection.name.trim().replace(/\s+/g, " ");
    const number = collection.number ? songbookNumber(collection.number) : "";
    const book = [name, number].filter(Boolean).join(" ");
    if (!book || books.includes(book)) continue;
    if ([...books, book].join("; ").length > SONG_SONGBOOK_MAX_LENGTH) continue;
    books.push(book);
  }
  return books.length > 0 ? books.join("; ") : null;
}

/**
 * The ChordPro chart of the sections of a SongPraise song, and the playing
 * order from its `verseOrderList` (indexes of `verses`). A section with the
 * same type and text as an earlier one is not in the chart again: the order
 * names the first one. Without an order from SongPraise, the order is the
 * order of the sections, so a repeat stays in it. The order is empty when it
 * is the order of the chart. Labels get numbers when a type has more than
 * one section ("Verse 1", "Verse 2"). The lines are lyrics only (see `lyricsLine`).
 */
export function songpraiseToChordPro(
  verses: SongpraiseVerse[],
  verseOrderList: number[] | null | undefined,
): { chordpro: string; sectionOrder: string[] } {
  const sections: { type: string; label: string; lines: string[]; key: string }[] = [];
  // The section of each SongPraise index, or -1 for an empty one.
  const sectionOf: number[] = [];

  for (const verse of verses) {
    const lines = verse.text
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((line) => lyricsLine(line.trimEnd()));
    while (lines.length > 0 && lines[0]!.trim() === "") lines.shift();
    while (lines.length > 0 && lines[lines.length - 1]!.trim() === "") lines.pop();
    if (lines.length === 0) {
      sectionOf.push(-1);
      continue;
    }
    const { type, label } = SECTION_TYPES[verse.type ?? -1] ?? SECTION_TYPES[verse.chorus ? 3 : 1]!;
    const key = `${type}\n${lines.join("\n")}`;
    const earlier = sections.findIndex((section) => section.key === key);
    if (earlier >= 0) {
      sectionOf.push(earlier);
      continue;
    }
    sectionOf.push(sections.length);
    sections.push({ type, label, lines, key });
  }

  const counts = new Map<string, number>();
  for (const section of sections) counts.set(section.label, (counts.get(section.label) ?? 0) + 1);
  const numbers = new Map<string, number>();
  for (const section of sections) {
    if (counts.get(section.label) === 1) continue;
    const number = (numbers.get(section.label) ?? 0) + 1;
    numbers.set(section.label, number);
    section.label = `${section.label} ${number}`;
  }

  const chordpro = sections
    .map((section) =>
      [
        `{start_of_${section.type}: ${section.label}}`,
        ...section.lines,
        `{end_of_${section.type}}`,
      ].join("\n"),
    )
    .join("\n\n");

  const order = (
    verseOrderList?.length ? verseOrderList.map((index) => sectionOf[index] ?? -1) : sectionOf
  ).filter((index) => index >= 0);
  // The order of the chart needs no playing order.
  const chartOrder =
    order.length === sections.length && order.every((section, index) => section === index);
  return { chordpro, sectionOrder: chartOrder ? [] : order.map((index) => sections[index]!.label) };
}

/**
 * A line of SongPraise lyrics as a ChordPro lyrics line. SongPraise has no
 * chords, so brackets and braces become parentheses: "[2x]" is not a chord and
 * "{…}" is not a directive. A "#" at the start would make the line a comment,
 * so it becomes the full-width "＃".
 */
function lyricsLine(line: string): string {
  return line
    .replace(/[[{]/g, "(")
    .replace(/[\]}]/g, ")")
    .replace(/^(\s*)#/, "$1＃");
}

/**
 * The playing order of SongPraise for its chart after the user edited the
 * chart. When the chart does not have a label of the order any more, e.g.
 * after the user renamed or removed a section, the order is empty: the order
 * of the chart.
 */
export function songpraiseOrder(chordpro: string, sectionOrder: string[]): string[] {
  const labels = new Set(
    parseChordProSections(chordpro).map((section) => section.label.toLowerCase()),
  );
  return sectionOrder.every((label) => labels.has(label.toLowerCase())) ? sectionOrder : [];
}

/**
 * The chart and the playing order when the chart `added` goes after the chart
 * `current`. A label of `added` that `current` has already gets the next free
 * number ("Verse 1" is "Verse 3" after "Verse 1" and "Verse 2"), and the order
 * of `current` goes on with the order of `added`. An empty order is the order
 * of the chart.
 */
export function appendChart(
  current: { chordpro: string; sectionOrder: string[] },
  added: { chordpro: string; sectionOrder: string[] },
): { chordpro: string; sectionOrder: string[] } {
  const currentLabels = parseChordProSections(current.chordpro).map((section) => section.label);
  const addedLabels = parseChordProSections(added.chordpro).map((section) => section.label);
  const taken = new Set([...currentLabels, ...addedLabels].map((label) => label.toLowerCase()));
  const currentKeys = new Set(currentLabels.map((label) => label.toLowerCase()));
  // The new label of each label of `added` that `current` has, by its lower case.
  const renames = new Map<string, string>();
  for (const label of addedLabels) {
    const key = label.toLowerCase();
    if (!currentKeys.has(key) || renames.has(key)) continue;
    const base = label.replace(/\s+\d+$/, "");
    let number = 2;
    while (taken.has(`${base} ${number}`.toLowerCase())) number++;
    renames.set(key, `${base} ${number}`);
    taken.add(`${base} ${number}`.toLowerCase());
  }
  const rename = (label: string) => renames.get(label.toLowerCase()) ?? label;

  const chart = added.chordpro
    .split(/\r?\n/)
    .map((line) => {
      const [section] = parseChordProSections(line);
      return section && renames.has(section.label.toLowerCase())
        ? `{start_of_${section.type}: ${rename(section.label)}}`
        : line;
    })
    .join("\n");

  const sectionOrder =
    current.sectionOrder.length === 0 && added.sectionOrder.length === 0
      ? []
      : [
          ...(current.sectionOrder.length > 0 ? current.sectionOrder : currentLabels),
          ...(added.sectionOrder.length > 0 ? added.sectionOrder : addedLabels).map(rename),
        ];
  return {
    chordpro: current.chordpro.trim() === "" ? chart : `${current.chordpro.trimEnd()}\n\n${chart}`,
    sectionOrder,
  };
}
