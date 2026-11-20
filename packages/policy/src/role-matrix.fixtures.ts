// D-52: the expectation tables of the workspace and organization role matrices.
//
// Everything in this file is transcribed BY HAND from SDD §21.2 / §25.4 / §25.7 and the resolved
// ambiguities of README.md. It must never be derived from the implementation's matrices
// (`WORKSPACE_MATRIX`, ...). `role-matrix.test.ts` runs every entry against `can()`, and renders
// the same tables into `MATRIX.md` for reviewers.
import type { Action, EventVisibility, HrCategoryRef, ResourceByAction } from "./actions";
import type { OrgActor, TenantActor } from "./actor";
import { tenantActor } from "./actor";
import {
  CERTIFICATE,
  COMPLAINT,
  EMPTY_DELEGATION,
  LEAVE,
  LINKED,
  LINKED_ALL,
  ORG,
  OTHER_GROUP,
  OTHER_PERSON,
  OTHER_ROOM,
  OTHER_TEAM,
  OWN_GROUP,
  OWN_ROOM,
  OWN_TEAM,
  REPORT,
  REQUESTED,
  REVOKED,
  SAFEGUARDING,
  SELF,
  TENANT,
  UNLINKED,
  diocesanActor,
  workspaceActor,
} from "./policy.fixtures";
import type { OrgRole, WorkspaceRole } from "./roles";

export { OTHER_PERSON, SELF, TENANT };

/** Column order of every workspace expectation string: L E V TL ML RM HR CH. */
export const WS_ROLES = [
  "leader",
  "employee",
  "volunteer",
  "teamLeader",
  "musicLeader",
  "roomManager",
  "hrHandler",
  "confidentialHandler",
] as const satisfies readonly WorkspaceRole[];

/** Column order of every organization expectation string. */
export const ORG_ROLES_ORDER = [
  "orgHrAdmin",
  "orgHrHandler",
  "orgConfidentialHandler",
] as const satisfies readonly OrgRole[];

// ---------------------------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------------------------

/** One concrete `can()` check; `allowed` has one `Y`/`N` per role column. */
export interface Variant {
  readonly label: string;
  readonly action: Action;
  readonly resource: unknown;
  readonly allowed: string;
}

/** One SDD capability row: the SDD's own cell texts plus the concrete checks behind them. */
export interface MatrixRow {
  readonly capability: string;
  /** The cell texts exactly as the SDD table shows them (empty = blank cell). */
  readonly sdd: readonly string[];
  readonly variants: readonly Variant[];
}

/** One boundary check of a scoped role (or an organization actor): an explicit actor and result. */
export interface ScopeCase<A> {
  readonly label: string;
  readonly actor: A;
  readonly action: Action;
  readonly resource: unknown;
  readonly allowed: boolean;
}

export interface ScopeGroup<A> {
  readonly title: string;
  readonly cases: readonly ScopeCase<A>[];
}

export interface ComboCheck {
  readonly label: string;
  readonly action: Action;
  readonly resource: unknown;
  readonly allowed: boolean;
}

export interface Combo {
  readonly title: string;
  readonly actor: TenantActor;
  readonly checks: readonly ComboCheck[];
}

function v<A extends Action>(
  label: string,
  action: A,
  resource: ResourceByAction[A],
  allowed: string,
): Variant {
  return { label, action, resource, allowed };
}

// ---------------------------------------------------------------------------------------------
// Resource builders (the fixture actor is a member of OWN_TEAM; a teamLeader leads OWN_TEAM; a
// roomManager manages OWN_ROOM; hrHandler handles LEAVE; confidentialHandler handles COMPLAINT)
// ---------------------------------------------------------------------------------------------

const tenant = { tenantId: TENANT };
const event = (visibility: EventVisibility, teamId?: string) => ({
  tenantId: TENANT,
  visibility,
  teamId,
});
const room = (roomId: string, whoCanRequest?: ResourceByAction["room.book"]["whoCanRequest"]) => ({
  tenantId: TENANT,
  roomId,
  whoCanRequest,
});
const plan = (
  teamId: string,
  assignedPersonIds: readonly string[] = [],
  musicLeaderMayApprove?: boolean,
) => ({ tenantId: TENANT, teamId, assignedPersonIds, musicLeaderMayApprove });
const team = (teamId: string) => ({ tenantId: TENANT, teamId });
const person = (personId: string, teamIds: readonly string[]) => ({
  tenantId: TENANT,
  personId,
  teamIds,
});
const ticket = (
  category: HrCategoryRef,
  requesterPersonId: string | null = OTHER_PERSON,
  handedOver?: boolean,
  tenantId = TENANT,
) => ({ tenantId, category, requesterPersonId, handedOver });
const submit = (whoCanSubmit: "employees" | "volunteers" | "all", category = LEAVE) => ({
  tenantId: TENANT,
  category: { ...category, whoCanSubmit },
});
const hrPerson = (personId: string) => ({ tenantId: TENANT, personId });
const categoryOf = (category: HrCategoryRef, tenantId = TENANT) => ({ tenantId, category });

// ---------------------------------------------------------------------------------------------
// SDD §21.2 — one entry per capability row of the table (15 rows x 8 roles = 120 cells)
// ---------------------------------------------------------------------------------------------

