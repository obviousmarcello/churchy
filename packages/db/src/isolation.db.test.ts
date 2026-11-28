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
import { createCipheriv, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEMO_TENANT_IDS } from "@churchy/data-mock";
import { sql } from "drizzle-orm";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { contextSettings, createDb, createPool, withContext } from "./client";
import { migrateUp } from "./migrate";
import { APP_ROLE, MUSIC_ROLE, POSTGREST_ROLES, rlsViolations } from "./rls";
import { seedDemo, type SeedEncryptor } from "./seed/demo";
import { demoUuid } from "./seed/ids";
import {
  HR_TABLES,
  MUSIC_SHARED_TABLES,
  MUSIC_TABLES,
  TABLE_SCOPES,
  tablesWithScope,
  type TableScope,
} from "./table-scopes";

const url = process.env.TEST_DATABASE_URL;
const unsafeEnv = ["staging", "production"].includes(process.env.APP_ENV ?? "");
if (process.env.REQUIRE_TEST_DATABASE === "1" && (!url || unsafeEnv)) {
  throw new Error(
    "The isolation suite needs TEST_DATABASE_URL (disposable database, not staging/production)",
  );
}
const AUTH_STUB = fileURLToPath(new URL("../sql/supabase-auth-stub.sql", import.meta.url));
const MUSIC_FIXTURES = fileURLToPath(new URL("../sql/music-fixtures.sql", import.meta.url));
const NOW = new Date("2026-11-18T10:00:00+01:00");

const A = demoUuid(DEMO_TENANT_IDS.catholic);
const B = demoUuid(DEMO_TENANT_IDS.reformed);
const actor = { userId: null, personId: null };

