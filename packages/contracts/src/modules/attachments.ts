import { z } from "zod";
import type { Ctx } from "../ctx";
import { IdSchema, IsoDateTimeSchema, MusicalKeySchema, TextSchema } from "../primitives";

export const AttachmentOwnerTypeSchema = z.enum(["song", "arrangement", "plan", "plan_item"]);
export type AttachmentOwnerType = z.infer<typeof AttachmentOwnerTypeSchema>;

export const AttachmentKindSchema = z.enum([
  "sheet_music",
  "chord_chart",
  "lyrics",
  "audio",
  "musicxml",
  "image",
  "link",
  "other",
]);

/**
 * `attachments` (SDD §24.2, §24.5). Internal only — never public. A new upload with the same
 * `(ownerType, ownerId, label)` supersedes the previous version.
 */
export const AttachmentSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  ownerType: AttachmentOwnerTypeSchema,
  ownerId: IdSchema,
  mediaId: IdSchema.nullable(),
  url: z.url().nullable(),
  kind: AttachmentKindSchema,
  label: TextSchema,
  part: z.string().max(60).nullable(),
  key: MusicalKeySchema.nullable(),
  version: z.number().int().positive(),
  supersedesId: IdSchema.nullable(),
  /** Person who ticked *„Jogosult vagyok megosztani…”* (C-10). */
  rightsConfirmedBy: IdSchema,
  /** SHA-256 of the file, for platform-wide takedown. */
  contentHash: z.string().nullable(),
  /** Disabled by takedown. */
  disabled: z.boolean(),
  createdAt: IsoDateTimeSchema,
});
export type Attachment = z.infer<typeof AttachmentSchema>;

export const AttachmentInputSchema = z
  .object({
    ownerType: AttachmentOwnerTypeSchema,
    ownerId: IdSchema,
    mediaId: IdSchema.nullable().default(null),
    url: z.url().nullable().default(null),
    kind: AttachmentKindSchema,
    label: TextSchema,
    part: z.string().max(60).nullable().default(null),
    key: MusicalKeySchema.nullable().default(null),
    contentHash: z.string().nullable().default(null),
    /** The rights-confirmation checkbox is mandatory. */
    rightsConfirmed: z.literal(true),
    rightsConfirmedBy: IdSchema,
  })
  .refine((a) => (a.mediaId === null) !== (a.url === null), {
    message: "Exactly one of mediaId or url is required",
    path: ["mediaId"],
  });
export type AttachmentInput = z.input<typeof AttachmentInputSchema>;

/** Module `attachments` — versioned sheet music, charts, audio for songs and plans (D-65). */
export interface AttachmentRepo {
  /**
   * Attachments of an owner: newest version per label (or full history), excluding disabled
   * ones unless `includeDisabled`.
   */
  listByOwner(
    ctx: Ctx,
    owner: { ownerType: AttachmentOwnerType; ownerId: string },
    options?: { history?: boolean; includeDisabled?: boolean },
  ): Promise<Attachment[]>;
  /** One attachment, or null (anonymous: always null). */
  get(ctx: Ctx, id: string): Promise<Attachment | null>;
  /**
   * Tenant ctx: add an attachment; supersedes the same-label one (version + 1). NOT_FOUND for an
   * owner (song/arrangement/plan/item) outside the tenant.
   */
  create(ctx: Ctx, input: AttachmentInput): Promise<Attachment>;
  /** Tenant ctx: takedown — disable all attachments with this content hash; returns the count. */
  disableByHash(ctx: Ctx, contentHash: string): Promise<number>;
  /** Tenant ctx: delete one version. */
  delete(ctx: Ctx, id: string): Promise<void>;
}
