import type {
  CalendarEventResource,
  DirectoryPersonResource,
  Resource,
  RoomResource,
  ServicePlanResource,
  WorkspaceTenantAction,
} from "./actions";
import type { TenantActor } from "./actor";
import type { Decision, MatrixRow } from "./decision";
import { allow, deny, evaluateRow, indexRows } from "./decision";
import type { WorkspaceRole } from "./roles";
import { WORKSPACE_ROLES } from "./roles";

/**
 * - `all`: unconditional
 * - `ownTeams`: the viewed person is the actor or shares one of the actor's `memberTeamIds`
 * - `ownTeam`: the resource's team is one the actor leads (`leadTeamIds`)
 * - `ownTeamEvent`: a `team`-visibility event of a team the actor leads
 * - `roomPolicy`: the room's `whoCanRequest` admits this role (volunteers only via
 *   `all_workspace` or an explicit list)
 * - `scopedRooms`: the room is one of the actor's `managedRoomIds`
 * - `ifConfigured`: the tenant lets music leaders approve plans
 * - `assigned`: the actor is assigned to the plan / occurrence
 * - `assignedOrOwnTeam`: assigned, or a member of the owning team
 */
export type WorkspaceGrant =
  | "all"
  | "ownTeams"
  | "ownTeam"
  | "ownTeamEvent"
  | "roomPolicy"
  | "scopedRooms"
  | "ifConfigured"
  | "assigned"
  | "assignedOrOwnTeam";

type WorkspaceMatrixAction =
  | WorkspaceTenantAction
  | "directory.viewPerson"
  | "calendarEvent.create"
  | "room.book"
  | "booking.approve"
  | "servicePlan.edit"
  | "servicePlan.approve"
  | "servicePlan.view"
  | "attachment.view"
  | "assignment.manage";

const EVERY_ROLE = Object.fromEntries(WORKSPACE_ROLES.map((role) => [role, "all"])) as Record<
  WorkspaceRole,
  "all"
>;

/**
 * SDD §21.2 "Workspace roles & permissions" (non-HR rows). The HR rows are implemented in
 * `hr.ts` as separate policy functions (SDD §28).
 */
export const WORKSPACE_MATRIX: readonly MatrixRow<
  WorkspaceMatrixAction,
  WorkspaceRole,
  WorkspaceGrant
>[] = [
  {
    capability: "Open the directory (navigation)",
    actions: ["directory.open"],
    grants: EVERY_ROLE,
  },
  {
    capability: "See directory (respecting contact visibility)",
    actions: ["directory.viewPerson"],
    grants: { ...EVERY_ROLE, volunteer: "ownTeams" },
  },
  {
    capability: "Create staff-visible / team events",
    actions: ["calendarEvent.create"],
    grants: {
      leader: "all",
      employee: "all",
      teamLeader: "ownTeamEvent",
      musicLeader: "all",
      roomManager: "all",
    },
  },
  {
    capability: "Publish events to the website (public)",
    actions: ["calendarEvent.publish"],
    grants: { leader: "all" },
  },
  {
    capability: "Book rooms (subject to room policy)",
    actions: ["room.book"],
    grants: {
      leader: "roomPolicy",
      employee: "roomPolicy",
      volunteer: "roomPolicy",
      teamLeader: "roomPolicy",
      musicLeader: "roomPolicy",
      roomManager: "roomPolicy",
    },
  },
  {
    capability: "Approve bookings",
    actions: ["booking.approve"],
    grants: { leader: "all", roomManager: "scopedRooms" },
  },
  {
    capability: "Create/edit service plans",
    actions: ["servicePlan.edit"],
    grants: { leader: "all", teamLeader: "ownTeam", musicLeader: "all" },
  },
  {
    capability: "Approve service plans",
    actions: ["servicePlan.approve"],
    grants: { leader: "all", musicLeader: "ifConfigured" },
  },
  {
    capability: "Assign people to positions",
    actions: ["assignment.manage"],
    grants: { leader: "all", teamLeader: "ownTeam", musicLeader: "all" },
  },
  {
    capability: "Song library edit",
    actions: ["song.edit"],
    grants: { leader: "all", musicLeader: "all" },
  },
  {
    capability: "View plans & attachments",
    actions: ["servicePlan.view", "attachment.view"],
    grants: {
      leader: "all",
      employee: "assigned",
      volunteer: "assignedOrOwnTeam",
      teamLeader: "ownTeam",
      musicLeader: "all",
    },
  },
];

