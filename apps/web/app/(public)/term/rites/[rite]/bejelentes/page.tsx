import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Alert, PageShell } from "@churchy/ui";
import { RiteContact } from "@/components/pages/rite-contact";
import { SiteHeader } from "@/components/site-header";
import { getT } from "@/i18n/server";
import { ritePath, ritesPath } from "@/lib/pages/public-pages";
import { TERM_ROUTE_HEADER } from "@/lib/term-routes";
import { getPublicSite } from "@/server/public-pages";

/**
 * Request form of a rite (`/szentsegek/keresztelo/bejelentes`, SDD §6). The form itself is D-28;
 * until then this placeholder says it is coming and how to reach the office meanwhile. Not
 * indexed.
 */

type Params = Promise<{ rite: string }>;

async function load(params: Params) {
  const key = decodeURIComponent((await params).rite);
  const site = await getPublicSite();
  if (site === null || !site.config.modules.rites) return null;
  const rite = site.config.rites.find((r) => r.key === key);
  return rite === undefined ? null : { site, rite };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const [data, t] = await Promise.all([load(params), getT("public.rites")]);
  if (data === null) return {};
  return {
    title: t("requestMetaTitle", { rite: data.rite.forms.nom, church: data.site.tenant.name }),
    robots: { index: false },
  };
}

export default async function RiteRequestPage({ params }: { params: Params }) {
  if ((await headers()).get(TERM_ROUTE_HEADER) !== "ritesSection") notFound();
  const [data, t, common] = await Promise.all([load(params), getT("public.rites"), getT("common")]);
  if (data === null) notFound();
  const { site, rite } = data;

  return (
    <PageShell
      skipLinkLabel={common("skipToContent")}
      header={<SiteHeader currentHref={ritesPath(t)} />}
    >
      <div
        className="mx-auto flex w-full max-w-(--content-max) flex-col gap-8 px-(--gutter) py-10"
        data-testid="rite-request"
      >
        <p>
          <a
            href={ritePath(t, rite.key)}
            className="text-fs-2 font-semibold text-primary underline"
          >
            <span aria-hidden="true">← </span>
            {t("requestBack")}
          </a>
        </p>
        <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary">
          {t("requestTitle", { rite: rite.forms.nom })}
        </h1>
        <Alert tone="info" title={t("requestComingTitle")} className="max-w-prose">
          {t("requestComingBody")}
        </Alert>
        <RiteContact tenant={site.tenant} />
      </div>
    </PageShell>
  );
}