// prettier-ignore
export const SDD_ROWS: readonly MatrixRow[] = [
  {
    capability: "See directory (respecting contact visibility)",
    sdd: ["✔", "✔", "own teams", "✔", "✔", "✔", "✔", "✔"],
    variants: [
      v("open the directory", "directory.open", tenant, "YYYYYYYY"),
      v("person of an own team", "directory.viewPerson", person(OTHER_PERSON, [OWN_TEAM]), "YYYYYYYY"),
      v("the actor's own record", "directory.viewPerson", person(SELF, [OTHER_TEAM]), "YYYYYYYY"),
    ],
  },
  {
    capability: "Create staff-visible / team events",
    sdd: ["✔", "✔", "", "own team", "✔", "✔", "", ""],
    variants: [
      v("staff-visible event", "calendarEvent.create", event("staff"), "YYNNYYNN"),
      v("team event of an own team", "calendarEvent.create", event("team", OWN_TEAM), "YYNYYYNN"),
    ],
  },
  {
    capability: "Publish events to the website (public)",
    sdd: ["✔", "", "", "", "", "", "", ""],
    variants: [
      v("publish an event", "calendarEvent.publish", tenant, "YNNNNNNN"),
      v("create a public event", "calendarEvent.create", event("public"), "YNNNNNNN"),
    ],
  },
  {
    capability: "Book rooms (subject to room policy)",
    sdd: ["✔", "✔", "if allowed by room", "✔", "✔", "✔", "", ""],
    variants: [
      v("room without explicit policy (default all_staff)", "room.book", room(OWN_ROOM), "YYNYYYNN"),
      v("room for all_staff", "room.book", room(OWN_ROOM, "all_staff"), "YYNYYYNN"),
      v("room for all_workspace", "room.book", room(OWN_ROOM, "all_workspace"), "YYYYYYNN"),
      v("room restricted to the role list [volunteer]", "room.book", room(OWN_ROOM, ["volunteer"]), "NNYNNNNN"),
      v("room restricted to the role list [volunteer, employee]", "room.book", room(OWN_ROOM, ["volunteer", "employee"]), "NYYNNNNN"),
    ],
  },
  {
    capability: "Approve bookings",
    sdd: ["✔", "", "", "", "", "scoped rooms", "", ""],
    variants: [v("room the actor manages", "booking.approve", room(OWN_ROOM), "YNNNNYNN")],
  },
  {
    capability: "Create/edit service plans",
    sdd: ["✔", "", "", "own team", "✔", "", "", ""],
    variants: [v("plan of an own team", "servicePlan.edit", plan(OWN_TEAM), "YNNYYNNN")],
  },
  {
    capability: "Approve service plans",
    sdd: ["✔", "", "", "", "✔ (if configured)", "", "", ""],
    variants: [
      v("church lets music leaders approve", "servicePlan.approve", plan(OWN_TEAM, [], true), "YNNNYNNN"),
      v("church does not let music leaders approve", "servicePlan.approve", plan(OWN_TEAM, [], false), "YNNNNNNN"),
      v("setting missing (deny by default)", "servicePlan.approve", plan(OWN_TEAM), "YNNNNNNN"),
    ],
  },
  {
    capability: "Assign people to positions",
    sdd: ["✔", "", "", "own team", "✔", "", "", ""],
    variants: [v("position of an own team", "assignment.manage", team(OWN_TEAM), "YNNYYNNN")],
  },
  {
    capability: "Song library edit",
    sdd: ["✔", "", "", "", "✔", "", "", ""],
    variants: [v("edit the song library", "song.edit", tenant, "YNNNYNNN")],
  },
  {
    capability: "View plans & attachments",
    sdd: ["✔", "assigned", "assigned / own team", "own team", "✔", "", "", ""],
    variants: [
      v("plan: actor assigned, other team", "servicePlan.view", plan(OTHER_TEAM, [SELF]), "YYYNYNNN"),
      v("plan: not assigned, own team", "servicePlan.view", plan(OWN_TEAM), "YNYYYNNN"),
      v("plan: not assigned, other team", "servicePlan.view", plan(OTHER_TEAM), "YNNNYNNN"),
      v("attachment: actor assigned, other team", "attachment.view", plan(OTHER_TEAM, [SELF]), "YYYNYNNN"),
      v("attachment: not assigned, own team", "attachment.view", plan(OWN_TEAM), "YNYYYNNN"),
      v("attachment: not assigned, other team", "attachment.view", plan(OTHER_TEAM), "YNNNYNNN"),
    ],
  },
  {
    capability: "Submit HR requests",
    sdd: ["✔", "✔", "enabled categories", "✔", "✔", "✔", "✔", "✔"],
    variants: [
      v("category open to employees only", "hr.ticket.create", submit("employees"), "YYNYYYYY"),
      v("category open to volunteers", "hr.ticket.create", submit("volunteers"), "YYYYYYYY"),
      v("category open to everybody", "hr.ticket.create", submit("all"), "YYYYYYYY"),
      v("confidential category open to everybody", "hr.ticket.create", submit("all", COMPLAINT), "YYYYYYYY"),
    ],
  },
  {
    capability: "Approve as manager",
    sdd: ["direct reports", "direct reports", "", "", "", "", "", ""],
    variants: [
      v("request of a direct report", "hr.ticket.approveAsManager", ticket(LEAVE, REPORT), "YYNNNNNN"),
      v("request of a direct report (other category)", "hr.ticket.approveAsManager", ticket(CERTIFICATE, REPORT), "YYNNNNNN"),
    ],
  },
  {
    capability: "Handle HR tickets",
    sdd: ["", "", "", "", "", "", "scoped categories", ""],
    variants: [
      v("read a ticket of the scoped category", "hr.ticket.read", ticket(LEAVE), "NNNNNNYN"),
      v("reply to a ticket of the scoped category", "hr.ticket.reply", ticket(LEAVE), "NNNNNNYN"),
      v("handle a ticket of the scoped category", "hr.ticket.handle", ticket(LEAVE), "NNNNNNYN"),
      v("view absence details of the scoped category", "hr.absence.viewDetails", categoryOf(LEAVE), "NNNNNNYN"),
    ],
  },
  {
    capability: "Handle confidential tickets",
    sdd: ["", "", "", "", "", "", "", "scoped categories"],
    variants: [
      v("read a confidential ticket of the scoped category", "hr.ticket.read", ticket(COMPLAINT), "NNNNNNNY"),
      v("reply to a confidential ticket of the scoped category", "hr.ticket.reply", ticket(COMPLAINT), "NNNNNNNY"),
      v("handle a confidential ticket of the scoped category", "hr.ticket.handle", ticket(COMPLAINT), "NNNNNNNY"),
      v("view absence details of the confidential category", "hr.absence.viewDetails", categoryOf(COMPLAINT), "NNNNNNNY"),
    ],
  },
  {
    capability: "Staff records, balances, payroll export",
    sdd: ["", "", "", "", "", "", "✔", ""],
    variants: [
      v("view a staff record", "hr.staffRecord.view", hrPerson(OTHER_PERSON), "NNNNNNYN"),
      v("edit a staff record", "hr.staffRecord.edit", hrPerson(OTHER_PERSON), "NNNNNNYN"),
      v("manage a leave balance", "hr.leaveBalance.manage", hrPerson(OTHER_PERSON), "NNNNNNYN"),
      v("view the leave balance of somebody else", "hr.leaveBalance.view", hrPerson(OTHER_PERSON), "NNNNNNYN"),
      v("export payroll", "hr.payroll.export", tenant, "NNNNNNYN"),
      v("view HR reports", "hr.report.view", tenant, "NNNNNNYN"),
    ],
  },
];

/**
 * Cells that are not rows of the SDD §21.2 table but are decided by the README's resolved
 * ambiguities (README "Further rules" and the workspace matrix there). Same role columns.
 */
