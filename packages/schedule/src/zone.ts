/**
 * Europe/Budapest conversions between civil date + wall time and instants.
 *
 * Only explicit-zone APIs are used (`tzOffset` / `TZDate` from `@date-fns/tz`,
 * which read Intl time-zone data, plus UTC `Date` getters), so results never
 * depend on the process time zone.
 *
 * Note: we deliberately do NOT build instants with `new TZDate(y, m, d, h, mi, zone)`:
 * for the repeated hour of the autumn DST change its result depends on the
 * process time zone. {@link zonedTimeToInstant} resolves gaps and overlaps
 * explicitly instead.
 */
import { TZDate, tzOffset } from "@date-fns/tz";
import { format } from "date-fns";
import { formatIsoDate } from "./civil";
import { ScheduleError } from "./errors";
import type { IsoDate, IsoDateTime } from "./types";

export const TIME_ZONE = "Europe/Budapest";

const MS_PER_MIN = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MIN;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const HALF_DAY_MS = 12 * MS_PER_HOUR;
// Offset required: a datetime without one would be read in the process time zone.
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

function offsetAt(ms: number): number {
  return tzOffset(TIME_ZONE, new Date(ms));
}

// Performance: Intl lookups dominate the cost of resolving a year. For each UTC
// day index D we cache the offset if it is the same at D − 14 h and D + 36 h
// (i.e. no DST change near that day), else `null`. Any instant inside UTC day D,
// and the instant of any wall time on civil day D, lies in that window, so the
// cached offset is exact; days around a DST change take the slow, exact path.
const stableOffsets = new Map<number, number | null>();
const STABLE_CACHE_LIMIT = 4096;

/** Test hook: forget cached offsets. */
export function clearZoneCache(): void {
  stableOffsets.clear();
}

function stableOffset(dayIndex: number): number | null {
  let cached = stableOffsets.get(dayIndex);
  if (cached === undefined) {
    const start = dayIndex * MS_PER_DAY;
    const a = offsetAt(start - 14 * MS_PER_HOUR);
    cached = a === offsetAt(start + 36 * MS_PER_HOUR) ? a : null;
    if (stableOffsets.size >= STABLE_CACHE_LIMIT) stableOffsets.clear();
    stableOffsets.set(dayIndex, cached);
  }
  return cached;
}

/**
 * Instant (epoch ms) of a Budapest wall-clock time.
 *
 * - Ambiguous times (the repeated hour on the last Sunday of October) resolve to
 *   the **first** occurrence (summer time, `+02:00`).
 * - Non-existent times (the skipped hour on the last Sunday of March) are shifted
 *   forward by the gap, i.e. interpreted with the offset in force before the
 *   change: 02:30 → 03:30+02:00 (as RFC 5545 does).
 */
export function zonedTimeToInstant(
  year: number,
  month: number,
  day: number,
  minutesOfDay: number,
): number {
  const midnight = Date.UTC(year, month - 1, day);
  const wall = midnight + minutesOfDay * MS_PER_MIN;
  const stable = stableOffset(midnight / MS_PER_DAY);
  if (stable !== null) return wall - stable * MS_PER_MIN;

  const before = offsetAt(wall - HALF_DAY_MS);
  const after = offsetAt(wall + HALF_DAY_MS);
  // Larger offset first → earlier instant first.
  const candidates = before >= after ? [before, after] : [after, before];
  for (const offset of candidates) {
    const instant = wall - offset * MS_PER_MIN;
    if (offsetAt(instant) === offset) return instant;
  }
  return wall - before * MS_PER_MIN;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Formats an instant as `YYYY-MM-DDTHH:mm:ss±HH:MM` in Europe/Budapest. */
export function formatInstant(ms: number): IsoDateTime {
  const offset = stableOffset(Math.floor(ms / MS_PER_DAY)) ?? offsetAt(ms);
  const local = new Date(ms + offset * MS_PER_MIN);
  const abs = Math.abs(offset);
  return (
    formatIsoDate(local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate()) +
    `T${pad2(local.getUTCHours())}:${pad2(local.getUTCMinutes())}:${pad2(local.getUTCSeconds())}` +
    `${offset < 0 ? "-" : "+"}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`
  );
}

/** Parses an ISO-8601 instant; an explicit offset (or `Z`) is required. */
export function parseInstant(value: IsoDateTime): number {
  const ms = DATETIME_RE.test(value) ? Date.parse(value) : NaN;
  if (Number.isNaN(ms)) {
    throw new ScheduleError(
      "INVALID_DATETIME",
      `Invalid IsoDateTime (an explicit offset is required): ${JSON.stringify(value)}`,
    );
  }
  return ms;
}

/** Budapest civil date of an instant. */
export function budapestDateOf(ms: number): IsoDate {
  return format(new TZDate(ms, TIME_ZONE), "yyyy-MM-dd");
}

/** Europe/Budapest civil date of an ISO-8601 instant (offset required). */
export function toBudapestDate(instant: IsoDateTime): IsoDate {
  return budapestDateOf(parseInstant(instant));
}
