import { z } from "zod";

/** Website (tenant) roles — SDD §11.3. `groupLeader` = *Csoportvezető* (group-scoped). */
export const TenantRoleSchema = z.enum(["owner", "admin", "editor", "office", "groupLeader"]);
export type TenantRole = z.infer<typeof TenantRoleSchema>;
export const TENANT_ROLES = TenantRoleSchema.options;

/** Workspace roles — SDD §21.2; additive with the website roles. */
export const WorkspaceRoleSchema = z.enum([
  "leader",
  "employee",
  "volunteer",
  "teamLeader",
  "musicLeader",
  "roomManager",
  "hrHandler",
  "confidentialHandler",
]);
export type WorkspaceRole = z.infer<typeof WorkspaceRoleSchema>;
export const WORKSPACE_ROLES = WorkspaceRoleSchema.options;

/** Organization (diocesan) roles — SDD §25.7. Never tenant roles. */
export const OrgRoleSchema = z.enum(["orgHrAdmin", "orgHrHandler", "orgConfidentialHandler"]);
export type OrgRole = z.infer<typeof OrgRoleSchema>;
export const ORG_ROLES = OrgRoleSchema.options;
