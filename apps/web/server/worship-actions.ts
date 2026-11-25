"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isContractError, type PlanItemInput } from "@churchy/contracts";
import { can } from "@churchy/policy";
import { findTransition } from "@/lib/worship/plan-flow";
import { withPolicy, type PolicyScope } from "@/server/policy";
import { getRequestRepositories } from "@/server/repositories";
import { getRequestContext } from "@/server/session";
import { getWorkspaceEnv } from "@/server/workspace";
import { isWorkspaceModuleOn } from "@/server/workspace-nav";
import { planAssignments, planViewResources, planWhen } from "@/server/worship";

/**
 * Mutations of the worship screens (D-64, D-66 … D-68). Each one goes through `withPolicy()`:
 * (the song library moved to the music module, `/munkater/enektar`); plans `servicePlan.edit` / `servicePlan.approve`;
 * assignments `assignment.manage` for the team; answering and commenting `servicePlan.view`.
 */

type Outcome = "ok" | "invalid" | "notFound";

async function forPlan(_scope: PolicyScope, ..._args: unknown[]) {
  const { tenantId } = await getRequestContext();
  return tenantId === undefined ? null : { tenantId, teamId: null };
}

async function guarded(run: () => Promise<void>): Promise<Outcome> {
  try {
    await run();
    return "ok";
  } catch (error) {
    if (isContractError(error, "NOT_FOUND")) return "notFound";
    if (isContractError(error)) return "invalid";
    throw error;
  }
}

/** A plan of a music event: its songs go to the event's setlist (music module on; never fails the save). */
async function syncMusicEvent(
  ctx: Parameters<Awaited<ReturnType<typeof getRequestRepositories>>["servicePlans"]["get"]>[0],
  planId: string,
  items: PlanItemInput[],
): Promise<void> {
  try {
    const repos = await getRequestRepositories();
    const loaded = await repos.servicePlans.get(ctx, planId);
    if (loaded?.plan.eventId == null || !(await isWorkspaceModuleOn("ws.music.events"))) return;
    const { syncSetlistFromPlan } = await import("@/server/music/plan-link");
    await syncSetlistFromPlan(loaded.plan.eventId, items);
  } catch (error) {
    console.error("[music] plan sync failed:", error);
  }
}

// ---------------------------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------------------------

/** New plan for a service of the schedule, from a template in one action (D-66 AC1). */
export const createPlanForService = withPolicy(
  "servicePlan.edit",
  forPlan,
  async (scope, form: FormData): Promise<Outcome> => {
    const repos = await getRequestRepositories();
    const text = (name: string) => {
      const v = form.get(name);
      return typeof v === "string" ? v : "";
    };
    const startsAt = text("startsAt");
    const serviceType = text("serviceType");
    const locationId = text("locationId");
    const title = text("title").trim();
    const templateId = text("templateId");
    const leaderPersonId = scope.ctx.actor.personId;
    if (!startsAt || !serviceType || !locationId || title === "" || leaderPersonId === null) {
      return "invalid";
    }
    let planId: string;
    try {
      const occurrence = await repos.schedule.ensureOccurrence(scope.ctx, {
        locationId,
        startsAt,
        serviceType,
      });
      const input = { occurrenceId: occurrence.id, title, leaderPersonId };
      if (templateId === "") {
        planId = (await repos.servicePlans.upsert(scope.ctx, input)).id;
      } else {
        planId = (await repos.servicePlans.createFromTemplate(scope.ctx, templateId, input)).plan
          .id;
      }
    } catch (error) {
      if (isContractError(error)) return "invalid";
      throw error;
    }
    redirect(`/munkater/liturgia/${planId}`);
  },
);

export const savePlanItems = withPolicy(
  "servicePlan.edit",
  forPlan,
  async (scope, planId: string, items: PlanItemInput[]) =>
    guarded(async () => {
      const repos = await getRequestRepositories();
      await repos.servicePlans.setItems(scope.ctx, planId, items);
      await syncMusicEvent(scope.ctx, planId, items);
      revalidatePath(`/munkater/liturgia/${planId}`);
    }),
);

async function moveStatus(
  scope: PolicyScope,
  planId: string,
  to: "draft" | "in_review" | "approved",
): Promise<Outcome> {
  const repos = await getRequestRepositories();
  const loaded = await repos.servicePlans.get(scope.ctx, planId);
  if (loaded === null) return "notFound";
  if (findTransition(loaded.plan.status, to) === undefined) return "invalid";
  return guarded(async () => {
    await repos.servicePlans.setStatus(scope.ctx, planId, to);
    revalidatePath(`/munkater/liturgia/${planId}`);
    revalidatePath("/munkater/liturgia");
    revalidatePath("/munkater");
  });
}

/** Music leader sends the draft to review (*Véleményezésre küldés*). */
export const submitPlanForReview = withPolicy(
  "servicePlan.edit",
  forPlan,
  async (scope, planId: string) => moveStatus(scope, planId, "in_review"),
);

