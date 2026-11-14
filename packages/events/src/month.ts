/** Month view helpers: a Monday-first grid and occurrences grouped by Budapest day. */
import type { ExpandableEvent, Occurrence } from "./expand";
import { daysInMonth, epochDay, formatDay, parseDay, weekdayOf, type IsoDate } from "./time";

export interface YearMonth {
  year: number;
  month: number;
}

export interface MonthGrid extends YearMonth {
  /** First and last day of the month. */
  first: IsoDate;
  last: IsoDate;
  /** Rows of 7 days, Monday first; days outside the month are `null`. */
  weeks: (IsoDate | null)[][];
}

/** Parses `2026-11` (years 1900–2999); `null` when malformed. */
export function parseYearMonth(value: string | null | undefined): YearMonth | null {
  const m = /^(\d{4})-(\d{2})$/.exec(value ?? "");
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (year < 1900 || year > 2999 || month < 1 || month > 12) return null;
  return { year, month };
}

export function formatYearMonth({ year, month }: YearMonth): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function addMonths({ year, month }: YearMonth, delta: number): YearMonth {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (((index % 12) + 12) % 12) + 1 };
}

/** The month containing a civil date. */
export function yearMonthOf(date: IsoDate): YearMonth {
  const [y, m] = date.split("-");
  parseDay(date);
  return { year: Number(y), month: Number(m) };
}

export function monthGrid({ year, month }: YearMonth): MonthGrid {
  const first = epochDay(year, month, 1);
  const count = daysInMonth(year, month);
  const cells: (IsoDate | null)[] = Array.from({ length: weekdayOf(first) - 1 }, () => null);
  for (let d = 0; d < count; d++) cells.push(formatDay(first + d));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (IsoDate | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return {
    year,
    month,
    first: formatDay(first),
    last: formatDay(first + count - 1),
    weeks,
  };
}

/**
 * Occurrences per Budapest day between `first` and `last` (inclusive). A multi-day occurrence is
 * listed on every day it covers; each day keeps the input order.
 */
export function occurrencesByDay<E extends ExpandableEvent>(
  occurrences: readonly Occurrence<E>[],
  first: IsoDate,
  last: IsoDate,
): Map<IsoDate, Occurrence<E>[]> {
  const from = parseDay(first);
  const to = parseDay(last);
  const byDay = new Map<IsoDate, Occurrence<E>[]>();
  for (const occ of occurrences) {
    const start = Math.max(parseDay(occ.date), from);
    const end = Math.min(parseDay(occ.lastDate), to);
    for (let d = start; d <= end; d++) {
      const key = formatDay(d);
      const list = byDay.get(key) ?? [];
      list.push(occ);
      byDay.set(key, list);
    }
  }
  return byDay;
}
