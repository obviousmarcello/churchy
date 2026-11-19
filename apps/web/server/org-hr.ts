import { cache } from "react";
import type {
  Ctx,
  HrCategory,
  HrTicket,
  ParishStatus,
  Repositories,
  StaffProfile,
} from "@churchy/contracts";
import { buildWorkdayCalendar, slaStatus, type SlaStatus, type WorkdayCalendar } from "@churchy/hr";
import { todayInBudapest } from "@churchy/hu";
import { can, type OrgActor } from "@churchy/policy";
import { getRequestNow } from "@/server/clock";
import { getRequestRepositories } from "@/server/repositories";
import { getActor, getRequestContext } from "@/server/session";

/**
 * Server helpers of the diocesan HR portal (D-84, D-85, SDD §25.7). The request context is the
 * **organization** (`orgId`, never a `tenantId`): everything is read through the repositories with
 * an org ctx, which only returns HR rows of actively linked parishes in delegated categories.
 * Who may see a ticket is decided by `can()`; confidential tickets never reach the portal.
 */

/** A ticket of a linked parish the actor may read, with what the lists show about it. */
export interface OrgTicketRow {
  readonly ticket: HrTicket;
  readonly category: HrCategory;
  readonly parish: string;
  /** The requester's position (staff profile) — the portal never reads people records. */
  readonly requester: string;
  readonly sla: SlaStatus;
}

export interface OrgHrEnv {
  readonly actor: OrgActor;
  readonly orgId: string;
  readonly ctx: Ctx;
  readonly repos: Repositories;
  readonly now: Date;
  readonly today: string;
  readonly calendar: WorkdayCalendar;
  /** Every parish of the organization with its link status. */
  readonly parishes: readonly ParishStatus[];
  /** Delegated, non-confidential categories of the linked parishes, by id. */
  readonly categories: ReadonlyMap<string, HrCategory>;
  /** Staff profiles of the linked parishes, by `profileKey()`. */
  readonly profiles: ReadonlyMap<string, StaffProfile>;
  /** Readable tickets, newest first. */
  readonly rows: readonly OrgTicketRow[];
}

/** The policy resource of a ticket of a linked parish. */
export const orgTicketResource = (ticket: HrTicket, category: HrCategory) => ({
  tenantId: ticket.tenantId,
  category: { id: category.id, key: category.key, confidential: category.confidential },
  requesterPersonId: ticket.requesterPersonId,
  handedOver: ticket.handover !== null,
});

/** A confidential ticket or category never appears in the portal (conservative, D-74). */
export const isConfidential = (ticket: HrTicket, category: HrCategory): boolean =>
  ticket.confidential || category.confidential;

export const profileKey = (tenantId: string, personId: string | null): string =>
  `${tenantId}:${personId ?? ""}`;

/** The diocesan environment of this request, or null when the actor is not a portal user. */
export const getOrgHrEnv = cache(async (): Promise<OrgHrEnv | null> => {
  const [actor, context, repos, now] = await Promise.all([
    getActor(),
    getRequestContext(),
    getRequestRepositories(),
    getRequestNow(),
  ]);
  if (actor.kind !== "org" || context.orgId === undefined || actor.orgId !== context.orgId) {
    return null;
  }
  const orgId = context.orgId;
  const ctx: Ctx = { orgId, actor: { userId: actor.userId, personId: null } };
  const today = todayInBudapest(now);
  const year = Number(today.slice(0, 4));
  const [parishes, categories, tickets, profiles, ...years] = await Promise.all([
    repos.organizations.listParishStatus(ctx),
    repos.hr.listCategories(ctx),
    repos.hr.listTickets(ctx),
    repos.absences.listStaffProfiles(ctx),
    ...[year - 1, year, year + 1].map((y) => repos.absences.listWorkdayCalendar(ctx, y)),
  ]);
  const calendar = buildWorkdayCalendar(years.flat());
  const categoryById = new Map(categories.filter((c) => !c.confidential).map((c) => [c.id, c]));
  const parishName = new Map(parishes.map((p) => [p.tenantId, p.name]));
  const profileByKey = new Map(profiles.map((p) => [profileKey(p.tenantId, p.personId), p]));

  const rows: OrgTicketRow[] = tickets.flatMap((ticket) => {
    const category = categoryById.get(ticket.categoryId);
    if (category === undefined || isConfidential(ticket, category)) return [];
    if (!can(actor, "hr.ticket.read", orgTicketResource(ticket, category))) return [];
    return [
      {
        ticket,
        category,
        parish: parishName.get(ticket.tenantId) ?? "",
        requester: ticket.anonymous
          ? ""
          : (profileByKey.get(profileKey(ticket.tenantId, ticket.requesterPersonId))?.position ??
            ""),
        sla: slaStatus(
          { createdAt: ticket.createdAt, slaHours: category.slaHours, closedAt: ticket.closedAt },
          now,
          calendar,
        ),
      },
    ];
  });

  return {
    actor,
    orgId,
    ctx,
    repos,
    now,
    today,
    calendar,
    parishes,
    categories: categoryById,
    profiles: profileByKey,
    rows,
  };
});

/** Categories of one parish the actor may read tickets of — the actor's real scope there. */
export function scopeOf(env: OrgHrEnv, tenantId: string): HrCategory[] {
  return [...env.categories.values()].filter(
    (c) =>
      c.tenantId === tenantId &&
      can(env.actor, "hr.ticket.read", {
        tenantId,
        category: { id: c.id, key: c.key, confidential: c.confidential },
        requesterPersonId: null,
      }),
  );
}

/** Parishes whose HR the actor can reach at all (active link, inside the actor's parish scope). */
export function reachableParishes(env: OrgHrEnv): ParishStatus[] {
  return env.parishes.filter((p) => scopeOf(env, p.tenantId).length > 0);
}
