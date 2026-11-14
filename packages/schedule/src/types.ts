/**
 * Schedule-local structural types. They intentionally mirror the shapes used by
 * `@churchy/contracts` without importing it, so this package stays a pure leaf
 * that both the mock and the DB adapter can feed.
 */

/** Civil date, `"YYYY-MM-DD"` (Europe/Budapest calendar day). */
export type IsoDate = string;
/** Wall-clock time, `"HH:mm"` (24 h, Europe/Budapest). */
export type IsoTime = string;
/** ISO-8601 instant with an explicit offset, e.g. `"2026-11-15T10:00:00+01:00"`. */
export type IsoDateTime = string;

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
/** 1–5 = nth occurrence of the weekday in the month, -1 = last occurrence. */
export type NthWeek = 1 | 2 | 3 | 4 | 5 | -1;

export type LocationKind = "templom" | "kapolna" | "filia" | "egyeb";

export interface ScheduleLocation {
  id: string;
  name: string;
  slug: string;
  kind: LocationKind;
  sort: number;
}

export interface SchedulePeriod {
  id: string;
  name: string;
  /** Inclusive lower bound; `null` = open-ended. For yearly periods only month-day matters. */
  validFrom: IsoDate | null;
  /** Inclusive upper bound; `null` = open-ended. For yearly periods only month-day matters. */
  validTo: IsoDate | null;
  yearly: boolean;
  priority: number;
}

export interface ServiceRule {
  id: string;
  periodId: string;
  locationId: string;
  weekday: Weekday;
  nthWeek: NthWeek | null;
  time: IsoTime;
  durationMin: number;
  serviceType: string;
  language: string;
  title: string | null;
  note: string | null;
  livestream: boolean;
}

export type ServiceExceptionKind = "cancel" | "modify" | "add";

export interface ServiceException {
  id: string;
  locationId: string | null;
  date: IsoDate;
  kind: ServiceExceptionKind;
  ruleId: string | null;
  time: IsoTime | null;
  serviceType: string | null;
  note: string | null;
  reason: string | null;
}

export interface ScheduleInput {
  locations: readonly ScheduleLocation[];
  periods: readonly SchedulePeriod[];
  rules: readonly ServiceRule[];
  exceptions: readonly ServiceException[];
}

/**
 * Feast context of a day, supplied by an injected callback (normally backed by
 * `@churchy/calendar`). Kept generic on purpose.
 */
export interface DayContext {
  liturgicalDayName?: string;
  publicHolidayName?: string;
}

export type DayContextFn = (date: IsoDate) => DayContext;

/**
 * - `regular`   — produced by a rule, untouched by exceptions
 * - `modified`  — produced by a rule, changed by one or more `modify` exceptions
 * - `added`     — created by an `add` exception
 * - `cancelled` — produced by a rule, cancelled (only returned with `includeCancelled`)
 */
export type ServiceStatus = "regular" | "modified" | "added" | "cancelled";

export interface Service {
  /** Stable key: `r:<ruleId>:<date>` for rule occurrences, `x:<exceptionId>` for added services. */
  id: string;
  date: IsoDate;
  weekday: Weekday;
  time: IsoTime;
  startsAt: IsoDateTime;
  endsAt: IsoDateTime;
  durationMin: number;
  locationId: string;
  periodId: string | null;
  /** The producing rule; for added services the template rule (if any). */
  ruleId: string | null;
  status: ServiceStatus;
  /** The exception that last changed this service (cancel/modify/add), else `null`. */
  exceptionId: string | null;
  /** `reason` of that exception. */
  reason: string | null;
  /** For `modified` services: the values before the first modification. */
  original: { time: IsoTime; serviceType: string; note: string | null } | null;
  serviceType: string;
  language: string;
  title: string | null;
  note: string | null;
  livestream: boolean;
  dayContext: DayContext;
}

export interface ScheduleDay {
  date: IsoDate;
  weekday: Weekday;
  dayContext: DayContext;
  services: Service[];
}

/** Defaults for `add` exceptions that have no template rule. */
export interface AddDefaults {
  durationMin: number;
  serviceType: string;
  language: string;
}

export interface ResolveOptions {
  /** Only resolve these locations (exceptions of other locations are ignored). */
  locationIds?: readonly string[];
  /** Feast annotation per day; called at most once per date per call. */
  dayContext?: DayContextFn;
  /** Also return cancelled rule occurrences (status `cancelled`). Default `false`. */
  includeCancelled?: boolean;
  /** Overrides for {@link DEFAULT_ADD}. */
  addDefaults?: Partial<AddDefaults>;
}
