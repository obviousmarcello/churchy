import { describe, expect, it } from "vitest";
import type { Action, EventVisibility, ResourceByAction, WhoCanRequest } from "./actions";
import { evaluateWorkspace } from "./workspace";
import {
  OTHER_PERSON,
  OTHER_ROOM,
  OTHER_TEAM,
  OWN_ROOM,
  OWN_TEAM,
  SELF,
  TENANT,
  websiteActor,
  workspaceActor,
} from "./policy.fixtures";
import { can, explain } from "./policy";
import type { WorkspaceRole } from "./roles";

/*
 * SDD §21.2 (non-HR rows), transcribed by hand. Every role column is listed for every row so each
 * cell has a test; scoped cells are tested inside and outside their scope.
 *
 * Fixture scopes (see policy.fixtures.ts): the actor is a member of OWN_TEAM; a teamLeader leads
 * OWN_TEAM; a roomManager manages OWN_ROOM.
 */
const ROLES = [
  "leader",
  "employee",
  "volunteer",
  "teamLeader",
  "musicLeader",
  "roomManager",
  "hrHandler",
  "confidentialHandler",
] as const;

type Row<A extends Action> = {
  cell: string;
  action: A;
  resource: ResourceByAction[A];
  /** Allowed roles, in ROLES order (Y/N string for readability: L E V TL ML RM HR CH). */
  expected: string;
  actorExtra?: Parameters<typeof workspaceActor>[1];
};

const event = (
  visibility: EventVisibility,
  teamId?: string,
): ResourceByAction["calendarEvent.create"] => ({
  tenantId: TENANT,
  visibility,
  teamId,
});
const room = (roomId: string, whoCanRequest?: WhoCanRequest) => ({
  tenantId: TENANT,
  roomId,
  whoCanRequest,
});
const plan = (
  teamId: string,
  assigned: readonly string[] = [],
  musicLeaderMayApprove?: boolean,
) => ({
  tenantId: TENANT,
  teamId,
  assignedPersonIds: assigned,
  musicLeaderMayApprove,
});

// Expected column order: leader, employee, volunteer, teamLeader, musicLeader, roomManager, hrHandler, confidentialHandler
// prettier-ignore
const ROWS: Row<Action>[] = [
  { cell: "Open the directory", action: "directory.open", resource: { tenantId: TENANT }, expected: "YYYYYYYY" },
  {
    cell: "See directory: person in another team",
    action: "directory.viewPerson",
    resource: { tenantId: TENANT, personId: OTHER_PERSON, teamIds: [OTHER_TEAM] },
    expected: "YYNYYYYY",
  },
  {
    cell: "See directory: person in own team",
    action: "directory.viewPerson",
    resource: { tenantId: TENANT, personId: OTHER_PERSON, teamIds: [OTHER_TEAM, OWN_TEAM] },
    expected: "YYYYYYYY",
  },
  {
    cell: "See directory: own record",
    action: "directory.viewPerson",
    resource: { tenantId: TENANT, personId: SELF, teamIds: [] },
    expected: "YYYYYYYY",
  },
  { cell: "Create staff-visible events", action: "calendarEvent.create", resource: event("staff"), expected: "YYNNYYNN" },
  { cell: "Create team events (own team)", action: "calendarEvent.create", resource: event("team", OWN_TEAM), expected: "YYNYYYNN" },
  { cell: "Create team events (other team)", action: "calendarEvent.create", resource: event("team", OTHER_TEAM), expected: "YYNNYYNN" },
  { cell: "Create private events", action: "calendarEvent.create", resource: event("private"), expected: "YYYYYYYY" },
  { cell: "Create public events", action: "calendarEvent.create", resource: event("public"), expected: "YNNNNNNN" },
  { cell: "Publish events to the website", action: "calendarEvent.publish", resource: { tenantId: TENANT }, expected: "YNNNNNNN" },
  { cell: "Book rooms (default policy: all staff)", action: "room.book", resource: room(OWN_ROOM), expected: "YYNYYYNN" },
  { cell: "Book rooms (room allows all workspace)", action: "room.book", resource: room(OWN_ROOM, "all_workspace"), expected: "YYYYYYNN" },
  { cell: "Book rooms (room allows only music leaders)", action: "room.book", resource: room(OWN_ROOM, ["musicLeader"]), expected: "NNNNYNNN" },
  { cell: "Book rooms (room allows volunteers by role)", action: "room.book", resource: room(OWN_ROOM, ["volunteer", "hrHandler"]), expected: "NNYNNNNN" },
  { cell: "Approve bookings (scoped room)", action: "booking.approve", resource: room(OWN_ROOM), expected: "YNNNNYNN" },
  { cell: "Approve bookings (other room)", action: "booking.approve", resource: room(OTHER_ROOM), expected: "YNNNNNNN" },
  { cell: "Create/edit service plans (own team)", action: "servicePlan.edit", resource: plan(OWN_TEAM), expected: "YNNYYNNN" },
  { cell: "Create/edit service plans (other team)", action: "servicePlan.edit", resource: plan(OTHER_TEAM), expected: "YNNNYNNN" },
  { cell: "Approve service plans (configured)", action: "servicePlan.approve", resource: plan(OWN_TEAM, [], true), expected: "YNNNYNNN" },
  { cell: "Approve service plans (not configured)", action: "servicePlan.approve", resource: plan(OWN_TEAM), expected: "YNNNNNNN" },
  { cell: "Assign people to positions (own team)", action: "assignment.manage", resource: { tenantId: TENANT, teamId: OWN_TEAM }, expected: "YNNYYNNN" },
  { cell: "Assign people to positions (other team)", action: "assignment.manage", resource: { tenantId: TENANT, teamId: OTHER_TEAM }, expected: "YNNNYNNN" },
  { cell: "Song library edit", action: "song.edit", resource: { tenantId: TENANT }, expected: "YNNNYNNN" },
  { cell: "View plans: assigned, other team", action: "servicePlan.view", resource: plan(OTHER_TEAM, [SELF]), expected: "YYYNYNNN" },
  { cell: "View plans: not assigned, own team", action: "servicePlan.view", resource: plan(OWN_TEAM), expected: "YNYYYNNN" },
  { cell: "View plans: not assigned, other team", action: "servicePlan.view", resource: plan(OTHER_TEAM, [OTHER_PERSON]), expected: "YNNNYNNN" },
  { cell: "View attachments: assigned, other team", action: "attachment.view", resource: plan(OTHER_TEAM, [SELF]), expected: "YYYNYNNN" },
  { cell: "View attachments: not assigned, own team", action: "attachment.view", resource: plan(OWN_TEAM), expected: "YNYYYNNN" },
  { cell: "View attachments: not assigned, other team", action: "attachment.view", resource: plan(OTHER_TEAM), expected: "YNNNYNNN" },
];

