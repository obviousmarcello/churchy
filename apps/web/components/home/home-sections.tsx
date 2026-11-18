import type { ReactNode } from "react";
import type { HomeSection } from "@churchy/contracts";
import { dayWindow } from "@churchy/events";
import { addDays, todayInBudapest, weekdayName } from "@churchy/hu";
import type { EffectiveConfig } from "@churchy/presets";
import {
  Address,
  Alert,
  ButtonLink,
  Card,
  FormattedDate,
  FormattedTime,
  Hero,
  SectionHeading,
} from "@churchy/ui";
import { OccurrenceBadges, occurrenceHref } from "@/components/events/event-parts";
import { RouteLinks } from "@/components/public/location-access";
import { MapFacade } from "@/components/public/map-facade";
import { getT } from "@/i18n/server";
import { EVENTS_CALENDAR_PATH } from "@/lib/seo";
import { toHuAddress } from "@/lib/locations";
import { NEWS_PATH, newsPath } from "@/lib/news/public-news";
import { publicImage } from "@/lib/pages/public-pages";
import {
  DEFAULT_COUNT,
  ctaSettings,
  customTextSettings,
  quoteSettings,
  sectionCount,
} from "@/lib/home/sections";
import { getRequestNow } from "@/server/clock";
import { getHomeNextServices } from "@/server/public-schedule";
import { getPublicLocations, publicOccurrences } from "@/server/public-events";
import { getPublicSite } from "@/server/public-seo";
import { listPublicNews } from "@/server/public-news";
import { getRequestRepositories } from "@/server/repositories";

/** Days ahead the home page looks for events. */
const EVENT_LOOKAHEAD_DAYS = 90;

/** Hero: the church's name, its tagline and the first hero picture (`identity.heroMediaIds`). */
export async function HeroSection({ config }: { config: EffectiveConfig }) {
  const [site, repos] = await Promise.all([getPublicSite(), getRequestRepositories()]);
  const mediaId = config.identity.heroMediaIds?.[0];
  const media = mediaId && site ? await repos.media.get(site.ctx, mediaId) : null;
  const picture = publicImage(media);
  // The hero reserves its space from the intrinsic size (no layout shift); 16:9 when unknown.
  const image = picture
    ? { ...picture, width: picture.width ?? 1600, height: picture.height ?? 900 }
    : null;
  return (
    <Hero
      variant={config.theme.heroStyle}
      title={config.identity.name}
      {...(config.identity.tagline ? { lead: config.identity.tagline } : {})}
      {...(image ? { image } : {})}
    />
  );
}

