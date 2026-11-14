import { z } from "zod";
import { PublishFieldsShape } from "../common";
import type { Ctx } from "../ctx";
import { IdSchema, RichTextSchema, SlugSchema, TextSchema, TimestampsShape } from "../primitives";

/** Embeds are restricted to an allow-list of providers (SDD §13). */
export const EmbedProviderSchema = z.enum([
  "youtube",
  "facebook",
  "vimeo",
  "soundcloud",
  "openstreetmap",
]);

/** Page blocks (FR-007, D-16). */
export const PageBlockSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("heading"),
    text: TextSchema,
    level: z.union([z.literal(2), z.literal(3)]),
  }),
  z.object({ type: z.literal("text"), content: RichTextSchema }),
  z.object({
    type: z.literal("image"),
    mediaId: IdSchema,
    caption: z.string().max(300).nullable(),
  }),
  z.object({ type: z.literal("gallery"), mediaIds: z.array(IdSchema).min(1) }),
  z.object({
    type: z.literal("quote"),
    text: z.string().min(1).max(1000),
    source: z.string().max(200).nullable(),
  }),
  z.object({ type: z.literal("embed"), provider: EmbedProviderSchema, url: z.url() }),
  z.object({ type: z.literal("cta"), label: TextSchema, href: z.string().min(1).max(500) }),
  z.object({ type: z.literal("file"), mediaId: IdSchema, label: TextSchema }),
]);
export type PageBlock = z.infer<typeof PageBlockSchema>;

export const PageSeoSchema = z.object({
  title: z.string().max(70).nullable(),
  description: z.string().max(170).nullable(),
  ogImageMediaId: IdSchema.nullable(),
});

/**
 * `pages` (SDD §8.2). Rite information pages (FR-010) are pages with `riteKey` set; the request
 * form for a rite is the `FormDefinition` with the same key.
 */
export const PageSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  slug: SlugSchema,
  title: TextSchema,
  blocks: z.array(PageBlockSchema),
  parentId: IdSchema.nullable(),
  riteKey: z.string().min(1).max(60).nullable(),
  seo: PageSeoSchema,
  sort: z.number().int(),
  ...PublishFieldsShape,
  ...TimestampsShape,
});
export type Page = z.infer<typeof PageSchema>;

export const PageInputSchema = z.object({
  id: IdSchema.optional(),
  slug: SlugSchema,
  title: TextSchema,
  blocks: z.array(PageBlockSchema).default([]),
  parentId: IdSchema.nullable().default(null),
  riteKey: z.string().min(1).max(60).nullable().default(null),
  seo: PageSeoSchema.default({ title: null, description: null, ogImageMediaId: null }),
  sort: z.number().int().default(0),
});
export type PageInput = z.input<typeof PageInputSchema>;

/** Lightweight entry for navigation and sitemaps. */
export type PageSummary = Pick<Page, "id" | "slug" | "title" | "parentId" | "riteKey" | "sort">;

/** Module `pages` — static and rite pages. Public reads return only visible pages. */
export interface PageRepo {
  /** @public A visible page by slug, or null. */
  getBySlug(ctx: Ctx, slug: string): Promise<Page | null>;
  /** @public Visible pages as summaries (nav, sitemap), ordered by `sort`, then title. */
  listPublished(ctx: Ctx): Promise<PageSummary[]>;
  /** Admin list incl. drafts (anonymous: visible only). */
  list(ctx: Ctx): Promise<Page[]>;
  /** One by id (anonymous: only if visible). */
  get(ctx: Ctx, id: string): Promise<Page | null>;
  /** Tenant ctx: create/update. CONFLICT on duplicate slug; NOT_FOUND for unknown `parentId`. */
  upsert(ctx: Ctx, input: PageInput): Promise<Page>;
  /** Tenant ctx: publish now or at `at`. */
  publish(ctx: Ctx, id: string, at?: string): Promise<void>;
  /** Tenant ctx: back to draft. */
  unpublish(ctx: Ctx, id: string): Promise<void>;
  /** Tenant ctx: delete. */
  delete(ctx: Ctx, id: string): Promise<void>;
}
