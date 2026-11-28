import ICAL from "ical.js";

import { churchDay, churchTime, type DayKey } from "../church-time";
import { ANNOUNCEMENT_LIMITS, SINGLE_OCCURRENCE, type CalendarEntry } from "./schema";

// The entries of an iCalendar file (e.g. the secret address of a Google
// calendar) in a range of days, for the snapshot of an announcements item. A
// repeating entry gives an entry for each of its occurrences in the range,
// with its exceptions (an occurrence that moved or changed) and without its
// excluded dates. A cancelled entry or occurrence is left out. A time without
// a known time zone is in the time zone of the church.

/**
 * The most occurrences of one repeating entry that the parser looks at, also
 * before the range, so a bad rule cannot run for long: a daily entry of 50
 * years. A daily or weekly entry starts shortly before the range (see `skipStart()`).
 */
const MAX_OCCURRENCES = 20000;

/**
 * The most occurrences of all repeating entries of one calendar that the
 * parser looks at, so many entries cannot run for long either: about 0.7 s
 * (one occurrence takes about 13 µs). A calendar with more fails with
 * `CalendarBudgetError` and keeps its old entries.
 */
export const MAX_CALENDAR_OCCURRENCES = 50_000;

type Time = InstanceType<typeof ICAL.Time>;
type Event = InstanceType<typeof ICAL.Event>;
type Timezone = InstanceType<typeof ICAL.Timezone>;

/** Thrown for a file that is not an iCalendar file. */
export class CalendarParseError extends Error {}

/** Thrown for a calendar with more than `MAX_CALENDAR_OCCURRENCES` occurrences to look at. */
export class CalendarBudgetError extends CalendarParseError {}

/** The first code points of a text, with "…" when it is longer. */
function clip(text: string, max: number): string {
  const points = Array.from(text);
  return points.length > max ? `${points.slice(0, max - 1).join("")}…` : text;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** The text of a description, which can be HTML (Google): the line breaks stay, the tags go. */
export function plainText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
      if (code[0] === "#") {
        const point =
          code[1] === "x" || code[1] === "X"
            ? parseInt(code.slice(2), 16)
            : parseInt(code.slice(1), 10);
        return Number.isFinite(point) && point > 0 && point <= 0x10ffff
          ? String.fromCodePoint(point)
          : match;
      }
      return ENTITIES[code.toLowerCase()] ?? match;
    })
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The first web address of a description, for a QR code. */
export function firstUrl(value: string): string | null {
  const match = /https?:\/\/[^\s"'<>]+/i.exec(value);
  return match ? match[0].replace(/[.,;:!?)]+$/, "").replace(/&amp;/g, "&") : null;
}

/** The instant of a time. Without a known time zone (floating), in the time zone of the church. */
function instant(time: Time): Date {
  if (time.zone && time.zone.tzid !== "floating") return time.toJSDate();
  return churchTime(time.year, time.month, time.day, time.hour, time.minute, time.second);
}

