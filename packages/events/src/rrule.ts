/**
 * RFC 5545 RRULE parser and serializer for the subset the product uses (SDD §10): FREQ
 * DAILY/WEEKLY/MONTHLY/YEARLY with INTERVAL, COUNT, UNTIL, BYDAY (with ordinals for MONTHLY and
 * YEARLY), BYMONTHDAY, BYMONTH, BYSETPOS and WKST. Anything else (BYHOUR, BYWEEKNO, sub-daily
 * frequencies, …) is rejected with a `RecurrenceError`, so an unsupported rule never silently
 * expands to something else.
 */
import { epochDay, formatDay, localOf, MS_PER_DAY, ymdOf, zonedToInstant, type Ymd } from "./time";

export type Frequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

/** ISO weekday, 1 = Monday … 7 = Sunday. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface ByDay {
  weekday: Weekday;
  /** `1` = first, `-1` = last …; `null` = every such weekday in the period. */
  ordinal: number | null;
}

/**
 * `UNTIL` as written: a civil date (`20261231`), a UTC instant (`…Z`) or a floating local time
 * (read in Europe/Budapest).
 */
export type Until =
  | { kind: "date"; date: Ymd }
  | { kind: "utc"; ms: number }
  | { kind: "local"; date: Ymd; msOfDay: number };

export interface RecurrenceRule {
  freq: Frequency;
  interval: number;
  count: number | null;
  until: Until | null;
  byDay: ByDay[];
  byMonthDay: number[];
  byMonth: number[];
  bySetPos: number[];
  /** Week start (default Monday). */
  wkst: Weekday;
}

export type RecurrenceErrorCode = "SYNTAX" | "UNSUPPORTED" | "INVALID";

export class RecurrenceError extends Error {
  constructor(
    readonly code: RecurrenceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RecurrenceError";
  }
}

export const WEEKDAY_CODES = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;

const FREQUENCIES: readonly Frequency[] = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"];
const KNOWN_UNSUPPORTED = new Set([
  "BYSECOND",
  "BYMINUTE",
  "BYHOUR",
  "BYYEARDAY",
  "BYWEEKNO",
  "RSCALE",
  "SKIP",
]);
const UNSUPPORTED_FREQ = new Set(["SECONDLY", "MINUTELY", "HOURLY"]);

function weekdayCode(code: string): Weekday {
  const i = (WEEKDAY_CODES as readonly string[]).indexOf(code);
  if (i < 0) throw new RecurrenceError("SYNTAX", `Unknown weekday: ${code}`);
  return (i + 1) as Weekday;
}

function intList(key: string, value: string, min: number, max: number, signed: boolean): number[] {
  return value.split(",").map((part) => {
    if (!/^[+-]?\d{1,3}$/.test(part)) throw new RecurrenceError("SYNTAX", `${key}: ${part}`);
    const n = Number(part);
    const abs = Math.abs(n);
    if ((!signed && n < 0) || abs < min || abs > max) {
      throw new RecurrenceError("INVALID", `${key} out of range: ${part}`);
    }
    return n;
  });
}

function positiveInt(key: string, value: string): number {
  if (!/^\d{1,4}$/.test(value) || Number(value) < 1) {
    throw new RecurrenceError("INVALID", `${key} must be a positive integer: ${value}`);
  }
  return Number(value);
}

function parseUntil(value: string): Until {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value);
  if (!m) throw new RecurrenceError("SYNTAX", `UNTIL: ${value}`);
  const date = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  const day = epochDay(date.year, date.month, date.day);
  // `Date.UTC` rolls invalid dates over (Feb 30 → Mar 2); reject them instead.
  if (formatDay(day) !== `${m[1]}-${m[2]}-${m[3]}`) {
    throw new RecurrenceError("INVALID", `UNTIL is not a calendar date: ${value}`);
  }
  if (m[4] === undefined) return { kind: "date", date };
  const msOfDay = ((Number(m[4]) * 60 + Number(m[5])) * 60 + Number(m[6])) * 1000;
  if (msOfDay >= MS_PER_DAY) throw new RecurrenceError("INVALID", `UNTIL time: ${value}`);
  if (m[7] === "Z") return { kind: "utc", ms: day * MS_PER_DAY + msOfDay };
  return { kind: "local", date, msOfDay };
}

