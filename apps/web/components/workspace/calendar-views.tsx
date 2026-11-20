import Link from "next/link";
import type { MonthGrid } from "@churchy/events";
import { weekdayNames } from "@churchy/hu";
import { Badge, FormattedDate } from "@churchy/ui";
import { getT } from "@/i18n/server";
import {
  calendarQuery,
  type CalendarEntry,
  type CalendarParams,
  type CalendarView,
} from "@/lib/workspace/calendar";
import { EntryItem } from "./entry-item";
import type { EntryLabels } from "./entry-labels";

type ByDay = ReadonlyMap<string, readonly CalendarEntry[]>;

interface CommonProps {
  byDay: ByDay;
  today: string;
  labels: EntryLabels;
}

function DayHeading({ date, today, level = 3 }: { date: string; today: string; level?: 2 | 3 }) {
  const Tag = `h${level}` as const;
  return (
    <Tag className="flex flex-wrap items-center gap-2 font-heading text-fs-5 font-bold text-primary">
      <FormattedDate value={date} />
      {date === today ? <TodayBadge /> : null}
    </Tag>
  );
}

async function TodayBadge() {
  const t = await getT("munkater.calendar");
  return <Badge tone="primary">{t("today")}</Badge>;
}

function EntryList({
  entries,
  labels,
}: {
  entries: readonly CalendarEntry[];
  labels: EntryLabels;
}) {
  return (
    <ul className="flex flex-col">
      {entries.map((entry) => (
        <EntryItem key={`${entry.key}`} entry={entry} labels={labels} />
      ))}
    </ul>
  );
}

/** One day (*Nap*): everything of the day, all-day entries first. */
export async function DayView({ byDay, today, labels, date }: CommonProps & { date: string }) {
  const t = await getT("munkater.calendar");
  const entries = byDay.get(date) ?? [];
  return (
    <section aria-label={t("views.nap")} data-testid="calendar-day">
      <DayHeading date={date} today={today} level={2} />
      {entries.length === 0 ? (
        <p className="mt-3 text-muted">{t("emptyDay")}</p>
      ) : (
        <div className="mt-2">
          <EntryList entries={entries} labels={labels} />
        </div>
      )}
    </section>
  );
}

/** The week (*Hét*): a section per day (a seven-column grid from 1024 px). */
export async function WeekView({
  byDay,
  today,
  labels,
  days,
}: CommonProps & { days: readonly string[] }) {
  const t = await getT("munkater.calendar");
  return (
    <div
      className="grid gap-4 lg:grid-cols-7 lg:gap-2"
      data-testid="calendar-week"
      aria-label={t("views.het")}
    >
      {days.map((date) => {
        const entries = byDay.get(date) ?? [];
        return (
          <section
            key={date}
            data-date={date}
            className="min-w-0 rounded-md border border-border bg-surface-raised p-2"
          >
            <DayHeading date={date} today={today} />
            {entries.length === 0 ? (
              <p className="mt-1 text-fs-2 text-muted">{t("emptyDay")}</p>
            ) : (
              <EntryList entries={entries} labels={labels} />
            )}
          </section>
        );
      })}
    </div>
  );
}

/** The agenda (*Napirend*): days with something to show, in order; the default below 768 px. */
export async function AgendaView({
  byDay,
  today,
  labels,
  days,
  testId = "calendar-agenda",
}: CommonProps & { days: readonly string[]; testId?: string }) {
  const t = await getT("munkater.calendar");
  const filled = days.filter((d) => (byDay.get(d)?.length ?? 0) > 0);
  return (
    <section aria-label={t("views.napirend")} data-testid={testId}>
      {filled.length === 0 ? (
        <p className="text-muted">{t("emptyAgenda")}</p>
      ) : (
        <div className="flex flex-col gap-5">
          {filled.map((date) => (
            <div key={date} data-date={date}>
              <DayHeading date={date} today={today} />
              <EntryList entries={byDay.get(date) ?? []} labels={labels} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

const CHIPS_PER_DAY = 3;

/**
 * The month (*Hónap*): a Monday-first grid. A day is a link to its day view; it shows up to three
 * entries and a count. Entries are plain text (the cell is the link), so there is no nested link.
 */
export async function MonthView({
  grid,
  byDay,
  today,
  labels,
  params,
  className,
}: CommonProps & {
  grid: MonthGrid;
  params: CalendarParams;
  className?: string;
}) {
  const t = await getT("munkater.calendar");
  const names = weekdayNames({ capitalize: true });
  return (
    <div className={className} data-testid="calendar-month">
      <table className="w-full table-fixed border-collapse">
        <caption className="sr-only">{t("views.honap")}</caption>
        <thead>
          <tr>
            {names.map((name) => (
              <th
                key={name}
                scope="col"
                className="border border-border bg-surface-sunken p-1 text-fs-2 font-semibold"
              >
                <abbr title={name} className="no-underline">
                  {name.slice(0, 3)}
                </abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.weeks.map((week, i) => (
            <tr key={i}>
              {week.map((date, j) => {
                if (date === null) {
                  return <td key={j} className="border border-border bg-surface-sunken" />;
                }
                const entries = byDay.get(date) ?? [];
                const day = Number(date.slice(8));
                const href = `/munkater/naptar?${calendarQuery(params, { view: "nap", date })}`;
                return (
                  <td
                    key={j}
                    data-date={date}
                    className="h-24 border border-border align-top md:h-28"
                  >
                    <Link
                      href={href}
                      aria-current={date === today ? "date" : undefined}
                      className="block h-full min-h-11 p-1 text-text no-underline hover:bg-primary-soft aria-[current=date]:bg-primary-soft"
                    >
                      <span
                        className={
                          date === today
                            ? "inline-grid min-w-7 place-items-center rounded-full bg-primary px-1 text-fs-2 font-bold text-primary-contrast"
                            : "text-fs-2 font-semibold"
                        }
                      >
                        {day}
                      </span>
                      <span className="sr-only">{t("dayCount", { count: entries.length })}</span>
                      <span className="mt-1 hidden flex-col gap-0.5 md:flex" aria-hidden="true">
                        {entries.slice(0, CHIPS_PER_DAY).map((e) => (
                          <span
                            key={e.key}
                            className="truncate rounded-sm bg-surface-sunken px-1 text-fs-1"
                          >
                            {e.title ?? labels.absent}
                          </span>
                        ))}
                        {entries.length > CHIPS_PER_DAY ? (
                          <span className="text-fs-1 text-muted">
                            {t("more", { count: entries.length - CHIPS_PER_DAY })}
                          </span>
                        ) : null}
                      </span>
                      {entries.length > 0 ? (
                        <span
                          aria-hidden="true"
                          className="mt-1 inline-block rounded-full bg-primary px-1.5 text-fs-1 font-semibold text-primary-contrast md:hidden"
                        >
                          {entries.length}
                        </span>
                      ) : null}
                    </Link>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export type { CalendarView };
