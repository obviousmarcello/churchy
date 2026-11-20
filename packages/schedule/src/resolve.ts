/**
 * Service schedule resolver (SDD §9.1): rules + periods + exceptions → concrete
 * services for a civil date range in Europe/Budapest.
 *
 * Exception semantics (applied per date, in the order cancel → modify → add;
 * within a kind, in input order):
 *
 * Scope. An exception with `locationId` set applies to that location only;
 * `locationId: null` applies to every location. An exception with `ruleId` set
 * targets only the occurrence of that rule on `date` (the rule must have produced
 * a service that day, i.e. its period won for that location and its weekday /
 * nth-week matched; otherwise it is a no-op). Both filters combine: a `ruleId`
 * exception whose `locationId` differs from the rule's location matches nothing.
 * Exceptions for locations outside the `locationIds` filter, or for unknown
 * locations, are ignored.
 *
 * - `cancel`: every rule occurrence in scope is cancelled. Cancelled services are
 *   dropped, or returned with status `cancelled` when `includeCancelled` is set.
 *   The first matching cancel wins (its id/reason are kept).
 * - `modify`: every non-cancelled rule occurrence in scope gets the exception's
 *   non-null `time` / `serviceType` / `note` (`null` = keep). Status becomes
 *   `modified`; `original` keeps the values before the first modification. Several
 *   modifies on one service apply in input order (later wins per field). With
 *   `ruleId: null` all services in scope are changed alike (an admin UI should
 *   only allow `time` there when the scope holds a single service).
 * - `add`: creates one extra service, never affected by cancel/modify of the same
 *   day (so "all cancelled, one joint service instead" works). With `ruleId` the
 *   rule is a template (location, duration, type, language, title, note,
 *   livestream); the exception's non-null `locationId` / `time` / `serviceType` /
 *   `note` override it. Without `ruleId`, `locationId` and `time` are required
 *   (otherwise the add is ignored); the rest comes from `options.addDefaults`.
 *
 * Exceptions never move a service to another date: a "moved to another day"
 * change is a cancel plus an add.
 */
import {
  compareStrings,
  epochDayToCivil,
  formatIsoDate,
  matchesNthWeek,
  parseIsoDate,
  parseIsoTime,
  toEpochDay,
  weekdayOfEpochDay,
  type CivilDate,
} from "./civil";
import { ScheduleError } from "./errors";
import { compilePeriod, type PeriodMatcher } from "./periods";
import type {
  AddDefaults,
  DayContext,
  IsoDate,
  ResolveOptions,
  ScheduleDay,
  ScheduleInput,
  ScheduleLocation,
  SchedulePeriod,
  Service,
  ServiceException,
  ServiceRule,
  Weekday,
} from "./types";
import { formatInstant, zonedTimeToInstant } from "./zone";

/** Maximum number of days (inclusive) one `resolve` call may cover (D-09 AC 1). */
export const MAX_RANGE_DAYS = 400;

export const DEFAULT_ADD: Readonly<AddDefaults> = {
  durationMin: 60,
  serviceType: "service",
  language: "hu",
};

const MS_PER_MIN = 60_000;
const EMPTY_CONTEXT: DayContext = Object.freeze({});

interface CompiledRule {
  rule: ServiceRule;
  minutes: number;
}

interface Bucket {
  period: SchedulePeriod;
  active: PeriodMatcher;
  /** Index 1–7 = ISO weekday. */
  byWeekday: CompiledRule[][];
}

interface Compiled {
  locations: ScheduleLocation[];
  locationById: Map<string, ScheduleLocation>;
  buckets: Map<string, Bucket[]>;
  ruleById: Map<string, CompiledRule>;
  exceptionsByDate: Map<IsoDate, ServiceException[]>;
  addDefaults: AddDefaults;
}

/** Called for each service an exception actually changed (used by `upcomingExceptions`). */
export type EffectSink = (exception: ServiceException, service: Service) => void;

