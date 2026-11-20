import type { BookingStatus, HrTicketStatus } from "@churchy/contracts";
import { addDays, startOfIsoWeek } from "@churchy/hu";
import { can } from "@churchy/policy";
import { buildEntries, groupByDay, type CalendarEntry } from "@/lib/workspace/calendar";
import { tierStatus, type TierStatus } from "@/lib/workspace/plan-tier";
import { loadCalendarSources, type WorkspaceEnv } from "@/server/workspace";

/**
 * Data of *Ma* (D-53, SDD §20.3): to-dos, approvals, today, this week and my requests. Every block
 * is a plain list that is empty when there is nothing to show (the page then omits the block).
 * Privacy: HR items carry the reference number and a status only — never the subject or data.
 */

export interface TodoItem {
  id: string;
  startsAt: string;
  position: string;
  team: string;
}

export type ApprovalItem =
  | { kind: "booking"; id: string; title: string; room: string; startsAt: string }
  | { kind: "plan"; id: string; title: string }
  | { kind: "hr"; id: string; reference: string };

export interface RequestItem {
  kind: "hr" | "booking";
  id: string;
  /** HR reference number, or the booking title. */
  label: string;
  /** Category name (HR, not confidential) or room name. */
  detail: string | null;
  status: HrTicketStatus | BookingStatus;
}

export interface TodayData {
  givenName: string | null;
  todos: TodoItem[];
  approvals: ApprovalItem[];
  today: CalendarEntry[];
  week: { date: string; entries: CalendarEntry[] }[];
  requests: RequestItem[];
  tier: TierStatus | null;
}

const OPEN_TICKET: readonly HrTicketStatus[] = ["uj", "folyamatban", "jovahagyasra_var"];

export async function loadToday(env: WorkspaceEnv): Promise<TodayData> {
  const { actor, ctx, repos, tenantId, me, today } = env;
  const personId = me?.personId ?? null;
  const weekEnd = addDays(startOfIsoWeek(today), 6);
  const horizon = addDays(today, 60);
  const windowFrom = `${today}T00:00:00Z`;

  const sources = await loadCalendarSources(env, today, weekEnd, [
    "events",
    "services",
    "assignments",
    "bookings",
    "holidays",
  ]);
  // *Ma* lists only my own booking requests; the calendar shows all of them.
  const mine = { ...sources, bookings: sources.bookings.filter((b) => b.mine) };
  const byDay = groupByDay(
    buildEntries(mine, ["events", "services", "assignments", "bookings", "holidays"], []),
    today,
    weekEnd,
  );

  // To-dos: assignment requests waiting for my answer.
  const todos: TodoItem[] = [];
  if (personId !== null) {
    const rows = await repos.assignments.list(ctx, {
      personId,
      from: windowFrom,
      to: `${horizon}T00:00:00Z`,
      statuses: ["requested"],
    });
    const teams = new Map((await repos.teams.list(ctx)).map((t) => [t.id, t.name]));
    const positions = new Map<string, string>();
    for (const teamId of new Set(rows.map((r) => r.teamId))) {
      for (const p of await repos.teams.listPositions(ctx, teamId)) positions.set(p.id, p.name);
    }
    for (const a of rows) {
      todos.push({
        id: a.id,
        startsAt: a.startsAt,
        position: positions.get(a.positionId) ?? "",
        team: teams.get(a.teamId) ?? "",
      });
    }
  }

  // Approvals: bookings of rooms I manage, plans I may approve, my direct reports' requests.
  const approvals: ApprovalItem[] = [];
  const pending = await repos.bookings.list(ctx, {
    from: windowFrom,
    to: `${addDays(today, 180)}T00:00:00Z`,
    statuses: ["pending"],
  });
  if (pending.length > 0) {
    const rooms = new Map((await repos.rooms.list(ctx)).map((r) => [r.id, r.name]));
    for (const b of pending) {
      if (!can(actor, "booking.approve", { tenantId, roomId: b.roomId })) continue;
      approvals.push({
        kind: "booking",
        id: b.id,
        title: b.title,
        room: rooms.get(b.roomId) ?? "",
        startsAt: b.startsAt,
      });
    }
  }
  for (const plan of await repos.servicePlans.list(ctx, { status: "in_review" })) {
    if (
      can(actor, "servicePlan.approve", { tenantId, teamId: null, musicLeaderMayApprove: false })
    ) {
      approvals.push({ kind: "plan", id: plan.id, title: plan.title });
    }
  }
  const reports = me?.directReportPersonIds ?? [];
  if (reports.length > 0) {
    const categories = new Map((await repos.hr.listCategories(ctx)).map((c) => [c.id, c]));
    for (const t of await repos.hr.listTickets(ctx, { status: "jovahagyasra_var" })) {
      const category = categories.get(t.categoryId);
      if (!category || t.requesterPersonId === null || !reports.includes(t.requesterPersonId))
        continue;
      const ref = { id: category.id, key: category.key, confidential: category.confidential };
      if (
        can(actor, "hr.ticket.approveAsManager", {
          tenantId,
          category: ref,
          requesterPersonId: t.requesterPersonId,
        })
      ) {
        approvals.push({ kind: "hr", id: t.id, reference: t.reference });
      }
    }
  }

  // My requests: HR tickets (reference + status) and my open room bookings.
  const requests: RequestItem[] = [];
  if (personId !== null) {
    const [tickets, categories] = await Promise.all([
      repos.hr.listTickets(ctx, { requesterPersonId: personId }),
      repos.hr.listCategories(ctx),
    ]);
    const names = new Map(categories.map((c) => [c.id, c]));
    for (const t of tickets.filter((x) => OPEN_TICKET.includes(x.status))) {
      const category = names.get(t.categoryId);
      requests.push({
        kind: "hr",
        id: t.id,
        label: t.reference,
        // A confidential category is not even named on the home screen.
        detail: category && !category.confidential ? category.name : null,
        status: t.status,
      });
    }
  }
  const rooms = sources.bookings.filter((b) => b.mine && b.status === "pending");
  for (const b of rooms) {
    requests.push({
      kind: "booking",
      id: b.id,
      label: b.title,
      detail: b.roomName,
      status: b.status,
    });
  }

  // Plan tier warning for those who manage users (D-53 AC5).
  let tier: TierStatus | null = null;
  if (
    env.tenant !== null &&
    can(actor, "site.users.manage", { tenantId, targetRoles: ["editor"] })
  ) {
    const members = await repos.members.list(ctx);
    const status = tierStatus(env.tenant.wsTier, members.filter((m) => m.active).length);
    tier = status.level === "warning" || status.level === "full" ? status : null;
  }

  const person = personId === null ? null : await repos.people.get(ctx, personId);
  return {
    givenName: person?.givenName ?? null,
    todos,
    approvals,
    today: byDay.get(today) ?? [],
    week: [...byDay.entries()]
      .filter(([date]) => date > today)
      .map(([date, entries]) => ({ date, entries })),
    requests,
    tier,
  };
}
