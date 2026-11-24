import "server-only";

import { z } from "zod";

import { requireUser } from "@/server/music/auth";
import { ValidationError } from "@/server/music/errors";
import { getMusicSupabase } from "@/server/music/db";
import { databaseError, idSchema, isId, parseInput, requiredText } from "./shared";

// A user's own notes on a song, e.g. "Drums come in" on "Chorus". An
// annotation is anchored to a section label, so it shows up in every
// arrangement of the song that has a section with that label (ignoring case).
// Limit one to a single setlist slot with `setlistItemId`. Every function is
// scoped to the signed-in user: nobody can read or change another user's
// annotations.

export type AnnotationDTO = {
  id: string;
  songId: string;
  /** Null: shown in every arrangement. Set: only in this setlist slot. */
  setlistItemId: string | null;
  /** Null: about the whole song. */
  sectionLabel: string | null;
  body: string;
};

const sectionLabelSchema = z
  .string()
  .trim()
  .max(100)
  .nullable()
  .transform((value) => value || null);

export const annotationInputSchema = z.strictObject({
  songId: idSchema,
  setlistItemId: idSchema.nullish().transform((value) => value ?? null),
  sectionLabel: sectionLabelSchema.optional().transform((value) => value ?? null),
  body: requiredText(1000),
});

/**
 * Every field is optional: send only what changes. `setlistItemId: null`
 * makes a slot-only annotation reusable; `sectionLabel: null` moves it to the
 * whole song.
 */
export const annotationPatchSchema = z.strictObject({
  setlistItemId: idSchema.nullable().optional(),
  sectionLabel: sectionLabelSchema.optional(),
  body: requiredText(1000).optional(),
});

export type AnnotationInput = z.input<typeof annotationInputSchema>;
export type AnnotationPatch = z.input<typeof annotationPatchSchema>;

export const ANNOTATION_COLUMNS = "id, song_id, setlist_item_id, section_label, body";

export const annotationRowSchema = z.object({
  id: z.uuid(),
  song_id: z.uuid(),
  setlist_item_id: z.uuid().nullable(),
  section_label: z.string().nullable(),
  body: z.string(),
});

const KNOWN_ERRORS = {
  // Raised by the trigger that checks the slot's song.
  P0001: () =>
    new ValidationError([
      { path: "setlistItemId", message: ({ m }) => m.server.annotations.slotNotThisSong },
    ]),
  "23503": () =>
    new ValidationError([
      { path: "songId", message: ({ m }) => m.server.annotations.unknownSongOrSlot },
    ]),
};

/** All of the signed-in user's annotations on a song, oldest first. */
export async function listMyAnnotations(songId: string): Promise<AnnotationDTO[]> {
  const user = await requireUser();
  if (!isId(songId)) return [];

  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("annotations")
    .select(ANNOTATION_COLUMNS)
    .eq("user_id", user.id)
    .eq("song_id", songId)
    .order("created_at", { ascending: true });
  if (error) throw databaseError("list annotations", error);

  return z.array(annotationRowSchema).parse(data).map(toAnnotation);
}

export async function createAnnotation(input: unknown): Promise<AnnotationDTO> {
  const user = await requireUser();
  const annotation = parseInput(annotationInputSchema, input);

  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("annotations")
    .insert({
      user_id: user.id,
      song_id: annotation.songId,
      setlist_item_id: annotation.setlistItemId,
      section_label: annotation.sectionLabel,
      body: annotation.body,
    })
    .select(ANNOTATION_COLUMNS)
    .single();
  if (error) throw databaseError("create annotation", error, KNOWN_ERRORS);

  return toAnnotation(annotationRowSchema.parse(data));
}

/** Returns null if the annotation does not exist or belongs to someone else. */
export async function updateAnnotation(id: string, patch: unknown): Promise<AnnotationDTO | null> {
  const user = await requireUser();
  if (!isId(id)) return null;
  const changes = parseInput(annotationPatchSchema, patch);

  const row: Record<string, string | null> = {};
  if (changes.setlistItemId !== undefined) row.setlist_item_id = changes.setlistItemId;
  if (changes.sectionLabel !== undefined) row.section_label = changes.sectionLabel;
  if (changes.body !== undefined) row.body = changes.body;

  const table = (await getMusicSupabase()).from("annotations");
  const query =
    Object.keys(row).length > 0
      ? table.update(row).select(ANNOTATION_COLUMNS)
      : table.select(ANNOTATION_COLUMNS);
  const { data, error } = await query.eq("id", id).eq("user_id", user.id).maybeSingle();
  if (error) throw databaseError("update annotation", error, KNOWN_ERRORS);

  return data ? toAnnotation(annotationRowSchema.parse(data)) : null;
}

/** Returns false if the annotation does not exist or belongs to someone else. */
export async function deleteAnnotation(id: string): Promise<boolean> {
  const user = await requireUser();
  if (!isId(id)) return false;

  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("annotations")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id");
  if (error) throw databaseError("delete annotation", error);

  return data.length > 0;
}

export function toAnnotation(row: z.infer<typeof annotationRowSchema>): AnnotationDTO {
  return {
    id: row.id,
    songId: row.song_id,
    setlistItemId: row.setlist_item_id,
    sectionLabel: row.section_label,
    body: row.body,
  };
}
