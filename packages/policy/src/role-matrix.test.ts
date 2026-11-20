/// <reference types="node" />
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Action } from "./actions";
import {
  ACTIONS,
  HR_ACTIONS,
  ORG_ACTIONS,
  WEBSITE_ACTIONS,
  WORKSPACE_ACTIONS,
  isHrAction,
} from "./actions";
import type { Actor } from "./actor";
import { tenantActor } from "./actor";
import {
  COMPLAINT,
  LEAVE,
  LINKED_ALL,
  ORG,
  OTHER_TENANT,
  OWN_GROUP,
  OWN_ROOM,
  OWN_TEAM,
  REPORT,
  SAFEGUARDING,
  SELF,
  TENANT,
  diocesanActor,
  workspaceActor,
} from "./policy.fixtures";
import { can, explain } from "./policy";
import { ORG_ROLES, WEBSITE_ROLES, WORKSPACE_ROLES } from "./roles";
import type { MatrixRow, ScopeGroup } from "./role-matrix.fixtures";
import {
  COMBOS,
  ORG_ROLES_ORDER,
  ORG_ROWS,
  ORG_SCOPE_GROUPS,
  OTHER_PERSON,
  README_ROWS,
  SDD_ROWS,
  WORKSPACE_SCOPE_GROUPS,
  WS_ROLES,
  renderMatrixMarkdown,
} from "./role-matrix.fixtures";

/*
 * D-52. All expectations live in role-matrix.fixtures.ts, transcribed by hand from the SDD and the
 * README; this file only runs them. A "cell" is one (capability row, role) pair of the SDD tables.
 * A cell passes when EVERY concrete check of the row gives the expected result for that role.
 */

const as = (resource: unknown) => resource as never;

/** Runs the concrete checks of one matrix row for one role column. */
function expectCell(
  row: MatrixRow,
  index: number,
  actor: Actor,
  report: (check: string) => string = (check) => check,
) {
  for (const variant of row.variants) {
    const expected = variant.allowed[index] === "Y";
    const decision = explain(actor, variant.action, as(variant.resource));
    expect(
      decision.allowed,
      report(`${variant.label} [${variant.action}]: ${decision.reason}`),
    ).toBe(expected);
  }
}

function describeCells(title: string, rows: readonly MatrixRow[]) {
  describe(title, () => {
    for (const row of rows) {
      describe(row.capability, () => {
        for (const [index, role] of WS_ROLES.entries()) {
          const sdd = row.sdd[index] ?? "";
          it(`${role}: ${sdd === "" ? "(blank)" : sdd}`, () => {
            expectCell(row, index, workspaceActor(role));
          });
        }
      });
    }
  });
}

