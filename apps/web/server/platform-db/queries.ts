import "server-only";

import { PlanSchema, type EntitlementSources, type OrgRole } from "@churchy/contracts";
import { getPlatformDb, type PlatformQueryable } from "./client";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string): boolean => UUID.test(value);

export interface PlatformProfile {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly twoFactorEnabled: boolean;
  readonly lastLoginAt: Date | null;
  /** Diocesan memberships (`org_memberships`); church memberships need a tenant context. */
  readonly orgMemberships: readonly {
    readonly orgId: string;
    readonly roles: readonly OrgRole[];
    readonly categoryScopes: readonly string[] | null;
    readonly parishScopes: readonly string[] | null;
  }[];
}

/** The profile of a Supabase auth user, or `null` (no profile yet, or not a uuid). */
export async function getProfileByAuthUser(
  authUserId: string,
  db?: PlatformQueryable,
): Promise<PlatformProfile | null> {
  if (!isUuid(authUserId)) return null;
  const source = db ?? (await getPlatformDb());
  const profile = (
    await source.query<{
      id: string;
      email: string;
      name: string;
      two_factor_enabled: boolean;
      last_login_at: Date | null;
    }>("select id, email, name, two_factor_enabled, last_login_at from profiles where id = $1", [
      authUserId,
    ])
  ).rows[0];
  if (!profile) return null;
  const memberships = (
    await source.query<{
      org_id: string;
      roles: string[];
      category_scopes: string[] | null;
      parish_scopes: string[] | null;
    }>(
      `select org_id, roles::text[] as roles, category_scopes, parish_scopes::text[] as parish_scopes
       from org_memberships where user_id = $1 order by org_id`,
      [authUserId],
    )
  ).rows;
  return {
    id: profile.id,
    email: profile.email,
    name: profile.name,
    twoFactorEnabled: profile.two_factor_enabled,
    lastLoginAt: profile.last_login_at,
    orgMemberships: memberships.map((m) => ({
      orgId: m.org_id,
      roles: m.roles as OrgRole[],
      categoryScopes: m.category_scopes,
      parishScopes: m.parish_scopes,
    })),
  };
}

/**
 * The inputs of `entitlements(tenant)` for a church (website plan, workspace add-on, the diocesan
 * deal in force today), read through the platform role. `null` when the tenant (or its plan)
 * does not exist or the id is not a uuid. Only `entitlements()` interprets the result.
 */
export async function getEntitlementsRow(
  tenantId: string,
  db?: PlatformQueryable,
): Promise<EntitlementSources | null> {
  if (!isUuid(tenantId)) return null;
  const source = db ?? (await getPlatformDb());
  const tenant = (
    await source.query<{ plan_key: string; ws_tier: string; organization_id: string | null }>(
      "select plan_key::text as plan_key, ws_tier::text as ws_tier, organization_id from tenants where id = $1",
      [tenantId],
    )
  ).rows[0];
  if (!tenant) return null;

  const keys =
    tenant.ws_tier === "none" ? [tenant.plan_key] : [tenant.plan_key, `ws_${tenant.ws_tier}`];
  const planRows = (
    await source.query<{
      key: string;
      name: string;
      kind: string;
      price_monthly: number;
      price_yearly: number;
      entitlements: unknown;
    }>(
      `select key::text as key, name, kind::text as kind, price_monthly, price_yearly, entitlements
       from plans where key::text = any($1::text[])`,
      [keys],
    )
  ).rows;
  const plan = (key: string) => {
    const row = planRows.find((p) => p.key === key);
    return row
      ? PlanSchema.parse({
          key: row.key,
          name: row.name,
          kind: row.kind,
          priceMonthly: row.price_monthly,
          priceYearly: row.price_yearly,
          entitlements: row.entitlements,
        })
      : null;
  };
  const websitePlan = plan(tenant.plan_key);
  if (websitePlan === null) return null;
  const workspacePlan = tenant.ws_tier === "none" ? null : plan(`ws_${tenant.ws_tier}`);

  let deal: EntitlementSources["deal"] = null;
  if (tenant.organization_id !== null) {
    const row = (
      await source.query<{
        id: string;
        plan_keys: string[];
        valid_from: string;
        valid_to: string | null;
      }>(
        `select id, plan_keys::text[] as plan_keys, to_char(valid_from, 'YYYY-MM-DD') as valid_from,
                to_char(valid_to, 'YYYY-MM-DD') as valid_to
         from deals
         where organization_id = $1
           and valid_from <= (now() at time zone 'Europe/Budapest')::date
           and (valid_to is null or valid_to >= (now() at time zone 'Europe/Budapest')::date)
         order by valid_from desc limit 1`,
        [tenant.organization_id],
      )
    ).rows[0];
    if (row) {
      deal = {
        id: row.id,
        planKeys: row.plan_keys as EntitlementSources["websitePlan"]["key"][],
        validFrom: row.valid_from,
        validTo: row.valid_to,
      };
    }
  }
  return { websitePlan, workspacePlan, deal };
}
