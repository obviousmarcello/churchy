import type { Metadata } from "next";
import { PageShell } from "@churchy/ui";
import { LocationList } from "@/components/public/location-list";
import { PublicSiteHeader } from "@/components/site-header";
import { getT } from "@/i18n/server";
import { LOCATIONS_PATH } from "@/lib/locations";
import { getPublicCtx } from "@/server/public-site";
import { getRequestRepositories } from "@/server/repositories";
import { requirePublicModule } from "@/server/plans";
import { PublicPageHeader } from "@/components/public/public-page-header";
import { getSiteHref } from "@/server/site-base";

export async function generateMetadata(): Promise<Metadata> {
  const [t, { tenants }, ctx, href] = await Promise.all([
    getT("public.locations"),
    getRequestRepositories(),
    getPublicCtx(),
    getSiteHref(),
  ]);
  const tenant = await tenants.current(ctx);
  return {
    title: tenant ? `${t("title")} · ${tenant.name}` : t("title"),
    alternates: { canonical: href(LOCATIONS_PATH) },
  };
}

/** *Templomaink* (title from the `locationsSection` term): all locations of the church. */
export default async function LocationsPage() {
  await requirePublicModule("locations");
  const [t, common, { locations }, ctx] = await Promise.all([
    getT("public.locations"),
    getT("common"),
    getRequestRepositories(),
    getPublicCtx(),
  ]);
  const list = await locations.list(ctx);
  return (
    <PageShell skipLinkLabel={common("skipToContent")} header={<PublicSiteHeader />}>
      <div className="mx-auto grid w-full max-w-(--content-max) gap-8 px-(--gutter) py-10">
        <PublicPageHeader title={t("title")} lead={t("lead")} />
        <LocationList locations={list} />
      </div>
    </PageShell>
  );
}