// prettier-ignore
export const README_ROWS: readonly MatrixRow[] = [
  {
    capability: "Create private events (README: every workspace role has a personal calendar)",
    sdd: ["✔", "✔", "✔", "✔", "✔", "✔", "✔", "✔"],
    variants: [v("private event", "calendarEvent.create", event("private"), "YYYYYYYY")],
  },
  {
    capability: "Own leave balance (README)",
    sdd: ["✔", "✔", "✔", "✔", "✔", "✔", "✔", "✔"],
    variants: [v("own leave balance", "hr.leaveBalance.view", hrPerson(SELF), "YYYYYYYY")],
  },
  {
    capability: "Absence calendar „Távol” (README)",
    sdd: ["✔", "✔", "✔", "✔", "✔", "✔", "✔", "✔"],
    variants: [v("absence calendar", "hr.absence.viewCalendar", tenant, "YYYYYYYY")],
  },
  {
    capability: "Requester of a non-confidential ticket: read and reply, never handle (README)",
    sdd: ["read, reply", "read, reply", "read, reply", "read, reply", "read, reply", "read, reply", "read, reply", "read, reply"],
    variants: [
      v("read own ticket", "hr.ticket.read", ticket(LEAVE, SELF), "YYYYYYYY"),
      v("reply to own ticket", "hr.ticket.reply", ticket(LEAVE, SELF), "YYYYYYYY"),
      // The HR handler of LEAVE (scoped) must not process their own request either.
      v("handle own ticket", "hr.ticket.handle", ticket(LEAVE, SELF), "NNNNNNNN"),
    ],
  },
  {
    capability: "Requester of a confidential ticket: read and reply, never handle (README)",
    sdd: ["read, reply", "read, reply", "read, reply", "read, reply", "read, reply", "read, reply", "read, reply", "read, reply"],
    variants: [
      v("read own confidential ticket", "hr.ticket.read", ticket(COMPLAINT, SELF), "YYYYYYYY"),
      v("reply to own confidential ticket", "hr.ticket.reply", ticket(COMPLAINT, SELF), "YYYYYYYY"),
      // The confidential handler of COMPLAINT (scoped) must not process their own complaint.
      v("handle own confidential ticket", "hr.ticket.handle", ticket(COMPLAINT, SELF), "NNNNNNNN"),
    ],
  },
  {
    capability: "Handed-over tickets (Átadás) are read-only (README, SDD §25.4)",
    sdd: ["", "", "", "", "", "", "read only", "read only (confidential)"],
    variants: [
      v("read a handed-over ticket", "hr.ticket.read", ticket(LEAVE, OTHER_PERSON, true), "NNNNNNYN"),
      v("reply to a handed-over ticket", "hr.ticket.reply", ticket(LEAVE, OTHER_PERSON, true), "NNNNNNNN"),
      v("handle a handed-over ticket", "hr.ticket.handle", ticket(LEAVE, OTHER_PERSON, true), "NNNNNNNN"),
      v("read a handed-over confidential ticket", "hr.ticket.read", ticket(COMPLAINT, OTHER_PERSON, true), "NNNNNNNY"),
      v("reply to a handed-over confidential ticket", "hr.ticket.reply", ticket(COMPLAINT, OTHER_PERSON, true), "NNNNNNNN"),
      v("handle a handed-over confidential ticket", "hr.ticket.handle", ticket(COMPLAINT, OTHER_PERSON, true), "NNNNNNNN"),
    ],
  },
  {
    capability: "Managers never approve their own or confidential requests (README, SDD §25.4)",
    sdd: ["", "", "", "", "", "", "", ""],
    variants: [
      v("own request", "hr.ticket.approveAsManager", ticket(LEAVE, SELF), "NNNNNNNN"),
      v("confidential request of a direct report", "hr.ticket.approveAsManager", ticket(COMPLAINT, REPORT), "NNNNNNNN"),
      v("anonymous request", "hr.ticket.approveAsManager", ticket(LEAVE, null), "NNNNNNNN"),
    ],
  },
];

// ---------------------------------------------------------------------------------------------
// Scope boundaries of the scoped workspace roles
// ---------------------------------------------------------------------------------------------

const asTeamLeader = (extra: Partial<TenantActor> = {}) => workspaceActor("teamLeader", extra);
const asRoomManager = (extra: Partial<TenantActor> = {}) => workspaceActor("roomManager", extra);
const asHrHandler = (extra: Partial<TenantActor> = {}) => workspaceActor("hrHandler", extra);
const asConfidential = (extra: Partial<TenantActor> = {}) =>
  workspaceActor("confidentialHandler", extra);

function c(
  label: string,
  actor: TenantActor,
  action: Action,
  resource: unknown,
  allowed: boolean,
): ScopeCase<TenantActor> {
  return { label, actor, action, resource, allowed };
}

const HR_HANDLE_ACTIONS = ["hr.ticket.read", "hr.ticket.reply", "hr.ticket.handle"] as const;

/** Each handled action in and outside of a category scope. */
function categoryCases(
  actor: TenantActor,
  inside: HrCategoryRef,
  outside: HrCategoryRef,
  note = "",
): ScopeCase<TenantActor>[] {
  return [
    ...HR_HANDLE_ACTIONS.flatMap((action) => [
      c(`${action} in ${inside.key}${note}`, actor, action, ticket(inside), true),
      c(`${action} in ${outside.key}${note}`, actor, action, ticket(outside), false),
    ]),
    c(
      `hr.absence.viewDetails in ${inside.key}${note}`,
      actor,
      "hr.absence.viewDetails",
      categoryOf(inside),
      true,
    ),
    c(
      `hr.absence.viewDetails in ${outside.key}${note}`,
      actor,
      "hr.absence.viewDetails",
      categoryOf(outside),
      false,
    ),
  ];
}

