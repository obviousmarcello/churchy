import { cache } from "react";
import { notFound } from "next/navigation";
import type { Ctx, Repositories, Tenant } from "@churchy/contracts";
import { effectiveConfig } from "@churchy/presets";
import type { LiturgicalFamily } from "@churchy/calendar";
import { dayWindow } from "@churchy/events";
import { formatPersonName, todayInBudapest } from "@churchy/hu";
import { can, type Actor, type TenantActor } from "@churchy/policy";
import { resolve } from "@churchy/schedule";
import { scheduleInput } from "@/lib/service-schedule/view";
import { eventVisibleTo } from "@/lib/workspace/event-access";
import type { CalendarSources, Layer, ServiceSource } from "@/lib/workspace/calendar";
import { getRequestNow } from "@/server/clock";
import { getRequestRepositories } from "@/server/repositories";
import { getActor, getRequestContext } from "@/server/session";

/**
 * Server helpers of the workspace (D-53, D-57, D-58). Everything is read through the repository
 * interfaces with the request's tenant ctx; visibility is decided by `can()` and the helpers in
 * `lib/workspace/`, never by role checks.
 */

export interface WorkspaceEnv {
  readonly actor: Actor;
  /** The acting tenant user; null for anyone else (they get the no-access page). */
  readonly me: TenantActor | null;
  readonly tenantId: string;
  readonly ctx: Ctx;
  readonly repos: Repositories;
  readonly now: Date;
  readonly today: string;
  readonly tenant: Tenant | null;
  readonly family: LiturgicalFamily;
}

/** The request's workspace environment (once per request). */
export const getWorkspaceEnv = cache(async (): Promise<WorkspaceEnv> => {
  const [actor, context, repos, now] = await Promise.all([
    getActor(),
    getRequestContext(),
    getRequestRepositories(),
    getRequestNow(),
  ]);
  const tenantId = context.tenantId ?? "";
  const me = actor.kind === "tenant" && actor.tenantId === tenantId ? actor : null;
  const ctx: Ctx = {
    tenantId,
    actor:
      me === null ? { userId: null, personId: null } : { userId: me.userId, personId: me.personId },
  };
  const tenant = me === null ? null : await repos.tenants.current(ctx);
  const family = tenant
    ? effectiveConfig({
        name: tenant.name,
        denomination: tenant.denomination,
        siteConfig: tenant.siteConfig,
      }).calendarFamily
    : "catholic";
  return { actor, me, tenantId, ctx, repos, now, today: todayInBudapest(now), tenant, family };
});

const capitalize = (s: string): string => (s === "" ? s : s.charAt(0).toUpperCase() + s.slice(1));

/**
 * The raw material of the calendar layers for `[from, to]`, already permission-filtered. Only the
 * requested layers are read.
 */