function dayKey(time: Time): DayKey {
  return `${String(time.year).padStart(4, "0")}-${String(time.month).padStart(2, "0")}-${String(time.day).padStart(2, "0")}`;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function cancelled(event: Event): boolean {
  return text(event.component.getFirstPropertyValue("status")).toUpperCase() === "CANCELLED";
}

/**
 * The entry of an occurrence, or null when it is not in the days from `from`
 * to `to`, or has no title. `recurrenceId`: the occurrence of a repeating entry.
 */
function toEntry(
  calendarId: string,
  item: Event,
  start: Time,
  end: Time | null,
  recurrenceId: Time | null,
  from: DayKey,
  to: DayKey,
): CalendarEntry | null {
  const title = text(item.summary).trim();
  if (!title || cancelled(item)) return null;

  let entryStart: string;
  let entryEnd: string | null;
  let startDay: DayKey;
  let endDay: DayKey;
  if (start.isDate) {
    entryStart = dayKey(start);
    // The end of an entry of all day is the day after it (DTEND is not part of it).
    const last = end?.isDate ? end.clone().adjust(-1, 0, 0, 0) : null;
    entryEnd = last && dayKey(last) > entryStart ? dayKey(last) : null;
    startDay = entryStart;
    endDay = entryEnd ?? entryStart;
  } else {
    const startAt = instant(start);
    const endAt = end && !end.isDate ? instant(end) : null;
    entryStart = startAt.toISOString();
    entryEnd = endAt && endAt.getTime() > startAt.getTime() ? endAt.toISOString() : null;
    startDay = churchDay(startAt);
    endDay = churchDay(endAt ?? startAt);
  }
  if (endDay < from || startDay > to) return null;

  const rawDescription = text(item.description);
  const description = plainText(rawDescription);
  const location = text(item.location).trim();
  const url = firstUrl(rawDescription);
  return {
    calendarId,
    uid: clip(item.uid || title, 1000),
    occurrence: recurrenceId
      ? recurrenceId.isDate
        ? dayKey(recurrenceId)
        : instant(recurrenceId).toISOString()
      : SINGLE_OCCURRENCE,
    title: clip(title, ANNOUNCEMENT_LIMITS.title),
    start: entryStart,
    end: entryEnd,
    allDay: start.isDate,
    location: location ? clip(location, ANNOUNCEMENT_LIMITS.location) : null,
    description: description ? clip(description, ANNOUNCEMENT_LIMITS.description) : null,
    url: url && url.length <= ANNOUNCEMENT_LIMITS.qrText ? url : null,
  };
}

/**
 * The entries of the calendar `calendarId` that are in the days from `from`
 * to `to` (in the time zone of the church), by start. At most `limit`.
 */
export function parseCalendar(
  source: string,
  calendarId: string,
  from: DayKey,
  to: DayKey,
  limit = ANNOUNCEMENT_LIMITS.snapshotEntries,
): CalendarEntry[] {
  let root: InstanceType<typeof ICAL.Component>;
  try {
    root = new ICAL.Component(ICAL.parse(source));
  } catch (error) {
    throw new CalendarParseError(error instanceof Error ? error.message : "Not an iCalendar file");
  }
  if (root.name !== "vcalendar") throw new CalendarParseError("Not an iCalendar file");

  const zones = registerZones(root);
  try {
    return readEntries(root, calendarId, from, to)
      .sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
      .slice(0, limit);
  } finally {
    restoreZones(zones);
  }
}

/**
 * Registers the time zones of the file. ical.js reads them from one registry
 * of the process, so `restoreZones` must put back the zones of before: else a
 * bad zone of one calendar changes the times of the next calendars.
 */
function registerZones(root: InstanceType<typeof ICAL.Component>): Map<string, Timezone | null> {
  const before = new Map<string, Timezone | null>();
  for (const zone of root.getAllSubcomponents("vtimezone")) {
    const tzid = text(zone.getFirstPropertyValue("tzid"));
    if (!tzid || before.has(tzid)) continue;
    before.set(tzid, ICAL.TimezoneService.has(tzid) ? ICAL.TimezoneService.get(tzid) : null);
    try {
      ICAL.TimezoneService.register(zone);
    } catch {
      // A bad time zone: its times are in the time zone of the church.
    }
  }
  return before;
}

function restoreZones(before: Map<string, Timezone | null>): void {
  for (const [tzid, zone] of before) {
    if (zone) ICAL.TimezoneService.register(zone, tzid);
    else ICAL.TimezoneService.remove(tzid);
  }
}

/** The entries of the file in the days from `from` to `to`, in no order. */
function readEntries(
  root: InstanceType<typeof ICAL.Component>,
  calendarId: string,
  from: DayKey,
  to: DayKey,
): CalendarEntry[] {
  // The exceptions of a repeating entry have its UID and a RECURRENCE-ID.
  const masters = new Map<string, Event>();
  const exceptions: Event[] = [];
  for (const component of root.getAllSubcomponents("vevent")) {
    try {
      // Without `exceptions`, ical.js relates each exception of the file to
      // each entry, also those of other UIDs: below, only those of its UID.
      const event = new ICAL.Event(component, { exceptions: [] });
      if (event.isRecurrenceException()) exceptions.push(event);
      else if (event.uid && !masters.has(event.uid)) masters.set(event.uid, event);
      else if (!event.uid) masters.set(`#${masters.size}`, event);
    } catch {
      // A bad entry is left out.
    }
  }
  for (const exception of exceptions) {
    const master = masters.get(exception.uid);
    if (master) master.relateException(exception);
    // An exception without its series: an entry of its own.
    else masters.set(`${exception.uid}#${exception.recurrenceId?.toString()}`, exception);
  }

  const entries: CalendarEntry[] = [];
  let budget = MAX_CALENDAR_OCCURRENCES;
  for (const event of masters.values()) {
    try {
      if (cancelled(event)) continue;
      if (!event.isRecurring()) {
        const entry = toEntry(
          calendarId,
          event,
          event.startDate,
          event.endDate,
          event.isRecurrenceException() ? event.recurrenceId : null,
          from,
          to,
        );
        if (entry) entries.push(entry);
        continue;
      }
      // The occurrences come by their recurrence id (their first start), not
      // by their start: an exception can move an occurrence in or out of the range.
      const skipped = skipStart(event, from);
      const iterator = event.iterator(skipped ?? undefined);
      let last: Time | null = null;
      for (let count = 0; count < MAX_OCCURRENCES; count++) {
        if (budget-- <= 0) throw new CalendarBudgetError("Too many occurrences");
        const next = iterator.next();
        if (!next || dayOf(next) > to) break;
        last = next;
        const details = event.getOccurrenceDetails(next);
        const entry = toEntry(
          calendarId,
          details.item,
          details.startDate,
          details.endDate,
          details.recurrenceId,
          from,
          to,
        );
        if (entry) entries.push(entry);
      }
      // The exceptions that the occurrences above did not give, e.g. moved
      // into the range from a later day or from a skipped day.
      for (const exception of Object.values(event.exceptions) as Event[]) {
        const recurrenceId = exception.recurrenceId;
        if (
          last &&
          recurrenceId.compare(last) <= 0 &&
          (!skipped || recurrenceId.compare(skipped) >= 0)
        )
          continue;
        const entry = toEntry(
          calendarId,
          exception,
          exception.startDate,
          exception.endDate,
          exception.recurrenceId,
          from,
          to,
        );
        if (entry) entries.push(entry);
      }
    } catch (error) {
      if (error instanceof CalendarBudgetError) throw error;
      // A bad rule: the entry is left out.
    }
  }
  return entries;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * An occurrence of `event` some days before `from`, for the start of its
 * occurrences: the rule gives the same times after it, and the occurrences
 * of the years before the range do not use up the budget (e.g. a weekly
 * entry since 2010). Only for one daily or weekly rule, without COUNT (it
 * counts from the first occurrence) and without RDATE (dates before the
 * start get lost). Null: from the first occurrence.
 */
function skipStart(event: Event, from: DayKey): Time | null {
  try {
    const component = event.component;
    if (component.hasProperty("rdate")) return null;
    const rules = component.getAllProperties("rrule");
    if (rules.length !== 1) return null;
    const rule = rules[0]!.getFirstValue() as InstanceType<typeof ICAL.Recur>;
    if (rule.count) return null;
    const interval = rule.interval || 1;
    const periodDays = rule.freq === "DAILY" ? interval : rule.freq === "WEEKLY" ? 7 * interval : 0;
    if (periodDays <= 0) return null;

    const start = event.startDate;
    const startDay = Date.UTC(start.year, start.month - 1, start.day);
    // An occurrence that starts a few days before `from` can last into the range.
    const marginDays = Math.ceil(Math.max(0, event.duration.toSeconds()) / 86400) + 2;
    let days = Math.floor((Date.parse(from) - startDay) / DAY_MS) - marginDays;
    if (rule.until) {
      // Not after the last occurrence: then the rule gives no occurrences at all.
      const untilDay = Date.UTC(rule.until.year, rule.until.month - 1, rule.until.day);
      days = Math.min(days, Math.floor((untilDay - startDay) / DAY_MS) - 1);
    }
    const periods = Math.floor(days / periodDays);
    if (!(periods > 0)) return null;
    const skipped = start.clone();
    skipped.adjust(periods * periodDays, 0, 0, 0);
    return skipped;
  } catch {
    return null;
  }
}

/** The day of a time in the time zone of the church. */
function dayOf(time: Time): DayKey {
  return time.isDate ? dayKey(time) : churchDay(instant(time));
}

function sortKey(entry: CalendarEntry): string {
  return entry.allDay ? `${entry.start}T00` : `${churchDay(entry.start)}T01${entry.start}`;
}
