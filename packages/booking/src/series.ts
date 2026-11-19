import { addDays, isoWeekday, type IsoDate } from "@churchy/hu";
import { localParts, localToInstant } from "./time";

/** Series are expanded for a rolling 12 months (SDD §23.3). */
export const SERIES_HORIZON_DAYS = 365;

export interface Occurrence {
  readonly startsAt: string;
  readonly endsAt: string;
}

/** Last date a series may reach: 12 months after `today`. */
export function seriesHorizon(today: IsoDate): IsoDate {
  return addDays(today, SERIES_HORIZON_DAYS);
}

/** `FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20271119` (ISO weekdays 1…7). */
export function weeklyRule(weekdays: readonly number[], until: IsoDate): string {
  const codes = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
  const days = [...new Set(weekdays)].sort((a, b) => a - b).map((d) => codes[d - 1]);
  return `FREQ=WEEKLY;BYDAY=${days.join(",")};UNTIL=${until.replaceAll("-", "")}`;
}

export interface WeeklySeries {
  /** First day the series may occur on. */
  readonly from: IsoDate;
  /** Last day (inclusive); clamped to the 12-month horizon of `today`. */
  readonly until: IsoDate;
  readonly weekdays: readonly number[];
  /** Budapest wall-clock `HH:MM`. */
  readonly startTime: string;
  readonly endTime: string;
  readonly today: IsoDate;
}

/**
 * The concrete occurrences of a weekly series, in Europe/Budapest wall-clock time (so a 18:00
 * booking stays at 18:00 across the DST change), up to `until` or the 12-month horizon.
 */
export function expandWeekly(series: WeeklySeries): Occurrence[] {
  const last = [series.until, seriesHorizon(series.today)].sort()[0] as IsoDate;
  const days = new Set(series.weekdays);
  const out: Occurrence[] = [];
  for (let date = series.from; date <= last; date = addDays(date, 1)) {
    if (!days.has(isoWeekday(date))) continue;
    out.push({
      startsAt: localToInstant(date, series.startTime),
      endsAt: localToInstant(date, series.endTime),
    });
  }
  return out;
}

/** *„52 alkalomból 3 ütközik”* — counts for the message. */
export function conflictSummary(
  total: number,
  conflicting: number,
): { total: number; conflicting: number; free: number } {
  return { total, conflicting, free: total - conflicting };
}

export type EditScope = "this" | "following" | "all";

export interface SeriesMember {
  readonly id: string;
  readonly seriesId: string | null;
  readonly startsAt: string;
}

/**
 * The bookings an edit or cancellation touches (calendar conventions, SDD §23.3): the booking
 * itself, it and all later ones of its series, or the whole series. A booking outside a series is
 * always just itself.
 */
export function scopeTargets<T extends SeriesMember>(
  all: readonly T[],
  target: T,
  scope: EditScope,
): T[] {
  if (scope === "this" || target.seriesId === null) return [target];
  const same = all
    .filter((b) => b.seriesId === target.seriesId)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  return scope === "all"
    ? same
    : same.filter((b) => Date.parse(b.startsAt) >= Date.parse(target.startsAt));
}

/**
 * Moves a booking by `deltaDays` civil days and gives it the wall-clock `startTime`/`endTime`;
 * the other occurrences of a series keep their own dates.
 */
export function retime(
  booking: { startsAt: string },
  change: { deltaDays: number; startTime: string; endTime: string },
): Occurrence {
  const date = addDays(localParts(booking.startsAt).date, change.deltaDays);
  return {
    startsAt: localToInstant(date, change.startTime),
    endsAt: localToInstant(date, change.endTime),
  };
}
