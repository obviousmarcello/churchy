import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { richTextPlain } from "@churchy/events";
import { Badge, Card, FormattedDate, PageShell, RichTextContent } from "@churchy/ui";
import { LINK_CLASS } from "@/components/events/event-parts";
import { ShareLinks } from "@/components/news/share-links";
import { SiteHeader } from "@/components/site-header";
import { getT } from "@/i18n/server";
import { jsonLdScript } from "@/lib/events/json-ld";
import { NEWS_PATH, newsArticleJsonLd, newsOpenGraph, newsPath } from "@/lib/news/public-news";
import { getPublicTenantName, requestOrigin } from "@/server/public-events";
import { getPublicPost, listRelatedNews } from "@/server/public-news";

type Params = Promise<{ postSlug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { postSlug } = await params;
  const post = await getPublicPost(decodeURIComponent(postSlug));
  if (post === null) return {};
  const [t, church, origin] = await Promise.all([
    getT("public.news"),
    getPublicTenantName(),
    requestOrigin(),
  ]);
  const url = `${origin}${newsPath(post)}`;
  return {
    title: t("postMetaTitle", { title: post.title, church }),
    ...(post.lead ? { description: post.lead } : {}),
    alternates: { canonical: newsPath(post) },
    openGraph: newsOpenGraph({ post, url, churchName: church }),
  };
}

export default async function NewsPostPage({ params }: { params: Params }) {
  const { postSlug } = await params;
  const post = await getPublicPost(decodeURIComponent(postSlug));
  if (post === null) notFound();

  const [t, common, church, origin, related] = await Promise.all([
    getT("public.news"),
    getT("common"),
    getPublicTenantName(),
    requestOrigin(),
    listRelatedNews(post),
  ]);
  const url = `${origin}${newsPath(post)}`;
  const body = richTextPlain(post.body);
  const jsonLd = newsArticleJsonLd({
    post,
    url,
    origin,
    churchName: church,
    body: body === "" ? null : body,
  });

  return (
    <PageShell
      skipLinkLabel={common("skipToContent")}
      header={<SiteHeader currentHref={NEWS_PATH} />}
    >
      <script
        type="application/ld+json"
        // Built from public fields only and escaped by `jsonLdScript` (no user HTML).
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />
      <article className="mx-auto flex w-full max-w-(--content-max) flex-col gap-8 px-(--gutter) py-10">
        <p>
          <a href={NEWS_PATH} className={`${LINK_CLASS} text-fs-2`}>
            <span aria-hidden="true">← </span>
            {t("back")}
          </a>
        </p>
        <header className="flex max-w-prose flex-col gap-4">
          {post.categories.length > 0 ? (
            <ul aria-label={t("categories")} className="flex flex-wrap gap-2">
              {post.categories.map((c) => (
                <li key={c}>
                  <Badge>{c}</Badge>
                </li>
              ))}
            </ul>
          ) : null}
          <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary">
            {post.title}
          </h1>
          {post.publishedAt ? (
            <p className="text-fs-3 text-muted">
              {t("publishedOn")}{" "}
              <FormattedDate value={post.publishedAt} data-testid="news-published" />
            </p>
          ) : null}
          {post.lead ? <p className="text-fs-5 leading-snug">{post.lead}</p> : null}
        </header>

        <RichTextContent doc={post.body} className="max-w-prose" />

        <div className="max-w-prose border-t border-border pt-6">
          <ShareLinks url={url} headingId="news-share" />
        </div>

        {related.length > 0 ? (
          <section aria-labelledby="news-related" className="flex flex-col gap-4">
            <h2 id="news-related" className="font-heading text-fs-5 font-bold">
              {t("relatedHeading")}
            </h2>
            <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" data-testid="news-related">
              {related.map((r) => (
                <Card key={r.id} as="li" title={r.title} headingLevel={3} href={newsPath(r)}>
                  {r.publishedAt ? (
                    <FormattedDate value={r.publishedAt} className="text-fs-2 text-muted" />
                  ) : null}
                </Card>
              ))}
            </ul>
          </section>
        ) : null}
      </article>
    </PageShell>
  );
}
