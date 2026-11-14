/**
 * Read-time expansion of events into occurrences (SDD §10): single, all-day and RRULE events with
 * `exdates` and single-occurrence overrides (child events carrying `parentEventId` +
 * `recurrenceId`), evaluated in Europe/Budapest.
 *
 * Semantics (RFC 5545 §3.3.10, §3.8.5):
 * - The recurrence is generated on the civil calendar and every occurrence keeps the wall-clock
 *   time of `startsAt`, so 18:00 stays 18:00 across DST changes. A time that does not exist on the
 *   spring-forward day is shifted forward by the gap; an ambiguous one resolves to summer time.
 * - `startsAt` always counts as the first occurrence, also when it does not match the rule.
 * - `COUNT` counts occurrences before `exdates` and overrides remove them.
 * - Timed occurrences keep the exact duration of the master (`endsAt − startsAt`); all-day
 *   occurrences keep its number of days.
 * - An override child replaces the occurrence that starts at its `recurrenceId`; a `cancelled`
 *   child just removes it.
 * - A rule this package cannot parse degrades to a single event, so one bad row never breaks a
 *   page; `parseRRule()` reports the error where rules are entered.
 */
import { tryParseRRule, untilInstant, type RecurrenceRule, type Weekday } from "./rrule";
import {
  daysInMonth,
  epochDay,
  formatDay,
  formatInstant,
  localOf,
  MS_PER_DAY,
  parseDay,
  parseInstant,
  weekdayOf,
  ymdOf,
  zonedToInstant,
  type IsoDate,
  type IsoDateTime,
} from "./time";

/** The event fields the expansion reads (a subset of `Event` from `@churchy/contracts`). */
export interface ExpandableEvent {
  id: string;
  startsAt: IsoDateTime;
  endsAt: IsoDateTime | null;
  allDay: boolean;
  rrule: string | null;
  exdates: readonly IsoDate[];
  parentEventId: string | null;
  recurrenceId: IsoDateTime | null;
  status?: string;
}

export interface Occurrence<E extends ExpandableEvent = ExpandableEvent> {
  /** The event shown: the master, or the override child that replaces this occurrence. */
  event: E;
  /** The recurring master this occurrence belongs to; `null` for single events. */
  seriesId: string | null;
  /** Start / end in Europe/Budapest (`2026-11-20T18:00:00+01:00`); all-day: local midnights. */
  start: IsoDateTime;
  end: IsoDateTime;
  startMs: number;
  endMs: number;
  /** Budapest date of the start. */
  date: IsoDate;
  /** Last Budapest date the occurrence covers (inclusive; `date` for a one-day occurrence). */
  lastDate: IsoDate;
  allDay: boolean;
  /** Original start of a series member (RFC 5545 `RECURRENCE-ID`); `null` for single events. */
  recurrenceId: IsoDateTime | null;
  /** True when an override child moved or changed this occurrence. */
  isOverride: boolean;
}

/** An instant window; occurrences overlapping it are returned. */
export interface ExpandWindow {
  from: IsoDateTime;
  to: IsoDateTime;
}

/** Longest window expanded at once (SDD §10). */
export const MAX_WINDOW_DAYS = 400;

/** Safety net for rules that can never produce an occurrence (e.g. `BYMONTH=2;BYMONTHDAY=30`). */
const MAX_PERIODS = 100_000;

function resolveMonthDay(value: number, dim: number): number {
  return value > 0 ? value : dim + 1 + value;
}

