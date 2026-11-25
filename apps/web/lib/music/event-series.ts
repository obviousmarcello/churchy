// A series of events: the same times on each chosen weekday between two
// days, e.g. each Sunday for three months, or a morning and an evening event
// on each day for ten days. The dates and times are in the time zone of the
// runtime (in the browser: the viewer's), so a series keeps its local time
// of day across a daylight saving time change.

/** The most events that one series can add. Keep in sync with the model. */
export const MAX_SERIES_EVENTS = 200;

/** One event on each day of the series. */
export type SeriesSlot = {
  title: string;
  /** Local time of day, "HH:MM". */
  time: string;
  durationMinutes: number;
};

export type SeriesPlan = {
  /** The first day, "YYYY-MM-DD". */
  from: string;
  /** The last day, "YYYY-MM-DD". Included. */
  until: string;
  /** The days of the week, 0 (Sunday) to 6 (Saturday), as `Date.getDay()`. */
  weekdays: readonly number[];
  slots: readonly SeriesSlot[];
};

export type SeriesEvent = {
  title: string;
  startsAt: Date;
  durationMinutes: number;
};

/**
 * The events of the plan, by start time. Empty if a day or the weekdays are
 * missing, or if `until` is before `from`. Slots without a valid time are
 * left out. Stops after `MAX_SERIES_EVENTS + 1` events, so a caller can find
 * a plan that is too large without a long loop.
 */
export function planEventSeries({ from, until, weekdays, slots }: SeriesPlan): SeriesEvent[] {
  const first = parseDay(from);
  const last = parseDay(until);
  if (!first || !last || weekdays.length === 0) return [];

  const times = slots
    .map((slot) => ({ slot, time: parseTime(slot.time) }))
    .filter((entry): entry is { slot: SeriesSlot; time: [number, number] } => entry.time !== null)
    .toSorted((a, b) => a.time[0] * 60 + a.time[1] - (b.time[0] * 60 + b.time[1]));
  if (times.length === 0) return [];

  const days = new Set(weekdays);
  const events: SeriesEvent[] = [];
  // The day of the month goes up by one. `Date` moves on to the next month.
  for (const day = new Date(first); day <= last; day.setDate(day.getDate() + 1)) {
    if (!days.has(day.getDay())) continue;
    for (const { slot, time } of times) {
      const startsAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), time[0], time[1]);
      events.push({ title: slot.title, startsAt, durationMinutes: slot.durationMinutes });
      if (events.length > MAX_SERIES_EVENTS) return events;
    }
  }
  return events;
}

/** "YYYY-MM-DD" for the local day of `date`, e.g. for a date input. */
export function toDayString(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * The last day of a period that starts on `from`, e.g. 14 days or 3 months.
 * A period of 3 months from 2026-10-11 ends on 2027-01-10. If the month is
 * shorter, it ends on the last day of that month. Empty if `from` is not a day.
 */
export function periodEnd(from: string, period: { days: number } | { months: number }): string {
  const day = parseDay(from);
  if (!day) return "";

  if ("days" in period) {
    day.setDate(day.getDate() + period.days - 1);
    return toDayString(day);
  }
  const target = new Date(day.getFullYear(), day.getMonth() + period.months, 1);
  const lastOfMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day.getDate(), lastOfMonth + 1) - 1);
  return toDayString(target);
}

/** Local midnight of a "YYYY-MM-DD" day, or null. */
function parseDay(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  const date = new Date(year, month, day);
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day
    ? date
    : null;
}

/** [hours, minutes] of "HH:MM", or null. */
function parseTime(value: string): [number, number] | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [hours, minutes] = [Number(match[1]), Number(match[2])];
  return hours < 24 && minutes < 60 ? [hours, minutes] : null;
}
