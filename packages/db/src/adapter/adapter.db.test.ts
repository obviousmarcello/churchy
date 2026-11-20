/**
 * Integration tests of the DB adapter base against a real, DISPOSABLE Postgres
 * (TEST_DATABASE_URL, CI job "Database"): per-transaction tenant/org context, refusal of queries
 * without a context and of mixed tenant+org contexts, the app-role check, RLS as `churchy_app`
 * and the mapping of real database errors.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CONTRACT_ENV, contractDataset } from "@churchy/data-mock/testing";
import { isContractError, type Ctx } from "@churchy/contracts";
import { sql } from "drizzle-orm";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, createPool, withContext, type Db } from "../client";
import { migrateUp } from "../migrate";
import { APP_ROLE } from "../rls";
import { prepareDataset, seedDataset } from "../seed/demo";
import { demoUuid } from "../seed/ids";
import { UnsafeDatabaseRoleError, createDbAdapterBase, type DbAdapterBase } from "./base";
import { DbAdapterError } from "./errors";

const url = process.env.TEST_DATABASE_URL;
const unsafeEnv = ["staging", "production"].includes(process.env.APP_ENV ?? "");
const AUTH_STUB = fileURLToPath(new URL("../../sql/supabase-auth-stub.sql", import.meta.url));

const A = demoUuid(CONTRACT_ENV.tenantA);
const B = demoUuid(CONTRACT_ENV.tenantB);
const ORG = demoUuid(CONTRACT_ENV.orgId);
const actor = { userId: demoUuid(CONTRACT_ENV.actorA.userId), personId: null };
const tenantA: Ctx = { tenantId: A, actor };
const org: Ctx = { orgId: ORG, actor };
const platform: Ctx = { actor };

type Settings = { tenant: string | null; org: string | null };
const readSettings = sql`select current_setting('app.tenant_id', true) as tenant, current_setting('app.org_id', true) as org`;

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (isContractError(error)) return error.code;
    if (error instanceof DbAdapterError) return `db:${error.sqlState}`;
    return `other: ${String(error)}`;
  }
  return "resolved";
}

describe.skipIf(!url || unsafeEnv)("DB adapter base (TEST_DATABASE_URL)", () => {
  let owner: pg.Pool;
  /** One connection as churchy_app, so settings leaking between transactions would show. */
  let app: pg.Pool;
  let appDb: Db;
  let base: DbAdapterBase;

  beforeAll(async () => {
    owner = createPool(url);
    const { rows } = await owner.query<{ exists: boolean }>(
      "select to_regclass('auth.users') is not null as exists",
    );
    if (!rows[0]?.exists) await owner.query(readFileSync(AUTH_STUB, "utf8"));
    await migrateUp(owner);
    await seedDataset(createDb(owner), prepareDataset(contractDataset()), { appEnv: "test" });
    await owner.query(
      `insert into locations (tenant_id, name, slug, kind, accessibility)
       values ($1, 'A templom', 'adapter-base-a', 'templom', '{}'), ($2, 'B templom', 'adapter-base-b', 'templom', '{}')
       on conflict do nothing`,
      [A, B],
    );
    app = new pg.Pool({ connectionString: url, max: 1, options: `-c role=${APP_ROLE}` });
    appDb = createDb(app);
    base = createDbAdapterBase(appDb);
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
  });

  const settingsIn = (ctx: Ctx) =>
    base.run(ctx, async (tx) => (await tx.execute<Settings>(readSettings)).rows[0]);

  it("sets app.tenant_id / app.org_id per transaction from the ctx", async () => {
    expect(await settingsIn(tenantA)).toEqual({ tenant: A, org: "" });
    expect(await settingsIn(org)).toEqual({ tenant: "", org: ORG });
    expect(await settingsIn(platform)).toEqual({ tenant: "", org: "" });
  });

  it("the settings are transaction-local: nothing leaks to the next use of the connection", async () => {
    await settingsIn(tenantA);
    const after = (await appDb.execute<Settings>(readSettings)).rows[0]; // outside any withContext
    expect(after?.tenant ?? "").toBe("");
    expect(after?.org ?? "").toBe("");
  });

  it("RLS scopes every query of the transaction to the ctx's tenant", async () => {
    const slugs = (ctx: Ctx) =>
      base.run(ctx, async (tx) =>
        (
          await tx.execute<{ slug: string }>(
            sql`select slug from locations where slug like 'adapter-base-%' order by slug`,
          )
        ).rows.map((r) => r.slug),
      );
    expect(await slugs(tenantA)).toEqual(["adapter-base-a"]);
    expect(await slugs({ tenantId: B, actor })).toEqual(["adapter-base-b"]);
    expect(await slugs(org)).toEqual([]);
    expect(await slugs(platform)).toEqual([]);
  });

  it("refuses queries without a context and contexts with both tenantId and orgId", async () => {
    let ran = false;
    const fn = async () => {
      ran = true;
    };
    expect(await codeOf(base.run(undefined as unknown as Ctx, fn))).toBe("CONTEXT");
    expect(await codeOf(base.run({ tenantId: A, orgId: ORG, actor }, fn))).toBe("CONTEXT");
    expect(await codeOf(base.write(platform, fn))).toBe("CONTEXT");
    expect(await codeOf(withContext(appDb, { tenantId: A, orgId: ORG, actor }, fn))).toBe(
      "CONTEXT",
    );
    expect(ran).toBe(false);
    // The database refuses the mixed state as well (app.current_tenant_id() raises, D-03).
    const mixed = base.run(platform, async (tx) => {
      await tx.execute(
        sql`select set_config('app.tenant_id', ${A}, true), set_config('app.org_id', ${ORG}, true)`,
      );
      return tx.execute(sql`select count(*) from locations`);
    });
    expect(await codeOf(mixed)).not.toBe("resolved");
  });

  it("refuses to run as a role that bypasses RLS", async () => {
    const asOwner = createDbAdapterBase(createDb(owner));
    await expect(asOwner.run(tenantA, async () => 1)).rejects.toBeInstanceOf(
      UnsafeDatabaseRoleError,
    );
    const unchecked = createDbAdapterBase(createDb(owner), { verifyAppRole: false });
    expect(await unchecked.run(tenantA, async () => 1)).toBe(1);
  });

  it("maps real database errors to contract errors", async () => {
    const insert = (tenantId: string, slug: string, extra = sql``) =>
      base.write(tenantA, (tx) =>
        tx.execute(
          sql`insert into locations (tenant_id, name, slug, kind, accessibility) values (${tenantId}, 'X', ${slug}, 'templom', '{}') ${extra}`,
        ),
      );
    // unique (tenant_id, slug)
    expect(await codeOf(insert(A, "adapter-base-a"))).toBe("CONFLICT");
    // RLS WITH CHECK: a row for another tenant
    expect(await codeOf(insert(B, "adapter-base-other"))).toBe("NOT_FOUND");
    // composite FK to a media row that is not the tenant's
    const fk = base.write(tenantA, (tx) =>
      tx.execute(
        sql`insert into locations (tenant_id, name, slug, kind, accessibility, photo_media_id) values (${A}, 'X', 'adapter-base-fk', 'templom', '{}', gen_random_uuid())`,
      ),
    );
    expect(await codeOf(fk)).toBe("NOT_FOUND");
    // check constraint: announcements only on Sundays
    const monday = base.write(tenantA, (tx) =>
      tx.execute(
        sql`insert into announcements (tenant_id, week_sunday, body) values (${A}, '2100-01-04', '{}')`,
      ),
    );
    expect(await codeOf(monday)).toBe("VALIDATION");
    // platform table without a grant to churchy_app
    const plans = base.run(tenantA, (tx) => tx.execute(sql`select * from plans`));
    expect(await codeOf(plans)).toBe("FORBIDDEN");
    // anything else: SQLSTATE only
    const zero = base.run(tenantA, (tx) => tx.execute(sql`select 1 / 0`));
    expect(await codeOf(zero)).toBe("db:22012");
  });
});