export const WORKSPACE_SCOPE_GROUPS: readonly ScopeGroup<TenantActor>[] = [
  {
    title: "teamLeader: own team vs other team",
    cases: [
      c("servicePlan.edit, own team", asTeamLeader(), "servicePlan.edit", plan(OWN_TEAM), true),
      c(
        "servicePlan.edit, other team",
        asTeamLeader(),
        "servicePlan.edit",
        plan(OTHER_TEAM),
        false,
      ),
      c("assignment.manage, own team", asTeamLeader(), "assignment.manage", team(OWN_TEAM), true),
      c(
        "assignment.manage, other team",
        asTeamLeader(),
        "assignment.manage",
        team(OTHER_TEAM),
        false,
      ),
      c("servicePlan.view, own team", asTeamLeader(), "servicePlan.view", plan(OWN_TEAM), true),
      c(
        "servicePlan.view, other team",
        asTeamLeader(),
        "servicePlan.view",
        plan(OTHER_TEAM),
        false,
      ),
      c("attachment.view, own team", asTeamLeader(), "attachment.view", plan(OWN_TEAM), true),
      c("attachment.view, other team", asTeamLeader(), "attachment.view", plan(OTHER_TEAM), false),
      c(
        "servicePlan.view, other team but the actor is assigned (assignment does not widen the scope)",
        asTeamLeader(),
        "servicePlan.view",
        plan(OTHER_TEAM, [SELF]),
        false,
      ),
      c(
        "calendarEvent.create team event, own team",
        asTeamLeader(),
        "calendarEvent.create",
        event("team", OWN_TEAM),
        true,
      ),
      c(
        "calendarEvent.create team event, other team",
        asTeamLeader(),
        "calendarEvent.create",
        event("team", OTHER_TEAM),
        false,
      ),
      c(
        "calendarEvent.create team event without a team",
        asTeamLeader(),
        "calendarEvent.create",
        event("team"),
        false,
      ),
      c(
        "calendarEvent.create staff-visible event",
        asTeamLeader(),
        "calendarEvent.create",
        event("staff"),
        false,
      ),
      c(
        "calendarEvent.create public event",
        asTeamLeader(),
        "calendarEvent.create",
        event("public"),
        false,
      ),
      c(
        "calendarEvent.create private event",
        asTeamLeader(),
        "calendarEvent.create",
        event("private"),
        true,
      ),
      c(
        "servicePlan.edit, member but not leader of the team",
        asTeamLeader({ leadTeamIds: [], memberTeamIds: [OWN_TEAM] }),
        "servicePlan.edit",
        plan(OWN_TEAM),
        false,
      ),
      c(
        "servicePlan.edit, no lead scope at all (deny by default)",
        asTeamLeader({ leadTeamIds: undefined }),
        "servicePlan.edit",
        plan(OWN_TEAM),
        false,
      ),
      c(
        "servicePlan.edit, leads both teams",
        asTeamLeader({ leadTeamIds: [OWN_TEAM, OTHER_TEAM] }),
        "servicePlan.edit",
        plan(OTHER_TEAM),
        true,
      ),
      c(
        "calendarEvent.create team event, leads both teams",
        asTeamLeader({ leadTeamIds: [OWN_TEAM, OTHER_TEAM] }),
        "calendarEvent.create",
        event("team", OTHER_TEAM),
        true,
      ),
    ],
  },
  {
    title: "roomManager: own room vs other room",
    cases: [
      c("booking.approve, managed room", asRoomManager(), "booking.approve", room(OWN_ROOM), true),
      c("booking.approve, other room", asRoomManager(), "booking.approve", room(OTHER_ROOM), false),
      c(
        "booking.approve, manages both rooms",
        asRoomManager({ managedRoomIds: [OWN_ROOM, OTHER_ROOM] }),
        "booking.approve",
        room(OTHER_ROOM),
        true,
      ),
      c(
        "booking.approve, no room scope (deny by default)",
        asRoomManager({ managedRoomIds: undefined }),
        "booking.approve",
        room(OWN_ROOM),
        false,
      ),
      c(
        "booking.approve, empty room scope",
        asRoomManager({ managedRoomIds: [] }),
        "booking.approve",
        room(OWN_ROOM),
        false,
      ),
      c("room.book, managed room", asRoomManager(), "room.book", room(OWN_ROOM), true),
      c(
        "room.book, other room (booking is not room-scoped)",
        asRoomManager(),
        "room.book",
        room(OTHER_ROOM),
        true,
      ),
      c(
        "room.book, other room restricted to a role list without roomManager",
        asRoomManager(),
        "room.book",
        room(OTHER_ROOM, ["employee"]),
        false,
      ),
    ],
  },
  {
    title: "hrHandler: own category vs other category",
    cases: [
      ...categoryCases(asHrHandler(), LEAVE, CERTIFICATE),
      ...categoryCases(
        asHrHandler({ hrCategoryIds: "*" }),
        CERTIFICATE,
        COMPLAINT,
        " (scope *)",
      ).slice(0, 6),
      c(
        "hr.ticket.read, no category scope (deny by default)",
        asHrHandler({ hrCategoryIds: undefined }),
        "hr.ticket.read",
        ticket(LEAVE),
        false,
      ),
      c(
        "hr.ticket.read, empty category scope",
        asHrHandler({ hrCategoryIds: [] }),
        "hr.ticket.read",
        ticket(LEAVE),
        false,
      ),
      c(
        "hr.ticket.read, confidential category even when its id is in the scope",
        asHrHandler({ hrCategoryIds: [LEAVE.id, COMPLAINT.id] }),
        "hr.ticket.read",
        ticket(COMPLAINT),
        false,
      ),
      c(
        "hr.absence.viewDetails, confidential category even with scope *",
        asHrHandler({ hrCategoryIds: "*" }),
        "hr.absence.viewDetails",
        categoryOf(COMPLAINT),
        false,
      ),
      c(
        "hr.staffRecord.view, tenant-wide: not limited by the category scope",
        asHrHandler({ hrCategoryIds: [] }),
        "hr.staffRecord.view",
        hrPerson(OTHER_PERSON),
        true,
      ),
      c(
        "hr.payroll.export, tenant-wide: not limited by the category scope",
        asHrHandler({ hrCategoryIds: [] }),
        "hr.payroll.export",
        tenant,
        true,
      ),
    ],
  },
  {
    title: "confidentialHandler: own category vs other category",
    cases: [
      ...categoryCases(asConfidential(), COMPLAINT, SAFEGUARDING),
      c(
        "hr.ticket.read, scoped to both confidential categories",
        asConfidential({ confidentialCategoryIds: [COMPLAINT.id, SAFEGUARDING.id] }),
        "hr.ticket.read",
        ticket(SAFEGUARDING),
        true,
      ),
      c(
        "hr.ticket.read, no category scope (deny by default)",
        asConfidential({ confidentialCategoryIds: undefined }),
        "hr.ticket.read",
        ticket(COMPLAINT),
        false,
      ),
      c(
        "hr.ticket.read, empty category scope",
        asConfidential({ confidentialCategoryIds: [] }),
        "hr.ticket.read",
        ticket(COMPLAINT),
        false,
      ),
      c(
        "hr.ticket.read, non-confidential category even when its id is in the scope",
        asConfidential({ confidentialCategoryIds: [COMPLAINT.id, LEAVE.id] }),
        "hr.ticket.read",
        ticket(LEAVE),
        false,
      ),
      c(
        "hr.staffRecord.view (HR-only)",
        asConfidential(),
        "hr.staffRecord.view",
        hrPerson(OTHER_PERSON),
        false,
      ),
      c(
        "hr.ticket.read in LEAVE and COMPLAINT with both HR roles and both scopes",
        workspaceActor(["hrHandler", "confidentialHandler"]),
        "hr.ticket.read",
        ticket(LEAVE),
        true,
      ),
      c(
        "hr.ticket.read in COMPLAINT with both HR roles and both scopes",
        workspaceActor(["hrHandler", "confidentialHandler"]),
        "hr.ticket.read",
        ticket(COMPLAINT),
        true,
      ),
      c(
        "hr.ticket.read in SAFEGUARDING with both HR roles and both scopes",
        workspaceActor(["hrHandler", "confidentialHandler"]),
        "hr.ticket.read",
        ticket(SAFEGUARDING),
        false,
      ),
    ],
  },
  {
    title: "managers (leader, employee) approve only direct reports",
    cases: (["leader", "employee"] as const).flatMap((role) => [
      c(
        `${role}: direct report`,
        workspaceActor(role),
        "hr.ticket.approveAsManager",
        ticket(LEAVE, REPORT),
        true,
      ),
      c(
        `${role}: somebody else`,
        workspaceActor(role),
        "hr.ticket.approveAsManager",
        ticket(LEAVE, OTHER_PERSON),
        false,
      ),
      c(
        `${role}: no direct reports at all (deny by default)`,
        workspaceActor(role, { directReportPersonIds: undefined }),
        "hr.ticket.approveAsManager",
        ticket(LEAVE, REPORT),
        false,
      ),
      c(
        `${role}: own request, even when listed as own direct report`,
        workspaceActor(role, { directReportPersonIds: [SELF] }),
        "hr.ticket.approveAsManager",
        ticket(LEAVE, SELF),
        false,
      ),
      c(
        `${role}: confidential request of a direct report`,
        workspaceActor(role),
        "hr.ticket.approveAsManager",
        ticket(COMPLAINT, REPORT),
        false,
      ),
      c(
        `${role}: anonymous request`,
        workspaceActor(role, { directReportPersonIds: [REPORT] }),
        "hr.ticket.approveAsManager",
        ticket(LEAVE, null),
        false,
      ),
    ]),
  },
];

// ---------------------------------------------------------------------------------------------
// SDD §25.7 organization roles — 7 capability rows x 3 roles
// ---------------------------------------------------------------------------------------------

