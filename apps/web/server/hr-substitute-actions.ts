"use server";

import { withPolicy, type PolicyScope } from "@/server/policy";
import { getRequestRepositories } from "@/server/repositories";
import { getRequestContext } from "@/server/session";

/**
 * *Helyettes keresése* (D-73 AC3): the team leader asks a substitute for an assignment that
 * overlaps an absence. Needs `assignment.manage` for the assignment's team (leaders, music
 * leaders, the team's own leaders): the original assignment is cancelled and the substitute is
 * asked for the same position.
 */
async function forAssignment(scope: PolicyScope, assignmentId: string, ..._rest: unknown[]) {
  const repos = await getRequestRepositories();
  const assignment = await repos.assignments.get(scope.ctx, assignmentId);
  const { tenantId } = await getRequestContext();
  return assignment === null || tenantId === undefined
    ? null
    : { tenantId, teamId: assignment.teamId };
}

export const requestSubstitute = withPolicy(
  "assignment.manage",
  forAssignment,
  async (scope, assignmentId: string, personId: string): Promise<"ok" | "conflict"> => {
    const repos = await getRequestRepositories();
    const original = await repos.assignments.get(scope.ctx, assignmentId);
    if (original === null || original.personId === personId) return "conflict";
    if (original.status !== "requested" && original.status !== "accepted") return "conflict";
    await repos.assignments.create(scope.ctx, [
      {
        occurrenceId: original.occurrenceId,
        eventId: original.eventId,
        planId: original.planId,
        teamId: original.teamId,
        positionId: original.positionId,
        personId,
        startsAt: original.startsAt,
        endsAt: original.endsAt,
        requestedByPersonId: scope.ctx.actor.personId,
      },
    ]);
    await repos.assignments.cancel(scope.ctx, assignmentId);
    return "ok";
  },
  { conceal: true },
);
