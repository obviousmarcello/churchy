import { describe, expect, it } from "vitest";
import type { Action, HrCategoryRef, HrTicketResource } from "./actions";
import { HR_ACTIONS } from "./actions";
import { evaluateHrTenant } from "./hr";
import {
  CERTIFICATE,
  COMPLAINT,
  LEAVE,
  OTHER_PERSON,
  REPORT,
  SAFEGUARDING,
  SELF,
  TENANT,
  websiteActor,
  workspaceActor,
} from "./policy.fixtures";
import { can, explain } from "./policy";
import type { WorkspaceRole } from "./roles";
import { WORKSPACE_ROLES } from "./roles";

const ticket = (
  category: HrCategoryRef,
  requesterPersonId: string | null = OTHER_PERSON,
  handedOver?: boolean,
): HrTicketResource => ({ tenantId: TENANT, category, requesterPersonId, handedOver });

const submit = (whoCanSubmit: "employees" | "volunteers" | "all", category = LEAVE) => ({
  tenantId: TENANT,
  category: { ...category, whoCanSubmit },
});

const person = (personId: string) => ({ tenantId: TENANT, personId });

/** Every HR action with a resource in the given category (requested by OTHER_PERSON). */
function everyHrCheck(category: HrCategoryRef): [Action, never][] {
  return HR_ACTIONS.filter((action) => action !== "hr.template.manage").map((action) => {
    switch (action) {
      case "hr.ticket.create":
        return [action, submit("all", category) as never];
      case "hr.staffRecord.view":
      case "hr.staffRecord.edit":
      case "hr.leaveBalance.view":
      case "hr.leaveBalance.manage":
        return [action, person(OTHER_PERSON) as never];
      case "hr.payroll.export":
      case "hr.report.view":
      case "hr.absence.viewCalendar":
        return [action, { tenantId: TENANT } as never];
      default:
        return [action, ticket(category) as never];
    }
  });
}

/*
 * SDD §21.2 HR rows — one test per role and row (L E V TL ML RM HR CH order).
 * Fixture scopes: hrHandler → LEAVE; confidentialHandler → COMPLAINT; REPORT reports to the actor.
 */
// prettier-ignore
const HR_ROWS: { cell: string; action: Action; resource: unknown; expected: string }[] = [
  { cell: "Submit HR requests (all)",            action: "hr.ticket.create",           resource: submit("all"),        expected: "YYYYYYYY" },
  { cell: "Submit HR requests (volunteers)",     action: "hr.ticket.create",           resource: submit("volunteers"), expected: "YYYYYYYY" },
  { cell: "Submit HR requests (employees only)", action: "hr.ticket.create",           resource: submit("employees"),  expected: "YYNYYYYY" },
  { cell: "Approve as manager (direct report)",  action: "hr.ticket.approveAsManager", resource: ticket(LEAVE, REPORT), expected: "YYNNNNNN" },
  { cell: "Approve as manager (not a report)",   action: "hr.ticket.approveAsManager", resource: ticket(LEAVE),         expected: "NNNNNNNN" },
  { cell: "Handle HR tickets (scoped category)", action: "hr.ticket.handle",           resource: ticket(LEAVE),         expected: "NNNNNNYN" },
  { cell: "Handle HR tickets (other category)",  action: "hr.ticket.handle",           resource: ticket(CERTIFICATE),   expected: "NNNNNNNN" },
  { cell: "Read HR tickets (scoped category)",   action: "hr.ticket.read",             resource: ticket(LEAVE),         expected: "NNNNNNYN" },
  { cell: "Handle confidential (scoped)",        action: "hr.ticket.handle",           resource: ticket(COMPLAINT),     expected: "NNNNNNNY" },
  { cell: "Read confidential (scoped)",          action: "hr.ticket.read",             resource: ticket(COMPLAINT),     expected: "NNNNNNNY" },
  { cell: "Handle confidential (other category)",action: "hr.ticket.handle",           resource: ticket(SAFEGUARDING),  expected: "NNNNNNNN" },
  { cell: "Staff records: view",                 action: "hr.staffRecord.view",        resource: person(OTHER_PERSON),  expected: "NNNNNNYN" },
  { cell: "Staff records: edit",                 action: "hr.staffRecord.edit",        resource: person(OTHER_PERSON),  expected: "NNNNNNYN" },
  { cell: "Balances: manage",                    action: "hr.leaveBalance.manage",     resource: person(OTHER_PERSON),  expected: "NNNNNNYN" },
  { cell: "Balances: view another person",       action: "hr.leaveBalance.view",       resource: person(OTHER_PERSON),  expected: "NNNNNNYN" },
  { cell: "Balances: view own",                  action: "hr.leaveBalance.view",       resource: person(SELF),          expected: "YYYYYYYY" },
  { cell: "Payroll export",                      action: "hr.payroll.export",          resource: { tenantId: TENANT },  expected: "NNNNNNYN" },
  { cell: "HR dashboard / reports",              action: "hr.report.view",             resource: { tenantId: TENANT },  expected: "NNNNNNYN" },
  { cell: "Absence details (scoped category)",   action: "hr.absence.viewDetails",     resource: { tenantId: TENANT, category: LEAVE },     expected: "NNNNNNYN" },
  { cell: "Absence details (confidential)",      action: "hr.absence.viewDetails",     resource: { tenantId: TENANT, category: COMPLAINT }, expected: "NNNNNNNY" },
  { cell: "Absence calendar („Távol”)",          action: "hr.absence.viewCalendar",    resource: { tenantId: TENANT },  expected: "YYYYYYYY" },
];

