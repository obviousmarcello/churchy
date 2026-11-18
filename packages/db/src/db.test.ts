/**
 * Integration tests against a real, DISPOSABLE Postgres (D-02 verification): migrations up → down
 * → up, schema checks on the live catalog, Hungarian collation and search, the booking exclusion
 * constraint, tenant-consistent foreign keys, the per-transaction context and the demo seed.
 *
 * Runs only when TEST_DATABASE_URL is set (CI job "Database": postgres service + auth stub). The
 * suite drops and recreates every Churchy object, so it never uses DATABASE_URL and refuses to
 * run with APP_ENV=staging/production.
 */
import { createCipheriv, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEMO_TENANT_IDS } from "@churchy/data-mock";
import { sql } from "drizzle-orm";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, createPool, withContext, type Db } from "./client";
import { appliedMigrations, migrateDown, migrateReset, migrateUp, readJournal } from "./migrate";
import * as s from "./schema";
import { demoUuid } from "./seed/ids";
import { seedDemo, type SeedEncryptor } from "./seed/demo";
import { TABLE_SCOPES, tablesWithScope } from "./table-scopes";

const url = process.env.TEST_DATABASE_URL;
const unsafeEnv = ["staging", "production"].includes(process.env.APP_ENV ?? "");
const NOW = new Date("2026-11-18T10:00:00+01:00");
const AUTH_STUB = fileURLToPath(new URL("../sql/supabase-auth-stub.sql", import.meta.url));

/** Test-only AES-256-GCM stand-in for D-30 (random key per run, never persisted). */
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

