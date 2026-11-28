import { notFound } from "next/navigation";
import { Alert } from "@churchy/ui";
import { SiteBuilderForm } from "@/components/platform/site-builder/site-builder-form";
import { getT } from "@/i18n/server";
import { canServer } from "@/lib/permissions/server";
import { siteBuilderMode, tenantOptionsFor } from "@/server/site-builder-run";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("platform.siteBuilder"), getT("common")]);
  return {
    title: `${t("metaTitle")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

/** *Weboldal-építő* (operators only): paste a church website's address, get a draft site. */
export default async function SiteBuilderPage() {
  // Visibility is decided by `can()`; for everyone else the page does not exist.
  if (!(await canServer("platform.siteBuilder.use", { kind: "platform" }))) notFound();
  const t = await getT("platform.siteBuilder");
  const mode = siteBuilderMode();
  const tenants = await tenantOptionsFor(mode);
  return (
    <div className="mx-auto grid w-full max-w-(--content-max) gap-6 px-(--gutter) py-10">
      <header>
        <h1 className="m-0 font-heading text-fs-7 font-bold text-primary">{t("title")}</h1>
        <p className="mt-3 max-w-prose text-fs-4 text-muted">{t("lead")}</p>
      </header>
      {mode === "demo" ? (
        <Alert tone="info" title={t("notice.demoTitle")} data-testid="site-builder-demo-notice">
          <p>{t("notice.demoBody")}</p>
        </Alert>
      ) : null}
      {mode === "off" ? (
        <Alert tone="warning" title={t("notice.offTitle")} data-testid="site-builder-off-notice">
          <p>{t("notice.offBody")}</p>
        </Alert>
      ) : (
        <SiteBuilderForm tenants={tenants} />
      )}
    </div>
  );
}
