import "server-only";

import { z } from "zod";

import {
  DEFAULT_SCRIPTURE_CONFIG,
  TRANSLATION_ID_PATTERN,
  type ScriptureConfig,
  type ScriptureTranslation,
} from "@/lib/music/scripture/translations";
import { getMusicSupabase } from "@/server/music/db";
import { ConflictError } from "@/server/music/errors";
import { databaseError, parseInput, requiredText } from "./shared";

// The Bible translations of a church (the table `scripture_translations`, PLAN §24): besides Károli
// 1908 of the platform catalog, a church adds its own translations under its own licence. A
// "pasted" translation keeps short quotes in the church's cache; a "database" translation has its
// full text in `scripture_books`. Károli is on or off in `app_config.scripture_karoli`. Callers
// check `music.scripture.use` / `music.scripture.translations.manage`; RLS keeps the tenant.

const TRANSLATION_COLUMNS =
  "id, language, name, short_name, notice, source, deuterocanon, enabled, source_links";

const sourceLinksSchema = z
  .object({
    szentiras: z.string().trim().min(1).max(30).optional(),
    bibliaMindenkie: z.string().trim().min(1).max(30).optional(),
    bibleCom: z
      .object({
        id: z.number().int().min(1).max(100000),
        abbreviation: z.string().trim().min(1).max(20),
      })
      .optional(),
  })
  .strict();

const rowSchema = z.object({
  id: z.string(),
  language: z.string(),
  name: z.string(),
  short_name: z.string(),
  notice: z.string().nullable(),
  source: z.enum(["pasted", "database"]),
  deuterocanon: z.boolean(),
  enabled: z.boolean(),
  source_links: z.unknown().transform((value) => {
    const parsed = sourceLinksSchema.safeParse(value);
    return parsed.success && Object.keys(parsed.data).length > 0 ? parsed.data : null;
  }),
});

/** A translation of the church, for the settings page: also off ones. */
export type OwnTranslationDTO = ScriptureTranslation & {
  enabled: boolean;
  /** The books of a "database" translation that the church has uploaded. */
  books: number;
};

function toTranslation(row: z.infer<typeof rowSchema>): ScriptureTranslation {
  return {
    id: row.id,
    language: row.language,
    name: row.name,
    shortName: row.short_name,
    notice: row.notice,
    deuterocanon: row.deuterocanon,
    source: row.source,
    ...(row.source_links && { sources: row.source_links }),
  };
}

async function readRows() {
  const supabase = await getMusicSupabase();
  const { data, error } = await supabase
    .from("scripture_translations")
    .select(TRANSLATION_COLUMNS)
    .order("name");
  if (error) throw databaseError("list scripture translations", error);
  return z.array(rowSchema).parse(data);
}

/** What the church shows: Károli (unless off) and its own translations that are on. */
export async function getScriptureConfig(): Promise<ScriptureConfig> {
  const supabase = await getMusicSupabase();
  const [rows, karoli] = await Promise.all([
    readRows(),
    supabase.from("app_config").select("scripture_karoli").maybeSingle(),
  ]);
  if (karoli.error) throw databaseError("read scripture config", karoli.error);
  return {
    karoli: karoli.data?.scripture_karoli ?? DEFAULT_SCRIPTURE_CONFIG.karoli,
    own: rows.filter((row) => row.enabled).map(toTranslation),
  };
}

/** The church's own translations with their number of uploaded books, for the settings page. */
export async function listOwnTranslations(): Promise<OwnTranslationDTO[]> {
  const supabase = await getMusicSupabase();
  const [rows, books] = await Promise.all([
    readRows(),
    supabase.from("scripture_books").select("translation").not("tenant_id", "is", null),
  ]);
  if (books.error) throw databaseError("count scripture books", books.error);
  const counts = new Map<string, number>();
  for (const { translation } of books.data as { translation: string }[]) {
    counts.set(translation, (counts.get(translation) ?? 0) + 1);
  }
  return rows.map((row) => ({
    ...toTranslation(row),
    enabled: row.enabled,
    books: counts.get(row.id) ?? 0,
  }));
}

const NOTICE_MAX_LENGTH = 500;

export const saveTranslationSchema = z.object({
  id: z
    .string()
    .regex(TRANSLATION_ID_PATTERN)
    .refine((id) => id !== "karoli1908"),
  name: requiredText(120),
  shortName: requiredText(20),
  notice: z
    .string()
    .trim()
    .max(NOTICE_MAX_LENGTH)
    .nullish()
    .transform((value) => value || null),
  source: z.enum(["pasted", "database"]),
  deuterocanon: z.boolean().default(false),
  enabled: z.boolean().default(true),
  sources: sourceLinksSchema.nullish().transform((value) => value ?? null),
});

/** Adds or changes a translation of the church. Its id never changes, and so does not its source once it has text. */
export async function saveTranslation(input: unknown): Promise<void> {
  const value = parseInput(saveTranslationSchema, input);
  const supabase = await getMusicSupabase();
  const existing = await supabase
    .from("scripture_translations")
    .select("source")
    .eq("id", value.id)
    .maybeSingle();
  if (existing.error) throw databaseError("read scripture translation", existing.error);
  if (existing.data && existing.data.source !== value.source) {
    // Another source would orphan the text (or the cache) of the old one.
    throw new ConflictError(({ m }) => m.server.scripture.sourceFixed);
  }
  const { error } = await supabase.from("scripture_translations").upsert(
    {
      id: value.id,
      name: value.name,
      short_name: value.shortName,
      notice: value.notice,
      source: value.source,
      deuterocanon: value.deuterocanon,
      enabled: value.enabled,
      source_links: value.sources && Object.keys(value.sources).length > 0 ? value.sources : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,id" },
  );
  if (error) throw databaseError("save scripture translation", error);
}

/** Removes a translation with its uploaded text and its cache (foreign keys cascade). */
export async function deleteTranslation(id: string): Promise<void> {
  const value = parseInput(z.string().regex(TRANSLATION_ID_PATTERN), id);
  const supabase = await getMusicSupabase();
  const { error } = await supabase.from("scripture_translations").delete().eq("id", value);
  if (error) throw databaseError("delete scripture translation", error);
}

/** Turns Károli 1908 on or off for the church. */
export async function setKaroliEnabled(enabled: boolean): Promise<void> {
  const supabase = await getMusicSupabase();
  const updated = await supabase
    .from("app_config")
    .update({ scripture_karoli: enabled })
    .not("tenant_id", "is", null)
    .select("tenant_id");
  if (updated.error) throw databaseError("set Károli", updated.error);
  if (updated.data.length > 0) return;
  const { error } = await supabase
    .from("app_config")
    .insert({ app_name: "Énektár", scripture_karoli: enabled });
  if (error) throw databaseError("set Károli", error);
}
