import { describe, expect, it } from "vitest";
import type { Action, HrCategoryRef, HrTicketResource } from "./actions";
import { ACTIONS, ORG_ACTIONS } from "./actions";
import {
  CERTIFICATE,
  COMPLAINT,
  EMPTY_DELEGATION,
  LEAVE,
  LINKED,
  LINKED_ALL,
  ORG,
  REQUESTED,
  REVOKED,
  SAFEGUARDING,
  UNLINKED,
  diocesanActor,
  workspaceActor,
} from "./policy.fixtures";
import { can, explain } from "./policy";
import type { OrgRole } from "./roles";
import { ORG_ROLES } from "./roles";

const ticket = (
  tenantId: string,
  category: HrCategoryRef,
  handedOver?: boolean,
): HrTicketResource => ({
  tenantId,
  category,
  requesterPersonId: "p-parish-employee",
  handedOver,
});

/*
 * SDD §25.7 organization roles. Fixture links: LINKED delegates [leave, complaint];
 * LINKED_ALL delegates "*"; REQUESTED / REVOKED are not active; UNLINKED is not linked at all;
 * EMPTY_DELEGATION is active but delegates nothing.
 */
// prettier-ignore
const ORG_ROWS: { cell: string; action: Action; resource: unknown; expected: string }[] = [
  //                                                                                                            admin handler confidential
  { cell: "Handle delegated ticket",                    action: "hr.ticket.handle",  resource: ticket(LINKED, LEAVE),           expected: "YYN" },
  { cell: "Read delegated ticket",                      action: "hr.ticket.read",    resource: ticket(LINKED, LEAVE),           expected: "YYN" },
  { cell: "Reply to delegated ticket",                  action: "hr.ticket.reply",   resource: ticket(LINKED, LEAVE),           expected: "YYN" },
  { cell: "Ticket of a non-delegated category",         action: "hr.ticket.read",    resource: ticket(LINKED, CERTIFICATE),     expected: "NNN" },
  { cell: "Ticket in a parish delegating all HR",       action: "hr.ticket.read",    resource: ticket(LINKED_ALL, CERTIFICATE), expected: "YYN" },
  { cell: "Ticket in an unlinked parish",               action: "hr.ticket.read",    resource: ticket(UNLINKED, LEAVE),         expected: "NNN" },
  { cell: "Ticket in a parish with a requested link",   action: "hr.ticket.read",    resource: ticket(REQUESTED, LEAVE),        expected: "NNN" },
  { cell: "Ticket in a parish with a revoked link",     action: "hr.ticket.read",    resource: ticket(REVOKED, LEAVE),          expected: "NNN" },
  { cell: "Delegated confidential ticket",              action: "hr.ticket.handle",  resource: ticket(LINKED, COMPLAINT),       expected: "NNY" },
  { cell: "Non-delegated confidential ticket",          action: "hr.ticket.read",    resource: ticket(LINKED, SAFEGUARDING),    expected: "NNN" },
  { cell: "Confidential ticket, parish delegates all",  action: "hr.ticket.read",    resource: ticket(LINKED_ALL, SAFEGUARDING),expected: "NNY" },
  { cell: "Confidential ticket, unlinked parish",       action: "hr.ticket.read",    resource: ticket(UNLINKED, COMPLAINT),     expected: "NNN" },
  { cell: "Absence details (delegated)",                action: "hr.absence.viewDetails",  resource: { tenantId: LINKED, category: LEAVE },       expected: "YYN" },
  { cell: "Absence details (non-delegated)",            action: "hr.absence.viewDetails",  resource: { tenantId: LINKED, category: CERTIFICATE }, expected: "NNN" },
  { cell: "Absence details (confidential, delegated)",  action: "hr.absence.viewDetails",  resource: { tenantId: LINKED, category: COMPLAINT },   expected: "NNY" },
  { cell: "Absence calendar (linked)",                  action: "hr.absence.viewCalendar", resource: { tenantId: LINKED },           expected: "YYY" },
  { cell: "Absence calendar (nothing delegated)",       action: "hr.absence.viewCalendar", resource: { tenantId: EMPTY_DELEGATION }, expected: "NNN" },
  { cell: "Absence calendar (unlinked)",                action: "hr.absence.viewCalendar", resource: { tenantId: UNLINKED },         expected: "NNN" },
  { cell: "Leave balances (linked)",                    action: "hr.leaveBalance.view",    resource: { tenantId: LINKED, personId: "p-x" }, expected: "YYN" },
  { cell: "Payroll export (linked)",                    action: "hr.payroll.export",       resource: { tenantId: LINKED_ALL },       expected: "YYN" },
  { cell: "Payroll export (nothing delegated)",         action: "hr.payroll.export",       resource: { tenantId: EMPTY_DELEGATION }, expected: "NNN" },
  { cell: "Reports (linked)",                           action: "hr.report.view",          resource: { tenantId: LINKED },           expected: "YYN" },
  { cell: "Reports (revoked)",                          action: "hr.report.view",          resource: { tenantId: REVOKED },          expected: "NNN" },
  { cell: "Open the diocesan portal",                   action: "org.portal.open",    resource: { orgId: ORG }, expected: "YYY" },
  { cell: "HR category templates (Sablonok)",           action: "hr.template.manage", resource: { orgId: ORG }, expected: "YNN" },
  { cell: "Parish links (Plébániák)",                   action: "org.links.manage",   resource: { orgId: ORG }, expected: "YNN" },
  { cell: "Organization members",                       action: "org.members.manage", resource: { orgId: ORG }, expected: "YNN" },
  { cell: "Templates of another organization",          action: "hr.template.manage", resource: { orgId: "org-masik" }, expected: "NNN" },
  { cell: "Submit HR request in a parish",              action: "hr.ticket.create",   resource: { tenantId: LINKED, category: { ...LEAVE, whoCanSubmit: "all" } }, expected: "NNN" },
  { cell: "Approve as manager",                         action: "hr.ticket.approveAsManager", resource: ticket(LINKED, LEAVE), expected: "NNN" },
  { cell: "Parish staff records",                       action: "hr.staffRecord.view",   resource: { tenantId: LINKED_ALL, personId: "p-x" }, expected: "NNN" },
  { cell: "Parish leave balance management",            action: "hr.leaveBalance.manage", resource: { tenantId: LINKED_ALL, personId: "p-x" }, expected: "NNN" },
];