/** Role columns: orgHrAdmin, orgHrHandler, orgConfidentialHandler. */
// prettier-ignore
export const ORG_ROWS: readonly MatrixRow[] = [
  {
    capability: "Open the portal",
    sdd: ["✔", "✔", "✔"],
    variants: [v("own organization", "org.portal.open", { orgId: ORG }, "YYY")],
  },
  {
    capability: "Templates, parish links, members",
    sdd: ["✔", "", ""],
    variants: [
      v("manage templates", "hr.template.manage", { orgId: ORG }, "YNN"),
      v("manage parish links", "org.links.manage", { orgId: ORG }, "YNN"),
      v("manage members", "org.members.manage", { orgId: ORG }, "YNN"),
    ],
  },
  {
    capability: "Delegated tickets & absence details (non-confidential)",
    sdd: ["✔", "✔", ""],
    variants: [
      v("read, active link, delegated category", "hr.ticket.read", ticket(LEAVE, OTHER_PERSON, undefined, LINKED), "YYN"),
      v("reply, active link, delegated category", "hr.ticket.reply", ticket(LEAVE, OTHER_PERSON, undefined, LINKED), "YYN"),
      v("handle, active link, delegated category", "hr.ticket.handle", ticket(LEAVE, OTHER_PERSON, undefined, LINKED), "YYN"),
      v("absence details, delegated category", "hr.absence.viewDetails", categoryOf(LEAVE, LINKED), "YYN"),
    ],
  },
  {
    capability: "Delegated confidential tickets & absence details",
    sdd: ["", "", "✔"],
    variants: [
      v("read, active link, delegated confidential category", "hr.ticket.read", ticket(COMPLAINT, OTHER_PERSON, undefined, LINKED), "NNY"),
      v("reply, active link, delegated confidential category", "hr.ticket.reply", ticket(COMPLAINT, OTHER_PERSON, undefined, LINKED), "NNY"),
      v("handle, active link, delegated confidential category", "hr.ticket.handle", ticket(COMPLAINT, OTHER_PERSON, undefined, LINKED), "NNY"),
      v("absence details, delegated confidential category", "hr.absence.viewDetails", categoryOf(COMPLAINT, LINKED), "NNY"),
    ],
  },
  {
    capability: "Absence calendar of linked parishes",
    sdd: ["✔", "✔", "✔"],
    variants: [v("active link", "hr.absence.viewCalendar", { tenantId: LINKED }, "YYY")],
  },
  {
    capability: "Reports, leave balances, payroll CSV",
    sdd: ["✔", "✔", ""],
    variants: [
      v("HR report", "hr.report.view", { tenantId: LINKED }, "YYN"),
      v("leave balance", "hr.leaveBalance.view", { tenantId: LINKED, personId: OTHER_PERSON }, "YYN"),
      v("payroll export", "hr.payroll.export", { tenantId: LINKED }, "YYN"),
    ],
  },
  {
    capability: "Submit, manager approval, staff records, balance management, any website / workspace action",
    sdd: ["", "", ""],
    variants: [
      v("submit an HR request", "hr.ticket.create", { tenantId: LINKED, category: { ...LEAVE, whoCanSubmit: "all" } }, "NNN"),
      v("approve as manager", "hr.ticket.approveAsManager", ticket(LEAVE, REPORT, undefined, LINKED), "NNN"),
      v("view a staff record", "hr.staffRecord.view", { tenantId: LINKED, personId: OTHER_PERSON }, "NNN"),
      v("edit a staff record", "hr.staffRecord.edit", { tenantId: LINKED, personId: OTHER_PERSON }, "NNN"),
      v("manage a leave balance", "hr.leaveBalance.manage", { tenantId: LINKED, personId: OTHER_PERSON }, "NNN"),
      v("website: manage users", "site.users.manage", { tenantId: LINKED, targetRoles: [] }, "NNN"),
      v("website: publish a page", "page.publish", { tenantId: LINKED }, "NNN"),
      v("workspace: open the directory", "directory.open", { tenantId: LINKED }, "NNN"),
      v("workspace: publish an event", "calendarEvent.publish", { tenantId: LINKED }, "NNN"),
      v("workspace: approve a booking", "booking.approve", { tenantId: LINKED, roomId: OWN_ROOM }, "NNN"),
    ],
  },
];

function oc(
  label: string,
  actor: OrgActor,
  action: Action,
  resource: unknown,
  allowed: boolean,
): ScopeCase<OrgActor> {
  return { label, actor, action, resource, allowed };
}

const ORG_HR = diocesanActor("orgHrAdmin");
const ORG_HANDLER = diocesanActor("orgHrHandler");
const ORG_CONF = diocesanActor("orgConfidentialHandler");

