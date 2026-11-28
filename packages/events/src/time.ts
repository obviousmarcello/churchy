/**
 * Civil-date arithmetic on epoch days and Europe/Budapest conversions between wall-clock time and
 * instants. Only UTC `Date` getters and an explicit-zone `Intl.DateTimeFormat` are used, so nothing
 * here depends on the process time zone.
 */

export type IsoDate = string;
export type IsoDateTime = string;

export const TIME_ZONE = "Europe/Budapest";

export const MS_PER_MIN = 60_000;
export const MS_PER_HOUR = 60 * MS_PER_MIN;
export const MS_PER_DAY = 24 * MS_PER_HOUR;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
// An explicit offset is required: a datetime without one would be read in the process time zone.
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

export interface Ymd {
  year: number;
  month: number; // 1–12
  day: number; // 1–31
}

const pad2 = (n: number): string => (n < 10 ? `0${n}` : String(n));

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Epoch day (days since 1970-01-01) of a civil date. */
export function epochDay(year: number, month: number, day: number): number {
  return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}

export function ymdOf(day: number): Ymd {
  const d = new Date(day * MS_PER_DAY);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** ISO weekday (1 = Monday … 7 = Sunday) of an epoch day. 1970-01-01 was a Thursday. */
export function weekdayOf(day: number): number {
  return ((((day + 3) % 7) + 7) % 7) + 1;
}

export function formatDay(day: number): IsoDate {
  const { year, month, day: d } = ymdOf(day);
  return `${String(year).padStart(4, "0")}-${pad2(month)}-${pad2(d)}`;
}

/** Parses and validates `YYYY-MM-DD` into an epoch day. */
export function parseDay(value: string): number {
  const m = DATE_RE.exec(value);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)) {
      return epochDay(year, month, day);
    }
  }
  throw new RangeError(`Invalid IsoDate: ${JSON.stringify(value)}`);
}

/** Parses an ISO-8601 instant; an explicit offset (or `Z`) is required. */
export function parseInstant(value: string): number {
  const ms = DATETIME_RE.test(value) ? Date.parse(value) : NaN;
  if (Number.isNaN(ms)) {
    throw new RangeError(`Invalid IsoDateTime (an explicit offset is required): ${value}`);
  }
  return ms;
}

let formatter: Intl.DateTimeFormat | undefined;

/** UTC offset of Europe/Budapest at an instant, in minutes (60 or 120). */
export function offsetAt(ms: number): number {
  formatter ??= new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  });
  const parts: Record<string, number> = {};
  for (const p of formatter.formatToParts(new Date(ms))) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  const wall = Date.UTC(
    parts.year as number,
    (parts.month as number) - 1,
    parts.day as number,
    parts.hour as number,
    parts.minute as number,
  );
  return Math.round((wall - (ms - (ms % MS_PER_MIN))) / MS_PER_MIN);
}

/**
 * Instant (epoch ms) of a Budapest wall-clock time: `msOfDay` milliseconds after local midnight of
 * epoch day `day`.
 *
 * - Ambiguous times (the repeated hour on the last Sunday of October) resolve to the **first**
 *   occurrence (summer time, `+02:00`).
 * - Non-existent times (the skipped hour on the last Sunday of March) are shifted forward by the
 *   gap (02:30 → 03:30+02:00), as RFC 5545 §3.3.5 prescribes.
 */
export function zonedToInstant(day: number, msOfDay: number): number {
  const wall = day * MS_PER_DAY + msOfDay;
  const before = offsetAt(wall - 12 * MS_PER_HOUR);
  const after = offsetAt(wall + 12 * MS_PER_HOUR);
  // Larger offset first → earlier instant first.
  for (const offset of before >= after ? [before, after] : [after, before]) {
    const instant = wall - offset * MS_PER_MIN;
    if (offsetAt(instant) === offset) return instant;
  }
  // In the gap: interpret with the offset in force before the change.
  return wall - before * MS_PER_MIN;
}

/** Budapest local epoch day and milliseconds after local midnight of an instant. */
export function localOf(ms: number): { day: number; msOfDay: number } {
  const local = ms + offsetAt(ms) * MS_PER_MIN;
  const day = Math.floor(local / MS_PER_DAY);
  return { day, msOfDay: local - day * MS_PER_DAY };
}

/** Formats an instant as `YYYY-MM-DDTHH:mm:ss±HH:MM` in Europe/Budapest. */
export function formatInstant(ms: number): IsoDateTime {
  const offset = offsetAt(ms);
  const { day, msOfDay } = localOf(ms);
  const h = Math.floor(msOfDay / MS_PER_HOUR);
  const mi = Math.floor((msOfDay % MS_PER_HOUR) / MS_PER_MIN);
  const s = Math.floor((msOfDay % MS_PER_MIN) / 1000);
  const sign = offset < 0 ? "-" : "+";
  const abs = Math.abs(offset);
  return (
    `${formatDay(day)}T${pad2(h)}:${pad2(mi)}:${pad2(s)}` +
    `${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`
  );
}

/** Budapest civil date of an ISO instant. */
export function budapestDate(instant: IsoDateTime): IsoDate {
  return formatDay(localOf(parseInstant(instant)).day);
}

/** Budapest local midnight of a civil date, as an ISO instant. */
export function startOfDay(date: IsoDate): IsoDateTime {
  return formatInstant(zonedToInstant(parseDay(date), 0));
}
