/**
 * Tenant isolation suite (D-03, SDD §4.2): `pnpm test:isolation`.
 *
 * Against a real, DISPOSABLE Postgres (TEST_DATABASE_URL; refuses APP_ENV=staging/production):
 * migrates, loads the demo fixtures (3 churches + diocese), then connects as the application
 * role `churchy_app` — not the owner, no BYPASSRLS — and, for EVERY tenant and catalog table of
 * the live catalog, attempts cross-tenant SELECT / INSERT / UPDATE / DELETE. It also covers
 * queries without a context, a diocesan (`app.org_id`-only) session, a transaction with both
 * settings, platform tables and Supabase's PostgREST roles, and runs the RLS catalog check
 * (`rlsViolations`) on the schema and on fixture tables that break the rules.
 *
 * With REQUIRE_TEST_DATABASE=1 (CI, `pnpm test:isolation`) a missing TEST_DATABASE_URL fails the
 * run instead of skipping it.
 */
import { createCipheriv, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEMO_TENANT_IDS } from "@churchy/data-mock";
import { sql } from "drizzle-orm";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { contextSettings, createDb, createPool, withContext } from "./client";
import { migrateUp } from "./migrate";
import { APP_ROLE, POSTGREST_ROLES, rlsViolations } from "./rls";
import { seedDemo, type SeedEncryptor } from "./seed/demo";
import { demoUuid } from "./seed/ids";
import { HR_TABLES, TABLE_SCOPES, tablesWithScope, type TableScope } from "./table-scopes";

const url = process.env.TEST_DATABASE_URL;
const unsafeEnv = ["staging", "production"].includes(process.env.APP_ENV ?? "");
if (process.env.REQUIRE_TEST_DATABASE === "1" && (!url || unsafeEnv)) {
  throw new Error(
    "The isolation suite needs TEST_DATABASE_URL (disposable database, not staging/production)",
  );
}
const AUTH_STUB = fileURLToPath(new URL("../sql/supabase-auth-stub.sql", import.meta.url));
const NOW = new Date("2026-11-18T10:00:00+01:00");

const A = demoUuid(DEMO_TENANT_IDS.catholic);
const B = demoUuid(DEMO_TENANT_IDS.reformed);
const actor = { userId: null, personId: null };

/** Tables whose rows belong to a tenant: tenant scope + catalog (tenant rows next to platform rows). */
const TENANT_OWNED = [...tablesWithScope("tenant"), ...tablesWithScope("catalog")].sort();
const PLATFORM = tablesWithScope("platform").sort();
const RLS_REJECTED = { code: "42501", message: expect.stringMatching(/row-level security/) };

function testEncryptor(): SeedEncryptor {
  const key = randomBytes(32);
  return {
    encrypt(_tenantId, plaintext) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), body]);
    },
  };
}

type Scope = { tenantId?: string; orgId?: string } | { raw: { tenantId: string; orgId: string } };