export const ORG_SCOPE_GROUPS: readonly ScopeGroup<OrgActor>[] = [
  {
    title: "Link status and parish scope",
    cases: [
      oc(
        "active link, delegated category",
        ORG_HR,
        "hr.ticket.read",
        ticket(LEAVE, OTHER_PERSON, undefined, LINKED),
        true,
      ),
      oc(
        "parish that is not linked",
        ORG_HR,
        "hr.ticket.read",
        ticket(LEAVE, OTHER_PERSON, undefined, UNLINKED),
        false,
      ),
      oc(
        "link only requested",
        ORG_HR,
        "hr.ticket.read",
        ticket(LEAVE, OTHER_PERSON, undefined, REQUESTED),
        false,
      ),
      oc(
        "link revoked",
        ORG_HR,
        "hr.ticket.read",
        ticket(LEAVE, OTHER_PERSON, undefined, REVOKED),
        false,
      ),
      oc(
        "link revoked: absence calendar",
        ORG_HR,
        "hr.absence.viewCalendar",
        { tenantId: REVOKED },
        false,
      ),
      oc("link revoked: payroll export", ORG_HR, "hr.payroll.export", { tenantId: REVOKED }, false),
      oc("link requested: report", ORG_HR, "hr.report.view", { tenantId: REQUESTED }, false),
      oc(
        "no links at all",
        diocesanActor("orgHrAdmin", { links: undefined }),
        "hr.ticket.read",
        ticket(LEAVE, OTHER_PERSON, undefined, LINKED),
        false,
      ),
      oc(
        "empty links",
        diocesanActor("orgHrAdmin", { links: [] }),
        "hr.absence.viewCalendar",
        { tenantId: LINKED },
        false,
      ),
      oc(
        "parish scope lists the parish",
        diocesanActor("orgHrAdmin", { parishScopes: [LINKED] }),
        "hr.ticket.read",
        ticket(LEAVE, OTHER_PERSON, undefined, LINKED),
        true,
      ),
      oc(
        "parish scope lists only another parish",
        diocesanActor("orgHrAdmin", { parishScopes: [LINKED_ALL] }),
        "hr.ticket.read",
        ticket(LEAVE, OTHER_PERSON, undefined, LINKED),
        false,
      ),
      oc(
        "parish scope lists only another parish: calendar",
        diocesanActor("orgHrAdmin", { parishScopes: [LINKED_ALL] }),
        "hr.absence.viewCalendar",
        { tenantId: LINKED },
        false,
      ),
      oc(
        "parish scope lists only another parish: report",
        diocesanActor("orgHrAdmin", { parishScopes: [LINKED_ALL] }),
        "hr.report.view",
        { tenantId: LINKED },
        false,
      ),
      oc(
        "empty parish scope",
        diocesanActor("orgHrAdmin", { parishScopes: [] }),
        "hr.ticket.read",
        ticket(LEAVE, OTHER_PERSON, undefined, LINKED),
        false,
      ),
      oc(
        "missing parish scope (deny by default)",
        diocesanActor("orgHrAdmin", { parishScopes: undefined }),
        "hr.ticket.read",
        ticket(LEAVE, OTHER_PERSON, undefined, LINKED),
        false,
      ),
    ],
  },
  {
    title: "Delegated categories and category scope",
    cases: [
      oc(
        "category not delegated by the parish",
        ORG_HR,
        "hr.ticket.read",
        ticket(CERTIFICATE, OTHER_PERSON, undefined, LINKED),
        false,
      ),
      oc(
        "parish delegates all categories (*)",
        ORG_HR,
        "hr.ticket.read",
        ticket(CERTIFICATE, OTHER_PERSON, undefined, LINKED_ALL),
        true,
      ),
      oc(
        "not delegated: absence details",
        ORG_HR,
        "hr.absence.viewDetails",
        categoryOf(CERTIFICATE, LINKED),
        false,
      ),
      oc(
        "delegated: absence details",
        ORG_HR,
        "hr.absence.viewDetails",
        categoryOf(LEAVE, LINKED),
        true,
      ),
      oc(
        "parish delegates nothing: ticket",
        ORG_HR,
        "hr.ticket.read",
        ticket(LEAVE, OTHER_PERSON, undefined, EMPTY_DELEGATION),
        false,
      ),
      oc(
        "parish delegates nothing: absence calendar",
        ORG_HR,
        "hr.absence.viewCalendar",
        { tenantId: EMPTY_DELEGATION },
        false,
      ),
      oc(
        "parish delegates nothing: report",
        ORG_HR,
        "hr.report.view",
        { tenantId: EMPTY_DELEGATION },
        false,
      ),
      oc(
        "parish delegates nothing: leave balance",
        ORG_HR,
        "hr.leaveBalance.view",
        { tenantId: EMPTY_DELEGATION, personId: OTHER_PERSON },
        false,
      ),
      oc(
        "parish delegates nothing: payroll export",
        ORG_HR,
        "hr.payroll.export",
        { tenantId: EMPTY_DELEGATION },
        false,
      ),
      oc(
        "category scope lists the category",
        diocesanActor("orgHrHandler", { categoryScopes: ["leave"] }),
        "hr.ticket.handle",
        ticket(LEAVE, OTHER_PERSON, undefined, LINKED),
        true,
      ),
      oc(
        "category scope lists only another category",
        diocesanActor("orgHrHandler", { categoryScopes: ["certificate"] }),
        "hr.ticket.handle",
        ticket(LEAVE, OTHER_PERSON, undefined, LINKED),
        false,
      ),
      oc(
        "category scope lists only another category: absence details",
        diocesanActor("orgHrHandler", { categoryScopes: ["certificate"] }),
        "hr.absence.viewDetails",
        categoryOf(LEAVE, LINKED),
        false,
      ),
      oc(
        "empty category scope",
        diocesanActor("orgHrHandler", { categoryScopes: [] }),
        "hr.ticket.read",
        ticket(LEAVE, OTHER_PERSON, undefined, LINKED),
        false,
      ),
      oc(
        "missing category scope (deny by default)",
        diocesanActor("orgHrHandler", { categoryScopes: undefined }),
        "hr.ticket.read",
        ticket(LEAVE, OTHER_PERSON, undefined, LINKED),
        false,
      ),
      oc(
        "category scope lists the category but the parish did not delegate it",
        diocesanActor("orgHrHandler", { categoryScopes: ["certificate"] }),
        "hr.ticket.read",
        ticket(CERTIFICATE, OTHER_PERSON, undefined, LINKED),
        false,
      ),
    ],
  },
  {
    title: "Confidential categories",
    cases: [
      oc(
        "orgHrAdmin on a delegated confidential category",
        ORG_HR,
        "hr.ticket.read",
        ticket(COMPLAINT, OTHER_PERSON, undefined, LINKED),
        false,
      ),
      oc(
        "orgHrHandler on a delegated confidential category",
        ORG_HANDLER,
        "hr.ticket.read",
        ticket(COMPLAINT, OTHER_PERSON, undefined, LINKED),
        false,
      ),
      oc(
        "orgConfidentialHandler on a delegated confidential category",
        ORG_CONF,
        "hr.ticket.read",
        ticket(COMPLAINT, OTHER_PERSON, undefined, LINKED),
        true,
      ),
      oc(
        "orgConfidentialHandler on a non-delegated confidential category",
        ORG_CONF,
        "hr.ticket.read",
        ticket(SAFEGUARDING, OTHER_PERSON, undefined, LINKED),
        false,
      ),
      oc(
        "orgConfidentialHandler, parish delegates all",
        ORG_CONF,
        "hr.ticket.read",
        ticket(SAFEGUARDING, OTHER_PERSON, undefined, LINKED_ALL),
        true,
      ),
      oc(
        "orgConfidentialHandler on a non-confidential category",
        ORG_CONF,
        "hr.ticket.read",
        ticket(LEAVE, OTHER_PERSON, undefined, LINKED),
        false,
      ),
      oc(
        "orgConfidentialHandler scoped to another category",
        diocesanActor("orgConfidentialHandler", { categoryScopes: ["safeguarding"] }),
        "hr.ticket.read",
        ticket(COMPLAINT, OTHER_PERSON, undefined, LINKED),
        false,
      ),
      oc(
        "orgConfidentialHandler, unlinked parish",
        ORG_CONF,
        "hr.ticket.read",
        ticket(COMPLAINT, OTHER_PERSON, undefined, UNLINKED),
        false,
      ),
      oc(
        "orgHrAdmin + orgConfidentialHandler: confidential ticket",
        diocesanActor(["orgHrAdmin", "orgConfidentialHandler"]),
        "hr.ticket.handle",
        ticket(COMPLAINT, OTHER_PERSON, undefined, LINKED),
        true,
      ),
      oc(
        "orgHrAdmin + orgConfidentialHandler: ordinary ticket",
        diocesanActor(["orgHrAdmin", "orgConfidentialHandler"]),
        "hr.ticket.handle",
        ticket(LEAVE, OTHER_PERSON, undefined, LINKED),
        true,
      ),
      oc(
        "orgHrHandler + orgConfidentialHandler: payroll export",
        diocesanActor(["orgHrHandler", "orgConfidentialHandler"]),
        "hr.payroll.export",
        { tenantId: LINKED },
        true,
      ),
      oc(
        "orgConfidentialHandler alone: payroll export",
        ORG_CONF,
        "hr.payroll.export",
        { tenantId: LINKED },
        false,
      ),
    ],
  },
  {
    title: "Handed-over tickets and portal administration",
    cases: [
      oc(
        "handed-over ticket: read",
        ORG_HR,
        "hr.ticket.read",
        ticket(LEAVE, OTHER_PERSON, true, LINKED),
        true,
      ),
      oc(
        "handed-over ticket: reply",
        ORG_HR,
        "hr.ticket.reply",
        ticket(LEAVE, OTHER_PERSON, true, LINKED),
        false,
      ),
      oc(
        "handed-over ticket: handle",
        ORG_HR,
        "hr.ticket.handle",
        ticket(LEAVE, OTHER_PERSON, true, LINKED),
        false,
      ),
      oc(
        "handed-over confidential ticket: read",
        ORG_CONF,
        "hr.ticket.read",
        ticket(COMPLAINT, OTHER_PERSON, true, LINKED),
        true,
      ),
      oc(
        "handed-over confidential ticket: handle",
        ORG_CONF,
        "hr.ticket.handle",
        ticket(COMPLAINT, OTHER_PERSON, true, LINKED),
        false,
      ),
      oc(
        "another organization: open portal",
        ORG_HR,
        "org.portal.open",
        { orgId: "org-other" },
        false,
      ),
      oc(
        "another organization: manage links",
        ORG_HR,
        "org.links.manage",
        { orgId: "org-other" },
        false,
      ),
      oc(
        "another organization: manage templates",
        ORG_HR,
        "hr.template.manage",
        { orgId: "org-other" },
        false,
      ),
      oc(
        "another organization: manage members",
        ORG_HR,
        "org.members.manage",
        { orgId: "org-other" },
        false,
      ),
      oc(
        "no organization role: open portal",
        diocesanActor([]),
        "org.portal.open",
        { orgId: ORG },
        false,
      ),
      oc(
        "no organization role: manage members",
        diocesanActor([]),
        "org.members.manage",
        { orgId: ORG },
        false,
      ),
      oc(
        "no organization role: absence calendar",
        diocesanActor([]),
        "hr.absence.viewCalendar",
        { tenantId: LINKED },
        false,
      ),
      oc(
        "no organization role: delegated ticket",
        diocesanActor([]),
        "hr.ticket.read",
        ticket(LEAVE, OTHER_PERSON, undefined, LINKED),
        false,
      ),
    ],
  },
];

