import "server-only";

import { z } from "zod";

import { BOOK_IDS } from "@/lib/music/scripture/books";
import { bookLimit, CACHE_MAX_VERSES } from "@/lib/music/scripture/cache-limits";
import { createRateLimiter, type RateLimiter } from "@/lib/requests/rate-limit";
import { getMusicSupabase } from "@/server/music/db";
import { requireUser } from "@/server/music/auth";
import { ConflictError } from "@/server/music/errors";
import { databaseError, isId, parseInput } from "./shared";
import { canProjectEvent } from "./realtime-access";
import { getScriptureConfig } from "./scripture-translations";

// The cache of the verses of a "pasted" translation of the church (the table
// `scripture_verse_cache`, see `lib/music/scripture/translations.ts`). The users of the church read
// it. Only the event admins and the users who can project the event (its volunteers) write into it,
// with a rate limit: the cache has a fixed size per church. A verse stays for 24 hours.

/** A verse is in the cache for this long after its last paste. The migration has the same interval. */
const CACHE_HOURS = 24;

/** The longest text of a verse, as the check in the migration. */
const VERSE_TEXT_MAX_LENGTH = 2000;

/** Pastes of one user per 15 minutes (each paste is one reading). */
export const CACHE_PASTES_PER_WINDOW = 30;
const LIMITER = "__churchyScriptureCacheLimiter";

function limiter(): RateLimiter {
  const store = globalThis as unknown as Record<string, RateLimiter | undefined>;
  return (store[LIMITER] ??= createRateLimiter(CACHE_PASTES_PER_WINDOW, 15 * 60 * 1000));
}

/** `chapterEnd`: the last verse of its chapter (see the migration `scripture_verse_cache`). */
export type CachedVerseDTO = { chapter: number; verse: number; text: string; chapterEnd?: boolean };

/** Whether the translation is a "pasted" translation of the church that is on now. */
async function isPastedNow(translation: string): Promise<boolean> {
  const { own } = await getScriptureConfig();
  return own.some(({ id, source }) => id === translation && source === "pasted");
}

const translationSchema = z.string().regex(/^[a-z0-9]{1,30}$/);
const bookSchema = z.string().refine((book) => BOOK_IDS.includes(book));
const chapterSchema = z.number().int().min(1).max(150);
const verseSchema = z.number().int().min(1).max(200);

const getSchema = z.object({
  translation: translationSchema,
  book: bookSchema,
  chapters: z.array(chapterSchema).min(1).max(150),
});

const putSchema = z
  .object({
    translation: translationSchema,
    book: bookSchema,
    verses: z
      .array(
        z.object({
          chapter: chapterSchema,
          verse: verseSchema,
          text: z.string().trim().min(1).max(VERSE_TEXT_MAX_LENGTH),
          chapterEnd: z.boolean().optional(),
        }),
      )
      .min(1)
      .max(CACHE_MAX_VERSES),
  })
  .refine(({ book, verses }) => verses.length <= bookLimit(book), { path: ["verses"] })
  .refine(
    ({ verses }) =>
      new Set(verses.map(({ chapter, verse }) => `${chapter}:${verse}`)).size === verses.length,
    { path: ["verses"] },
  );

/** The verses of the chapters of the book that the cache has now. */
export async function getCachedVerses(input: unknown): Promise<CachedVerseDTO[]> {
  await requireUser();
  const { translation, book, chapters } = parseInput(getSchema, input);
  if (!(await isPastedNow(translation))) return [];
  const supabase = await getMusicSupabase();
  const { data, error } = await supabase
    .from("scripture_verse_cache")
    .select("chapter, verse, text, chapter_end")
    .eq("translation", translation)
    .eq("book", book)
    .not("tenant_id", "is", null)
    .in("chapter", chapters)
    .gt("cached_at", new Date(Date.now() - CACHE_HOURS * 60 * 60 * 1000).toISOString())
    .order("chapter")
    .order("verse");
  if (error) throw databaseError("get cached verses", error);
  return (data as { chapter: number; verse: number; text: string; chapter_end: boolean }[]).map(
    ({ chapter, verse, text, chapter_end }) => ({ chapter, verse, text, chapterEnd: chapter_end }),
  );
}

/**
 * Puts the verses of one book in the church's cache. The oldest verses go out when the cache is
 * full (see `put_scripture_cache_verses`). `eventId`: the event of the projection, or null (a
 * setlist, a rehearsal).
 */
export async function cacheVerses(input: unknown, eventId: string | null = null): Promise<boolean> {
  const user = await requireUser();
  const { translation, book, verses } = parseInput(putSchema, input);
  if (!(await isPastedNow(translation))) {
    throw new ConflictError(({ m }) => m.server.scripture.pasteOff);
  }
  const canShare =
    user.canEditEvents || (eventId !== null && isId(eventId) && (await canProjectEvent(eventId)));
  if (!canShare) throw new ConflictError(({ m }) => m.server.scripture.cacheForbidden);
  if (!limiter().take(`cache-verses:${user.id}`, Date.now())) {
    throw new ConflictError(({ m }) => m.server.scripture.tooManyPastes);
  }

  const supabase = await getMusicSupabase();
  const { error } = await supabase.rpc("put_scripture_cache_verses", {
    p_translation: translation,
    p_book: book,
    p_verses: verses.map(({ chapter, verse, text, chapterEnd }) => ({
      chapter,
      verse,
      text,
      chapter_end: chapterEnd ?? false,
    })),
    p_book_limit: bookLimit(book),
  });
  if (error) throw databaseError("cache verses", error);
  return true;
}
