import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Post } from "@churchy/contracts";
import { Card, FormattedDate, PageShell, cn } from "@churchy/ui";
import { LINK_CLASS } from "@/components/events/event-parts";
import { SiteHeader } from "@/components/site-header";
import { getT } from "@/i18n/server";
import {
  NEWS_PATH,
  newsPageHref,
  newsPath,
  pageCount,
  parseNewsPage,
} from "@/lib/news/public-news";
import { getPublicTenantName } from "@/server/public-events";
import { listPublicNews } from "@/server/public-news";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const page = parseNewsPage((await searchParams).oldal);
  const [t, church] = await Promise.all([getT("public.news"), getPublicTenantName()]);
  return {
    title: page > 1 ? t("metaTitlePaged", { page, church }) : t("metaTitle", { church }),
    description: t("lead"),
    alternates: { canonical: newsPageHref(page) },
  };
}

function PostDate({ post }: { post: Post }) {
  if (post.publishedAt === null) return null;
  return <FormattedDate value={post.publishedAt} className="text-fs-2 font-semibold text-muted" />;
}

export default async function NewsListPage({ searchParams }: { searchParams: SearchParams }) {
  const requested = parseNewsPage((await searchParams).oldal);
  const [t, common, result] = await Promise.all([
    getT("public.news"),
    getT("common"),
    listPublicNews(requested),
  ]);
  const pages = pageCount(result.total, result.pageSize);
  // Past the last page: a 404, except page 1 of an empty list (shown with its empty state).
  if (requested > pages) notFound();

  return (
    <PageShell
      skipLinkLabel={common("skipToContent")}
      header={<SiteHeader currentHref={NEWS_PATH} />}
    >
      <div className="mx-auto flex w-full max-w-(--content-max) flex-col gap-10 px-(--gutter) py-10">
        <header className="flex flex-col gap-4">
          <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary">
            {t("title")}
          </h1>
          <p className="max-w-prose text-fs-4 text-muted">{t("lead")}</p>
        </header>

        <section aria-labelledby="news-list-title" className="flex flex-col gap-6">
          <h2 id="news-list-title" className="sr-only">
            {t("listHeading")}
          </h2>
          {result.items.length === 0 ? (
            <p className="text-fs-4 text-muted">{t("empty")}</p>
          ) : (
            <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" data-testid="news-list">
              {result.items.map((post) => (
                <Card
                  key={post.id}
                  as="li"
                  title={post.title}
                  headingLevel={3}
                  href={newsPath(post)}
                  {...(post.categories.length > 0 ? { eyebrow: post.categories.join(" · ") } : {})}
                  className="h-full"
                >
                  <div
                    className="flex flex-col gap-2"
                    data-testid="news-item"
                    data-slug={post.slug}
                    data-published={post.publishedAt ?? undefined}
                  >
                    <PostDate post={post} />
                    {post.lead ? <p>{post.lead}</p> : null}
                  </div>
                </Card>
              ))}
            </ul>
          )}
        </section>

        {pages > 1 ? (
          <nav aria-label={t("pagination")} className="flex flex-col items-center gap-3">
            <p className="text-fs-3 text-muted" data-testid="news-page-status">
              {t("pageStatus", { page: requested, pages })}
            </p>
            <ul className="flex flex-wrap items-center justify-center gap-2">
              {requested > 1 ? (
                <li>
                  <a
                    href={newsPageHref(requested - 1)}
                    rel="prev"
                    className={cn(
                      LINK_CLASS,
                      "inline-flex min-h-(--control-h-sm) items-center px-3 text-fs-3",
                    )}
                  >
                    <span aria-hidden="true">← </span>
                    {t("prevPage")}
                  </a>
                </li>
              ) : null}
              {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
                <li key={n}>
                  <a
                    href={newsPageHref(n)}
                    aria-current={n === requested ? "page" : undefined}
                    aria-label={t("pageLink", { page: n })}
                    className={cn(
                      "inline-flex min-h-(--control-h-sm) min-w-(--control-h-sm) items-center justify-center rounded-sm border-2 px-3 text-fs-3 font-semibold no-underline",
                      n === requested
                        ? "border-primary bg-primary text-primary-contrast"
                        : "border-border text-primary hover:bg-primary-soft",
                    )}
                  >
                    {n}
                  </a>
                </li>
              ))}
              {requested < pages ? (
                <li>
                  <a
                    href={newsPageHref(requested + 1)}
                    rel="next"
                    className={cn(
                      LINK_CLASS,
                      "inline-flex min-h-(--control-h-sm) items-center px-3 text-fs-3",
                    )}
                  >
                    {t("nextPage")}
                    <span aria-hidden="true"> →</span>
                  </a>
                </li>
              ) : null}
            </ul>
          </nav>
        ) : null}
      </div>
    </PageShell>
  );
}