// ---------------------------------------------------------------------------------------------
// D-52 AC3: five representative website + workspace combinations (additive)
// ---------------------------------------------------------------------------------------------

function chk<A extends Action>(
  label: string,
  action: A,
  resource: ResourceByAction[A],
  allowed: boolean,
): ComboCheck {
  return { label, action, resource, allowed };
}

const comboBase = {
  tenantId: TENANT,
  userId: "u-self",
  personId: SELF,
  memberTeamIds: [OWN_TEAM],
  directReportPersonIds: [REPORT],
} as const;

export const COMBOS: readonly Combo[] = [
  {
    title: "editor + employee",
    actor: tenantActor({ ...comboBase, websiteRoles: ["editor"], workspaceRoles: ["employee"] }),
    checks: [
      chk("news.publish (website, editor)", "news.publish", tenant, true),
      chk(
        "groupPage.edit of any group (website, editor)",
        "groupPage.edit",
        { tenantId: TENANT, groupId: OTHER_GROUP },
        true,
      ),
      chk("schedule.edit (website, office/admin only)", "schedule.edit", tenant, false),
      chk("site.appearance.edit (website, admin only)", "site.appearance.edit", tenant, false),
      chk("room.book, default room (workspace, employee)", "room.book", room(OWN_ROOM), true),
      chk(
        "calendarEvent.create staff-visible (workspace, employee)",
        "calendarEvent.create",
        event("staff"),
        true,
      ),
      chk(
        "calendarEvent.publish (leader only; editor does not help)",
        "calendarEvent.publish",
        tenant,
        false,
      ),
      chk("servicePlan.view, not assigned", "servicePlan.view", plan(OWN_TEAM), false),
      chk("servicePlan.view, assigned", "servicePlan.view", plan(OWN_TEAM, [SELF]), true),
      chk(
        "hr.ticket.approveAsManager, direct report",
        "hr.ticket.approveAsManager",
        ticket(LEAVE, REPORT),
        true,
      ),
      chk("hr.staffRecord.view (HR only)", "hr.staffRecord.view", hrPerson(OTHER_PERSON), false),
    ],
  },
  {
    title: "groupLeader (own group) + volunteer",
    actor: tenantActor({
      ...comboBase,
      websiteRoles: ["groupLeader"],
      workspaceRoles: ["volunteer"],
      groupIds: [OWN_GROUP],
    }),
    checks: [
      chk(
        "event.edit, own group (website, groupLeader)",
        "event.edit",
        { tenantId: TENANT, groupId: OWN_GROUP },
        true,
      ),
      chk(
        "event.edit, other group",
        "event.edit",
        { tenantId: TENANT, groupId: OTHER_GROUP },
        false,
      ),
      chk(
        "groupPage.edit, own group",
        "groupPage.edit",
        { tenantId: TENANT, groupId: OWN_GROUP },
        true,
      ),
      chk("news.create (editor and up)", "news.create", tenant, false),
      chk("room.book, default room (volunteers excluded)", "room.book", room(OWN_ROOM), false),
      chk("room.book, all_workspace room", "room.book", room(OWN_ROOM, "all_workspace"), true),
      chk("calendarEvent.create staff-visible", "calendarEvent.create", event("staff"), false),
      chk("calendarEvent.create private", "calendarEvent.create", event("private"), true),
      chk(
        "directory.viewPerson, person of an own team",
        "directory.viewPerson",
        person(OTHER_PERSON, [OWN_TEAM]),
        true,
      ),
      chk(
        "directory.viewPerson, person of another team",
        "directory.viewPerson",
        person(OTHER_PERSON, [OTHER_TEAM]),
        false,
      ),
      chk("servicePlan.view, own team", "servicePlan.view", plan(OWN_TEAM), true),
      chk(
        "hr.ticket.create, category for employees only",
        "hr.ticket.create",
        submit("employees"),
        false,
      ),
      chk(
        "hr.ticket.create, category enabled for volunteers",
        "hr.ticket.create",
        submit("volunteers"),
        true,
      ),
    ],
  },
  {
    title: "office + hrHandler (scoped to leave)",
    actor: tenantActor({
      ...comboBase,
      websiteRoles: ["office"],
      workspaceRoles: ["hrHandler"],
      hrCategoryIds: [LEAVE.id],
    }),
    checks: [
      chk("announcement.publish (website, office)", "announcement.publish", tenant, true),
      chk("pastoralRequest.read (website, office)", "pastoralRequest.read", tenant, true),
      chk("schedule.edit (website, office)", "schedule.edit", tenant, true),
      chk(
        "event.create in any group (website, office)",
        "event.create",
        { tenantId: TENANT, groupId: OTHER_GROUP },
        true,
      ),
      chk("news.create (editor and up)", "news.create", tenant, false),
      chk("hr.ticket.handle, leave", "hr.ticket.handle", ticket(LEAVE), true),
      chk("hr.ticket.handle, other category", "hr.ticket.handle", ticket(CERTIFICATE), false),
      chk("hr.ticket.read, confidential category", "hr.ticket.read", ticket(COMPLAINT), false),
      chk("hr.staffRecord.view", "hr.staffRecord.view", hrPerson(OTHER_PERSON), true),
      chk("room.book (hrHandler cannot book)", "room.book", room(OWN_ROOM, "all_workspace"), false),
      chk("calendarEvent.create staff-visible", "calendarEvent.create", event("staff"), false),
      chk("calendarEvent.create private", "calendarEvent.create", event("private"), true),
    ],
  },
  {
    title: "admin + leader + confidentialHandler (scoped to complaint)",
    actor: tenantActor({
      ...comboBase,
      websiteRoles: ["admin"],
      workspaceRoles: ["leader", "confidentialHandler"],
      confidentialCategoryIds: [COMPLAINT.id],
    }),
    checks: [
      chk("site.appearance.edit (website, admin)", "site.appearance.edit", tenant, true),
      chk("site.domain.manage (owner only)", "site.domain.manage", tenant, false),
      chk(
        "site.users.manage, editor target",
        "site.users.manage",
        { tenantId: TENANT, targetRoles: ["editor"] },
        true,
      ),
      chk(
        "site.users.manage, owner target",
        "site.users.manage",
        { tenantId: TENANT, targetRoles: ["owner"] },
        false,
      ),
      chk("calendarEvent.publish (workspace, leader)", "calendarEvent.publish", tenant, true),
      chk("booking.approve, any room (leader)", "booking.approve", room(OTHER_ROOM), true),
      chk("song.edit (leader)", "song.edit", tenant, true),
      chk(
        "hr.ticket.handle, scoped confidential category",
        "hr.ticket.handle",
        ticket(COMPLAINT),
        true,
      ),
      chk(
        "hr.ticket.handle, other confidential category",
        "hr.ticket.handle",
        ticket(SAFEGUARDING),
        false,
      ),
      chk(
        "hr.ticket.handle, ordinary category (leader gets nothing)",
        "hr.ticket.handle",
        ticket(LEAVE),
        false,
      ),
      chk(
        "hr.ticket.approveAsManager, direct report",
        "hr.ticket.approveAsManager",
        ticket(LEAVE, REPORT),
        true,
      ),
      chk(
        "hr.ticket.approveAsManager, confidential request",
        "hr.ticket.approveAsManager",
        ticket(COMPLAINT, REPORT),
        false,
      ),
      chk("hr.staffRecord.view (HR only)", "hr.staffRecord.view", hrPerson(OTHER_PERSON), false),
    ],
  },
  {
    title: "owner + teamLeader + roomManager",
    actor: tenantActor({
      ...comboBase,
      websiteRoles: ["owner"],
      workspaceRoles: ["teamLeader", "roomManager"],
      leadTeamIds: [OWN_TEAM],
      managedRoomIds: [OWN_ROOM],
    }),
    checks: [
      chk("site.delete (website, owner)", "site.delete", tenant, true),
      chk("page.publish (website, owner)", "page.publish", tenant, true),
      chk("servicePlan.edit, own team", "servicePlan.edit", plan(OWN_TEAM), true),
      chk("servicePlan.edit, other team", "servicePlan.edit", plan(OTHER_TEAM), false),
      chk("booking.approve, managed room", "booking.approve", room(OWN_ROOM), true),
      chk("booking.approve, other room", "booking.approve", room(OTHER_ROOM), false),
      chk(
        "calendarEvent.create team event, own team",
        "calendarEvent.create",
        event("team", OWN_TEAM),
        true,
      ),
      chk(
        "calendarEvent.create staff-visible (roomManager)",
        "calendarEvent.create",
        event("staff"),
        true,
      ),
      chk(
        "calendarEvent.publish (website owner is no workspace leader)",
        "calendarEvent.publish",
        tenant,
        false,
      ),
      chk("song.edit (no music role)", "song.edit", tenant, false),
      chk(
        "hr.ticket.approveAsManager (neither leader nor employee)",
        "hr.ticket.approveAsManager",
        ticket(LEAVE, REPORT),
        false,
      ),
    ],
  },
];