/**
 * Parses an RFC 5545 recurrence rule (`FREQ=MONTHLY;BYDAY=1FR`, an optional `RRULE:` prefix is
 * accepted). Throws `RecurrenceError` for malformed or unsupported rules.
 */
export function parseRRule(input: string): RecurrenceRule {
  const source = input.trim().replace(/^RRULE:/i, "");
  if (source === "") throw new RecurrenceError("SYNTAX", "Empty rule");
  const parts = new Map<string, string>();
  for (const part of source.split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) throw new RecurrenceError("SYNTAX", `Malformed rule part: ${part}`);
    const key = part.slice(0, eq).toUpperCase();
    if (parts.has(key)) throw new RecurrenceError("SYNTAX", `Duplicate rule part: ${key}`);
    parts.set(key, part.slice(eq + 1).toUpperCase());
  }

  const freqValue = parts.get("FREQ");
  if (freqValue === undefined) throw new RecurrenceError("SYNTAX", "FREQ is required");
  if (UNSUPPORTED_FREQ.has(freqValue)) {
    throw new RecurrenceError("UNSUPPORTED", `FREQ=${freqValue} is not supported`);
  }
  if (!(FREQUENCIES as readonly string[]).includes(freqValue)) {
    throw new RecurrenceError("SYNTAX", `Unknown FREQ: ${freqValue}`);
  }
  const freq = freqValue as Frequency;

  const rule: RecurrenceRule = {
    freq,
    interval: 1,
    count: null,
    until: null,
    byDay: [],
    byMonthDay: [],
    byMonth: [],
    bySetPos: [],
    wkst: 1,
  };

  for (const [key, value] of parts) {
    switch (key) {
      case "FREQ":
        break;
      case "INTERVAL":
        rule.interval = positiveInt(key, value);
        break;
      case "COUNT":
        rule.count = positiveInt(key, value);
        break;
      case "UNTIL":
        rule.until = parseUntil(value);
        break;
      case "BYDAY":
        rule.byDay = value.split(",").map((part) => {
          const m = /^([+-]?\d{1,2})?([A-Z]{2})$/.exec(part);
          if (!m) throw new RecurrenceError("SYNTAX", `BYDAY: ${part}`);
          const ordinal = m[1] === undefined ? null : Number(m[1]);
          if (ordinal !== null && (ordinal === 0 || Math.abs(ordinal) > 53)) {
            throw new RecurrenceError("INVALID", `BYDAY ordinal out of range: ${part}`);
          }
          return { weekday: weekdayCode(m[2] as string), ordinal };
        });
        break;
      case "BYMONTHDAY":
        rule.byMonthDay = intList(key, value, 1, 31, true);
        break;
      case "BYMONTH":
        rule.byMonth = intList(key, value, 1, 12, false);
        break;
      case "BYSETPOS":
        rule.bySetPos = intList(key, value, 1, 366, true);
        break;
      case "WKST":
        rule.wkst = weekdayCode(value);
        break;
      default:
        throw new RecurrenceError(
          KNOWN_UNSUPPORTED.has(key) ? "UNSUPPORTED" : "SYNTAX",
          `Unsupported rule part: ${key}`,
        );
    }
  }

  if (rule.count !== null && rule.until !== null) {
    throw new RecurrenceError("INVALID", "COUNT and UNTIL must not both be set");
  }
  const ordinals = rule.byDay.some((d) => d.ordinal !== null);
  if (ordinals && (freq === "DAILY" || freq === "WEEKLY")) {
    throw new RecurrenceError("INVALID", `BYDAY ordinals are not allowed with FREQ=${freq}`);
  }
  if (ordinals && freq === "YEARLY" && rule.byMonthDay.length > 0) {
    throw new RecurrenceError("UNSUPPORTED", "BYDAY ordinals with BYMONTHDAY are not supported");
  }
  if (freq === "WEEKLY" && rule.byMonthDay.length > 0) {
    throw new RecurrenceError("INVALID", "BYMONTHDAY is not allowed with FREQ=WEEKLY");
  }
  if (
    rule.bySetPos.length > 0 &&
    rule.byDay.length + rule.byMonthDay.length + rule.byMonth.length === 0
  ) {
    throw new RecurrenceError("INVALID", "BYSETPOS needs another BYxxx rule part");
  }
  return rule;
}

