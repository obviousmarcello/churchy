// The time zone of the church. The announcements put the calendar entries in
// weeks and months by their days here, and show their times here, on each
// device. `church_day()` in the database uses the same zone (the migration
// `app_config`).
//
// The zone is in the configuration of the app (`src/lib/app-config.ts`), the
// same for all users. `setChurchTimeZone` sets it: in the browser
// `AppConfigProvider`, on the server `syncChurchTimeZone()` (in
// `src/server/models/app-config.ts`) before the code that uses it.

let zone = "Europe/Budapest";
let formats = makeFormats(zone);

/** The time zone of the church, e.g. "Europe/Budapest". */
export function churchTimeZone(): string {
  return zone;
}

/** Sets the time zone of the church. A zone that `Intl` does not know changes nothing. */
export function setChurchTimeZone(next: string): void {
  if (next === zone) return;
  try {
    formats = makeFormats(next);
    zone = next;
  } catch {
    // Keep the zone.
  }
}

function makeFormats(timeZone: string) {
  return {
    day: new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }),
    offset: new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    }),
  };
}

/** A day as `YYYY-MM-DD`. Days compare as strings. */
export type DayKey = string;

/** The day of an instant in the time zone of the church. */
export function churchDay(instant: Date | string): DayKey {
  const parts = formats.day.formatToParts(
    typeof instant === "string" ? new Date(instant) : instant,
  );
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** A day as a `Date` at 00:00 UTC, for the arithmetic of days. */
function utcDate(day: DayKey): Date {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, date));
}

function dayOf(date: Date): DayKey {
  return date.toISOString().slice(0, 10);
}

/** The day `count` days after `day` (before it for a negative count). */
export function addDays(day: DayKey, count: number): DayKey {
  const date = utcDate(day);
  date.setUTCDate(date.getUTCDate() + count);
  return dayOf(date);
}

/** The last day of the month of `day`. */
export function endOfMonth(day: DayKey): DayKey {
  const date = utcDate(day);
  return dayOf(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)));
}

/** The first day of the month after the month of `day`. */
export function startOfNextMonth(day: DayKey): DayKey {
  return addDays(endOfMonth(day), 1);
}

/** The offset of the time zone of the church from UTC at an instant, in milliseconds. */
function churchOffset(instant: number): number {
  const parts = Object.fromEntries(
    formats.offset.formatToParts(new Date(instant)).map((p) => [p.type, Number(p.value)]),
  );
  const local = Date.UTC(
    parts.year!,
    parts.month! - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return local - Math.floor(instant / 1000) * 1000;
}

/** The instant of a wall-clock time in the time zone of the church, e.g. of a calendar entry without a time zone. */
export function churchTime(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  const guess = wall - churchOffset(wall);
  // At a change of the offset, the offset of the guess is the right one.
  return new Date(wall - churchOffset(guess));
}

/** The wall-clock time of an instant in the time zone of the church, for a `datetime-local` field: "2026-11-01T10:00". */
export function churchWallTime(instant: Date | string): string {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  const parts = Object.fromEntries(
    formats.offset.formatToParts(date).map((p) => [p.type, p.value.padStart(2, "0")]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** The instant of a `datetime-local` value ("2026-11-01T10:00") in the time zone of the church. Null for a bad value. */
export function fromChurchWallTime(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  return churchTime(year, month, day, hour, minute);
}

/** Whether a string is a day, e.g. "2026-11-01". */
export function isDayKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