// ---------------------------------------------------------------------------------------------
// MATRIX.md
// ---------------------------------------------------------------------------------------------

type Align = "l" | "c";

/** Formats a table byte-for-byte like Prettier does, so `pnpm format` never rewrites MATRIX.md. */
function table(header: string[], rows: string[][], align: Align[]): string {
  const widths = header.map((h, i) =>
    Math.max(3, h.length, ...rows.map((row) => (row[i] ?? "").length)),
  );
  const pad = (text: string, i: number): string => {
    const width = widths[i] ?? 3;
    const gap = width - text.length;
    if (align[i] === "c") {
      const left = Math.floor(gap / 2);
      return " ".repeat(left) + text + " ".repeat(gap - left);
    }
    return text + " ".repeat(gap);
  };
  const line = (cells: string[]) => `| ${cells.map(pad).join(" | ")} |`;
  const separator = widths.map((w, i) =>
    align[i] === "c" ? `:${"-".repeat(w - 2)}:` : "-".repeat(w),
  );
  return [line(header), `| ${separator.join(" | ")} |`, ...rows.map(line)].join("\n");
}

const mark = (flag: boolean | string, index: number): string =>
  typeof flag === "string" ? (flag[index] === "Y" ? "✔" : "–") : flag ? "✔" : "–";

const code = (text: string) => `\`${text}\``;

const WS_HEADER = ["L", "E", "V", "TL", "ML", "RM", "HR", "CH"];
const ORG_HEADER = ["orgHrAdmin", "orgHrHandler", "orgConfidentialHandler"];

function variantTable(rows: readonly MatrixRow[], roleCount: number, header: string[]): string {
  const body: string[][] = [];
  for (const row of rows) {
    for (const variant of row.variants) {
      body.push([
        row.capability,
        variant.label,
        code(variant.action),
        ...Array.from({ length: roleCount }, (_, i) => mark(variant.allowed, i)),
      ]);
    }
  }
  return table(["Capability", "Check", "Action", ...header], body, [
    "l",
    "l",
    "l",
    ...header.map((): Align => "c"),
  ]);
}

function sddTable(rows: readonly MatrixRow[], header: string[]): string {
  return table(
    ["Capability", ...header],
    rows.map((row) => [row.capability, ...row.sdd]),
    ["l", ...header.map((): Align => "c")],
  );
}

function scopeTable<A>(group: ScopeGroup<A>): string {
  return table(
    ["Check", "Action", "Allowed"],
    group.cases.map((entry) => [entry.label, code(entry.action), mark(entry.allowed, 0)]),
    ["l", "l", "c"],
  );
}

/** The reviewer-readable matrix, rendered from the same tables the tests run. */
export function renderMatrixMarkdown(): string {
  const parts: string[] = [
    "# Role matrix (D-52)",
    [
      "<!-- GENERATED by src/role-matrix.test.ts from src/role-matrix.fixtures.ts. Do not edit by hand:",
      "regenerate with `pnpm --filter @churchy/policy matrix`. -->",
    ].join("\n"),
    [
      "Every row below is asserted against `can()` by `src/role-matrix.test.ts`. The expectations are",
      "transcribed by hand from SDD §21.2 (workspace roles), §25.4 (confidential tickets) and §25.7",
      "(diocesan roles), plus the resolved ambiguities in [README.md](README.md).",
      "",
      "✔ = allowed, – = denied. Scoped roles are checked with an in-scope resource here; the scope",
      "boundaries (other team, other room, other category, ...) are listed in the boundary sections.",
    ].join("\n"),
    "## 1. Workspace roles: the SDD §21.2 table as written",
    "L = leader (Vezető), E = employee (Munkatárs), V = volunteer (Önkéntes), TL = teamLeader, ML = musicLeader, RM = roomManager (Teremfelelős), HR = hrHandler, CH = confidentialHandler.",
    sddTable(SDD_ROWS, WS_HEADER),
    "## 2. Workspace roles: concrete checks per SDD row (15 rows x 8 roles = 120 cells)",
    "A cell passes only when every check of its row gives the result shown for that role.",
    variantTable(SDD_ROWS, WS_ROLES.length, WS_HEADER),
    "## 3. Workspace roles: cells decided by the README",
    "These capabilities are not rows of the SDD table; the README documents the resolved ambiguity.",
    variantTable(README_ROWS, WS_ROLES.length, WS_HEADER),
    "## 4. Workspace scope boundaries",
    ...WORKSPACE_SCOPE_GROUPS.flatMap((group) => [`### ${group.title}`, scopeTable(group)]),
    "## 5. Organization roles (SDD §25.7)",
    "Every HR check needs an active link, the parish in `parishScopes`, and, for category-bound data, a category delegated by the parish and within `categoryScopes`.",
    sddTable(ORG_ROWS, ORG_HEADER),
    "### Concrete checks per row",
    variantTable(ORG_ROWS, ORG_ROLES_ORDER.length, ORG_HEADER),
    "## 6. Organization scope boundaries",
    ...ORG_SCOPE_GROUPS.flatMap((group) => [`### ${group.title}`, scopeTable(group)]),
    "## 7. Hard exclusions",
    [
      "- Leader (Vezető) never reaches confidential tickets, with or without HR roles, with any",
      "  website role and any scope (only the requester and a scoped confidentialHandler do).",
      "- Platform actors and support access (`impersonatedBy`) are denied every `hr.*` action,",
      "  including the impersonated user's own tickets.",
      "- Organization roles are denied every website and workspace action in the vocabulary.",
      "- Tenant actors are denied every organization action.",
    ].join("\n"),
    "## 8. Website + workspace role combinations (additive)",
    ...COMBOS.flatMap((combo) => [
      `### ${combo.title}`,
      table(
        ["Check", "Action", "Allowed"],
        combo.checks.map((entry) => [entry.label, code(entry.action), mark(entry.allowed, 0)]),
        ["l", "l", "c"],
      ),
    ]),
  ];
  return `${parts.join("\n\n")}\n`;
}
