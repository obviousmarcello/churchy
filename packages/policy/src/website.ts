import type {
  ContentAction,
  GroupContentAction,
  GroupContentResource,
  Resource,
  UserManagementResource,
  WebsiteTenantAction,
} from "./actions";
import { CONTENT_VERBS } from "./actions";
import type { TenantActor } from "./actor";
import type { Decision, MatrixRow } from "./decision";
import { deny, evaluateRow, indexRows } from "./decision";
import type { WebsiteRole } from "./roles";
import { WEBSITE_ROLES } from "./roles";

/**
 * - `all`: unconditional
 * - `notOwners`: only when the managed user has / gets no `owner` role
 * - `ownGroup`: only when the resource belongs to one of the actor's `groupIds`
 */
export type WebsiteGrant = "all" | "notOwners" | "ownGroup";

type WebsiteMatrixAction =
  "site.users.manage" | WebsiteTenantAction | ContentAction | GroupContentAction;

const verbs = <K extends string>(kind: K) =>
  CONTENT_VERBS.map((verb) => `${kind}.${verb}` as const);

/** SDD §11.3 "Roles & permissions matrix", one entry per row. */
export const WEBSITE_MATRIX: readonly MatrixRow<WebsiteMatrixAction, WebsiteRole, WebsiteGrant>[] =
  [
    {
      capability: "Manage users & roles",
      actions: ["site.users.manage"],
      grants: { owner: "all", admin: "notOwners" },
    },
    {
      capability: "Domain, legal data, delete site",
      actions: ["site.domain.manage", "site.legal.edit", "site.delete"],
      grants: { owner: "all" },
    },
    {
      capability: "Appearance, modules, navigation, terminology",
      actions: [
        "site.appearance.edit",
        "site.modules.manage",
        "site.navigation.edit",
        "site.terminology.edit",
      ],
      grants: { owner: "all", admin: "all" },
    },
    {
      capability: "Pages, news, gallery, sermons, documents",
      actions: [
        ...verbs("page"),
        ...verbs("news"),
        ...verbs("gallery"),
        ...verbs("sermon"),
        ...verbs("document"),
      ],
      grants: { owner: "all", admin: "all", editor: "all" },
    },
    {
      capability: "Announcements",
      actions: verbs("announcement"),
      grants: { owner: "all", admin: "all", editor: "all", office: "all" },
    },
    {
      capability: "Schedule (rules & exceptions), locations, office hours",
      actions: ["schedule.edit", "location.manage", "officeHours.edit"],
      grants: { owner: "all", admin: "all", office: "all" },
    },
    {
      capability: "Events",
      actions: verbs("event"),
      grants: { owner: "all", admin: "all", editor: "all", office: "all", groupLeader: "ownGroup" },
    },
    {
      capability: "Group page",
      actions: verbs("groupPage"),
      grants: { owner: "all", admin: "all", editor: "all", groupLeader: "ownGroup" },
    },
    {
      capability: "Pastoral requests (read/handle)",
      actions: ["pastoralRequest.read", "pastoralRequest.handle"],
      grants: { owner: "all", admin: "all", office: "all" },
    },
    {
      capability: "Audit log",
      actions: ["auditLog.read"],
      grants: { owner: "all", admin: "all" },
    },
  ];

const ROWS_BY_ACTION = indexRows(WEBSITE_MATRIX);

function checkGrant(grant: WebsiteGrant, actor: TenantActor, resource: Resource): string | null {
  switch (grant) {
    case "all":
      return null;
    case "notOwners":
      return (resource as UserManagementResource).targetRoles.includes("owner")
        ? "may not manage owners"
        : null;
    case "ownGroup": {
      const groupId = (resource as GroupContentResource).groupId;
      if (groupId === undefined || groupId === null) return "resource belongs to no group";
      return actor.groupIds?.includes(groupId) ? null : `group ${groupId} is not the actor's group`;
    }
  }
}

/** Website / admin capabilities (SDD §11.3) for a tenant actor in the resource's tenant. */
export function evaluateWebsite(actor: TenantActor, action: string, resource: Resource): Decision {
  const row = ROWS_BY_ACTION.get(action);
  if (row === undefined) return deny(`${action} is not a website action`);
  return evaluateRow(row, WEBSITE_ROLES, actor.websiteRoles, action, (grant) =>
    checkGrant(grant, actor, resource),
  );
}