describe.skipIf(!url || unsafeEnv)("tenant isolation (D-03, TEST_DATABASE_URL)", () => {
  let owner: pg.Pool;
  /** Connections as the application role (`-c role=churchy_app`: RLS and grants of churchy_app). */
  let app: pg.Pool;
  const insertable = new Map<string, string[]>();

  const ownerQuery = async <T extends pg.QueryResultRow>(text: string, values?: unknown[]) =>
    (await owner.query<T>(text, values)).rows;

  const ownerCount = async (table: string, tenantId: string | null) =>
    Number(
      (
        await ownerQuery<{ n: string }>(
          `select count(*) as n from "${table}" where tenant_id is not distinct from $1`,
          [tenantId],
        )
      )[0]?.n,
    );

  /**
   * Runs `fn` as churchy_app in a transaction scoped like the DB adapter does (withContext's
   * `set_config(…, true)`), and always rolls back. `raw` sets both settings, bypassing the Ctx
   * validation, to prove the database refuses that state too.
   */
  async function asApp<T>(scope: Scope, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await app.connect();
    try {
      await client.query("begin");
      const s =
        "raw" in scope
          ? scope.raw
          : contextSettings({ tenantId: scope.tenantId, orgId: scope.orgId, actor });
      await client.query(
        "select set_config('app.tenant_id', $1, true), set_config('app.org_id', $2, true)",
        [s.tenantId, s.orgId],
      );
      return await fn(client);
    } finally {
      await client.query("rollback").catch(() => undefined);
      client.release();
    }
  }

  /** Runs one statement in a savepoint; returns its result or the database error. */
  async function attempt(
    c: pg.PoolClient,
    text: string,
    values?: unknown[],
  ): Promise<
    { rowCount: number | null; rows: pg.QueryResultRow[] } | { code: string; message: string }
  > {
    await c.query("savepoint attempt");
    try {
      const res = await c.query(text, values);
      await c.query("release savepoint attempt");
      return { rowCount: res.rowCount, rows: res.rows };
    } catch (error) {
      await c.query("rollback to savepoint attempt");
      const e = error as { code?: string; message?: string };
      return { code: e.code ?? "", message: e.message ?? "" };
    }
  }

  /** INSERT … SELECT the non-generated columns of a row given as JSON (keeps every value). */
  const insertCopy = (table: string) => {
    const cols = insertable
      .get(table)!
      .map((c) => `"${c}"`)
      .join(", ");
    return `insert into "${table}" (${cols}) select ${cols} from json_populate_record(null::public."${table}", $1::json)`;
  };

  const sampleRow = async (table: string, tenantId: string) =>
    (
      await ownerQuery<{ row: unknown }>(
        `select row_to_json(t) as row from "${table}" t where tenant_id = $1 limit 1`,
        [tenantId],
      )
    )[0]?.row;

  beforeAll(async () => {
    owner = createPool(url);
    await owner.query(readFileSync(AUTH_STUB, "utf8")); // idempotent
    await migrateUp(owner);
    await seedDemo(createDb(owner), { now: NOW, encryptor: testEncryptor(), appEnv: "test" });
    await supplementFixtures(owner);
    app = new pg.Pool({ connectionString: url, max: 2, options: `-c role=${APP_ROLE}` });

    const cols = await ownerQuery<{ table: string; cols: string[] }>(
      `select c.relname as table, array_agg(a.attname::text order by a.attnum) as cols
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       join pg_attribute a on a.attrelid = c.oid
       where n.nspname = 'public' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
         and a.attgenerated = ''
       group by c.relname`,
    );
    for (const r of cols) insertable.set(r.table, r.cols);
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
  });

  describe("roles and catalog (AC1, AC2)", () => {
    it("connects the suite as churchy_app, which is no superuser and has no BYPASSRLS", async () => {
      const who = await asApp(
        { tenantId: A },
        async (c) => (await c.query("select current_user as u")).rows[0],
      );
      expect(who).toEqual({ u: APP_ROLE });
      const [role] = await ownerQuery<{
        rolsuper: boolean;
        rolbypassrls: boolean;
        rolcanlogin: boolean;
      }>("select rolsuper, rolbypassrls, rolcanlogin from pg_roles where rolname = $1", [APP_ROLE]);
      expect(role).toEqual({ rolsuper: false, rolbypassrls: false, rolcanlogin: false });
    });

    it("churchy_app owns no table and is not a member of the owner role", async () => {
      const rows = await ownerQuery<{ owner: string; member: boolean }>(
        `select distinct pg_get_userbyid(c.relowner) as owner,
                pg_has_role($1, c.relowner, 'MEMBER') as member
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind = 'r'`,
        [APP_ROLE],
      );
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) {
        expect(r.owner).not.toBe(APP_ROLE);
        expect(r.member, r.owner).toBe(false);
      }
    });

    it("RLS is enabled and forced on 100 % of public tables", async () => {
      const rows = await ownerQuery<{ relname: string; on: boolean; forced: boolean }>(
        `select c.relname, c.relrowsecurity as on, c.relforcerowsecurity as forced
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind = 'r'`,
      );
      expect(rows.map((r) => r.relname).sort()).toEqual(Object.keys(TABLE_SCOPES).sort());
      expect(rows.filter((r) => !r.on || !r.forced).map((r) => r.relname)).toEqual([]);
    });

    it("the live catalog has no RLS violation (CI check)", async () => {
      expect(await rlsViolations(owner)).toEqual([]);
    });

    describe("the CI check fails on fixture tables that break the rules", () => {
      /** Creates fixture tables in a transaction, runs the check, rolls back. */
      async function violationsWith(ddl: string, scopes: Record<string, TableScope> = {}) {
        const client = await owner.connect();
        try {
          await client.query("begin");
          await client.query(ddl);
          const all = await rlsViolations(client, { ...TABLE_SCOPES, ...scopes });
          return all.filter((v) => v.startsWith("rls_fixture:") || v.startsWith(APP_ROLE));
        } finally {
          await client.query("rollback");
          client.release();
        }
      }
      const fixture = `create table public.rls_fixture (id uuid primary key, tenant_id uuid not null)`;
      const policy = (using: string, to = APP_ROLE) =>
        `create policy tenant_isolation on public.rls_fixture for all to ${to}
           using (${using}) with check (${using})`;
      const canonical = "tenant_id = (select app.current_tenant_id())";

      it("unclassified table with tenant_id and RLS enabled but no policy", async () => {
        const v = await violationsWith(
          `${fixture}; alter table public.rls_fixture enable row level security`,
        );
        expect(v).toEqual(
          expect.arrayContaining([
            "rls_fixture: not classified in TABLE_SCOPES",
            "rls_fixture: row-level security is not forced",
            "rls_fixture: no tenant_isolation policy",
          ]),
        );
      });

      it("classified tenant table, RLS forced, but no policy", async () => {
        const v = await violationsWith(
          `${fixture}; alter table public.rls_fixture enable row level security;
           alter table public.rls_fixture force row level security`,
          { rls_fixture: "tenant" },
        );
        expect(v).toEqual(["rls_fixture: no tenant_isolation policy"]);
      });

      it("table without RLS at all", async () => {
        const v = await violationsWith(fixture, { rls_fixture: "tenant" });
        expect(v).toEqual(
          expect.arrayContaining([
            "rls_fixture: row-level security is not enabled",
            "rls_fixture: row-level security is not forced",
          ]),
        );
      });

      it("a permissive policy that does not check the tenant", async () => {
        const v = await violationsWith(
          `${fixture}; alter table public.rls_fixture enable row level security;
           alter table public.rls_fixture force row level security; ${policy("true")}`,
          { rls_fixture: "tenant" },
        );
        expect(v).toEqual(["rls_fixture: tenant_isolation expression is not the canonical one"]);
      });

      it("a policy for PUBLIC / an extra policy on a non-HR table", async () => {
        const v = await violationsWith(
          `${fixture}; alter table public.rls_fixture enable row level security;
           alter table public.rls_fixture force row level security; ${policy(canonical, "public")};
           create policy anything on public.rls_fixture for select to ${APP_ROLE} using (true)`,
          { rls_fixture: "tenant" },
        );
        expect(v).toEqual(
          expect.arrayContaining([
            "rls_fixture: policy tenant_isolation applies to public",
            "rls_fixture: tenant_isolation must apply to churchy_app only",
            "rls_fixture: unexpected policy anything",
          ]),
        );
      });

      it("a compliant fixture table passes", async () => {
        const v = await violationsWith(
          `${fixture}; alter table public.rls_fixture enable row level security;
           alter table public.rls_fixture force row level security; ${policy(canonical)}`,
          { rls_fixture: "tenant" },
        );
        expect(v).toEqual([]);
      });

      it("a platform table granted to the app role, and grants to anon / authenticated", async () => {
        const v = await violationsWith(
          `create table public.rls_fixture (id uuid primary key, tenant_id uuid);
           alter table public.rls_fixture enable row level security;
           alter table public.rls_fixture force row level security;
           grant select on public.rls_fixture to ${APP_ROLE}, ${POSTGREST_ROLES.join(", ")}`,
          { rls_fixture: "platform" },
        );
        expect(v).toEqual([
          "rls_fixture: platform table is granted to churchy_app",
          "rls_fixture: SELECT granted to anon",
          "rls_fixture: SELECT granted to authenticated",
        ]);
      });

      it("an app role with BYPASSRLS", async () => {
        const v = await violationsWith(`alter role ${APP_ROLE} bypassrls`);
        expect(v).toContain(`${APP_ROLE} has BYPASSRLS`);
      });
    });
  });

  describe("fixtures", () => {
    it("every tenant and catalog table has rows of both tenants (100 % coverage)", async () => {
      const missing: string[] = [];
      for (const table of TENANT_OWNED) {
        if ((await ownerCount(table, A)) === 0) missing.push(`${table} (A)`);
        if ((await ownerCount(table, B)) === 0) missing.push(`${table} (B)`);
      }
      expect(missing, "add fixtures in supplementFixtures()").toEqual([]);
    });
  });

  describe.each(TENANT_OWNED)(
    "%s: tenant A cannot touch tenant B (AC: 100 % of tables)",
    (table) => {
      it("SELECT sees exactly A's rows and 0 of B's", async () => {
        const own = await ownerCount(table, A);
        const platformRows = TABLE_SCOPES[table] === "catalog" ? await ownerCount(table, null) : 0;
        const seen = await asApp({ tenantId: A }, async (c) => {
          const all = await c.query<{ n: string }>(`select count(*) as n from "${table}"`);
          const other = await c.query<{ n: string }>(
            `select count(*) as n from "${table}" where tenant_id = $1`,
            [B],
          );
          return { all: Number(all.rows[0]?.n), other: Number(other.rows[0]?.n) };
        });
        expect(seen).toEqual({ all: own + platformRows, other: 0 });
      });

      it("INSERT of a row for B is rejected; the same row for A passes RLS", async () => {
        const rowB = await sampleRow(table, B);
        const rowA = await sampleRow(table, A);
        await asApp({ tenantId: A }, async (c) => {
          expect(await attempt(c, insertCopy(table), [JSON.stringify(rowB)])).toEqual(RLS_REJECTED);
          // Positive control: A's own row gets past RLS and only fails on its unique key / overlap.
          const own = await attempt(c, insertCopy(table), [JSON.stringify(rowA)]);
          expect(["23505", "23P01"]).toContain("code" in own ? own.code : "inserted");
        });
      });

      it("UPDATE of B's rows affects 0 rows; moving an A row to B is rejected", async () => {
        const own = await ownerCount(table, A);
        await asApp({ tenantId: A }, async (c) => {
          const other = await attempt(
            c,
            `update "${table}" set tenant_id = tenant_id where tenant_id = $1`,
            [B],
          );
          expect(other).toMatchObject({ rowCount: 0 });
          // Positive control: the grant exists and A's rows are updatable.
          const mine = await attempt(
            c,
            `update "${table}" set tenant_id = tenant_id where tenant_id = $1`,
            [A],
          );
          expect(mine).toMatchObject({ rowCount: own });
          const move = await attempt(
            c,
            `update "${table}" set tenant_id = $1 where ctid = (select ctid from "${table}" where tenant_id = $2 limit 1)`,
            [B, A],
          );
          expect(move).toEqual(RLS_REJECTED);
        });
      });

      it("DELETE of B's rows affects 0 rows and B's rows survive", async () => {
        const before = await ownerCount(table, B);
        await asApp({ tenantId: A }, async (c) => {
          expect(
            await attempt(c, `delete from "${table}" where tenant_id = $1`, [B]),
          ).toMatchObject({
            rowCount: 0,
          });
          expect(
            await attempt(c, `delete from "${table}" where tenant_id <> $1`, [A]),
          ).toMatchObject({
            rowCount: 0,
          });
        });
        expect(await ownerCount(table, B)).toBe(before);
      });
    },
  );

  describe("catalog tables: platform rows are read-only for tenants", () => {
    it.each(tablesWithScope("catalog"))("%s", async (table) => {
      expect(await ownerCount(table, null)).toBeGreaterThan(0);
      const row = await ownerQuery<{ row: unknown }>(
        `select row_to_json(t) as row from "${table}" t where tenant_id is null limit 1`,
      );
      await asApp({ tenantId: A }, async (c) => {
        expect(
          await attempt(c, `update "${table}" set tenant_id = tenant_id where tenant_id is null`),
        ).toMatchObject({
          rowCount: 0,
        });
        expect(
          await attempt(c, `update "${table}" set tenant_id = $1 where tenant_id is null`, [A]),
        ).toMatchObject({
          rowCount: 0,
        });
        expect(await attempt(c, `delete from "${table}" where tenant_id is null`)).toMatchObject({
          rowCount: 0,
        });
        expect(await attempt(c, insertCopy(table), [JSON.stringify(row[0]?.row)])).toEqual(
          RLS_REJECTED,
        );
      });
    });
  });

  describe("sessions without a tenant context", () => {
    it.each(TENANT_OWNED)("no context: %s returns 0 rows and rejects writes", async (table) => {
      const rowA = await sampleRow(table, A);
      await asApp({}, async (c) => {
        const res = await c.query<{ n: string }>(`select count(*) as n from "${table}"`);
        expect(res.rows[0]?.n).toBe("0");
        expect(await attempt(c, insertCopy(table), [JSON.stringify(rowA)])).toEqual(RLS_REJECTED);
        expect(await attempt(c, `update "${table}" set tenant_id = tenant_id`)).toMatchObject({
          rowCount: 0,
        });
        expect(await attempt(c, `delete from "${table}"`)).toMatchObject({ rowCount: 0 });
      });
    });

    it.each(TENANT_OWNED)(
      "diocesan session (app.org_id only): %s returns 0 rows (the HR branch is D-84)",
      async (table) => {
        const [org] = await ownerQuery<{ id: string }>("select id from organizations limit 1");
        await asApp({ orgId: org!.id }, async (c) => {
          const res = await c.query<{ n: string }>(`select count(*) as n from "${table}"`);
          expect(res.rows[0]?.n).toBe("0");
        });
      },
    );

    it("HR tables are covered by the suite and have only the tenant policy so far", () => {
      for (const t of HR_TABLES) expect(TENANT_OWNED).toContain(t);
    });
  });

  describe("tenant and organization context never together (SDD §25.7)", () => {
    it.each(TENANT_OWNED)(
      "%s: the database refuses a transaction with both settings",
      async (table) => {
        const [org] = await ownerQuery<{ id: string }>("select id from organizations limit 1");
        await asApp({ raw: { tenantId: A, orgId: org!.id } }, async (c) => {
          expect(await attempt(c, `select count(*) from "${table}"`)).toEqual({
            code: "42501",
            message: expect.stringMatching(/never be set together/),
          });
        });
      },
    );

    it("withContext refuses a ctx carrying both, before touching the database", async () => {
      const db = createDb(app);
      await expect(
        withContext(db, { tenantId: A, orgId: B, actor }, async () => "ran"),
      ).rejects.toMatchObject({ code: "CONTEXT" });
    });
  });

  describe("the real adapter path (withContext on the app role)", () => {
    it("sees only the context tenant's rows", async () => {
      const db = createDb(app);
      const count = (tenantId: string) =>
        withContext(db, { tenantId, actor }, async (tx) => {
          const res = await tx.execute<{ a: string; b: string }>(
            sql`select count(*) filter (where tenant_id = ${A}) as a,
                       count(*) filter (where tenant_id = ${B}) as b from people`,
          );
          return res.rows[0];
        });
      expect(await count(A)).toEqual({ a: String(await ownerCount("people", A)), b: "0" });
      expect(await count(B)).toEqual({ a: "0", b: String(await ownerCount("people", B)) });
    });

    it("the setting does not leak into the next transaction on the same connection", async () => {
      const client = await app.connect();
      try {
        await client.query("begin");
        await client.query("select set_config('app.tenant_id', $1, true)", [A]);
        await client.query("commit");
        const res = await client.query<{ n: string }>("select count(*) as n from people");
        expect(res.rows[0]?.n).toBe("0");
      } finally {
        client.release();
      }
    });
  });

  describe("platform tables and Supabase PostgREST roles (deny by default)", () => {
    it.each(PLATFORM)("churchy_app cannot read or write %s", async (table) => {
      await asApp({ tenantId: A }, async (c) => {
        expect(await attempt(c, `select 1 from "${table}" limit 1`)).toMatchObject({
          code: "42501",
        });
        expect(await attempt(c, `delete from "${table}"`)).toMatchObject({ code: "42501" });
      });
    });

    it.each(POSTGREST_ROLES)("%s has no privilege on any public table", async (role) => {
      const rows = await ownerQuery<{ relname: string }>(
        `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'S')
           and (has_table_privilege($1, c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE')
                or exists (select 1 from aclexplode(c.relacl) a where a.grantee = 0))`,
        [role],
      );
      expect(rows.map((r) => r.relname)).toEqual([]);
    });

    it.each(POSTGREST_ROLES)("%s gets permission denied on every table", async (role) => {
      const client = await owner.connect();
      try {
        await client.query("begin");
        await client.query(`set local role ${role}`);
        await client.query("select set_config('app.tenant_id', $1, true)", [A]);
        for (const table of Object.keys(TABLE_SCOPES)) {
          await client.query("savepoint s");
          await expect(
            client.query(`select 1 from "${table}" limit 1`),
            table,
          ).rejects.toMatchObject({
            code: "42501",
          });
          await client.query("rollback to savepoint s");
        }
      } finally {
        await client.query("rollback");
        client.release();
      }
    });
  });
});

