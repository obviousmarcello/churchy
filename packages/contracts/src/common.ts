import { z } from "zod";
import { IsoDateTimeSchema } from "./primitives";

/** Page request for paginated lists (1-based). */
export const PageRequestSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(20),
});
export type PageRequest = z.input<typeof PageRequestSchema>;

/** A page of results; `total` counts all matching rows. */
export type ListPage<T> = { items: T[]; total: number; page: number; pageSize: number };

/** Slices an already filtered + sorted array into a `ListPage` (helper for adapters). */
export function paginate<T>(rows: readonly T[], request: PageRequest = {}): ListPage<T> {
  const { page, pageSize } = PageRequestSchema.parse(request);
  const start = (page - 1) * pageSize;
  return { items: rows.slice(start, start + pageSize), total: rows.length, page, pageSize };
}

/**
 * Publishing state of website content (D-20). "Scheduled" is `published` with a future
 * `publishedAt`; expiry is modelled per entity (`expiresAt`).
 */
export const PublishStatusSchema = z.enum(["draft", "published"]);
export type PublishStatus = z.infer<typeof PublishStatusSchema>;

export const PublishFieldsShape = {
  status: PublishStatusSchema,
  /** When the item becomes (or became) publicly visible; null while draft. */
  publishedAt: IsoDateTimeSchema.nullable(),
};

/**
 * The single public-visibility predicate for publishable content. Adapters MUST use it (or an
 * equivalent query) for every read with an anonymous ctx.
 */
export function isPubliclyVisible(
  item: { status: PublishStatus | string; publishedAt: string | null; expiresAt?: string | null },
  now: Date,
): boolean {
  if (item.status !== "published" || item.publishedAt === null) return false;
  if (Date.parse(item.publishedAt) > now.getTime()) return false;
  if (item.expiresAt != null && Date.parse(item.expiresAt) <= now.getTime()) return false;
  return true;
}

/** Hungarian collation used for every user-visible sort (L-03). */
export const huCollator = new Intl.Collator("hu", { sensitivity: "base" });

/** Accent- and case-insensitive normalisation for in-memory search (mirrors `unaccent`). */
export function foldForSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}
