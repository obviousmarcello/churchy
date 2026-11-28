/**
 * Civil (calendar) date arithmetic on "epoch days" (days since 1970-01-01).
 * Only UTC-based `Date` APIs are used, so nothing here depends on the process
 * time zone.
 */
import { ScheduleError } from "./errors";
import type { IsoDate, NthWeek, Weekday } from "./types";

const MS_PER_DAY = 86_400_000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export interface CivilDate {
  year: number;
  month: number; // 1–12
  day: number; // 1–31
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function formatIsoDate(year: number, month: number, day: number): IsoDate {
  return `${String(year).padStart(4, "0")}-${pad2(month)}-${pad2(day)}`;
}

/** Deterministic, locale-independent string comparison (for ids and ISO strings). */
export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Parses and validates `"YYYY-MM-DD"` (rejects e.g. `2026-02-30`). */
export function parseIsoDate(value: string): CivilDate {
  const m = DATE_RE.exec(value);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)) {
      return { year, month, day };
    }
  }
  throw new ScheduleError("INVALID_DATE", `Invalid IsoDate: ${JSON.stringify(value)}`);
}

/** Parses `"HH:mm"` into minutes after midnight. */
export function parseIsoTime(value: string): number {
  const m = TIME_RE.exec(value);
  if (!m) throw new ScheduleError("INVALID_TIME", `Invalid IsoTime: ${JSON.stringify(value)}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function toEpochDay(date: IsoDate): number {
  const { year, month, day } = parseIsoDate(date);
  return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}

export function epochDayToCivil(epochDay: number): CivilDate {
  const d = new Date(epochDay * MS_PER_DAY);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function fromEpochDay(epochDay: number): IsoDate {
  const { year, month, day } = epochDayToCivil(epochDay);
  return formatIsoDate(year, month, day);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromEpochDay(toEpochDay(date) + days);
}

/** ISO weekday (1 = Monday … 7 = Sunday) of an epoch day. 1970-01-01 was a Thursday. */
export function weekdayOfEpochDay(epochDay: number): Weekday {
  return (((((epochDay + 3) % 7) + 7) % 7) + 1) as Weekday;
}

export function isoWeekday(date: IsoDate): Weekday {
  return weekdayOfEpochDay(toEpochDay(date));
}

/**
 * Whether a day matches an nth-week rule: `n` in 1–5 means the nth occurrence of
 * its weekday in the month (days 1–7 → 1st, 8–14 → 2nd, …); `-1` means the last
 * occurrence (no further same weekday later in the month).
 */
export function matchesNthWeek(civil: CivilDate, nth: NthWeek): boolean {
  if (nth === -1) return civil.day + 7 > daysInMonth(civil.year, civil.month);
  return Math.ceil(civil.day / 7) === nth;
}

/** `"MM-DD"` of a civil date, used for yearly period matching. */
export function monthDay(civil: CivilDate): string {
  return `${pad2(civil.month)}-${pad2(civil.day)}`;
}
