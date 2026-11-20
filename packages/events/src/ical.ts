/**
 * iCalendar (RFC 5545) output for `/esemenyek.ics` and per-event `.ics` files (SDD §10), plus the
 * Google Calendar "add event" link.
 *
 * The feed carries the same series the site expands: a master with its `RRULE` (UNTIL normalized
 * as RFC 5545 requires), `EXDATE`s for its `exdates` **and** for every occurrence replaced by an
 * override child, and each override child as its own `VEVENT`. Emitting overrides as separate
 * events (instead of `RECURRENCE-ID` instances) imports identically into Google, Apple and Outlook
 * and keeps working when a child's original slot no longer matches the rule. Times carry
 * `TZID=Europe/Budapest` with a full `VTIMEZONE`; all-day events use `VALUE=DATE`.
 */
import { tryParseRRule, formatRRule, formatUtc } from "./rrule";
import {
  formatDay,
  localOf,
  MS_PER_HOUR,
  MS_PER_MIN,
  parseDay,
  parseInstant,
  TIME_ZONE,
  type IsoDate,
  type IsoDateTime,
} from "./time";

export interface IcsEvent {
  /** Globally unique and stable (`<event id>@churchy.hu`). */
  uid: string;
  /** Last change; written as `DTSTAMP` and `LAST-MODIFIED`. */
  updatedAt: IsoDateTime;
  createdAt?: IsoDateTime;
  startsAt: IsoDateTime;
  endsAt: IsoDateTime | null;
  allDay: boolean;
  rrule: string | null;
  exdates: readonly IsoDate[];
  /** Original starts of occurrences replaced by override children (become `EXDATE`s). */
  replacedStarts?: readonly IsoDateTime[];
  summary: string;
  description?: string | null;
  location?: string | null;
  url?: string | null;
  geo?: { lat: number; lng: number } | null;
  categories?: readonly string[];
  status?: "CONFIRMED" | "TENTATIVE" | "CANCELLED";
}

export interface IcsCalendar {
  /** `X-WR-CALNAME`: shown as the calendar's name after subscribing. */
  name?: string;
  description?: string;
  /** Suggested refresh interval for subscriptions, in hours (default 12). */
  refreshHours?: number;
  events: readonly IcsEvent[];
}

export const PRODUCT_ID = "-//Churchy//Esemenyek 1.0//HU";

/** Europe/Budapest since 1996 (EU rules): CEST from the last Sunday of March, CET from October. */
const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  `TZID:${TIME_ZONE}`,
  `X-LIC-LOCATION:${TIME_ZONE}`,
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

/** Escapes a TEXT value (RFC 5545 §3.3.11). */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

const encoder = new TextEncoder();

/** Folds a content line to at most 75 octets per line, never splitting a UTF-8 character. */
export function foldLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const lines: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    // Continuation lines start with a space, which counts towards the 75 octets.
    const limit = lines.length === 0 ? 75 : 74;
    if (bytes + size > limit) {
      lines.push(current);
      current = "";
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  lines.push(current);
  return lines.join("\r\n ");
}

const pad = (n: number, width = 2): string => String(n).padStart(width, "0");

function compactDate(day: number): string {
  return formatDay(day).replace(/-/g, "");
}

/** Budapest wall time of an instant: `20261204T190000`. */
function localCompact(ms: number): string {
  const { day, msOfDay } = localOf(ms);
  const h = Math.floor(msOfDay / MS_PER_HOUR);
  const m = Math.floor((msOfDay % MS_PER_HOUR) / MS_PER_MIN);
  const s = Math.floor((msOfDay % MS_PER_MIN) / 1000);
  return `${compactDate(day)}T${pad(h)}${pad(m)}${pad(s)}`;
}

function dateProp(name: string, ms: number, allDay: boolean): string {
  return allDay
    ? `${name};VALUE=DATE:${compactDate(localOf(ms).day)}`
    : `${name};TZID=${TIME_ZONE}:${localCompact(ms)}`;
}

