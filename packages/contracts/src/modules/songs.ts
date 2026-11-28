import { z } from "zod";
import type { Ctx } from "../ctx";
import { IdSchema, TextSchema, TimestampsShape } from "../primitives";
import { DenominationSchema } from "./tenants";

/**
 * `hymnals` (SDD §24.2). `tenantId = null` = platform catalog (names/abbreviations only, no
 * songs) — visible to every tenant; tenant-owned songbooks are visible to that tenant only.
 */
export const HymnalSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema.nullable(),
  abbreviation: z.string().min(1).max(12),
  name: TextSchema,
  denomination: DenominationSchema.nullable(),
});
export type Hymnal = z.infer<typeof HymnalSchema>;

export const HymnalInputSchema = HymnalSchema.omit({ tenantId: true }).extend({
  id: IdSchema.optional(),
  denomination: DenominationSchema.nullable().default(null),
});
export type HymnalInput = z.input<typeof HymnalInputSchema>;

/** `song_hymnal_refs`, embedded in the song. */
export const SongHymnalRefSchema = z.object({
  hymnalId: IdSchema,
  number: z
    .string()
    .regex(/^\d{1,4}[a-zA-Z]?$/, { message: "Expected a hymn number like 42 or 42a" }),
  versesNote: z.string().max(200).nullable().default(null),
});
export type SongHymnalRef = z.infer<typeof SongHymnalRefSchema>;

/**
 * Rights status of a song (music module, Music Sheet DB `songs.rights_status`). The rights fields
 * are free text as in the music app; PLAN §11 wants them as a shared catalog (open, see
 * docs/music-merge/PLAN.md §13).
 */
export const SongRightsStatusSchema = z.enum([
  "public_domain",
  "licensed",
  "permitted",
  "partial",
  "unknown",
]);
export type SongRightsStatus = z.infer<typeof SongRightsStatusSchema>;

/** Trimmed, 1..max characters (the music tables' CHECK constraints). */
const trimmed = (max: number) => z.string().trim().min(1).max(max);
/** At most 10 tags, each 1..40 characters, unique ignoring case (`valid_song_tags()`). */
const SongTagsSchema = z
  .array(trimmed(40))
  .max(10)
  .refine((tags) => new Set(tags.map((t) => t.toLowerCase())).size === tags.length, {
    message: "Duplicate tag",
  });

/**
 * `songs` — the music module's song (PLAN §11 "Songs/arrangements": Music Sheet DB's shape
 * replaces Churchy's; Churchy-only fields were dropped). The chart text lives in the
 * arrangements' ChordPro. `hymnalRefs` is Churchy's hymnal link (`song_hymnal_refs`), rewired.
 */
export const SongSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  title: trimmed(200),
  artist: trimmed(200).nullable(),
  tags: SongTagsSchema,
  copyright: trimmed(500).nullable(),
  songbook: trimmed(200).nullable(),
  authors: trimmed(500).nullable(),
  originalTitle: trimmed(200).nullable(),
  translator: trimmed(200).nullable(),
  rightsStatus: SongRightsStatusSchema,
  rightsNote: trimmed(500).nullable(),
  hymnalRefs: z.array(SongHymnalRefSchema),
  ...TimestampsShape,
});
export type Song = z.infer<typeof SongSchema>;

export const SongInputSchema = z.object({
  id: IdSchema.optional(),
  title: SongSchema.shape.title,
  artist: SongSchema.shape.artist.default(null),
  tags: SongTagsSchema.default([]),
  copyright: SongSchema.shape.copyright.default(null),
  songbook: SongSchema.shape.songbook.default(null),
  authors: SongSchema.shape.authors.default(null),
  originalTitle: SongSchema.shape.originalTitle.default(null),
  translator: SongSchema.shape.translator.default(null),
  rightsStatus: SongRightsStatusSchema.default("unknown"),
  rightsNote: SongSchema.shape.rightsNote.default(null),
  hymnalRefs: z.array(SongHymnalRefSchema).default([]),
});
export type SongInput = z.input<typeof SongInputSchema>;

/**
 * `arrangements` — a ChordPro chart of a song (music module shape). `musicalKey`, `tempoBpm`,
 * `timeSignature` and `durationSeconds` are generated from the chart's `{key:}`, `{tempo:}`,
 * `{time:}` and `{duration:}` directives (read-only; see `chordproDirective()`).
 */
