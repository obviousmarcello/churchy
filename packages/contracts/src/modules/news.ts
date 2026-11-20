import { z } from "zod";
import type { ListPage, PageRequest, PublishStatus } from "../common";
import { PublishFieldsShape } from "../common";
import type { Ctx } from "../ctx";
import {
  IdSchema,
  IsoDateTimeSchema,
  RichTextSchema,
  SlugSchema,
  TextSchema,
  TimestampsShape,
} from "../primitives";

/** `posts` (SDD §8.2) — news (*Hírek*, FR-004). Slug unique per tenant. */
export const PostSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  slug: SlugSchema,
  title: TextSchema,
  lead: z.string().max(600),
  body: RichTextSchema,
  coverMediaId: IdSchema.nullable(),
  categories: z.array(z.string().min(1).max(60)),
  expiresAt: IsoDateTimeSchema.nullable(),
  ...PublishFieldsShape,
  ...TimestampsShape,
});
export type Post = z.infer<typeof PostSchema>;

export const PostInputSchema = z.object({
  id: IdSchema.optional(),
  slug: SlugSchema,
  title: TextSchema,
  lead: z.string().max(600).default(""),
  body: RichTextSchema,
  coverMediaId: IdSchema.nullable().default(null),
  categories: z.array(z.string().min(1).max(60)).default([]),
  expiresAt: IsoDateTimeSchema.nullable().default(null),
});
export type PostInput = z.input<typeof PostInputSchema>;

/**
 * Module `news` — posts. Public reads return only visible posts (published, `publishedAt` ≤ now,
 * not expired), newest `publishedAt` first.
 */
export interface PostRepo {
  /** @public Visible posts, newest first, optionally by category (12/page on the site). */
  listPublished(ctx: Ctx, query?: PageRequest & { category?: string }): Promise<ListPage<Post>>;
  /** @public A visible post by slug, or null. */
  getBySlug(ctx: Ctx, slug: string): Promise<Post | null>;
  /** Admin list incl. drafts, newest `updatedAt` first (anonymous: visible posts only). */
  list(ctx: Ctx, query?: PageRequest & { status?: PublishStatus }): Promise<ListPage<Post>>;
  /** One by id (anonymous: only if visible). */
  get(ctx: Ctx, id: string): Promise<Post | null>;
  /** Tenant ctx: create/update. CONFLICT on duplicate slug. */
  upsert(ctx: Ctx, input: PostInput): Promise<Post>;
  /** Tenant ctx: publish now or at `at`. */
  publish(ctx: Ctx, id: string, at?: string): Promise<void>;
  /** Tenant ctx: back to draft. */
  unpublish(ctx: Ctx, id: string): Promise<void>;
  /** Tenant ctx: delete. */
  delete(ctx: Ctx, id: string): Promise<void>;
}