const ROWS_BY_ACTION = indexRows(WORKSPACE_MATRIX);

function has(list: readonly string[] | undefined, id: string | null | undefined): boolean {
  return id !== null && id !== undefined && (list?.includes(id) ?? false);
}

function roomPolicyAdmits(role: WorkspaceRole, room: RoomResource): boolean {
  const who = room.whoCanRequest ?? "all_staff";
  if (who === "all_workspace") return true;
  if (who === "all_staff") return role !== "volunteer";
  return who.includes(role);
}

function checkGrant(
  grant: WorkspaceGrant,
  role: WorkspaceRole,
  actor: TenantActor,
  resource: Resource,
): string | null {
  switch (grant) {
    case "all":
      return null;
    case "ownTeams": {
      const person = resource as DirectoryPersonResource;
      if (person.personId === actor.personId) return null;
      return person.teamIds.some((teamId) => has(actor.memberTeamIds, teamId))
        ? null
        : "person is not in one of the actor's teams";
    }
    case "ownTeam":
      return has(actor.leadTeamIds, (resource as ServicePlanResource).teamId)
        ? null
        : "not a team the actor leads";
    case "ownTeamEvent": {
      const event = resource as CalendarEventResource;
      if (event.visibility !== "team") return "may only create team events";
      return has(actor.leadTeamIds, event.teamId) ? null : "not a team the actor leads";
    }
    case "roomPolicy":
      return roomPolicyAdmits(role, resource as RoomResource)
        ? null
        : "the room's booking policy does not admit this role";
    case "scopedRooms":
      return has(actor.managedRoomIds, (resource as RoomResource).roomId)
        ? null
        : "not a room the actor manages";
    case "ifConfigured":
      return (resource as ServicePlanResource).musicLeaderMayApprove === true
        ? null
        : "music leaders may not approve plans in this church";
    case "assigned":
      return has((resource as ServicePlanResource).assignedPersonIds, actor.personId)
        ? null
        : "actor is not assigned";
    case "assignedOrOwnTeam": {
      const plan = resource as ServicePlanResource;
      return has(plan.assignedPersonIds, actor.personId) || has(actor.memberTeamIds, plan.teamId)
        ? null
        : "actor is neither assigned nor a member of the team";
    }
  }
}

function evaluateMatrix(actor: TenantActor, action: string, resource: Resource): Decision {
  const row = ROWS_BY_ACTION.get(action);
  if (row === undefined) return deny(`${action} is not a workspace action`);
  return evaluateRow(row, WORKSPACE_ROLES, actor.workspaceRoles, action, (grant, role) =>
    checkGrant(grant, role, actor, resource),
  );
}

function evaluateCalendarEvent(actor: TenantActor, event: CalendarEventResource): Decision {
  switch (event.visibility) {
    case "private":
      // Everyone in the workspace has a personal calendar (FR-601).
      return actor.workspaceRoles.length > 0
        ? allow("any workspace role may create private events")
        : deny("private events require a workspace role");
    case "public":
      // A public event is published to the website: SDD §21.2 row "Publish events to the website".
      return evaluateMatrix(actor, "calendarEvent.publish", event);
    case "team":
      if (event.teamId === undefined || event.teamId === null) {
        return deny("team events must name a team");
      }
      return evaluateMatrix(actor, "calendarEvent.create", event);
    case "staff":
      return evaluateMatrix(actor, "calendarEvent.create", event);
    default:
      return deny("unknown event visibility");
  }
}

/** Workspace capabilities (SDD §21.2, non-HR rows) for a tenant actor in the resource's tenant. */
export function evaluateWorkspace(
  actor: TenantActor,
  action: string,
  resource: Resource,
): Decision {
  if (action === "calendarEvent.create") {
    return evaluateCalendarEvent(actor, resource as CalendarEventResource);
  }
  return evaluateMatrix(actor, action, resource);
}
