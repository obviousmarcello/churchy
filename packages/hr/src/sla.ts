import { addDays, budapestWallClock } from "@churchy/hu";
import { isPublicWorkday, type WorkdayCalendar } from "./workdays";

/**
 * SLA clock (SDD §25.5): `sla_hours` count working hours — 08:00–16:00 on working days by
 * default, Europe/Budapest, with the Hungarian working-day calendar. Reminder at 75 %, then
 * overdue. Pure: "now" is passed in (mockable clock).
 */

export interface WorkingHours {
  /** Minutes after midnight. */
  readonly open: number;
  readonly close: number;
}

export const DEFAULT_WORKING_HOURS: WorkingHours = { open: 8 * 60, close: 16 * 60 };

/** Share of the SLA after which the first reminder is due. */
export const REMINDER_RATIO = 0.75;

const MAX_DAYS = 2000;

interface Wall {
  readonly date: string;
  readonly minute: number;
}

function wall(instant: Date): Wall {
  const w = budapestWallClock(instant);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${String(w.year).padStart(4, "0")}-${pad(w.month)}-${pad(w.day)}`,
    minute: w.hour * 60 + w.minute,
  };
}

/** The instant of a Budapest wall-clock time (DST-safe: tries both offsets). */
function instantAt(date: string, minute: number): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const base = Date.UTC(y, m - 1, d, Math.floor(minute / 60), minute % 60);
  for (const offsetHours of [1, 2]) {
    const candidate = new Date(base - offsetHours * 3_600_000);
    const w = wall(candidate);
    if (w.date === date && w.minute === minute) return candidate;
  }
  return new Date(base - 3_600_000);
}

const asDate = (value: Date | string): Date =>
  typeof value === "string" ? new Date(value) : value;

function nextWorkday(date: string, calendar: WorkdayCalendar): string {
  let d = date;
  for (let i = 0; i < MAX_DAYS; i += 1) {
    d = addDays(d, 1);
    if (isPublicWorkday(d, calendar)) return d;
  }
  return d;
}

/** The instant `minutes` of working time after `start`. */
export function addWorkingMinutes(
  start: Date | string,
  minutes: number,
  calendar: WorkdayCalendar,
  hours: WorkingHours = DEFAULT_WORKING_HOURS,
): Date {
  const from = wall(asDate(start));
  let date = from.date;
  let minute = from.minute;
  if (!isPublicWorkday(date, calendar) || minute >= hours.close) {
    date = nextWorkday(date, calendar);
    minute = hours.open;
  } else if (minute < hours.open) {
    minute = hours.open;
  }
  let remaining = Math.max(0, Math.round(minutes));
  for (let i = 0; i < MAX_DAYS; i += 1) {
    const available = hours.close - minute;
    if (remaining <= available) return instantAt(date, minute + remaining);
    remaining -= available;
    date = nextWorkday(date, calendar);
    minute = hours.open;
  }
  return instantAt(date, minute);
}

/** Working minutes between two instants (0 when `to` is not after `from`). */
export function workingMinutesBetween(
  from: Date | string,
  to: Date | string,
  calendar: WorkdayCalendar,
  hours: WorkingHours = DEFAULT_WORKING_HOURS,
): number {
  const a = wall(asDate(from));
  const b = wall(asDate(to));
  if (asDate(to) <= asDate(from)) return 0;
  let total = 0;
  let date = a.date;
  for (let i = 0; i < MAX_DAYS && date <= b.date; i += 1) {
    if (isPublicWorkday(date, calendar)) {
      const start = Math.max(hours.open, date === a.date ? a.minute : 0);
      const end = Math.min(hours.close, date === b.date ? b.minute : 24 * 60);
      if (end > start) total += end - start;
    }
    date = addDays(date, 1);
  }
  return total;
}

/** `due_at` of a ticket: `slaHours` of working time after submission (`null`: no SLA). */
export function dueAt(
  createdAt: Date | string,
  slaHours: number | null,
  calendar: WorkdayCalendar,
  hours: WorkingHours = DEFAULT_WORKING_HOURS,
): string | null {
  return slaHours === null
    ? null
    : addWorkingMinutes(createdAt, slaHours * 60, calendar, hours).toISOString();
}

export type SlaState = "none" | "ok" | "reminder" | "overdue" | "metOnTime" | "metLate";

export interface SlaStatus {
  readonly state: SlaState;
  readonly dueAt: string | null;
  /** 0…∞ share of the SLA used. */
  readonly ratio: number;
  /** Working minutes left (negative when overdue). */
  readonly minutesLeft: number | null;
}

/**
 * Where a ticket stands against its SLA. A closed ticket is judged at its closing time; the
 * reminder state starts at 75 % of the working time.
 */
export function slaStatus(
  input: {
    readonly createdAt: string;
    readonly slaHours: number | null;
    readonly closedAt: string | null;
  },
  now: Date | string,
  calendar: WorkdayCalendar,
  hours: WorkingHours = DEFAULT_WORKING_HOURS,
): SlaStatus {
  if (input.slaHours === null) return { state: "none", dueAt: null, ratio: 0, minutesLeft: null };
  const total = input.slaHours * 60;
  const due = dueAt(input.createdAt, input.slaHours, calendar, hours);
  const end = input.closedAt ?? now;
  const used = workingMinutesBetween(input.createdAt, end, calendar, hours);
  const ratio = total === 0 ? 0 : used / total;
  const minutesLeft = total - used;
  if (input.closedAt !== null) {
    return { state: used <= total ? "metOnTime" : "metLate", dueAt: due, ratio, minutesLeft };
  }
  const state: SlaState = used > total ? "overdue" : ratio >= REMINDER_RATIO ? "reminder" : "ok";
  return { state, dueAt: due, ratio, minutesLeft };
}
