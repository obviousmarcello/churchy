import type { Metadata } from "next";
import {
  addMonths,
  dayWindow,
  formatYearMonth,
  monthGrid,
  occurrencesByDay,
  parseYearMonth,
  yearMonthOf,
  type YearMonth,
} from "@churchy/events";
import { monthName, todayInBudapest, weekdayName } from "@churchy/hu";
import { FormattedDate, FormattedTime, PageShell, cn } from "@churchy/ui";
import { EventsHeader, LINK_CLASS, occurrenceHref } from "@/components/events/event-parts";
import { SiteHeader } from "@/components/site-header";
import { getT } from "@/i18n/server";
import { getPublicTenantName, publicOccurrences } from "@/server/public-events";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function selectedMonth(searchParams: SearchParams, today: string): Promise<YearMonth> {
  const value = (await searchParams).honap;
  return parseYearMonth(typeof value === "string" ? value : null) ?? yearMonthOf(today);
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const t = await getT("public.events");
  const ym = await selectedMonth(searchParams, todayInBudapest(new Date()));
  const month = t("monthTitle", { year: ym.year, month: monthName(ym.month) });
  return {
    title: t("monthMetaTitle", { month, church: await getPublicTenantName() }),
    alternates: { types: { "text/calendar": "/esemenyek.ics" } },
  };
}

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export default async function EventsMonthPage({ searchParams }: { searchParams: SearchParams }) {
  const now = new Date();
  const today = todayInBudapest(now);
  const ym = await selectedMonth(searchParams, today);
  const grid = monthGrid(ym);
  const [t, common, occurrences] = await Promise.all([
    getT("public.events"),
    getT("common"),
    publicOccurrences(dayWindow(grid.first, grid.last)),
  ]);
  const byDay = occurrencesByDay(occurrences, grid.first, grid.last);
  const title = t("monthTitle", {
    year: ym.year,
    month: monthName(ym.month),
  });
  const href = (m: YearMonth) => `/esemenyek/naptar?honap=${formatYearMonth(m)}`;
  const prev = addMonths(ym, -1);
  const next = addMonths(ym, 1);
  const current = yearMonthOf(today);
  const isCurrent = current.year === ym.year && current.month === ym.month;

  return (
    <PageShell
      skipLinkLabel={common("skipToContent")}
      header={<SiteHeader currentHref="/esemenyek" />}
    >
      <div className="mx-auto flex w-full max-w-(--content-max) flex-col gap-8 px-(--gutter) py-10">
        <EventsHeader view="month" />
        <section aria-labelledby="month-title" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2
              id="month-title"
              className="font-heading text-fs-6 font-bold text-primary"
              data-testid="month-title"
            >
              {title}
            </h2>
            <nav aria-label={t("monthNavigation")}>
              <ul className="flex flex-wrap gap-4 text-fs-2">
                <li>
                  <a href={href(prev)} rel="prev" className={LINK_CLASS} data-testid="month-prev">
                    <span aria-hidden="true">← </span>
                    {t("prevMonth")}
                  </a>
                </li>
                {isCurrent ? null : (
                  <li>
                    <a href={href(current)} className={LINK_CLASS}>
                      {t("today")}
                    </a>
                  </li>
                )}
                <li>
                  <a href={href(next)} rel="next" className={LINK_CLASS} data-testid="month-next">
                    {t("nextMonth")}
                    <span aria-hidden="true"> →</span>
                  </a>
                </li>
              </ul>
            </nav>
          </div>

          {occurrences.length === 0 ? (
            <p className="text-fs-4 text-muted">{t("monthEmpty")}</p>
          ) : null}

          {/* Monday-first weekday header; each day below also names its own date. */}
          <div
            aria-hidden="true"
            className="hidden grid-cols-7 gap-px text-center text-fs-2 font-bold text-muted md:grid"
            data-testid="month-weekdays"
          >
            {WEEKDAYS.map((d) => (
              <div key={d} title={weekdayName(d)}>
                {t("weekdayShort", { day: String(d) })}
              </div>
            ))}
          </div>
          <ol
            className="grid grid-cols-1 gap-2 md:grid-cols-7 md:gap-px md:overflow-hidden md:rounded-lg md:border md:border-border md:bg-border"
            data-testid="month-grid"
          >
            {grid.weeks.flat().map((date, i) => {
              if (date === null) {
                return (
                  <li
                    key={`blank-${i}`}
                    aria-hidden="true"
                    data-blank=""
                    className="hidden bg-surface-sunken md:block"
                  />
                );
              }
              const items = byDay.get(date) ?? [];
              const isToday = date === today;
              return (
                <li
                  key={date}
                  data-date={date}
                  aria-current={isToday ? "date" : undefined}
                  className={cn(
                    "flex min-h-24 flex-col gap-1 rounded-md border border-border bg-surface-raised p-2 md:rounded-none md:border-0",
                    items.length === 0 && "hidden md:flex",
                    isToday && "ring-2 ring-accent ring-inset",
                  )}
                >
                  <p className="flex items-center gap-2 text-fs-2 font-bold">
                    <span aria-hidden="true" className="hidden md:inline">
                      {Number(date.slice(8, 10))}
                    </span>
                    <FormattedDate value={date} className="md:sr-only" />
                    {isToday ? (
                      <span className="rounded-full bg-accent px-2 text-fs-1 text-accent-contrast">
                        {t("todayBadge")}
                      </span>
                    ) : null}
                  </p>
                  {items.length > 0 ? (
                    <ul className="flex flex-col gap-1">
                      {items.map((occ) => (
                        <li key={`${occ.event.id}-${occ.start}`} className="text-fs-2 leading-snug">
                          <a href={occurrenceHref(occ)} className="font-semibold text-primary">
                            {occ.allDay ? null : (
                              <>
                                <FormattedTime value={occ.start} className="tabular-nums" />{" "}
                              </>
                            )}
                            {occ.event.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </PageShell>
  );
}
