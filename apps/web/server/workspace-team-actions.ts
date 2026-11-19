"use server";

import { redirect } from "next/navigation";
import {
  TeamMemberInputSchema,
  TeamPositionInputSchema,
  isContractError,
} from "@churchy/contracts";
import { formValues, repositoryErrors, validate, type FormState } from "@/lib/admin/content-form";
import { withPolicy, type PolicyScope } from "@/server/policy";
import { getRequestRepositories } from "@/server/repositories";
import { getRequestContext } from "@/server/session";
import { workspaceErrorMessages } from "@/server/workspace-form";

/**
 * Team management (D-51 AC2): add / change a member with a position, remove a member, add and
 * remove positions. Needs `assignment.manage` for the team: leaders and music leaders for any
 * team, team leaders for the teams they lead (SDD §21.2). A team of another church is a 404.
 */

const MEMBER_FIELDS = ["personId", "positionId", "isLeader", "notes"] as const;
const POSITION_FIELDS = ["name", "minCount", "maxCount"] as const;

type Outcome = "ok" | "invalid" | "notFound";

async function forTeam(_scope: PolicyScope, teamId: string, ..._rest: unknown[]) {
  const { tenantId } = await getRequestContext();
  return tenantId === undefined ? null : { tenantId, teamId };
}
const forForm = forTeam as (
  scope: PolicyScope,
  teamId: string,
  previous: FormState,
  form: FormData,
) => ReturnType<typeof forTeam>;
const forItem = forTeam as (
  scope: PolicyScope,
  teamId: string,
  itemId: string,
) => ReturnType<typeof forTeam>;

export const saveTeamMember = withPolicy(
  "assignment.manage",
  forForm,
  async (
    scope,
    teamId: string,
    _previous: FormState,
    form: FormData,
  ): Promise<FormState | undefined> => {
    const repos = await getRequestRepositories();
    const messages = await workspaceErrorMessages();
    const values = formValues(form, MEMBER_FIELDS);
    if ((values["personId"] ?? "") === "") {
      return { status: "invalid", errors: { personId: messages.required }, values };
    }
    const positions = await repos.teams.listPositions(scope.ctx, teamId);
    const existing = (await repos.teams.listMembers(scope.ctx, { teamId })).find(
      (m) => m.personId === values["personId"],
    );
    const parsed = validate(
      TeamMemberInputSchema,
      {
        teamId,
        personId: values["personId"],
        isLeader: values["isLeader"] === "on",
        // A chosen position is added to the member's others; the field is a single select.
        positionIds: [
          ...new Set([
            ...(existing?.positionIds ?? []),
            ...(positions.some((p) => p.id === values["positionId"]) ? [values["positionId"]] : []),
          ]),
        ],
        maxAssignmentsPerMonth: existing?.maxAssignmentsPerMonth ?? null,
        notes: (values["notes"] ?? "").trim() === "" ? (existing?.notes ?? null) : values["notes"],
      },
      MEMBER_FIELDS,
      messages,
    );
    if (!parsed.ok) return { status: "invalid", errors: parsed.errors, values };
    try {
      await repos.teams.upsertMember(scope.ctx, parsed.data);
    } catch (error) {
      return {
        status: "invalid",
        errors: repositoryErrors(error, MEMBER_FIELDS, messages),
        values,
      };
    }
    redirect(`/munkater/csapatok/${teamId}?mentve=1`);
  },
);

export const removeTeamMember = withPolicy(
  "assignment.manage",
  forItem,
  async (scope, teamId: string, personId: string): Promise<Outcome> => {
    const repos = await getRequestRepositories();
    try {
      await repos.teams.removeMember(scope.ctx, teamId, personId);
      return "ok";
    } catch (error) {
      if (isContractError(error, "NOT_FOUND")) return "notFound";
      throw error;
    }
  },
);

export const saveTeamPosition = withPolicy(
  "assignment.manage",
  forForm,
  async (
    scope,
    teamId: string,
    _previous: FormState,
    form: FormData,
  ): Promise<FormState | undefined> => {
    const repos = await getRequestRepositories();
    const messages = await workspaceErrorMessages();
    const values = formValues(form, POSITION_FIELDS);
    if ((values["name"] ?? "").trim() === "") {
      return { status: "invalid", errors: { name: messages.required }, values };
    }
    const count = (v: string | undefined) =>
      v === undefined || v.trim() === "" ? null : Number(v);
    const sort = (await repos.teams.listPositions(scope.ctx, teamId)).length;
    const parsed = validate(
      TeamPositionInputSchema,
      {
        teamId,
        name: values["name"],
        sort,
        minCount: count(values["minCount"]) ?? 1,
        maxCount: count(values["maxCount"]),
      },
      POSITION_FIELDS,
      messages,
    );
    if (!parsed.ok) return { status: "invalid", errors: parsed.errors, values };
    try {
      await repos.teams.upsertPosition(scope.ctx, parsed.data);
    } catch (error) {
      return {
        status: "invalid",
        errors: repositoryErrors(error, POSITION_FIELDS, messages),
        values,
      };
    }
    redirect(`/munkater/csapatok/${teamId}?mentve=1`);
  },
);

export const removeTeamPosition = withPolicy(
  "assignment.manage",
  forItem,
  async (scope, teamId: string, positionId: string): Promise<Outcome> => {
    const repos = await getRequestRepositories();
    const position = (await repos.teams.listPositions(scope.ctx, teamId)).find(
      (p) => p.id === positionId,
    );
    // The position must belong to the team the actor manages.
    if (position === undefined) return "notFound";
    await repos.teams.deletePosition(scope.ctx, positionId);
    return "ok";
  },
);
