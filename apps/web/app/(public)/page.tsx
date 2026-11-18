import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { HomeSection } from "@churchy/contracts";
import type { EffectiveConfig } from "@churchy/presets";
import { PageShell, SectionHeading } from "@churchy/ui";
import { LatestAnnouncementTeaser } from "@/components/announcements/latest-teaser";
import {
  CtaSection,
  CustomTextSection,
  EventsSection,
  HeroSection,
  LiveBanner,
  MapSection,
  NewsSection,
  QuoteSection,
} from "@/components/home/home-sections";
import { NextServicesCard } from "@/components/home/next-services";
import { SiteHeader } from "@/components/site-header";
import { getT } from "@/i18n/server";
import { homeBands, type Band } from "@/lib/home/sections";
import { jsonLdScript } from "@/lib/locations";
import { getRequestNow } from "@/server/clock";
import { getHomeNextServices } from "@/server/public-schedule";
import { getChurchJsonLd, getPublicSite } from "@/server/public-seo";
import { getRequestRepositories } from "@/server/repositories";

/**
 * Home page of the request's church (D-10, SDD §7.1): the sections of the church's site config
 * (`effectiveConfig().home`) in their configured order; sections of disabled modules are already
 * dropped by the config. The *next services* card is resolved by `@churchy/schedule` at the
 * request's clock, so *Ma / Holnap* are right after midnight without any edit.
 */

export async function generateMetadata(): Promise<Metadata> {
  const [site, t] = await Promise.all([getPublicSite(), getT("public.home")]);
  if (site === null) return {};
  const church = site.tenant.name;
  return {
    title: { absolute: church },
    description: t("metaDescription", { church }),
    alternates: { canonical: "/" },
  };
}

export default async function HomePage() {
  const site = await getPublicSite();
  if (site === null) notFound();
  const { config, tenant } = site;
  const [common, now] = await Promise.all([getT("common"), getRequestNow()]);
  const jsonLd = await getChurchJsonLd(now);
  const hasHero = config.home.some((s) => s.type === "hero");

  return (
    <PageShell skipLinkLabel={common("skipToContent")} header={<SiteHeader currentHref="/" />}>
      {jsonLd ? (
        <script
          type="application/ld+json"
          // The church's structured data (D-17); escaped JSON from our own data, see `jsonLdScript`.
          dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
        />
      ) : null}
      {hasHero ? null : <h1 className="sr-only">{tenant.name}</h1>}
      {homeBands(config.home).map((band, i) => (
        <BandView key={i} band={band} />
      ))}
    </PageShell>
  );
}

async function BandView({ band }: { band: Band }) {
  if (band.kind === "wide") return <WideSection section={band.section} />;
  return (
    <div className="mx-auto w-full max-w-(--content-max) px-(--gutter) py-6 lg:py-10">
      <div className="grid gap-8 lg:grid-cols-2 lg:items-start lg:gap-12">
        {[band.left, band.right].map((column, i) => (
          // Columns collapse to one on a phone; `order` keeps the configured order there.
          <div key={i} className="contents lg:flex lg:flex-col lg:gap-10">
            {column.map(({ section, order }) => (
              <div key={section.id} style={{ order }} data-home-section={section.type}>
                <ColumnSection section={section} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

async function ColumnSection({ section }: { section: HomeSection }) {
  const [site, t] = await Promise.all([getPublicSite(), getT("public.home")]);
  if (site === null) return null;
  switch (section.type) {
    case "nextServices": {
      const [view, now, repos] = await Promise.all([
        getHomeNextServices(),
        getRequestNow(),
        getRequestRepositories(),
      ]);
      if (view === null) return null;
      const locations = await repos.locations.list(site.ctx);
      return (
        <NextServicesCard
          view={view}
          now={now}
          locations={locations}
          serviceTypes={site.config.serviceTypes}
        />
      );
    }
    case "announcements": {
      const title = (await getT("public.announcements"))("teaserTitle");
      return (
        <LatestAnnouncementTeaser
          empty={
            <section
              aria-labelledby="home-announcements"
              className="flex flex-col gap-4"
              data-testid="announcements-empty"
            >
              <SectionHeading id="home-announcements" title={title} />
              <p className="text-fs-3 text-muted">{t("announcementsEmpty")}</p>
            </section>
          }
        />
      );
    }
    case "news":
      return <NewsSection section={section} />;
    case "events":
      return <EventsSection section={section} />;
    default:
      return null;
  }
}

async function WideSection({ section }: { section: HomeSection }) {
  const site = await getPublicSite();
  if (site === null) return null;
  const { config } = site;
  if (section.type === "hero") return <HeroSection config={config} />;
  const content = await wideContent(section, config);
  if (content === null) return null;
  return (
    <div
      className="mx-auto w-full max-w-(--content-max) px-(--gutter) py-6 lg:py-10"
      data-home-section={section.type}
    >
      {content}
    </div>
  );
}

/**
 * The content of a full-width section, or null when it has nothing to show (so no empty padded
 * band is rendered). The section components are async functions, awaited here for that reason.
 */
async function wideContent(section: HomeSection, config: EffectiveConfig) {
  switch (section.type) {
    case "livestream":
      return LiveBanner({ config });
    case "map":
      return MapSection({ config });
    case "quote":
      return QuoteSection({ section });
    case "cta":
      return CtaSection({ section });
    case "customText":
      return CustomTextSection({ section });
    default:
      return null;
  }
}