/** Tables whose rows belong to a tenant: tenant scope + catalog (tenant rows next to platform rows). */
const TENANT_OWNED = [...tablesWithScope("tenant"), ...tablesWithScope("catalog")].sort();
const PLATFORM = tablesWithScope("platform").sort();
/** Tables with a BEFORE UPDATE trigger that rejects every update (setlists never change). */
const IMMUTABLE_TABLES = ["setlists", "setlist_items"];
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

      it("churchy_music granted a non-music table, or named by its policy", async () => {
        const v = await violationsWith(
          `${fixture}; alter table public.rls_fixture enable row level security;
           alter table public.rls_fixture force row level security;
           create policy tenant_isolation on public.rls_fixture for all to ${APP_ROLE}, ${MUSIC_ROLE}
             using (${canonical}) with check (${canonical});
           grant select on public.rls_fixture to ${MUSIC_ROLE}`,
          { rls_fixture: "tenant" },
        );
        expect(v).toEqual(
          expect.arrayContaining([
            `rls_fixture: granted to ${MUSIC_ROLE}`,
            `rls_fixture: a policy applies to ${MUSIC_ROLE}`,
            `rls_fixture: tenant_isolation must apply to ${APP_ROLE} only`,
          ]),
        );
      });

      it("a music table whose policy leaves out churchy_music", async () => {
        const client = await owner.connect();
        try {
          await client.query("begin");
          await client.query(`alter policy tenant_isolation on public.songs to ${APP_ROLE}`);
          const v = await rlsViolations(client);
          expect(v).toEqual([
            `songs: tenant_isolation must apply to ${APP_ROLE},${MUSIC_ROLE} only`,
          ]);
        } finally {
          await client.query("rollback");
          client.release();
        }
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
          // Setlists are immutable by trigger (`prevent_setlist_update`, 0012): a row update fails
          // there, other tenants' rows are still invisible (0 rows, no trigger).
          if (IMMUTABLE_TABLES.includes(table)) {
            expect(mine).toMatchObject({ code: "P0001" });
            return;
          }
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

  describe("tenant JWT claim (music module via PostgREST, migration 0004, ADR-20)", () => {
    const SUB = "00000000-0000-4000-8000-000000000001";
    /** Like PostgREST: the verified JWT claims as the transaction-local `request.jwt.claims`. */
    const asClaims = <T>(
      claims: Record<string, unknown>,
      settings: { tenantId?: string; orgId?: string },
      fn: (c: pg.PoolClient) => Promise<T>,
    ) =>
      asApp(
        { raw: { tenantId: settings.tenantId ?? "", orgId: settings.orgId ?? "" } },
        async (c) => {
          await c.query("select set_config('request.jwt.claims', $1, true)", [
            JSON.stringify(claims),
          ]);
          return fn(c);
        },
      );
    const churchy = (tenantId: string) => ({ iss: "churchy", sub: SUB, tenant_id: tenantId });
    const count = async (c: pg.PoolClient, table: string, tenantId?: string) =>
      Number(
        (
          await c.query<{ n: string }>(
            `select count(*) as n from "${table}"${tenantId ? " where tenant_id = $1" : ""}`,
            tenantId ? [tenantId] : [],
          )
        ).rows[0]?.n,
      );

    it.each(TENANT_OWNED)(
      "%s: a churchy claim for A sees A's rows only and cannot write B's",
      async (table) => {
        const own = await ownerCount(table, A);
        const platformRows = TABLE_SCOPES[table] === "catalog" ? await ownerCount(table, null) : 0;
        const rowB = await sampleRow(table, B);
        await asClaims(churchy(A), {}, async (c) => {
          expect({ all: await count(c, table), other: await count(c, table, B) }).toEqual({
            all: own + platformRows,
            other: 0,
          });
          expect(await attempt(c, insertCopy(table), [JSON.stringify(rowB)])).toEqual(RLS_REJECTED);
        });
      },
    );

    it("ignores a tenant_id claim from any other issuer (e.g. Supabase Auth tokens)", async () => {
      for (const iss of [undefined, "https://example.supabase.co/auth/v1"]) {
        await asClaims({ iss, sub: SUB, tenant_id: A }, {}, async (c) => {
          expect(await count(c, "songs")).toBe(0);
        });
      }
    });

    it("refuses a claim together with app.org_id, or one that differs from app.tenant_id", async () => {
      const [org] = await ownerQuery<{ id: string }>("select id from organizations limit 1");
      await asClaims(churchy(A), { orgId: org!.id }, async (c) => {
        expect(await attempt(c, `select count(*) from "songs"`)).toMatchObject({ code: "42501" });
      });
      await asClaims(churchy(A), { tenantId: B }, async (c) => {
        expect(await attempt(c, `select count(*) from "songs"`)).toEqual({
          code: "42501",
          message: expect.stringMatching(/claim differ/),
        });
      });
      await asClaims(churchy(A), { tenantId: A }, async (c) => {
        expect(await count(c, "songs", A)).toBe(await ownerCount("songs", A));
      });
    });
  });

  describe("music role churchy_music (PostgREST with the churchy JWT, 0007_music_rls)", () => {
    /** Like PostgREST after verifying a churchy token: `SET LOCAL ROLE` + request.jwt.claims. */
    async function asMusic<T>(tenantId: string, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
      const client = await owner.connect();
      try {
        await client.query("begin");
        await client.query(`set local role ${MUSIC_ROLE}`);
        await client.query("select set_config('request.jwt.claims', $1, true)", [
          JSON.stringify({
            iss: "churchy",
            sub: "00000000-0000-4000-8000-000000000001",
            tenant_id: tenantId,
          }),
        ]);
        return await fn(client);
      } finally {
        await client.query("rollback").catch(() => undefined);
        client.release();
      }
    }

    it("is no superuser, has no BYPASSRLS, cannot log in and owns nothing", async () => {
      const [role] = await ownerQuery<{ s: boolean; b: boolean; l: boolean; owns: boolean }>(
        `select rolsuper as s, rolbypassrls as b, rolcanlogin as l,
                exists (select 1 from pg_class where relowner = r.oid) as owns
         from pg_roles r where rolname = $1`,
        [MUSIC_ROLE],
      );
      expect(role).toEqual({ s: false, b: false, l: false, owns: false });
    });

    it.each(MUSIC_TABLES)("%s: sees A's rows only and cannot write B's", async (table) => {
      // Shared Churchy tables: the music role sees only the music calendar and its events (the
      // fixtures have none), see "music_scope" in 0011_music_events.
      const shared = (MUSIC_SHARED_TABLES as readonly string[]).includes(table);
      const own = shared ? 0 : await ownerCount(table, A);
      const platformRows = TABLE_SCOPES[table] === "catalog" ? await ownerCount(table, null) : 0;
      const rowB = await sampleRow(table, B);
      await asMusic(A, async (c) => {
        const all = await c.query<{ n: string }>(`select count(*) as n from "${table}"`);
        expect(Number(all.rows[0]?.n)).toBe(own + platformRows);
        expect(await attempt(c, insertCopy(table), [JSON.stringify(rowB)])).toEqual(RLS_REJECTED);
        expect(await attempt(c, `delete from "${table}" where tenant_id = $1`, [B])).toMatchObject({
          rowCount: 0,
        });
      });
    });

    it("events: the music role reaches only the tenant's music calendar and its events", async () => {
      const [other] = await ownerQuery<{ id: string }>(
        "select id from calendars where tenant_id = $1 limit 1",
        [A],
      );
      const insert = (calendarId: string, slug: string) =>
        `insert into events (tenant_id, calendar_id, visibility, slug, title, starts_at, status)
         values ('${A}', '${calendarId}', 'staff', '${slug}', 'Próba', now(), 'published')`;
      await asMusic(A, async (c) => {
        // The event of a non-music calendar (public or internal) is out of scope.
        expect(await attempt(c, insert(other!.id, "music-scope-a"))).toEqual(RLS_REJECTED);
        expect((await c.query("select 1 from calendars")).rowCount).toBe(0);
        // music_calendar_id() creates the calendar once; then events fit and only they are seen.
        const first = (await c.query<{ id: string }>("select public.music_calendar_id() as id"))
          .rows[0]!.id;
        const again = (await c.query<{ id: string }>("select public.music_calendar_id() as id"))
          .rows[0]!.id;
        expect(again).toBe(first);
        await c.query(insert(first, "music-scope-b"));
        expect((await c.query("select 1 from events")).rowCount).toBe(1);
        expect(await attempt(c, `update calendars set is_music = false`)).toEqual(RLS_REJECTED);
      });
    });

    it("event setlists: items replace the setlist, blocks stay in one run, the old setlist is deleted", async () => {
      const [arr] = await ownerQuery<{ id: string; song_id: string }>(
        "select id, song_id from arrangements where tenant_id = $1 limit 1",
        [A],
      );
      await asMusic(A, async (c) => {
        const cal = (await c.query<{ id: string }>("select public.music_calendar_id() as id"))
          .rows[0]!.id;
        const ev = (
          await c.query<{ id: string }>(
            `insert into events (tenant_id, calendar_id, visibility, slug, title, starts_at, ends_at, status)
             values ('${A}', '${cal}', 'staff', 'items-test', 'Próba', now() + interval '1 day',
                     now() + interval '1 day 90 minutes', 'published') returning id`,
          )
        ).rows[0]!.id;
        const items = JSON.stringify([
          { arrangement_id: arr!.id, musical_key: "G" },
          { title: "Köszöntés", notes: "röviden" },
          { arrangement_id: arr!.id },
        ]);
        const saved = (
          await c.query("select public.set_event_items($1, $2::jsonb, null, false) as r", [
            ev,
            items,
          ])
        ).rows[0]!.r;
        expect(saved.status).toBe("saved");
        const first = saved.setlist_id as string;
        const rows = (
          await c.query<{ key: string; position: number }>(
            "select key, position from setlist_items where setlist_id = $1 order by position",
            [first],
          )
        ).rows;
        expect(rows.map((r) => r.position)).toEqual([0, 1, 2]);
        // A block over the first two items; then removing the middle item splits nothing it keeps.
        const block = (
          await c.query(
            "select public.create_event_block($1, $2::uuid[], 'Dicsőítés', 'off', null) as r",
            [ev, [rows[0]!.key, rows[1]!.key]],
          )
        ).rows[0]!.r;
        expect(block.status).toBe("created");
        // Add a song after item 0 (inside the block: it joins it), then remove the last item.
        expect(
          (
            await c.query("select public.add_event_items($1, $2::jsonb, $3) as r", [
              ev,
              JSON.stringify([{ arrangement_id: arr!.id }]),
              rows[0]!.key,
            ])
          ).rows[0]!.r,
        ).toBe("added");
        const now = (
          await c.query<{ setlist_id: string }>("select setlist_id from events where id = $1", [ev])
        ).rows[0]!.setlist_id;
        expect(now).not.toBe(first);
        // The previous setlist is gone (nothing refers to it) and the block covers 3 items.
        expect((await c.query("select 1 from setlists where id = $1", [first])).rowCount).toBe(0);
        expect(
          (await c.query("select 1 from setlist_item_blocks where event_id = $1", [ev])).rowCount,
        ).toBe(3);
        expect(
          (await c.query("select public.remove_event_item($1, $2) as r", [ev, rows[2]!.key]))
            .rows[0]!.r,
        ).toBe("removed");
        // Unchanged items: the same setlist stays.
        const same = (
          await c.query(
            "select public.set_event_items($1, public.setlist_items_input($2), null, false) as r",
            [
              ev,
              (
                await c.query<{ setlist_id: string }>(
                  "select setlist_id from events where id = $1",
                  [ev],
                )
              ).rows[0]!.setlist_id,
            ],
          )
        ).rows[0]!.r;
        expect(same.status).toBe("saved");
        // Play statistics: the song is planned in this (future) event; a past event counts as played
        // and orders the "recent" sort first.
        const stats = (
          await c.query("select public.song_play_stats(array[$1]::uuid[], null) as r", [
            arr!.song_id,
          ])
        ).rows[0]!.r;
        expect(stats[arr!.song_id].next_event.id).toBe(ev);
        await c.query(
          "update events set starts_at = now() - interval '2 days', ends_at = now() - interval '2 days' + interval '90 minutes' where id = $1",
          [ev],
        );
        const after = (
          await c.query("select public.song_play_stats(array[$1]::uuid[], null) as r", [
            arr!.song_id,
          ])
        ).rows[0]!.r;
        expect(after[arr!.song_id].recent_count).toBe(1);
        const sorted = (
          await c.query(
            "select public.filter_songs('', null, null, null, null, null, 'recent', 25, 0, null) as r",
          )
        ).rows[0]!.r;
        expect(sorted.ids[0]).toBe(arr!.song_id);
        // The deferred check of `setlists_check` (items equal the setlist) passes at commit.
        await c.query("set constraints all immediate");
      });
    });

    it("areas: events are seen by the members of their areas; copy_event copies the team and items", async () => {
      const profiles = await ownerQuery<{ id: string }>(
        "select id from profiles order by id limit 2",
      );
      const [member, other] = [profiles[0]!.id, profiles[1]!.id];
      const [arr] = await ownerQuery<{ id: string }>(
        "select id from arrangements where tenant_id = $1 limit 1",
        [A],
      );
      await asMusic(A, async (c) => {
        const root = (await c.query<{ id: string }>("select public.music_root_area_id() as id"))
          .rows[0]!.id;
        expect(
          (await c.query<{ id: string }>("select public.music_root_area_id() as id")).rows[0]!.id,
        ).toBe(root);
        const band = (
          await c.query<{ id: string }>("select public.create_service_area($1, 'Énekkar') as id", [
            root,
          ])
        ).rows[0]!.id;
        await c.query("select public.set_service_area_members($1, $2::jsonb, false, null)", [
          band,
          JSON.stringify([{ user_id: member, is_leader: false }]),
        ]);
        const cal = (await c.query<{ id: string }>("select public.music_calendar_id() as id"))
          .rows[0]!.id;
        const add = (slug: string, areas: string) =>
          c.query<{ id: string }>(
            `insert into events (calendar_id, visibility, slug, title, starts_at, ends_at, status, area_ids)
             values ('${cal}', 'staff', '${slug}', 'Próba', now() + interval '2 days',
                     now() + interval '2 days 90 minutes', 'published', ${areas}) returning id`,
          );
        const all = (await add("areas-all", "'{}'")).rows[0]!.id;
        const ev = (await add("areas-band", `array['${band}']::uuid[]`)).rows[0]!.id;
        const seen = async (event: string, user: string) =>
          (await c.query<{ r: boolean }>("select public.can_see_event($1, $2) as r", [event, user]))
            .rows[0]!.r;
        // No areas means the root area (everyone); the band's event is for its members only.
        expect(await seen(all, other)).toBe(true);
        expect(await seen(ev, member)).toBe(true);
        expect(await seen(ev, other)).toBe(false);
        expect(
          (await c.query("select public.can_see_event($1, $2, true) as r", [ev, other])).rows[0]!.r,
        ).toBe(true);
        // Volunteers see their event, whatever its areas.
        await c.query("select public.set_event_area_team($1, $2, $3::jsonb, true)", [
          ev,
          band,
          JSON.stringify([other]),
        ]);
        expect(await seen(ev, other)).toBe(true);
        // Items with the volunteer on a song, then a copy with items and volunteers.
        await c.query("select public.set_event_items($1, $2::jsonb, null, false)", [
          ev,
          JSON.stringify([
            { arrangement_id: arr!.id, volunteer_id: other },
            { title: "Köszöntés" },
          ]),
        ]);
        const copy = (
          await c.query<{ id: string }>(
            "select public.copy_event(gen_random_uuid(), $1, 'Másolat', now() + interval '9 days', 90, null, true, true, null) as id",
            [ev],
          )
        ).rows[0]!.id;
        expect(
          (await c.query("select 1 from event_volunteers where event_id = $1", [copy])).rowCount,
        ).toBe(1);
        expect(
          (await c.query("select 1 from setlist_item_volunteers where event_id = $1", [copy]))
            .rowCount,
        ).toBe(1);
        expect(
          (
            await c.query(
              "select 1 from setlist_items i join events e on e.setlist_id = i.setlist_id where e.id = $1",
              [copy],
            )
          ).rowCount,
        ).toBe(2);
        await c.query("set constraints all immediate");
      });
    });

    it("images and announcements: items hold a set and an announcement; copy_event copies both", async () => {
      const uuid = () => randomUUID();
      await asMusic(A, async (c) => {
        const cal = (await c.query<{ id: string }>("select public.music_calendar_id() as id"))
          .rows[0]!.id;
        const ev = (
          await c.query<{ id: string }>(
            `insert into events (calendar_id, visibility, slug, title, starts_at, ends_at, status)
             values ('${cal}', 'staff', 'media-${uuid()}', 'Képes alkalom', now() + interval '3 days',
                     now() + interval '3 days 90 minutes', 'published') returning id`,
          )
        ).rows[0]!.id;
        const set = (
          await c.query<{ id: string }>(
            "insert into event_image_sets (event_id) values ($1) returning id",
            [ev],
          )
        ).rows[0]!.id;
        const path = `${ev}/${uuid()}.webp`;
        await c.query("select public.add_event_image($1, 'Kép', $2, 800, 600, 1000, 20, null)", [
          set,
          path,
        ]);
        const ann = (
          await c.query<{ id: string }>(
            "insert into event_announcements (event_id) values ($1) returning id",
            [ev],
          )
        ).rows[0]!.id;
        await c.query(
          "insert into event_announcement_entries (announcement_id, title, position, highlighted) values ($1, 'Hirdetés', 0, true)",
          [ann],
        );
        const saved = (
          await c.query("select public.set_event_items($1, $2::jsonb, null, false) as r", [
            ev,
            JSON.stringify([
              { title: "Képek", image_set_id: set },
              { title: "Hirdetések", announcement_id: ann },
            ]),
          ])
        ).rows[0]!.r;
        expect(saved.status).toBe("saved");
        // The set of another event is refused.
        const other = (
          await c.query<{ id: string }>(
            `insert into events (calendar_id, visibility, slug, title, starts_at, ends_at, status)
             values ('${cal}', 'staff', 'media-${uuid()}', 'Másik', now() + interval '4 days',
                     now() + interval '4 days 90 minutes', 'published') returning id`,
          )
        ).rows[0]!.id;
        await c.query("savepoint refused");
        await expect(
          c.query("select public.set_event_items($1, $2::jsonb, null, false)", [
            other,
            JSON.stringify([{ title: "Képek", image_set_id: set }]),
          ]),
        ).rejects.toMatchObject({ code: "P0001" });
        await c.query("rollback to savepoint refused");
        // copy_event: the files map gives the new paths (in the copy's folder).
        const copyId = uuid();
        const files = { [path]: `${copyId}/${uuid()}.webp` };
        await c.query(
          "select public.copy_event($1, $2, 'Másolat', now() + interval '10 days', 90, null, true, false, $3::jsonb)",
          [copyId, ev, JSON.stringify(files)],
        );
        expect(
          (await c.query("select 1 from event_images where event_id = $1", [copyId])).rowCount,
        ).toBe(1);
        expect(
          (
            await c.query(
              "select 1 from event_announcement_entries e join event_announcements a on a.id = e.announcement_id where a.event_id = $1",
              [copyId],
            )
          ).rowCount,
        ).toBe(1);
        expect(
          (
            await c.query(
              "select 1 from setlist_items i join events e on e.setlist_id = i.setlist_id where e.id = $1",
              [copyId],
            )
          ).rowCount,
        ).toBe(2);
        await c.query("set constraints all immediate");
      });
    });

    it("projection: the default theme stays, controllers block the delete of an event, realtime claims decide the topics", async () => {
      const uuid = () => randomUUID();
      const [profile] = await ownerQuery<{ id: string }>(
        "select id from profiles order by id limit 1",
      );
      await asMusic(A, async (c) => {
        // The default theme of the tenant: created once, and it cannot be deleted.
        const def = (
          await c.query<{ id: string }>("select public.default_projection_theme_id() as id")
        ).rows[0]!.id;
        expect(
          (await c.query<{ id: string }>("select public.default_projection_theme_id() as id"))
            .rows[0]!.id,
        ).toBe(def);
        await c.query("delete from projection_themes where id = $1", [def]);
        expect(await attempt(c, "set constraints all immediate")).toMatchObject({ code: "P0001" });
      });
      await asMusic(A, async (c) => {
        const def = (
          await c.query<{ id: string }>("select public.default_projection_theme_id() as id")
        ).rows[0]!.id;
        // Another theme becomes the default; the old default can then go.
        const other = (
          await c.query<{ id: string }>(
            `insert into projection_themes (name, background_color, font, text_color)
             values ('Másik ${uuid()}', '#101010', 'inter', '#ffffff') returning id`,
          )
        ).rows[0]!.id;
        expect(
          (await c.query("select public.set_default_projection_theme($1) as ok", [other])).rows[0]
            .ok,
        ).toBe(true);
        await c.query("delete from projection_themes where id = $1", [def]);
        await c.query("set constraints all immediate");
        expect(
          (await c.query("select is_default from projection_themes where id = $1", [other])).rows[0]
            .is_default,
        ).toBe(true);
        expect(
          (await c.query("select public.set_default_projection_theme($1) as ok", [uuid()])).rows[0]
            .ok,
        ).toBe(false);

        // The theme of an event; a deleted theme leaves the event with the default.
        const cal = (await c.query<{ id: string }>("select public.music_calendar_id() as id"))
          .rows[0]!.id;
        const ev = (
          await c.query<{ id: string }>(
            `insert into events (calendar_id, visibility, slug, title, starts_at, ends_at, status, projection_theme_id, created_by)
             values ('${cal}', 'staff', 'vetites-${uuid()}', 'Vetítés', now() + interval '3 days',
                     now() + interval '3 days 90 minutes', 'published', $1, $2) returning id`,
            [other, profile!.id],
          )
        ).rows[0]!.id;
        expect(
          (await c.query("select public.set_event_item_theme($1, $2, null) as r", [ev, uuid()]))
            .rows[0].r,
        ).toBe("no_item");
        expect(
          (await c.query("select public.set_event_item_theme($1, $2, null) as r", [uuid(), uuid()]))
            .rows[0].r,
        ).toBe("no_event");

        // The controllers: at most 5 rows per user and event, and an open one blocks the delete.
        for (let i = 0; i < 7; i++) {
          expect(
            (
              await c.query("select public.touch_projection_controller($1, $2, $3) as ok", [
                uuid(),
                ev,
                profile!.id,
              ])
            ).rows[0].ok,
          ).toBe(true);
        }
        expect(
          (
            await c.query(
              "select count(*)::int as n from event_projection_controllers where event_id = $1",
              [ev],
            )
          ).rows[0].n,
        ).toBe(5);
        await c.query("savepoint s");
        expect(await attempt(c, "delete from events where id = '" + ev + "'")).toMatchObject({
          code: "P0001",
        });
        await c.query("rollback to savepoint s");
        // The server ends the projections with a header: then the delete goes on.
        await c.query(
          "select set_config('request.headers', '{\"x-app-end-projections\":\"true\"}', true)",
        );
        await c.query("delete from events where id = $1", [ev]);
        expect(
          (
            await c.query(
              "select count(*)::int as n from event_projection_controllers where event_id = $1",
              [ev],
            )
          ).rows[0].n,
        ).toBe(0);
      });
    });

    it("live sessions: one running session per event, an event or a rehearsal list, never both", async () => {
      const uuid = () => randomUUID();
      const [profile] = await ownerQuery<{ id: string }>(
        "select id from profiles order by id limit 1",
      );
      await asMusic(A, async (c) => {
        const cal = (await c.query<{ id: string }>("select public.music_calendar_id() as id"))
          .rows[0]!.id;
        const ev = (
          await c.query<{ id: string }>(
            `insert into events (calendar_id, visibility, slug, title, starts_at, ends_at, status)
             values ('${cal}', 'staff', 'elo-${uuid()}', 'Élő alkalom', now() + interval '3 days',
                     now() + interval '3 days 90 minutes', 'published') returning id`,
          )
        ).rows[0]!.id;
        await c.query("insert into live_sessions (event_id, leader_id) values ($1, $2)", [
          ev,
          profile!.id,
        ]);
        await c.query("savepoint s1");
        expect(
          await attempt(
            c,
            `insert into live_sessions (event_id, leader_id) values ('${ev}', '${profile!.id}')`,
          ),
        ).toMatchObject({ code: "23505" });
        await c.query("rollback to savepoint s1");
        // A session that ended makes room for the next one.
        await c.query("update live_sessions set ended_at = now() where event_id = $1", [ev]);
        await c.query("insert into live_sessions (event_id, leader_id) values ($1, $2)", [
          ev,
          profile!.id,
        ]);
        await c.query("savepoint s2");
        expect(
          await attempt(
            c,
            `insert into live_sessions (event_id, arrangement_ids, leader_id) values ('${ev}', ARRAY['${uuid()}']::uuid[], '${profile!.id}')`,
          ),
        ).toMatchObject({ code: "23514" });
        await c.query("rollback to savepoint s2");
        await c.query(
          "insert into live_sessions (arrangement_ids, leader_id) values (ARRAY[$1]::uuid[], $2)",
          [uuid(), profile!.id],
        );
        // Deleting the event deletes its sessions.
        await c.query("delete from events where id = $1", [ev]);
        expect(
          (await c.query("select 1 from live_sessions where event_id = $1", [ev])).rowCount,
        ).toBe(0);
      });
    });

    it("rights research batch: claims songs up to the nightly limit of the church, never twice", async () => {
      await asMusic(A, async (c) => {
        const songIds: string[] = [];
        for (const title of ["Kutatás egy", "Kutatás kettő"]) {
          const song = (
            await c.query<{ id: string }>("insert into songs (title) values ($1) returning id", [
              title,
            ])
          ).rows[0]!.id;
          await c.query(
            "insert into arrangements (song_id, name, chordpro, is_default) values ($1, 'Alap', '{title: x}\nSzöveg sor', true)",
            [song],
          );
          songIds.push(song);
        }
        const claimed = async (n: number) =>
          (
            await c.query(
              "select song_id from claim_songs_for_rights_research($1, 'anthropic', 'm')",
              [n],
            )
          ).rows.map((r) => r.song_id as string);
        // No settings row: the nightly limit is 0.
        await c.query("delete from song_rights_research_settings");
        expect(await claimed(4)).toEqual([]);
        await c.query(
          "insert into song_rights_research_settings (enabled, provider, model, nightly_limit) values (true, 'anthropic', 'm', 1)",
        );
        const first = await claimed(4);
        expect(first).toHaveLength(1);
        expect(songIds).toContain(first[0]);
        // The limit of the night is used up; the open proposal is not taken again.
        expect(await claimed(4)).toEqual([]);
      });
    });

    it("notifications: due reminders per volunteer, once each, again after a new start time; other church sees none", async () => {
      const [profile] = await ownerQuery<{ id: string }>(
        "select id from profiles order by id limit 1",
      );
      let ev = "";
      await asMusic(A, async (c) => {
        const cal = (await c.query<{ id: string }>("select public.music_calendar_id() as id"))
          .rows[0]!.id;
        ev = (
          await c.query<{ id: string }>(
            `insert into events (calendar_id, visibility, slug, title, starts_at, ends_at, status)
             values ('${cal}', 'staff', 'ertesites-${randomUUID()}', 'Értesítés', now() + interval '1 hour',
                     now() + interval '2 hours', 'published') returning id`,
          )
        ).rows[0]!.id;
        await c.query("insert into event_volunteers (event_id, user_id) values ($1, $2)", [
          ev,
          profile!.id,
        ]);
        const due = async () =>
          (
            await c.query(
              "select kind from list_due_notifications(100) where event_id = $1 order by kind",
              [ev],
            )
          ).rows.map((r) => r.kind);
        // Within the 5-day window and within the 2 hours of the setlist.
        expect(await due()).toEqual(["event_reminder", "setlist"]);
        await c.query(
          "insert into notification_deliveries (event_id, user_id, kind) values ($1, $2, 'setlist')",
          [ev, profile!.id],
        );
        expect(await due()).toEqual(["event_reminder"]);
        // A user who turned the reminder off and the emails off, with no device, gets nothing.
        await c.query(
          "insert into notification_preferences (user_id, event_reminder, email) values ($1, false, false) on conflict (tenant_id, user_id) do update set event_reminder = false, email = false",
          [profile!.id],
        );
        expect(await due()).toEqual([]);
        await c.query(
          "update notification_preferences set event_reminder = true, email = true, reminder_days = 5, setlist = true, setlist_hours = 2 where user_id = $1",
          [profile!.id],
        );
        // A new start time makes the reminders go out again.
        await c.query(
          "update events set starts_at = starts_at + interval '10 minutes' where id = $1",
          [ev],
        );
        expect(await due()).toEqual(["event_reminder", "setlist"]);
        // A reply "no" stops them.
        await c.query(
          "update event_volunteers set reply = 'no', replied_at = now() where event_id = $1",
          [ev],
        );
        expect(await due()).toEqual([]);
        // The delivery needs the volunteer: removing the volunteer removes the marks.
        await c.query(
          "update event_volunteers set reply = null, replied_at = null where event_id = $1",
          [ev],
        );
        await c.query(
          "insert into notification_deliveries (event_id, user_id, kind) values ($1, $2, 'event_added')",
          [ev, profile!.id],
        );
        await c.query("delete from event_volunteers where event_id = $1", [ev]);
        expect(
          (await c.query("select 1 from notification_deliveries where event_id = $1", [ev]))
            .rowCount,
        ).toBe(0);
        // Not a volunteer of the event: no insert.
        await c.query("savepoint s1");
        expect(
          await attempt(
            c,
            `insert into notification_deliveries (event_id, user_id, kind) values ('${ev}', '${profile!.id}', 'setlist')`,
          ),
        ).toMatchObject({ code: "23503" });
        await c.query("rollback to savepoint s1");
      });
      await asMusic(B, async (c) => {
        expect(
          (await c.query("select * from list_due_notifications(100) where event_id = $1", [ev]))
            .rowCount,
        ).toBe(0);
        expect(
          (await c.query("select 1 from notification_deliveries where event_id = $1", [ev]))
            .rowCount,
        ).toBe(0);
      });
    });

    it("courses: draft, publish and the lesson/area rules per tenant; visibility by group; areas deleted", async () => {
      const lesson = randomUUID();
      const user = randomUUID();
      let courseId = "";
      let seeded = "";
      let areaId = "";
      let rootId = "";
      await asApp({ tenantId: A }, async (c) => {
        seeded = (await c.query("select id from courses limit 1")).rows[0].id;
        rootId = (await c.query("select music_root_area_id() as id")).rows[0].id;
        areaId = (
          await c.query(
            "insert into service_areas (name, parent_id) values ('Technika', $1) returning id",
            [rootId],
          )
        ).rows[0].id;
        courseId = (
          await c.query(
            "insert into courses (title, language) values ('Kamerák', 'hu') returning id",
          )
        ).rows[0].id;
        const doc = {
          title: "Kamerák",
          language: "hu",
          description: null,
          icon: null,
          imagePath: null,
          areaIds: [areaId],
          lessons: [
            {
              id: lesson,
              title: "Első",
              videoUrl: null,
              body: { type: "doc", content: [] },
              links: [],
            },
          ],
        };
        const rev = async () =>
          (await c.query("select revision from courses where id = $1", [courseId])).rows[0]
            .revision;
        // A stale revision is refused with the hint `course_changed`.
        await c.query("savepoint s1");
        expect(
          await attempt(
            c,
            `select save_course_draft('${courseId}', 7, '${JSON.stringify(doc)}'::jsonb)`,
          ),
        ).toMatchObject({ code: "P0001" });
        await c.query("rollback to savepoint s1");
        const saved = await c.query("select save_course_draft($1, $2, $3::jsonb) as rev", [
          courseId,
          await rev(),
          JSON.stringify(doc),
        ]);
        expect(saved.rows[0].rev).toBe(1);
        // No lessons: not publishable.
        await c.query("savepoint s2");
        expect(
          await attempt(
            c,
            `select publish_course('${courseId}', 1, '${JSON.stringify({ ...doc, lessons: [] })}'::jsonb)`,
          ),
        ).toMatchObject({ code: "P0001" });
        await c.query("rollback to savepoint s2");
        expect(
          (
            await c.query("select publish_course($1, 1, $2::jsonb) as rev", [
              courseId,
              JSON.stringify(doc),
            ])
          ).rows[0].rev,
        ).toBe(2);
        expect(
          (
            await c.query("select count(*)::int as n from course_lessons where course_id = $1", [
              courseId,
            ])
          ).rows[0].n,
        ).toBe(1);
        // A course of the group Technika: not open to a stranger, open to the admin flag and to a member.
        const open = async (u: string, admin = false) =>
          (await c.query("select can_see_course($1, $2, $3) as ok", [courseId, u, admin])).rows[0]
            .ok;
        expect(await open(user)).toBe(false);
        expect(await open(user, true)).toBe(true);
        expect(
          (await c.query("select * from visible_course_summaries($1, false)", [user])).rowCount,
        ).toBe(0);
        expect(
          (await c.query("select 1 from course_summaries() where id = $1", [courseId])).rowCount,
        ).toBe(1);
        // The only group goes away: the course is unpublished and marked.
        await c.query("delete from service_areas where id = $1", [areaId]);
        const after = (
          await c.query("select is_published, areas_lost from courses where id = $1", [courseId])
        ).rows[0];
        expect(after).toEqual({ is_published: false, areas_lost: true });
        // Removed lessons: the removed course is purged only after 90 days.
        await c.query("update courses set removed_at = now() - interval '91 days' where id = $1", [
          courseId,
        ]);
        expect(
          (await c.query("select purge_removed_courses() as n")).rows[0].n,
        ).toBeGreaterThanOrEqual(1);
        expect((await c.query("select 1 from courses where id = $1", [courseId])).rowCount).toBe(0);
      });
      await asApp({ tenantId: B }, async (c) => {
        // The church B sees none of the courses of the church A (here: the demo course of A).
        expect(
          (await c.query("select 1 from course_summaries() where id = $1", [seeded])).rowCount,
        ).toBe(0);
        expect(
          (await c.query("select can_see_course($1, $2, true) as ok", [seeded, randomUUID()]))
            .rows[0].ok,
        ).toBe(false);
        expect((await c.query("select purge_removed_courses() as n")).rows[0].n).toBe(0);
      });
      await asApp({}, async (c) => {
        // Without a church no course is visible.
        expect((await c.query("select * from course_summaries()")).rowCount).toBe(0);
      });
    });

    it("hymnal refs: the songbook text of a song becomes refs, per tenant, idempotent, dry run writes nothing", async () => {
      await asApp({ tenantId: A }, async (c) => {
        await c.query(
          "insert into songs (title, songbook) values ('Énekfüzetes', 'saját énekfüzet 12; SAJ 12; Nincs ilyen 5')",
        );
        const refs = async () => (await c.query("select 1 from song_hymnal_refs")).rowCount ?? 0;
        const before = await refs();
        const dry = await c.query("select * from merge_songbook_hymnal_refs(true)");
        expect(dry.rows.map((r) => [r.number, r.inserted])).toEqual([["12", true]]);
        expect(await refs()).toBe(before);
        const real = await c.query("select * from merge_songbook_hymnal_refs()");
        expect(real.rows.map((r) => r.inserted)).toEqual([true]);
        expect(await refs()).toBe(before + 1);
        const again = await c.query("select * from merge_songbook_hymnal_refs()");
        expect(again.rows.map((r) => r.inserted)).toEqual([false]);
      });
      await asApp({ tenantId: B }, async (c) => {
        expect((await c.query("select * from merge_songbook_hymnal_refs(true)")).rowCount).toBe(0);
      });
      await asApp({}, async (c) => {
        expect(await attempt(c, "select * from merge_songbook_hymnal_refs(true)")).toHaveProperty(
          "code",
        );
      });
    });

    it("scripture: translations are per tenant, Károli is reserved, the verse cache has per-tenant limits", async () => {
      await asMusic(A, async (c) => {
        await c.query(
          "insert into scripture_translations (id, name, short_name, source) values ('proba', 'Próba', 'Próba', 'pasted')",
        );
        for (const sql of [
          "insert into scripture_translations (id, name, short_name, source) values ('karoli1908', 'K', 'K', 'pasted')",
          "insert into scripture_translations (id, name, short_name, source) values ('masik', 'M', 'M', 'file')",
          "insert into scripture_books (translation, book, chapters) values ('nincs', 'Gen', '[]')",
        ]) {
          await c.query("savepoint s");
          expect(await attempt(c, sql)).toMatchObject({ code: expect.stringMatching(/^23/) });
          await c.query("rollback to savepoint s");
        }
        const put = (n: number, book = "John", limit = 331) =>
          c.query("select put_scripture_cache_verses('proba', $1, $2::jsonb, $3)", [
            book,
            JSON.stringify(
              Array.from({ length: n }, (_, i) => ({ chapter: 1, verse: i + 1, text: `v${i}` })),
            ),
            limit,
          ]);
        await put(5);
        await put(3, "John", 4);
        // The book limit keeps the newest verses (a paste never removes its own).
        expect(
          (
            await c.query(
              "select count(*)::int as n from scripture_verse_cache where translation = 'proba'",
            )
          ).rows[0]!.n,
        ).toBe(4);
        await c.query("savepoint s");
        expect(
          await attempt(c, "select put_scripture_cache_verses('proba', 'John', '[]'::jsonb, 10)"),
        ).toMatchObject({
          code: "22023",
        });
        await c.query("rollback to savepoint s");
      });
      // The other tenant sees neither the translation nor its cache, and cannot cache into it.
      await asMusic(B, async (c) => {
        expect(
          (await c.query("select 1 from scripture_translations where id = 'proba'")).rowCount,
        ).toBe(0);
        await c.query("savepoint s");
        expect(
          await attempt(
            c,
            `select put_scripture_cache_verses('proba', 'John', '[{"chapter":1,"verse":1,"text":"x"}]'::jsonb, 10)`,
          ),
        ).toMatchObject({ code: "23503" });
        await c.query("rollback to savepoint s");
      });
    });

    it("realtime: the policies compare the topic with the claims of the token, per tenant", async () => {
      async function allowed(claims: object, topic: string, send: boolean): Promise<boolean> {
        const client = await owner.connect();
        try {
          await client.query("begin");
          await client.query("select set_config('request.jwt.claims', $1, true)", [
            JSON.stringify(claims),
          ]);
          return (
            await client.query("select public.music_realtime_allowed($1, $2) as ok", [topic, send])
          ).rows[0].ok;
        } finally {
          await client.query("rollback").catch(() => undefined);
          client.release();
        }
      }
      const topic = (tenant: string) => `t:${tenant}:projection:event:${randomUUID()}`;
      const own = topic(A);
      const claims = { iss: "churchy", tenant_id: A, rt_topics: [own], rt_send: [own] };
      expect(await allowed(claims, own, false)).toBe(true);
      expect(await allowed(claims, own, true)).toBe(true);
      // A topic that the token does not name, another tenant's topic, send without rt_send, no issuer.
      expect(await allowed(claims, topic(A), false)).toBe(false);
      const foreign = topic(B);
      expect(
        await allowed({ ...claims, rt_topics: [foreign], rt_send: [foreign] }, foreign, false),
      ).toBe(false);
      expect(await allowed({ ...claims, rt_send: [] }, own, true)).toBe(false);
      expect(await allowed({ ...claims, iss: "other" }, own, false)).toBe(false);
      expect(await allowed({}, own, false)).toBe(false);
    });

    it("gets permission denied on every non-music table", async () => {
      const others = Object.keys(TABLE_SCOPES).filter(
        (t) => !(MUSIC_TABLES as readonly string[]).includes(t),
      );
      expect(others.length).toBeGreaterThan(40);
      await asMusic(A, async (c) => {
        for (const table of others) {
          expect(await attempt(c, `select 1 from "${table}" limit 1`), table).toMatchObject({
            code: "42501",
          });
        }
      });
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
  // Music tables: one row per table for both tenants, plus platform Bible text (catalog rows).
  const [profile] = (
    await owner.query<{ id: string }>("select id from profiles order by id limit 1")
  ).rows;
  if (profile === undefined) throw new Error("demo seed has no profile");
  const music = readFileSync(MUSIC_FIXTURES, "utf8");
  for (const tenant of [A, B]) {
    const done = await owner.query("select 1 from mixer_settings where tenant_id = $1", [tenant]);
    if (done.rowCount === 0) {
      await owner.query(music.replaceAll(":tenant", tenant).replaceAll(":user", profile.id));
    }
  }
  await owner.query(
    `insert into scripture_books (translation, book, chapters) values ('karoli', 'Gen', '[50]')
     on conflict do nothing`,
  );
  await owner.query(
    `insert into scripture_verse_cache (translation, book, chapter, verse, text)
     values ('karoli', 'Gen', 1, 1, 'Kezdetben teremté Isten az eget és a földet.')
     on conflict do nothing`,
  );
  // A tenant-owned hymnal for A (the demo Catholic church only uses platform hymnals).
  await owner.query(
    `insert into hymnals (tenant_id, abbreviation, name)
     select $1, 'SAJ', 'Saját énekfüzet'
     where not exists (select 1 from hymnals where tenant_id = $1)`,
    [A],
  );
}
