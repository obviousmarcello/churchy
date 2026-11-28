/**
 * Role `churchy_site_media` and its Storage policies (0028_site_media): `pnpm --filter @churchy/db test`
 * with TEST_DATABASE_URL (disposable database; skipped without it, refuses staging/production).
 *
 * Plain Postgres has no `storage` schema, so the test creates a minimal stand-in (objects, buckets,
 * `storage.foldername`) and runs the migration's guarded storage block against it. It proves that a
 * churchy token for tenant A can add, see and delete `t/<A>/media/<uuid>.webp` in bucket `site-media`
 * and nothing else: not another tenant's prefix, another bucket, another folder, another name or
 * extension, no overwrite (UPDATE), and no public table at all.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "./client";
import { migrateUp } from "./migrate";

const url = process.env.TEST_DATABASE_URL;
const unsafeEnv = ["staging", "production"].includes(process.env.APP_ENV ?? "");
const AUTH_STUB = fileURLToPath(new URL("../sql/supabase-auth-stub.sql", import.meta.url));
const MIGRATION = fileURLToPath(new URL("../migrations/0028_site_media.sql", import.meta.url));
const ROLE = "churchy_site_media";
const DENIED = "42501";

describe.skipIf(!url || unsafeEnv)("site media role (TEST_DATABASE_URL)", () => {
  let owner: pg.Pool;
  const A = randomUUID();
  const B = randomUUID();
  const key = (tenant: string, folder = "media", ext = "webp") =>
    `t/${tenant}/${folder}/${randomUUID()}.${ext}`;

  /** `SET LOCAL ROLE` + the claims of a churchy token, like Storage after verifying it. */
  async function asMedia<T>(tenant: string, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
    const c = await owner.connect();
    try {
      await c.query("begin");
      await c.query(`set local role ${ROLE}`);
      await c.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ iss: "churchy", sub: randomUUID(), tenant_id: tenant, role: ROLE }),
      ]);
      return await fn(c);
    } finally {
      await c.query("rollback").catch(() => undefined);
      c.release();
    }
  }

  /** The statement's outcome inside a savepoint, so one denial does not abort the transaction. */
  async function attempt(c: pg.PoolClient, text: string, values: unknown[] = []) {
    await c.query("savepoint s");
    try {
      const res = await c.query(text, values);
      await c.query("release savepoint s");
      return { rowCount: res.rowCount ?? 0 };
    } catch (error) {
      await c.query("rollback to savepoint s");
      return { code: (error as { code?: string }).code ?? "" };
    }
  }

  const insert = (bucket: string, name: string) =>
    attempt(c0!, "insert into storage.objects (bucket_id, name) values ($1, $2)", [bucket, name]);
  let c0: pg.PoolClient | undefined;

  beforeAll(async () => {
    owner = createPool(url);
    await owner.query(readFileSync(AUTH_STUB, "utf8"));
    await migrateUp(owner);
    await owner.query(`
      drop schema if exists storage cascade;
      create schema storage;
      create table storage.buckets (id text primary key, name text, public boolean,
        file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects (id uuid primary key default gen_random_uuid(),
        bucket_id text references storage.buckets(id), name text not null, owner uuid);
      alter table storage.objects enable row level security;
      alter table storage.buckets enable row level security;
      create function storage.foldername(name text) returns text[] language plpgsql as $f$
        declare _parts text[]; begin
          select string_to_array(name, '/') into _parts;
          return _parts[1:array_length(_parts, 1) - 1]; end $f$;
      insert into storage.buckets (id, name, public) values ('other', 'other', false);
    `);
    const sql = readFileSync(MIGRATION, "utf8")
      .split("--> statement-breakpoint")
      .find((s) => s.includes("storage.objects") && s.includes("CREATE POLICY"));
    await owner.query(sql!);
    await owner.query(
      "insert into storage.objects (bucket_id, name) values ('site-media', $1), ('site-media', $2)",
      [key(B), key(A)],
    );
  });

  afterAll(async () => {
    await owner?.query("drop schema if exists storage cascade");
    await owner?.end();
  });

  it("is NOLOGIN, NOINHERIT, no superuser, no BYPASSRLS and owns nothing", async () => {
    const { rows } = await owner.query(
      `select rolsuper, rolbypassrls, rolcanlogin, rolinherit,
              exists (select 1 from pg_class where relowner = r.oid) as owns
       from pg_roles r where rolname = $1`,
      [ROLE],
    );
    expect(rows[0]).toEqual({
      rolsuper: false,
      rolbypassrls: false,
      rolcanlogin: false,
      rolinherit: false,
      owns: false,
    });
  });

  it("has no grant on any table of public", async () => {
    const { rows } = await owner.query(
      `select table_name from information_schema.role_table_grants
       where grantee = $1 and table_schema = 'public'`,
      [ROLE],
    );
    expect(rows).toEqual([]);
    await asMedia(A, async (c) => {
      expect(await attempt(c, "select 1 from public.media")).toEqual({ code: DENIED });
      expect(await attempt(c, "select 1 from public.tenants")).toEqual({ code: DENIED });
    });
  });

  it("creates the bucket private, 10 MB, webp only", async () => {
    const { rows } = await owner.query(
      "select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'site-media'",
    );
    expect(rows).toEqual([
      { public: false, file_size_limit: "10485760", allowed_mime_types: ["image/webp"] },
    ]);
  });

  it("adds, sees and deletes its own tenant's media objects only", async () => {
    await asMedia(A, async (c) => {
      c0 = c;
      const mine = key(A);
      expect(await insert("site-media", mine)).toEqual({ rowCount: 1 });
      const visible = await c.query<{ name: string }>("select name from storage.objects");
      expect(visible.rows.every((r) => r.name.startsWith(`t/${A}/media/`))).toBe(true);
      expect(visible.rows.length).toBeGreaterThanOrEqual(2);
      expect(await attempt(c, "delete from storage.objects where name = $1", [mine])).toEqual({
        rowCount: 1,
      });
    });
  });

  it("refuses another tenant, bucket, folder, name and extension", async () => {
    await asMedia(A, async (c) => {
      c0 = c;
      for (const [bucket, name] of [
        ["site-media", key(B)],
        ["other", key(A)],
        ["site-media", key(A, "files")],
        ["site-media", key(A, "media", "png")],
        ["site-media", key(A, "media/sub")],
        ["site-media", `t/${A}/media/not-a-uuid.webp`],
        ["site-media", `x/${A}/media/${randomUUID()}.webp`],
      ] as const) {
        expect(await insert(bucket, name), `${bucket} ${name}`).toEqual({ code: DENIED });
      }
    });
  });

  it("cannot delete or overwrite another tenant's object, nor update its own", async () => {
    await asMedia(A, async (c) => {
      expect(
        await attempt(c, "delete from storage.objects where name like $1", [`t/${B}/%`]),
      ).toEqual({ rowCount: 0 });
      expect(await attempt(c, "update storage.objects set name = name")).toEqual({
        code: DENIED,
      });
    });
  });

  it("sees no tenant without a churchy claim", async () => {
    const c = await owner.connect();
    try {
      await c.query("begin");
      await c.query(`set local role ${ROLE}`);
      await c.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ iss: "someone-else", tenant_id: A }),
      ]);
      const { rows } = await c.query("select 1 from storage.objects");
      expect(rows).toEqual([]);
      expect(
        await attempt(c, "insert into storage.objects (bucket_id, name) values ($1, $2)", [
          "site-media",
          key(A),
        ]),
      ).toEqual({ code: DENIED });
    } finally {
      await c.query("rollback").catch(() => undefined);
      c.release();
    }
  });
});
