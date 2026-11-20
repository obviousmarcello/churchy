import { z } from "zod";
import type { Ctx } from "../ctx";
import { IdSchema, MusicalKeySchema, TextSchema, TimestampsShape } from "../primitives";
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

export const SongLicenceSchema = z.enum([
  "public_domain",
  "licensed",
  "permission",
  "own",
  "unknown",
]);

/** `songs` (SDD §24.2). */
export const SongSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  title: TextSchema,
  altTitles: z.array(TextSchema),
  firstLine: z.string().max(300).nullable(),
  lyrics: z.string().max(20000).nullable(),
  language: z.string().min(2).max(12),
  authors: z.array(TextSchema),
  composers: z.array(TextSchema),
  translators: z.array(TextSchema),
  copyrightHolder: z.string().max(200).nullable(),
  licence: SongLicenceSchema,
  licenceRef: z.string().max(200).nullable(),
  themes: z.array(z.string().min(1).max(60)),
  seasons: z.array(z.string().min(1).max(60)),
  defaultKey: MusicalKeySchema.nullable(),
  tempoBpm: z.number().int().min(20).max(300).nullable(),
  timeSignature: z
    .string()
    .regex(/^\d{1,2}\/\d{1,2}$/)
    .nullable(),
  notes: z.string().max(4000).nullable(),
  hymnalRefs: z.array(SongHymnalRefSchema),
  ...TimestampsShape,
});
export type Song = z.infer<typeof SongSchema>;

export const SongInputSchema = z.object({
  id: IdSchema.optional(),
  title: TextSchema,
  altTitles: z.array(TextSchema).default([]),
  firstLine: z.string().max(300).nullable().default(null),
  lyrics: z.string().max(20000).nullable().default(null),
  language: z.string().min(2).max(12).default("hu"),
  authors: z.array(TextSchema).default([]),
  composers: z.array(TextSchema).default([]),
  translators: z.array(TextSchema).default([]),
  copyrightHolder: z.string().max(200).nullable().default(null),
  licence: SongLicenceSchema.default("unknown"),
  licenceRef: z.string().max(200).nullable().default(null),
  themes: z.array(z.string().min(1).max(60)).default([]),
  seasons: z.array(z.string().min(1).max(60)).default([]),
  defaultKey: MusicalKeySchema.nullable().default(null),
  tempoBpm: z.number().int().min(20).max(300).nullable().default(null),
  timeSignature: SongSchema.shape.timeSignature.default(null),
  notes: z.string().max(4000).nullable().default(null),
  hymnalRefs: z.array(SongHymnalRefSchema).default([]),
});
export type SongInput = z.input<typeof SongInputSchema>;

/** `arrangements` (SDD §24.2). */
export const ArrangementSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  songId: IdSchema,
  name: TextSchema,
  key: MusicalKeySchema,
  tempoBpm: z.number().int().min(20).max(300).nullable(),
  structure: z.string().max(500),
  chordpro: z.string().max(50000).nullable(),
  notes: z.string().max(4000).nullable(),
});
export type Arrangement = z.infer<typeof ArrangementSchema>;

export const ArrangementInputSchema = ArrangementSchema.omit({ tenantId: true }).extend({
  id: IdSchema.optional(),
  tempoBpm: z.number().int().min(20).max(300).nullable().default(null),
  structure: z.string().max(500).default(""),
  chordpro: z.string().max(50000).nullable().default(null),
  notes: z.string().max(4000).nullable().default(null),
});
export type ArrangementInput = z.input<typeof ArrangementInputSchema>;

export type SongQuery = {
  /** Accent-insensitive match on title, alt titles and first line; or `"RÉ 42"` (hymnal ref). */
  query?: string;
  theme?: string;
  season?: string;
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

  /** Search, by title (Hungarian collation). */
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