/** Days of a month matching BYMONTHDAY / BYDAY (or `defaultDay`), ascending epoch days. */
function monthCandidates(
  year: number,
  month: number,
  rule: RecurrenceRule,
  defaultDay: number,
): number[] {
  const dim = daysInMonth(year, month);
  const first = epochDay(year, month, 1);
  let byMonthDay: Set<number> | null = null;
  if (rule.byMonthDay.length > 0) {
    byMonthDay = new Set(
      rule.byMonthDay.map((d) => resolveMonthDay(d, dim)).filter((d) => d >= 1 && d <= dim),
    );
  }
  let byDay: Set<number> | null = null;
  if (rule.byDay.length > 0) {
    byDay = new Set();
    for (const { weekday, ordinal } of rule.byDay) {
      const offset = (weekday - weekdayOf(first) + 7) % 7;
      const days: number[] = [];
      for (let d = 1 + offset; d <= dim; d += 7) days.push(d);
      if (ordinal === null) days.forEach((d) => byDay!.add(d));
      else {
        const picked = days[ordinal > 0 ? ordinal - 1 : days.length + ordinal];
        if (picked !== undefined) byDay.add(picked);
      }
    }
  }
  let days: number[];
  if (byMonthDay && byDay) days = [...byMonthDay].filter((d) => byDay.has(d));
  else if (byMonthDay) days = [...byMonthDay];
  else if (byDay) days = [...byDay];
  else days = defaultDay <= dim ? [defaultDay] : [];
  return days.sort((a, b) => a - b).map((d) => first + d - 1);
}

/** Days of a year for FREQ=YEARLY. */
function yearCandidates(year: number, rule: RecurrenceRule, start: number): number[] {
  const s = ymdOf(start);
  if (rule.byDay.length > 0 && rule.byMonth.length === 0 && rule.byMonthDay.length === 0) {
    // BYDAY over the whole year: `1SU` = the first Sunday of the year.
    const first = epochDay(year, 1, 1);
    const last = epochDay(year + 1, 1, 1) - 1;
    const result = new Set<number>();
    for (const { weekday, ordinal } of rule.byDay) {
      const days: number[] = [];
      for (let d = first + ((weekday - weekdayOf(first) + 7) % 7); d <= last; d += 7) days.push(d);
      if (ordinal === null) days.forEach((d) => result.add(d));
      else {
        const picked = days[ordinal > 0 ? ordinal - 1 : days.length + ordinal];
        if (picked !== undefined) result.add(picked);
      }
    }
    return [...result].sort((a, b) => a - b);
  }
  const months =
    rule.byMonth.length > 0
      ? [...rule.byMonth].sort((a, b) => a - b)
      : rule.byMonthDay.length > 0 || rule.byDay.length > 0
        ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
        : [s.month];
  return months.flatMap((m) => monthCandidates(year, m, rule, s.day));
}

function applySetPos(days: number[], setPos: number[]): number[] {
  if (setPos.length === 0) return days;
  const picked = new Set<number>();
  for (const pos of setPos) {
    const day = days[pos > 0 ? pos - 1 : days.length + pos];
    if (day !== undefined) picked.add(day);
  }
  return [...picked].sort((a, b) => a - b);
}

/**
 * Epoch days of a rule, ascending, starting with `start` itself (which always counts), until the
 * period starting after `lastDay`.
 */
export function* recurrenceDays(
  rule: RecurrenceRule,
  start: number,
  lastDay: number,
): Generator<number> {
  yield start;
  const s = ymdOf(start);
  const weekStart = start - ((weekdayOf(start) - rule.wkst + 7) % 7);
  for (let k = 0; k < MAX_PERIODS; k++) {
    let periodStart: number;
    let candidates: number[];
    switch (rule.freq) {
      case "DAILY": {
        periodStart = start + k * rule.interval;
        const { month, day } = ymdOf(periodStart);
        const dim = daysInMonth(ymdOf(periodStart).year, month);
        const ok =
          (rule.byMonth.length === 0 || rule.byMonth.includes(month)) &&
          (rule.byMonthDay.length === 0 ||
            rule.byMonthDay.some((d) => resolveMonthDay(d, dim) === day)) &&
          (rule.byDay.length === 0 || rule.byDay.some((d) => d.weekday === weekdayOf(periodStart)));
        candidates = ok ? [periodStart] : [];
        break;
      }
      case "WEEKLY": {
        periodStart = weekStart + 7 * k * rule.interval;
        const weekdays: Weekday[] =
          rule.byDay.length > 0 ? rule.byDay.map((d) => d.weekday) : [weekdayOf(start) as Weekday];
        candidates = [...new Set(weekdays.map((wd) => periodStart + ((wd - rule.wkst + 7) % 7)))]
          .filter((d) => rule.byMonth.length === 0 || rule.byMonth.includes(ymdOf(d).month))
          .sort((a, b) => a - b);
        break;
      }
      case "MONTHLY": {
        const index = s.year * 12 + (s.month - 1) + k * rule.interval;
        const year = Math.floor(index / 12);
        const month = (index % 12) + 1;
        periodStart = epochDay(year, month, 1);
        candidates =
          rule.byMonth.length === 0 || rule.byMonth.includes(month)
            ? monthCandidates(year, month, rule, s.day)
            : [];
        break;
      }
      case "YEARLY": {
        const year = s.year + k * rule.interval;
        periodStart = epochDay(year, 1, 1);
        candidates = yearCandidates(year, rule, start);
        break;
      }
    }
    if (periodStart > lastDay) return;
    for (const day of applySetPos(candidates, rule.bySetPos)) {
      if (day > start) yield day;
    }
  }
}