describe("SDD §21.2 HR rows (tenant)", () => {
  const cases = HR_ROWS.flatMap((row) =>
    WORKSPACE_ROLES.map((role: WorkspaceRole, i) => ({
      name: `${row.cell} | ${role} ${row.expected[i] === "Y" ? "✔" : "✘"}`,
      role,
      row,
      allowed: row.expected[i] === "Y",
    })),
  );

  it.each(cases)("$name", ({ role, row, allowed }) => {
    expect(can(workspaceActor(role), row.action, row.resource as never)).toBe(allowed);
  });
});

describe("HR handler scopes", () => {
  it('hrHandler with "*" handles every non-confidential category but no confidential one', () => {
    const actor = workspaceActor("hrHandler", { hrCategoryIds: "*" });
    expect(can(actor, "hr.ticket.handle", ticket(CERTIFICATE))).toBe(true);
    expect(can(actor, "hr.ticket.handle", ticket(COMPLAINT))).toBe(false);
  });

  it("hrHandler whose scope lists a confidential category id still cannot handle it", () => {
    const actor = workspaceActor("hrHandler", { hrCategoryIds: [COMPLAINT.id] });
    expect(can(actor, "hr.ticket.read", ticket(COMPLAINT))).toBe(false);
  });

  it("hrHandler with no scope handles nothing (deny by default)", () => {
    const actor = workspaceActor("hrHandler", { hrCategoryIds: undefined });
    expect(can(actor, "hr.ticket.read", ticket(LEAVE))).toBe(false);
  });

  it("confidentialHandler without scope handles no confidential category", () => {
    const actor = workspaceActor("confidentialHandler", { confidentialCategoryIds: undefined });
    expect(can(actor, "hr.ticket.read", ticket(COMPLAINT))).toBe(false);
  });

  it("confidentialHandler does not handle non-confidential categories", () => {
    const actor = workspaceActor("confidentialHandler", { confidentialCategoryIds: [LEAVE.id] });
    expect(can(actor, "hr.ticket.read", ticket(LEAVE))).toBe(false);
  });
});

describe("requester access", () => {
  it.each(["volunteer", "employee", "leader"] as const)(
    "%s may read and reply to an own confidential ticket but not handle it",
    (role) => {
      const own = ticket(COMPLAINT, SELF);
      expect(can(workspaceActor(role), "hr.ticket.read", own)).toBe(true);
      expect(can(workspaceActor(role), "hr.ticket.reply", own)).toBe(true);
      expect(can(workspaceActor(role), "hr.ticket.handle", own)).toBe(false);
    },
  );

  it("anonymous tickets have no requester to match", () => {
    expect(
      can(workspaceActor("employee", { personId: null }), "hr.ticket.read", ticket(LEAVE, null)),
    ).toBe(false);
  });

  it("a handed-over ticket is read-only", () => {
    const handedOver = ticket(COMPLAINT, SELF, true);
    const handler = workspaceActor("confidentialHandler");
    expect(can(handler, "hr.ticket.read", handedOver)).toBe(true);
    expect(can(handler, "hr.ticket.handle", handedOver)).toBe(false);
    expect(can(workspaceActor("employee"), "hr.ticket.reply", handedOver)).toBe(false);
  });
});

