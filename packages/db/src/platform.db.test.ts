/**
 * Platform role `churchy_platform` (0025_platform_role, SDD §4.2): `pnpm --filter @churchy/db test`
 * with TEST_DATABASE_URL (disposable database; skipped without it, refuses staging/production).
 *
 * Connects as the platform role (`-c role=churchy_platform`) and proves what it can do — read the
 * platform tables and the host-lookup columns of `domains`, create a church in one transaction —
 * and what it cannot: read any tenant table, update or delete anything, add rows to an existing
 * church, or create anything but a free, unlaunched tenant. Also that `churchy_app` and
 * `churchy_music` still cannot read platform tables and that no SECURITY DEFINER function exists
 * besides the two music ones.
 */
import { createCipheriv, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEMO_TENANT_IDS } from "@churchy/data-mock";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, createPool } from "./client";
import { UnsafePlatformRoleError, assertPlatformRole } from "./platform";
import { migrateUp } from "./migrate";
import { APP_ROLE, MUSIC_ROLE, PLATFORM_ROLE, rlsViolations } from "./rls";
import { seedDemo, type SeedEncryptor } from "./seed/demo";
import { demoUuid } from "./seed/ids";
import { PLATFORM_ROLE_ACCESS, tablesWithScope } from "./table-scopes";

const url = process.env.TEST_DATABASE_URL;
const unsafeEnv = ["staging", "production"].includes(process.env.APP_ENV ?? "");
const AUTH_STUB = fileURLToPath(new URL("../sql/supabase-auth-stub.sql", import.meta.url));
const NOW = new Date("2026-11-18T10:00:00+01:00");
const A = demoUuid(DEMO_TENANT_IDS.catholic);
const DENIED = { code: "42501" };

const TENANT_OWNED = [...tablesWithScope("tenant"), ...tablesWithScope("catalog")].sort();

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