export const ArrangementSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  songId: IdSchema,
  name: trimmed(200),
  chordpro: z.string().max(50000),
  sectionOrder: z.array(z.string()),
  isDefault: z.boolean(),
  projectionThemeId: IdSchema.nullable(),
  musicalKey: z.string().nullable(),
  tempoBpm: z.number().int().nullable(),
  timeSignature: z.string().nullable(),
  durationSeconds: z.number().int().nullable(),
  ...TimestampsShape,
});
export type Arrangement = z.infer<typeof ArrangementSchema>;

export const ArrangementInputSchema = z.object({
  id: IdSchema.optional(),
  songId: IdSchema,
  name: ArrangementSchema.shape.name,
  chordpro: ArrangementSchema.shape.chordpro.default(""),
  sectionOrder: z.array(z.string()).default([]),
  isDefault: z.boolean().default(false),
  projectionThemeId: IdSchema.nullable().default(null),
});
export type ArrangementInput = z.input<typeof ArrangementInputSchema>;

/** Value of a ChordPro directive (`{name: value}`), like the DB function `chordpro_directive()`. */
export function chordproDirective(chordpro: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`^\\s*\\{\\s*${escaped}\\s*:\\s*([^}\\n]*?)\\s*\\}`, "m").exec(chordpro);
  return m?.[1] ?? null;
}

/** The generated columns of `arrangements` (same rules as the DB expressions). */
export function arrangementDerived(
  chordpro: string,
): Pick<Arrangement, "musicalKey" | "tempoBpm" | "timeSignature" | "durationSeconds"> {
  const tempo = chordproDirective(chordpro, "tempo");
  const time = chordproDirective(chordpro, "time");
  const duration = chordproDirective(chordpro, "duration");
  let durationSeconds: number | null = null;
  if (duration !== null && /^[0-9]{1,5}$/.test(duration)) durationSeconds = Number(duration);
  else if (duration !== null && /^[0-9]{1,3}:[0-5][0-9]$/.test(duration)) {
    const [min, sec] = duration.split(":");
    durationSeconds = Number(min) * 60 + Number(sec);
  }
  return {
    musicalKey: chordproDirective(chordpro, "key"),
    tempoBpm: tempo !== null && /^[0-9]{1,3}$/.test(tempo) ? Number(tempo) : null,
    timeSignature: time !== null && /^[0-9]{1,2}\/[0-9]{1,2}$/.test(time) ? time : null,
    durationSeconds,
  };
}

export type SongQuery = {
  /** Accent-insensitive match on title and artist; or `"RÉ 42"` (hymnal ref). */
  query?: string;
  /** Songs carrying this tag (case-insensitive). */
  tag?: string;
};

/**
 * Module `songs` — song library, hymnals and arrangements (D-64). Internal data. A new tenant has
 * 0 songs; the platform only ships the hymnal name catalog.
 */
export interface SongRepo {
  /** Platform catalog + tenant songbooks, by abbreviation. */
  listHymnals(ctx: Ctx): Promise<Hymnal[]>;
  /** Tenant ctx: create/update a tenant-owned songbook (platform rows are read-only → NOT_FOUND). */
  upsertHymnal(ctx: Ctx, input: HymnalInput): Promise<Hymnal>;

  /** Search, sorted by title (Hungarian collation). */
  search(ctx: Ctx, query?: SongQuery): Promise<Song[]>;
  /** One song, or null. */
  get(ctx: Ctx, id: string): Promise<Song | null>;
  /** Tenant ctx: create/update. NOT_FOUND for a `hymnalId` not visible to the tenant. */
  upsert(ctx: Ctx, input: SongInput): Promise<Song>;
  /** Tenant ctx: delete with its arrangements. */
  delete(ctx: Ctx, id: string): Promise<void>;

  /** Arrangements of a song. */
  listArrangements(ctx: Ctx, songId: string): Promise<Arrangement[]>;
  /** Tenant ctx: create/update. NOT_FOUND for a song outside the tenant. */
  upsertArrangement(ctx: Ctx, input: ArrangementInput): Promise<Arrangement>;
  /** Tenant ctx: delete an arrangement. */
  deleteArrangement(ctx: Ctx, id: string): Promise<void>;
}
