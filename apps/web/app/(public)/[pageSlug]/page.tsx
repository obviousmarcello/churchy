import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { PageShell } from "@churchy/ui";
import { PublicBlocks } from "@/components/pages/public-blocks";
import { PublicSiteHeader } from "@/components/site-header";
import { getT } from "@/i18n/server";
import { getTerms } from "@/i18n/terms";
import { canonicalPagePath, isReservedPageSlug, pagePath } from "@/lib/pages/public-pages";
import { getPublicSite, getPublishedPage, listPublishedPages } from "@/server/public-pages";
import { PublicBreadcrumbs } from "@/components/public/public-page-header";

/**
 * Static pages at `/<page-slug>` (*Rólunk*, *Történetünk*…; FR-007, SDD §6, D-16), built from
 * page blocks. Fixed routes (`/hirek`, `/kapcsolat`, …) are matched by Next.js before this dynamic
 * segment, and term slugs (`/miserend`, `/szentsegek/…`) are rewritten by the proxy before
 * routing, so a page can never shadow them; reserved slugs are refused here as well. Rite pages
 * and the rites intro page redirect to their place in the rites section.
 */

type Params = Promise<{ pageSlug: string }>;

async function load(params: Params) {
  const slug = decodeURIComponent((await params).pageSlug);
  const [site, terms] = await Promise.all([getPublicSite(), getTerms()]);
  if (site === null || isReservedPageSlug(slug, terms)) return null;
  const page = await getPublishedPage(slug);
  if (page === null) return null;
  const canonical = canonicalPagePath(page, await listPublishedPages(), terms);
  return { site, page, canonical, path: pagePath(slug) };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const data = await load(params);
  if (data === null || data.canonical !== data.path) return {};
  const t = await getT("public.pages");
  const { page, site } = data;
  return {
    title: t("metaTitle", { title: page.seo.title ?? page.title, church: site.tenant.name }),
    ...(page.seo.description ? { description: page.seo.description } : {}),
    alternates: { canonical: data.path },
  };
}

export default async function StaticPage({ params }: { params: Params }) {
  const data = await load(params);
  if (data === null || data.canonical === null) notFound();
  if (data.canonical !== data.path) permanentRedirect(data.canonical);
  const common = await getT("common");
  const { page } = data;

  return (
    <PageShell
      skipLinkLabel={common("skipToContent")}
      header={<PublicSiteHeader currentHref={data.path} />}
    >
      <article
        className="mx-auto flex w-full max-w-(--content-max) flex-col gap-8 px-(--gutter) py-10"
        data-testid="static-page"
      >
        <PublicBreadcrumbs trail={[]} current={page.title} />
        <h1 className="font-heading text-page-title [font-weight:var(--fw-heading)] tracking-(--heading-tracking) text-balance text-primary">
          {page.title}
        </h1>
        <PublicBlocks blocks={page.blocks} className="max-w-prose" />
      </article>
    </PageShell>
  );
}
