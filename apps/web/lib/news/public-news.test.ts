import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { Post } from "@churchy/contracts";
import { jsonLdScript } from "@/lib/events/json-ld";
import {
  NEWS_PAGE_SIZE,
  facebookShareUrl,
  messengerShareUrl,
  newsArticleJsonLd,
  newsOpenGraph,
  newsPageHref,
  newsPath,
  pageCount,
  parseNewsPage,
} from "./public-news";

/**
 * D-13 AC2: `NewsArticle` structured data and Open Graph metadata validate. The schemas are
 * strict (no unknown properties) and follow schema.org plus Google's Article rich result
 * (headline ≤ 110 chars, ISO-8601 dates with offset, author/publisher Organization with url) and
 * the Open Graph `article` vocabulary.
 */
const IsoInstant = z.iso.datetime({ offset: true });

const OrganizationSchema = z
  .object({ "@type": z.literal("Organization"), name: z.string().min(1), url: z.url() })
  .strict();

const NewsArticleSchema = z
  .object({
    "@context": z.literal("https://schema.org"),
    "@type": z.literal("NewsArticle"),
    headline: z.string().min(1).max(110),
    datePublished: IsoInstant,
    dateModified: IsoInstant,
    author: z.array(OrganizationSchema).min(1),
    publisher: OrganizationSchema,
    mainEntityOfPage: z.object({ "@type": z.literal("WebPage"), "@id": z.url() }).strict(),
    url: z.url(),
    inLanguage: z.literal("hu-HU"),
    isAccessibleForFree: z.literal(true),
    description: z.string().min(1).optional(),
    articleBody: z.string().min(1).optional(),
    keywords: z.string().min(1).optional(),
    image: z.array(z.url()).min(1).optional(),
  })
  .strict()
  .refine((d) => Date.parse(d.dateModified) >= Date.parse(d.datePublished), {
    message: "dateModified before datePublished",
  })
  .refine((d) => d.mainEntityOfPage["@id"] === d.url, { message: "mainEntityOfPage ≠ url" });

const OpenGraphSchema = z
  .object({
    type: z.literal("article"),
    title: z.string().min(1),
    description: z.string().min(1).optional(),
    url: z.url(),
    siteName: z.string().min(1),
    locale: z.literal("hu_HU"),
    publishedTime: IsoInstant,
    modifiedTime: IsoInstant,
    authors: z.array(z.string().min(1)).min(1),
    section: z.string().min(1).optional(),
    tags: z.array(z.string().min(1)).optional(),
    images: z.array(z.url()).min(1).optional(),
  })
  .strict();

function post(overrides: Partial<Post> = {}): Post {
  return {
    id: "post-1",
    tenantId: "t-1",
    slug: "adventi-lelkinap",
    title: "Adventi lelkinap a plébánián",
    lead: "Készüljünk együtt a karácsonyra.",
    body: { type: "doc", content: [] },
    coverMediaId: null,
    categories: ["Lelkiség", "Advent"],
    expiresAt: null,
    status: "published",
    publishedAt: "2026-11-12T08:30:00+01:00",
    createdAt: "2026-11-11T17:00:00+01:00",
    updatedAt: "2026-11-12T08:00:00+01:00",
    ...overrides,
  };
}

const origin = "https://szenttivadar.churchy.hu";
const url = `${origin}/hirek/adventi-lelkinap`;

