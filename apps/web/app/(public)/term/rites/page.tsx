import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Card, PageShell, SectionHeading } from "@churchy/ui";
import { PublicBlocks } from "@/components/pages/public-blocks";
import { RiteContact } from "@/components/pages/rite-contact";
import { PublicSiteHeader } from "@/components/site-header";
import { getT } from "@/i18n/server";
import { ritePath, ritesPath, ritesSectionPage } from "@/lib/pages/public-pages";
import { TERM_ROUTE_HEADER } from "@/lib/term-routes";
import { getPublicSite, getPublishedPage, listPublishedPages } from "@/server/public-pages";
import { PublicPageHeader } from "@/components/public/public-page-header";
import { getSiteHref } from "@/server/site-base";

/**
 * The rites section (*Szentségek*, Reformed *Alkalmak*, Baptist *Életesemények*; FR-010, SDD §6,
 * §7.4, D-16): one entry per rite of the church's preset (Catholic 6, Reformed 4, Baptist 4),
 * titled with the preset's term, plus the intro page the church wrote for the section.
 *
 * Reached through the tenant's term slug, which the proxy rewrites to this internal route
 * (`lib/term-routes.ts`, section route).
 */

export async function generateMetadata(): Promise<Metadata> {
  const [t, site, siteHref] = await Promise.all([
    getT("public.rites"),
    getPublicSite(),
    getSiteHref(),
  ]);
  return {
    title: t("metaTitle", { church: site?.tenant.name ?? "" }),
    description: t("metaDescription"),
    alternates: { canonical: siteHref(ritesPath(t)) },
  };
}

export default async function RitesPage() {
  if ((await headers()).get(TERM_ROUTE_HEADER) !== "ritesSection") notFound();
  const [site, t, common, pages, siteHref] = await Promise.all([
    getPublicSite(),
    getT("public.rites"),
    getT("common"),
    listPublishedPages(),
    getSiteHref(),
  ]);
  if (site === null || !site.config.modules.rites) notFound();
  const introSummary = ritesSectionPage(pages);
  const intro = introSummary ? await getPublishedPage(introSummary.slug) : null;
  const path = ritesPath(t);

  return (
    <PageShell
      skipLinkLabel={common("skipToContent")}
      header={<PublicSiteHeader currentHref={path} />}
    >
      <div className="mx-auto flex w-full max-w-(--content-max) flex-col gap-10 px-(--gutter) py-10">
        <PublicPageHeader
          title={t("title")}
          {...(intro ? { lead: <PublicBlocks blocks={intro.blocks} /> } : {})}
        />

        <section aria-labelledby="rites-list" className="flex flex-col gap-5">
          <SectionHeading id="rites-list" title={t("listHeading")} />
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" data-testid="rites-list">
            {site.config.rites.map((rite) => (
              <Card
                key={rite.key}
                as="li"
                title={rite.forms.nom}
                headingLevel={3}
                href={siteHref(ritePath(t, rite.key))}
                footer={<span className="text-fs-2 text-muted">{t("readMore")}</span>}
              />
            ))}
          </ul>
        </section>

        <RiteContact tenant={site.tenant} />
      </div>
    </PageShell>
  );
}
