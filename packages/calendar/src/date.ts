/**
 * Civil-date arithmetic on ISO `YYYY-MM-DD` strings.
 *
 * Everything here is pure integer arithmetic on the proleptic Gregorian
 * calendar (Howard Hinnant's `days_from_civil` / `civil_from_days`). No `Date`
 * object is ever created, so results cannot depend on the server timezone.
 */

/** A civil date as an ISO 8601 calendar date string: `"YYYY-MM-DD"`. */
export type IsoDate = string;

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface CivilDate {
  year: number;
  month: number;
  day: number;
}

/** First and last year supported (the Gregorian computus starts in 1583). */
export const MIN_YEAR = 1583;
export const MAX_YEAR = 9999;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function assertYear(year: number): void {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw new RangeError(`Year out of supported range ${MIN_YEAR}–${MAX_YEAR}: ${year}`);
  }
}

/** Parses and validates an ISO date. Throws `RangeError` on malformed or impossible dates. */
export function parseIsoDate(date: IsoDate): CivilDate {
  const match = ISO_DATE.exec(date);
  if (!match) throw new RangeError(`Invalid ISO date (expected YYYY-MM-DD): ${String(date)}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  assertYear(year);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new RangeError(`Invalid ISO date: ${date}`);
  }
  return { year, month, day };
}

/** Builds an ISO date from its parts (validated). */
export function isoDate(year: number, month: number, day: number): IsoDate {
  const text = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  parseIsoDate(text);
  return text;
}

/** Days since 1970-01-01 (may be negative). */
export function toDayNumber(date: IsoDate): number {
  const { year, month, day } = parseIsoDate(date);
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month > 2 ? month - 3 : month + 9) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Inverse of {@link toDayNumber}. */
export function fromDayNumber(dayNumber: number): IsoDate {
  const z = dayNumber + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  const year = yoe + era * 400 + (month <= 2 ? 1 : 0);
  return isoDate(year, month, day);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromDayNumber(toDayNumber(date) + days);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return toDayNumber(to) - toDayNumber(from);
}

export function isoWeekday(date: IsoDate): IsoWeekday {
  // 1970-01-01 was a Thursday (4).
  return (((((toDayNumber(date) + 3) % 7) + 7) % 7) + 1) as IsoWeekday;
}

/** The Sunday on or before `date`. */
export function sundayOnOrBefore(date: IsoDate): IsoDate {
  return addDays(date, -(isoWeekday(date) % 7));
}

/** The first Sunday strictly after `date`. */
export function sundayAfter(date: IsoDate): IsoDate {
  return addDays(date, 7 - (isoWeekday(date) % 7));
}
