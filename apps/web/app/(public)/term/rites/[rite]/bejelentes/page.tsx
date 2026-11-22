import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Alert, PageShell } from "@churchy/ui";
import { RiteContact } from "@/components/pages/rite-contact";
import { RequestForm } from "@/components/public/request-form";
import { PublicSiteHeader } from "@/components/site-header";
import { getT } from "@/i18n/server";
import { ritePath, ritesPath } from "@/lib/pages/public-pages";
import { TERM_ROUTE_HEADER } from "@/lib/term-routes";
import { getPublicSite } from "@/server/public-pages";
import { getPublicCtx } from "@/server/public-site";
import { getRequestRepositories } from "@/server/repositories";
import { renderStamp } from "@/server/request-limiter";
import { submitRequest } from "./actions";
import { PublicBreadcrumbs } from "@/components/public/public-page-header";
import { getSiteHref } from "@/server/site-base";

/**
 * Request form of a rite (`/szentsegek/keresztelo/bejelentes`, SDD §6, D-28). The form is the
 * church's form definition with the rite's key (the admin configures its fields); when there is
 * none (or it is switched off) the visitor is pointed to the office. Not indexed.
 */

type Params = Promise<{ rite: string }>;

/** Privacy notice (SDD §6 legal pages). */
const PRIVACY_PATH = "/adatkezeles";

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
  const [data, t, common, siteHref] = await Promise.all([
    load(params),
    getT("public.rites"),
    getT("common"),
    getSiteHref(),
  ]);
  if (data === null) notFound();
  const { site, rite } = data;
  const [repos, ctx] = await Promise.all([getRequestRepositories(), getPublicCtx()]);
  const form = await repos.requests.getForm(ctx, rite.key);
  const backHref = siteHref(ritePath(t, rite.key));

  return (
    <PageShell
      skipLinkLabel={common("skipToContent")}
      header={<PublicSiteHeader currentHref={ritesPath(t)} />}
    >
      <div
        className="mx-auto flex w-full max-w-(--content-max) flex-col gap-8 px-(--gutter) py-10"
        data-testid="rite-request"
      >
        <PublicBreadcrumbs
          trail={[
            { label: t("title"), href: ritesPath(t) },
            { label: rite.forms.nom, href: ritePath(t, rite.key) },
          ]}
          current={t("requestTitle", { rite: rite.forms.nom })}
        />
        <h1 className="font-heading text-page-title [font-weight:var(--fw-heading)] tracking-(--heading-tracking) text-balance text-primary">
          {t("requestTitle", { rite: rite.forms.nom })}
        </h1>
        {form === null || !form.active ? (
          <>
            <Alert tone="info" title={t("requestComingTitle")} className="max-w-prose">
              {t("requestComingBody")}
            </Alert>
            <RiteContact tenant={site.tenant} />
          </>
        ) : (
          <>
            <p className="max-w-prose text-fs-4">{t("request.intro")}</p>
            <RequestForm
              definition={{ key: form.key, fields: form.fields }}
              action={submitRequest}
              startedAt={renderStamp()}
              privacyHref={siteHref(PRIVACY_PATH)}
              backHref={backHref}
            />
            <RiteContact tenant={site.tenant} />
          </>
        )}
      </div>
    </PageShell>
  );
}