/** Approver: approve, or send back to the draft with a comment. */
export const decidePlan = withPolicy(
  "servicePlan.approve",
  async (_scope: PolicyScope, _planId: string, _decision: "approve" | "return") => {
    const { tenantId } = await getRequestContext();
    return tenantId === undefined ? null : { tenantId, teamId: null, musicLeaderMayApprove: false };
  },
  async (scope, planId: string, decision: "approve" | "return") =>
    moveStatus(scope, planId, decision === "approve" ? "approved" : "draft"),
);

// ---------------------------------------------------------------------------------------------
// Comments, assignments, swaps
// ---------------------------------------------------------------------------------------------

/** Anyone who may view the plan may comment on it (D-68 AC2); the plan decides who that is. */
async function viewResource(scope: PolicyScope, planId: string, ..._rest: unknown[]) {
  const { tenantId } = await getRequestContext();
  if (tenantId === undefined) return null;
  const repos = await getRequestRepositories();
  const loaded = await repos.servicePlans.get(scope.ctx, planId);
  if (loaded === null) return null;
  const resources = planViewResources(
    tenantId,
    await planAssignments(repos, scope.ctx, loaded.plan),
  );
  return resources.find((r) => can(scope.actor, "servicePlan.view", r)) ?? resources[0] ?? null;
}

export const addPlanComment = withPolicy(
  "servicePlan.view",
  viewResource,
  async (scope, planId: string, body: string, itemId: string | null, mentions: string[]) =>
    guarded(async () => {
      const repos = await getRequestRepositories();
      await repos.servicePlans.addComment(scope.ctx, { planId, body, itemId, mentions });
      revalidatePath(`/munkater/liturgia/${planId}`);
    }),
);

export const resolvePlanComment = withPolicy(
  "servicePlan.edit",
  forPlan,
  async (scope, planId: string, commentId: string, resolved: boolean) =>
    guarded(async () => {
      const repos = await getRequestRepositories();
      await repos.servicePlans.setCommentResolved(scope.ctx, commentId, resolved);
      revalidatePath(`/munkater/liturgia/${planId}`);
    }),
);

async function forTeam(_scope: PolicyScope, teamId: string, ..._rest: unknown[]) {
  const { tenantId } = await getRequestContext();
  return tenantId === undefined ? null : { tenantId, teamId };
}

/** Leader of the team (or music leader / church leader) puts a person on a position. */
export const assignPerson = withPolicy(
  "assignment.manage",
  forTeam,
  async (scope, teamId: string, planId: string, positionId: string, personId: string) =>
    guarded(async () => {
      const repos = await getRequestRepositories();
      const loaded = await repos.servicePlans.get(scope.ctx, planId);
      if (loaded === null) throw new Error("plan");
      const when = await planWhen(await getWorkspaceEnv(), loaded.plan);
      const peers = await planAssignments(repos, scope.ctx, loaded.plan);
      const startsAt = when.startsAt ?? peers[0]?.startsAt;
      const endsAt = when.endsAt ?? peers[0]?.endsAt;
      if (!startsAt || !endsAt) throw new Error("time");
      await repos.assignments.create(scope.ctx, [
        {
          occurrenceId: loaded.plan.occurrenceId,
          eventId: loaded.plan.eventId,
          planId,
          teamId,
          positionId,
          personId,
          startsAt,
          endsAt,
        },
      ]);
      revalidatePath(`/munkater/liturgia/${planId}`);
    }),
);

async function assignmentView(scope: PolicyScope, id: string, ..._rest: unknown[]) {
  const { tenantId } = await getRequestContext();
  if (tenantId === undefined) return null;
  const repos = await getRequestRepositories();
  const a = await repos.assignments.get(scope.ctx, id);
  return a === null ? null : { tenantId, teamId: a.teamId, assignedPersonIds: [a.personId] };
}

/** The assigned person asks for a swap (the team is notified, the first to accept wins). */
export const requestAssignmentSwap = withPolicy(
  "servicePlan.view",
  assignmentView,
  async (scope, id: string) => {
    const repos = await getRequestRepositories();
    const a = await repos.assignments.get(scope.ctx, id);
    if (a === null || a.personId !== scope.ctx.actor.personId) return "invalid" as Outcome;
    return guarded(async () => {
      await repos.assignments.requestSwap(scope.ctx, id);
      revalidatePath("/munkater", "layout");
    });
  },
);

/** A team member takes over an open swap. */
export const takeOverAssignment = withPolicy(
  "servicePlan.view",
  async (scope: PolicyScope, id: string) => {
    const { tenantId } = await getRequestContext();
    if (tenantId === undefined) return null;
    const repos = await getRequestRepositories();
    const a = await repos.assignments.get(scope.ctx, id);
    // The actor must be a member of the team: view through the own-team grant.
    return a === null ? null : { tenantId, teamId: a.teamId, assignedPersonIds: [] };
  },
  async (scope, id: string) => {
    const me = scope.ctx.actor.personId;
    if (me === null) return "invalid" as Outcome;
    return guarded(async () => {
      const repos = await getRequestRepositories();
      await repos.assignments.acceptSwap(scope.ctx, id, me);
      revalidatePath("/munkater", "layout");
    });
  },
);
