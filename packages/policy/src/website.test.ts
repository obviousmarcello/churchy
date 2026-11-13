import { describe, expect, it } from "vitest";
import type { Action } from "./actions";
import { WEBSITE_ACTIONS } from "./actions";
import { evaluateWebsite } from "./website";
import { OTHER_GROUP, OWN_GROUP, TENANT, websiteActor } from "./policy.fixtures";
import { can, explain } from "./policy";
import type { WebsiteRole } from "./roles";

/*
 * SDD §11.3 "Roles & permissions matrix", transcribed by hand (NOT derived from WEBSITE_MATRIX):
 *   Y  = ✔
 *   -  = empty cell
 *   ownGroup  = "own group only"   (tested with own group ✔, other group ✘, no group ✘)
 *   notOwners = "✔ (not owners)"   (tested with a non-owner target ✔ and an owner target ✘)
 */
type Cell = "Y" | "-" | "ownGroup" | "notOwners";

const verbs = (kind: string) =>
  ["create", "edit", "publish", "delete"].map((verb) => `${kind}.${verb}` as Action);

const ROLES = ["owner", "admin", "editor", "office", "groupLeader"] as const;

// Columns: capability, actions, cells for [owner, admin, editor, office, groupLeader].
const SDD_11_3: [string, Action[], [Cell, Cell, Cell, Cell, Cell]][] = [
  ["Manage users & roles", ["site.users.manage"], ["Y", "notOwners", "-", "-", "-"]],
  [
    "Domain, legal data, delete site",
    ["site.domain.manage", "site.legal.edit", "site.delete"],
    ["Y", "-", "-", "-", "-"],
  ],
  [
    "Appearance, modules, navigation, terminology",
    [
      "site.appearance.edit",
      "site.modules.manage",
      "site.navigation.edit",
      "site.terminology.edit",
    ],
    ["Y", "Y", "-", "-", "-"],
  ],
  [
    "Pages, news, gallery, sermons, documents",
    [
      ...verbs("page"),
      ...verbs("news"),
      ...verbs("gallery"),
      ...verbs("sermon"),
      ...verbs("document"),
    ],
    ["Y", "Y", "Y", "-", "-"],
  ],
  ["Announcements", verbs("announcement"), ["Y", "Y", "Y", "Y", "-"]],
  [
    "Schedule (rules & exceptions), locations, office hours",
    ["schedule.edit", "location.manage", "officeHours.edit"],
    ["Y", "Y", "-", "Y", "-"],
  ],
  ["Events", verbs("event"), ["Y", "Y", "Y", "Y", "ownGroup"]],
  ["Group page", verbs("groupPage"), ["Y", "Y", "Y", "-", "ownGroup"]],
  [
    "Pastoral requests (read/handle)",
    ["pastoralRequest.read", "pastoralRequest.handle"],
    ["Y", "Y", "-", "Y", "-"],
  ],
  ["Audit log", ["auditLog.read"], ["Y", "Y", "-", "-", "-"]],
];

/** The resource for an action; group content belongs to `groupId`, users have `targetRoles`. */
function resourceFor(
  action: Action,
  opts: { groupId?: string | null; targetRoles?: WebsiteRole[] } = {},
): never {
  if (action === "site.users.manage") {
    return { tenantId: TENANT, targetRoles: opts.targetRoles ?? ["editor"] } as never;
  }
  if (action.startsWith("event.") || action.startsWith("groupPage.")) {
    return { tenantId: TENANT, groupId: "groupId" in opts ? opts.groupId : OWN_GROUP } as never;
  }
  return { tenantId: TENANT } as never;
}

type Case = { name: string; role: WebsiteRole; action: Action; resource: never; allowed: boolean };

