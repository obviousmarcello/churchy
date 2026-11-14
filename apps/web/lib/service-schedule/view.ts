import type { Location, ScheduleData, ServiceRule } from "@churchy/contracts";
import {
  addDays,
  formatDateRange,
  parseIsoDate,
  slugify,
  startOfIsoWeek,
  toIsoDate,
} from "@churchy/hu";
import {
  isPeriodActive,
  resolveDays,
  type DayContextFn,
  type ScheduleDay,
  type ScheduleInput,
  type SchedulePeriod,
  type Weekday,
} from "@churchy/schedule";

/**
 * View model of the public service schedule page (D-11, SDD §7.2): the URL state (`?datum=`,
 * `?hely=`), the resolved week and the regular weekly table. Pure: "today" and the data are passed
 * in; all dates are Europe/Budapest civil dates and weeks start on Monday.
 */

/** Query parameter of the date (`?datum=2026-12-24`). */
export const DATE_PARAM = "datum";
/** Query parameter of the location filter (`?hely=<location slug>`). */
export const LOCATION_PARAM = "hely";

/** Years the page accepts; outside them the date counts as invalid. */
const MIN_YEAR = 1900;
const MAX_YEAR = 2200;

export type DateParam =
  /** No date given: the current week. */
  | { kind: "none" }
  /** A valid date; `canonical` is false when it was typed in another accepted format. */
  | { kind: "date"; date: string; canonical: boolean }
  /** Something that is not a date; the page shows the current week and an error. */
  | { kind: "invalid"; raw: string };

// `2026-11-14`, `2026.11.14`, `2026. 11. 14.`, `2026/11/14` (also with one-digit month/day).
const DATE_RE = /^(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})\s*\.?$/;
const CANONICAL_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Reads `?datum=`. Besides the canonical `YYYY-MM-DD` it accepts the Hungarian way of typing a
 * date (`2026. 11. 14.`), so the plain-text date field of the GET form works without JavaScript.
 */
export function parseDateParam(raw: string | string[] | undefined): DateParam {
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  if (value === undefined || value === "") return { kind: "none" };
  const match = DATE_RE.exec(value);
  if (!match) return { kind: "invalid", raw: value };
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (year < MIN_YEAR || year > MAX_YEAR) return { kind: "invalid", raw: value };
  const date = toIsoDate({ year, month, day });
  try {
    parseIsoDate(date); // rejects 2026-02-30 and friends
  } catch {
    return { kind: "invalid", raw: value };
  }
  return { kind: "date", date, canonical: CANONICAL_RE.test(value) && value === date };
}

/** The first value of a query parameter. */
export function firstParam(raw: string | string[] | undefined): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === undefined || value === "" ? undefined : value;
}

/** Builds a page URL from the state; parameters equal to the default are left out. */
export function scheduleHref(
  basePath: string,
  state: { date?: string | null; location?: string | null },
): string {
  const params = new URLSearchParams();
  if (state.date) params.set(DATE_PARAM, state.date);
  if (state.location) params.set(LOCATION_PARAM, state.location);
  const query = params.toString();
  return query === "" ? basePath : `${basePath}?${query}`;
}

export interface WeekNav {
  /** Monday of the shown week. */
  monday: string;
  /** Sunday of the shown week. */
  sunday: string;
  /** Monday of the previous / next week (the values of the navigation links). */
  previous: string;
  next: string;
  /** Whether the shown week is the current one. */
  isCurrentWeek: boolean;
}

/**
 * Heading text of a week with its year: `2026. nov. 9–15.`; a week across New Year already names
 * both years (`2026. dec. 28. – 2027. jan. 3.`).
 */
export function weekRangeLabel(week: Pick<WeekNav, "monday" | "sunday">): string {
  const range = formatDateRange(week.monday, week.sunday);
  return /^\d/.test(range) ? range : `${parseIsoDate(week.monday).year}. ${range}`;
}

/** The Monday-first week around `date`. */
export function weekOf(date: string, today: string): WeekNav {
  const monday = startOfIsoWeek(date);
  return {
    monday,
    sunday: addDays(monday, 6),
    previous: addDays(monday, -7),
    next: addDays(monday, 7),
    isCurrentWeek: monday === startOfIsoWeek(today),
  };
}

export interface ScheduleSource {
  locations: readonly Location[];
  data: ScheduleData;
}

/** The engine input for a tenant's data (the contract shapes are what the engine consumes). */
export function scheduleInput({ locations, data }: ScheduleSource): ScheduleInput {
  return {
    locations: locations.map(({ id, name, slug, kind, sort }) => ({ id, name, slug, kind, sort })),
    periods: data.periods,
    // The contract validates weekday 1–7; the engine types it as a literal union.
    rules: data.rules as ScheduleInput["rules"],
    exceptions: data.exceptions,
  };
}