function eventLines(event: IcsEvent): string[] {
  const startMs = parseInstant(event.startsAt);
  const start = localOf(startMs);
  const lines = ["BEGIN:VEVENT", `UID:${event.uid}`];
  const updated = formatUtc(parseInstant(event.updatedAt));
  lines.push(`DTSTAMP:${updated}`);
  if (event.createdAt) lines.push(`CREATED:${formatUtc(parseInstant(event.createdAt))}`);
  lines.push(`LAST-MODIFIED:${updated}`);
  lines.push(dateProp("DTSTART", startMs, event.allDay));
  if (event.allDay) {
    const endDay = event.endsAt === null ? start.day + 1 : localOf(parseInstant(event.endsAt)).day;
    lines.push(`DTEND;VALUE=DATE:${compactDate(Math.max(endDay, start.day + 1))}`);
  } else if (event.endsAt !== null) {
    lines.push(dateProp("DTEND", parseInstant(event.endsAt), false));
  }

  const rule = event.rrule === null ? null : tryParseRRule(event.rrule);
  if (rule !== null) {
    lines.push(`RRULE:${formatRRule(rule, { allDay: event.allDay })}`);
    const exdates = new Set<string>();
    for (const date of event.exdates) {
      let day: number;
      try {
        day = parseDay(date);
      } catch {
        continue;
      }
      exdates.add(
        event.allDay ? compactDate(day) : `${compactDate(day)}${localCompact(startMs).slice(8)}`,
      );
    }
    for (const replaced of event.replacedStarts ?? []) {
      const ms = parseInstant(replaced);
      exdates.add(event.allDay ? compactDate(localOf(ms).day) : localCompact(ms));
    }
    for (const value of [...exdates].sort()) {
      lines.push(event.allDay ? `EXDATE;VALUE=DATE:${value}` : `EXDATE;TZID=${TIME_ZONE}:${value}`);
    }
  }

  lines.push(`SUMMARY:${escapeText(event.summary)}`);
  if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
  if (event.geo) lines.push(`GEO:${event.geo.lat};${event.geo.lng}`);
  if (event.categories && event.categories.length > 0) {
    lines.push(`CATEGORIES:${event.categories.map(escapeText).join(",")}`);
  }
  if (event.url) lines.push(`URL:${event.url}`);
  lines.push(`STATUS:${event.status ?? "CONFIRMED"}`);
  lines.push("TRANSP:OPAQUE");
  lines.push("END:VEVENT");
  return lines;
}

/** A complete `VCALENDAR` with CRLF line endings and folded lines. */
export function buildICalendar(calendar: IcsCalendar): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODUCT_ID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  if (calendar.name) lines.push(`X-WR-CALNAME:${escapeText(calendar.name)}`);
  if (calendar.description) lines.push(`X-WR-CALDESC:${escapeText(calendar.description)}`);
  lines.push(`X-WR-TIMEZONE:${TIME_ZONE}`);
  const refresh = calendar.refreshHours ?? 12;
  lines.push(`REFRESH-INTERVAL;VALUE=DURATION:PT${refresh}H`, `X-PUBLISHED-TTL:PT${refresh}H`);
  lines.push(...VTIMEZONE);
  for (const event of calendar.events) lines.push(...eventLines(event));
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/**
 * Google Calendar "add event" link. A recurring event is added as a series (its `RRULE`;
 * Google's link format cannot carry `EXDATE`s).
 */
export function googleCalendarUrl(event: IcsEvent): string {
  const startMs = parseInstant(event.startsAt);
  let dates: string;
  if (event.allDay) {
    const startDay = localOf(startMs).day;
    const endDay = event.endsAt === null ? startDay + 1 : localOf(parseInstant(event.endsAt)).day;
    dates = `${compactDate(startDay)}/${compactDate(Math.max(endDay, startDay + 1))}`;
  } else {
    const endMs = event.endsAt === null ? startMs : parseInstant(event.endsAt);
    dates = `${localCompact(startMs)}/${localCompact(endMs)}`;
  }
  const params = new URLSearchParams({ action: "TEMPLATE", text: event.summary, dates });
  params.set("ctz", TIME_ZONE);
  if (event.description) params.set("details", event.description);
  if (event.location) params.set("location", event.location);
  const rule = event.rrule === null ? null : tryParseRRule(event.rrule);
  if (rule !== null) params.set("recur", `RRULE:${formatRRule(rule, { allDay: event.allDay })}`);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
