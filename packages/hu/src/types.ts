/**
 * Shared value types used across the Churchy monorepo.
 *
 * These are intentionally plain string aliases (no branding, no zod): the
 * formats are enforced at runtime by the parsing helpers in this package.
 */

/** Civil (calendar) date without time zone, `"YYYY-MM-DD"`. */
export type IsoDate = string;

/** Wall-clock time of day, `"HH:mm"` (a `":ss"` suffix is tolerated on input). */
export type IsoTime = string;

/** Instant as ISO-8601 with an explicit offset, e.g. `"2026-11-12T18:00:00+01:00"` or `"…Z"`. */
export type IsoDateTime = string;

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * Anything that identifies a point on the calendar.
 *
 * - `IsoDate` strings are used as-is (civil date, no time zone involved).
 * - `IsoDateTime` strings and `Date` objects are instants; they are converted
 *   to a civil date / wall-clock time in `Europe/Budapest`.
 */
export type DateInput = IsoDate | IsoDateTime | Date;

/** Anything that identifies a time of day: an `IsoTime`, or an instant (shown in Budapest time). */
export type TimeInput = IsoTime | IsoDateTime | Date;

/** The grammatical article of Hungarian: `a` before consonants, `az` before vowels. */
export type Article = "a" | "az";

/** Parsed civil date. `month` is 1–12. */
export interface CivilDate {
  year: number;
  month: number;
  day: number;
}

/** Parsed time of day. */
export interface CivilTime {
  hour: number;
  minute: number;
}
