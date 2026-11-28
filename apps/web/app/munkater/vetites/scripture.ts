"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useScriptureTranslations } from "@/components/music/app-config";
import type { ProjectionPassage, ProjectionSource } from "@/lib/music/projection/slides";
import { bookAbbreviation, DEUTEROCANONICAL_BOOKS } from "@/lib/music/scripture/books";
import { loadBibleBook, MissingBibleTextError } from "@/lib/music/scripture/load";
import {
  lastPlace,
  nextPassagePart,
  partVerses,
  type PassagePart,
} from "@/lib/music/scripture/more";
import { resolvePassage, type BibleBook } from "@/lib/music/scripture/passage";
import {
  parseScriptureReference,
  referenceStyle,
  type ScriptureReference,
} from "@/lib/music/scripture/reference";
import {
  resolveTranslation,
  scriptureTranslation,
  type ScriptureTranslation,
} from "@/lib/music/scripture/translations";
import { cachedVersesAction } from "./actions-client";

// The text of the scripture readings of a projection. The controller loads
// the books of the references in the translation of each reading: the saved
// one, or the one that the user selected on the controller. "Load more" adds
// the rest of the chapter or the next chapter after the last verse (see
// `more.ts`), only on this controller.
//
// A "pasted" translation (see `translations.ts`) loads only the chapters of
// the reference from the shared cache. The verses that loaded stay on this
// page, also when they go out of the cache later. The verses that the user
// pasted on this page win over those of the cache. "Load more" is off for it.
//
// A reading in a translation that is off (the Bible translations tab of Configuration) uses the first
// translation that is on in its language, else the first one that is on.
// When all are off, it shows only its title.

export type ScriptureStatus =
  /** The title is not a reference that the app can read: only the title slide. */
  | { status: "unrecognized" }
  /** All translations are off (the Bible translations tab of Configuration): only the title slide. */
  | { status: "off" }
  | { status: "loading" }
  /** The book did not load, e.g. offline. */
  | { status: "failed" }
  /** The server does not have the text of the translation: it is not imported. */
  | { status: "notInstalled" }
  /** The translation does not have the book or the verses. */
  | { status: "unavailable" }
  /** The shared cache of a "pasted" translation does not have all verses of the reference: a user pastes them. */
  | { status: "needsText" }
  /** `missing`: the translation does not have some of the verses. `truncated`: the reference is too long, the slides show only its first verses. */
  | { status: "ready"; missing: boolean; truncated: boolean };

/** `translation`: the one that the reading uses; for "off", its saved one. */
export type ScriptureReading = { translation: ScriptureTranslation; status: ScriptureStatus };

/** The "Load more" button of a reading. `label`: what it loads, e.g. "Jn 3,22–36" or "ApCsel 1". */
export type MoreVerses =
  { status: "ready"; label: string } | { status: "loading" } | { status: "failed" };

/** A book that loaded, or why not. For a "pasted" translation: the verses of the cache, the others empty. */
type BookResult = BibleBook | "failed" | "notInstalled";

type CachedVerse = { chapter: number; verse: number; text: string; chapterEnd?: boolean };

/**
 * The verses of the cache as a book, e.g. `chapters[2]` with only the verses
 * 16 to 21 of chapter 3. A chapter without verses is a hole. A chapter whose
 * highest verse is not marked as its end gets an empty verse after it, so a
 * reading to the end of the chapter (e.g. "Jn 3") needs its text.
 */
function cachedBook(verses: CachedVerse[]): BibleBook {
  const chapters: string[][] = [];
  const ends = new Set<string>();
  for (const { chapter, verse, text, chapterEnd } of verses) {
    (chapters[chapter - 1] ??= [])[verse - 1] = text;
    if (chapterEnd) ends.add(`${chapter}:${verse}`);
  }
  return {
    chapters: chapters.map((texts, index) => {
      const full = Array.from(texts, (text) => text ?? "");
      return ends.has(`${index + 1}:${texts.length}`) ? full : [...full, ""];
    }),
  };
}

/** The verses of both books: a verse of `next` replaces the verse of `current`. */
function mergeBooks(current: BookResult | undefined, next: BibleBook): BibleBook {
  if (current === undefined || typeof current === "string") return next;
  const chapters = [...current.chapters];
  next.chapters.forEach((texts, index) => {
    const merged = [...(chapters[index] ?? [])];
    texts.forEach((text, verse) => text && (merged[verse] = text));
    chapters[index] = Array.from(merged, (text) => text ?? "");
  });
  return { chapters };
}