const cases: Case[] = SDD_11_3.flatMap(([capability, actions, cells]) =>
  actions.flatMap((action) =>
    ROLES.flatMap((role, i): Case[] => {
      const cell = cells[i]!;
      const base = `${capability} | ${role} | ${action}`;
      switch (cell) {
        case "Y":
          return [
            { name: `${base} ✔`, role, action, resource: resourceFor(action), allowed: true },
          ];
        case "-":
          return [
            { name: `${base} ✘`, role, action, resource: resourceFor(action), allowed: false },
          ];
        case "notOwners":
          return [
            {
              name: `${base} non-owner target ✔`,
              role,
              action,
              resource: resourceFor(action, { targetRoles: ["editor", "office"] }),
              allowed: true,
            },
            {
              name: `${base} owner target ✘`,
              role,
              action,
              resource: resourceFor(action, { targetRoles: ["admin", "owner"] }),
              allowed: false,
            },
          ];
        case "ownGroup":
          return [
            {
              name: `${base} own group ✔`,
              role,
              action,
              resource: resourceFor(action, { groupId: OWN_GROUP }),
              allowed: true,
            },
            {
              name: `${base} other group ✘`,
              role,
              action,
              resource: resourceFor(action, { groupId: OTHER_GROUP }),
              allowed: false,
            },
            {
              name: `${base} no group ✘`,
              role,
              action,
              resource: resourceFor(action, { groupId: null }),
              allowed: false,
            },
          ];
      }
    }),
  ),
);

describe("SDD §11.3 website matrix — one test per cell", () => {
  it("the transcribed matrix covers every website action exactly once", () => {
    const transcribed = SDD_11_3.flatMap(([, actions]) => actions);
    expect(new Set(transcribed).size).toBe(transcribed.length);
    expect([...transcribed].sort()).toEqual([...WEBSITE_ACTIONS].sort());
  });

  it.each(cases)("$name", ({ role, action, resource, allowed }) => {
    expect(can(websiteActor(role), action, resource)).toBe(allowed);
  });
});

describe("website scope details", () => {
  it("groupLeader without any group scope is denied group content", () => {
    const actor = websiteActor("groupLeader", { groupIds: undefined });
    expect(can(actor, "event.edit", { tenantId: TENANT, groupId: OWN_GROUP })).toBe(false);
  });

  it("groupLeader may lead several groups", () => {
    const actor = websiteActor("groupLeader", { groupIds: [OWN_GROUP, OTHER_GROUP] });
    expect(can(actor, "groupPage.edit", { tenantId: TENANT, groupId: OTHER_GROUP })).toBe(true);
  });

  it("an event without group is fine for editors and office", () => {
    expect(can(websiteActor("editor"), "event.create", { tenantId: TENANT })).toBe(true);
    expect(can(websiteActor("office"), "event.create", { tenantId: TENANT })).toBe(true);
  });

  it("explains scoped denials and grants", () => {
    expect(
      explain(websiteActor("groupLeader"), "event.edit", {
        tenantId: TENANT,
        groupId: OTHER_GROUP,
      }),
    ).toEqual({
      allowed: false,
      reason: `groupLeader: group ${OTHER_GROUP} is not the actor's group`,
    });
    expect(
      explain(websiteActor("groupLeader"), "event.edit", { tenantId: TENANT, groupId: OWN_GROUP }),
    ).toEqual({ allowed: true, reason: "groupLeader grants event.edit (ownGroup)" });
    expect(
      explain(websiteActor("admin"), "site.users.manage", {
        tenantId: TENANT,
        targetRoles: ["owner"],
      }),
    ).toEqual({ allowed: false, reason: "admin: may not manage owners" });
    expect(explain(websiteActor("editor"), "auditLog.read", { tenantId: TENANT })).toEqual({
      allowed: false,
      reason: "no role of the actor grants auditLog.read",
    });
    expect(explain(websiteActor("owner"), "site.delete", { tenantId: TENANT })).toEqual({
      allowed: true,
      reason: "owner grants site.delete",
    });
  });

  it("evaluateWebsite denies actions outside the website matrix", () => {
    expect(evaluateWebsite(websiteActor("owner"), "song.edit", { tenantId: TENANT }).allowed).toBe(
      false,
    );
  });
});
