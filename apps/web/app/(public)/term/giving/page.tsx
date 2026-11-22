import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { formatDateLong } from "@churchy/hu";
import { BankAccount, PageShell, SectionHeading } from "@churchy/ui";
import { CopyButton } from "@/components/public/copy-button";
import { PublicSiteHeader } from "@/components/site-header";
import { getT } from "@/i18n/server";
import { qrSvg, supportDetails } from "@/lib/giving";
import { TERM_ROUTE_HEADER, termRoutePath } from "@/lib/term-routes";
import { getPublicSite } from "@/server/public-seo";
import { PublicPageHeader } from "@/components/public/public-page-header";

/**
 * Support / giving page (FR-015, SDD §7.5, D-17): the church's account number (8-8-8) with a copy
 * button, the payment reference, the instant-payment QR code (MNB standard, rendered on the
 * server as inline SVG, no script) and the 1 % (*SZJA 1+1 %*) section. Title and path follow the
 * `givingSection` term (`/tamogatas`): the proxy rewrites the tenant's slug to this internal route
 * (`lib/term-routes.ts`).
 */

async function load() {
  const site = await getPublicSite();
  if (site === null || !site.config.modules.giving) return null;
  return {
    church: site.tenant.name,
    details: supportDetails(site.config.giving, site.tenant.name, new Date()),
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const [t, site] = await Promise.all([getT("public.giving"), getPublicSite()]);
  return {
    title: t("metaTitle", { church: site?.tenant.name ?? "" }),
    description: t("metaDescription"),
    alternates: { canonical: termRoutePath(t, "givingSection") },
  };
}

const DT = "text-fs-2 font-semibold tracking-wide text-muted uppercase";
// Body font with lining, tabular figures: account and tax numbers must read unambiguously.
const DD = "font-body text-fs-5 font-bold tracking-wide tabular-nums lining-nums break-words";

export default async function GivingPage() {
  // Only reachable through the public term slug, never at the internal path.
  if ((await headers()).get(TERM_ROUTE_HEADER) !== "givingSection") notFound();

  const [data, t, common] = await Promise.all([load(), getT("public.giving"), getT("common")]);
  if (data === null) notFound();
  const { details } = data;
  const hasTransfer = details.accountNumber !== null;
  const hasSzja = details.technicalNumber !== null || details.foundationTaxNumber !== null;
  const qr = details.qrPayload ? qrSvg(details.qrPayload) : null;

  return (
    <PageShell
      skipLinkLabel={common("skipToContent")}
      header={<PublicSiteHeader currentHref={termRoutePath(t, "givingSection")} />}
    >
      <div className="mx-auto grid w-full max-w-(--content-max) gap-12 px-(--gutter) py-10">
        <PublicPageHeader title={t("title")} lead={t("lead")} />

        {!hasTransfer && !hasSzja ? (
          <p className="text-fs-3" data-testid="giving-empty">
            {t("noDetails")}
          </p>
        ) : null}

        {hasTransfer ? (
          <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
            <section aria-labelledby="giving-transfer" className="grid content-start gap-5">
              <SectionHeading id="giving-transfer" title={t("transferHeading")} />
              <dl className="grid gap-5" data-testid="giving-transfer">
                {details.accountName ? (
                  <div className="grid gap-1">
                    <dt className={DT}>{t("beneficiary")}</dt>
                    <dd className="text-fs-4 font-semibold" data-testid="giving-beneficiary">
                      {details.accountName}
                    </dd>
                  </div>
                ) : null}
                <div className="grid gap-2">
                  <dt className={DT}>{t("accountNumber")}</dt>
                  <dd className="grid gap-2">
                    <BankAccount
                      value={details.accountNumber!}
                      className={DD}
                      data-testid="giving-account"
                    />
                    <span className="print:hidden">
                      <CopyButton
                        value={details.accountNumber!}
                        label={t("copyAccount")}
                        testId="copy-account"
                      />
                    </span>
                  </dd>
                </div>
                {details.iban ? (
                  <div className="grid gap-1">
                    <dt className={DT}>{t("iban")}</dt>
                    <dd>
                      <BankAccount
                        value={details.iban}
                        format="iban"
                        className="text-fs-3"
                        data-testid="giving-iban"
                      />
                    </dd>
                  </div>
                ) : null}
                {details.reference ? (
                  <div className="grid gap-2">
                    <dt className={DT}>{t("reference")}</dt>
                    <dd className="grid gap-2">
                      <span className={DD} data-testid="giving-reference">
                        {details.reference}
                      </span>
                      <span className="text-fs-2 text-muted">{t("referenceHint")}</span>
                      <span className="print:hidden">
                        <CopyButton
                          value={details.reference}
                          label={t("copyReference")}
                          testId="copy-reference"
                        />
                      </span>
                    </dd>
                  </div>
                ) : null}
              </dl>
            </section>

            {qr ? (
              <section
                aria-labelledby="giving-qr"
                className="grid content-start gap-4 self-start rounded-card border border-hairline bg-surface-raised p-6"
                data-testid="giving-qr"
              >
                <h2 id="giving-qr" className="font-heading text-fs-5 font-bold">
                  {t("qrHeading")}
                </h2>
                <svg
                  role="img"
                  aria-label={t("qrLabel", { name: details.accountName ?? data.church })}
                  viewBox={`0 0 ${qr.size} ${qr.size}`}
                  width={240}
                  height={240}
                  shapeRendering="crispEdges"
                  className="h-auto w-full max-w-60 justify-self-center"
                  data-testid="giving-qr-code"
                  data-payload={details.qrPayload ?? undefined}
                >
                  {/* Always dark on white, whatever the theme: banking apps need the contrast. */}
                  <rect width={qr.size} height={qr.size} fill="#ffffff" />
                  <path d={qr.path} fill="#000000" />
                </svg>
                <p className="text-fs-3">{t("qrHelp")}</p>
                {details.qrValidUntil ? (
                  <p className="text-fs-2 text-muted" data-testid="giving-qr-validity">
                    {t("qrValidity", { date: formatDateLong(details.qrValidUntil) })}
                  </p>
                ) : null}
              </section>
            ) : null}
          </div>
        ) : null}

        {hasSzja ? (
          <section aria-labelledby="giving-szja" className="grid gap-5" data-testid="giving-szja">
            <SectionHeading id="giving-szja" title={t("szjaHeading")} />
            <p className="max-w-prose text-fs-3">{t("szjaLead")}</p>
            <dl className="grid gap-6 md:grid-cols-2">
              {details.technicalNumber ? (
                <div className="grid gap-2">
                  <dt className={DT}>{t("technicalNumber")}</dt>
                  <dd className="grid gap-2">
                    <span className={DD} data-testid="giving-technical-number">
                      {details.technicalNumber}
                    </span>
                    <span className="text-fs-2 text-muted">{t("technicalNumberHint")}</span>
                    <span className="print:hidden">
                      <CopyButton
                        value={details.technicalNumber}
                        label={t("copyTechnicalNumber")}
                        testId="copy-technical-number"
                      />
                    </span>
                  </dd>
                </div>
              ) : null}
              {details.foundationTaxNumber ? (
                <div className="grid gap-2">
                  <dt className={DT}>{t("foundationTaxNumber")}</dt>
                  <dd className="grid gap-2">
                    <span className={DD} data-testid="giving-foundation-tax">
                      {details.foundationTaxNumber}
                    </span>
                    <span className="text-fs-2 text-muted">{t("foundationTaxNumberHint")}</span>
                    <span className="print:hidden">
                      <CopyButton
                        value={details.foundationTaxNumber}
                        label={t("copyTaxNumber")}
                        testId="copy-foundation-tax"
                      />
                    </span>
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>
        ) : null}
      </div>
    </PageShell>
  );
}
