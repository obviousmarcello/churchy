import { cache } from "react";
import type { Page, PageSummary, PublicPerson } from "@churchy/contracts";
import { blockMedia, blockMediaIds } from "@/lib/pages/public-pages";
import {
  getPublicAnnouncementSite,
  type PublicAnnouncementSite,
} from "@/server/public-announcements";
import { getPublicCtx } from "@/server/public-site";
import { getRequestRepositories } from "@/server/repositories";

/**
 * Data for the public static, staff and rite pages (D-16). Everything goes through the repository
 * interfaces with an anonymous tenant ctx, so drafts, non-public people and private files are
 * never read.
 */

/** The current church and its effective configuration (shared with the other public pages). */
export type PublicSite = PublicAnnouncementSite;

export const getPublicSite = getPublicAnnouncementSite;

/** Visible pages of the current church, in `sort` order (memoized per request). */
export const listPublishedPages = cache(async (): Promise<PageSummary[]> => {
  const [ctx, repos] = await Promise.all([getPublicCtx(), getRequestRepositories()]);
  return repos.pages.listPublished(ctx);
});

/** A visible page by slug (memoized per request). */
export const getPublishedPage = cache(async (slug: string): Promise<Page | null> => {
  const [ctx, repos] = await Promise.all([getPublicCtx(), getRequestRepositories()]);
  return repos.pages.getBySlug(ctx, slug);
});

/** The visible information page of a rite (`riteKey`), if the church wrote one. */
export async function getRitePage(riteKey: string): Promise<Page | null> {
  const summary = (await listPublishedPages()).find((p) => p.riteKey === riteKey);
  return summary ? getPublishedPage(summary.slug) : null;
}

/** Public images and files that the blocks of `page` refer to. */
export async function getBlockMedia(page: Pick<Page, "blocks">) {
  const ids = blockMediaIds(page.blocks);
  if (ids.length === 0) return blockMedia([]);
  const [ctx, repos] = await Promise.all([getPublicCtx(), getRequestRepositories()]);
  return blockMedia(await repos.media.getMany(ctx, ids));
}

/** Active people marked public, by staff group then `sort`, with public contact fields only. */
export const listPublicStaff = cache(async (): Promise<PublicPerson[]> => {
  const [ctx, repos] = await Promise.all([getPublicCtx(), getRequestRepositories()]);
  return repos.people.listPublicStaff(ctx);
});