describe("manager approval", () => {
  it("nobody approves their own request", () => {
    const actor = workspaceActor("leader", { directReportPersonIds: [SELF] });
    expect(explain(actor, "hr.ticket.approveAsManager", ticket(LEAVE, SELF))).toEqual({
      allowed: false,
      reason: "may not approve own request",
    });
  });

  it("anonymous tickets are never approved by a manager", () => {
    expect(can(workspaceActor("leader"), "hr.ticket.approveAsManager", ticket(LEAVE, null))).toBe(
      false,
    );
  });

  it("an actor without direct reports approves nothing", () => {
    const actor = workspaceActor("employee", { directReportPersonIds: undefined });
    expect(can(actor, "hr.ticket.approveAsManager", ticket(LEAVE, REPORT))).toBe(false);
  });
});

describe("hard exclusion: confidential HR is denied to leader (Vezető)", () => {
  it.each(
    everyHrCheck(COMPLAINT).filter(
      ([action]) => action.startsWith("hr.ticket.") && action !== "hr.ticket.create",
    ),
  )("leader ✘ %s on a confidential ticket", (action, resource) => {
    expect(can(workspaceActor("leader"), action, resource)).toBe(false);
  });

  it("leader ✘ confidential ticket of a direct report (no manager route)", () => {
    expect(
      explain(workspaceActor("leader"), "hr.ticket.approveAsManager", ticket(COMPLAINT, REPORT)),
    ).toEqual({
      allowed: false,
      reason: "confidential tickets are never routed to managers",
    });
  });

  it("leader ✘ confidential absence details", () => {
    expect(
      can(workspaceActor("leader"), "hr.absence.viewDetails", {
        tenantId: TENANT,
        category: COMPLAINT,
      }),
    ).toBe(false);
  });

  it("leader + hrHandler with every category still ✘ confidential", () => {
    const actor = workspaceActor(["leader", "hrHandler"], { hrCategoryIds: "*" });
    expect(can(actor, "hr.ticket.read", ticket(COMPLAINT))).toBe(false);
    expect(can(actor, "hr.ticket.read", ticket(LEAVE))).toBe(true);
  });
});

describe("hard exclusion: platform / support access is denied all HR", () => {
  const impersonated = workspaceActor(["hrHandler", "confidentialHandler", "leader"], {
    hrCategoryIds: "*",
    confidentialCategoryIds: [COMPLAINT.id],
    impersonatedBy: "u-platform-operator",
  });

  it.each([...everyHrCheck(LEAVE), ...everyHrCheck(COMPLAINT)])(
    "support access ✘ %s",
    (action, resource) => {
      expect(explain(impersonated, action, resource)).toEqual({
        allowed: false,
        reason: "platform support access is excluded from HR",
      });
    },
  );

  it("support access is denied even the impersonated user's own tickets", () => {
    expect(can(impersonated, "hr.ticket.read", ticket(COMPLAINT, SELF))).toBe(false);
  });

  it("support access keeps non-HR capabilities of the impersonated user", () => {
    expect(can(impersonated, "booking.approve", { tenantId: TENANT, roomId: "room-x" })).toBe(true);
  });

  it("the same actor without impersonation can handle HR (control)", () => {
    const { impersonatedBy: _ignored, ...plain } = impersonated;
    expect(can(plain, "hr.ticket.read", ticket(COMPLAINT))).toBe(true);
  });
});

describe("tenant HR edge cases", () => {
  it("an actor with only website roles cannot submit HR requests", () => {
    expect(explain(websiteActor("owner"), "hr.ticket.create", submit("all"))).toEqual({
      allowed: false,
      reason: "submitting HR requests requires a workspace role",
    });
    expect(can(websiteActor("owner"), "hr.absence.viewCalendar", { tenantId: TENANT })).toBe(false);
    expect(can(websiteActor("owner"), "hr.leaveBalance.view", person(SELF))).toBe(false);
  });

  it("an actor without a person record has no own balance", () => {
    expect(
      can(workspaceActor("employee", { personId: null }), "hr.leaveBalance.view", person(SELF)),
    ).toBe(false);
  });

  it("evaluateHrTenant denies HR actions that only exist for organizations", () => {
    expect(
      evaluateHrTenant(workspaceActor("hrHandler"), "hr.template.manage", { orgId: "o" }).allowed,
    ).toBe(false);
  });
});
