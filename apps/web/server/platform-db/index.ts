import "server-only";

/**
 * Platform database access (SDD §4.1, §4.2, §19): host → tenant resolution, profile bootstrap,
 * entitlement lookups and church creation, all through the restricted role `churchy_platform`.
 * Import it only from the files `eslint.platform.mjs` allows.
 */
export { getPlatformDb, platformDbEnabled } from "./client";
export type { PlatformDb, PlatformQueryable } from "./client";
export { invalidateHost, invalidateTenantHosts, resolveHost } from "./hosts";
export type { HostResolution } from "./hosts";
export { getEntitlementsRow, getProfileByAuthUser, listTenantOptions } from "./queries";
export type { PlatformProfile } from "./queries";
export { createTenant } from "./create-tenant";
export type { CreateTenantInput, CreateTenantOptions, CreateTenantResult } from "./create-tenant";
export { RESERVED_SLUGS, checkSlug } from "./slug";
export {
  DbDraftStore,
  getDraftForTenant,
  listDraftsForTenant,
  writeSiteBuilderAudit,
} from "./site-drafts";