function overlaps(startMs: number, endMs: number, fromMs: number, toMs: number): boolean {
  if (startMs > toMs) return false;
  return endMs > fromMs || (endMs === startMs && startMs >= fromMs);
}

function parseWindow(window: ExpandWindow): { fromMs: number; toMs: number } {
  const fromMs = parseInstant(window.from);
  const toMs = parseInstant(window.to);
  if (toMs < fromMs) throw new RangeError("The window ends before it starts");
  // One extra hour tolerates windows given as local midnights across a DST change.
  if (toMs - fromMs > MAX_WINDOW_DAYS * MS_PER_DAY + 3_600_000) {
    throw new RangeError(`Windows longer than ${MAX_WINDOW_DAYS} days are not expanded`);
  }
  return { fromMs, toMs };
}

interface Shape {
  startMs: number;
  startDay: number;
  msOfDay: number;
  /** All-day: number of days; timed: duration in ms. */
  length: number;
}

function shapeOf(event: ExpandableEvent): Shape {
  const startMs = parseInstant(event.startsAt);
  const local = localOf(startMs);
  if (event.allDay) {
    const endDay = event.endsAt === null ? local.day + 1 : localOf(parseInstant(event.endsAt)).day;
    return { startMs, startDay: local.day, msOfDay: 0, length: Math.max(1, endDay - local.day) };
  }
  const endMs = event.endsAt === null ? startMs : parseInstant(event.endsAt);
  return { startMs, startDay: local.day, msOfDay: local.msOfDay, length: endMs - startMs };
}

function occurrence<E extends ExpandableEvent>(
  event: E,
  shape: Shape,
  day: number,
  meta: { seriesId: string | null; recurrenceId: IsoDateTime | null; isOverride: boolean },
): Occurrence<E> {
  const startMs = event.allDay ? zonedToInstant(day, 0) : zonedToInstant(day, shape.msOfDay);
  const endMs = event.allDay ? zonedToInstant(day + shape.length, 0) : startMs + shape.length;
  const lastDay = event.allDay
    ? day + shape.length - 1
    : localOf(endMs > startMs ? endMs - 1 : endMs).day;
  return {
    event,
    seriesId: meta.seriesId,
    start: formatInstant(startMs),
    end: formatInstant(endMs),
    startMs,
    endMs,
    date: formatDay(day),
    lastDate: formatDay(Math.max(day, lastDay)),
    allDay: event.allDay,
    recurrenceId: meta.recurrenceId,
    isOverride: meta.isOverride,
  };
}

function untilCheck(rule: RecurrenceRule, allDay: boolean): (day: number, ms: number) => boolean {
  const until = rule.until;
  if (until === null) return () => true;
  if (allDay) {
    const untilDay =
      until.kind === "utc"
        ? localOf(until.ms).day
        : epochDay(until.date.year, until.date.month, until.date.day);
    return (day) => day <= untilDay;
  }
  const limit = untilInstant(until);
  return (_day, ms) => ms <= limit;
}

