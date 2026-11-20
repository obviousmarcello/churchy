import { describe, expect, it } from "vitest";
import type { Action, Resource } from "./actions";
import { ACTIONS, HR_ACTIONS, isHrAction } from "./actions";
import type { Actor, OrgActor, PlatformActor, TenantActor } from "./actor";
import { inScope, orgActor, tenantActor } from "./actor";
import {
  COMPLAINT,
  LEAVE,
  LINKED,
  ORG,
  OTHER_GROUP,
  OTHER_ROOM,
  OTHER_TEAM,
  OTHER_TENANT,
  OWN_GROUP,
  OWN_ROOM,
  OWN_TEAM,
  TENANT,
  diocesanActor,
  workspaceActor,
} from "./policy.fixtures";
import { can, explain } from "./policy";

/** A resource with every field any action reads, so denials are never caused by missing data. */
const KITCHEN_SINK = {
  tenantId: TENANT,
  orgId: ORG,
  targetRoles: [],
  groupId: OWN_GROUP,
  personId: "p-other",
  teamIds: [OWN_TEAM],
  visibility: "staff",
  teamId: OWN_TEAM,
  roomId: OWN_ROOM,
  whoCanRequest: "all_workspace",
  assignedPersonIds: [],
  musicLeaderMayApprove: true,
  category: { ...LEAVE, whoCanSubmit: "all" },
  requesterPersonId: "p-other",
} as unknown as Resource;

describe("vocabulary", () => {
  it("lists every action once", () => {
    expect(new Set(ACTIONS).size).toBe(ACTIONS.length);
    expect(ACTIONS.length).toBeGreaterThan(60);
  });

  it("HR actions are exactly the hr.* actions", () => {
    expect(ACTIONS.filter(isHrAction).sort()).toEqual([...HR_ACTIONS].sort());
  });
});

describe("deny by default", () => {
  const nobody = tenantActor({ tenantId: TENANT, userId: "u-1", personId: "p-1" });

  it.each(ACTIONS)("a tenant actor without roles ✘ %s", (action) => {
    expect(can(nobody, action, KITCHEN_SINK as never)).toBe(false);
  });

  it.each(ACTIONS)("an anonymous visitor ✘ %s", (action) => {
    expect(can({ kind: "anonymous" }, action, KITCHEN_SINK as never)).toBe(false);
  });

  const platform: PlatformActor = { kind: "platform", userId: "u-operator" };
  it.each(ACTIONS)("a platform actor ✘ %s", (action) => {
    const decision = explain(platform, action, KITCHEN_SINK as never);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe(
      isHrAction(action)
        ? "platform actors are excluded from HR"
        : "platform actors have no tenant or organization capability",
    );
  });

  it("unknown actions are denied", () => {
    expect(
      explain(workspaceActor("leader"), "everything.do" as Action, KITCHEN_SINK as never),
    ).toEqual({ allowed: false, reason: "unknown action everything.do" });
  });

  it("missing or malformed input is denied, never thrown", () => {
    const owner = tenantActor({
      tenantId: TENANT,
      userId: "u",
      personId: null,
      websiteRoles: ["admin"],
    });
    expect(explain(null as unknown as Actor, "news.edit", { tenantId: TENANT }).reason).toBe(
      "missing actor",
    );
    expect(explain(owner, "news.edit", null as never).reason).toBe("missing resource");
    expect(explain(owner, "site.users.manage", { tenantId: TENANT } as never)).toEqual({
      allowed: false,
      reason: "malformed actor or resource",
    });
    expect(
      explain({ kind: "robot" } as unknown as Actor, "news.edit", { tenantId: TENANT }).reason,
    ).toBe("unknown actor kind");
  });
});

describe("tenant and organization context are exclusive", () => {
  it("the type system rejects an actor with both contexts", () => {
    // @ts-expect-error — a TenantActor cannot carry an orgId
    const tenant: TenantActor = { ...workspaceActor("leader"), orgId: ORG };
    // @ts-expect-error — an OrgActor cannot carry a tenantId
    const org: OrgActor = { ...diocesanActor("orgHrAdmin"), tenantId: TENANT };
    expect(tenant.kind).toBe("tenant");
    expect(org.kind).toBe("org");
  });

  it.each([
    [
      "tenant actor with an orgId",
      { ...workspaceActor("leader", { websiteRoles: ["owner"] }), orgId: ORG },
    ],
    ["org actor with a tenantId", { ...diocesanActor("orgHrAdmin"), tenantId: LINKED }],
  ])("a %s is denied everything at runtime", (_name, actor) => {
    for (const action of ACTIONS) {
      expect(explain(actor as unknown as Actor, action, KITCHEN_SINK as never)).toEqual({
        allowed: false,
        reason: "an actor must not combine tenant and organization context",
      });
    }
  });

  it("a tenant actor never reaches another tenant's resources", () => {
    const owner = workspaceActor(["leader", "hrHandler"], {
      websiteRoles: ["owner"],
      hrCategoryIds: "*",
    });
    for (const action of ACTIONS) {
      expect(can(owner, action, { ...KITCHEN_SINK, tenantId: OTHER_TENANT } as never)).toBe(false);
    }
    expect(explain(owner, "news.edit", { tenantId: OTHER_TENANT }).reason).toBe(
      "resource belongs to another tenant",
    );
  });
});

