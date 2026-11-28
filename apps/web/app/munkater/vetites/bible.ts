"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { z } from "zod";

import { useScriptureTranslations } from "@/components/music/app-config";
import { createStoredString } from "@/lib/music/browser";
import {
  bibleBookItem,
  bibleItemKey,
  isBibleItemKey,
  type ProjectionItem,
} from "@/lib/music/projection/slides";
import type { ProjectionLook } from "@/lib/music/projection/themes";
import { BOOK_IDS, DEUTEROCANONICAL_BOOKS } from "@/lib/music/scripture/books";
import { loadBibleBook, MissingBibleTextError } from "@/lib/music/scripture/load";
import type { BibleBook } from "@/lib/music/scripture/passage";
import { buildSearchIndex, type SearchIndex } from "@/lib/music/scripture/search";
import {
  defaultTranslationFor,
  DEFAULT_TRANSLATION,
  fullTextTranslations,
  scriptureTranslation,
  type ScriptureTranslation,
} from "@/lib/music/scripture/translations";

// The Bible panel of the controller: any passage on the screens at once,
// without an item in the setlist. The panel shows a book of a translation:
// its chapters, then the verses of a chapter. Each book is an item of its own
// (see `bibleBookItem`), so "Next" goes on with the next verse of the book.
// The controller also has the book of a live verse after the panel moved to
// another book, or of a verse that another controller showed.
//
// Only the translations with their full text that are on (see
// `fullTextTranslations`): without one, the controller has no panel.

/** The place of the panel. `book` null: the list of the books. `chapter` null: the chapters of the book. */
export type BiblePlace = { translation: string; book: string | null; chapter: number | null };

const storedPlace = createStoredString("projection-bible-place");

const placeSchema = z.object({
  translation: z.string(),
  book: z.string().nullable(),
  chapter: z.number().int().positive().nullable(),
});

function parsePlace(
  json: string | null | undefined,
  locale: string,
  translations: ScriptureTranslation[],
): BiblePlace {
  const fallback = {
    translation: defaultTranslationFor(locale, translations) ?? DEFAULT_TRANSLATION,
    book: null,
    chapter: null,
  };
  if (!json) return fallback;
  try {
    const result = placeSchema.safeParse(JSON.parse(json));
    if (!result.success) return fallback;
    const { translation, book, chapter } = result.data;
    // A translation that the app does not have anymore, that is off or that has no full text (see `translations.ts`), or an unknown book: from the start.
    if (!translations.some(({ id }) => id === translation)) return fallback;
    if (book !== null && !BOOK_IDS.includes(book))
      return { translation, book: null, chapter: null };
    return { translation, book, chapter: book === null ? null : chapter };
  } catch {
    return fallback;
  }
}

/** The translation and the book of a key of `bibleItemKey`, or null for another key or an unknown book. */
function parseBibleItemKey(
  key: string | null,
  translations: ScriptureTranslation[],
): { translation: ScriptureTranslation; book: string } | null {
  if (!key || !isBibleItemKey(key)) return null;
  const [id, book = ""] = key.slice("bible:".length).split("/");
  const translation = translations.find((candidate) => candidate.id === id);
  if (!translation || !BOOK_IDS.includes(book)) return null;
  return { translation, book };
}

/** The text of the book in a translation with its full text. */
export function loadFullBook(translation: ScriptureTranslation, book: string): Promise<BibleBook> {
  return loadBibleBook(
    translation.id,
    book,
    translation.source === "database" ? "database" : "files",
  );
}

/** A book that loaded, or why not. */
type BookResult = BibleBook | "failed" | "notInstalled";

// One item for each text and look (`loadBibleBook` keeps the text of each
// book): the load of another book does not make the items again.
const bookItems = new WeakMap<BibleBook, WeakMap<ProjectionLook, ProjectionItem>>();

function bookItem(
  translation: ScriptureTranslation,
  book: string,
  text: BibleBook,
  look: ProjectionLook,
): ProjectionItem {
  let byLook = bookItems.get(text);
  if (!byLook) bookItems.set(text, (byLook = new WeakMap()));
  let item = byLook.get(look);
  if (!item) byLook.set(look, (item = bibleBookItem(translation, book, text, look)));
  return item;
}

export type BibleBookStatus = "loading" | "failed" | "notInstalled" | "unavailable" | "ready";

/**
 * The Bible panel. `look`: the look of the slides (the theme of the event).
 * `liveKey`: the item key of the screens, for the book of a live verse.
 */
