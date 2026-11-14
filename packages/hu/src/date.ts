import type {
  CivilDate,
  CivilTime,
  DateInput,
  IsoDate,
  IsoDateTime,
  IsoTime,
  IsoWeekday,
} from "./types";

/** IANA time zone used for all date logic. The process time zone is never consulted. */
export const BUDAPEST_TIME_ZONE = "Europe/Budapest";

/** Weekday names, Monday first (index = ISO weekday − 1). */
export const WEEKDAY_NAMES = [
  "hétfő",
  "kedd",
  "szerda",
  "csütörtök",
  "péntek",
  "szombat",
  "vasárnap",
] as const;

/** Full month names (index = month − 1). */
export const MONTH_NAMES = [
  "január",
  "február",
  "március",
  "április",
  "május",
  "június",
  "július",
  "augusztus",
  "szeptember",
  "október",
  "november",
  "december",
] as const;

/** Abbreviated month names as used in `nov. 15.` (index = month − 1). */
export const MONTH_NAMES_SHORT = [
  "jan.",
  "febr.",
  "márc.",
  "ápr.",
  "máj.",
  "jún.",
  "júl.",
  "aug.",
  "szept.",
  "okt.",
  "nov.",
  "dec.",
] as const;

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_TIME_RE = /^(\d{2}):(\d{2})(?::\d{2})?$/;
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;

const pad2 = (n: number): string => String(n).padStart(2, "0");

function utcDate(year: number, month: number, day: number): Date {
  // `Date.UTC` maps years 0–99 to 1900–1999; setUTCFullYear does not.
  const d = new Date(0);
  d.setUTCFullYear(year, month - 1, day);
  return d;
}

/**
 * Parses `"YYYY-MM-DD"` into its parts.
 *
 * @throws RangeError if the string is malformed or not a real calendar date.
 */
export function parseIsoDate(value: IsoDate): CivilDate {
  const m = ISO_DATE_RE.exec(value);
  if (!m) throw new RangeError(`Invalid ISO date: "${value}"`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const d = utcDate(year, month, day);
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    throw new RangeError(`Invalid ISO date: "${value}"`);
  }
  return { year, month, day };
}

/**
 * Parses `"HH:mm"` (or `"HH:mm:ss"`, seconds ignored) into its parts.
 *
 * @throws RangeError if the string is malformed or out of range.
 */
export function parseIsoTime(value: IsoTime): CivilTime {
  const m = ISO_TIME_RE.exec(value);
  if (!m) throw new RangeError(`Invalid ISO time: "${value}"`);
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) throw new RangeError(`Invalid ISO time: "${value}"`);
  return { hour, minute };
}

/**
 * Converts an `IsoDateTime` string (offset required) or a `Date` into a `Date`.
 * A string without an explicit offset is rejected because its meaning would
 * depend on the process time zone.
 *
 * @throws RangeError for malformed input or an invalid `Date`.
 */
export function toInstant(value: IsoDateTime | Date): Date {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new RangeError("Invalid Date");
    return value;
  }
  if (!ISO_DATETIME_RE.test(value)) {
    throw new RangeError(`Invalid ISO date-time (an explicit offset is required): "${value}"`);
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new RangeError(`Invalid ISO date-time: "${value}"`);
  return d;
}

const budapestParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: BUDAPEST_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Wall-clock date and time of an instant in Europe/Budapest. */
export function budapestWallClock(instant: Date): CivilDate & CivilTime {
  const out: Record<string, number> = {};
  for (const p of budapestParts.formatToParts(instant)) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return {
    year: out["year"] as number,
    month: out["month"] as number,
    day: out["day"] as number,
    hour: out["hour"] as number,
    minute: out["minute"] as number,
  };
}

/** Formats parts as `"YYYY-MM-DD"`. */
export function toIsoDate({ year, month, day }: CivilDate): IsoDate {
  return `${String(year).padStart(4, "0")}-${pad2(month)}-${pad2(day)}`;
}

