/**
 * The one-off production import (`scripts/import-music-prod.ts`) against a DISPOSABLE database
 * (TEST_DATABASE_URL, reset by the other db suites; run this file alone: `vitest run src/import-music.db.test.ts`).
 * The "source" is a schema `src` with the shape of the music app's songs/events/setlists.
 */
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { importMusic } from "../scripts/import-music-prod";
import { createPool } from "./client";
import { migrateUp } from "./migrate";

const url = process.env.TEST_DATABASE_URL;
const unsafeEnv = ["staging", "production"].includes(process.env.APP_ENV ?? "");

describe.skipIf(!url || unsafeEnv)("import-music-prod", () => {
  let pool: pg.Pool;
  const tenant = "00000000-0000-4000-8000-0000000000a1";

  beforeAll(async () => {
    pool = createPool(url);
    await migrateUp(pool);
    await pool.query(
      "insert into plans (key, name, kind, price_monthly, price_yearly, entitlements) values ('ingyenes', 'Ingyenes', 'website', 0, 0, '{}') on conflict do nothing",
    );
    await pool.query("delete from tenants where id = $1", [tenant]); // cascades the earlier run's rows
    await pool.query(
      "insert into tenants (id, slug, name, denomination) values ($1, 'import-proba', 'Import próba', 'ref')",
      [tenant],
    );
    await pool.query(`drop schema if exists src cascade; create schema src;
      create table src.songs (like public.songs including defaults);
      create table src.setlists (like public.setlists including defaults);
      create table src.events (id uuid primary key, title text not null, starts_at timestamptz not null, setlist_id uuid, created_at timestamptz, updated_at timestamptz);
      alter table src.songs drop column tenant_id; alter table src.setlists drop column tenant_id;
      insert into src.songs (id, title, songbook) values ('11111111-1111-4111-8111-111111111111', 'Kitalált ének', 'HH 1');
      insert into src.events values ('22222222-2222-4222-8222-222222222222', 'Kitalált alkalom', '2026-12-06T10:00:00Z', null, now(), now());`);
  });
  afterAll(async () => {
    await pool?.query("drop schema if exists src cascade");
    await pool?.end();
  });

  it("dry run writes nothing; a real run fills tenant_id; a second run adds nothing", async () => {
    const run = (dryRun: boolean) =>
      importMusic(pool, pool, { tenantId: tenant, sourceSchema: "src", dryRun });
    const count = async (t: string) =>
      Number(
        (await pool.query(`select count(*) n from ${t} where tenant_id = $1`, [tenant])).rows[0].n,
      );

    const dry = await run(true);
    expect(dry.find((r) => r.table === "songs")?.inserted).toBe(1);
    expect(await count("songs")).toBe(0);

    await run(false);
    expect(await count("songs")).toBe(1);
    const ev = (
      await pool.query("select slug, visibility, status from events where tenant_id = $1", [tenant])
    ).rows;
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ visibility: "staff", status: "published" });
    expect(ev[0].slug).toMatch(/^kitalalt-alkalom-2026-12-06-22222222$/);

    const second = await run(false);
    expect(second.find((r) => r.table === "songs")?.inserted).toBe(0);
    expect(second.find((r) => r.table === "events")?.inserted).toBe(0);
    expect(await count("songs")).toBe(1);
  });
});
