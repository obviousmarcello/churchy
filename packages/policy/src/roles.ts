/**
 * Role vocabularies of the three role families (SDD §11.3, §21.2, §25.7).
 *
 * The keys are shared with `@churchy/contracts` (which exports the same keys as Zod enums);
 * this package keeps plain string-literal unions so that it has zero runtime dependencies.
 */

/** Website / tenant roles (SDD §11.3). `groupLeader` is scoped to `TenantActor.groupIds`. */
export const WEBSITE_ROLES = ["owner", "admin", "editor", "office", "groupLeader"] as const;
export type WebsiteRole = (typeof WEBSITE_ROLES)[number];

/**
 * Workspace (Munkatér) roles (SDD §21.2). They are tenant roles too and combine additively with
 * the website roles. Scoped roles: `teamLeader` → `leadTeamIds`, `roomManager` → `managedRoomIds`,
 * `hrHandler` → `hrCategoryIds`, `confidentialHandler` → `confidentialCategoryIds`.
 */
export const WORKSPACE_ROLES = [
  "leader",
  "employee",
  "volunteer",
  "teamLeader",
  "musicLeader",
  "roomManager",
  "hrHandler",
  "confidentialHandler",
] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

/**
 * Diocesan organization roles (SDD §25.7). They exist only in an organization context and grant
 * nothing outside the HR categories that linked parishes delegated to the organization.
 */
export const ORG_ROLES = ["orgHrAdmin", "orgHrHandler", "orgConfidentialHandler"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];
