import "server-only";

import { DenominationSchema } from "@churchy/contracts";
import { huZodErrorMap } from "@churchy/i18n";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getPlatformDb, type PlatformDb, type PlatformQueryable } from "./client";
import { invalidateTenantHosts } from "./hosts";
import { checkSlug } from "./slug";

/**
 * Creates a church and its owner in ONE transaction through the platform role (SDD §19 step 1):
 * `tenants` (free plan, active, not launched), the owner's `profiles` row (when missing), the owner's
 * `memberships` (role `owner`) and `people`
 * rows, and the `audit_log` entries. Nothing is read from church data; every insert is INSERT-only
 * and, for tenant tables, admitted by RLS only for a tenant created in the last ten minutes
 * (0025/0026_platform_role). The church's own settings (`site_config`, `app_config`, domains, billing) start
 * empty/default and are changed later by the owner under the tenant role.
 */

const FREE_PLAN = "ingyenes";

export const CreateTenantInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(120),
  denomination: DenominationSchema,
  owner: z.object({
    /** `auth.users.id` of the signed-up owner. */
    authUserId: z.uuid(),
    email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
    /** Hungarian order: family name first (`dr. Kovács János`). */
    name: z.string().trim().min(1).max(200),
  }),
  /** The operator who runs the wizard (Új egyház); defaults to the owner (self signup). */
  actorUserId: z.uuid().optional(),
});
export type CreateTenantInput = z.input<typeof CreateTenantInputSchema>;

export type CreateTenantResult =
  | {
      readonly ok: true;
      readonly tenantId: string;
      readonly slug: string;
      readonly personId: string;
      /** The owner already had a profile (another church, or an earlier sign-in). */
      readonly profileExisted: boolean;
    }
  | {
      readonly ok: false;
      readonly reason: "invalid";
      readonly issues: readonly { readonly path: string; readonly message: string }[];
    }
  | {
      readonly ok: false;
      readonly reason:
        "slug_invalid" | "slug_reserved" | "slug_taken" | "email_taken" | "plan_missing";
    };

/** `dr. Kovács János` → prefix `dr.`, family `Kovács`, given `János` (titles end with a dot). */
export function splitOwnerName(name: string): {
  prefix: string | null;
  family: string;
  given: string;
} {
  const parts = name.trim().split(/\s+/);
  const prefixes: string[] = [];
  while (parts.length > 1 && parts[0]!.endsWith(".")) prefixes.push(parts.shift()!);
  const [family = "", ...given] = parts;
  return {
    prefix: prefixes.length > 0 ? prefixes.join(" ") : null,
    family,
    given: given.join(" "),
  };
}

interface PgError {
  code?: string;
  constraint?: string;
}

function mapConstraintError(error: unknown): CreateTenantResult | null {
  const e = error as PgError;
  if (e?.code !== "23505") return null;
  const constraint = e.constraint ?? "";
  if (constraint.includes("slug")) return { ok: false, reason: "slug_taken" };
  if (constraint.includes("email")) return { ok: false, reason: "email_taken" };
  return null;
}