function compile(input: ScheduleInput, options: ResolveOptions): Compiled {
  const filter = options.locationIds ? new Set(options.locationIds) : null;
  const locations = input.locations.filter((l) => !filter || filter.has(l.id));
  const locationById = new Map(locations.map((l) => [l.id, l]));

  const periodById = new Map<string, { period: SchedulePeriod; active: PeriodMatcher }>();
  for (const period of input.periods) {
    periodById.set(period.id, { period, active: compilePeriod(period) });
  }

  const ruleById = new Map<string, CompiledRule>();
  const buckets = new Map<string, Bucket[]>();
  const bucketByKey = new Map<string, Bucket>();
  for (const rule of input.rules) {
    let minutes: number;
    try {
      minutes = parseIsoTime(rule.time);
    } catch {
      throw new ScheduleError("INVALID_TIME", `Rule ${rule.id} has an invalid time ${rule.time}`);
    }
    const compiled: CompiledRule = { rule, minutes };
    ruleById.set(rule.id, compiled);
    const period = periodById.get(rule.periodId);
    if (!period || !locationById.has(rule.locationId)) continue;
    const key = `${rule.periodId}\u0000${rule.locationId}`;
    let bucket = bucketByKey.get(key);
    if (!bucket) {
      bucket = { ...period, byWeekday: [[], [], [], [], [], [], [], []] };
      bucketByKey.set(key, bucket);
      const list = buckets.get(rule.locationId) ?? [];
      list.push(bucket);
      buckets.set(rule.locationId, list);
    }
    bucket.byWeekday[rule.weekday]?.push(compiled);
  }
  // Highest priority first; ties broken by period id so the result never depends on row order.
  for (const list of buckets.values()) {
    list.sort(
      (a, b) => b.period.priority - a.period.priority || compareStrings(a.period.id, b.period.id),
    );
  }

  const exceptionsByDate = new Map<IsoDate, ServiceException[]>();
  for (const exception of input.exceptions) {
    parseIsoDate(exception.date);
    if (exception.time !== null) parseIsoTime(exception.time);
    const list = exceptionsByDate.get(exception.date) ?? [];
    list.push(exception);
    exceptionsByDate.set(exception.date, list);
  }

  return {
    locations,
    locationById,
    buckets,
    ruleById,
    exceptionsByDate,
    addDefaults: { ...DEFAULT_ADD, ...options.addDefaults },
  };
}

function setTiming(service: Service, civil: CivilDate, minutes: number): void {
  const start = zonedTimeToInstant(civil.year, civil.month, civil.day, minutes);
  service.startsAt = formatInstant(start);
  service.endsAt = formatInstant(start + service.durationMin * MS_PER_MIN);
}

function ruleService(
  compiled: CompiledRule,
  date: IsoDate,
  weekday: Weekday,
  civil: CivilDate,
  dayContext: DayContext,
): Service {
  const { rule } = compiled;
  const service: Service = {
    id: `r:${rule.id}:${date}`,
    date,
    weekday,
    time: rule.time,
    startsAt: "",
    endsAt: "",
    durationMin: rule.durationMin,
    locationId: rule.locationId,
    periodId: rule.periodId,
    ruleId: rule.id,
    status: "regular",
    exceptionId: null,
    reason: null,
    original: null,
    serviceType: rule.serviceType,
    language: rule.language,
    title: rule.title,
    note: rule.note,
    livestream: rule.livestream,
    dayContext,
  };
  setTiming(service, civil, compiled.minutes);
  return service;
}

function inScope(exception: ServiceException, service: Service): boolean {
  return (
    (exception.locationId === null || exception.locationId === service.locationId) &&
    (exception.ruleId === null || exception.ruleId === service.ruleId)
  );
}

function addService(
  c: Compiled,
  exception: ServiceException,
  date: IsoDate,
  weekday: Weekday,
  civil: CivilDate,
  dayContext: DayContext,
): Service | null {
  const template = exception.ruleId === null ? undefined : c.ruleById.get(exception.ruleId);
  if (exception.ruleId !== null && !template) return null;
  const rule = template?.rule;
  const locationId = exception.locationId ?? rule?.locationId;
  const time = exception.time ?? rule?.time;
  if (locationId === undefined || time === undefined || !c.locationById.has(locationId)) {
    return null;
  }
  const service: Service = {
    id: `x:${exception.id}`,
    date,
    weekday,
    time,
    startsAt: "",
    endsAt: "",
    durationMin: rule?.durationMin ?? c.addDefaults.durationMin,
    locationId,
    periodId: rule?.periodId ?? null,
    ruleId: rule?.id ?? null,
    status: "added",
    exceptionId: exception.id,
    reason: exception.reason,
    original: null,
    serviceType: exception.serviceType ?? rule?.serviceType ?? c.addDefaults.serviceType,
    language: rule?.language ?? c.addDefaults.language,
    title: rule?.title ?? null,
    note: exception.note ?? rule?.note ?? null,
    livestream: rule?.livestream ?? false,
    dayContext,
  };
  setTiming(service, civil, parseIsoTime(time));
  return service;
}

function compareServices(locationById: Map<string, ScheduleLocation>) {
  // Every resolved service belongs to a known (selected) location.
  const sortOf = (s: Service) => (locationById.get(s.locationId) as ScheduleLocation).sort;
  return (a: Service, b: Service): number =>
    compareStrings(a.time, b.time) ||
    sortOf(a) - sortOf(b) ||
    compareStrings(a.locationId, b.locationId) ||
    compareStrings(a.id, b.id);
}

