// Test builders. All data is fictitious demo data.
import type {
  ScheduleInput,
  ScheduleLocation,
  SchedulePeriod,
  Service,
  ServiceException,
  ServiceRule,
} from "../types";

export function location(id: string, sort: number): ScheduleLocation {
  return { id, name: `Helyszín ${id}`, slug: id.toLowerCase(), kind: "templom", sort };
}

export function period(id: string, overrides: Partial<SchedulePeriod> = {}): SchedulePeriod {
  return {
    id,
    name: id,
    validFrom: null,
    validTo: null,
    yearly: false,
    priority: 0,
    ...overrides,
  };
}

export function rule(id: string, overrides: Partial<ServiceRule> = {}): ServiceRule {
  return {
    id,
    periodId: "alt",
    locationId: "L1",
    weekday: 7,
    nthWeek: null,
    time: "10:00",
    durationMin: 60,
    serviceType: "szentmise",
    language: "hu",
    title: null,
    note: null,
    livestream: false,
    ...overrides,
  };
}

export function exception(
  id: string,
  overrides: Partial<ServiceException> & Pick<ServiceException, "date" | "kind">,
): ServiceException {
  return {
    id,
    locationId: null,
    ruleId: null,
    time: null,
    serviceType: null,
    note: null,
    reason: null,
    ...overrides,
  };
}

export function scheduleInput(partial: Partial<ScheduleInput> = {}): ScheduleInput {
  return {
    locations: [location("L1", 1), location("L2", 2)],
    periods: [period("alt")],
    rules: [],
    exceptions: [],
    ...partial,
  };
}

/** Compact, readable projection used in table-driven assertions. */
export function brief(services: readonly Service[]): string[] {
  return services.map((s) => `${s.date} ${s.time} ${s.locationId} ${s.status}`);
}
