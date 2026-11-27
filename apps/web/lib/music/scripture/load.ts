import { z } from "zod";

import type { BibleBook } from "./passage";
import type { TranslationSource } from "./translations";

// The text of a book of a translation. A "files" translation: from
// `public/bible/<translation>/<book>.json`, public domain text, so it needs no
// sign-in, and the service worker keeps it for offline use (see `offline.ts`).
// A "database" translation: from `/munkater/biblia-szoveg/<translation>/<book>` (the table
// `scripture_books`), only for the signed-in users.

const bookSchema = z.object({ chapters: z.array(z.array(z.string())) });

// The text of a "database" translation has a licence: after 10 minutes, the
// next call asks the server again, so a permit that ends also ends here.
const DATABASE_BOOK_TTL_MS = 10 * 60 * 1000;

const cache = new Map<string, { promise: Promise<BibleBook>; loadedAt: number }>();

/** Forgets the books of the "database" translations, e.g. after a change of the Bible translations. */
export function forgetDatabaseBooks() {
  for (const key of cache.keys()) if (key.startsWith("database:")) cache.delete(key);
}

/** The server has no text of the book: the translation is not imported (see `scripts/import-bible.mts`). */
export class MissingBibleTextError extends Error {}

/**
 * The book. Throws when the file does not load, e.g. offline, and
 * `MissingBibleTextError` when the server does not have it: a later call
 * tries again. `source`: the source of the translation (see `translations.ts`).
 */
export function loadBibleBook(
  translation: string,
  book: string,
  source: Exclude<TranslationSource, "pasted">,
): Promise<BibleBook> {
  const key = `${source}:${translation}/${book}`;
  const cached = cache.get(key);
  if (cached && (source === "files" || Date.now() - cached.loadedAt < DATABASE_BOOK_TTL_MS))
    return cached.promise;
  const promise = fetchBook(
    source === "database" ? databaseBookPath(translation, book) : bibleBookPath(translation, book),
    book,
    translation,
  );
  const entry = { promise, loadedAt: Date.now() };
  cache.set(key, entry);
  promise.catch(() => {
    if (cache.get(key) === entry) cache.delete(key);
  });
  return promise;
}

export function bibleBookPath(translation: string, book: string): string {
  return `/bible/${encodeURIComponent(translation)}/${encodeURIComponent(book)}.json`;
}

/** The book of a "database" translation (see `app/munkater/biblia-szoveg/`). */
export function databaseBookPath(translation: string, book: string): string {
  return `/munkater/biblia-szoveg/${encodeURIComponent(translation)}/${encodeURIComponent(book)}`;
}

async function fetchBook(path: string, book: string, translation: string): Promise<BibleBook> {
  const response = await fetch(path);
  if (response.status === 404)
    throw new MissingBibleTextError(`No text of ${book} in ${translation}`);
  if (response.status === 409) {
    // The translation is off now, or its text has another source: the page loads the new configuration.
    if (typeof window !== "undefined") window.location.reload();
    throw new Error(`${translation} is not a database translation now`);
  }
  if (!response.ok) throw new Error(`The text of ${book} did not load: ${response.status}`);
  return bookSchema.parse(await response.json());
}