export function useBible(locale: string, look: ProjectionLook, liveKey: string | null) {
  const enabled = useScriptureTranslations();
  const translations = useMemo(() => fullTextTranslations(enabled), [enabled]);
  const place = parsePlace(storedPlace.useValue(), locale, translations);
  const translation =
    translations.find(({ id }) => id === place.translation) ??
    scriptureTranslation(place.translation);
  const [books, setBooks] = useState<ReadonlyMap<string, BookResult>>(new Map());
  const [attempt, setAttempt] = useState(0);

  const live = parseBibleItemKey(liveKey, translations);
  // A Protestant translation does not have e.g. Sirach.
  const inTranslation = (book: string) =>
    translation.deuterocanon || !DEUTEROCANONICAL_BOOKS.has(book);
  const openKey =
    place.book && inTranslation(place.book) ? bibleItemKey(translation.id, place.book) : null;
  const liveBookKey = live ? bibleItemKey(live.translation.id, live.book) : null;
  const bookKeys = [...new Set([openKey, liveBookKey].filter((key) => key !== null))].join(" ");

  // `loadBibleBook` keeps each book, so a book that loaded comes at once.
  useEffect(() => {
    let active = true;
    for (const key of bookKeys ? bookKeys.split(" ") : []) {
      const target = parseBibleItemKey(key, translations);
      if (!target) continue;
      loadFullBook(target.translation, target.book).then(
        (result) => active && setBooks((current) => new Map(current).set(key, result)),
        (error) =>
          active &&
          setBooks((current) =>
            new Map(current).set(
              key,
              error instanceof MissingBibleTextError ? "notInstalled" : "failed",
            ),
          ),
      );
    }
    return () => {
      active = false;
    };
    // `translations` changes only with the settings.
  }, [bookKeys, attempt, translations]);

  const items = useMemo(() => {
    const result = new Map<string, ProjectionItem>();
    for (const key of bookKeys ? bookKeys.split(" ") : []) {
      const text = books.get(key);
      const target = parseBibleItemKey(key, translations);
      if (target && text && typeof text !== "string")
        result.set(key, bookItem(target.translation, target.book, text, look));
    }
    return result;
  }, [bookKeys, books, look, translations]);

  const openResult = openKey ? books.get(openKey) : undefined;
  const status: BibleBookStatus =
    place.book === null
      ? "ready"
      : !openKey
        ? "unavailable"
        : openResult === undefined
          ? "loading"
          : typeof openResult === "string"
            ? openResult
            : "ready";

  const setPlace = useCallback((next: BiblePlace) => storedPlace.set(JSON.stringify(next)), []);
  const follow = useCallback(
    (itemKey: string, chapter: number) => {
      const target = parseBibleItemKey(itemKey, translations);
      if (target) setPlace({ translation: target.translation.id, book: target.book, chapter });
    },
    [setPlace, translations],
  );

  return {
    /** A translation with its full text is on: the controller shows the panel. */
    available: translations.length > 0,
    place,
    setPlace,
    /** Opens the chapter of a verse of a book item (see `bibleItemKey`), e.g. of the live verse. */
    follow,
    translation,
    /** The text of the open book, when it loaded. */
    openBook: openResult && typeof openResult !== "string" ? openResult : null,
    openItem: openKey ? (items.get(openKey) ?? null) : null,
    status,
    /** The items of the open book and of the book of the live verse: the controller finds the live verse in them. */
    items: [...items.values()],
    /** The item and the text of the book in the translation of the panel. Throws when it does not load. */
    async loadItem(book: string): Promise<{ item: ProjectionItem; text: BibleBook }> {
      const text = await loadFullBook(translation, book);
      return { item: bookItem(translation, book, text, look), text };
    },
    /** Loads the books that did not load again. */
    retry() {
      setBooks(
        (current) => new Map([...current].filter(([, result]) => typeof result !== "string")),
      );
      setAttempt((value) => value + 1);
    },
  };
}

export type Bible = ReturnType<typeof useBible>;

export type BibleSearchStatus =
  | { status: "idle" }
  | { status: "loading"; loaded: number; total: number }
  | { status: "failed" }
  | { status: "notInstalled" }
  | { status: "ready"; index: SearchIndex };

const IDLE: BibleSearchStatus = { status: "idle" };

// The search index of each translation, or its loading: for all panels of the
// page, also a panel that opens again during the loading.
const searches = new Map<string, BibleSearchStatus>();
const searchListeners = new Set<() => void>();

function setSearch(translation: string, status: BibleSearchStatus) {
  searches.set(translation, status);
  for (const listener of searchListeners) listener();
}

function subscribeToSearches(listener: () => void) {
  searchListeners.add(listener);
  return () => {
    searchListeners.delete(listener);
  };
}

/**
 * The search in the text of a translation. The first search loads all books
 * of the translation (`start`); then each search is at once.
 */
export function useBibleSearch(translation: ScriptureTranslation) {
  const id = translation.id;
  const status = useSyncExternalStore(
    subscribeToSearches,
    () => searches.get(id) ?? IDLE,
    () => IDLE,
  );

  function start() {
    const current = searches.get(id) ?? IDLE;
    if (current.status === "loading" || current.status === "ready") return;
    const books = BOOK_IDS.filter(
      (book) => translation.deuterocanon || !DEUTEROCANONICAL_BOOKS.has(book),
    );
    let loaded = 0;
    setSearch(id, { status: "loading", loaded, total: books.length });
    Promise.all(
      books.map((book) =>
        loadFullBook(translation, book).then(
          (text) => {
            setSearch(id, { status: "loading", loaded: ++loaded, total: books.length });
            return { id: book, book: text };
          },
          // A translation can miss a book: the others are searched.
          (error) => {
            if (error instanceof MissingBibleTextError) return null;
            throw error;
          },
        ),
      ),
    )
      .then((texts) => {
        const found = texts.filter((text) => text !== null);
        if (found.length === 0) throw new MissingBibleTextError(`No text of ${id}`);
        return buildSearchIndex(found);
      })
      .then(
        (index) => setSearch(id, { status: "ready", index }),
        // The next search tries again.
        (error) =>
          setSearch(id, {
            status: error instanceof MissingBibleTextError ? "notInstalled" : "failed",
          }),
      );
  }

  return { status, start };
}