function resolveDay(
  c: Compiled,
  epochDay: number,
  options: ResolveOptions,
  sink: EffectSink | undefined,
): ScheduleDay {
  const civil = epochDayToCivil(epochDay);
  const date = formatIsoDate(civil.year, civil.month, civil.day);
  const weekday = weekdayOfEpochDay(epochDay);
  const dayContext = options.dayContext ? options.dayContext(date) : EMPTY_CONTEXT;

  // 1. Base services: per location, the highest-priority active period with rules there wins.
  const services: Service[] = [];
  for (const location of c.locations) {
    const list = c.buckets.get(location.id);
    const bucket = list?.find((b) => b.active(epochDay, civil));
    if (!bucket) continue;
    for (const compiled of bucket.byWeekday[weekday] as CompiledRule[]) {
      const nth = compiled.rule.nthWeek;
      if (nth !== null && !matchesNthWeek(civil, nth)) continue;
      services.push(ruleService(compiled, date, weekday, civil, dayContext));
    }
  }

  // 2. Exceptions: cancel → modify → add.
  const exceptions = (c.exceptionsByDate.get(date) ?? []).filter(
    (e) => e.locationId === null || c.locationById.has(e.locationId),
  );
  for (const exception of exceptions) {
    if (exception.kind !== "cancel") continue;
    for (const service of services) {
      if (service.status === "cancelled" || !inScope(exception, service)) continue;
      service.status = "cancelled";
      service.exceptionId = exception.id;
      service.reason = exception.reason;
      sink?.(exception, service);
    }
  }
  for (const exception of exceptions) {
    if (exception.kind !== "modify") continue;
    for (const service of services) {
      if (service.status === "cancelled" || !inScope(exception, service)) continue;
      service.original ??= {
        time: service.time,
        serviceType: service.serviceType,
        note: service.note,
      };
      service.status = "modified";
      service.exceptionId = exception.id;
      service.reason = exception.reason;
      if (exception.serviceType !== null) service.serviceType = exception.serviceType;
      if (exception.note !== null) service.note = exception.note;
      if (exception.time !== null && exception.time !== service.time) {
        service.time = exception.time;
        setTiming(service, civil, parseIsoTime(exception.time));
      }
      sink?.(exception, service);
    }
  }
  for (const exception of exceptions) {
    if (exception.kind !== "add") continue;
    const service = addService(c, exception, date, weekday, civil, dayContext);
    if (!service) continue;
    services.push(service);
    sink?.(exception, service);
  }

  const visible = options.includeCancelled
    ? services
    : services.filter((s) => s.status !== "cancelled");
  visible.sort(compareServices(c.locationById));
  return { date, weekday, dayContext, services: visible };
}

function rangeDays(from: IsoDate, to: IsoDate): [number, number] {
  const start = toEpochDay(from);
  const end = toEpochDay(to);
  if (end < start) {
    throw new ScheduleError("RANGE_INVERTED", `Range end ${to} is before its start ${from}`);
  }
  if (end - start + 1 > MAX_RANGE_DAYS) {
    throw new ScheduleError(
      "RANGE_TOO_LARGE",
      `Range ${from}…${to} spans ${end - start + 1} days; the maximum is ${MAX_RANGE_DAYS}`,
    );
  }
  return [start, end];
}

/** Internal: {@link resolveDays} plus an effect sink for exception reporting. */
export function resolveDaysWithEffects(
  input: ScheduleInput,
  from: IsoDate,
  to: IsoDate,
  options: ResolveOptions,
  sink: EffectSink | undefined,
): ScheduleDay[] {
  const [start, end] = rangeDays(from, to);
  const compiled = compile(input, options);
  const days: ScheduleDay[] = [];
  for (let day = start; day <= end; day++) days.push(resolveDay(compiled, day, options, sink));
  return days;
}

/**
 * Every civil day in `[from, to]` (inclusive, ≤ {@link MAX_RANGE_DAYS} days) with
 * its feast context and services — also days without services (schedule page rows).
 *
 * @throws {ScheduleError} `INVALID_DATE`, `INVALID_TIME`, `RANGE_INVERTED`, `RANGE_TOO_LARGE`
 */
export function resolveDays(
  input: ScheduleInput,
  from: IsoDate,
  to: IsoDate,
  options: ResolveOptions = {},
): ScheduleDay[] {
  return resolveDaysWithEffects(input, from, to, options, undefined);
}

/**
 * Concrete services in `[from, to]` (inclusive, ≤ {@link MAX_RANGE_DAYS} days),
 * sorted by date, time, location `sort` (then location id and service id).
 *
 * @throws {ScheduleError} `INVALID_DATE`, `INVALID_TIME`, `RANGE_INVERTED`, `RANGE_TOO_LARGE`
 */
export function resolve(
  input: ScheduleInput,
  from: IsoDate,
  to: IsoDate,
  options: ResolveOptions = {},
): Service[] {
  return resolveDays(input, from, to, options).flatMap((d) => d.services);
}