/**
 * Resolves any {@link DateInput} to a civil date.
 * `IsoDate` strings pass through (validated); instants are converted to Europe/Budapest.
 */
export function toCivilDate(input: DateInput): CivilDate {
  if (typeof input === "string" && ISO_DATE_RE.test(input)) return parseIsoDate(input);
  const w = budapestWallClock(toInstant(input));
  return { year: w.year, month: w.month, day: w.day };
}

/** Like {@link toCivilDate} but returns the `"YYYY-MM-DD"` string. */
export function toIsoDateString(input: DateInput): IsoDate {
  return toIsoDate(toCivilDate(input));
}

/**
 * The current civil date in Europe/Budapest for an explicit "now".
 * Never reads the system clock.
 */
export function todayInBudapest(now: IsoDateTime | Date): IsoDate {
  return toIsoDate(budapestWallClock(toInstant(now)));
}

function civilToUtc(c: CivilDate): Date {
  return utcDate(c.year, c.month, c.day);
}

/** ISO weekday (1 = Monday … 7 = Sunday) of a date. */
export function isoWeekday(input: DateInput): IsoWeekday {
  const dow = civilToUtc(toCivilDate(input)).getUTCDay();
  return (dow === 0 ? 7 : dow) as IsoWeekday;
}

/** Adds (or subtracts) whole calendar days. DST does not matter: this is pure civil arithmetic. */
export function addDays(input: DateInput, days: number): IsoDate {
  const d = civilToUtc(toCivilDate(input));
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() });
}

/** Whole days from `a` to `b` (positive if `b` is later). */
export function daysBetween(a: DateInput, b: DateInput): number {
  const ms = civilToUtc(toCivilDate(b)).getTime() - civilToUtc(toCivilDate(a)).getTime();
  return Math.round(ms / 86_400_000);
}

/** The Monday of the ISO week containing the date. */
export function startOfIsoWeek(input: DateInput): IsoDate {
  return addDays(input, 1 - isoWeekday(input));
}

/** Options for capitalisation of names. */
export interface CapitalizeOptions {
  /** Upper-case the first letter (for headings): `Hétfő`. Default `false`. */
  capitalize?: boolean;
}

function cap(text: string, capitalize: boolean | undefined): string {
  return capitalize ? text.charAt(0).toLocaleUpperCase("hu") + text.slice(1) : text;
}

/**
 * Hungarian weekday name.
 *
 * @param weekdayOrDate an ISO weekday number (1 = Monday … 7 = Sunday) or any {@link DateInput}.
 * @example weekdayName(4) // "csütörtök"
 * @example weekdayName("2026-11-14", { capitalize: true }) // "Szombat"
 */
export function weekdayName(
  weekdayOrDate: number | DateInput,
  options: CapitalizeOptions = {},
): string {
  let wd: number;
  if (typeof weekdayOrDate === "number") {
    if (!Number.isInteger(weekdayOrDate) || weekdayOrDate < 1 || weekdayOrDate > 7) {
      throw new RangeError(`Invalid ISO weekday: ${weekdayOrDate}`);
    }
    wd = weekdayOrDate;
  } else {
    wd = isoWeekday(weekdayOrDate);
  }
  return cap(WEEKDAY_NAMES[wd - 1] as string, options.capitalize);
}

/** All seven weekday names, Monday first. */
export function weekdayNames(options: CapitalizeOptions = {}): string[] {
  return WEEKDAY_NAMES.map((n) => cap(n, options.capitalize));
}

/** Hungarian month name for month 1–12 (`short` gives `nov.`). */
export function monthName(
  month: number,
  options: CapitalizeOptions & { short?: boolean } = {},
): string {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`Invalid month: ${month}`);
  }
  const table = options.short ? MONTH_NAMES_SHORT : MONTH_NAMES;
  return cap(table[month - 1] as string, options.capitalize);
}

