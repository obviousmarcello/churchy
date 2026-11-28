import { cache } from "react";
import type { ListPage, Post } from "@churchy/contracts";
import { NEWS_PAGE_SIZE } from "@/lib/news/public-news";
import { getPublicCtx } from "@/server/public-site";
import { getRequestRepositories } from "@/server/repositories";

/**
 * Data of the public news pages (D-13). Reads go through `PostRepo` with the anonymous tenant
 * ctx, so only visible posts are returned: published, `publishedAt` not in the future and not
 * expired. The repository evaluates that against its clock — in demo mode the visitor's demo
 * clock (`server/clock.ts`), which is how E2E tests move time.
 */

/** One page of visible posts, newest first (12 per page). */
export const listPublicNews = cache(async (page: number): Promise<ListPage<Post>> => {
  const repos = await getRequestRepositories();
  return repos.news.listPublished(await getPublicCtx(), { page, pageSize: NEWS_PAGE_SIZE });
});

/** How many related posts the detail page shows (*Kapcsolódó hírek*, SDD §7.5). */
const RELATED_COUNT = 3;

/** Newest visible posts sharing the post's first category (the post itself excluded). */
export async function listRelatedNews(post: Post): Promise<Post[]> {
  const category = post.categories[0];
  if (category === undefined) return [];
  const repos = await getRequestRepositories();
  const page = await repos.news.listPublished(await getPublicCtx(), {
    category,
    pageSize: RELATED_COUNT + 1,
  });
  return page.items.filter((p) => p.id !== post.id).slice(0, RELATED_COUNT);
}

/** A visible post by slug, or null (drafts, scheduled and expired posts are not found). */
export const getPublicPost = cache(async (slug: string): Promise<Post | null> => {
  const repos = await getRequestRepositories();
  return repos.news.getBySlug(await getPublicCtx(), slug);
});
