import { monthDay, parseIsoDate, toEpochDay, type CivilDate } from "./civil";
import type { SchedulePeriod } from "./types";

/** A period compiled into a fast "is it active on this day?" predicate. */
export type PeriodMatcher = (epochDay: number, civil: CivilDate) => boolean;

/**
 * Period activity (both bounds inclusive, `null` = open-ended):
 *
 * - non-yearly: `validFrom ≤ d ≤ validTo`;
 * - yearly: only month-day counts. `validFrom` defaults to `01-01`, `validTo`
 *   to `12-31`. If `validFrom`'s month-day is after `validTo`'s, the range wraps
 *   the year end (e.g. `12-01 → 01-06` is active Dec 1–31 and Jan 1–6 every year).
 */
export function compilePeriod(period: SchedulePeriod): PeriodMatcher {
  if (period.yearly) {
    const from = period.validFrom === null ? "01-01" : monthDay(parseIsoDate(period.validFrom));
    const to = period.validTo === null ? "12-31" : monthDay(parseIsoDate(period.validTo));
    if (from <= to) {
      return (_epochDay, civil) => {
        const md = monthDay(civil);
        return md >= from && md <= to;
      };
    }
    return (_epochDay, civil) => {
      const md = monthDay(civil);
      return md >= from || md <= to;
    };
  }
  const from = period.validFrom === null ? -Infinity : toEpochDay(period.validFrom);
  const to = period.validTo === null ? Infinity : toEpochDay(period.validTo);
  return (epochDay) => epochDay >= from && epochDay <= to;
}

/** Whether `period` is active on the civil date `date`. */
export function isPeriodActive(period: SchedulePeriod, date: string): boolean {
  return compilePeriod(period)(toEpochDay(date), parseIsoDate(date));
}
