import type {
  AssignmentStatus,
  BookingStatus,
  Calendar,
  Event,
  EventStatus,
  EventVisibility,
  PlanStatus,
} from "@churchy/contracts";
import { liturgicalDay, publicHoliday, type LiturgicalFamily } from "@churchy/calendar";
import {
  budapestDate,
  dayWindow,
  expandEvents,
  monthGrid,
  yearMonthOf,
  type MonthGrid,
} from "@churchy/events";
import { addDays, startOfIsoWeek } from "@churchy/hu";

/**
 * Calendar view model (D-57, D-58, SDD §22.1): URL state, the visible window per view and the
 * merge of the events layer with the computed layers (services, bookings, my assignments,
 * absences, holidays). Pure: the clock and all data are passed in; dates are Europe/Budapest
 * civil dates and weeks start on Monday. Permission filtering of the inputs is the caller's job
 * (`event-access.ts`, `server/workspace-calendar.ts`).
 */

export const VIEWS = ["nap", "het", "honap", "napirend"] as const;
export type CalendarView = (typeof VIEWS)[number];
/** `auto`: no explicit view — agenda below 768 px, month above (CSS decides). */
export type ViewParam = CalendarView | "auto";

export const LAYERS = [
  "events",
  "services",
  "bookings",
  "assignments",
  "absences",
  "holidays",
] as const;
export type Layer = (typeof LAYERS)[number];

export const VIEW_PARAM = "nezet";
export const DATE_PARAM = "datum";
export const LAYER_PARAM = "reteg";
export const CALENDAR_PARAM = "naptar";
/** Marks a submitted filter form, so that "no layer ticked" is not mistaken for "all layers". */
export const FILTERED_PARAM = "szurt";

type Raw = Record<string, string | string[] | undefined>;

const list = (value: string | string[] | undefined): string[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

export interface CalendarParams {
  view: ViewParam;
  /** Anchor date (the day, a day of the week/month, or the agenda start). */
  date: string;
  layers: readonly Layer[];
  /** Calendar ids shown; empty = every calendar. */
  calendarIds: readonly string[];
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value: string | undefined): value is string {
  if (value === undefined || !ISO.test(value)) return false;
  const year = Number(value.slice(0, 4));
  if (year < 1900 || year > 2200) return false;
  try {
    return addDays(value, 0) === value;
  } catch {
    return false;
  }
}

/** Reads `?nezet=&datum=&reteg=&naptar=`; anything unknown falls back to the defaults. */
export function parseCalendarParams(raw: Raw, today: string): CalendarParams {
  const view = list(raw[VIEW_PARAM])[0];
  const date = list(raw[DATE_PARAM])[0];
  const filtered = list(raw[FILTERED_PARAM]).length > 0;
  const layers = list(raw[LAYER_PARAM]).filter((l): l is Layer =>
    (LAYERS as readonly string[]).includes(l),
  );
  return {
    view: (VIEWS as readonly string[]).includes(view ?? "") ? (view as CalendarView) : "auto",
    date: validDate(date) ? date : today,
    layers: filtered ? [...new Set(layers)] : LAYERS,
    calendarIds: list(raw[CALENDAR_PARAM]),
  };
}

/** The query string of a state (defaults are omitted, so links stay short). */
export function calendarQuery(params: CalendarParams, patch: Partial<CalendarParams> = {}): string {
  const next = { ...params, ...patch };
  const q = new URLSearchParams();
  if (next.view !== "auto") q.set(VIEW_PARAM, next.view);
  q.set(DATE_PARAM, next.date);
  if (next.layers.length !== LAYERS.length) {
    q.set(FILTERED_PARAM, "1");
    for (const layer of next.layers) q.append(LAYER_PARAM, layer);
  }
  for (const id of next.calendarIds) q.append(CALENDAR_PARAM, id);
  return q.toString();
}

export interface CalendarWindow {
  /** First and last civil day loaded. */
  from: string;
  to: string;
  /** Month shown by the month grid (`auto` and `honap`). */
  month: MonthGrid | null;
  /** Days of the day/week views and the agenda. */
  days: readonly string[];
}

/** Agenda length in days. */
export const AGENDA_DAYS = 14;

function range(first: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(first, i));
}