/**
 * Long date with weekday.
 * @example formatDateLong("2026-11-12") // "2026. november 12., csütörtök"
 */
export function formatDateLong(input: DateInput): string {
  const c = toCivilDate(input);
  return `${c.year}. ${monthName(c.month)} ${c.day}., ${weekdayName(toIsoDate(c))}`;
}

/**
 * Short numeric date.
 * @example formatDateShort("2026-11-12") // "2026. 11. 12."
 */
export function formatDateShort(input: DateInput): string {
  const c = toCivilDate(input);
  return `${c.year}. ${pad2(c.month)}. ${pad2(c.day)}.`;
}

/** Options for {@link formatMonthDay}. */
export interface MonthDayOptions {
  /** `"short"` → `nov. 15.` (default), `"long"` → `november 15.`. */
  style?: "short" | "long";
}

/**
 * Month and day without year.
 * @example formatMonthDay("2026-11-15") // "nov. 15."
 * @example formatMonthDay("2026-11-15", { style: "long" }) // "november 15."
 */
export function formatMonthDay(input: DateInput, options: MonthDayOptions = {}): string {
  const c = toCivilDate(input);
  return `${monthName(c.month, { short: options.style !== "long" })} ${c.day}.`;
}

/** Options for {@link formatRelativeDay}. */
export interface RelativeDayOptions {
  /** Lower-case the result (`ma`, `szombat, nov. 15.`). Default `false` (headings: `Ma`). */
  lowercase?: boolean;
}

/**
 * Relative label for a day compared to an explicit "now" (evaluated in Budapest time):
 * `Ma`, `Holnap`, `Tegnap`, otherwise weekday and short date.
 *
 * @example formatRelativeDay("2026-11-15", "2026-11-12T10:00:00+01:00") // "Szombat, nov. 15."
 */
export function formatRelativeDay(
  date: DateInput,
  now: DateInput,
  options: RelativeDayOptions = {},
): string {
  const diff = daysBetween(now, date);
  let label: string;
  if (diff === 0) label = "Ma";
  else if (diff === 1) label = "Holnap";
  else if (diff === -1) label = "Tegnap";
  else label = `${weekdayName(date, { capitalize: true })}, ${formatMonthDay(date)}`;
  return options.lowercase ? label.charAt(0).toLocaleLowerCase("hu") + label.slice(1) : label;
}

/**
 * Compact date range. Collapses repeated month / year.
 *
 * @example formatDateRange("2026-11-09", "2026-11-15") // "nov. 9–15."
 * @example formatDateRange("2026-11-30", "2026-12-06") // "nov. 30. – dec. 6."
 * @example formatDateRange("2026-12-28", "2027-01-03") // "2026. dec. 28. – 2027. jan. 3."
 * @throws RangeError if `end` is before `start`.
 */
export function formatDateRange(start: DateInput, end: DateInput): string {
  const a = toCivilDate(start);
  const b = toCivilDate(end);
  const cmp = toIsoDate(a).localeCompare(toIsoDate(b));
  if (cmp > 0) throw new RangeError("Range end is before its start");
  if (cmp === 0) return formatMonthDay(toIsoDate(a));
  if (a.year !== b.year) {
    return `${a.year}. ${formatMonthDay(toIsoDate(a))} – ${b.year}. ${formatMonthDay(toIsoDate(b))}`;
  }
  if (a.month !== b.month) {
    return `${formatMonthDay(toIsoDate(a))} – ${formatMonthDay(toIsoDate(b))}`;
  }
  return `${monthName(a.month, { short: true })} ${a.day}–${b.day}.`;
}

/**
 * Label for the Monday-first ISO week that contains `dateInWeek`.
 *
 * @example formatWeekRange("2026-11-12") // "nov. 9–15."
 */
export function formatWeekRange(dateInWeek: DateInput): string {
  const monday = startOfIsoWeek(dateInWeek);
  return formatDateRange(monday, addDays(monday, 6));
}