/** *Most közvetítünk*: shown only while a livestreamed service is in progress (SDD §7.1). */
export async function LiveBanner({ config }: { config: EffectiveConfig }) {
  const [view, t] = await Promise.all([getHomeNextServices(), getT("public.home")]);
  const stream = config.integrations.livestream;
  if (view?.live == null || !stream) return null;
  return (
    <Alert tone="info" title={t("liveTitle")}>
      <p>
        <a
          href={stream.url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold underline"
          data-testid="live-link"
        >
          {t("liveWatch")}
        </a>
      </p>
    </Alert>
  );
}

/** Latest news cards (`settings.count`, default 3) with an *Összes hír* link and an empty state. */
export async function NewsSection({ section }: { section: HomeSection }) {
  const [t, result] = await Promise.all([getT("public.home"), listPublicNews(1)]);
  const posts = result.items.slice(0, sectionCount(section.settings, DEFAULT_COUNT.news));
  return (
    <section aria-labelledby="home-news" className="flex flex-col gap-4" data-testid="home-news">
      <SectionHeading
        id="home-news"
        title={t("newsTitle")}
        action={
          <a href={NEWS_PATH} className="text-fs-3 font-semibold text-primary underline">
            {t("newsAll")}
            <span aria-hidden="true"> →</span>
          </a>
        }
      />
      {posts.length === 0 ? (
        <p className="text-fs-3 text-muted">{t("newsEmpty")}</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-3">
          {posts.map((post) => (
            <Card
              key={post.id}
              as="li"
              title={post.title}
              headingLevel={3}
              href={newsPath(post)}
              {...(post.categories.length > 0 ? { eyebrow: post.categories.join(" · ") } : {})}
              className="h-full"
            >
              <div className="flex flex-col gap-2" data-testid="home-news-item">
                {post.publishedAt ? (
                  <FormattedDate
                    value={post.publishedAt}
                    className="text-fs-2 font-semibold text-muted"
                  />
                ) : null}
                {post.lead ? <p>{post.lead}</p> : null}
              </div>
            </Card>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Upcoming events as a date-badge list (`settings.count`, default 4) with a calendar link. */
export async function EventsSection({ section }: { section: HomeSection }) {
  const now = await getRequestNow();
  const today = todayInBudapest(now);
  const [t, occurrences, locations] = await Promise.all([
    getT("public.home"),
    publicOccurrences(dayWindow(today, addDays(today, EVENT_LOOKAHEAD_DAYS))),
    getPublicLocations(),
  ]);
  const upcoming = occurrences
    .filter((o) => o.endMs > now.getTime())
    .slice(0, sectionCount(section.settings, DEFAULT_COUNT.events));
  return (
    <section
      aria-labelledby="home-events"
      className="flex flex-col gap-4"
      data-testid="home-events"
    >
      <SectionHeading
        id="home-events"
        title={t("eventsTitle")}
        action={
          <a href={EVENTS_CALENDAR_PATH} className="text-fs-3 font-semibold text-primary underline">
            {t("eventsCalendar")}
            <span aria-hidden="true"> →</span>
          </a>
        }
      />
      {upcoming.length === 0 ? (
        <p className="text-fs-3 text-muted">{t("eventsEmpty")}</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {upcoming.map((occ) => {
            const place = occ.event.locationId ? locations.get(occ.event.locationId) : undefined;
            return (
              <li
                key={`${occ.event.id}-${occ.start}`}
                data-testid="home-event"
                data-date={occ.date}
                className="relative flex gap-4 rounded-lg border border-border bg-surface-raised p-3 shadow-card"
              >
                <div
                  aria-hidden="true"
                  className="flex w-14 shrink-0 flex-col items-center justify-center rounded-md bg-primary-soft py-1.5 text-primary"
                >
                  <span className="font-heading text-fs-5 leading-none font-bold">
                    {Number(occ.date.slice(8, 10))}
                  </span>
                  <span className="text-fs-1 font-semibold">{weekdayName(occ.date)}</span>
                </div>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <h3 className="font-heading text-fs-4 leading-tight font-bold">
                    <a
                      href={occurrenceHref(occ)}
                      className="text-primary no-underline after:absolute after:inset-0 hover:underline"
                    >
                      {occ.event.title}
                    </a>
                  </h3>
                  <p className="text-fs-3">
                    <FormattedDate value={occ.date} format="monthDay" />
                    {occ.allDay ? null : (
                      <>
                        {" · "}
                        <FormattedTime value={occ.start} />
                      </>
                    )}
                    {place ? <span className="text-muted">{` · ${place.name}`}</span> : null}
                  </p>
                  <OccurrenceBadges occ={occ} category={occ.event.category} />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/** Address, click-to-load map (no third-party request before the click) and route planning. */
export async function MapSection({ config }: { config: EffectiveConfig }) {
  const [t, locations] = await Promise.all([getT("public.home"), getPublicLocations()]);
  const list = [...locations.values()].sort((a, b) => a.sort - b.sort);
  const place = list.find((l) => l.geo !== null && l.address !== null) ?? list[0] ?? null;
  const address = place?.address ?? config.contact.address ?? null;
  const geo = place?.geo ?? null;
  if (address === null && geo === null) return null;
  return (
    <section aria-labelledby="home-map" className="flex flex-col gap-4" data-testid="home-map">
      <SectionHeading id="home-map" title={t("mapTitle")} />
      {address ? (
        <p className="text-fs-4">
          {place ? <span className="font-semibold">{place.name}, </span> : null}
          <Address address={toHuAddress(address)} />
        </p>
      ) : null}
      {geo !== null ? <MapFacade name={place?.name ?? config.identity.name} geo={geo} /> : null}
      <RouteLinks location={{ geo, address }} />
    </section>
  );
}

/** A verse or quote (`settings.text`, `settings.source`); nothing without text. */
export async function QuoteSection({ section }: { section: HomeSection }) {
  const quote = quoteSettings(section.settings);
  if (quote === null) return null;
  const t = await getT("public.home");
  return (
    <figure className="rounded-lg border-l-[6px] border-accent bg-surface-sunken p-6">
      <blockquote className="font-heading text-fs-5 leading-snug text-primary italic">
        {quote.text}
      </blockquote>
      {quote.source ? (
        <figcaption className="mt-2 text-fs-3 text-muted">
          <span className="sr-only">{t("quoteSource")} </span>
          {quote.source}
        </figcaption>
      ) : null}
    </figure>
  );
}

/** A call to action (`settings.label`, `settings.href`, optional `title` and `text`). */
export function CtaSection({ section }: { section: HomeSection }): ReactNode {
  const cta = ctaSettings(section.settings);
  if (cta === null) return null;
  return (
    <section
      aria-label={cta.title ?? cta.label}
      className="flex flex-col items-start gap-3 rounded-lg bg-primary-soft p-6"
    >
      {cta.title ? (
        <h2 className="font-heading text-fs-5 font-bold text-primary">{cta.title}</h2>
      ) : null}
      {cta.text ? <p className="text-fs-3">{cta.text}</p> : null}
      <ButtonLink href={cta.href}>{cta.label}</ButtonLink>
    </section>
  );
}

/** Free text (`settings.text`, paragraphs separated by blank lines, optional `title`). */
export function CustomTextSection({ section }: { section: HomeSection }): ReactNode {
  const custom = customTextSettings(section.settings);
  if (custom === null) return null;
  return (
    <section className="flex flex-col gap-3" aria-label={custom.title ?? undefined}>
      {custom.title ? <SectionHeading title={custom.title} /> : null}
      {custom.text.split(/\n{2,}/).map((paragraph, i) => (
        <p key={i} className="max-w-prose text-fs-4">
          {paragraph}
        </p>
      ))}
    </section>
  );
}