/** The days a view needs. */
export function windowFor(view: ViewParam, date: string): CalendarWindow {
  const month = monthGrid(yearMonthOf(date));
  switch (view) {
    case "nap":
      return { from: date, to: date, month: null, days: [date] };
    case "het": {
      const monday = startOfIsoWeek(date);
      return { from: monday, to: addDays(monday, 6), month: null, days: range(monday, 7) };
    }
    case "napirend":
      return {
        from: date,
        to: addDays(date, AGENDA_DAYS - 1),
        month: null,
        days: range(date, AGENDA_DAYS),
      };
    case "honap":
      return { from: month.first, to: month.last, month, days: [] };
    case "auto": {
      // Mobile agenda from `date`, desktop month grid.
      const agendaEnd = addDays(date, AGENDA_DAYS - 1);
      const to = agendaEnd > month.last ? agendaEnd : month.last;
      const from = date < month.first ? date : month.first;
      return { from, to, month, days: range(date, AGENDA_DAYS) };
    }
  }
}

/** The date a view moves to for "previous" (`-1`) / "next" (`1`). */
export function stepDate(view: ViewParam, date: string, direction: -1 | 1): string {
  switch (view) {
    case "nap":
      return addDays(date, direction);
    case "het":
      return addDays(date, 7 * direction);
    case "napirend":
      return addDays(date, AGENDA_DAYS * direction);
    default: {
      const { year, month } = yearMonthOf(date);
      const index = year * 12 + (month - 1) + direction;
      const y = Math.floor(index / 12);
      const m = (index % 12) + 1;
      return `${y}-${String(m).padStart(2, "0")}-01`;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------------------------

export type EntryMeta =
  | {
      kind: "event";
      visibility: EventVisibility;
      status: EventStatus;
      calendarName: string;
      location: string | null;
    }
  | {
      kind: "service";
      location: string | null;
      planStatus: PlanStatus | null;
      teams: readonly string[];
      cancelled: boolean;
    }
  | { kind: "booking"; room: string; status: BookingStatus; mine: boolean }
  | { kind: "assignment"; position: string; team: string; status: AssignmentStatus }
  | { kind: "absence"; person: string; detail: string | null }
  | { kind: "holiday"; publicHoliday: boolean };

export interface CalendarEntry {
  key: string;
  layer: Layer;
  date: string;
  lastDate: string;
  allDay: boolean;
  /** Start / end instants for the time label; null for all-day entries. */
  start: string | null;
  end: string | null;
  /** Display title; null where the entry has none of its own (absences show *Távol*). */
  title: string | null;
  color: string | null;
  href: string | null;
  meta: EntryMeta;
}

export interface ServiceSource {
  id: string;
  startsAt: string;
  endsAt: string;
  title: string;
  location: string | null;
  planStatus: PlanStatus | null;
  planId: string | null;
  teams: readonly string[];
  cancelled: boolean;
}

export interface CalendarSources {
  from: string;
  to: string;
  family: LiturgicalFamily;
  /** Events the viewer may see, with their override children. */
  events: readonly Event[];
  calendars: readonly Calendar[];
  locationNames: ReadonlyMap<string, string>;
  services: readonly ServiceSource[];
  bookings: readonly {
    id: string;
    roomName: string;
    title: string;
    startsAt: string;
    endsAt: string;
    status: BookingStatus;
    /** Requested by the viewer. */
    mine: boolean;
  }[];
  assignments: readonly {
    id: string;
    position: string;
    team: string;
    startsAt: string;
    endsAt: string;
    status: AssignmentStatus;
    planId: string | null;
  }[];
  absences: readonly {
    id: string;
    person: string;
    startDate: string;
    endDate: string;
    detail: string | null;
  }[];
}

const DEFAULT_COLOR = "#5b6577";

function timed(start: string, end: string | null, layer: Layer) {
  const date = budapestDate(start);
  // An end exactly at midnight belongs to the previous day.
  const lastDate =
    end === null ? date : budapestDate(new Date(Date.parse(end) - 1000).toISOString());
  return { layer, date, lastDate: lastDate < date ? date : lastDate, allDay: false } as const;
}

/** Entries of the enabled layers inside `[from, to]`, unsorted. */
export function buildEntries(
  src: CalendarSources,
  layers: readonly Layer[],
  calendarIds: readonly string[],
): CalendarEntry[] {
  const on = new Set(layers);
  const out: CalendarEntry[] = [];
  const window = dayWindow(src.from, src.to);

  if (on.has("events")) {
    const byId = new Map(src.calendars.map((c) => [c.id, c]));
    const visible = src.events.filter(
      (e) => calendarIds.length === 0 || calendarIds.includes(e.calendarId),
    );
    for (const occ of expandEvents(visible, window)) {
      const e = occ.event;
      if (e.status === "cancelled") continue;
      const calendar = byId.get(e.calendarId);
      out.push({
        key: `e:${e.id}:${occ.start}`,
        layer: "events",
        date: occ.date,
        lastDate: occ.lastDate,
        allDay: occ.allDay,
        start: occ.allDay ? null : occ.start,
        end: occ.allDay ? null : occ.end,
        title: e.title,
        color: calendar?.color ?? DEFAULT_COLOR,
        href: `/munkater/naptar/${e.id}`,
        meta: {
          kind: "event",
          visibility: e.visibility,
          status: e.status,
          calendarName: calendar?.name ?? "",
          location: e.locationId === null ? null : (src.locationNames.get(e.locationId) ?? null),
        },
      });
    }
  }

  if (on.has("services")) {
    for (const s of src.services) {
      out.push({
        key: `s:${s.id}`,
        ...timed(s.startsAt, s.endsAt, "services"),
        start: s.startsAt,
        end: s.endsAt,
        title: s.title,
        color: null,
        href: null,
        meta: {
          kind: "service",
          location: s.location,
          planStatus: s.planStatus,
          teams: s.teams,
          cancelled: s.cancelled,
        },
      });
    }
  }

  if (on.has("bookings")) {
    for (const b of src.bookings) {
      out.push({
        key: `b:${b.id}`,
        ...timed(b.startsAt, b.endsAt, "bookings"),
        start: b.startsAt,
        end: b.endsAt,
        title: b.title,
        color: null,
        href: null,
        meta: { kind: "booking", room: b.roomName, status: b.status, mine: b.mine },
      });
    }
  }

  if (on.has("assignments")) {
    for (const a of src.assignments) {
      out.push({
        key: `a:${a.id}`,
        ...timed(a.startsAt, a.endsAt, "assignments"),
        start: a.startsAt,
        end: a.endsAt,
        title: a.position,
        color: null,
        href: null,
        meta: { kind: "assignment", position: a.position, team: a.team, status: a.status },
      });
    }
  }

  if (on.has("absences")) {
    for (const a of src.absences) {
      const first = a.startDate < src.from ? src.from : a.startDate;
      const last = a.endDate > src.to ? src.to : a.endDate;
      if (last < first) continue;
      out.push({
        key: `x:${a.id}`,
        layer: "absences",
        date: first,
        lastDate: last,
        allDay: true,
        start: null,
        end: null,
        title: null,
        color: null,
        href: null,
        meta: { kind: "absence", person: a.person, detail: a.detail },
      });
    }
  }

  if (on.has("holidays")) {
    for (const date of range(src.from, daysBetweenInclusive(src.from, src.to))) {
      const holiday = publicHoliday(date);
      const day = liturgicalDay(date, src.family);
      const name = holiday?.name ?? (day.isNotable ? day.name : null);
      if (name === null) continue;
      out.push({
        key: `h:${date}`,
        layer: "holidays",
        date,
        lastDate: date,
        allDay: true,
        start: null,
        end: null,
        title: name,
        color: null,
        href: null,
        meta: { kind: "holiday", publicHoliday: holiday !== null },
      });
    }
  }
  return out;
}

function daysBetweenInclusive(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 864e5) + 1;
}

const LAYER_ORDER: Record<Layer, number> = {
  holidays: 0,
  absences: 1,
  events: 2,
  services: 2,
  bookings: 3,
  assignments: 2,
};

/** All-day first (holidays before absences before events), then by start time, then title. */
export function compareEntries(a: CalendarEntry, b: CalendarEntry): number {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  if (a.allDay) return LAYER_ORDER[a.layer] - LAYER_ORDER[b.layer] || a.key.localeCompare(b.key);
  return (
    Date.parse(a.start ?? "") - Date.parse(b.start ?? "") ||
    LAYER_ORDER[a.layer] - LAYER_ORDER[b.layer] ||
    a.key.localeCompare(b.key)
  );
}

/** Entries grouped per day between `first` and `last` (multi-day entries on every day), sorted. */
export function groupByDay(
  entries: readonly CalendarEntry[],
  first: string,
  last: string,
): Map<string, CalendarEntry[]> {
  const byDay = new Map<string, CalendarEntry[]>();
  for (let d = first; d <= last; d = addDays(d, 1)) byDay.set(d, []);
  for (const entry of entries) {
    const end = entry.lastDate > last ? last : entry.lastDate;
    for (let d = entry.date < first ? first : entry.date; d <= end; d = addDays(d, 1)) {
      byDay.get(d)?.push(entry);
    }
  }
  for (const items of byDay.values()) items.sort(compareEntries);
  return byDay;
}
