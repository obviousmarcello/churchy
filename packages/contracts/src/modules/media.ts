import { z } from "zod";
import type { ListPage, PageRequest } from "../common";
import type { Ctx } from "../ctx";
import { IdSchema, IsoDateTimeSchema, TextSchema } from "../primitives";

export const MediaKindSchema = z.enum(["image", "pdf", "audio", "other"]);
export type MediaKind = z.infer<typeof MediaKindSchema>;

export const MediaVariantSchema = z.object({
  width: z.number().int().positive(),
  format: z.enum(["avif", "webp", "jpeg"]),
  storageKey: z.string().min(1),
});

/**
 * `media` (SDD §8.2). `visibility = "private"` marks files that are only served through signed
 * URLs after a permission check (request uploads, internal documents) — never to anonymous ctx.
 */
export const MediaSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  kind: MediaKindSchema,
  filename: TextSchema,
  mimeType: z.string().regex(/^[a-z]+\/[a-z0-9.+-]+$/),
  /** Object-storage key, prefixed `t/<tenantId>/…` by the storage layer. */
  storageKey: z.string().min(1),
  variants: z.array(MediaVariantSchema),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  bytes: z.number().int().nonnegative(),
  alt: z.string().max(300).nullable(),
  /** Explicitly decorative image (no alt text needed, SDD §16). */
  decorative: z.boolean(),
  caption: z.string().max(500).nullable(),
  /** *„Rendelkezik a hozzájárulásukkal?”* — photo consent flag (C-06). */
  peopleConsent: z.boolean(),
  visibility: z.enum(["public", "private"]),
  uploadedBy: IdSchema.nullable(),
  createdAt: IsoDateTimeSchema,
});
export type Media = z.infer<typeof MediaSchema>;

/** Metadata recorded after the storage upload/processing finished. */
export const MediaCreateInputSchema = MediaSchema.omit({
  id: true,
  tenantId: true,
  uploadedBy: true,
  createdAt: true,
})
  .extend({
    variants: z.array(MediaVariantSchema).default([]),
    width: z.number().int().positive().nullable().default(null),
    height: z.number().int().positive().nullable().default(null),
    alt: z.string().max(300).nullable().default(null),
    decorative: z.boolean().default(false),
    caption: z.string().max(500).nullable().default(null),
    peopleConsent: z.boolean().default(false),
    visibility: z.enum(["public", "private"]).default("public"),
  })
  .refine((m) => m.kind !== "image" || m.decorative || (m.alt ?? "").trim().length > 0, {
    message: "Images need alt text or must be marked decorative",
    path: ["alt"],
  });
export type MediaCreateInput = z.input<typeof MediaCreateInputSchema>;

export const MediaUpdateInputSchema = z.object({
  alt: z.string().max(300).nullable().optional(),
  decorative: z.boolean().optional(),
  caption: z.string().max(500).nullable().optional(),
  peopleConsent: z.boolean().optional(),
});
export type MediaUpdateInput = z.input<typeof MediaUpdateInputSchema>;

/** Module `media` — media library metadata (files themselves live in object storage). */
export interface MediaRepo {
  /** @public One item by id (anonymous: public items only). */
  get(ctx: Ctx, id: string): Promise<Media | null>;
  /** @public Several items by id, unknown/foreign ids skipped (anonymous: public only). */
  getMany(ctx: Ctx, ids: string[]): Promise<Media[]>;
  /** Library list, newest first (anonymous: empty page). */
  list(ctx: Ctx, query?: PageRequest & { kind?: MediaKind }): Promise<ListPage<Media>>;
  /** Tenant ctx: record an uploaded file; `uploadedBy` = ctx actor. */
  create(ctx: Ctx, input: MediaCreateInput): Promise<Media>;
  /** Tenant ctx: edit alt text, caption, consent. VALIDATION if an image loses its alt text. */
  update(ctx: Ctx, id: string, patch: MediaUpdateInput): Promise<Media>;
  /** Tenant ctx: delete metadata (the storage layer deletes the object). */
  delete(ctx: Ctx, id: string): Promise<void>;
  /** Tenant ctx: storage usage for the quota display (FR-306). */
  usage(ctx: Ctx): Promise<{ bytes: number; count: number }>;
}