describe("SDD §25.7 organization roles", () => {
  const cases = ORG_ROWS.flatMap((row) =>
    ORG_ROLES.map((role: OrgRole, i) => ({
      name: `${row.cell} | ${role} ${row.expected[i] === "Y" ? "✔" : "✘"}`,
      role,
      row,
      allowed: row.expected[i] === "Y",
    })),
  );

  it.each(cases)("$name", ({ role, row, allowed }) => {
    expect(can(diocesanActor(role), row.action, row.resource as never)).toBe(allowed);
  });
});

describe("organization actors have NOTHING outside delegated HR", () => {
  const admin = diocesanActor([...ORG_ROLES]);
  const nonHr = ACTIONS.filter(
    (action) => !action.startsWith("hr.") && !ORG_ACTIONS.includes(action as never),
  );

  it.each(nonHr)("all org roles ✘ %s on a parish delegating all HR", (action) => {
    const resource = {
      tenantId: LINKED_ALL,
      targetRoles: [],
      groupId: null,
      personId: "p-x",
      teamIds: [],
      visibility: "private",
      teamId: "team-x",
      roomId: "room-x",
      whoCanRequest: "all_workspace",
      assignedPersonIds: [],
    };
    expect(explain(admin, action, resource as never)).toEqual({
      allowed: false,
      reason: "organization actors may only access delegated HR data",
    });
  });
});

describe("organization membership scopes", () => {
  it("category scopes restrict delegated categories", () => {
    const actor = diocesanActor("orgHrHandler", { categoryScopes: ["certificate"] });
    expect(explain(actor, "hr.ticket.read", ticket(LINKED, LEAVE))).toEqual({
      allowed: false,
      reason: "category is outside the actor's scope",
    });
    expect(can(actor, "hr.ticket.read", ticket(LINKED_ALL, CERTIFICATE))).toBe(true);
  });

  it("parish scopes restrict linked parishes", () => {
    const actor = diocesanActor("orgHrHandler", { parishScopes: [LINKED_ALL] });
    expect(explain(actor, "hr.ticket.read", ticket(LINKED, LEAVE))).toEqual({
      allowed: false,
      reason: "parish is outside the actor's scope",
    });
    expect(can(actor, "hr.ticket.read", ticket(LINKED_ALL, LEAVE))).toBe(true);
  });

  it("missing scopes and links deny everything (deny by default)", () => {
    expect(
      can(
        diocesanActor("orgHrAdmin", { categoryScopes: undefined }),
        "hr.ticket.read",
        ticket(LINKED, LEAVE),
      ),
    ).toBe(false);
    expect(
      can(diocesanActor("orgHrAdmin", { parishScopes: undefined }), "hr.report.view", {
        tenantId: LINKED,
      }),
    ).toBe(false);
    expect(
      can(diocesanActor("orgHrAdmin", { links: undefined }), "hr.report.view", {
        tenantId: LINKED,
      }),
    ).toBe(false);
  });

  it("explains link denials", () => {
    const actor = diocesanActor("orgHrAdmin");
    expect(explain(actor, "hr.report.view", { tenantId: UNLINKED }).reason).toBe(
      "parish is not linked to the organization",
    );
    expect(explain(actor, "hr.report.view", { tenantId: REVOKED }).reason).toBe(
      "parish link is revoked",
    );
    expect(explain(actor, "hr.ticket.read", ticket(LINKED, CERTIFICATE)).reason).toBe(
      "category is not delegated to the organization",
    );
  });

  it("an org actor without roles cannot open the portal or see absences", () => {
    const actor = diocesanActor([]);
    expect(can(actor, "org.portal.open", { orgId: ORG })).toBe(false);
    expect(can(actor, "hr.absence.viewCalendar", { tenantId: LINKED })).toBe(false);
  });

  it("delegated tickets that were handed over are read-only for the diocese", () => {
    const actor = diocesanActor("orgConfidentialHandler");
    expect(can(actor, "hr.ticket.read", ticket(LINKED, COMPLAINT, true))).toBe(true);
    expect(can(actor, "hr.ticket.handle", ticket(LINKED, COMPLAINT, true))).toBe(false);
  });

  it("a tenant actor cannot perform organization actions", () => {
    const owner = workspaceActor("leader", { websiteRoles: ["owner"] });
    expect(explain(owner, "org.portal.open", { orgId: ORG })).toEqual({
      allowed: false,
      reason: "organization resources are not available in a tenant context",
    });
  });
});
