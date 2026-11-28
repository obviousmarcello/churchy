import "server-only";

import { z } from "zod";

import { BOOK_IDS } from "@/lib/music/scripture/books";
import { getMusicSupabase } from "@/server/music/db";
import { ConflictError } from "@/server/music/errors";
import { databaseError, parseInput } from "./shared";
import { getScriptureConfig } from "./scripture-translations";

// The full text of the "database" translations of a church (the table `scripture_books`, see
// `lib/music/scripture/translations.ts`), one row per book. Any signed-in user of the church reads
// it while the translation is on; the church's translation managers upload it as the JSON of the
// platform files (`{ "chapters": string[][] }`, `public/bible/`). RLS keeps the tenant.

const bookSchema = z.object({
  chapters: z
    .array(z.array(z.string().max(2000)).max(200))
    .min(1)
    .max(150),
});

/**
 * The book as JSON (`{ "chapters": string[][] }`, as the files of `public/bible/`), for the route
 * `/munkater/biblia-szoveg/<translation>/<book>`. "off" when the translation is not a "database"
 * translation of the church now (it is off, or its text has another source), null when the
 * database does not have the book.
 */
export async function getDatabaseBook(
  translation: string,
  book: string,
): Promise<string | "off" | null> {
  if (!BOOK_IDS.includes(book)) return null;
  const { own } = await getScriptureConfig();
  if (!own.some(({ id, source }) => id === translation && source === "database")) return "off";
  const supabase = await getMusicSupabase();
  const { data, error } = await supabase
    .from("scripture_books")
    .select("chapters")
    .eq("translation", translation)
    .eq("book", book)
    .not("tenant_id", "is", null)
    .maybeSingle();
  if (error) throw databaseError("get scripture book", error);
  if (!data) return null;
  const parsed = bookSchema.safeParse({ chapters: data.chapters });
  if (!parsed.success) {
    console.error(`[scripture] The book ${translation}/${book} in the database has a wrong form`);
    return null;
  }
  return JSON.stringify(parsed.data);
}

const putSchema = z.object({
  translation: z.string().regex(/^[a-z0-9]{1,30}$/),
  book: z.string().refine((book) => BOOK_IDS.includes(book)),
  text: bookSchema,
});

/** Stores (or replaces) the text of one book of a "database" translation of the church. */
export async function putDatabaseBook(input: unknown): Promise<void> {
  const { translation, book, text } = parseInput(putSchema, input);
  const supabase = await getMusicSupabase();
  const translations = await supabase
    .from("scripture_translations")
    .select("source")
    .eq("id", translation)
    .maybeSingle();
  if (translations.error) throw databaseError("read scripture translation", translations.error);
  if (translations.data?.source !== "database") {
    throw new ConflictError(({ m }) => m.server.scripture.notDatabase);
  }
  const { error } = await supabase
    .from("scripture_books")
    .upsert(
      { translation, book, chapters: text.chapters, updated_at: new Date().toISOString() },
      { onConflict: "tenant_id,translation,book" },
    );
  if (error) throw databaseError("put scripture book", error);
}

/** Removes the text of one book of a translation of the church. */
export async function deleteDatabaseBook(translation: string, book: string): Promise<void> {
  const value = parseInput(putSchema.omit({ text: true }), { translation, book });
  const supabase = await getMusicSupabase();
  const { error } = await supabase
    .from("scripture_books")
    .delete()
    .eq("translation", value.translation)
    .eq("book", value.book)
    .not("tenant_id", "is", null);
  if (error) throw databaseError("delete scripture book", error);
}

/** The books of the church's translation that have text, in the order of the Bible. */
export async function listDatabaseBooks(translation: string): Promise<string[]> {
  const supabase = await getMusicSupabase();
  const { data, error } = await supabase
    .from("scripture_books")
    .select("book")
    .eq("translation", translation)
    .not("tenant_id", "is", null);
  if (error) throw databaseError("list scripture books", error);
  const have = new Set((data as { book: string }[]).map(({ book }) => book));
  return BOOK_IDS.filter((book) => have.has(book));
}
