import { isOpen, TICKET_STATUSES, type TicketStatus } from "./lifecycle";
import { slaStatus, workingMinutesBetween } from "./sla";
import type { WorkdayCalendar } from "./workdays";

/** HR dashboard figures (SDD §25.5): open by category/status, overdue list, median resolution. */

export interface StatTicket {
  readonly id: string;
  readonly categoryId: string;
  readonly status: TicketStatus;
  readonly createdAt: string;
  readonly closedAt: string | null;
  readonly slaHours: number | null;
}

export interface CategoryStats {
  readonly categoryId: string;
  readonly open: number;
  readonly overdue: number;
  /** Median working time from submission to closing, in minutes (null: nothing closed yet). */
  readonly medianResolutionMinutes: number | null;
}

export interface TicketStats {
  readonly open: number;
  readonly byStatus: Readonly<Record<TicketStatus, number>>;
  readonly byCategory: readonly CategoryStats[];
  /** Ids of open tickets past their due time, most overdue first. */
  readonly overdueIds: readonly string[];
  readonly medianResolutionMinutes: number | null;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

export function ticketStats(
  tickets: readonly StatTicket[],
  now: Date | string,
  calendar: WorkdayCalendar,
): TicketStats {
  const byStatus = Object.fromEntries(TICKET_STATUSES.map((s) => [s, 0])) as Record<
    TicketStatus,
    number
  >;
  const overdue: { id: string; minutesLeft: number }[] = [];
  const resolution = new Map<string, number[]>();
  const open = new Map<string, number>();
  const late = new Map<string, number>();
  const categories = new Set<string>();

  for (const t of tickets) {
    byStatus[t.status] += 1;
    categories.add(t.categoryId);
    if (isOpen(t.status)) {
      open.set(t.categoryId, (open.get(t.categoryId) ?? 0) + 1);
      const sla = slaStatus(
        { createdAt: t.createdAt, slaHours: t.slaHours, closedAt: null },
        now,
        calendar,
      );
      if (sla.state === "overdue") {
        overdue.push({ id: t.id, minutesLeft: sla.minutesLeft ?? 0 });
        late.set(t.categoryId, (late.get(t.categoryId) ?? 0) + 1);
      }
    } else if (t.closedAt !== null) {
      const list = resolution.get(t.categoryId) ?? [];
      list.push(workingMinutesBetween(t.createdAt, t.closedAt, calendar));
      resolution.set(t.categoryId, list);
    }
  }

  return {
    open: [...open.values()].reduce((a, b) => a + b, 0),
    byStatus,
    byCategory: [...categories].map((categoryId) => ({
      categoryId,
      open: open.get(categoryId) ?? 0,
      overdue: late.get(categoryId) ?? 0,
      medianResolutionMinutes: median(resolution.get(categoryId) ?? []),
    })),
    overdueIds: overdue.sort((a, b) => a.minutesLeft - b.minutesLeft).map((o) => o.id),
    medianResolutionMinutes: median([...resolution.values()].flat()),
  };
}
