import { foldText } from "@/lib/music/search-text";

import { BOOKS } from "./books";
import { bookName } from "./book-names";
import type { BibleBook } from "./passage";

// The search of the Bible panel of the controller: the books by a part of
// their name, and the verses by their words. Both ignore the case and the
// accents as the song search does: "janos" finds "János", "vilagot" finds "világot".

/** The text in lower case, without accents, e.g. "á" → "a" and "ß" → "ss". Each character of `text` in NFC on its own. */
export function normalizeSearchText(text: string): string {
  return Array.from(text.normalize("NFC"), foldText).join("");
}

/** A book name as a search key: without spaces and dots, e.g. "1kor". */
function nameKey(name: string): string {
  return normalizeSearchText(name).replace(/[\s.]/g, "");
}

const BOOK_KEYS = new Map(
  BOOKS.map(([id, names]) => [
    id,
    [...new Set([...names.split(" "), bookName(id, "hu"), bookName(id, "en")].map(nameKey))],
  ]),
);

/**
 * The books of `ids` whose name or abbreviation starts with the query, in
 * the order of `ids`, e.g. "1 kor" or "kor" for 1 and 2 Corinthians. All of
 * them for an empty query.
 */
export function matchBooks(query: string, ids: string[]): string[] {
  const key = nameKey(query);
  if (!key) return ids;
  return ids.filter((id) =>
    (BOOK_KEYS.get(id) ?? []).some(
      (name) => name.startsWith(key) || name.replace(/^\d/, "").startsWith(key),
    ),
  );
}

/** The words of a query for the text, normalized. */
export function searchWords(query: string): string[] {
  return normalizeSearchText(query)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== "");
}

export type SearchVerse = { book: string; chapter: number; verse: number; text: string };

/** The verses of the books with their normalized text, for `searchVerses`. Each verse once. */
export type SearchIndex = (SearchVerse & { normalized: string })[];

/** The verses of the books in their order. `books`: the OSIS id and the text of each book. */
export function buildSearchIndex(books: { id: string; book: BibleBook }[]): SearchIndex {
  return books.flatMap(({ id, book }) =>
    book.chapters.flatMap((verses, chapterIndex) =>
      verses.flatMap((text, verseIndex) =>
        text
          ? [
              {
                book: id,
                chapter: chapterIndex + 1,
                verse: verseIndex + 1,
                text,
                normalized: normalizeSearchText(text),
              },
            ]
          : [],
      ),
    ),
  );
}

/**
 * The verses with all words of the query, at most `limit`: first the verses
 * with the words together as in the query, then the others, each in the
 * order of the Bible. `total`: the number of all verses with the words.
 */
export function searchVerses(
  index: SearchIndex,
  query: string,
  limit: number,
): { verses: SearchVerse[]; total: number } {
  const words = searchWords(query);
  if (words.length === 0) return { verses: [], total: 0 };
  const phrase = words.join(" ");
  const together: SearchVerse[] = [];
  const apart: SearchVerse[] = [];
  for (const { normalized, ...verse } of index) {
    if (!words.every((word) => normalized.includes(word))) continue;
    const list =
      words.length > 1 && normalized.replace(/[^\p{L}\p{N}]+/gu, " ").includes(phrase)
        ? together
        : apart;
    list.push(verse);
  }
  return { verses: [...together, ...apart].slice(0, limit), total: together.length + apart.length };
}

/** The text in parts, with `match` for the parts that are words of the query: to mark them. */
export function searchSegments(text: string, query: string): { text: string; match: boolean }[] {
  const characters = Array.from(text.normalize("NFC"));
  const parts = characters.map(foldText);
  const normalized = parts.join("");
  // The character of each UTF-16 unit of `normalized`: a part can be longer or shorter than its character.
  const characterAt = parts.flatMap((part, index) => new Array<number>(part.length).fill(index));
  const marked = new Array<boolean>(characters.length).fill(false);
  for (const word of searchWords(query)) {
    for (
      let start = normalized.indexOf(word);
      start !== -1;
      start = normalized.indexOf(word, start + word.length)
    ) {
      marked.fill(true, characterAt[start]!, characterAt[start + word.length - 1]! + 1);
    }
  }
  const segments: { text: string; match: boolean }[] = [];
  characters.forEach((character, index) => {
    const last = segments.at(-1);
    if (last && last.match === marked[index]) last.text += character;
    else segments.push({ text: character, match: marked[index]! });
  });
  return segments;
}
