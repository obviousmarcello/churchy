import "server-only";

import { TtlLruCache } from "./cache";
import { getPlatformDb, type PlatformQueryable } from "./client";
import { RESERVED_SLUGS } from "./slug";

/**
 * Host → tenant resolution (SDD §4.1). Pure mapping on top of three lookups through the platform
 * role (tenants by slug, organizations by slug, verified custom domains) with an in-memory LRU
 * cache (60 s TTL, invalidated on domain/tenant change).
 *
 *   <slug>.<PUBLIC_BASE_DOMAIN>   → public site of the tenant
 *   verified custom domain        → public site of the tenant (`www.` falls back to the bare host)
 *   <slug>.<APP_BASE_DOMAIN>      → app routes of the tenant
 *   <org-slug>.<APP_BASE_DOMAIN>  → organization portal
 *   platform.<APP_BASE_DOMAIN>    → platform console
 */
export type HostResolution =
  | {
      readonly kind: "public" | "app";
      readonly tenantId: string;
      readonly slug: string;
      readonly suspended: boolean;
    }
  | { readonly kind: "org"; readonly orgId: string; readonly slug: string }
  | { readonly kind: "platform" }
  | { readonly kind: "unknown" };

export interface HostResolverOptions {
  readonly db: () => Promise<PlatformQueryable>;
  /** `<slug>.churchy.hu`; default `APP_BASE_DOMAIN` or `churchy.hu`. */
  readonly appBaseDomain?: string;
  /** The neutral public domain (`PUBLIC_BASE_DOMAIN`); unset: no neutral domain is served. */
  readonly publicBaseDomain?: string | undefined;
  readonly ttlMs?: number;
  readonly maxEntries?: number;
  readonly now?: () => number;
}

const UNKNOWN: HostResolution = { kind: "unknown" };
const HOST_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;

/** Lower-cases, drops the port and a trailing dot; `null` when this is not a plausible DNS name. */
export function normalizeHost(host: string): string | null {
  const bare = host.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  return bare.length > 0 && bare.length <= 253 && HOST_RE.test(bare) ? bare : null;
}

function labelUnder(host: string, base: string): string | null {
  if (!host.endsWith(`.${base}`)) return null;
  const label = host.slice(0, -(base.length + 1));
  return label.length > 0 && !label.includes(".") ? label : null;
}

interface TenantRow {
  id: string;
  slug: string;
  status: string;
}

export function createHostResolver(options: HostResolverOptions) {
  const appBase = (options.appBaseDomain ?? "churchy.hu").toLowerCase();
  const publicBase = options.publicBaseDomain?.trim().toLowerCase() || null;
  const cache = new TtlLruCache<HostResolution>({
    ttlMs: options.ttlMs ?? 60_000,
    maxEntries: options.maxEntries ?? 1000,
    ...(options.now ? { now: options.now } : {}),
  });

  const tenantBySlug = async (db: PlatformQueryable, slug: string) =>
    (await db.query<TenantRow>("select id, slug, status from tenants where slug = $1", [slug]))
      .rows[0] ?? null;

  const tenantResolution = (kind: "public" | "app", t: TenantRow): HostResolution => ({
    kind,
    tenantId: t.id,
    slug: t.slug,
    suspended: t.status === "suspended",
  });

  async function lookup(host: string): Promise<HostResolution> {
    if (host === `platform.${appBase}`) return { kind: "platform" };
    const db = await options.db();

    const appLabel = labelUnder(host, appBase);
    if (appLabel !== null) {
      if (RESERVED_SLUGS.has(appLabel)) return UNKNOWN;
      const tenant = await tenantBySlug(db, appLabel);
      if (tenant) return tenantResolution("app", tenant);
      const org = (
        await db.query<{ id: string; slug: string }>(
          "select id, slug from organizations where slug = $1",
          [appLabel],
        )
      ).rows[0];
      return org ? { kind: "org", orgId: org.id, slug: org.slug } : UNKNOWN;
    }

    if (host === appBase) return UNKNOWN;

    const publicLabel = publicBase === null ? null : labelUnder(host, publicBase);
    if (publicLabel !== null) {
      if (RESERVED_SLUGS.has(publicLabel)) return UNKNOWN;
      const tenant = await tenantBySlug(db, publicLabel);
      return tenant ? tenantResolution("public", tenant) : UNKNOWN;
    }
    if (publicBase !== null && host === publicBase) return UNKNOWN;

    // Custom domain: verified only; `www.` falls back to the bare host (it redirects to the primary).
    for (const candidate of host.startsWith("www.") ? [host, host.slice(4)] : [host]) {
      const row = (
        await db.query<{ tenant_id: string; slug: string; status: string }>(
          `select d.tenant_id, t.slug, t.status
           from domains d join tenants t on t.id = d.tenant_id
           where lower(d.hostname) = $1 and d.verified_at is not null`,
          [candidate],
        )
      ).rows[0];
      if (row)
        return tenantResolution("public", {
          id: row.tenant_id,
          slug: row.slug,
          status: row.status,
        });
    }
    return UNKNOWN;
  }

  return {
    /** Resolves a request host; lookups (also misses) are cached for the TTL. */
    async resolveHost(host: string): Promise<HostResolution> {
      const normalized = normalizeHost(host);
      if (normalized === null) return UNKNOWN;
      const cached = cache.get(normalized);
      if (cached !== undefined) return cached;
      const resolved = await lookup(normalized);
      cache.set(normalized, resolved);
      return resolved;
    },
    /** Domain change: forget one host (also its `www.` / bare twin). */
    invalidateHost(host: string): void {
      const normalized = normalizeHost(host);
      if (normalized === null) return;
      cache.delete(normalized);
      cache.delete(normalized.startsWith("www.") ? normalized.slice(4) : `www.${normalized}`);
    },
    /** Tenant change (new, renamed, suspended): forget every host of the slug or tenant id. */
    invalidateTenant(tenant: { readonly slug?: string; readonly tenantId?: string }): void {
      cache.deleteWhere(
        (key, value) =>
          (tenant.slug !== undefined &&
            (key.startsWith(`${tenant.slug}.`) ||
              ("slug" in value && value.slug === tenant.slug))) ||
          (tenant.tenantId !== undefined &&
            "tenantId" in value &&
            value.tenantId === tenant.tenantId),
      );
    },
    clear(): void {
      cache.clear();
    },
  };
}

export type HostResolver = ReturnType<typeof createHostResolver>;

let shared: HostResolver | undefined;

function defaultResolver(): HostResolver {
  shared ??= createHostResolver({
    db: getPlatformDb,
    appBaseDomain: process.env.APP_BASE_DOMAIN?.trim() || "churchy.hu",
    publicBaseDomain: process.env.PUBLIC_BASE_DOMAIN,
  });
  return shared;
}

export const resolveHost = (host: string): Promise<HostResolution> =>
  defaultResolver().resolveHost(host);
export const invalidateHost = (host: string): void => defaultResolver().invalidateHost(host);
export const invalidateTenantHosts = (tenant: {
  readonly slug?: string;
  readonly tenantId?: string;
}): void => defaultResolver().invalidateTenant(tenant);