/**
 * The week, resolved by the real schedule engine. Cancelled services are kept (status
 * `cancelled`) so the page can show them with an *Elmarad* badge.
 */
export function resolveWeek(
  source: ScheduleSource,
  week: WeekNav,
  options: { locationIds?: readonly string[]; dayContext?: DayContextFn } = {},
): ScheduleDay[] {
  return resolveDays(scheduleInput(source), week.monday, week.sunday, {
    includeCancelled: true,
    ...(options.locationIds ? { locationIds: options.locationIds } : {}),
    ...(options.dayContext ? { dayContext: options.dayContext } : {}),
  });
}

/** Exception badge of a service: *Elmarad*, *Változás*, *Rendkívüli*, or none. */
export type ExceptionBadge = "cancelled" | "modified" | "added" | null;

export function exceptionBadge(status: ScheduleDay["services"][number]["status"]): ExceptionBadge {
  return status === "regular" ? null : status;
}

// ---------------------------------------------------------------------------------------------
// Regular schedule table (Általános miserend)
// ---------------------------------------------------------------------------------------------

export type Validity =
  | { kind: "always" }
  | { kind: "yearly"; from: string; to: string }
  | { kind: "range"; from: string; to: string }
  | { kind: "from"; from: string }
  | { kind: "until"; to: string };

/** How long a period is valid; dates stay ISO, the page formats them with `@churchy/hu`. */
export function periodValidity(period: SchedulePeriod): Validity {
  const { validFrom: from, validTo: to } = period;
  if (period.yearly && from !== null && to !== null) return { kind: "yearly", from, to };
  if (from !== null && to !== null) return { kind: "range", from, to };
  if (from !== null) return { kind: "from", from };
  if (to !== null) return { kind: "until", to };
  return { kind: "always" };
}

export interface RegularRow {
  weekday: Weekday;
  rules: ServiceRule[];
}

export interface RegularPeriod {
  period: SchedulePeriod;
  validity: Validity;
  /** The period the engine uses for this location today (highest-priority active one). */
  current: boolean;
  /** Weekdays with at least one rule, Monday first; rules by time. */
  rows: RegularRow[];
}

export interface RegularLocation {
  location: Location;
  periods: RegularPeriod[];
}

const byTime = (a: ServiceRule, b: ServiceRule) =>
  a.time < b.time ? -1 : a.time > b.time ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/**
 * The regular weekly schedule per location and period (periods without rules at a location are
 * left out). Periods are ordered by priority, then name; the one in force today is marked.
 */
export function regularSchedule(
  locations: readonly Location[],
  data: ScheduleData,
  today: string,
): RegularLocation[] {
  return locations.map((location) => {
    const rulesHere = data.rules.filter((r) => r.locationId === location.id);
    const periods = data.periods
      .filter((p) => rulesHere.some((r) => r.periodId === p.id))
      .sort((a, b) => a.priority - b.priority || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const active = periods.filter((p) => isPeriodActive(p, today));
    const current = active.reduce<SchedulePeriod | null>(
      (best, p) => (best === null || p.priority > best.priority ? p : best),
      null,
    );
    return {
      location,
      periods: periods.map((period) => {
        const rules = rulesHere.filter((r) => r.periodId === period.id).sort(byTime);
        const rows: RegularRow[] = [];
        for (let weekday = 1 as Weekday; weekday <= 7; weekday = (weekday + 1) as Weekday) {
          const dayRules = rules.filter((r) => r.weekday === weekday);
          if (dayRules.length > 0) rows.push({ weekday, rules: dayRules });
        }
        return {
          period,
          validity: periodValidity(period),
          current: current?.id === period.id,
          rows,
        };
      }),
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------------------------

/** Upper-cases the first letter (Hungarian rules), for badges. */
export function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase("hu") + text.slice(1);
}

/** A preset service type (`effectiveConfig().serviceTypes`). */
export interface ServiceTypeOption {
  key: string;
  forms: { nom: string; lower: string };
}

/**
 * Badge text of a service type: the tenant preset's name when the stored value is one of its keys
 * (or its name), otherwise the stored value itself — the editor's own wording.
 */
export function serviceTypeLabel(type: string, options: readonly ServiceTypeOption[]): string {
  const wanted = type.trim().toLocaleLowerCase("hu");
  const slug = slugify(wanted);
  const match = options.find((o) => o.key === slug || o.forms.lower === wanted);
  return match ? match.forms.nom : capitalize(type.trim());
}

/** The tenant's main language: no language badge for it. */
export const DEFAULT_LANGUAGE = "hu";

const languageNames = new Intl.DisplayNames(["hu"], { type: "language", fallback: "code" });

/** Hungarian name of a language code (`de` → `német`), or the code itself when unknown. */
export function languageName(code: string): string {
  try {
    return languageNames.of(code) ?? code;
  } catch {
    return code;
  }
}