/**
 * The demo dataset leaves a few tenant tables empty for tenant B (the Reformed demo church).
 * Rows added here (as the owner) make every table testable for both tenants. Fictitious only.
 */
async function supplementFixtures(owner: pg.Pool): Promise<void> {
  // B requests a link to the demo diocese, made by the same (fictitious) diocesan user as A's.
  const [link] = (
    await owner.query<{ org_id: string; requested_by: string }>(
      "select org_id, requested_by from org_links where tenant_id = $1 limit 1",
      [A],
    )
  ).rows;
  if (link === undefined) throw new Error("demo seed has no org link for tenant A");
  await owner.query(
    `insert into org_links (org_id, tenant_id, status, requested_by)
     select $1, $2, 'requested', $3
     where not exists (select 1 from org_links where org_id = $1 and tenant_id = $2)`,
    [link.org_id, B, link.requested_by],
  );
  await owner.query(
    `insert into org_delegations (org_id, tenant_id, hr_category_key) values ($1, $2, '*')
     on conflict do nothing`,
    [link.org_id, B],
  );
  // A tenant-owned hymnal for A (the demo Catholic church only uses platform hymnals).
  await owner.query(
    `insert into hymnals (tenant_id, abbreviation, name)
     select $1, 'SAJ', 'Saját énekfüzet'
     where not exists (select 1 from hymnals where tenant_id = $1)`,
    [A],
  );
}