const cases = ROWS.flatMap((row) =>
  ROLES.map((role: WorkspaceRole, i) => ({
    name: `${row.cell} | ${role} ${row.expected[i] === "Y" ? "✔" : "✘"}`,
    role,
    row,
    allowed: row.expected[i] === "Y",
  })),
);

describe("SDD §21.2 workspace matrix (non-HR rows)", () => {
  it("every row lists all 8 roles", () => {
    for (const row of ROWS) expect(row.expected).toMatch(/^[YN]{8}$/);
  });

  it.each(cases)("$name", ({ role, row, allowed }) => {
    expect(can(workspaceActor(role, row.actorExtra), row.action, row.resource as never)).toBe(
      allowed,
    );
  });
});

describe("workspace scope boundaries and edge cases", () => {
  it("a tenant actor with only website roles has no workspace capability", () => {
    const owner = websiteActor("owner");
    expect(can(owner, "directory.open", { tenantId: TENANT })).toBe(false);
    expect(can(owner, "calendarEvent.create", event("private"))).toBe(false);
    expect(explain(owner, "calendarEvent.create", event("private")).reason).toBe(
      "private events require a workspace role",
    );
  });

  it("team events must name a team", () => {
    expect(explain(workspaceActor("leader"), "calendarEvent.create", event("team"))).toEqual({
      allowed: false,
      reason: "team events must name a team",
    });
  });

  it("unknown visibility is denied", () => {
    expect(
      can(workspaceActor("leader"), "calendarEvent.create", event("secret" as EventVisibility)),
    ).toBe(false);
  });

  it("teamLeader may only create team-visibility events", () => {
    expect(
      explain(workspaceActor("teamLeader"), "calendarEvent.create", event("staff")).reason,
    ).toBe("teamLeader: may only create team events");
  });

  it("an actor without a person record is never 'assigned'", () => {
    const actor = workspaceActor("employee", { personId: null });
    expect(can(actor, "servicePlan.view", plan(OTHER_TEAM, [SELF]))).toBe(false);
  });

  it("a plan without team is not 'own team' for team leaders or volunteers", () => {
    const resource = { tenantId: TENANT, teamId: null };
    expect(can(workspaceActor("teamLeader"), "servicePlan.view", resource)).toBe(false);
    expect(can(workspaceActor("volunteer"), "servicePlan.view", resource)).toBe(false);
    expect(
      can(
        workspaceActor("volunteer", { memberTeamIds: undefined }),
        "servicePlan.view",
        plan(OWN_TEAM),
      ),
    ).toBe(false);
  });

  it("roomManager without managed rooms approves nothing", () => {
    expect(
      can(
        workspaceActor("roomManager", { managedRoomIds: undefined }),
        "booking.approve",
        room(OWN_ROOM),
      ),
    ).toBe(false);
  });

  it("explains room-policy and configuration denials", () => {
    expect(explain(workspaceActor("volunteer"), "room.book", room(OWN_ROOM)).reason).toBe(
      "volunteer: the room's booking policy does not admit this role",
    );
    expect(
      explain(workspaceActor("musicLeader"), "servicePlan.approve", plan(OWN_TEAM)).reason,
    ).toBe("musicLeader: music leaders may not approve plans in this church");
    expect(explain(workspaceActor("roomManager"), "booking.approve", room(OTHER_ROOM)).reason).toBe(
      "roomManager: not a room the actor manages",
    );
  });

  it("evaluateWorkspace denies actions outside the workspace matrix", () => {
    expect(
      evaluateWorkspace(workspaceActor("leader"), "news.edit", { tenantId: TENANT }).allowed,
    ).toBe(false);
  });
});