export async function loadCalendarSources(
  env: WorkspaceEnv,
  from: string,
  to: string,
  layers: readonly Layer[],
): Promise<CalendarSources> {
  const { actor, ctx, repos, tenantId, me } = env;
  const on = new Set(layers);
  const window = dayWindow(from, to);
  const personId = me?.personId ?? null;

  const [calendars, locations] = await Promise.all([
    repos.events.listCalendars(ctx),
    repos.locations.list(ctx),
  ]);
  const locationNames = new Map(locations.map((l) => [l.id, l.name]));
  const calendarById = new Map(calendars.map((c) => [c.id, c]));

  const events = on.has("events")
    ? (await repos.events.list(ctx, window)).filter((e) =>
        eventVisibleTo(actor, e, calendarById.get(e.calendarId)),
      )
    : [];

  const needTeams = on.has("services") || on.has("assignments");
  const teamNames = needTeams
    ? new Map((await repos.teams.list(ctx)).map((t) => [t.id, t.name]))
    : new Map<string, string>();

  // Services: schedule engine + materialized occurrences + plans + who is assigned.
  let services: ServiceSource[] = [];
  if (on.has("services")) {
    const [data, occurrences, assignments] = await Promise.all([
      repos.schedule.getScheduleData(ctx),
      repos.schedule.listOccurrences(ctx, window),
      repos.assignments.list(ctx, { from: window.from, to: window.to }),
    ]);
    const plans = await repos.servicePlans.list(ctx, {
      occurrenceIds: occurrences.map((o) => o.id),
    });
    const resolved = resolve(scheduleInput({ locations, data }), from, to);
    services = resolved.map((s) => {
      const occurrence = occurrences.find(
        (o) =>
          o.locationId === s.locationId &&
          o.serviceType === s.serviceType &&
          Date.parse(o.startsAt) === Date.parse(s.startsAt),
      );
      const plan = occurrence ? plans.find((p) => p.occurrenceId === occurrence.id) : undefined;
      const assigned = occurrence
        ? assignments.filter((a) => a.occurrenceId === occurrence.id && a.status !== "cancelled")
        : [];
      const teamIds = [...new Set(assigned.map((a) => a.teamId))];
      // The plan status follows the policy: assigned people and team members may see the plan.
      const planVisible =
        plan !== undefined &&
        (teamIds.length === 0
          ? can(actor, "servicePlan.view", { tenantId, teamId: null, assignedPersonIds: [] })
          : teamIds.some((teamId) =>
              can(actor, "servicePlan.view", {
                tenantId,
                teamId,
                assignedPersonIds: assigned
                  .filter((a) => a.teamId === teamId)
                  .map((a) => a.personId),
              }),
            ));
      return {
        id: s.id,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        title: capitalize(s.title ?? s.serviceType),
        location: locationNames.get(s.locationId) ?? null,
        planStatus: planVisible ? plan.status : null,
        planId: planVisible ? plan.id : null,
        teams: teamIds.map((id) => teamNames.get(id) ?? "").filter((n) => n !== ""),
        cancelled: s.status === "cancelled",
      };
    });
  }

  // Bookings (room name + times for everyone; the booking module owns the details).
  const bookings: CalendarSources["bookings"][number][] = [];
  if (on.has("bookings")) {
    const [rows, rooms] = await Promise.all([
      repos.bookings.list(ctx, {
        from: window.from,
        to: window.to,
        statuses: ["pending", "approved"],
      }),
      repos.rooms.list(ctx),
    ]);
    const roomNames = new Map(rooms.map((r) => [r.id, r.name]));
    for (const b of rows) {
      if (b.source === "service") continue; // already shown as the service itself
      bookings.push({
        id: b.id,
        roomName: roomNames.get(b.roomId) ?? "",
        title: b.title,
        startsAt: b.startsAt,
        endsAt: b.endsAt,
        status: b.status,
        mine: personId !== null && b.requestedByPersonId === personId,
      });
    }
  }

  // My assignments.
  const assignmentRows: CalendarSources["assignments"][number][] = [];
  if (on.has("assignments") && personId !== null) {
    const rows = await repos.assignments.list(ctx, {
      personId,
      from: window.from,
      to: window.to,
      statuses: ["requested", "accepted", "swap_requested"],
    });
    const positions = new Map<string, string>();
    for (const teamId of new Set(rows.map((r) => r.teamId))) {
      for (const p of await repos.teams.listPositions(ctx, teamId)) positions.set(p.id, p.name);
    }
    for (const a of rows) {
      assignmentRows.push({
        id: a.id,
        position: positions.get(a.positionId) ?? "",
        team: teamNames.get(a.teamId) ?? "",
        startsAt: a.startsAt,
        endsAt: a.endsAt,
        status: a.status,
        planId: a.planId,
      });
    }
  }

  // Absences: *Távol* for everybody; the type only for the HR handler of the request's category.
  const absences: CalendarSources["absences"][number][] = [];
  if (on.has("absences")) {
    const rows = await repos.absences.list(ctx, { from, to, statuses: ["approved"] });
    const mayLookUp = can(actor, "hr.report.view", { tenantId });
    const [people, tickets, categories] = await Promise.all([
      repos.people.list(ctx),
      mayLookUp ? repos.hr.listTickets(ctx) : Promise.resolve([]),
      mayLookUp ? repos.hr.listCategories(ctx) : Promise.resolve([]),
    ]);
    const teamsByPerson = new Map<string, string[]>();
    for (const m of await repos.teams.listMembers(ctx, {})) {
      teamsByPerson.set(m.personId, [...(teamsByPerson.get(m.personId) ?? []), m.teamId]);
    }
    for (const a of rows) {
      const person = people.find((p) => p.id === a.personId);
      const mayName =
        person !== undefined &&
        can(actor, "directory.viewPerson", {
          tenantId,
          personId: person.id,
          teamIds: teamsByPerson.get(person.id) ?? [],
        });
      const ticket = a.ticketId === null ? undefined : tickets.find((t) => t.id === a.ticketId);
      const category = ticket ? categories.find((c) => c.id === ticket.categoryId) : undefined;
      const detail =
        category !== undefined &&
        can(actor, "hr.absence.viewDetails", {
          tenantId,
          category: { id: category.id, key: category.key, confidential: category.confidential },
        })
          ? a.type
          : null;
      absences.push({
        id: a.id,
        person:
          mayName && person
            ? formatPersonName({ familyName: person.familyName, givenName: person.givenName })
            : "",
        startDate: a.startDate,
        endDate: a.endDate,
        detail,
      });
    }
  }

  return {
    from,
    to,
    family: env.family,
    events,
    calendars,
    locationNames,
    services,
    bookings,
    assignments: assignmentRows,
    absences,
  };
}

/**
 * The environment of a signed-in workspace member; anybody else gets a 404. Pages use this, so
 * repositories are never called without a church context (the layout shows the no-access notice).
 */
export async function getMemberEnv(): Promise<WorkspaceEnv> {
  const env = await getWorkspaceEnv();
  if (env.me === null) notFound();
  return env;
}
