import { z } from "zod";
import type { Ctx } from "../ctx";
import {
  AddressSchema,
  GeoPointSchema,
  IdSchema,
  OpeningHoursSchema,
  SlugSchema,
  TextSchema,
  TimestampsShape,
} from "../primitives";

/** Location kind (SDD §8.2): church, chapel, filial church, other. */
export const LocationKindSchema = z.enum(["templom", "kapolna", "filia", "egyeb"]);
export type LocationKind = z.infer<typeof LocationKindSchema>;

export const AccessibilitySchema = z.object({
  wheelchair: z.boolean().default(false),
  accessibleToilet: z.boolean().default(false),
  hearingLoop: z.boolean().default(false),
  parking: z.boolean().default(false),
  note: z.string().max(500).nullable().default(null),
});
export type Accessibility = z.infer<typeof AccessibilitySchema>;

/** `locations` (SDD §8.2). Public data. */
export const LocationSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  name: TextSchema,
  slug: SlugSchema,
  kind: LocationKindSchema,
  address: AddressSchema.nullable(),
  geo: GeoPointSchema.nullable(),
  openingHours: OpeningHoursSchema,
  accessibility: AccessibilitySchema,
  photoMediaId: IdSchema.nullable(),
  /** Display order (ascending); ties sorted by name with Hungarian collation. */
  sort: z.number().int(),
  ...TimestampsShape,
});
export type Location = z.infer<typeof LocationSchema>;

export const LocationInputSchema = z.object({
  id: IdSchema.optional(),
  name: TextSchema,
  slug: SlugSchema,
  kind: LocationKindSchema,
  address: AddressSchema.nullable().default(null),
  geo: GeoPointSchema.nullable().default(null),
  openingHours: OpeningHoursSchema.default({ weekly: [], exceptions: [] }),
  accessibility: AccessibilitySchema.default({
    wheelchair: false,
    accessibleToilet: false,
    hearingLoop: false,
    parking: false,
    note: null,
  }),
  photoMediaId: IdSchema.nullable().default(null),
  sort: z.number().int().default(0),
});
export type LocationInput = z.input<typeof LocationInputSchema>;

/**
 * Module `locations` — churches, chapels and filials of a tenant (FR-003). All reads are public.
 * Lists are ordered by `sort`, then name (Hungarian collation).
 */
export interface LocationRepo {
  /** @public All locations of the tenant, ordered. */
  list(ctx: Ctx): Promise<Location[]>;
  /** @public One location by id, or null (also null for another tenant's id). */
  get(ctx: Ctx, id: string): Promise<Location | null>;
  /** @public One location by slug, or null. */
  getBySlug(ctx: Ctx, slug: string): Promise<Location | null>;
  /**
   * Tenant ctx: create (no `id`) or update (with `id`). VALIDATION on bad input, NOT_FOUND for
   * an unknown id, CONFLICT on a duplicate slug within the tenant.
   */
  upsert(ctx: Ctx, input: LocationInput): Promise<Location>;
  /** Tenant ctx: delete. NOT_FOUND if it is not the tenant's. */
  delete(ctx: Ctx, id: string): Promise<void>;
  /** Tenant ctx: set `sort` to the index in `ids` (drag-and-drop, D-21). NOT_FOUND for foreign ids. */
  reorder(ctx: Ctx, ids: string[]): Promise<void>;
}