/** `parseRRule()` that returns `null` instead of throwing. */
export function tryParseRRule(input: string): RecurrenceRule | null {
  try {
    return parseRRule(input);
  } catch (error) {
    if (error instanceof RecurrenceError) return null;
    /* v8 ignore next */
    throw error;
  }
}

const pad = (n: number, width = 2): string => String(n).padStart(width, "0");

function ymdCompact({ year, month, day }: Ymd): string {
  return `${pad(year, 4)}${pad(month)}${pad(day)}`;
}

/** `20261231T225959Z` */
export function formatUtc(ms: number): string {
  const d = new Date(ms);
  return (
    `${pad(d.getUTCFullYear(), 4)}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/**
 * The last instant (epoch ms) an occurrence may start at under `until`. A date `UNTIL` on a timed
 * event includes that whole Budapest day.
 */
export function untilInstant(until: Until): number {
  switch (until.kind) {
    case "utc":
      return until.ms;
    case "local":
      return zonedToInstant(
        epochDay(until.date.year, until.date.month, until.date.day),
        until.msOfDay,
      );
    case "date":
      return (
        zonedToInstant(epochDay(until.date.year, until.date.month, until.date.day) + 1, 0) - 1000
      );
  }
}

/**
 * Serializes a rule in canonical form (`FREQ` first, no `RRULE:` prefix). For iCalendar output
 * `UNTIL` is normalized to what RFC 5545 requires: a DATE for all-day events, a UTC DATE-TIME for
 * events with a `TZID`.
 */
export function formatRRule(rule: RecurrenceRule, options: { allDay?: boolean } = {}): string {
  const parts = [`FREQ=${rule.freq}`];
  if (rule.interval !== 1) parts.push(`INTERVAL=${rule.interval}`);
  if (rule.count !== null) parts.push(`COUNT=${rule.count}`);
  if (rule.until !== null) {
    let until: string;
    if (options.allDay) {
      // A UTC instant becomes the Budapest date it falls on.
      const date = rule.until.kind === "utc" ? ymdOf(localOf(rule.until.ms).day) : rule.until.date;
      until = ymdCompact(date);
    } else {
      until = formatUtc(untilInstant(rule.until));
    }
    parts.push(`UNTIL=${until}`);
  }
  if (rule.byMonth.length > 0) parts.push(`BYMONTH=${rule.byMonth.join(",")}`);
  if (rule.byMonthDay.length > 0) parts.push(`BYMONTHDAY=${rule.byMonthDay.join(",")}`);
  if (rule.byDay.length > 0) {
    const days = rule.byDay.map(
      (d) => `${d.ordinal ?? ""}${WEEKDAY_CODES[d.weekday - 1] as string}`,
    );
    parts.push(`BYDAY=${days.join(",")}`);
  }
  if (rule.bySetPos.length > 0) parts.push(`BYSETPOS=${rule.bySetPos.join(",")}`);
  if (rule.wkst !== 1) parts.push(`WKST=${WEEKDAY_CODES[rule.wkst - 1] as string}`);
  return parts.join(";");
}
