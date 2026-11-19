"use server";

import { revalidatePath } from "next/cache";
import { isContractError } from "@churchy/contracts";
import { withPolicy, type PolicyScope } from "@/server/policy";
import { getRequestRepositories } from "@/server/repositories";
import { getRequestContext } from "@/server/session";

/**
 * Mutations of the workspace home (D-53). Each one goes through `withPolicy()`.
 *
 * Answering an assignment request: the assignment's position belongs to a team, the actor must be
 * the assigned person (`servicePlan.view` with `assignedPersonIds`, the policy's "assigned" grant),
 * and the handler additionally checks that the assignment is the actor's own, because leaders
 * may view every plan.
 */

type Outcome = "ok" | "invalid";

async function assignmentResource(scope: PolicyScope, id: string, _accept: boolean) {
  const { tenantId } = await getRequestContext();
  if (tenantId === undefined) return null;
  const repos = await getRequestRepositories();
  const assignment = await repos.assignments.get(scope.ctx, id);
  if (assignment === null) return null;
  return { tenantId, teamId: assignment.teamId, assignedPersonIds: [assignment.personId] };
}

export const respondToAssignment = withPolicy(
  "servicePlan.view",
  assignmentResource,
  async (scope, id: string, accept: boolean): Promise<Outcome> => {
    const repos = await getRequestRepositories();
    const assignment = await repos.assignments.get(scope.ctx, id);
    const own = scope.ctx.actor.personId;
    if (assignment === null || own === null || assignment.personId !== own) return "invalid";
    try {
      await repos.assignments.respond(scope.ctx, id, { accept });
    } catch (error) {
      if (isContractError(error)) return "invalid";
      throw error;
    }
    revalidatePath("/munkater");
    return "ok";
  },
);
