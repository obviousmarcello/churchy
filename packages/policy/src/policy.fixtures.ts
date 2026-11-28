// Fictitious ids for policy tests. No real people, churches or dioceses.
import type { HrCategoryRef } from "./actions";
import type { OrgActor, TenantActor } from "./actor";
import { orgActor, tenantActor } from "./actor";
import type { OrgRole, WebsiteRole, WorkspaceRole } from "./roles";

export const TENANT = "t-szent-mihaly";
export const OTHER_TENANT = "t-reformatus-belvaros";

export const SELF = "p-self";
export const REPORT = "p-direct-report";
export const OTHER_PERSON = "p-other";

export const OWN_GROUP = "g-ifjusag";
export const OTHER_GROUP = "g-karitasz";

export const OWN_TEAM = "team-korus";
export const OTHER_TEAM = "team-hangtechnika";

export const OWN_ROOM = "room-kozossegi-terem";
export const OTHER_ROOM = "room-kapolna";

export const LEAVE: HrCategoryRef = { id: "cat-leave", key: "leave", confidential: false };
export const CERTIFICATE: HrCategoryRef = {
  id: "cat-certificate",
  key: "certificate",
  confidential: false,
};
export const COMPLAINT: HrCategoryRef = {
  id: "cat-complaint",
  key: "complaint",
  confidential: true,
};
export const SAFEGUARDING: HrCategoryRef = {
  id: "cat-safeguarding",
  key: "safeguarding",
  confidential: true,
};

/** A tenant actor with exactly one website role (groupLeader scoped to OWN_GROUP). */
export function websiteActor(role: WebsiteRole, extra: Partial<TenantActor> = {}): TenantActor {
  return tenantActor({
    tenantId: TENANT,
    userId: "u-self",
    personId: SELF,
    websiteRoles: [role],
    groupIds: role === "groupLeader" ? [OWN_GROUP] : [],
    ...extra,
  });
}

/**
 * A tenant actor with one workspace role and the scopes that role would have: member of OWN_TEAM,
 * leads OWN_TEAM (teamLeader), manages OWN_ROOM (roomManager), handles LEAVE (hrHandler) or
 * COMPLAINT (confidentialHandler); REPORT is a direct report.
 */
export function workspaceActor(
  roles: WorkspaceRole | readonly WorkspaceRole[],
  extra: Partial<TenantActor> = {},
): TenantActor {
  const list: readonly WorkspaceRole[] = typeof roles === "string" ? [roles] : roles;
  return tenantActor({
    tenantId: TENANT,
    userId: "u-self",
    personId: SELF,
    workspaceRoles: list,
    memberTeamIds: [OWN_TEAM],
    leadTeamIds: list.includes("teamLeader") ? [OWN_TEAM] : [],
    managedRoomIds: list.includes("roomManager") ? [OWN_ROOM] : [],
    hrCategoryIds: list.includes("hrHandler") ? [LEAVE.id] : [],
    confidentialCategoryIds: list.includes("confidentialHandler") ? [COMPLAINT.id] : [],
    directReportPersonIds: [REPORT],
    ...extra,
  });
}

export const ORG = "org-fiktiv-egyhazmegye";
export const LINKED = "t-linked-parish";
export const LINKED_ALL = "t-linked-parish-all-hr";
export const UNLINKED = "t-unlinked-parish";
export const REQUESTED = "t-requested-parish";
export const REVOKED = "t-revoked-parish";
export const EMPTY_DELEGATION = "t-no-delegation";

/** An organization actor with the standard link set; scopes default to "*". */
export function diocesanActor(roles: OrgRole | readonly OrgRole[], extra: Partial<OrgActor> = {}) {
  return orgActor({
    orgId: ORG,
    userId: "u-diocese",
    personId: null,
    orgRoles: typeof roles === "string" ? [roles] : roles,
    categoryScopes: "*",
    parishScopes: "*",
    links: [
      { tenantId: LINKED, status: "active", delegatedCategoryKeys: ["leave", "complaint"] },
      { tenantId: LINKED_ALL, status: "active", delegatedCategoryKeys: "*" },
      { tenantId: REQUESTED, status: "requested", delegatedCategoryKeys: "*" },
      { tenantId: REVOKED, status: "revoked", delegatedCategoryKeys: "*" },
      { tenantId: EMPTY_DELEGATION, status: "active", delegatedCategoryKeys: [] },
    ],
    ...extra,
  });
}