describe("NewsArticle JSON-LD", () => {
  it("validates against the strict schema with every optional property", () => {
    const data = newsArticleJsonLd({
      post: post(),
      url,
      origin,
      churchName: "Szent Tivadar Plébánia",
      body: "Első bekezdés.\n\nMásodik bekezdés.",
      images: [`${origin}/media/borito.jpg`],
    });
    expect(NewsArticleSchema.safeParse(data).error).toBeUndefined();
    expect(data).toMatchObject({
      headline: "Adventi lelkinap a plébánián",
      // Updated before publishing: the publish time is the modification time too.
      datePublished: "2026-11-12T08:30:00+01:00",
      dateModified: "2026-11-12T08:30:00+01:00",
      keywords: "Lelkiség, Advent",
      description: "Készüljünk együtt a karácsonyra.",
    });
  });

  it("validates the minimal form and shortens long headlines", () => {
    const data = newsArticleJsonLd({
      post: post({
        title: "H".repeat(140),
        lead: " ",
        categories: [],
        updatedAt: "2026-11-13T10:00:00+01:00",
      }),
      url,
      origin,
      churchName: "Szent Tivadar Plébánia",
      body: null,
    });
    expect(NewsArticleSchema.safeParse(data).error).toBeUndefined();
    expect((data.headline as string).length).toBe(110);
    expect(data.dateModified).toBe("2026-11-13T10:00:00+01:00");
    expect(data).not.toHaveProperty("description");
    expect(data).not.toHaveProperty("articleBody");
    expect(data).not.toHaveProperty("keywords");
    expect(data).not.toHaveProperty("image");
  });

  it("falls back to updatedAt without a publish time", () => {
    const data = newsArticleJsonLd({
      post: post({ publishedAt: null }),
      url,
      origin,
      churchName: "X",
      body: null,
    });
    expect(data.datePublished).toBe("2026-11-12T08:00:00+01:00");
    expect(NewsArticleSchema.safeParse(data).error).toBeUndefined();
  });

  it("the strict schema rejects unknown properties and bad dates", () => {
    const data = newsArticleJsonLd({ post: post(), url, origin, churchName: "X", body: null });
    expect(NewsArticleSchema.safeParse({ ...data, extra: 1 }).success).toBe(false);
    expect(NewsArticleSchema.safeParse({ ...data, datePublished: "2026-11-12" }).success).toBe(
      false,
    );
  });

  it("is escaped for the script tag", () => {
    const data = newsArticleJsonLd({
      post: post({ title: "</script><script>alert(1)</script>" }),
      url,
      origin,
      churchName: "X",
      body: null,
    });
    expect(jsonLdScript(data)).not.toContain("</script>");
  });
});

describe("Open Graph", () => {
  it("is a valid article", () => {
    const og = newsOpenGraph({
      post: post(),
      url,
      churchName: "Szent Tivadar Plébánia",
      images: [`${origin}/media/borito.jpg`],
    });
    expect(OpenGraphSchema.safeParse(og).error).toBeUndefined();
    expect(og).toMatchObject({ section: "Lelkiség", tags: ["Lelkiség", "Advent"] });
  });

  it("omits empty optional fields", () => {
    const og = newsOpenGraph({
      post: post({ lead: "", categories: [], publishedAt: null }),
      url,
      churchName: "Szent Tivadar Plébánia",
    });
    expect(OpenGraphSchema.safeParse(og).error).toBeUndefined();
    expect(og).not.toHaveProperty("description");
    expect(og).not.toHaveProperty("section");
    expect(og).not.toHaveProperty("images");
  });
});

describe("paths and pagination", () => {
  it("builds post and page links", () => {
    expect(newsPath({ slug: "adventi-lelkinap" })).toBe("/hirek/adventi-lelkinap");
    expect(newsPageHref(1)).toBe("/hirek");
    expect(newsPageHref(0)).toBe("/hirek");
    expect(newsPageHref(2)).toBe("/hirek?oldal=2");
  });

  it("parses ?oldal= defensively", () => {
    expect(parseNewsPage(undefined)).toBe(1);
    expect(parseNewsPage("2")).toBe(2);
    expect(parseNewsPage(["2", "3"])).toBe(1);
    for (const bad of ["0", "-1", "1.5", "abc", "02", "99999", ""]) {
      expect(parseNewsPage(bad), bad).toBe(1);
    }
  });

  it("counts pages of 12", () => {
    expect(NEWS_PAGE_SIZE).toBe(12);
    expect(pageCount(0)).toBe(1);
    expect(pageCount(12)).toBe(1);
    expect(pageCount(13)).toBe(2);
    expect(pageCount(25, 12)).toBe(3);
  });
});

describe("share links", () => {
  it("are plain URLs with the encoded post URL", () => {
    expect(facebookShareUrl(url)).toBe(
      "https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fszenttivadar.churchy.hu%2Fhirek%2Fadventi-lelkinap",
    );
    expect(messengerShareUrl(url)).toBe(
      "fb-messenger://share/?link=https%3A%2F%2Fszenttivadar.churchy.hu%2Fhirek%2Fadventi-lelkinap",
    );
  });
});
