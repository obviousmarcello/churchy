import type { Post } from "@churchy/contracts";

/**
 * Pure helpers of the public news pages (D-13, SDD §7.5): paths, pagination, share links and the
 * schema.org `NewsArticle` structured data. Only public post fields are used.
 */

/** Posts per list page (D-13 AC1). */
export const NEWS_PAGE_SIZE = 12;

export const NEWS_PATH = "/hirek";

export function newsPath(post: Pick<Post, "slug">): string {
  return `${NEWS_PATH}/${encodeURIComponent(post.slug)}`;
}

/** List page link: page 1 is the bare `/hirek`, later pages `?oldal=n`. */
export function newsPageHref(page: number): string {
  return page <= 1 ? NEWS_PATH : `${NEWS_PATH}?oldal=${page}`;
}

/** The requested page from `?oldal=`: a positive integer, else 1. */
export function parseNewsPage(value: string | string[] | undefined): number {
  if (typeof value !== "string" || !/^[1-9]\d{0,3}$/.test(value)) return 1;
  return Number(value);
}

export function pageCount(total: number, pageSize: number = NEWS_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

// ---------------------------------------------------------------------------------------------
// Share links (D-13 AC3): plain links and the clipboard — no third-party script is ever loaded.
// ---------------------------------------------------------------------------------------------

/** Facebook's sharer page (a plain link; Facebook reads the Open Graph tags of `url`). */
export function facebookShareUrl(url: string): string {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
}

/**
 * Messenger's share deep link. It opens the Messenger app (phones, desktop app); the web
 * "send" dialog would need a Facebook app id, which the platform does not have.
 */
export function messengerShareUrl(url: string): string {
  return `fb-messenger://share/?link=${encodeURIComponent(url)}`;
}

// ---------------------------------------------------------------------------------------------
// Structured data
// ---------------------------------------------------------------------------------------------

export interface NewsJsonLdInput {
  post: Pick<Post, "title" | "lead" | "categories" | "publishedAt" | "updatedAt">;
  /** Absolute URL of the post page. */
  url: string;
  /** `https://host` of the public site. */
  origin: string;
  /** Church name: author and publisher. */
  churchName: string;
  /** Plain-text body (for `articleBody`), or null. */
  body: string | null;
  /** Absolute image URLs (none in Phase A: media is not served yet). */
  images?: string[];
}

/** The later of two ISO instants (a post updated before it was published shows its publish time). */
function later(a: string, b: string): string {
  return Date.parse(b) > Date.parse(a) ? b : a;
}

/** schema.org `NewsArticle` for the post detail page (D-13 AC2). */
export function newsArticleJsonLd({
  post,
  url,
  origin,
  churchName,
  body,
  images = [],
}: NewsJsonLdInput): Record<string, unknown> {
  const published = post.publishedAt ?? post.updatedAt;
  const organization = { "@type": "Organization", name: churchName, url: origin };
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: post.title.length > 110 ? `${post.title.slice(0, 109)}…` : post.title,
    datePublished: published,
    dateModified: later(published, post.updatedAt),
    author: [organization],
    publisher: organization,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    url,
    inLanguage: "hu-HU",
    isAccessibleForFree: true,
  };
  if (post.lead.trim() !== "") data.description = post.lead;
  if (body) data.articleBody = body;
  if (post.categories.length > 0) data.keywords = post.categories.join(", ");
  if (images.length > 0) data.image = images;
  return data;
}

export interface NewsOpenGraphInput {
  post: Pick<Post, "title" | "lead" | "categories" | "publishedAt" | "updatedAt">;
  url: string;
  churchName: string;
  /** Absolute image URLs (none in Phase A). */
  images?: string[];
}

/**
 * Open Graph `article` metadata of a post (Next's `metadata.openGraph`; also what Facebook and
 * Messenger read when the share links are used).
 */
export function newsOpenGraph({ post, url, churchName, images = [] }: NewsOpenGraphInput) {
  const published = post.publishedAt ?? post.updatedAt;
  return {
    type: "article" as const,
    title: post.title,
    ...(post.lead.trim() !== "" ? { description: post.lead } : {}),
    url,
    siteName: churchName,
    locale: "hu_HU",
    publishedTime: published,
    modifiedTime: later(published, post.updatedAt),
    authors: [churchName],
    ...(post.categories.length > 0
      ? { section: post.categories[0], tags: [...post.categories] }
      : {}),
    ...(images.length > 0 ? { images } : {}),
  };
}
