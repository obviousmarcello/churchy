import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { PageShell, buttonClasses } from "@churchy/ui";
import { PublicBlocks } from "@/components/pages/public-blocks";
import { RiteContact } from "@/components/pages/rite-contact";
import { SiteHeader } from "@/components/site-header";
import { getT } from "@/i18n/server";
import { hasCtaTo, ritePath, riteRequestPath, ritesPath } from "@/lib/pages/public-pages";
import { TERM_ROUTE_HEADER } from "@/lib/term-routes";
import { getPublicSite, getRitePage } from "@/server/public-pages";

/**
 * A rite information page (FR-010, SDD §7.4, D-16), e.g. `/szentsegek/keresztelo` or
 * `/alkalmak/konfirmacio`. Only rites of the church's preset exist; the title is the preset's term,
 * the body the page the church wrote for the rite (*Mikor és hogyan?*, *Szükséges dokumentumok*,
 * *Felkészítés*, …). The request button leads to the rite's request form (D-28) unless the content
 * already links there; a *Kapcsolat* section closes the page.
 */

type Params = Promise<{ rite: string }>;

async function load(params: Params) {
  const key = decodeURIComponent((await params).rite);
  const site = await getPublicSite();
  if (site === null || !site.config.modules.rites) return null;
  const rite = site.config.rites.find((r) => r.key === key);
  if (rite === undefined) return null;
  return { site, rite, page: await getRitePage(rite.key) };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const [data, t] = await Promise.all([load(params), getT("public.rites")]);
  if (data === null) return {};
  return {
    title: t("riteMetaTitle", { rite: data.rite.forms.nom, church: data.site.tenant.name }),
    ...(data.page?.seo.description ? { description: data.page.seo.description } : {}),
    alternates: { canonical: ritePath(t, data.rite.key) },
  };
}

export default async function RitePage({ params }: { params: Params }) {
  if ((await headers()).get(TERM_ROUTE_HEADER) !== "ritesSection") notFound();
  const [data, t, common] = await Promise.all([load(params), getT("public.rites"), getT("common")]);
  if (data === null) notFound();
  const { site, rite, page } = data;
  const blocks = page?.blocks ?? [];
  const requestPath = riteRequestPath(t, rite.key);
  const sectionPath = ritesPath(t);

  return (
    <PageShell
      skipLinkLabel={common("skipToContent")}
      header={<SiteHeader currentHref={sectionPath} />}
    >
      <article
        className="mx-auto flex w-full max-w-(--content-max) flex-col gap-8 px-(--gutter) py-10"
        data-testid="rite-page"
      >
        <p>
          <a href={sectionPath} className="text-fs-2 font-semibold text-primary underline">
            <span aria-hidden="true">← </span>
            {t("back")}
          </a>
        </p>
        <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary">
          {rite.forms.nom}
        </h1>
        {blocks.length > 0 ? (
          <PublicBlocks blocks={blocks} className="max-w-prose" />
        ) : (
          <p className="max-w-prose text-fs-4">{t("fallbackIntro")}</p>
        )}
        {hasCtaTo(blocks, requestPath) ? null : (
          <p>
            <a href={requestPath} className={buttonClasses({ size: "lg" })}>
              {t("requestButton")}
            </a>
          </p>
        )}
        <RiteContact tenant={site.tenant} />
      </article>
    </PageShell>
  );
}
