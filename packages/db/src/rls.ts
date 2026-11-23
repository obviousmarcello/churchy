/**
 * Row-level security conventions (D-03, SDD §4.2) and the automated check of the live catalog.
 *
 * `rlsViolations()` inspects `pg_class` / `pg_policy` / the grants of a migrated database and
 * lists everything that breaks the isolation rules below. The DB test suite asserts that the list
 * is empty, so CI fails as soon as a migration adds a table without a policy (or forgets FORCE,
 * or grants something to Supabase's PostgREST roles).
 *
 * Rules:
 * 1. Every `public` table is classified in `TABLE_SCOPES`, has RLS enabled AND forced.
 * 2. Tenant and catalog tables have exactly the canonical `tenant_isolation` policy for
 *    `churchy_app` (all commands, USING and WITH CHECK `tenant_id = app.current_tenant_id()`).
 *    Catalog tables additionally have `catalog_read`. Only `HR_TABLES` may carry further
 *    policies (the diocesan `app.org_id` branch of D-84, SDD §25.7).
 * 3. Any other table with a `tenant_id` column (platform scope) has no policy and no grant for
 *    `churchy_app` — it is denied by default.
 * 4. No policy targets PUBLIC or the Supabase roles `anon` / `authenticated`, and those roles
 *    (and PUBLIC) hold no privilege on any `public` table.
 * 5. `churchy_app` is not a superuser, has no BYPASSRLS, owns no table and is not a member of
 *    a table owner role.
 * 6. `churchy_music` (music module via PostgREST, ADR-20) likewise; it holds privileges on
 *    `MUSIC_TABLES` only, and the policies of exactly those tables apply to it (rule 2 then
 *    expects `churchy_app, churchy_music`).
 */
import type pg from "pg";
import { HR_TABLES, MUSIC_TABLES, TABLE_SCOPES, type TableScope } from "./table-scopes";

/** The role the application connects as (never the table owner). */
export const APP_ROLE = "churchy_app";
/** The role of the music module's per-request JWT (PostgREST); music tables only. */
export const MUSIC_ROLE = "churchy_music";
/** Supabase roles that PostgREST uses for client (browser) requests. */
export const POSTGREST_ROLES = ["anon", "authenticated"] as const;
export const TENANT_POLICY = "tenant_isolation";
export const CATALOG_READ_POLICY = "catalog_read";

/** `pg_get_expr` output of the canonical policy expressions. */
export const TENANT_EXPR = "(tenant_id = ( SELECT app.current_tenant_id() AS current_tenant_id))";
export const CATALOG_READ_EXPR =
  "((tenant_id IS NULL) AND (( SELECT app.current_tenant_id() AS current_tenant_id) IS NOT NULL))";

type Queryable = Pick<pg.Pool | pg.PoolClient, "query">;

type TableRow = {
  table: string;
  rls: boolean;
  forced: boolean;
  owner: string;
  has_tenant_id: boolean;
  app_privileges: boolean;
  music_privileges: boolean;
};

type PolicyRow = {
  table: string;
  name: string;
  cmd: string;
  permissive: boolean;
  roles: string[];
  qual: string | null;
  with_check: string | null;
};

/**
 * Lists every violation of the RLS rules in schema `public`; `[]` means compliant. `scopes`
 * defaults to `TABLE_SCOPES` (tests pass extra fixture tables).
 */