async function bootstrap(
  tx: PlatformQueryable,
  input: z.output<typeof CreateTenantInputSchema>,
  slug: string,
  siteConfig?: Record<string, unknown>,
): Promise<CreateTenantResult> {
  const plan = await tx.query("select 1 from plans where key = $1::plan_key", [FREE_PLAN]);
  if (plan.rows.length === 0) return { ok: false, reason: "plan_missing" };
  // `<slug>.churchy.hu` is shared with organization slugs.
  const org = await tx.query("select 1 from organizations where slug = $1", [slug]);
  if (org.rows.length > 0) return { ok: false, reason: "slug_taken" };

  const tenantId = randomUUID();
  const personId = randomUUID();
  const { owner } = input;
  const actor = input.actorUserId ?? owner.authUserId;
  const nameParts = splitOwnerName(owner.name);

  await tx.query(
    `insert into tenants (id, slug, name, denomination, plan_key, status, ws_tier, site_config)
     values ($1, $2, $3, $4::denomination, $5::plan_key, 'active', 'none', $6::jsonb)`,
    [tenantId, slug, input.name, input.denomination, FREE_PLAN, JSON.stringify(siteConfig ?? {})],
  );
  const profile = await tx.query(
    `insert into profiles (id, email, name) values ($1, $2, $3)
     on conflict (id) do nothing returning id`,
    [owner.authUserId, owner.email, owner.name],
  );
  const profileExisted = profile.rows.length === 0;
  await tx.query(`insert into memberships (tenant_id, user_id, role) values ($1, $2, 'owner')`, [
    tenantId,
    owner.authUserId,
  ]);
  await tx.query(
    `insert into people (id, tenant_id, user_id, prefix, family_name, given_name, staff_group, is_public, email)
     values ($1, $2, $3, $4, $5, $6, 'clergy', false, $7)`,
    [
      personId,
      tenantId,
      owner.authUserId,
      nameParts.prefix,
      nameParts.family,
      nameParts.given,
      owner.email,
    ],
  );
  // Audit entries carry ids and non-personal facts only (no name, no e-mail).
  await tx.query(
    `insert into audit_log (tenant_id, actor_user_id, action, entity, entity_id, diff)
     values ($1, $2, 'tenant.create', 'tenant', $3, $4::jsonb)`,
    [
      tenantId,
      actor,
      tenantId,
      JSON.stringify({
        slug,
        denomination: input.denomination,
        plan: FREE_PLAN,
        via: "platform-db",
      }),
    ],
  );
  if (!profileExisted) {
    await tx.query(
      `insert into audit_log (tenant_id, actor_user_id, action, entity, entity_id, diff)
       values (null, $1, 'profile.create', 'profile', $2, $3::jsonb)`,
      [actor, owner.authUserId, JSON.stringify({ via: "platform-db" })],
    );
  }
  return { ok: true, tenantId, slug, personId, profileExisted };
}

/**
 * Validates the input (Hungarian Zod error map) and creates the church. Expected failures are
 * results, never exceptions: invalid input, a reserved/invalid/taken slug, a taken e-mail, a missing
 * free plan. Anything else (connection, permission) throws.
 */
export interface CreateTenantOptions {
  readonly db?: Pick<PlatformDb, "transaction">;
  /**
   * Operator path (platform console, `server/platform-db` internals): allows a reserved slug such as
   * `golgota`. Self-serve signup (`server/signup.ts`) never sets it and has no way to pass it on.
   */
  readonly allowReserved?: boolean;
  /** The church's own config overrides, written with the tenant row (site builder draft apply). */
  readonly siteConfig?: Record<string, unknown>;
  /**
   * Runs inside the same transaction right after the church exists (fresh-tenant INSERT-only seeding,
   * 0027_site_builder). A throw rolls the whole church back.
   */
  readonly seed?: (tx: PlatformQueryable, tenantId: string) => Promise<void>;
}

export async function createTenant(
  rawInput: CreateTenantInput,
  options: CreateTenantOptions = {},
): Promise<CreateTenantResult> {
  const parsed = CreateTenantInputSchema.safeParse(rawInput, { error: huZodErrorMap });
  if (!parsed.success) {
    return {
      ok: false,
      reason: "invalid",
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    };
  }
  const slug = checkSlug(parsed.data.slug, { allowReserved: options.allowReserved === true });
  if (!slug.ok)
    return { ok: false, reason: slug.reason === "reserved" ? "slug_reserved" : "slug_invalid" };

  const source = options.db ?? (await getPlatformDb());
  let result: CreateTenantResult;
  try {
    result = await source.transaction(async (tx) => {
      const created = await bootstrap(tx, parsed.data, slug.slug, options.siteConfig);
      if (created.ok && options.seed) await options.seed(tx, created.tenantId);
      return created;
    });
  } catch (error) {
    const mapped = mapConstraintError(error);
    if (mapped === null) throw error;
    return mapped;
  }
  if (result.ok) invalidateTenantHosts({ slug: result.slug }); // a cached "unknown" must not hide it
  return result;
}
