import type { Metadata } from "next";
import { PageShell } from "@churchy/ui";
import { SiteHeader } from "@/components/site-header";
import { getT } from "@/i18n/server";
import { CONTACT_PATH } from "@/lib/seo";
import { getPublicTenantName } from "@/server/public-events";

/**
 * Placeholder of a legal page (`/impresszum`, `/adatkezeles`; SDD §6, FR-109). The real texts are
 * generated from the church's legal data (PRD C-01 *Impresszum*, C-02 *Adatkezelési tájékoztató*;
 * SDD §14) by the legal-pages deliverable; until then the footer links land on a page that says
 * so, and no legal text is invented here.
 */
export type LegalPage = "impresszum" | "privacy";

const TITLE_KEY = { impresszum: "impresszumTitle", privacy: "privacyTitle" } as const;

export async function legalMetadata(page: LegalPage, path: string): Promise<Metadata> {
  const [t, church] = await Promise.all([getT("public.legal"), getPublicTenantName()]);
  return {
    title: t("metaTitle", { title: t(TITLE_KEY[page]), church }),
    alternates: { canonical: path },
  };
}

export async function LegalPlaceholder({ page }: { page: LegalPage }) {
  const [t, common] = await Promise.all([getT("public.legal"), getT("common")]);
  return (
    <PageShell skipLinkLabel={common("skipToContent")} header={<SiteHeader />}>
      <div className="mx-auto grid w-full max-w-(--content-max) gap-6 px-(--gutter) py-10">
        <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary">
          {t(TITLE_KEY[page])}
        </h1>
        <div className="grid max-w-prose gap-3 text-fs-3" data-testid="legal-placeholder">
          <p className="font-semibold">{t("comingSoon")}</p>
          <p className="text-muted">{t("comingSoonNote")}</p>
          <p>
            <a href={CONTACT_PATH} className="text-primary underline">
              {t("contactLink")}
            </a>
          </p>
        </div>
      </div>
    </PageShell>
  );
}