describe("roles combine additively (website + workspace)", () => {
  it("1. editor + groupLeader: editor rights cover other groups, group scope adds nothing less", () => {
    const actor = workspaceActor([], {
      websiteRoles: ["editor", "groupLeader"],
      groupIds: [OWN_GROUP],
    });
    expect(can(actor, "groupPage.edit", { tenantId: TENANT, groupId: OTHER_GROUP })).toBe(true);
    expect(can(actor, "news.publish", { tenantId: TENANT })).toBe(true);
    expect(can(actor, "schedule.edit", { tenantId: TENANT })).toBe(false);
  });

  it("2. office + groupLeader: group page only for the own group", () => {
    const actor = workspaceActor([], {
      websiteRoles: ["office", "groupLeader"],
      groupIds: [OWN_GROUP],
    });
    expect(can(actor, "groupPage.edit", { tenantId: TENANT, groupId: OWN_GROUP })).toBe(true);
    expect(can(actor, "groupPage.edit", { tenantId: TENANT, groupId: OTHER_GROUP })).toBe(false);
    expect(can(actor, "event.edit", { tenantId: TENANT, groupId: OTHER_GROUP })).toBe(true);
    expect(can(actor, "pastoralRequest.read", { tenantId: TENANT })).toBe(true);
  });

  it("3. owner + leader (pastor): full website and workspace, still no confidential HR", () => {
    const actor = workspaceActor("leader", { websiteRoles: ["owner"] });
    expect(can(actor, "site.delete", { tenantId: TENANT })).toBe(true);
    expect(can(actor, "booking.approve", { tenantId: TENANT, roomId: OTHER_ROOM })).toBe(true);
    expect(can(actor, "calendarEvent.create", { tenantId: TENANT, visibility: "public" })).toBe(
      true,
    );
    expect(
      can(actor, "hr.ticket.read", {
        tenantId: TENANT,
        category: COMPLAINT,
        requesterPersonId: "p-other",
      }),
    ).toBe(false);
  });

  it("4. editor + volunteer + teamLeader: team scope plus website content, no staff events", () => {
    const actor = workspaceActor(["volunteer", "teamLeader"], { websiteRoles: ["editor"] });
    expect(can(actor, "news.edit", { tenantId: TENANT })).toBe(true);
    expect(can(actor, "assignment.manage", { tenantId: TENANT, teamId: OWN_TEAM })).toBe(true);
    expect(can(actor, "assignment.manage", { tenantId: TENANT, teamId: OTHER_TEAM })).toBe(false);
    expect(can(actor, "calendarEvent.create", { tenantId: TENANT, visibility: "staff" })).toBe(
      false,
    );
    // teamLeader grants room booking under the default policy, which volunteer alone would not.
    expect(can(actor, "room.book", { tenantId: TENANT, roomId: OWN_ROOM })).toBe(true);
  });

  it("5. office + employee + roomManager: scoped booking approval on top of office rights", () => {
    const actor = workspaceActor(["employee", "roomManager"], { websiteRoles: ["office"] });
    expect(can(actor, "booking.approve", { tenantId: TENANT, roomId: OWN_ROOM })).toBe(true);
    expect(can(actor, "booking.approve", { tenantId: TENANT, roomId: OTHER_ROOM })).toBe(false);
    expect(can(actor, "schedule.edit", { tenantId: TENANT })).toBe(true);
    expect(can(actor, "site.appearance.edit", { tenantId: TENANT })).toBe(false);
  });

  it("6. hrHandler + confidentialHandler: each role covers its own categories", () => {
    const actor = workspaceActor(["hrHandler", "confidentialHandler"]);
    const ticket = (category: typeof LEAVE) => ({
      tenantId: TENANT,
      category,
      requesterPersonId: "p-x",
    });
    expect(can(actor, "hr.ticket.handle", ticket(LEAVE))).toBe(true);
    expect(can(actor, "hr.ticket.handle", ticket(COMPLAINT))).toBe(true);
  });

  it("7. leader + scoped confidentialHandler: the explicit scope (not the leader role) grants access", () => {
    const actor = workspaceActor(["leader", "confidentialHandler"]);
    expect(
      explain(actor, "hr.ticket.read", {
        tenantId: TENANT,
        category: COMPLAINT,
        requesterPersonId: "p-x",
      }),
    ).toEqual({
      allowed: true,
      reason: "confidentialHandler scoped to this confidential category",
    });
  });
});

describe("actor helpers", () => {
  it("tenantActor defaults role lists to empty", () => {
    const actor = tenantActor({ tenantId: TENANT, userId: null, personId: null });
    expect(actor).toEqual({
      kind: "tenant",
      tenantId: TENANT,
      userId: null,
      personId: null,
      websiteRoles: [],
      workspaceRoles: [],
    });
  });

  it("orgActor sets the kind", () => {
    expect(orgActor({ orgId: ORG, userId: null, personId: null, orgRoles: [] }).kind).toBe("org");
  });

  it("inScope: missing scope or id matches nothing, '*' matches everything", () => {
    expect(inScope(undefined, "a")).toBe(false);
    expect(inScope("*", null)).toBe(false);
    expect(inScope(["a"], undefined)).toBe(false);
    expect(inScope("*", "a")).toBe(true);
    expect(inScope(["a"], "a")).toBe(true);
    expect(inScope(["a"], "b")).toBe(false);
  });
});
