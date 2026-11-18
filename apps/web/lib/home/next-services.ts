import type { Location, ScheduleData } from "@churchy/contracts";
import { todayInBudapest } from "@churchy/hu";
import {
  nextServices,
  upcomingExceptions,
  type NextService,
  type Service,
  type UpcomingException,
} from "@churchy/schedule";
import { scheduleInput } from "@/lib/service-schedule/view";

/**
 * View model of the home page's "next services" block (D-10, SDD §7.1 and §9.3). The selection
 * rules (today and tomorrow, else the next 3 within 14 days, *Most zajlik* window) are the real
 * `@churchy/schedule` engine's; this only groups the result for display. Pure: the clock is a
 * parameter, so a test can cross midnight or a DST change without touching any data.
 */

/** Days ahead the block looks for exceptions to highlight. */
export const EXCEPTION_DAYS = 14;
/** Most exception lines the block shows (the schedule page lists them all). */
export const EXCEPTION_LINES = 3;

export interface DayGroup {
  /** `YYYY-MM-DD` (Europe/Budapest). */
  date: string;
  services: NextService[];
}

/** One highlighted exception line: what changed on a date, for one service. */
export interface ExceptionLine {
  exceptionId: string;
  date: string;
  kind: UpcomingException["kind"];
  service: Service;
}

export interface NextServicesView {
  /** Budapest date of `now`. */
  today: string;
  /** The services to show, grouped by day, in order. */
  days: DayGroup[];
  /** Upcoming exceptions within {@link EXCEPTION_DAYS} days, at most {@link EXCEPTION_LINES}. */
  exceptions: ExceptionLine[];
  /** How many more exception lines exist than are shown. */
  moreExceptions: number;
  /** A livestreamed service started within the last hour (*Most zajlik*), or null. */
  live: NextService | null;
}

export function groupByDate(services: readonly NextService[]): DayGroup[] {
  const days: DayGroup[] = [];
  for (const service of services) {
    const last = days.at(-1);
    if (last?.date === service.date) last.services.push(service);
    else days.push({ date: service.date, services: [service] });
  }
  return days;
}

export function exceptionLines(exceptions: readonly UpcomingException[]): ExceptionLine[] {
  return exceptions.flatMap((e) =>
    e.services.map((service) => ({
      exceptionId: e.exception.id,
      date: e.date,
      kind: e.kind,
      service,
    })),
  );
}

export function buildNextServices(
  source: { locations: readonly Location[]; data: ScheduleData },
  now: Date,
): NextServicesView {
  const input = scheduleInput(source);
  const instant = now.toISOString();
  const services = nextServices(input, instant);
  const lines = exceptionLines(upcomingExceptions(input, instant, EXCEPTION_DAYS));
  return {
    today: todayInBudapest(now),
    days: groupByDate(services),
    exceptions: lines.slice(0, EXCEPTION_LINES),
    moreExceptions: Math.max(0, lines.length - EXCEPTION_LINES),
    live: services.find((s) => s.inProgress) ?? null,
  };
}
