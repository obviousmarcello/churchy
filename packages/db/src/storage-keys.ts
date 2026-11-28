/**
 * Object storage keys are prefixed `t/<tenant_id>/…` (SDD §4.2). The storage adapter builds keys
 * with `tenantStorageKey()` and checks every key it is asked to read, sign or delete with
 * `assertTenantStorageKey()`, so a request can never reach another tenant's files, whatever key
 * a caller passes in. Organization and platform contexts have no tenant prefix and are refused.
 */
import { ContractError, requireTenantId, type Ctx } from "@churchy/contracts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// One path segment: no separators, no dot segments, no control characters, no percent-escapes
// (a storage backend may decode `%2F` / `%2e%2e` into separators or dot segments).
// eslint-disable-next-line no-control-regex -- rejecting control characters is the point
const SEGMENT = /^(?!\.{1,2}$)[^/\\%\u0000-\u001f\u007f]{1,200}$/;

export class StorageKeyError extends ContractError {
  constructor(message: string) {
    super("FORBIDDEN", message);
  }
}

/** `t/<tenantId>/` for a tenant context; throws for organization/platform contexts. */
export function tenantStoragePrefix(ctx: Ctx): string {
  const tenantId = requireTenantId(ctx).toLowerCase();
  if (!UUID.test(tenantId)) throw new StorageKeyError("Tenant id is not a UUID");
  return `t/${tenantId}/`;
}

/** Builds `t/<tenantId>/<segment>/…` from validated path segments. */
export function tenantStorageKey(ctx: Ctx, ...segments: string[]): string {
  if (segments.length === 0) throw new StorageKeyError("A storage key needs at least one segment");
  for (const segment of segments) {
    if (!SEGMENT.test(segment)) throw new StorageKeyError("Invalid storage key segment");
  }
  return tenantStoragePrefix(ctx) + segments.join("/");
}

/**
 * Returns `key` unchanged when it lies inside the current tenant's prefix and is well-formed;
 * throws `StorageKeyError` otherwise (other tenant, no prefix, `..`, `//`, `\`, `%`, control chars).
 */
export function assertTenantStorageKey(ctx: Ctx, key: string): string {
  const prefix = tenantStoragePrefix(ctx);
  if (!key.startsWith(prefix)) {
    throw new StorageKeyError("Storage key is outside the current tenant");
  }
  const segments = key.slice(prefix.length).split("/");
  if (!segments.every((segment) => SEGMENT.test(segment))) {
    throw new StorageKeyError("Invalid storage key");
  }
  return key;
}
