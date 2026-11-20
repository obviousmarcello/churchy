import { addDays, isoWeekday, type IsoWeekday } from "@churchy/hu";

/**
 * Working-day calculation (SDD §25.3, L-12): a person's work pattern, minus public holidays,
 * adjusted by the platform's swapped working days (*áthelyezett munkanapok*). Pure; the calendar
 * data is passed in (the platform `workday_calendar`).
 */

export type WorkdayKind = "holiday" | "swapped_workday" | "swapped_restday";

export interface WorkdayEntry {
  readonly date: string;
  readonly kind: WorkdayKind;
  readonly name?: string;
}

/** Lookup of the platform working-day calendar. */
export interface WorkdayCalendar {
  readonly holidays: ReadonlyMap<string, string>;
  readonly swappedWorkdays: ReadonlyMap<string, string>;
  readonly swappedRestdays: ReadonlyMap<string, string>;
}

export function buildWorkdayCalendar(entries: readonly WorkdayEntry[]): WorkdayCalendar {
  const holidays = new Map<string, string>();
  const swappedWorkdays = new Map<string, string>();
  const swappedRestdays = new Map<string, string>();
  for (const e of entries) {
    const target =
      e.kind === "holiday"
        ? holidays
        : e.kind === "swapped_workday"
          ? swappedWorkdays
          : swappedRestdays;
    target.set(e.date, e.name ?? "");
  }
  return { holidays, swappedWorkdays, swappedRestdays };
}

export const EMPTY_CALENDAR: WorkdayCalendar = buildWorkdayCalendar([]);

/** Why a day does (not) count, for explanations in the UI. */
export type DayKind = "workday" | "swappedWorkday" | "holiday" | "swappedRestday" | "notInPattern";

const MON_FRI: readonly IsoWeekday[] = [1, 2, 3, 4, 5];

/** Office-type pattern (only Monday–Friday): follows the public working-day swaps. */
const followsWeekdayCalendar = (weekdays: readonly number[]): boolean =>
  weekdays.every((d) => d <= 5);

/** The full Monday–Friday week: a swapped Saturday workday applies to them. */
const worksFullWeek = (weekdays: readonly number[]): boolean =>
  MON_FRI.every((d) => weekdays.includes(d));

/** How `date` counts for a person with the given work pattern. */
export function dayKind(
  date: string,
  weekdays: readonly number[],
  calendar: WorkdayCalendar,
): DayKind {
  if (calendar.holidays.has(date)) return "holiday";
  const weekday = isoWeekday(date);
  if (weekdays.includes(weekday)) {
    return followsWeekdayCalendar(weekdays) && calendar.swappedRestdays.has(date)
      ? "swappedRestday"
      : "workday";
  }
  if (calendar.swappedWorkdays.has(date) && worksFullWeek(weekdays)) return "swappedWorkday";
  return "notInPattern";
}

export const countsAsWorkday = (kind: DayKind): boolean =>
  kind === "workday" || kind === "swappedWorkday";

export interface WorkingDaysInput {
  /** ISO weekdays (1 = Monday … 7 = Sunday) the person works, e.g. a sacristan Tue–Sun. */
  readonly weekdays: readonly number[];
  readonly startDate: string;
  readonly endDate: string;
  /** The first day is taken as a half day (−0.5). */
  readonly halfDayStart?: boolean;
  /** The last day is taken as a half day (−0.5). */
  readonly halfDayEnd?: boolean;
  readonly calendar: WorkdayCalendar;
}

export interface DayBreakdown {
  readonly date: string;
  readonly kind: DayKind;
}

/** Longest period the calculation accepts (guards against runaway loops). */
export const MAX_PERIOD_DAYS = 400;

/** Every day of the period with how it counts. Empty when the period is reversed or too long. */
export function breakdown(
  input: Omit<WorkingDaysInput, "halfDayStart" | "halfDayEnd">,
): DayBreakdown[] {
  const out: DayBreakdown[] = [];
  if (input.endDate < input.startDate) return out;
  let date = input.startDate;
  for (let i = 0; i < MAX_PERIOD_DAYS && date <= input.endDate; i += 1) {
    out.push({ date, kind: dayKind(date, input.weekdays, input.calendar) });
    date = addDays(date, 1);
  }
  return out;
}

/**
 * Working days of the period (multiples of 0.5): the days the person works that are no public
 * holiday and no swapped rest day (plus swapped workdays for full-week workers), minus 0.5 for a
 * half day at the start and/or the end. A single day with either flag is one half day. A half day
 * on a non-working boundary day changes nothing.
 */
export function workingDays(input: WorkingDaysInput): number {
  const days = breakdown(input);
  if (days.length === 0) return 0;
  const counts = days.filter((d) => countsAsWorkday(d.kind));
  let total = counts.length;
  const first = days[0] as DayBreakdown;
  const last = days[days.length - 1] as DayBreakdown;
  if (first.date === last.date) {
    if ((input.halfDayStart || input.halfDayEnd) && countsAsWorkday(first.kind)) total -= 0.5;
    return total;
  }
  if (input.halfDayStart && countsAsWorkday(first.kind)) total -= 0.5;
  if (input.halfDayEnd && countsAsWorkday(last.kind)) total -= 0.5;
  return total;
}

/** Whether the person is expected to work on `date` (used for SLA clocks and absence grids). */
export const worksOn = (date: string, weekdays: readonly number[], c: WorkdayCalendar): boolean =>
  countsAsWorkday(dayKind(date, weekdays, c));

/** Default public working day (Mon–Fri, no holiday; swaps respected) — SLA working hours. */
export const isPublicWorkday = (date: string, calendar: WorkdayCalendar): boolean =>
  worksOn(date, MON_FRI, calendar);
