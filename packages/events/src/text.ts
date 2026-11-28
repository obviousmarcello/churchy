/**
 * Hungarian human-readable recurrence text (SDD §7.5, §10), implemented in-house:
 *
 *   FREQ=MONTHLY;BYDAY=1FR        → „minden hónap első péntekén”
 *   FREQ=WEEKLY;BYDAY=TU,TH       → „minden kedden és csütörtökön”
 *   FREQ=MONTHLY;BYDAY=-1SU       → „minden hónap utolsó vasárnapján”
 *   FREQ=WEEKLY;INTERVAL=2        → „kéthetente kedden” (weekday taken from the start)
 *
 * With `withTime` the start time is appended (*„… 18:00-kor”*); `UNTIL` and `COUNT` add
 * *„…, 2026. december 31-ig”* / *„…, összesen 10 alkalommal”*. Rules that cannot be put into a
 * precise sentence return `null`, and the caller shows a generic "recurring" label instead of a
 * wrong text. Only digits and fixed suffixes are attached to numbers; no user-provided text is
 * inflected.
 */
import { formatTime, monthName } from "@churchy/hu";
import {
  parseRRule,
  RecurrenceError,
  type ByDay,
  type RecurrenceRule,
  type Weekday,
} from "./rrule";
import { localOf, MS_PER_HOUR, MS_PER_MIN, parseInstant, ymdOf, type IsoDateTime } from "./time";

/** „hétfőn” … „vasárnap” — on a weekday. */
const ON_WEEKDAY = [
  "hétfőn",
  "kedden",
  "szerdán",
  "csütörtökön",
  "pénteken",
  "szombaton",
  "vasárnap",
] as const;

/** „(első) hétfőjén” … „vasárnapján” — on the nth weekday of a period. */
const ON_NTH_WEEKDAY = [
  "hétfőjén",
  "keddjén",
  "szerdáján",
  "csütörtökén",
  "péntekén",
  "szombatján",
  "vasárnapján",
] as const;

/** „januárban” … — in a month. */
const IN_MONTH = [
  "januárban",
  "februárban",
  "márciusban",
  "áprilisban",
  "májusban",
  "júniusban",
  "júliusban",
  "augusztusban",
  "szeptemberben",
  "októberben",
  "novemberben",
  "decemberben",
] as const;

const ORDINALS: Record<number, string> = {
  1: "első",
  2: "második",
  3: "harmadik",
  4: "negyedik",
  5: "ötödik",
  [-1]: "utolsó",
  [-2]: "utolsó előtti",
};

/** Numeral prefixes of the distributive forms (*kéthetente*, *háromhavonta*). */
const MULTIPLIERS: Record<number, string> = {
  2: "két",
  3: "három",
  4: "négy",
  5: "öt",
  6: "hat",
  7: "hét",
  8: "nyolc",
  9: "kilenc",
  10: "tíz",
  11: "tizenegy",
  12: "tizenkét",
};

type Unit = "naponta" | "hetente" | "havonta" | "évente";

const WORKDAYS = [1, 2, 3, 4, 5];

export interface DescribeOptions {
  /** Start of the series (`startsAt`): supplies the weekday, day and month a rule leaves implicit. */
  start?: IsoDateTime;
  /** All-day series: never append a time. */
  allDay?: boolean;
  /** Append the start time: „… 18:00-kor”. Needs `start`. */
  withTime?: boolean;
  /** Upper-case the first letter (sentence start). */
  capitalize?: boolean;
}