describe.skipIf(!url || unsafeEnv)("platform role churchy_platform (TEST_DATABASE_URL)", () => {
  let owner: pg.Pool;
  let platform: pg.Pool;
  let app: pg.Pool;
  let music: pg.Pool;
  const created: string[] = [];
  const users: string[] = [];

  const ownerRows = async <T extends pg.QueryResultRow>(text: string, values?: unknown[]) =>
    (await owner.query<T>(text, values)).rows;

  /** One statement as `pool`'s role in a rolled-back transaction: the result or the DB error. */
  async function attempt(pool: pg.Pool, text: string, values?: unknown[]) {
    const c = await pool.connect();
    try {
      await c.query("begin");
      try {
        const res = await c.query(text, values);
        return { rowCount: res.rowCount, rows: res.rows as pg.QueryResultRow[] };
      } catch (error) {
        return { code: (error as { code?: string }).code ?? "" };
      }
    } finally {
      await c.query("rollback").catch(() => undefined);
      c.release();
    }
  }

  async function newUser(): Promise<string> {
    const id = randomUUID();
    await owner.query("insert into auth.users (id, email) values ($1, $2)", [
      id,
      `${id}@example.test`,
    ]);
    users.push(id);
    return id;
  }

  /** The bootstrap of a church, as `apps/web/server/platform-db` runs it (one transaction). */
  async function bootstrap(c: pg.PoolClient, slug: string, userId: string, plan = "ingyenes") {
    const tenantId = randomUUID();
    await c.query(
      `insert into tenants (id, slug, name, denomination, plan_key) values ($1, $2, 'Próba plébánia', 'rk', $3)`,
      [tenantId, slug, plan],
    );
    await c.query(`insert into profiles (id, email, name) values ($1, $2, 'Próba Péter')`, [
      userId,
      `${userId}@example.test`,
    ]);
    const billingId = randomUUID();
    await c.query(
      `insert into billing_accounts (id, owner_type, owner_id, name, address, email, payment_method)
       values ($1, 'tenant', $2, 'Próba plébánia', '{"postalCode":"1011","city":"Budapest","line1":"Fő utca 1.","line2":null}', 'p@example.test', 'transfer')`,
      [billingId, tenantId],
    );
    await c.query(
      `insert into subscriptions (billing_account_id, plan_key, tenant_id, period, status, current_period_end)
       values ($1, 'ingyenes', $2, 'yearly', 'active', now() + interval '100 years')`,
      [billingId, tenantId],
    );
    await c.query(`insert into memberships (tenant_id, user_id, role) values ($1, $2, 'owner')`, [
      tenantId,
      userId,
    ]);
    await c.query(
      `insert into people (tenant_id, user_id, family_name, given_name) values ($1, $2, 'Próba', 'Péter')`,
      [tenantId, userId],
    );
    await c.query(
      `insert into audit_log (tenant_id, actor_user_id, action, entity, entity_id) values ($1, $2, 'tenant.create', 'tenant', $3)`,
      [tenantId, userId, tenantId],
    );
    return tenantId;
  }

  beforeAll(async () => {
    owner = createPool(url);
    await owner.query(readFileSync(AUTH_STUB, "utf8"));
    await migrateUp(owner);
    await seedDemo(createDb(owner), { now: NOW, encryptor: testEncryptor(), appEnv: "test" });
    const pool = (role: string) =>
      new pg.Pool({ connectionString: url, max: 2, options: `-c role=${role}` });
    platform = pool(PLATFORM_ROLE);
    app = pool(APP_ROLE);
    music = pool(MUSIC_ROLE);
  });

  afterAll(async () => {
    for (const id of created) await owner?.query("delete from tenants where id = $1", [id]);
    for (const id of users) {
      await owner?.query("delete from profiles where id = $1", [id]);
      await owner?.query("delete from auth.users where id = $1", [id]);
    }
    await owner?.query(
      "delete from audit_log where action = 'tenant.create' and entity = 'tenant'",
    );
    await platform?.end();
    await app?.end();
    await music?.end();
    await owner?.end();
  });

  it("is NOLOGIN, NOINHERIT, no superuser, no BYPASSRLS, and owns/inherits no table owner", async () => {
    const [role] = await ownerRows(
      `select rolsuper, rolbypassrls, rolcanlogin, rolinherit, rolcreaterole, rolcreatedb
       from pg_roles where rolname = $1`,
      [PLATFORM_ROLE],
    );
    expect(role).toEqual({
      rolsuper: false,
      rolbypassrls: false,
      rolcanlogin: false,
      rolinherit: false,
      rolcreaterole: false,
      rolcreatedb: false,
    });
    const member = await ownerRows(
      `select distinct pg_get_userbyid(c.relowner) as o, pg_has_role($1, c.relowner, 'MEMBER') as m
       from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'`,
      [PLATFORM_ROLE],
    );
    for (const r of member) expect(r.m, String(r.o)).toBe(false);
  });

  it("the live grants and policies are exactly PLATFORM_ROLE_ACCESS (catalog check)", async () => {
    expect(await rlsViolations(owner)).toEqual([]);
  });

  it("the catalog check catches an extra grant to the platform role", async () => {
    const c = await owner.connect();
    try {
      await c.query("begin");
      await c.query(`grant update on tenants to ${PLATFORM_ROLE}`);
      await c.query(`grant select on people to ${PLATFORM_ROLE}`);
      await c.query(
        `create policy platform_extra on people for select to ${PLATFORM_ROLE} using (true)`,
      );
      const v = await rlsViolations(c);
      expect(v).toEqual(
        expect.arrayContaining([
          "tenants: churchy_platform holds table privilege UPDATE",
          "people: churchy_platform holds table privilege SELECT",
          "people: unexpected policy platform_extra for churchy_platform",
        ]),
      );
    } finally {
      await c.query("rollback");
      c.release();
    }
  });

  describe("reads", () => {
    it("reads the platform tables it is granted", async () => {
      for (const [table, access] of Object.entries(PLATFORM_ROLE_ACCESS)) {
        if (access.select !== true) continue;
        const res = await attempt(platform, `select count(*) as n from "${table}"`);
        expect(res, table).not.toHaveProperty("code");
      }
      const tenants = await attempt(platform, "select slug, plan_key from tenants");
      expect((tenants as { rows: unknown[] }).rows.length).toBeGreaterThanOrEqual(3);
      const plans = await attempt(platform, "select key, entitlements from plans");
      expect((plans as { rows: unknown[] }).rows.length).toBeGreaterThan(0);
    });

    it("resolves hosts through the host-lookup columns of domains", async () => {
      const own = await ownerRows<{ n: string }>("select count(*) as n from domains");
      const res = await attempt(
        platform,
        "select hostname, tenant_id, is_primary, verified_at, tls_status from domains",
      );
      expect((res as { rows: unknown[] }).rows).toHaveLength(Number(own[0]?.n));
      expect(Number(own[0]?.n)).toBeGreaterThan(0);
    });

    it("cannot read any other column of domains", async () => {
      expect(await attempt(platform, "select * from domains")).toMatchObject(DENIED);
      expect(await attempt(platform, "select id from domains")).toMatchObject(DENIED);
      expect(
        await attempt(platform, "select count(*) from domains where id is not null"),
      ).toMatchObject(DENIED);
    });

    it("cannot select a tenant or catalog table (grant false, no column grant, query denied)", async () => {
      for (const table of TENANT_OWNED) {
        const [p] = await ownerRows<{ t: boolean; c: boolean }>(
          `select has_table_privilege($1, $2::regclass, 'SELECT') as t,
                  has_any_column_privilege($1, $2::regclass, 'SELECT') as c`,
          [PLATFORM_ROLE, `public."${table}"`],
        );
        if (table === "domains") {
          expect(p, table).toEqual({ t: false, c: true });
          continue;
        }
        expect(p, table).toEqual({ t: false, c: false });
        expect(await attempt(platform, `select 1 from "${table}" limit 1`), table).toMatchObject(
          DENIED,
        );
      }
    });

    it("has no privilege at all on the platform tables it is not granted", async () => {
      for (const table of tablesWithScope("platform")) {
        if (table in PLATFORM_ROLE_ACCESS) continue;
        expect(await attempt(platform, `select 1 from "${table}" limit 1`), table).toMatchObject(
          DENIED,
        );
        expect(
          await attempt(platform, `insert into "${table}" default values`),
          table,
        ).toMatchObject(DENIED);
      }
    });

    it("cannot read billing_accounts or audit_log although it inserts into them", async () => {
      expect(await attempt(platform, "select 1 from billing_accounts")).toMatchObject(DENIED);
      expect(await attempt(platform, "select 1 from audit_log")).toMatchObject(DENIED);
    });
  });

  describe("church creation", () => {
    it("creates a church in one transaction", async () => {
      const userId = await newUser();
      const c = await platform.connect();
      let tenantId: string;
      try {
        await c.query("begin");
        tenantId = await bootstrap(c, `proba-${userId.slice(0, 8)}`, userId);
        await c.query("commit");
      } catch (error) {
        await c.query("rollback");
        throw error;
      } finally {
        c.release();
      }
      created.push(tenantId);
      const [row] = await ownerRows<Record<string, string>>(
        `select (select count(*) from tenants where id = $1) as tenants,
                (select count(*) from memberships where tenant_id = $1 and role = 'owner') as memberships,
                (select count(*) from people where tenant_id = $1) as people,
                (select count(*) from subscriptions where tenant_id = $1) as subscriptions,
                (select count(*) from billing_accounts where owner_id = $1) as billing,
                (select count(*) from audit_log where tenant_id = $1) as audit`,
        [tenantId],
      );
      expect(row).toEqual({
        tenants: "1",
        memberships: "1",
        people: "1",
        subscriptions: "1",
        billing: "1",
        audit: "1",
      });
    });

    it("a failed step rolls the whole bootstrap back", async () => {
      const userId = await newUser();
      const c = await platform.connect();
      const slug = `rollback-${userId.slice(0, 8)}`;
      try {
        await c.query("begin");
        await bootstrap(c, slug, userId);
        await expect(
          c.query(`insert into memberships (tenant_id, user_id, role) values ($1, $2, 'owner')`, [
            randomUUID(),
            userId,
          ]),
        ).rejects.toMatchObject(DENIED);
      } finally {
        await c.query("rollback");
        c.release();
      }
      expect(await ownerRows("select 1 from tenants where slug = $1", [slug])).toHaveLength(0);
    });

    it("a duplicate slug is a unique violation the caller can map", async () => {
      const res = await attempt(
        platform,
        `insert into tenants (slug, name, denomination) select slug, 'Másik', 'rk' from tenants limit 1`,
      );
      expect(res).toMatchObject({ code: "23505" });
    });

    it("only a free, active, unlaunched tenant without workspace or organization", async () => {
      const base = (extra: string, value: string) =>
        attempt(
          platform,
          `insert into tenants (slug, name, denomination, ${extra}) values ('x-${randomUUID().slice(0, 8)}', 'X', 'rk', ${value})`,
        );
      expect(await base("plan_key", "'teljes'")).toMatchObject(DENIED);
      expect(await base("ws_tier", "'s50'")).toMatchObject(DENIED);
      expect(await base("launched_at", "now()")).toMatchObject(DENIED);
      expect(await base("status", "'suspended'")).toMatchObject(DENIED);
      expect(await base("organization_id", "(select id from organizations limit 1)")).toMatchObject(
        DENIED,
      );
    });

    it("cannot add owners, people, subscriptions or billing to an existing church", async () => {
      const userId = await newUser();
      await owner.query(`insert into profiles (id, email, name) values ($1, $2, 'Próba Anna')`, [
        userId,
        `${userId}@example.test`,
      ]);
      expect(
        await attempt(
          platform,
          `insert into memberships (tenant_id, user_id, role) values ($1, $2, 'owner')`,
          [A, userId],
        ),
      ).toMatchObject(DENIED);
      expect(
        await attempt(
          platform,
          `insert into people (tenant_id, user_id, family_name, given_name) values ($1, $2, 'Próba', 'Anna')`,
          [A, userId],
        ),
      ).toMatchObject(DENIED);
      expect(
        await attempt(
          platform,
          `insert into billing_accounts (owner_type, owner_id, name, address, email, payment_method)
           values ('tenant', $1, 'X', '{}', 'x@example.test', 'transfer')`,
          [A],
        ),
      ).toMatchObject(DENIED);
    });

    it("a tenant older than ten minutes is closed to the seeding inserts", async () => {
      const userId = await newUser();
      const c = await platform.connect();
      let tenantId = "";
      try {
        await c.query("begin");
        tenantId = await bootstrap(c, `alt-${userId.slice(0, 8)}`, userId);
        await c.query("commit");
      } finally {
        c.release();
      }
      created.push(tenantId);
      await owner.query("update tenants set created_at = now() - interval '1 hour' where id = $1", [
        tenantId,
      ]);
      expect(
        await attempt(
          platform,
          `insert into people (tenant_id, user_id, family_name, given_name) values ($1, $2, 'A', 'B')`,
          [tenantId, userId],
        ),
      ).toMatchObject(DENIED);
    });

    it("a membership other than owner is refused", async () => {
      const userId = await newUser();
      const c = await platform.connect();
      try {
        await c.query("begin");
        const tenantId = await bootstrap(c, `role-${userId.slice(0, 8)}`, userId);
        const other = await newUser();
        await c.query(`insert into profiles (id, email, name) values ($1, $2, 'Más')`, [
          other,
          `${other}@example.test`,
        ]);
        await expect(
          c.query(`insert into memberships (tenant_id, user_id, role) values ($1, $2, 'admin')`, [
            tenantId,
            other,
          ]),
        ).rejects.toMatchObject(DENIED);
      } finally {
        await c.query("rollback");
        c.release();
      }
    });
  });

  describe("no updates, no deletes, no church data", () => {
    it("cannot update or delete tenants, profiles, subscriptions or domains", async () => {
      for (const sql of [
        "update tenants set name = 'x'",
        "delete from tenants",
        "update profiles set name = 'x'",
        "delete from profiles",
        "update subscriptions set quantity = 2",
        "delete from subscriptions",
        "delete from memberships",
        "update people set active = false",
        "delete from audit_log",
        "update audit_log set action = 'x'",
        "update domains set hostname = 'x'",
        "delete from domains",
        "truncate tenants cascade",
      ]) {
        expect(await attempt(platform, sql), sql).toMatchObject(DENIED);
      }
    });

    it("cannot read church data through the foreign-key joins it can run", async () => {
      expect(
        await attempt(
          platform,
          "select d.hostname, p.family_name from domains d join people p on p.tenant_id = d.tenant_id",
        ),
      ).toMatchObject(DENIED);
    });

    it("cannot set a tenant context to read data (policies do not name it)", async () => {
      const c = await platform.connect();
      try {
        await c.query("begin");
        await c.query("select set_config('app.tenant_id', $1, true)", [A]);
        await c.query("savepoint s");
        await expect(c.query("select 1 from events limit 1")).rejects.toMatchObject(DENIED);
        await c.query("rollback to savepoint s");
        await expect(c.query("select 1 from memberships limit 1")).rejects.toMatchObject(DENIED);
      } finally {
        await c.query("rollback");
        c.release();
      }
    });
  });

  describe("the other roles", () => {
    it("churchy_app and churchy_music still cannot read or write platform tables", async () => {
      for (const table of tablesWithScope("platform")) {
        expect(await attempt(app, `select 1 from "${table}" limit 1`), table).toMatchObject(DENIED);
        expect(await attempt(music, `select 1 from "${table}" limit 1`), table).toMatchObject(
          DENIED,
        );
        const [p] = await ownerRows<{ a: boolean; m: boolean }>(
          `select has_any_column_privilege($1, $3::regclass, 'SELECT, INSERT, UPDATE') as a,
                  has_any_column_privilege($2, $3::regclass, 'SELECT, INSERT, UPDATE') as m`,
          [APP_ROLE, MUSIC_ROLE, `public."${table}"`],
        );
        expect(p, table).toEqual({ a: false, m: false });
      }
    });

    it("churchy_app and churchy_music cannot reach the platform-only columns of domains' policy", async () => {
      // domains is a tenant table for churchy_app: without a tenant context it yields no rows.
      const res = await attempt(app, "select count(*) as n from domains");
      expect((res as unknown as { rows: { n: string }[] }).rows[0]?.n).toBe("0");
      expect(await attempt(music, "select 1 from domains")).toMatchObject(DENIED);
    });
  });

  it("assertPlatformRole accepts the platform role and refuses the owner and the app role", async () => {
    await expect(assertPlatformRole(platform)).resolves.toBeUndefined();
    await expect(assertPlatformRole(owner)).rejects.toBeInstanceOf(UnsafePlatformRoleError);
    await expect(assertPlatformRole(app)).rejects.toBeInstanceOf(UnsafePlatformRoleError);
  });

  it("no SECURITY DEFINER function besides the two music ones", async () => {
    const rows = await ownerRows<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where p.prosecdef and n.nspname in ('public', 'app') order by 1`,
    );
    expect(rows.map((r) => r.proname)).toEqual(["notify_event", "share_song_rights"]);
  });
});
