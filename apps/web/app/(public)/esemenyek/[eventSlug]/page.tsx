import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  budapestDate,
  dayWindow,
  expandEvents,
  googleCalendarUrl,
  richTextParagraphs,
  richTextPlain,
} from "@churchy/events";
import { addDays } from "@churchy/hu";
import { Address, ButtonLink, PageShell } from "@churchy/ui";
import {
  LINK_CLASS,
  OccurrenceBadges,
  OccurrenceWhen,
  occurrenceHref,
  recurrenceText,
} from "@/components/events/event-parts";
import { SiteHeader } from "@/components/site-header";
import { getT } from "@/i18n/server";
import { eventJsonLd, jsonLdScript } from "@/lib/events/json-ld";
import {
  eventIcsPath,
  eventPath,
  huAddress,
  locationPath,
  mapUrl,
  toIcsEvent,
} from "@/lib/events/public-event";
import {
  aheadWindow,
  getPublicEventFamily,
  getPublicLocations,
  getPublicTenantName,
  requestOrigin,
  type PublicEventFamily,
  type PublicOccurrence,
} from "@/server/public-events";

type Params = Promise<{ eventSlug: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const UPCOMING_COUNT = 6;

/**
 * The occurrences of the page: for a master its whole series (override children included), for an
 * override child or a single event just that one.
 */
function occurrencesOf(family: PublicEventFamily, now: Date): PublicOccurrence[] {
  const { event } = family;
  const members = event.id === family.master.id ? family.members : [event];
  const upcoming = expandEvents(members, aheadWindow(now)).filter((o) => o.endMs > now.getTime());
  if (upcoming.length > 0) return upcoming;
  // Past single events still show their own date.
  const date = budapestDate(event.startsAt);
  return expandEvents([event], dayWindow(addDays(date, -1), addDays(date, 1)));
}

function pick(occurrences: PublicOccurrence[], datum: string | undefined): PublicOccurrence | null {
  return occurrences.find((o) => o.date === datum) ?? occurrences[0] ?? null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { eventSlug } = await params;
  const family = await getPublicEventFamily(decodeURIComponent(eventSlug), new Date());
  if (family === null) return {};
  const t = await getT("public.events");
  const description = family.event.body ? richTextPlain(family.event.body).slice(0, 200) : null;
  return {
    title: t("eventMetaTitle", { title: family.event.title, church: await getPublicTenantName() }),
    ...(description ? { description } : {}),
    alternates: { types: { "text/calendar": eventIcsPath(family.event) } },
  };
}

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const now = new Date();
  const { eventSlug } = await params;
  const family = await getPublicEventFamily(decodeURIComponent(eventSlug), now);
  if (family === null) notFound();
  const { event, master } = family;

  const datum = (await searchParams).datum;
  const occurrences = occurrencesOf(family, now);
  const selected = pick(occurrences, typeof datum === "string" ? datum : undefined);
  if (selected === null) notFound();

  const [t, common, locations, organizerName, origin] = await Promise.all([
    getT("public.events"),
    getT("common"),
    getPublicLocations(),
    getPublicTenantName(),
    requestOrigin(),
  ]);
  const location = event.locationId ? locations.get(event.locationId) : undefined;
  const address = location ? huAddress(location) : null;
  const map = location ? mapUrl(location) : null;
  const paragraphs = event.body ? richTextParagraphs(event.body) : [];
  const rule = selected.seriesId !== null ? recurrenceText(master, { withTime: true }) : null;
  const url = `${origin}${eventPath(event)}`;
  const ics = toIcsEvent(event.id === master.id ? master : event, {
    origin,
    location,
    members: family.members,
  });
  const upcoming =
    event.id === master.id && master.rrule !== null
      ? occurrences.filter((o) => o !== selected).slice(0, UPCOMING_COUNT)
      : [];
  const jsonLd = eventJsonLd({
    occurrence: selected,
    location,
    organizerName,
    origin,
    url,
    description: paragraphs.length > 0 ? paragraphs.join("\n\n") : null,
  });

  return (
    <PageShell
      skipLinkLabel={common("skipToContent")}
      header={<SiteHeader currentHref="/esemenyek" />}
    >
      <script
        type="application/ld+json"
        // Built from public fields only and escaped by `jsonLdScript` (no user HTML).
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />
      <article className="mx-auto flex w-full max-w-(--content-max) flex-col gap-8 px-(--gutter) py-10">
        <p>
          <a href="/esemenyek" className={`${LINK_CLASS} text-fs-2`}>
            <span aria-hidden="true">← </span>
            {t("back")}
          </a>
        </p>
        <header className="flex flex-col gap-3">
          <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary">
            {event.title}
          </h1>
          <OccurrenceBadges occ={selected} category={event.category} />
        </header>

        <div className="grid gap-6 md:grid-cols-2">
          <section
            aria-labelledby="event-when"
            className="flex flex-col gap-2 rounded-lg border border-border bg-surface-raised p-5 shadow-card"
            data-testid="event-when"
          >
            <h2 id="event-when" className="font-heading text-fs-4 font-bold">
              {t("whenHeading")}
            </h2>
            <OccurrenceWhen occ={selected} className="text-fs-4" />
            {rule ? (
              <p className="text-fs-3 text-muted" data-testid="event-recurrence">
                {rule}
              </p>
            ) : selected.seriesId !== null ? (
              <p className="text-fs-3 text-muted">{t("recurring")}</p>
            ) : null}
            <div className="mt-2 flex flex-col gap-2">
              <h3 className="text-fs-2 font-bold">{t("addToCalendar")}</h3>
              <div className="flex flex-wrap gap-2">
                <ButtonLink
                  href={eventIcsPath(event)}
                  variant="secondary"
                  size="sm"
                  download
                  data-testid="event-ics"
                >
                  {t("downloadIcs")}
                </ButtonLink>
                <ButtonLink
                  href={googleCalendarUrl(ics)}
                  variant="secondary"
                  size="sm"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("googleCalendar")}
                  <span className="sr-only"> {t("opensInNewTab")}</span>
                </ButtonLink>
              </div>
            </div>
          </section>

          {location ? (
            <section
              aria-labelledby="event-where"
              className="flex flex-col gap-2 rounded-lg border border-border bg-surface-raised p-5 shadow-card"
              data-testid="event-where"
            >
              <h2 id="event-where" className="font-heading text-fs-4 font-bold">
                {t("whereHeading")}
              </h2>
              <p className="text-fs-4">
                <a href={locationPath(location)} className={LINK_CLASS}>
                  {location.name}
                </a>
              </p>
              {address ? <Address address={address} className="text-fs-3" /> : null}
              {map ? (
                <a
                  href={map}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${LINK_CLASS} text-fs-3`}
                >
                  {t("mapLink")}
                  <span className="sr-only"> {t("opensInNewTab")}</span>
                </a>
              ) : null}
            </section>
          ) : null}
        </div>

        {paragraphs.length > 0 ? (
          <section aria-labelledby="event-about" className="flex max-w-prose flex-col gap-3">
            <h2 id="event-about" className="font-heading text-fs-5 font-bold">
              {t("aboutHeading")}
            </h2>
            {paragraphs.map((text, i) => (
              <p key={i} className="text-fs-4 whitespace-pre-line">
                {text}
              </p>
            ))}
          </section>
        ) : null}

        {event.id === master.id && master.rrule !== null ? (
          <section aria-labelledby="event-upcoming" className="flex flex-col gap-3">
            <h2 id="event-upcoming" className="font-heading text-fs-5 font-bold">
              {t("upcomingHeading")}
            </h2>
            {upcoming.length === 0 ? (
              <p className="text-fs-3 text-muted">{t("noUpcoming")}</p>
            ) : (
              <ul className="flex flex-col gap-2" data-testid="event-upcoming">
                {upcoming.map((occ) => (
                  <li key={`${occ.event.id}-${occ.start}`} className="flex flex-wrap gap-2">
                    <a href={occurrenceHref(occ)} className={LINK_CLASS}>
                      <OccurrenceWhen occ={occ} />
                    </a>
                    <OccurrenceBadges occ={occ} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}
      </article>
    </PageShell>
  );
}