/** „a, b és c” */
function joinHu(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} és ${items[items.length - 1] as string}`;
}

function ordinalWord(n: number): string {
  return ORDINALS[n] ?? (n > 0 ? `${n}.` : `hátulról ${-n}.`);
}

/** „kéthetente”, „15 naponta” */
function every(n: number, unit: Unit): string {
  const prefix = MULTIPLIERS[n];
  return prefix === undefined ? `${n} ${unit}` : `${prefix}${unit}`;
}

/**
 * Day of month with the superessive suffix, written with digits: „1-jén”, „2-án”, „15-én”,
 * „12-én”, „20-án”. The suffix follows the spoken ordinal (*elsején*, *másodikán*,
 * *tizenkettedikén*, *huszadikán*).
 */
export function dayOfMonthOn(day: number): string {
  if (day === 1) return "1-jén";
  if (day % 10 === 0) return `${day}-${day === 10 ? "én" : "án"}`;
  // *másodikán*, but *tizenkettedikén*, *huszonkettedikén*.
  const back = day === 2 || [3, 6, 8].includes(day % 10);
  return `${day}-${back ? "án" : "én"}`;
}

/** Day of month followed by *-ig* („31-ig”). */
function dateUntil(year: number, month: number, day: number): string {
  return `${year}. ${monthName(month)} ${day}-ig`;
}

function uniqueSorted(values: readonly number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

function sameSet(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** „első és harmadik péntekén”, „első péntekén és utolsó vasárnapján” */
function nthWeekdays(byDay: readonly ByDay[]): string {
  const groups = new Map<Weekday, number[]>();
  for (const { weekday, ordinal } of byDay) {
    groups.set(weekday, [...(groups.get(weekday) ?? []), ordinal as number]);
  }
  return joinHu(
    [...groups].map(
      ([weekday, ordinals]) =>
        `${joinHu(ordinals.map(ordinalWord))} ${ON_NTH_WEEKDAY[weekday - 1] as string}`,
    ),
  );
}

/** „1-jén és 15-én”, „utolsó napján” */
function monthDays(days: readonly number[]): string {
  // Days counted from the start first (ascending), then those counted from the end (-2, -1).
  const sorted = [...new Set(days)].sort((a, b) => (a > 0 === b > 0 ? a - b : a > 0 ? -1 : 1));
  return joinHu(sorted.map((d) => (d > 0 ? dayOfMonthOn(d) : `${ordinalWord(d)} napján`)));
}

/** Weekly weekday phrase without the frequency: „kedden és csütörtökön”, „hétköznap”. */
function weekdaysPhrase(weekdays: readonly number[], interval: number): string {
  const days = uniqueSorted(weekdays);
  const prefix = interval === 1 ? "minden" : every(interval, "hetente");
  if (days.length === 7) return interval === 1 ? "minden nap" : `${prefix}, minden nap`;
  if (sameSet(days, WORKDAYS)) {
    return interval === 1 ? "minden hétköznap" : `${prefix}, hétköznapokon`;
  }
  return `${prefix} ${joinHu(days.map((d) => ON_WEEKDAY[d - 1] as string))}`;
}

function inMonths(months: readonly number[]): string {
  return joinHu(uniqueSorted(months).map((m) => IN_MONTH[m - 1] as string));
}

function monthNames(months: readonly number[]): string {
  return joinHu(uniqueSorted(months).map((m) => monthName(m)));
}

interface StartParts {
  weekday: number;
  month: number;
  day: number;
}

function ordinalsOnly(byDay: readonly ByDay[]): boolean {
  return byDay.length > 0 && byDay.every((d) => d.ordinal !== null);
}

function plainWeekdays(byDay: readonly ByDay[]): boolean {
  return byDay.length > 0 && byDay.every((d) => d.ordinal === null);
}

/** BYDAY (no ordinals) + one BYSETPOS: „utolsó hétköznapján”, „első szombatján”. */
function setPosPhrase(rule: RecurrenceRule): string | null {
  if (rule.bySetPos.length !== 1 || !plainWeekdays(rule.byDay) || rule.byMonthDay.length > 0) {
    return null;
  }
  const days = uniqueSorted(rule.byDay.map((d) => d.weekday));
  const ord = ordinalWord(rule.bySetPos[0] as number);
  if (days.length === 1) return `${ord} ${ON_NTH_WEEKDAY[(days[0] as number) - 1] as string}`;
  if (sameSet(days, WORKDAYS)) return `${ord} hétköznapján`;
  if (days.length === 7) return `${ord} napján`;
  return null;
}

function describeDaily(rule: RecurrenceRule): string | null {
  if (rule.bySetPos.length > 0 || rule.byMonthDay.length > 0) return null;
  if (rule.byDay.length > 0) {
    if (rule.interval !== 1) return null;
    const phrase = weekdaysPhrase(
      rule.byDay.map((d) => d.weekday),
      1,
    );
    return rule.byMonth.length > 0 ? `${inMonths(rule.byMonth)} ${phrase}` : phrase;
  }
  const phrase = rule.interval === 1 ? "minden nap" : every(rule.interval, "naponta");
  return rule.byMonth.length > 0 ? `${inMonths(rule.byMonth)} ${phrase}` : phrase;
}

function describeWeekly(rule: RecurrenceRule, start: StartParts | null): string | null {
  if (rule.bySetPos.length > 0) return null;
  const weekdays =
    rule.byDay.length > 0 ? rule.byDay.map((d) => d.weekday) : start ? [start.weekday] : [];
  const phrase =
    weekdays.length > 0
      ? weekdaysPhrase(weekdays, rule.interval)
      : rule.interval === 1
        ? "minden héten"
        : every(rule.interval, "hetente");
  return rule.byMonth.length > 0 ? `${inMonths(rule.byMonth)} ${phrase}` : phrase;
}

/** What happens within one month: „első péntekén”, „15-én”, null when not describable. */
function withinMonth(rule: RecurrenceRule, start: StartParts | null): string | null {
  if (rule.bySetPos.length > 0) return setPosPhrase(rule);
  if (rule.byDay.length > 0 && rule.byMonthDay.length > 0) return null;
  if (ordinalsOnly(rule.byDay)) return nthWeekdays(rule.byDay);
  if (rule.byDay.length > 0) return null; // mixed or plain weekdays: handled by the caller
  if (rule.byMonthDay.length > 0) return monthDays(rule.byMonthDay);
  return start ? dayOfMonthOn(start.day) : null;
}

function describeMonthly(rule: RecurrenceRule, start: StartParts | null): string | null {
  if (plainWeekdays(rule.byDay) && rule.bySetPos.length === 0 && rule.byMonthDay.length === 0) {
    // Every such weekday of the month: the same as a weekly rule.
    const phrase = weekdaysPhrase(
      rule.byDay.map((d) => d.weekday),
      1,
    );
    if (rule.byMonth.length > 0) {
      return rule.interval === 1 ? `${inMonths(rule.byMonth)} ${phrase}` : null;
    }
    return rule.interval === 1 ? phrase : `${every(rule.interval, "havonta")} ${phrase}`;
  }
  const inner = withinMonth(rule, start);
  if (rule.byMonth.length > 0) {
    // Only some months: „június, július és augusztus első vasárnapján”.
    if (rule.interval !== 1 || inner === null) return null;
    return `${monthNames(rule.byMonth)} ${inner}`;
  }
  if (inner === null) {
    return rule.byDay.length > 0 || rule.byMonthDay.length > 0 || rule.bySetPos.length > 0
      ? null
      : rule.interval === 1
        ? "minden hónapban"
        : every(rule.interval, "havonta");
  }
  return rule.interval === 1
    ? `minden hónap ${inner}`
    : `${every(rule.interval, "havonta")}, a hónap ${inner}`;
}

function describeYearly(rule: RecurrenceRule, start: StartParts | null): string | null {
  if (rule.bySetPos.length > 0) return null;
  const prefix = rule.interval === 1 ? "minden évben" : every(rule.interval, "évente");
  if (rule.byMonth.length === 0) {
    if (ordinalsOnly(rule.byDay) && rule.byMonthDay.length === 0) {
      const inner = nthWeekdays(rule.byDay);
      return rule.interval === 1 ? `minden év ${inner}` : `${prefix}, az év ${inner}`;
    }
    if (rule.byDay.length > 0) {
      if (!plainWeekdays(rule.byDay) || rule.byMonthDay.length > 0 || rule.interval !== 1) {
        return null;
      }
      return weekdaysPhrase(
        rule.byDay.map((d) => d.weekday),
        1,
      );
    }
    if (rule.byMonthDay.length > 0) {
      return rule.interval === 1 ? `minden hónap ${monthDays(rule.byMonthDay)}` : null;
    }
    return start ? `${prefix} ${monthName(start.month)} ${dayOfMonthOn(start.day)}` : prefix;
  }
  if (plainWeekdays(rule.byDay) && rule.byMonthDay.length === 0) {
    if (rule.interval !== 1) return null;
    const phrase = weekdaysPhrase(
      rule.byDay.map((d) => d.weekday),
      1,
    );
    return `${inMonths(rule.byMonth)} ${phrase}`;
  }
  const inner = withinMonth(rule, start);
  if (inner === null) {
    return rule.byDay.length > 0 || rule.byMonthDay.length > 0
      ? null
      : `${prefix} ${inMonths(rule.byMonth)}`;
  }
  return `${prefix} ${monthNames(rule.byMonth)} ${inner}`;
}

function startParts(start: IsoDateTime | undefined): {
  parts: StartParts | null;
  msOfDay: number | null;
} {
  if (start === undefined) return { parts: null, msOfDay: null };
  const { day, msOfDay } = localOf(parseInstant(start));
  const ymd = ymdOf(day);
  return {
    parts: { weekday: ((((day + 3) % 7) + 7) % 7) + 1, month: ymd.month, day: ymd.day },
    msOfDay,
  };
}

function untilText(rule: RecurrenceRule): string {
  const until = rule.until;
  if (until === null) return "";
  const date = until.kind === "utc" ? ymdOf(localOf(until.ms).day) : until.date;
  return `, ${dateUntil(date.year, date.month, date.day)}`;
}

/**
 * Hungarian description of a recurrence rule, or `null` when the rule is invalid or has no
 * precise wording. See the module comment for examples.
 */
export function describeRecurrence(
  rule: string | RecurrenceRule,
  options: DescribeOptions = {},
): string | null {
  let parsed: RecurrenceRule;
  try {
    parsed = typeof rule === "string" ? parseRRule(rule) : rule;
  } catch (error) {
    if (error instanceof RecurrenceError) return null;
    /* v8 ignore next */
    throw error;
  }
  const { parts, msOfDay } = startParts(options.start);

  let text: string | null;
  switch (parsed.freq) {
    case "DAILY":
      text = describeDaily(parsed);
      break;
    case "WEEKLY":
      text = describeWeekly(parsed, parts);
      break;
    case "MONTHLY":
      text = describeMonthly(parsed, parts);
      break;
    case "YEARLY":
      text = describeYearly(parsed, parts);
      break;
  }
  if (text === null) return null;

  if (options.withTime && !options.allDay && msOfDay !== null) {
    const hh = String(Math.floor(msOfDay / MS_PER_HOUR)).padStart(2, "0");
    const mm = String(Math.floor((msOfDay % MS_PER_HOUR) / MS_PER_MIN)).padStart(2, "0");
    text += ` ${formatTime(`${hh}:${mm}`)}-kor`;
  }
  text += untilText(parsed);
  if (parsed.count !== null) text += `, összesen ${parsed.count} alkalommal`;
  return options.capitalize ? text.charAt(0).toLocaleUpperCase("hu") + text.slice(1) : text;
}
