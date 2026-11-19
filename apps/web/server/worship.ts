import { dayWindow } from "@churchy/events";
import { addDays } from "@churchy/hu";
import { can, type Actor, type ServicePlanResource } from "@churchy/policy";
import { resolve } from "@churchy/schedule";
import type {
  Assignment,
  Ctx,
  Hymnal,
  PlanItem,
  Repositories,
  ServiceOccurrence,
  ServicePlan,
  Song,
} from "@churchy/contracts";
import { scheduleInput } from "@/lib/service-schedule/view";
import type { WorkspaceEnv } from "@/server/workspace";

/**
 * Loaders of the worship screens (D-64, D-66 … D-68). Everything goes through the repository
 * interfaces; who sees what is decided by `can()`.
 */

/** `ÉE 101` style label of a song's hymnal references. */
export function hymnalRefLabels(song: Song, hymnals: readonly Hymnal[]): string[] {
  return song.hymnalRefs.flatMap((r) => {
    const h = hymnals.find((x) => x.id === r.hymnalId);
    return h ? [`${h.abbreviation} ${r.number}`] : [];
  });
}

/** Last service date of each song (from locked plans), `YYYY-MM-DD` in the plan's date order. */
export async function lastUsedBySong(env: WorkspaceEnv): Promise<Map<string, string>> {
  const { repos, ctx } = env;
  const plans = (await repos.servicePlans.list(ctx, { status: "locked" })).filter(
    (p) => p.occurrenceId !== null,
  );
  const dates = await occurrenceDates(env, plans);
  const used = new Map<string, string>();
  for (const plan of plans) {
    const date = dates.get(plan.id);
    const loaded = await repos.servicePlans.get(ctx, plan.id);
    if (!date || !loaded) continue;
    for (const item of loaded.items) {
      if (item.songId === null) continue;
      const prev = used.get(item.songId);
      if (prev === undefined || prev < date) used.set(item.songId, date);
    }
  }
  return used;
}

/** Civil date of each plan's occurrence (plans without a known occurrence are left out). */
export async function occurrenceDates(
  env: WorkspaceEnv,
  plans: readonly ServicePlan[],
): Promise<Map<string, string>> {
  const { repos, ctx, today } = env;
  const window = dayWindow(addDays(today, -400), addDays(today, 400));
  const occurrences = await repos.schedule.listOccurrences(ctx, window);
  const byId = new Map(occurrences.map((o) => [o.id, o]));
  const out = new Map<string, string>();
  for (const plan of plans) {
    const o = plan.occurrenceId === null ? undefined : byId.get(plan.occurrenceId);
    if (o) out.set(plan.id, o.startsAt.slice(0, 10));
  }
  return out;
}

export interface UpcomingService {
  readonly key: string;
  readonly locationId: string;
  readonly locationName: string;
  readonly serviceType: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly title: string;
  readonly plan: ServicePlan | null;
}

/** The schedule engine's services of the next `weeks` weeks, with the plan of each if any. */
export async function loadUpcomingServices(
  env: WorkspaceEnv,
  weeks = 5,
): Promise<UpcomingService[]> {
  const { repos, ctx, today } = env;
  const to = addDays(today, weeks * 7);
  const window = dayWindow(today, to);
  const [locations, data, occurrences] = await Promise.all([
    repos.locations.list(ctx),
    repos.schedule.getScheduleData(ctx),
    repos.schedule.listOccurrences(ctx, window),
  ]);
  const plans = await repos.servicePlans.list(ctx, {
    occurrenceIds: occurrences.map((o) => o.id),
  });
  const names = new Map(locations.map((l) => [l.id, l.name]));
  return resolve(scheduleInput({ locations, data }), today, to)
    .filter((s) => s.status !== "cancelled")
    .map((s) => {
      const occ = occurrences.find(
        (o) =>
          o.locationId === s.locationId &&
          o.serviceType === s.serviceType &&
          Date.parse(o.startsAt) === Date.parse(s.startsAt),
      );
      return {
        key: s.id,
        locationId: s.locationId,
        locationName: names.get(s.locationId) ?? "",
        serviceType: s.serviceType,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        title: s.title ?? s.serviceType,
        plan: occ ? (plans.find((p) => p.occurrenceId === occ.id) ?? null) : null,
      };
    });
}

/** Policy resources a plan is viewed through: the whole church and every assigned team. */
export function planViewResources(
  tenantId: string,
  assignments: readonly Assignment[],
): ServicePlanResource[] {
  const live = assignments.filter((a) => a.status !== "cancelled");
  const teamIds = [...new Set(live.map((a) => a.teamId))];
  const all = live.map((a) => a.personId);
  return [
    { tenantId, teamId: null, assignedPersonIds: all },
    ...teamIds.map((teamId) => ({
      tenantId,
      teamId,
      assignedPersonIds: live.filter((a) => a.teamId === teamId).map((a) => a.personId),
    })),
  ];
}

export function canViewPlan(actor: Actor, resources: readonly ServicePlanResource[]): boolean {
  return resources.some((r) => can(actor, "servicePlan.view", r));
}

/** Assignments that belong to the plan (by plan or by its occurrence/event). */
export async function planAssignments(
  repos: Repositories,
  ctx: Ctx,
  plan: ServicePlan,
): Promise<Assignment[]> {
  const rows = await repos.assignments.list(ctx, {
    ...(plan.occurrenceId ? { occurrenceId: plan.occurrenceId } : {}),
    ...(plan.eventId ? { eventId: plan.eventId } : {}),
  });
  return rows.filter((a) => a.planId === null || a.planId === plan.id);
}

export interface PlanWhen {
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly occurrence: ServiceOccurrence | null;
  readonly locationName: string | null;
}

/** When and where a plan's service takes place (occurrence or event). */
export async function planWhen(env: WorkspaceEnv, plan: ServicePlan): Promise<PlanWhen> {
  const { repos, ctx, today } = env;
  if (plan.occurrenceId !== null) {
    const window = dayWindow(addDays(today, -400), addDays(today, 400));
    const occ = (await repos.schedule.listOccurrences(ctx, window)).find(
      (o) => o.id === plan.occurrenceId,
    );
    if (occ) {
      const loc = (await repos.locations.list(ctx)).find((l) => l.id === occ.locationId);
      const peers = (await planAssignments(repos, ctx, plan)).find((a) => a.startsAt !== "");
      const endsAt =
        peers?.endsAt ?? new Date(Date.parse(occ.startsAt) + 75 * 60_000).toISOString();
      return { startsAt: occ.startsAt, endsAt, occurrence: occ, locationName: loc?.name ?? null };
    }
  }
  if (plan.eventId !== null) {
    const event = await repos.events.get(ctx, plan.eventId);
    if (event) {
      return {
        startsAt: event.startsAt,
        endsAt: event.endsAt ?? new Date(Date.parse(event.startsAt) + 75 * 60_000).toISOString(),
        occurrence: null,
        locationName: null,
      };
    }
  }
  return { startsAt: null, endsAt: null, occurrence: null, locationName: null };
}

export type { PlanItem };
