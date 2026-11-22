import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Address, PageShell, SectionHeading } from "@churchy/ui";
import { AccessibilityInfo, RouteLinks } from "@/components/public/location-access";
import { MapFacade } from "@/components/public/map-facade";
import { OpeningHours } from "@/components/public/opening-hours";
import { PublicSiteHeader } from "@/components/site-header";
import { getT } from "@/i18n/server";
import { LOCATIONS_PATH, jsonLdScript, locationJsonLd, toHuAddress } from "@/lib/locations";
import { getPublicCtx } from "@/server/public-site";
import { getRequestRepositories } from "@/server/repositories";
import { requirePublicModule } from "@/server/plans";
import { PublicBreadcrumbs } from "@/components/public/public-page-header";
import { getSiteHref } from "@/server/site-base";

type Params = { params: Promise<{ slug: string }> };

async function findLocation(slug: string) {
  const [{ locations, tenants }, ctx] = await Promise.all([
    getRequestRepositories(),
    getPublicCtx(),
  ]);
  const [location, tenant] = await Promise.all([
    locations.getBySlug(ctx, slug),
    tenants.current(ctx),
  ]);
  return { location, tenant };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const [{ location, tenant }, t, href] = await Promise.all([
    findLocation(slug),
    getT("public.locations"),
    getSiteHref(),
  ]);
  const title = location?.name ?? t("notFoundTitle");
  return {
    title: tenant ? `${title} · ${tenant.name}` : title,
    ...(location ? { alternates: { canonical: href(`${LOCATIONS_PATH}/${location.slug}`) } } : {}),
  };
}

/** Location detail (FR-003, D-12): address, route link, map facade, hours, accessibility. */
export default async function LocationPage({ params }: Params) {
  await requirePublicModule("locations");
  const { slug } = await params;
  const [{ location }, t, common, href] = await Promise.all([
    findLocation(slug),
    getT("public.locations"),
    getT("common"),
    getSiteHref(),
  ]);
  if (location === null) notFound();

  return (
    <PageShell skipLinkLabel={common("skipToContent")} header={<PublicSiteHeader />}>
      <script
        type="application/ld+json"
        // Escaped JSON from our own data (no user HTML), see `jsonLdScript`.
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            locationJsonLd(location, href(`${LOCATIONS_PATH}/${location.slug}`)),
          ),
        }}
      />
      <div className="mx-auto grid w-full max-w-(--content-max) gap-10 px-(--gutter) py-10">
        <header className="grid gap-3">
          <PublicBreadcrumbs
            trail={[{ label: t("title"), href: LOCATIONS_PATH }]}
            current={location.name}
          />
          <p className="text-fs-2 font-semibold text-accent-text">{t(`kind.${location.kind}`)}</p>
          <h1 className="font-heading text-page-title [font-weight:var(--fw-heading)] tracking-(--heading-tracking) text-balance text-primary">
            {location.name}
          </h1>
        </header>

        <div className="grid gap-10 lg:grid-cols-2">
          <section aria-labelledby="location-address" className="grid content-start gap-4">
            <SectionHeading id="location-address" title={t("addressHeading")} />
            {location.address ? (
              <p className="text-fs-4" data-testid="location-address">
                <Address address={toHuAddress(location.address)} />
              </p>
            ) : (
              <p className="text-muted">{t("noAddress")}</p>
            )}
            <RouteLinks location={location} />
            {location.geo ? <MapFacade name={location.name} geo={location.geo} /> : null}
          </section>

          <div className="grid content-start gap-10">
            <section aria-labelledby="location-hours" className="grid gap-4">
              <SectionHeading id="location-hours" title={t("hoursHeading")} />
              <OpeningHours hours={location.openingHours} testId="location-hours" />
            </section>
            <section aria-labelledby="location-accessibility" className="grid gap-4">
              <SectionHeading id="location-accessibility" title={t("accessibilityHeading")} />
              <AccessibilityInfo accessibility={location.accessibility} />
            </section>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
