/**
 * Opening and office hours (FR-003, FR-008, D-12): regular weekly hours plus date-range
 * exceptions (*„Az iroda júl. 15–31. között zárva tart.”*), evaluated in Europe/Budapest.
 *
 * Pure: "now" is always passed in (an injectable clock), never read from the system. Times are
 * Budapest wall-clock times, so an interval `09:00–12:00` means 09:00–12:00 local time on both
 * sides of a DST change. An interval is half-open (`from` inclusive, `to` exclusive); intervals
 * whose `to` is not after `from` are ignored (no overnight hours).
 */
import { TZDate } from "@date-fns/tz";
import { addDays, compareStrings, isoWeekday, parseIsoDate, parseIsoTime } from "./civil";
import { TIME_ZONE, budapestDateOf, parseInstant } from "./zone";
import type { IsoDate, IsoDateTime, IsoTime, Weekday } from "./types";

/** One interval of regular hours on a weekday. Mirrors `WeeklyHours` of `@churchy/contracts`. */
export interface WeeklyInterval {
  weekday: number;
  from: IsoTime;
  to: IsoTime;
}

/** A date range that overrides the regular hours. Mirrors the contracts' `OpeningHours`. */
export interface OpeningHoursException {
  /** Inclusive first day. */
  from: IsoDate;
  /** Inclusive last day. */
  to: IsoDate;
  /** Closed for the whole range. */
  closed: boolean;
  /** Hours that apply instead of the regular ones (by weekday); absent: the regular hours. */
  hours?: readonly WeeklyInterval[] | undefined;
  note?: string | null | undefined;
}

export interface OpeningHoursInput {
  weekly: readonly WeeklyInterval[];
  exceptions: readonly OpeningHoursException[];
}

/** An interval on one day, `HH:mm`–`HH:mm`. */
export interface TimeInterval {
  from: IsoTime;
  to: IsoTime;
}

export interface DayHours {
  date: IsoDate;
  weekday: Weekday;
  /** The intervals in force that day, sorted; empty when closed. */
  intervals: TimeInterval[];
  /** The exception that decided the day, or null for regular hours. */
  exception: OpeningHoursException | null;
}

export type Clock = Date | IsoDateTime | number;

/** Budapest civil date and minute of the day of an instant. */
export function budapestNow(now: Clock): { date: IsoDate; minutes: number } {
  const ms =
    typeof now === "number" ? now : typeof now === "string" ? parseInstant(now) : now.getTime();
  if (Number.isNaN(ms)) throw new RangeError("Invalid clock value");
  const local = new TZDate(ms, TIME_ZONE);
  return { date: budapestDateOf(ms), minutes: local.getHours() * 60 + local.getMinutes() };
}

function intervalsOn(source: readonly WeeklyInterval[], weekday: Weekday): TimeInterval[] {
  return source
    .filter((i) => i.weekday === weekday && parseIsoTime(i.to) > parseIsoTime(i.from))
    .map(({ from, to }) => ({ from, to }))
    .sort((a, b) => compareStrings(a.from, b.from) || compareStrings(a.to, b.to));
}

const rangeDays = (e: OpeningHoursException) =>
  (Date.parse(`${e.to}T00:00:00Z`) - Date.parse(`${e.from}T00:00:00Z`)) / 86_400_000;

/**
 * The exception in force on `date`, or null. When ranges overlap the narrowest one wins (a
 * one-day change inside a summer break); on a tie, the one listed last.
 */
export function exceptionOn(
  hours: Pick<OpeningHoursInput, "exceptions">,
  date: IsoDate,
): OpeningHoursException | null {
  parseIsoDate(date);
  let best: OpeningHoursException | null = null;
  for (const e of hours.exceptions) {
    if (compareStrings(e.from, date) > 0 || compareStrings(date, e.to) > 0) continue;
    if (best === null || rangeDays(e) <= rangeDays(best)) best = e;
  }
  return best;
}

/** The hours in force on one civil date: an exception overrides the regular weekly hours. */
export function hoursOn(hours: OpeningHoursInput, date: IsoDate): DayHours {
  const weekday = isoWeekday(date);
  const exception = exceptionOn(hours, date);
  let intervals: TimeInterval[];
  if (exception === null) intervals = intervalsOn(hours.weekly, weekday);
  else if (exception.closed) intervals = [];
  else intervals = intervalsOn(exception.hours ?? hours.weekly, weekday);
  return { date, weekday, intervals, exception };
}

export interface OpeningStatus {
  /** Budapest civil date of `now`. */
  today: IsoDate;
  open: boolean;
  /** The interval `now` falls into (when open). */
  current: TimeInterval | null;
  /** The next opening after `now` within the look-ahead, or null. */
  next: { date: IsoDate; from: IsoTime } | null;
  /** Today's hours (with the exception that decided them, if any). */
  day: DayHours;
}

/** Days searched for the next opening (a summer break can last weeks). */
export const NEXT_OPENING_LOOKAHEAD_DAYS = 60;

/** *Most nyitva / Most zárva*: whether the place is open at `now`, and when it opens next. */
export function openingStatus(hours: OpeningHoursInput, now: Clock): OpeningStatus {
  const { date, minutes } = budapestNow(now);
  const day = hoursOn(hours, date);
  const current =
    day.intervals.find((i) => parseIsoTime(i.from) <= minutes && minutes < parseIsoTime(i.to)) ??
    null;

  let next: OpeningStatus["next"] = null;
  const laterToday = day.intervals.find((i) => parseIsoTime(i.from) > minutes);
  if (laterToday) next = { date, from: laterToday.from };
  for (let offset = 1; next === null && offset <= NEXT_OPENING_LOOKAHEAD_DAYS; offset++) {
    const other = hoursOn(hours, addDays(date, offset));
    const first = other.intervals[0];
    if (first) next = { date: other.date, from: first.from };
  }
  return { today: date, open: current !== null, current, next, day };
}

export interface WeekRow {
  weekday: Weekday;
  /** Regular weekly intervals of the weekday (empty: closed). */
  intervals: TimeInterval[];
  isToday: boolean;
}

/** The regular weekly table, Monday first, with today's weekday marked. */
export function weeklyTable(hours: Pick<OpeningHoursInput, "weekly">, now: Clock): WeekRow[] {
  const todayWeekday = isoWeekday(budapestNow(now).date);
  return ([1, 2, 3, 4, 5, 6, 7] as const).map((weekday) => ({
    weekday,
    intervals: intervalsOn(hours.weekly, weekday),
    isToday: weekday === todayWeekday,
  }));
}

/**
 * Exceptions that are in force today or start within `horizonDays`, ordered by start date.
 * Past exceptions are dropped.
 */
export function currentAndUpcomingExceptions(
  hours: Pick<OpeningHoursInput, "exceptions">,
  now: Clock,
  horizonDays = 90,
): OpeningHoursException[] {
  const today = budapestNow(now).date;
  const horizon = addDays(today, horizonDays);
  return hours.exceptions
    .filter((e) => compareStrings(e.to, today) >= 0 && compareStrings(e.from, horizon) <= 0)
    .sort((a, b) => compareStrings(a.from, b.from) || compareStrings(a.to, b.to));
}