async function loadCachedBook(
  translation: string,
  book: string,
  chapters: number[],
): Promise<BibleBook> {
  const verses = await cachedVersesAction(translation, book, chapters);
  if (!verses) throw new Error(`The cached verses of ${book} did not load`);
  return cachedBook(verses);
}

/**
 * The text of each scripture reading in `sources`, by the key of the item.
 * `translations`: the translations that the user selected, by the key of
 * the item. The others use their saved translation.
 */
export function useScripturePassages(
  sources: ProjectionSource[],
  translations: ReadonlyMap<string, string>,
) {
  const enabled = useScriptureTranslations();
  const [books, setBooks] = useState<ReadonlyMap<string, BookResult>>(new Map());
  const [attempt, setAttempt] = useState(0);
  // The parts that "Load more" added, by item key.
  const [extensions, setExtensions] = useState<ReadonlyMap<string, PassagePart[]>>(new Map());
  // The verses that the user pasted on this page, by "translation/book", e.g. "ruf2014/John".
  const [pasted, setPasted] = useState<ReadonlyMap<string, BibleBook>>(new Map());
  // The attempt of each load from the cache: a change of the other readings does not load it again.
  const cacheLoads = useRef(new Map<string, number>());

  const requests = useMemo(
    () =>
      sources.flatMap((source) => {
        if (source.kind !== "text" || !source.scripture) return [];
        const id = translations.get(source.key) ?? source.translation;
        const resolved = resolveTranslation(id, enabled);
        const translation = resolved ?? scriptureTranslation(id);
        const reference = parseScriptureReference(source.title);
        // A Protestant translation does not have e.g. Sirach: no request for it.
        const inTranslation =
          resolved !== null &&
          reference !== null &&
          (translation.deuterocanon || !DEUTEROCANONICAL_BOOKS.has(reference.book));
        const pasted = translation.source === "pasted";
        // For a pasted translation, the key has the chapters of the reference, e.g. "ruf2014/John/3,4".
        const chapters = reference && pasted ? chaptersOf(reference.ranges) : null;
        const bookKey =
          reference && inTranslation
            ? `${translation.id}/${reference.book}${chapters ? `/${chapters}` : ""}`
            : null;
        const parts = bookKey && !pasted ? (extensions.get(source.key) ?? []) : [];
        const partKeys = parts.map((part) => `${translation.id}/${part.book}`);
        return [
          {
            key: source.key,
            translation,
            off: resolved === null,
            reference,
            style: referenceStyle(source.title),
            bookKey,
            parts,
            partKeys,
          },
        ];
      }),
    [sources, translations, extensions, enabled],
  );
  const bookKeys = [
    ...new Set(
      requests.flatMap(({ bookKey, partKeys }) => (bookKey ? [bookKey, ...partKeys] : [])),
    ),
  ].join(" ");

  // `loadBibleBook` keeps each book, so a book that loaded comes at once.
  // A load from the cache starts once in each attempt, and its result comes
  // also after a change of `bookKeys`.
  useEffect(() => {
    let active = true;
    for (const bookKey of bookKeys ? bookKeys.split(" ") : []) {
      const [translation = "", book = "", chapters] = bookKey.split("/");
      if (chapters !== undefined) {
        if (cacheLoads.current.get(bookKey) === attempt) continue;
        cacheLoads.current.set(bookKey, attempt);
      }
      const keep = () => active || chapters !== undefined;
      // Only "files" and "database" translations come here without chapters.
      const source =
        enabled.find(({ id }) => id === translation)?.source === "database" ? "database" : "files";
      const load =
        chapters === undefined
          ? loadBibleBook(translation, book, source)
          : loadCachedBook(translation, book, chapters.split(",").map(Number));
      load.then(
        (result) =>
          keep() &&
          setBooks((current) =>
            new Map(current).set(
              bookKey,
              chapters === undefined ? result : mergeBooks(current.get(bookKey), result),
            ),
          ),
        (error) =>
          keep() &&
          setBooks((current) => {
            // The verses of the cache that loaded before stay.
            if (chapters !== undefined && typeof current.get(bookKey) === "object") return current;
            return new Map(current).set(
              bookKey,
              error instanceof MissingBibleTextError ? "notInstalled" : "failed",
            );
          }),
      );
    }
    return () => {
      active = false;
    };
  }, [bookKeys, attempt, enabled]);

  return useMemo(() => {
    const readings = new Map<string, ScriptureReading>();
    const passages = new Map<string, ProjectionPassage>();
    const more = new Map<string, MoreVerses>();
    const nextParts = new Map<string, PassagePart>();
    for (const { key, translation, off, reference, style, bookKey, parts, partKeys } of requests) {
      const loaded = bookKey ? books.get(bookKey) : undefined;
      const own =
        bookKey && reference ? pasted.get(`${translation.id}/${reference.book}`) : undefined;
      const book = own ? mergeBooks(loaded, own) : loaded;
      let status: ScriptureStatus;
      if (!reference) status = { status: "unrecognized" };
      else if (off) status = { status: "off" };
      else if (!bookKey) status = { status: "unavailable" };
      else if (book === undefined) status = { status: "loading" };
      else if (book === "failed" || book === "notInstalled") status = { status: book };
      else {
        const passage = resolvePassage(reference, book);
        if (translation.source === "pasted" && (passage.missing || passage.verses.length === 0))
          status = { status: "needsText" };
        else if (passage.verses.length === 0) status = { status: "unavailable" };
        else {
          status = { status: "ready", missing: passage.missing, truncated: passage.truncated };
          const verses = [...passage.verses];
          const lastVerse = passage.verses[passage.verses.length - 1]!;
          let last = { book: reference.book, chapter: lastVerse.chapter, verse: lastVerse.verse };
          let lastText: BookResult | undefined = book;
          for (const [index, part] of parts.entries()) {
            lastText = books.get(partKeys[index]!);
            if (lastText === undefined || typeof lastText === "string") break;
            verses.push(...partVerses(part, lastText, reference.book));
            last = lastPlace(part, lastText);
          }
          passages.set(key, { translation, verses });

          if (lastText === undefined) more.set(key, { status: "loading" });
          else if (typeof lastText === "string") more.set(key, { status: "failed" });
          else {
            // No "Load more" for a pasted translation: the cache has only the verses of the reference.
            const next =
              translation.source === "pasted"
                ? null
                : nextPassagePart(last, lastText, translation.deuterocanon);
            if (next && style) {
              const name =
                next.book === reference.book
                  ? style.book
                  : bookAbbreviation(next.book, style.english);
              const end =
                next.book === last.book ? lastText.chapters[next.chapter - 1]?.length : undefined;
              const label =
                next.fromVerse > 1 && end
                  ? `${name} ${next.chapter}${style.english ? ":" : ","}${next.fromVerse}${end > next.fromVerse ? `–${end}` : ""}`
                  : `${name} ${next.chapter}`;
              more.set(key, { status: "ready", label });
              nextParts.set(key, next);
            }
          }
        }
      }
      readings.set(key, { translation, status });
    }

    /** Loads the books that did not load again. */
    function retry() {
      setBooks(
        (current) =>
          new Map(
            [...current].filter(([, result]) => result !== "failed" && result !== "notInstalled"),
          ),
      );
      setAttempt((value) => value + 1);
    }

    /** Adds the verses that the user pasted on this page to the readings of the book. A later load of the cache does not replace them. */
    function addPasted(translation: string, book: string, verses: CachedVerse[]) {
      const key = `${translation}/${book}`;
      setPasted((current) =>
        new Map(current).set(key, mergeBooks(current.get(key), cachedBook(verses))),
      );
    }

    /** Adds the rest of the chapter or the next chapter to the reading. */
    function loadMore(key: string) {
      const next = nextParts.get(key);
      if (next)
        setExtensions((current) => new Map(current).set(key, [...(current.get(key) ?? []), next]));
    }

    return { readings, passages, more, retry, loadMore, addPasted };
  }, [requests, books, pasted]);
}

/** The chapters of the ranges, e.g. "3,4" for "Jn 3,16–4,2". At most 150, as `getCachedVerses` takes. */
function chaptersOf(ranges: ScriptureReference["ranges"]): string {
  const chapters = new Set<number>();
  for (const { from, to } of ranges)
    for (let chapter = from.chapter; chapter <= to.chapter; chapter++) chapters.add(chapter);
  return [...chapters]
    .sort((a, b) => a - b)
    .slice(0, 150)
    .join(",");
}
