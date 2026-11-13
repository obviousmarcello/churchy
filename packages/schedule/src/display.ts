/**
 * Display helpers (SDD §9.3). They return label *keys* and data only; turning
 * them into Hungarian text (*Ma*, *Holnap*, *Szombat, nov. 15.*) is the job of
 * the Hungarian formatting package in the UI.
 */
import { addDays, compareStrings } from "./civil";
import { ScheduleError } from "./errors";
import { resolve, resolveDaysWithEffects } from "./resolve";
import type {
  IsoDate,
  IsoDateTime,
  ResolveOptions,
  ScheduleInput,
  ScheduleLocation,
  Service,
  ServiceException,
  ServiceExceptionKind,
} from "./types";
import { budapestDateOf, parseInstant } from "./zone";

/** A livestreamed service counts as "in progress" (*Most zajlik*) for this long after its start. */
export const IN_PROGRESS_WINDOW_MIN = 60;
/** Fallback look-ahead of `nextServices` when nothing is left today or tomorrow. */
export const NEXT_SERVICES_FALLBACK_DAYS = 14;
/** Number of services shown by the fallback. */
export const NEXT_SERVICES_FALLBACK_COUNT = 3;

const MS_PER_MIN = 60_000;

export type RelativeDayLabel = "today" | "tomorrow" | "weekday";

export type NextService = Service & {
  /** `today` → *Ma*, `tomorrow` → *Holnap*, `weekday` → *Szombat, nov. 15.* (from `date`). */
  label: RelativeDayLabel;
  /** Started within the last {@link IN_PROGRESS_WINDOW_MIN} minutes and has a livestream. */
  inProgress: boolean;
};

export type DisplayOptions = Pick<ResolveOptions, "locationIds" | "dayContext" | "addDefaults">;

/**
 * Whether `service` is live right now: it has a livestream, is not cancelled and
 * started at most {@link IN_PROGRESS_WINDOW_MIN} minutes ago (start inclusive).
 */
export function isInProgress(service: Service, now: IsoDateTime): boolean {
  if (!service.livestream || service.status === "cancelled") return false;
  const nowMs = parseInstant(now);
  const start = parseInstant(service.startsAt);
  return start <= nowMs && nowMs < start + IN_PROGRESS_WINDOW_MIN * MS_PER_MIN;
}

/**
 * Home-page "next services" block (SDD §9.3, FR-001):
 *
 * 1. every service from `now` to the end of tomorrow (Budapest), plus livestreamed
 *    services that started within the last 60 minutes (flagged `inProgress`);
 * 2. if that is empty: the next {@link NEXT_SERVICES_FALLBACK_COUNT} services
 *    starting from `now` whose date is at most
 *    {@link NEXT_SERVICES_FALLBACK_DAYS} days after today.
 *
 * Cancelled services are never included. `now` must carry an explicit offset.
 */
export function nextServices(
  input: ScheduleInput,
  now: IsoDateTime,
  options: DisplayOptions = {},
): NextService[] {
  const nowMs = parseInstant(now);
  const today = budapestDateOf(nowMs);
  const tomorrow = addDays(today, 1);
  const services = resolve(input, today, addDays(today, NEXT_SERVICES_FALLBACK_DAYS), {
    ...options,
    includeCancelled: false,
  });

  const toItem = (service: Service): NextService => ({
    ...service,
    label: service.date === today ? "today" : service.date === tomorrow ? "tomorrow" : "weekday",
    inProgress: isInProgress(service, now),
  });

  const soon = services
    .filter((s) => s.date <= tomorrow)
    .filter((s) => parseInstant(s.startsAt) >= nowMs || isInProgress(s, now));
  if (soon.length > 0) return soon.map(toItem);

  return services
    .filter((s) => parseInstant(s.startsAt) >= nowMs)
    .slice(0, NEXT_SERVICES_FALLBACK_COUNT)
    .map(toItem);
}

export interface UpcomingException {
  exception: ServiceException;
  date: IsoDate;
  kind: ServiceExceptionKind;
  /**
   * Services the exception actually changed, in their final state:
   * cancel → the cancelled services (status `cancelled`), modify → the modified
   * services (`original` holds the previous time/type/note), add → the added service.
   */
  services: Service[];
}

/**
 * Exceptions with an effect on dates `today … today + days − 1` (Budapest date of
 * `now`), for the home-page warning line (*„Nov. 15-én a 10 órai mise 8:30-kor
 * kezdődik.”*). Exceptions that change nothing (e.g. cancelling a rule that has
 * no occurrence that day) are omitted. Sorted by date, then by the first affected
 * service (time, location `sort`), then exception id.
 */
export function upcomingExceptions(
  input: ScheduleInput,
  now: IsoDateTime,
  days: number,
  options: DisplayOptions = {},
): UpcomingException[] {
  if (!Number.isInteger(days) || days < 1) {
    throw new ScheduleError("INVALID_ARGUMENT", `days must be a positive integer, got ${days}`);
  }
  const today = budapestDateOf(parseInstant(now));
  const byId = new Map<string, UpcomingException>();
  resolveDaysWithEffects(
    input,
    today,
    addDays(today, days - 1),
    { ...options, includeCancelled: true },
    (exception, service) => {
      let entry = byId.get(exception.id);
      if (!entry) {
        entry = { exception, date: exception.date, kind: exception.kind, services: [] };
        byId.set(exception.id, entry);
      }
      // Each (exception, service) pair is reported once by the resolver.
      entry.services.push(service);
    },
  );

  // Affected services always belong to a known location.
  const sortOf = new Map(input.locations.map((l: ScheduleLocation) => [l.id, l.sort]));
  const firstKey = (e: UpcomingException): [string, number] => {
    const first = e.services.reduce((a, b) => (b.time < a.time ? b : a));
    return [first.time, sortOf.get(first.locationId) as number];
  };
  return [...byId.values()].sort((a, b) => {
    const [ta, sa] = firstKey(a);
    const [tb, sb] = firstKey(b);
    return (
      compareStrings(a.date, b.date) ||
      compareStrings(ta, tb) ||
      sa - sb ||
      compareStrings(a.exception.id, b.exception.id)
    );
  });
}
