import { cache } from "react";
import type {
  Absence,
  HrApproval,
  HrCategory,
  HrTicket,
  Person,
  StaffProfile,
} from "@churchy/contracts";
import {
  buildWorkdayCalendar,
  chainProgress,
  isHrStep,
  resolveChain,
  type ResolvedStep,
  type WorkdayCalendar,
} from "@churchy/hr";
import { formatPersonName } from "@churchy/hu";
import { can } from "@churchy/policy";
import { leaderPersonIds } from "@/server/session";
import { getMemberEnv, type WorkspaceEnv } from "@/server/workspace";
import { requireWorkspaceModule } from "@/server/workspace-nav";

/**
 * Server helpers of the HR screens (D-71 … D-74). Everything is read through the repository
 * interfaces; who sees what is decided by `can()` on the resource built by `ticketResource()`.
 */

export interface HrEnv extends WorkspaceEnv {
  readonly categories: readonly HrCategory[];
  readonly people: ReadonlyMap<string, Person>;
  readonly profiles: ReadonlyMap<string, StaffProfile>;
  readonly calendar: WorkdayCalendar;
  readonly leaderIds: readonly string[];
  /** People with an approved absence covering today. */
  readonly absentToday: ReadonlySet<string>;
}

export const getHrEnv = cache(async (): Promise<HrEnv> => {
  await requireWorkspaceModule("ws.hr");
  const env = await getMemberEnv();
  const { repos, ctx, today } = env;
  const year = Number(today.slice(0, 4));
  const [categories, people, profiles, members, absences, ...years] = await Promise.all([
    repos.hr.listCategories(ctx),
    repos.people.list(ctx),
    repos.absences.listStaffProfiles(ctx),
    repos.members.list(ctx),
    repos.absences.list(ctx, { from: today, to: today, statuses: ["approved"] }),
    ...[year - 1, year, year + 1].map((y) => repos.absences.listWorkdayCalendar(ctx, y)),
  ]);
  return {
    ...env,
    categories,
    people: new Map(people.map((p) => [p.id, p])),
    profiles: new Map(profiles.map((p) => [p.personId, p])),
    calendar: buildWorkdayCalendar(years.flat()),
    leaderIds: leaderPersonIds(members, people),
    absentToday: new Set(absences.map((a) => a.personId)),
  };
});

export const personLabel = (env: HrEnv, personId: string | null): string => {
  const p = personId === null ? undefined : env.people.get(personId);
  return p ? formatPersonName({ familyName: p.familyName, givenName: p.givenName }) : "";
};

export const categoryOf = (env: HrEnv, ticket: Pick<HrTicket, "categoryId">) =>
  env.categories.find((c) => c.id === ticket.categoryId);

/** The policy resource of a ticket. */
export function ticketResource(tenantId: string, ticket: HrTicket, category: HrCategory) {
  return {
    tenantId,
    category: { id: category.id, key: category.key, confidential: category.confidential },
    requesterPersonId: ticket.requesterPersonId,
    handedOver: ticket.handover !== null,
  };
}

export interface TicketAccess {
  readonly read: boolean;
  readonly handle: boolean;
  /** The actor is a manager who may approve (never for confidential tickets). */
  readonly approveAsManager: boolean;
  readonly mine: boolean;
}

export function accessOf(env: HrEnv, ticket: HrTicket, category: HrCategory): TicketAccess {
  const resource = ticketResource(env.tenantId, ticket, category);
  const mine = env.me?.personId != null && ticket.requesterPersonId === env.me.personId;
  return {
    read: can(env.actor, "hr.ticket.read", resource),
    handle: can(env.actor, "hr.ticket.handle", resource),
    approveAsManager: can(env.actor, "hr.ticket.approveAsManager", resource),
    mine,
  };
}

/** Whether the actor may see the ticket at all (requester, handler, or approving manager). */
export const mayView = (a: TicketAccess): boolean => a.read || a.handle || a.approveAsManager;

/** The approval chain of a ticket as it resolves today, with the decisions recorded so far. */
export function chainOf(
  env: HrEnv,
  ticket: HrTicket,
  category: HrCategory,
  approvals: readonly HrApproval[],
) {
  const requester = ticket.requesterPersonId;
  const steps: ResolvedStep[] = resolveChain(category.approvalChain, {
    requesterId: requester,
    managerId: requester === null ? null : (env.profiles.get(requester)?.managerPersonId ?? null),
    leaderIds: env.leaderIds,
    hrHandlerIds: category.handlerPersonIds,
    absentIds: env.absentToday,
    deputyOf: new Map(),
  });
  const progress = chainProgress(steps, approvals);
  return { steps, progress };
}

/** Whether the actor may decide the step the chain waits for, and through which policy action. */
export function approvalRoute(
  env: HrEnv,
  step: ResolvedStep | undefined,
  access: TicketAccess,
): "manager" | "hr" | null {
  const me = env.me?.personId ?? null;
  if (step === undefined || me === null || !step.approverIds.includes(me)) return null;
  if (isHrStep(step)) return access.handle ? "hr" : null;
  return access.approveAsManager ? "manager" : null;
}

export const absenceOfTicket = (absences: readonly Absence[], ticketId: string) =>
  absences.find((a) => a.ticketId === ticketId);
