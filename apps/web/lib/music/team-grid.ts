// The team planner: a grid of the events of a timeframe (the rows) and the
// service areas (the columns), with the volunteers of each area of each event
// in the cells (see `src/app/[lang]/events/teams/`). The days of the
// timeframe are days in the time zone of the church, as the times of the
// event forms.

import { addDays, churchTime, endOfMonth, isDayKey, type DayKey } from "./church-time";
import { periodEnd } from "./event-series";

/** The most events in the grid. With more, the grid shows the first ones. */
export const MAX_GRID_EVENTS = 200;
/** The longest timeframe, in days. */
export const MAX_RANGE_DAYS = 366;

/** The first and the last day of a timeframe. Both days are in it. */
export type DayRange = { from: DayKey; until: DayKey };

export const RANGE_PRESETS = ["next4Weeks", "next3Months", "thisMonth", "previousMonth"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

/** The timeframes of the preset buttons, from the day `today`. */
export function rangePresets(today: DayKey): Record<RangePreset, DayRange> {
  const firstOfMonth = `${today.slice(0, 8)}01`;
  const lastOfPreviousMonth = addDays(firstOfMonth, -1);
  return {
    next4Weeks: { from: today, until: addDays(today, 27) },
    next3Months: { from: today, until: periodEnd(today, { months: 3 }) },
    thisMonth: { from: firstOfMonth, until: endOfMonth(today) },
    previousMonth: { from: `${lastOfPreviousMonth.slice(0, 8)}01`, until: lastOfPreviousMonth },
  };
}

/** The preset of the timeframe, or null for a custom timeframe. */
export function presetOf(range: DayRange, today: DayKey): RangePreset | null {
  const presets = rangePresets(today);
  return (
    RANGE_PRESETS.find(
      (preset) => presets[preset].from === range.from && presets[preset].until === range.until,
    ) ?? null
  );
}

/** Whether a string is a real day, e.g. not "2026-02-30". */
function isDay(value: unknown): value is DayKey {
  return typeof value === "string" && isDayKey(value) && addDays(value, 0) === value;
}

/** The number of days of the timeframe. */
export function rangeDays({ from, until }: DayRange): number {
  return Math.round((Date.parse(until) - Date.parse(from)) / 86_400_000) + 1;
}

/**
 * The timeframe of the `from` and `until` search parameters. Without a good
 * `from`, the next 4 weeks. Without a good `until` after `from`, 4 weeks from
 * `from`. A longer timeframe than `MAX_RANGE_DAYS` ends earlier.
 */
export function parseRange(params: { from?: unknown; until?: unknown }, today: DayKey): DayRange {
  if (!isDay(params.from)) return rangePresets(today).next4Weeks;
  const from = params.from;
  const until = isDay(params.until) && params.until >= from ? params.until : addDays(from, 27);
  return rangeDays({ from, until }) > MAX_RANGE_DAYS
    ? { from, until: addDays(from, MAX_RANGE_DAYS - 1) }
    : { from, until };
}

/** The instants of the start of the timeframe and of the end of its last day, as ISO strings. */
export function rangeBounds({ from, until }: DayRange): { start: string; end: string } {
  const instant = (day: DayKey) => {
    const [year, month, date] = day.split("-").map(Number) as [number, number, number];
    return churchTime(year, month, date).toISOString();
  };
  return { start: instant(from), end: instant(addDays(until, 1)) };
}

type GridEvent = { id: string; startsAt: string; endsAt: string };

/** The users of each area of each event, in their order: `cells[eventId][areaId]`. */
export type TeamGridCells = Record<string, Record<string, string[]>>;

/** The texts in place of the users, e.g. "Sign up at Gábor": `notes[eventId][areaId]`. */
export type TeamGridNotes = Record<string, Record<string, string>>;

/** Why a user in a cell is double-booked: also in another area of the event, or also in an event at the same time. */
export type DoubleBooking = { kind: "area"; areaId: string } | { kind: "event"; eventId: string };

/** The key of a user in a cell, for `doubleBookings()`. */
export function bookingKey(eventId: string, areaId: string, userId: string): string {
  return `${eventId}:${areaId}:${userId}`;
}

/**
 * The users who are in more than one cell at the same time: in two areas of
 * an event, or in two events that overlap. By `bookingKey()`.
 */
export function doubleBookings(
  events: GridEvent[],
  cells: TeamGridCells,
): Map<string, DoubleBooking[]> {
  const result = new Map<string, DoubleBooking[]>();
  const add = (eventId: string, areaId: string, userId: string, booking: DoubleBooking) => {
    const key = bookingKey(eventId, areaId, userId);
    result.set(key, [...(result.get(key) ?? []), booking]);
  };

  // The areas of each user in each event.
  const areasOf = new Map<string, Map<string, string[]>>();
  for (const event of events) {
    const byUser = new Map<string, string[]>();
    for (const [areaId, userIds] of Object.entries(cells[event.id] ?? {})) {
      for (const userId of userIds) byUser.set(userId, [...(byUser.get(userId) ?? []), areaId]);
    }
    areasOf.set(event.id, byUser);

    for (const [userId, areaIds] of byUser) {
      if (areaIds.length < 2) continue;
      for (const areaId of areaIds) {
        for (const other of areaIds)
          if (other !== areaId) add(event.id, areaId, userId, { kind: "area", areaId: other });
      }
    }
  }

  const byStart = events.toSorted((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  for (const [index, event] of byStart.entries()) {
    const end = Date.parse(event.endsAt);
    for (const other of byStart.slice(index + 1)) {
      if (Date.parse(other.startsAt) >= end) break;
      if (Date.parse(other.endsAt) <= Date.parse(event.startsAt)) continue;
      const users = areasOf.get(event.id) ?? new Map<string, string[]>();
      const otherUsers = areasOf.get(other.id) ?? new Map<string, string[]>();
      for (const [userId, areaIds] of users) {
        const otherAreaIds = otherUsers.get(userId);
        if (!otherAreaIds) continue;
        for (const areaId of areaIds)
          add(event.id, areaId, userId, { kind: "event", eventId: other.id });
        for (const areaId of otherAreaIds)
          add(other.id, areaId, userId, { kind: "event", eventId: event.id });
      }
    }
  }
  return result;
}

/** The template of an event in the grid: its groups (see `isAreaUsed()`). */
export type GridTemplate = { name: string; areaIds: string[] };

/**
 * Whether the event uses the group: without a template, it uses all groups.
 * With a template, only the groups of the template, as the teams dialog of
 * the event shows them.
 */
export function isAreaUsed(event: { template: GridTemplate | null }, areaId: string): boolean {
  return event.template === null || event.template.areaIds.includes(areaId);
}

/** Whether the cell has neither users nor a text. */
export function isCellEmpty(
  cells: TeamGridCells,
  notes: TeamGridNotes,
  eventId: string,
  areaId: string,
): boolean {
  return (cells[eventId]?.[areaId] ?? []).length === 0 && !notes[eventId]?.[areaId];
}

/** For each area, the number of events that use it and have neither users nor a text in it. */
export function emptyCounts(
  events: { id: string; template: GridTemplate | null }[],
  areas: { id: string }[],
  cells: TeamGridCells,
  notes: TeamGridNotes = {},
): Record<string, number> {
  return Object.fromEntries(
    areas.map((area) => [
      area.id,
      events.filter(
        (event) => isAreaUsed(event, area.id) && isCellEmpty(cells, notes, event.id, area.id),
      ).length,
    ]),
  );
}

/** The grid as rows of texts, for the print and the CSV file: a column for the day, the event, each area and the note. */
export type GridTable = { header: string[]; rows: string[][] };

/** The text of a cell that the event does not use (see `isAreaUsed()`). */
export const UNUSED_CELL = "–";

/**
 * The texts of the grid. A cell has the names of its users, or its text. An
 * empty cell that the event does not use has `UNUSED_CELL`.
 */
export function gridTable(
  grid: {
    events: { id: string; title: string; startsAt: string; template: GridTemplate | null }[];
    areas: { id: string; name: string }[];
    cells: TeamGridCells;
    notes: TeamGridNotes;
    eventNotes: Record<string, string>;
  },
  {
    date,
    name,
    labels,
  }: {
    date: (instant: string) => string;
    name: (userId: string) => string;
    labels: { date: string; event: string; note: string };
  },
): GridTable {
  return {
    header: [labels.date, labels.event, ...grid.areas.map((area) => area.name), labels.note],
    rows: grid.events.map((event) => [
      date(event.startsAt),
      event.title,
      ...grid.areas.map((area) => {
        const note = grid.notes[event.id]?.[area.id];
        if (note) return note;
        const userIds = grid.cells[event.id]?.[area.id] ?? [];
        if (userIds.length > 0) return userIds.map(name).join(", ");
        return isAreaUsed(event, area.id) ? "" : UNUSED_CELL;
      }),
      grid.eventNotes[event.id] ?? "",
    ]),
  };
}
