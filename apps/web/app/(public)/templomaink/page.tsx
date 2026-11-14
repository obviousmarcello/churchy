import type { Metadata } from "next";
import { PageShell } from "@churchy/ui";
import { LocationList } from "@/components/public/location-list";
import { SiteHeader } from "@/components/site-header";
import { getT } from "@/i18n/server";
import { getPublicCtx } from "@/server/public-site";
import { getRequestRepositories } from "@/server/repositories";

export async function generateMetadata(): Promise<Metadata> {
  const [t, { tenants }, ctx] = await Promise.all([
    getT("public.locations"),
    getRequestRepositories(),
    getPublicCtx(),
  ]);
  const tenant = await tenants.current(ctx);
  return { title: tenant ? `${t("title")} · ${tenant.name}` : t("title") };
}

/** *Templomaink* (title from the `locationsSection` term): all locations of the church. */
export default async function LocationsPage() {
  const [t, common, { locations }, ctx] = await Promise.all([
    getT("public.locations"),
    getT("common"),
    getRequestRepositories(),
    getPublicCtx(),
  ]);
  const list = await locations.list(ctx);
  return (
    <PageShell skipLinkLabel={common("skipToContent")} header={<SiteHeader />}>
      <div className="mx-auto grid w-full max-w-(--content-max) gap-8 px-(--gutter) py-10">
        <header className="grid gap-3">
          <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary">
            {t("title")}
          </h1>
          <p className="max-w-prose text-fs-4 text-muted">{t("lead")}</p>
        </header>
        <LocationList locations={list} />
      </div>
    </PageShell>
  );
}
