import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { richTextPlain } from "@churchy/events";
import { ArrowLeftIcon, Card, FormattedDate, PageShell } from "@churchy/ui";
import { PublicBreadcrumbs } from "@/components/public/public-page-header";
import { LINK_CLASS } from "@/components/events/event-parts";
import { NewsArticleBody } from "@/components/news/news-article";
import { ShareLinks } from "@/components/news/share-links";
import { PublicSiteHeader } from "@/components/site-header";
import { getT } from "@/i18n/server";
import { jsonLdScript } from "@/lib/events/json-ld";
import { NEWS_PATH, newsArticleJsonLd, newsOpenGraph, newsPath } from "@/lib/news/public-news";
import { getPublicTenantName } from "@/server/public-events";
import { getPublicPost, listRelatedNews } from "@/server/public-news";
import { requirePublicModule } from "@/server/plans";
import { getSiteHref, siteOrigin } from "@/server/site-base";

type Params = Promise<{ postSlug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { postSlug } = await params;
  const post = await getPublicPost(decodeURIComponent(postSlug));
  if (post === null) return {};
  const [t, church, origin, siteHref] = await Promise.all([
    getT("public.news"),
    getPublicTenantName(),
    siteOrigin(),
    getSiteHref(),
  ]);
  const url = `${origin}${newsPath(post)}`;
  return {
    title: t("postMetaTitle", { title: post.title, church }),
    ...(post.lead ? { description: post.lead } : {}),
    alternates: { canonical: siteHref(newsPath(post)) },
    openGraph: newsOpenGraph({ post, url, churchName: church }),
  };
}

export default async function NewsPostPage({ params }: { params: Params }) {
  await requirePublicModule("news");
  const { postSlug } = await params;
  const post = await getPublicPost(decodeURIComponent(postSlug));
  if (post === null) notFound();

  const [t, common, church, origin, related, siteHref] = await Promise.all([
    getT("public.news"),
    getT("common"),
    getPublicTenantName(),
    siteOrigin(),
    listRelatedNews(post),
    getSiteHref(),
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
      header={<PublicSiteHeader currentHref={NEWS_PATH} />}
    >
      <script
        type="application/ld+json"
        // Built from public fields only and escaped by `jsonLdScript` (no user HTML).
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />
      <article className="mx-auto flex w-full max-w-(--content-max) flex-col gap-8 px-(--gutter) pt-6 pb-16 lg:pt-8">
        <PublicBreadcrumbs trail={[{ label: t("title"), href: NEWS_PATH }]} current={post.title} />
        <NewsArticleBody post={post} />

        <div className="flex max-w-prose flex-col gap-4 border-t border-divider pt-6">
          <ShareLinks url={url} headingId="news-share" />
          <p>
            <a
              href={siteHref(NEWS_PATH)}
              className={`${LINK_CLASS} inline-flex items-center gap-1.5 text-fs-2`}
            >
              <ArrowLeftIcon size="sm" />
              {t("back")}
            </a>
          </p>
        </div>

        {related.length > 0 ? (
          <section aria-labelledby="news-related" className="flex flex-col gap-4 pt-4">
            <h2
              id="news-related"
              className="font-heading text-section-title [font-weight:var(--fw-heading)] text-primary"
            >
              {t("relatedHeading")}
            </h2>
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" data-testid="news-related">
              {related.map((r) => (
                <Card
                  key={r.id}
                  as="li"
                  title={r.title}
                  headingLevel={3}
                  href={siteHref(newsPath(r))}
                  className="h-full"
                >
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