export async function rlsViolations(
  db: Queryable,
  scopes: Readonly<Record<string, TableScope>> = TABLE_SCOPES,
  hrTables: readonly string[] = HR_TABLES,
  musicTables: readonly string[] = MUSIC_TABLES,
): Promise<string[]> {
  const problems: string[] = [];

  for (const name of [APP_ROLE, MUSIC_ROLE]) {
    const role = await db.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
      "select rolsuper, rolbypassrls from pg_catalog.pg_roles where rolname = $1",
      [name],
    );
    const r = role.rows[0];
    if (r === undefined) return [`role ${name} does not exist`];
    if (r.rolsuper) problems.push(`${name} is a superuser`);
    if (r.rolbypassrls) problems.push(`${name} has BYPASSRLS`);
  }

  const tables = (
    await db.query<TableRow>(
      `select c.relname as table, c.relrowsecurity as rls, c.relforcerowsecurity as forced,
              pg_catalog.pg_get_userbyid(c.relowner) as owner,
              exists (select 1 from pg_catalog.pg_attribute a
                      where a.attrelid = c.oid and a.attname = 'tenant_id' and not a.attisdropped)
                as has_tenant_id,
              pg_catalog.has_table_privilege($1, c.oid,
                'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') as app_privileges,
              pg_catalog.has_table_privilege($2, c.oid,
                'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') as music_privileges
       from pg_catalog.pg_class c
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r', 'p')
       order by c.relname`,
      [APP_ROLE, MUSIC_ROLE],
    )
  ).rows;

  const policies = (
    await db.query<PolicyRow>(
      `select c.relname as table, p.polname as name, p.polcmd::text as cmd,
              p.polpermissive as permissive,
              array(select case when r = 0 then 'public' else pg_catalog.pg_get_userbyid(r) end
                    from unnest(p.polroles) r)::text[] as roles,
              pg_catalog.pg_get_expr(p.polqual, p.polrelid) as qual,
              pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) as with_check
       from pg_catalog.pg_policy p
       join pg_catalog.pg_class c on c.oid = p.polrelid
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'`,
    )
  ).rows;
  const policiesOf = (table: string) => policies.filter((p) => p.table === table);

  for (const t of tables) {
    const scope = scopes[t.table];
    const where = `${t.table}:`;
    const own = policiesOf(t.table);
    if (scope === undefined) problems.push(`${where} not classified in TABLE_SCOPES`);
    if (!t.rls) problems.push(`${where} row-level security is not enabled`);
    if (!t.forced) problems.push(`${where} row-level security is not forced`);
    if (t.owner === APP_ROLE) problems.push(`${where} owned by ${APP_ROLE}`);
    if (t.owner === MUSIC_ROLE) problems.push(`${where} owned by ${MUSIC_ROLE}`);
    const music = musicTables.includes(t.table);
    if (!music && t.music_privileges) problems.push(`${where} granted to ${MUSIC_ROLE}`);
    if (!music && own.some((p) => p.roles.includes(MUSIC_ROLE))) {
      problems.push(`${where} a policy applies to ${MUSIC_ROLE}`);
    }
    const policyRoles = music ? `${APP_ROLE},${MUSIC_ROLE}` : APP_ROLE;

    for (const p of own) {
      const exposed = p.roles.filter((r) => r === "public" || isPostgrestRole(r));
      if (exposed.length > 0) {
        problems.push(`${where} policy ${p.name} applies to ${exposed.join(", ")}`);
      }
    }

    // Unclassified tables with a tenant_id are checked like tenant tables: they need the policy.
    const tenantOwned =
      scope === "tenant" || scope === "catalog" || (scope === undefined && t.has_tenant_id);
    if (tenantOwned) {
      if (!t.has_tenant_id) problems.push(`${where} has no tenant_id column`);
      const tenantPolicy = own.find((p) => p.name === TENANT_POLICY);
      if (tenantPolicy === undefined) {
        problems.push(`${where} no ${TENANT_POLICY} policy`);
      } else {
        if (!tenantPolicy.permissive || tenantPolicy.cmd !== "*") {
          problems.push(`${where} ${TENANT_POLICY} must be PERMISSIVE FOR ALL`);
        }
        if ([...tenantPolicy.roles].sort().join(",") !== policyRoles) {
          problems.push(`${where} ${TENANT_POLICY} must apply to ${policyRoles} only`);
        }
        if (tenantPolicy.qual !== TENANT_EXPR || tenantPolicy.with_check !== TENANT_EXPR) {
          problems.push(`${where} ${TENANT_POLICY} expression is not the canonical one`);
        }
      }
      const allowed = new Set([TENANT_POLICY]);
      if (scope === "catalog") {
        allowed.add(CATALOG_READ_POLICY);
        const read = own.find((p) => p.name === CATALOG_READ_POLICY);
        if (
          read === undefined ||
          read.cmd !== "r" ||
          [...read.roles].sort().join(",") !== policyRoles ||
          read.qual !== CATALOG_READ_EXPR
        ) {
          problems.push(`${where} missing or non-canonical ${CATALOG_READ_POLICY} policy`);
        }
      }
      if (!hrTables.includes(t.table)) {
        for (const p of own) {
          if (!allowed.has(p.name)) problems.push(`${where} unexpected policy ${p.name}`);
        }
      }
    } else if (t.has_tenant_id || scope === "platform") {
      // Platform tables are denied to the app role by default (no grant, no policy).
      if (own.length > 0) {
        problems.push(`${where} platform table has policies (${own.map((p) => p.name)})`);
      }
      if (t.app_privileges) problems.push(`${where} platform table is granted to ${APP_ROLE}`);
    }
  }

  // Rule 4: no grants to PUBLIC / PostgREST roles on any public table.
  const exposed = await db.query<{ table: string; grantee: string; privilege: string }>(
    `select c.relname as table,
            case when a.grantee = 0 then 'public' else pg_catalog.pg_get_userbyid(a.grantee) end
              as grantee,
            a.privilege_type as privilege
     from pg_catalog.pg_class c
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     cross join lateral pg_catalog.aclexplode(c.relacl) a
     where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'S')
       and (a.grantee = 0 or pg_catalog.pg_get_userbyid(a.grantee) = any($1))
     order by 1, 2, 3`,
    [POSTGREST_ROLES as unknown as string[]],
  );
  for (const g of exposed.rows) {
    problems.push(`${g.table}: ${g.privilege} granted to ${g.grantee}`);
  }

  // Rules 5, 6: the app and music roles must not inherit owner rights.
  const owners = [...new Set(tables.map((t) => t.owner))];
  for (const role of [APP_ROLE, MUSIC_ROLE]) {
    for (const owner of owners) {
      const member = await db.query<{ ok: boolean }>(
        "select pg_catalog.pg_has_role($1, $2, 'MEMBER') as ok",
        [role, owner],
      );
      if (member.rows[0]?.ok) problems.push(`${role} is a member of table owner ${owner}`);
    }
  }

  return problems;
}

function isPostgrestRole(role: string): boolean {
  return (POSTGREST_ROLES as readonly string[]).includes(role);
}