describe.skipIf(!url || unsafeEnv)("database (TEST_DATABASE_URL)", () => {
  let pool: pg.Pool;
  let db: Db;
  const q = async <T extends pg.QueryResultRow>(text: string, values?: unknown[]) =>
    (await pool.query<T>(text, values)).rows;

  beforeAll(async () => {
    pool = createPool(url);
    db = createDb(pool);
    const [auth] = await q<{ ok: boolean }>(
      "select exists (select 1 from pg_namespace where nspname = 'auth') as ok",
    );
    if (!auth?.ok) await pool.query(readFileSync(AUTH_STUB, "utf8"));
    await migrateReset(pool);
  });

  afterAll(async () => {
    await pool?.end();
  });

  describe("migrations (AC1: up → down → up)", () => {
    it("applies all, reverts all, and applies all again", async () => {
      const tags = readJournal().map((e) => e.tag);
      await migrateUp(pool);
      expect(await appliedMigrations(pool)).toEqual(tags);

      await migrateDown(pool, tags.length);
      expect(await appliedMigrations(pool)).toEqual([]);
      const [left] = await q<{ tables: string; types: string }>(
        `select (select count(*) from pg_tables where schemaname = 'public') as tables,
                (select count(*) from pg_type t join pg_namespace n on n.oid = t.typnamespace
                  where n.nspname = 'public' and t.typtype = 'e') as types`,
      );
      expect(left).toEqual({ tables: "0", types: "0" });

      await migrateUp(pool);
      expect(await appliedMigrations(pool)).toEqual(tags);
    });

    it("reverts and re-applies a single step", async () => {
      expect(await migrateDown(pool, 1)).toEqual(["0002_constraints"]);
      await migrateUp(pool);
      expect((await appliedMigrations(pool)).at(-1)).toBe("0002_constraints");
    });
  });

  describe("schema on the live catalog", () => {
    it("creates exactly the classified tables, all with RLS enabled", async () => {
      const rows = await q<{ relname: string; relrowsecurity: boolean }>(
        `select c.relname, c.relrowsecurity from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind = 'r'`,
      );
      expect(rows.map((r) => r.relname).sort()).toEqual(Object.keys(TABLE_SCOPES).sort());
      expect(rows.filter((r) => !r.relrowsecurity).map((r) => r.relname)).toEqual([]);
    });

    it("every tenant table has a non-null tenant_id with an index (automated schema check)", async () => {
      const rows = await q<{ table_name: string; is_nullable: string; indexed: boolean }>(
        `select c.table_name, c.is_nullable,
           exists (select 1 from pg_index i
                   join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
                   where i.indrelid = format('public.%I', c.table_name)::regclass
                     and a.attname = 'tenant_id') as indexed
         from information_schema.columns c
         where c.table_schema = 'public' and c.column_name = 'tenant_id'`,
      );
      const byTable = new Map(rows.map((r) => [r.table_name, r]));
      for (const table of tablesWithScope("tenant")) {
        expect(byTable.get(table)?.is_nullable, table).toBe("NO");
        expect(byTable.get(table)?.indexed, `${table} index`).toBe(true);
      }
    });

    it("has unaccent, btree_gist and the hungarian text-search configuration", async () => {
      const ext = await q<{ extname: string }>(
        "select extname from pg_extension where extname in ('unaccent', 'btree_gist') order by 1",
      );
      expect(ext.map((e) => e.extname)).toEqual(["btree_gist", "unaccent"]);
      const [cfg] = await q<{ n: string }>(
        "select count(*) as n from pg_ts_config where cfgname = 'hungarian'",
      );
      expect(cfg?.n).toBe("1");
    });

    it("sort columns carry the hu-HU-x-icu collation", async () => {
      const rows = await q<{ table_name: string; collation_name: string | null }>(
        `select table_name, collation_name from information_schema.columns
         where table_schema = 'public' and column_name in ('name', 'title', 'family_name', 'given_name')`,
      );
      expect(rows.length).toBeGreaterThan(20);
      for (const r of rows) expect(r.collation_name, r.table_name).toBe("hu-HU-x-icu");
    });
  });

  describe("behaviour", () => {
    const tenantA = "00000000-0000-4000-8000-00000000000a";
    const tenantB = "00000000-0000-4000-8000-00000000000b";

    beforeAll(async () => {
      await pool.query(
        `insert into plans (key, name, kind, price_monthly, price_yearly, entitlements)
         values ('ingyenes', 'Ingyenes', 'website', 0, 0, '{}') on conflict do nothing`,
      );
      await pool.query(
        `insert into tenants (id, slug, name, denomination) values
         ($1, 'teszt-a', 'Teszt A', 'rk'), ($2, 'teszt-b', 'Teszt B', 'ref')`,
        [tenantA, tenantB],
      );
    });

    afterAll(async () => {
      await pool.query("delete from tenants where id in ($1, $2)", [tenantA, tenantB]);
    });

    it("orders names in Hungarian (cs after c, zs after z, ö after o)", async () => {
      const names = ["Zsigmond", "Csaba", "Cecília", "Zoltán", "Ábel", "Aladár", "Ödön", "Olga"];
      for (const [i, family] of names.entries()) {
        await pool.query(
          "insert into people (tenant_id, family_name, given_name, sort) values ($1, $2, 'Teszt', $3)",
          [tenantA, family, i],
        );
      }
      const rows = await q<{ family_name: string }>(
        "select family_name from people where tenant_id = $1 order by family_name",
        [tenantA],
      );
      // á is a secondary (accent) difference of a; ö is its own letter after o
      expect(rows.map((r) => r.family_name)).toEqual([
        "Ábel",
        "Aladár",
        "Cecília",
        "Csaba",
        "Olga",
        "Ödön",
        "Zoltán",
        "Zsigmond",
      ]);
    });

    it("finds újév with the query ujev (unaccent + hungarian stemming)", async () => {
      const body = JSON.stringify({ type: "doc", content: [] });
      await pool.query(
        `insert into posts (tenant_id, slug, title, lead, body) values
         ($1, 'ujev', 'Újév napja', 'Boldog újévet kívánunk!', $2),
         ($1, 'advent', 'Adventi koszorú', 'Gyertyagyújtás', $2)`,
        [tenantA, body],
      );
      const rows = await q<{ slug: string }>(
        "select slug from posts where tenant_id = $1 and search @@ public.hu_tsquery($2)",
        [tenantA, "ujev"],
      );
      expect(rows.map((r) => r.slug)).toEqual(["ujev"]);
      const accented = await q<{ slug: string }>(
        "select slug from posts where tenant_id = $1 and search @@ public.hu_tsquery($2)",
        [tenantA, "ÚJÉV"],
      );
      expect(accented.map((r) => r.slug)).toEqual(["ujev"]);
    });

    it("rejects a reference to another tenant's row (tenant-consistent FKs)", async () => {
      const [loc] = await q<{ id: string }>(
        `insert into locations (tenant_id, name, slug, kind, accessibility)
         values ($1, 'Templom', 'templom', 'templom', '{}') returning id`,
        [tenantA],
      );
      const [period] = await q<{ id: string }>(
        "insert into schedule_periods (tenant_id, name) values ($1, 'Általános') returning id",
        [tenantB],
      );
      await expect(
        pool.query(
          `insert into service_rules (tenant_id, period_id, location_id, weekday, time, service_type)
           values ($1, $2, $3, 7, '10:00', 'istentisztelet')`,
          [tenantB, period!.id, loc!.id],
        ),
      ).rejects.toMatchObject({ code: "23503" });
    });

    it("never double-books a room, buffers included (exclusion constraint, NFR-15)", async () => {
      const [loc] = await q<{ id: string }>(
        `insert into locations (tenant_id, name, slug, kind, accessibility)
         values ($1, 'Plébánia', 'plebania', 'egyeb', '{}') returning id`,
        [tenantA],
      );
      const [room] = await q<{ id: string }>(
        `insert into rooms (tenant_id, location_id, name, accessibility, approval_policy, rules)
         values ($1, $2, 'Nagyterem', '{}', '{}', '{}') returning id`,
        [tenantA, loc!.id],
      );
      const book = (from: string, to: string, status: string, before = 0) =>
        pool.query(
          `insert into bookings (tenant_id, room_id, starts_at, ends_at, status, title, buffer_before_min)
           values ($1, $2, $3, $4, $5, 'Próba', $6)`,
          [tenantA, room!.id, from, to, status, before],
        );
      await book("2026-12-01T10:00:00+01:00", "2026-12-01T12:00:00+01:00", "approved");
      await expect(
        book("2026-12-01T11:00:00+01:00", "2026-12-01T13:00:00+01:00", "pending"),
      ).rejects.toMatchObject({ code: "23P01" });
      // touching is fine (half-open), but a 15-minute set-up buffer makes it overlap
      await book("2026-12-01T12:00:00+01:00", "2026-12-01T13:00:00+01:00", "approved");
      await expect(
        book("2026-12-01T13:30:00+01:00", "2026-12-01T14:00:00+01:00", "approved", 31),
      ).rejects.toMatchObject({ code: "23P01" });
      // rejected/cancelled bookings never block
      await book("2026-12-01T10:30:00+01:00", "2026-12-01T11:30:00+01:00", "rejected");
    });

    it("withContext sets app.tenant_id / app.org_id for the transaction only", async () => {
      const actor = { userId: null, personId: null };
      const inside = await withContext(db, { tenantId: tenantA, actor }, async (tx) => {
        const res = await tx.execute<{ t: string; o: string }>(
          sql`select current_setting('app.tenant_id', true) as t, current_setting('app.org_id', true) as o`,
        );
        return res.rows[0];
      });
      expect(inside).toEqual({ t: tenantA, o: "" });
      const org = await withContext(db, { orgId: tenantB, actor }, async (tx) => {
        const res = await tx.execute<{ t: string; o: string }>(
          sql`select current_setting('app.tenant_id', true) as t, current_setting('app.org_id', true) as o`,
        );
        return res.rows[0];
      });
      expect(org).toEqual({ t: "", o: tenantB });
    });
  });

  describe("demo seed (AC4, D-91 fixtures)", () => {
    it("loads the 3 demo churches + diocese and is re-runnable", async () => {
      const first = await seedDemo(db, { now: NOW, encryptor: testEncryptor(), appEnv: "test" });
      const second = await seedDemo(db, { now: NOW, encryptor: testEncryptor(), appEnv: "test" });
      expect(second.counts).toEqual(first.counts);
      expect(first.skipped).toEqual({});

      const catholic = demoUuid(DEMO_TENANT_IDS.catholic);
      const count = async (table: string) =>
        Number(
          (
            await q<{ n: string }>(`select count(*) as n from ${table} where tenant_id = $1`, [
              catholic,
            ])
          )[0]?.n,
        );
      expect(await count("posts")).toBeGreaterThanOrEqual(10);
      expect(await count("events")).toBeGreaterThanOrEqual(15);
      expect(await count("locations")).toBeGreaterThanOrEqual(2);
      expect(await count("announcements")).toBeGreaterThanOrEqual(4);
      expect(await count("service_rules")).toBeGreaterThan(0);
      expect(await count("hr_tickets")).toBeGreaterThan(0);
      const [org] = await q<{ n: string }>("select count(*) as n from organizations");
      expect(Number(org?.n)).toBeGreaterThanOrEqual(1);
      for (const [table, n] of Object.entries(first.counts)) {
        if (table === "auth.users") continue;
        const [row] = await q<{ n: string }>(`select count(*) as n from ${table}`);
        expect(Number(row?.n), table).toBeGreaterThanOrEqual(n);
      }
    });

    it("stores no plaintext of special-category fixtures", async () => {
      const [ticket] = await db
        .select({ data: s.hrTickets.dataEnc, subject: s.hrTickets.subjectEnc })
        .from(s.hrTickets)
        .limit(1);
      expect(ticket).toBeDefined();
      expect(ticket!.subject.toString("utf8")).not.toMatch(/[a-záéíóöőúüű]{4,}/i);
    });

    it("without an encryptor skips the encrypted collections instead of writing plaintext", async () => {
      const report = await seedDemo(db, { now: NOW, appEnv: "test" });
      expect(report.skipped["hrTickets"]).toBeGreaterThan(0);
      expect(report.skipped["pastoralRequests"]).toBeGreaterThan(0);
      const [row] = await q<{ n: string }>(
        "select count(*) as n from hr_tickets where tenant_id = $1",
        [demoUuid(DEMO_TENANT_IDS.catholic)],
      );
      expect(row?.n).toBe("0");
    });

    it("refuses to run in production", async () => {
      await expect(seedDemo(db, { now: NOW, appEnv: "production" })).rejects.toThrow(/production/);
    });
  });
});
