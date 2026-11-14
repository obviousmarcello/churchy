import type { Metadata } from "next";
import type { Event } from "@churchy/contracts";
import { dayWindow, expandEvents, yearMonthOf } from "@churchy/events";
import { addDays, daysBetween, monthName, todayInBudapest, weekdayName } from "@churchy/hu";
import { FormattedDate, PageShell } from "@churchy/ui";
import {
  EventsHeader,
  LINK_CLASS,
  OccurrenceBadges,
  OccurrenceWhen,
  occurrenceHref,
  recurrenceText,
} from "@/components/events/event-parts";
import { SiteHeader } from "@/components/site-header";
import { getT } from "@/i18n/server";
import {
  getPublicLocations,
  getPublicTenantName,
  listPublicEvents,
  type PublicOccurrence,
} from "@/server/public-events";

/** Days per list page; `?tol=YYYY-MM-DD` pages forward (the month view browses freely). */
const LIST_DAYS = 28;
/** How far the list may be paged from today. */
const MAX_OFFSET_DAYS = 366;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** The first day of the page: `?tol=` when valid and within range, else today. */
function pageStart(value: string | string[] | undefined, today: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return today;
  try {
    const offset = daysBetween(today, value);
    return offset > 0 && offset <= MAX_OFFSET_DAYS ? value : today;
  } catch {
    return today;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("public.events");
  return {
    title: t("metaTitle", { church: await getPublicTenantName() }),
    description: t("lead"),
    alternates: { types: { "text/calendar": "/esemenyek.ics" } },
  };
}

interface MonthGroup {
  key: string;
  year: number;
  month: number;
  items: PublicOccurrence[];
}

function groupByMonth(occurrences: PublicOccurrence[], today: string): MonthGroup[] {
  const groups: MonthGroup[] = [];
  for (const occ of occurrences) {
    // An event already in progress is listed under today's month.
    const { year, month } = yearMonthOf(occ.date < today ? today : occ.date);
    const key = `${year}-${month}`;
    let group = groups.at(-1);
    if (group?.key !== key) {
      group = { key, year, month, items: [] };
      groups.push(group);
    }
    group.items.push(occ);
  }
  return groups;
}

export default async function EventsListPage({ searchParams }: { searchParams: SearchParams }) {
  const now = new Date();
  const today = todayInBudapest(now);
  const from = pageStart((await searchParams).tol, today);
  const to = addDays(from, LIST_DAYS - 1);
  const window = dayWindow(from, to);
  const [t, common, events, locations] = await Promise.all([
    getT("public.events"),
    getT("common"),
    listPublicEvents(window),
    getPublicLocations(),
  ]);
  const masters = new Map<string, Event>(events.map((e) => [e.id, e]));
  const occurrences = expandEvents(events, window).filter((o) => o.endMs > now.getTime());
  const groups = groupByMonth(occurrences, from);
  const later = addDays(from, LIST_DAYS);
  const earlier = from === today ? null : addDays(from, -LIST_DAYS);
  const pageHref = (date: string) =>
    daysBetween(today, date) <= 0 ? "/esemenyek" : `/esemenyek?tol=${date}`;

  return (
    <PageShell
      skipLinkLabel={common("skipToContent")}
      header={<SiteHeader currentHref="/esemenyek" />}
    >
      <div className="mx-auto flex w-full max-w-(--content-max) flex-col gap-10 px-(--gutter) py-10">
        <EventsHeader view="list" />
        <section aria-labelledby="events-list-title" className="flex flex-col gap-8">
          <h2 id="events-list-title" className="font-heading text-fs-5 font-semibold">
            <FormattedDate value={from} format="monthDayLong" />
            {" – "}
            <FormattedDate value={to} format="monthDayLong" />
          </h2>
          {groups.length === 0 ? (
            <p className="text-fs-4 text-muted">{t("empty")}</p>
          ) : (
            groups.map((group) => (
              <section
                key={group.key}
                aria-labelledby={`month-${group.key}`}
                className="flex flex-col gap-4"
              >
                <h3
                  id={`month-${group.key}`}
                  className="border-b-2 border-border pb-2 font-heading text-fs-5 font-bold text-primary"
                >
                  {t("monthTitle", {
                    year: group.year,
                    month: monthName(group.month),
                  })}
                </h3>
                <ol className="flex flex-col gap-3" data-testid="events-list">
                  {group.items.map((occ) => {
                    const master = masters.get(occ.seriesId ?? occ.event.id) ?? occ.event;
                    const rule = occ.seriesId !== null ? recurrenceText(master) : null;
                    const location = occ.event.locationId
                      ? locations.get(occ.event.locationId)
                      : undefined;
                    const day = Number(occ.date.slice(8, 10));
                    return (
                      <li
                        key={`${occ.event.id}-${occ.start}`}
                        data-testid="event-item"
                        data-date={occ.date}
                        className="relative flex gap-4 rounded-lg border border-border bg-surface-raised p-4 shadow-card sm:gap-6 sm:p-5"
                      >
                        <div
                          aria-hidden="true"
                          className="flex w-16 shrink-0 flex-col items-center justify-center rounded-md bg-primary-soft py-2 text-primary"
                        >
                          <span className="font-heading text-fs-6 leading-none font-bold">
                            {day}
                          </span>
                          <span className="text-fs-1 font-semibold">{weekdayName(occ.date)}</span>
                        </div>
                        <div className="flex min-w-0 flex-col gap-1">
                          <h4 className="font-heading text-fs-5 leading-tight font-bold">
                            <a
                              href={occurrenceHref(occ)}
                              className="text-primary no-underline after:absolute after:inset-0 hover:underline"
                            >
                              {occ.event.title}
                            </a>
                          </h4>
                          <OccurrenceWhen occ={occ} className="text-fs-3" />
                          {location || rule ? (
                            <p className="text-fs-2 text-muted">
                              {[location?.name, rule].filter(Boolean).join(" · ")}
                            </p>
                          ) : null}
                          <OccurrenceBadges occ={occ} category={occ.event.category} />
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))
          )}
          <nav aria-label={t("listPages")}>
            <ul className="flex flex-wrap justify-between gap-4 text-fs-3 font-semibold">
              <li>
                {earlier !== null ? (
                  <a
                    href={pageHref(earlier)}
                    rel="prev"
                    className={LINK_CLASS}
                    data-testid="events-earlier"
                  >
                    <span aria-hidden="true">← </span>
                    {t("earlier")}
                  </a>
                ) : null}
              </li>
              <li>
                <a
                  href={pageHref(later)}
                  rel="next"
                  className={LINK_CLASS}
                  data-testid="events-later"
                >
                  {t("later")}
                  <span aria-hidden="true"> →</span>
                </a>
              </li>
            </ul>
          </nav>
        </section>
      </div>
    </PageShell>
  );
}