function expandMaster<E extends ExpandableEvent>(
  event: E,
  suppressed: ReadonlySet<number>,
  fromMs: number,
  toMs: number,
  out: Occurrence<E>[],
): void {
  const shape = shapeOf(event);
  const rule = event.rrule === null ? null : tryParseRRule(event.rrule);
  if (rule === null) {
    const occ = occurrence(event, shape, shape.startDay, {
      seriesId: null,
      recurrenceId: null,
      isOverride: false,
    });
    if (overlaps(occ.startMs, occ.endMs, fromMs, toMs)) out.push(occ);
    return;
  }

  const exdates = new Set<number>();
  for (const value of event.exdates) {
    try {
      exdates.add(parseDay(value));
    } catch {
      // An invalid exdate cannot match any occurrence.
    }
  }
  const withinUntil = untilCheck(rule, event.allDay);
  const lastDay = localOf(toMs).day + 1;
  let emitted = 0;
  for (const day of recurrenceDays(rule, shape.startDay, lastDay)) {
    const startMs = event.allDay ? zonedToInstant(day, 0) : zonedToInstant(day, shape.msOfDay);
    if (!withinUntil(day, startMs)) break;
    if (rule.count !== null && emitted >= rule.count) break;
    emitted++;
    if (exdates.has(day) || suppressed.has(startMs)) continue;
    const occ = occurrence(event, shape, day, {
      seriesId: event.id,
      recurrenceId: formatInstant(startMs),
      isOverride: false,
    });
    if (overlaps(occ.startMs, occ.endMs, fromMs, toMs)) out.push(occ);
  }
}

/**
 * Occurrences of `events` overlapping `window`, sorted by start (then event id). Pass the masters
 * together with their override children; children whose master is missing are shown on their own.
 */
export function expandEvents<E extends ExpandableEvent>(
  events: readonly E[],
  window: ExpandWindow,
): Occurrence<E>[] {
  const { fromMs, toMs } = parseWindow(window);
  const suppressedBy = new Map<string, Set<number>>();
  for (const e of events) {
    if (e.parentEventId === null || e.recurrenceId === null) continue;
    const set = suppressedBy.get(e.parentEventId) ?? new Set<number>();
    set.add(parseInstant(e.recurrenceId));
    suppressedBy.set(e.parentEventId, set);
  }

  const out: Occurrence<E>[] = [];
  for (const event of events) {
    if (event.status === "cancelled") continue;
    if (event.parentEventId !== null) {
      const shape = shapeOf(event);
      const occ = occurrence(event, shape, shape.startDay, {
        seriesId: event.parentEventId,
        recurrenceId:
          event.recurrenceId === null ? null : formatInstant(parseInstant(event.recurrenceId)),
        isOverride: true,
      });
      if (overlaps(occ.startMs, occ.endMs, fromMs, toMs)) out.push(occ);
      continue;
    }
    expandMaster(event, suppressedBy.get(event.id) ?? new Set(), fromMs, toMs, out);
  }
  return out.sort(
    (a, b) =>
      a.startMs - b.startMs || (a.event.id < b.event.id ? -1 : a.event.id > b.event.id ? 1 : 0),
  );
}

/** The first `limit` occurrences starting at or after `from` (within {@link MAX_WINDOW_DAYS}). */
export function upcomingOccurrences<E extends ExpandableEvent>(
  events: readonly E[],
  from: IsoDateTime,
  limit: number,
): Occurrence<E>[] {
  const fromMs = parseInstant(from);
  const to = formatInstant(fromMs + MAX_WINDOW_DAYS * MS_PER_DAY);
  return expandEvents(events, { from, to }).slice(0, limit);
}

/** Window covering whole Budapest days `from`…`to` (inclusive civil dates). */
export function dayWindow(from: IsoDate, to: IsoDate): ExpandWindow {
  return {
    from: formatInstant(zonedToInstant(parseDay(from), 0)),
    to: formatInstant(zonedToInstant(parseDay(to) + 1, 0) - 1000),
  };
}
