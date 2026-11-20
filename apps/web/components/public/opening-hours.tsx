"use client";

import { useSyncExternalStore } from "react";
import type { OpeningHours as OpeningHoursData } from "@churchy/contracts";
import {
  formatDateRange,
  formatRelativeDay,
  formatTime,
  formatTimeRange,
  weekdayName,
} from "@churchy/hu";
import {
  currentAndUpcomingExceptions,
  hoursOn,
  openingStatus,
  weeklyTable,
  type TimeInterval,
} from "@churchy/schedule";
import { Badge, cn } from "@churchy/ui";
import { useT } from "@/i18n/client";

const MINUTE = 60_000;
/** The visitor's clock, to the minute (stable between renders within a minute). */
const currentMinute = () => Math.floor(Date.now() / MINUTE) * MINUTE;
/** The server does not know the visitor's "now" (and the page may be cached). */
const unknownOnServer = () => null;
function subscribeToClock(onChange: () => void): () => void {
  const timer = window.setInterval(onChange, 15_000);
  return () => window.clearInterval(timer);
}

/** Any fixed instant: only used to lay out the weekly table before the clock is known. */
const LAYOUT_INSTANT = Date.UTC(2026, 0, 5);

/** `Hétfő: 10:00–12:00 · Szerda: 15:00–17:00` for an exception with its own hours. */
function exceptionHours(hours: readonly { weekday: number; from: string; to: string }[]): string {
  return weeklyTable({ weekly: hours }, LAYOUT_INSTANT)
    .filter((row) => row.intervals.length > 0)
    .map(
      (row) =>
        `${weekdayName(row.weekday, { capitalize: true })}: ${row.intervals
          .map((i) => formatTimeRange(i.from, i.to))
          .join(", ")}`,
    )
    .join(" · ");
}

/**
 * Opening / office hours (FR-003, FR-008, D-12): the weekly table with today highlighted, the
 * *Most nyitva / Most zárva* status and the current and upcoming exceptions, all computed in
 * Europe/Budapest by `@churchy/schedule`.
 *
 * "Now" is the visitor's clock, read after hydration and kept current to the minute, so the status
 * stays right on cached pages (SDD §15). `now` injects a fixed clock (tests); E2E tests set the
 * browser clock.
 */
export function OpeningHours({
  hours,
  now: fixedNow,
  testId = "opening-hours",
}: {
  hours: OpeningHoursData;
  now?: string | number;
  testId?: string;
}) {
  const t = useT("public.hours");
  const clock = useSyncExternalStore(subscribeToClock, currentMinute, unknownOnServer);
  const now = fixedNow === undefined ? clock : new Date(fixedNow).getTime();

  const range = (i: TimeInterval) => formatTimeRange(i.from, i.to);
  const list = (intervals: TimeInterval[]) =>
    intervals.length === 0 ? t("closed") : intervals.map(range).join(", ");

  // Server render and first paint: the regular table without "today" (the clock is unknown).
  const rows = weeklyTable(hours, now ?? LAYOUT_INSTANT);
  const status = now === null ? null : openingStatus(hours, now);
  const today = status ? hoursOn(hours, status.today) : null;
  const exceptions = now === null ? [] : currentAndUpcomingExceptions(hours, now);

  if (hours.weekly.length === 0 && hours.exceptions.length === 0) {
    return <p className="text-fs-3 text-muted">{t("noHours")}</p>;
  }

  return (
    <div className="grid gap-4" data-testid={testId}>
      <p
        className="flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1 text-fs-3"
        aria-live="polite"
      >
        {status === null ? (
          <span className="sr-only">{t("statusLoading")}</span>
        ) : (
          <>
            <Badge
              tone={status.open ? "success" : "neutral"}
              dot
              data-testid={`${testId}-status`}
              data-open={status.open}
            >
              {status.open ? t("openNow") : t("closedNow")}
            </Badge>
            <span className="text-muted" data-testid={`${testId}-next`}>
              {status.open && status.current
                ? t("openUntil", { time: formatTime(status.current.to) })
                : status.next === null
                  ? t("noUpcoming")
                  : status.next.date === status.today
                    ? t("opensToday", { time: formatTime(status.next.from) })
                    : t("opensOn", {
                        date: formatRelativeDay(status.next.date, new Date(now ?? 0), {
                          lowercase: true,
                        }),
                        time: formatTime(status.next.from),
                      })}
            </span>
          </>
        )}
      </p>

      <table className="w-full max-w-md border-collapse text-fs-3">
        <thead className="sr-only">
          <tr>
            <th scope="col">{t("dayColumn")}</th>
            <th scope="col">{t("hoursColumn")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isToday = status !== null && row.isToday;
            const intervals = isToday && today ? today.intervals : row.intervals;
            return (
              <tr
                key={row.weekday}
                aria-current={isToday ? "date" : undefined}
                data-testid={`${testId}-row`}
                data-today={isToday ? "true" : undefined}
                className={cn("border-b border-border", isToday && "bg-primary-soft font-semibold")}
              >
                <th scope="row" className="py-2 pr-4 pl-2 text-left font-semibold">
                  {weekdayName(row.weekday, { capitalize: true })}
                  {isToday ? (
                    <Badge tone="primary" className="ml-2">
                      {t("today")}
                    </Badge>
                  ) : null}
                </th>
                <td className="py-2 pr-2 tabular-nums">{list(intervals)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {today?.exception ? (
        <p className="text-fs-2 text-muted" data-testid={`${testId}-today-exception`}>
          {t("exceptionToday")}
        </p>
      ) : null}

      {exceptions.length > 0 ? (
        <div className="grid gap-2" data-testid={`${testId}-exceptions`}>
          <h3 className="text-fs-4 font-semibold">{t("exceptionsHeading")}</h3>
          <ul className="grid gap-2">
            {exceptions.map((e) => {
              const span = formatDateRange(e.from, e.to);
              return (
                <li
                  key={`${e.from}-${e.to}`}
                  className="rounded-md border-l-4 border-warning bg-warning-soft px-3 py-2"
                >
                  <span className="font-semibold">
                    {e.closed
                      ? t("exceptionClosed", { range: span })
                      : t("exceptionChanged", { range: span })}
                  </span>
                  {!e.closed && e.hours && e.hours.length > 0 ? (
                    <span className="block">{exceptionHours(e.hours)}</span>
                  ) : null}
                  {e.note ? <span className="block">{e.note}</span> : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