describe("matrix tables are well-formed", () => {
  it.each([...SDD_ROWS, ...README_ROWS])(
    "$capability has 8 SDD cells and 8-column results",
    (row) => {
      expect(row.sdd).toHaveLength(WS_ROLES.length);
      for (const variant of row.variants) expect(variant.allowed).toMatch(/^[YN]{8}$/);
    },
  );

  it.each(ORG_ROWS)("$capability has 3 SDD cells and 3-column results", (row) => {
    expect(row.sdd).toHaveLength(ORG_ROLES_ORDER.length);
    for (const variant of row.variants) expect(variant.allowed).toMatch(/^[YN]{3}$/);
  });

  it("the SDD §21.2 table has 15 capability rows and 8 role columns", () => {
    expect(SDD_ROWS).toHaveLength(15);
    expect(WS_ROLES).toEqual(WORKSPACE_ROLES);
  });

  it("the organization table has 7 capability rows and 3 role columns", () => {
    expect(ORG_ROWS).toHaveLength(7);
    expect(ORG_ROLES_ORDER).toEqual(ORG_ROLES);
  });

  it("every non-diocesan workspace and HR action is covered by a matrix variant", () => {
    const covered = new Set<Action>(
      [...SDD_ROWS, ...README_ROWS].flatMap((row) => row.variants.map((variant) => variant.action)),
    );
    const expected = [...WORKSPACE_ACTIONS, ...HR_ACTIONS].filter(
      (action) => action !== "hr.template.manage",
    );
    expect(expected.filter((action) => !covered.has(action))).toEqual([]);
  });

  it("every organization-facing action is covered by an organization variant", () => {
    const covered = new Set<Action>(
      ORG_ROWS.flatMap((row) => row.variants.map((variant) => variant.action)),
    );
    expect(ORG_ACTIONS.filter((action) => !covered.has(action))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// One test per cell: SDD §21.2 (15 rows x 8 roles), then README-resolved cells
// ---------------------------------------------------------------------------------------------

describeCells("SDD §21.2 workspace matrix, one test per cell", SDD_ROWS);
describeCells("README-resolved workspace cells, one test per cell", README_ROWS);

// ---------------------------------------------------------------------------------------------
// Scope boundaries
// ---------------------------------------------------------------------------------------------

function describeScopes<A extends Actor>(title: string, groups: readonly ScopeGroup<A>[]) {
  describe(title, () => {
    for (const group of groups) {
      describe(group.title, () => {
        for (const entry of group.cases) {
          it(`${entry.label} -> ${entry.allowed ? "allowed" : "denied"}`, () => {
            const decision = explain(entry.actor, entry.action, as(entry.resource));
            expect(decision.allowed, `${entry.action}: ${decision.reason}`).toBe(entry.allowed);
          });
        }
      });
    }
  });
}

describeScopes("workspace scope boundaries", WORKSPACE_SCOPE_GROUPS);

// ---------------------------------------------------------------------------------------------
// Organization roles (SDD §25.7)
// ---------------------------------------------------------------------------------------------

describe("organization roles (SDD §25.7), one test per cell", () => {
  for (const row of ORG_ROWS) {
    describe(row.capability, () => {
      for (const [index, role] of ORG_ROLES_ORDER.entries()) {
        const sdd = row.sdd[index] ?? "";
        it(`${role}: ${sdd === "" ? "(blank)" : sdd}`, () => {
          expectCell(row, index, diocesanActor(role));
        });
      }
    });
  }
});

describeScopes("organization scope boundaries", ORG_SCOPE_GROUPS);

/** A resource with every field any action reads, so a denial is never caused by missing data. */
function kitchenSink(tenantId: string, extra: Record<string, unknown> = {}): never {
  return {
    tenantId,
    orgId: ORG,
    targetRoles: [],
    groupId: OWN_GROUP,
    personId: OTHER_PERSON,
    teamIds: [OWN_TEAM],
    visibility: "staff",
    teamId: OWN_TEAM,
    roomId: OWN_ROOM,
    whoCanRequest: "all_workspace",
    assignedPersonIds: [OTHER_PERSON],
    musicLeaderMayApprove: true,
    category: { ...LEAVE, whoCanSubmit: "all" },
    requesterPersonId: OTHER_PERSON,
    ...extra,
  } as never;
}

const NON_HR_TENANT_ACTIONS = ACTIONS.filter(
  (action) => !isHrAction(action) && !(ORG_ACTIONS as readonly Action[]).includes(action),
);

/** HR actions of the tenant vocabulary that organization actors can never perform. */
const ORG_NEVER_HR: readonly Action[] = [
  "hr.ticket.create",
  "hr.ticket.approveAsManager",
  "hr.staffRecord.view",
  "hr.staffRecord.edit",
  "hr.leaveBalance.manage",
];

describe("organization actors are denied every non-HR action", () => {
  it("the iteration covers the whole website and workspace vocabulary", () => {
    expect([...NON_HR_TENANT_ACTIONS].sort()).toEqual(
      [...WEBSITE_ACTIONS, ...WORKSPACE_ACTIONS].sort(),
    );
  });

  const holders = [
    ...ORG_ROLES.map((role) => [role, diocesanActor(role)] as const),
    ["all roles at once", diocesanActor([...ORG_ROLES])] as const,
  ];

  describe.each(holders)("%s", (_name, actor) => {
    it.each(NON_HR_TENANT_ACTIONS)(
      "%s is denied in a parish that delegates everything",
      (action) => {
        expect(explain(actor, action, kitchenSink(LINKED_ALL)).allowed).toBe(false);
      },
    );

    it.each(["private", "team", "staff", "public"])(
      "calendarEvent.create (%s) is denied",
      (visibility) => {
        expect(
          can(actor, "calendarEvent.create", kitchenSink(LINKED_ALL, { visibility }) as never),
        ).toBe(false);
      },
    );

    it.each(ORG_NEVER_HR)("%s is denied", (action) => {
      expect(explain(actor, action, kitchenSink(LINKED_ALL)).allowed).toBe(false);
    });
  });
});

describe("tenant actors are denied every organization action", () => {
  const everything = tenantActor({
    tenantId: TENANT,
    userId: "u-self",
    personId: SELF,
    websiteRoles: [...WEBSITE_ROLES],
    workspaceRoles: [...WORKSPACE_ROLES],
    hrCategoryIds: "*",
    confidentialCategoryIds: [COMPLAINT.id],
  });

  it.each(ORG_ACTIONS)("%s is denied even with every role", (action) => {
    expect(explain(everything, action, kitchenSink(TENANT))).toMatchObject({ allowed: false });
  });
});

// ---------------------------------------------------------------------------------------------
// Hard exclusions
// ---------------------------------------------------------------------------------------------

const CONFIDENTIAL_CHECKS = [
  "hr.ticket.read",
  "hr.ticket.reply",
  "hr.ticket.handle",
  "hr.absence.viewDetails",
  "hr.ticket.approveAsManager",
] as const;

function confidentialResource(action: Action, category = COMPLAINT, requester = OTHER_PERSON) {
  return action === "hr.absence.viewDetails"
    ? as({ tenantId: TENANT, category })
    : as({ tenantId: TENANT, category, requesterPersonId: requester });
}

describe("hard exclusion: leader (Vezető) and confidential tickets", () => {
  const nonConfidentialRoles = WORKSPACE_ROLES.filter((role) => role !== "confidentialHandler");

  const everyOtherRole = workspaceActor(nonConfidentialRoles, {
    websiteRoles: [...WEBSITE_ROLES],
    hrCategoryIds: "*",
    confidentialCategoryIds: [SAFEGUARDING.id],
    directReportPersonIds: [REPORT, OTHER_PERSON],
  });

  const leaderOnly = workspaceActor("leader", {
    websiteRoles: ["owner"],
    hrCategoryIds: "*",
    // The scope list alone, without the role, grants nothing.
    confidentialCategoryIds: [COMPLAINT.id],
    directReportPersonIds: [REPORT, OTHER_PERSON],
  });

  const leaderWithHr = workspaceActor(["leader", "hrHandler"], {
    hrCategoryIds: [LEAVE.id, COMPLAINT.id],
    confidentialCategoryIds: [COMPLAINT.id],
    directReportPersonIds: [REPORT, OTHER_PERSON],
  });

  it.each(CONFIDENTIAL_CHECKS)("leader alone is denied %s on a confidential category", (action) => {
    expect(can(leaderOnly, action, confidentialResource(action))).toBe(false);
  });

  it.each(CONFIDENTIAL_CHECKS)(
    "leader + hrHandler (confidential id in the HR scope) is denied %s",
    (action) => {
      expect(can(leaderWithHr, action, confidentialResource(action))).toBe(false);
    },
  );

  it.each(CONFIDENTIAL_CHECKS)(
    "every role except confidentialHandler plus every website role is denied %s",
    (action) => {
      expect(can(everyOtherRole, action, confidentialResource(action))).toBe(false);
      expect(can(everyOtherRole, action, confidentialResource(action, SAFEGUARDING))).toBe(false);
    },
  );

  it.each(WORKSPACE_ROLES.filter((role) => role !== "confidentialHandler"))(
    "%s alone (all scopes it could have) is denied every confidential check",
    (role) => {
      const actor = workspaceActor(role, {
        websiteRoles: [...WEBSITE_ROLES],
        hrCategoryIds: "*",
        confidentialCategoryIds: [COMPLAINT.id],
        directReportPersonIds: [REPORT, OTHER_PERSON],
      });
      for (const action of CONFIDENTIAL_CHECKS) {
        expect(can(actor, action, confidentialResource(action)), action).toBe(false);
      }
    },
  );

  it("leader reaches only the own confidential ticket as requester (read and reply, not handle)", () => {
    const own = as({ tenantId: TENANT, category: COMPLAINT, requesterPersonId: SELF });
    expect(can(leaderOnly, "hr.ticket.read", own)).toBe(true);
    expect(can(leaderOnly, "hr.ticket.reply", own)).toBe(true);
    expect(can(leaderOnly, "hr.ticket.handle", own)).toBe(false);
  });

  it("control: adding confidentialHandler with the scope opens exactly that category", () => {
    const actor = workspaceActor(["leader", "confidentialHandler"], {
      confidentialCategoryIds: [COMPLAINT.id],
    });
    for (const action of CONFIDENTIAL_CHECKS) {
      const expected = action !== "hr.ticket.approveAsManager";
      expect(can(actor, action, confidentialResource(action)), action).toBe(expected);
      expect(can(actor, action, confidentialResource(action, SAFEGUARDING)), action).toBe(false);
    }
  });
});

describe("hard exclusion: platform and support access are denied every hr.* action", () => {
  const platform: Actor = { kind: "platform", userId: "u-platform" };

  it("the iteration covers every hr.* action", () => {
    expect(ACTIONS.filter(isHrAction).sort()).toEqual([...HR_ACTIONS].sort());
  });

  describe("platform actor", () => {
    it.each(HR_ACTIONS)("%s is denied", (action) => {
      expect(explain(platform, action, kitchenSink(TENANT))).toMatchObject({
        allowed: false,
        reason: "platform actors are excluded from HR",
      });
    });

    it.each(ACTIONS)("%s is denied (no capability at all)", (action) => {
      expect(can(platform, action, kitchenSink(TENANT))).toBe(false);
    });
  });

  describe("support access (impersonating a tenant user holding every role and scope)", () => {
    const everything = {
      tenantId: TENANT,
      userId: "u-owner",
      personId: SELF,
      websiteRoles: [...WEBSITE_ROLES],
      workspaceRoles: [...WORKSPACE_ROLES],
      groupIds: [OWN_GROUP],
      leadTeamIds: [OWN_TEAM],
      memberTeamIds: [OWN_TEAM],
      managedRoomIds: [OWN_ROOM],
      hrCategoryIds: "*",
      confidentialCategoryIds: [COMPLAINT.id],
      directReportPersonIds: [REPORT],
    } as const;
    const support = tenantActor({ ...everything, impersonatedBy: "u-platform" });
    const owner = tenantActor(everything);

    const resources: [string, never][] = [
      ["ordinary category, foreign requester", kitchenSink(TENANT)],
      [
        "own ticket / own balance",
        kitchenSink(TENANT, { personId: SELF, requesterPersonId: SELF }),
      ],
      ["confidential category, foreign requester", kitchenSink(TENANT, { category: COMPLAINT })],
      [
        "confidential category, own ticket",
        kitchenSink(TENANT, { category: COMPLAINT, requesterPersonId: SELF }),
      ],
      [
        "direct report's request",
        kitchenSink(TENANT, { personId: REPORT, requesterPersonId: REPORT }),
      ],
    ];

    describe.each(resources)("%s", (_name, resource) => {
      it.each(HR_ACTIONS)("%s is denied", (action) => {
        expect(can(support, action, resource)).toBe(false);
      });
    });

    it("control: the same actor without support access is allowed some of these", () => {
      const allowed = HR_ACTIONS.filter(
        (action) => action !== "hr.template.manage" && can(owner, action, kitchenSink(TENANT)),
      );
      expect(allowed.length).toBeGreaterThanOrEqual(8);
      expect(can(owner, "hr.ticket.read", kitchenSink(TENANT, { category: COMPLAINT }))).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------------------------
// Website and workspace roles are separate families that only add up
// ---------------------------------------------------------------------------------------------

describe("website roles alone grant no workspace capability and vice versa", () => {
  const websiteOnly = tenantActor({
    tenantId: TENANT,
    userId: "u-self",
    personId: SELF,
    websiteRoles: [...WEBSITE_ROLES],
    groupIds: [OWN_GROUP],
    memberTeamIds: [OWN_TEAM],
    hrCategoryIds: "*",
  });

  it.each([...WORKSPACE_ACTIONS, ...HR_ACTIONS])("%s is denied to every website role", (action) => {
    expect(can(websiteOnly, action, kitchenSink(TENANT))).toBe(false);
  });

  it.each(WORKSPACE_ROLES)("%s alone grants no website action", (role) => {
    const actor = workspaceActor(role, {
      groupIds: [OWN_GROUP],
      hrCategoryIds: "*",
      leadTeamIds: [OWN_TEAM],
      managedRoomIds: [OWN_ROOM],
    });
    const granted = WEBSITE_ACTIONS.filter((action) => can(actor, action, kitchenSink(TENANT)));
    expect(granted).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// D-52 AC3: five representative additive combinations
// ---------------------------------------------------------------------------------------------

describe("website + workspace roles combine additively", () => {
  it("covers five representative combinations", () => {
    expect(COMBOS).toHaveLength(5);
  });

  for (const combo of COMBOS) {
    describe(combo.title, () => {
      for (const check of combo.checks) {
        it(`${check.label} -> ${check.allowed ? "allowed" : "denied"}`, () => {
          const decision = explain(combo.actor, check.action, as(check.resource));
          expect(decision.allowed, `${check.action}: ${decision.reason}`).toBe(check.allowed);
        });
      }
    });
  }

  it("another tenant's resources stay out of reach for every combination", () => {
    for (const combo of COMBOS) {
      for (const check of combo.checks) {
        const foreign = { ...(check.resource as object), tenantId: OTHER_TENANT };
        expect(can(combo.actor, check.action, as(foreign)), check.label).toBe(false);
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------
// MATRIX.md
// ---------------------------------------------------------------------------------------------

describe("MATRIX.md", () => {
  const file = new URL("../MATRIX.md", import.meta.url);

  it("is the up-to-date rendering of the expectation tables", () => {
    const rendered = renderMatrixMarkdown();
    // `pnpm --filter @churchy/policy matrix` regenerates the file.
    if (process.env["UPDATE_MATRIX"] === "1") writeFileSync(file, rendered);
    expect(readFileSync(file, "utf8")).toBe(rendered);
  });
});
