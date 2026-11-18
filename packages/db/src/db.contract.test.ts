/**
 * The DB adapter against the D-90 contract suites (D-90 [BE]): every module in `DB_MODULES` runs
 * its full suite against real Postgres; all other modules are listed as skipped (they stay on the
 * mock adapter until their slice).
 *
 * Needs a DISPOSABLE database in `DATABASE_URL` (falls back to `TEST_DATABASE_URL`), connected
 * as the migration role: the suite applies the auth stub when `auth.users` is missing, migrates,
 * and writes the contract fixtures (`contractDataset()` of `@churchy/data-mock/testing`, ids
 * mapped to UUIDs). The repositories under test connect through the SAME URL but as
 * `churchy_app` (`-c role=churchy_app`), so every query is subject to RLS exactly as in
 * production. Refuses APP_ENV=staging/production; with REQUIRE_TEST_DATABASE=1 (CI) a missing
 * database fails the run instead of skipping it.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ContractEnv } from "@churchy/contracts/testing";
import { runContractSuites } from "@churchy/contracts/testing";
import { CONTRACT_ENV, contractDataset } from "@churchy/data-mock/testing";
import pg from "pg";
import { afterAll, describe, it } from "vitest";
import { DB_MODULES, createDbRepositories } from "./adapter";
import { createDb, createPool } from "./client";
import { migrateUp } from "./migrate";
import { APP_ROLE } from "./rls";
import { prepareDataset, seedDataset } from "./seed/demo";
import { demoUuid } from "./seed/ids";

const url = process.env.DATABASE_URL || process.env.TEST_DATABASE_URL;
const unsafeEnv = ["staging", "production"].includes(process.env.APP_ENV ?? "");
if (process.env.REQUIRE_TEST_DATABASE === "1" && (!url || unsafeEnv)) {
  throw new Error(
    "The DB contract suites need DATABASE_URL (disposable database, not staging/production)",
  );
}
const AUTH_STUB = fileURLToPath(new URL("../sql/supabase-auth-stub.sql", import.meta.url));

/** The contract identities with the fixture ids mapped like the seed maps them. */
const DB_CONTRACT_ENV: ContractEnv = {
  tenantA: demoUuid(CONTRACT_ENV.tenantA),
  tenantB: demoUuid(CONTRACT_ENV.tenantB),
  orgId: demoUuid(CONTRACT_ENV.orgId),
  actorA: {
    userId: demoUuid(CONTRACT_ENV.actorA.userId),
    personId: demoUuid(CONTRACT_ENV.actorA.personId),
  },
  actorB: {
    userId: demoUuid(CONTRACT_ENV.actorB.userId),
    personId: demoUuid(CONTRACT_ENV.actorB.personId),
  },
  orgActor: { userId: demoUuid(CONTRACT_ENV.orgActor.userId), personId: null },
  platformActor: { userId: demoUuid(CONTRACT_ENV.platformActor.userId), personId: null },
};

if (!url || unsafeEnv) {
  describe("[db] contract suites", () => {
    it.skip("DATABASE_URL is not set (or APP_ENV is staging/production)", () => {});
  });
} else {
  const dbUrl = url;
  let owner: pg.Pool | undefined;
  let app: pg.Pool | undefined;
  let ready: Promise<ReturnType<typeof createDbRepositories>> | undefined;

  /** Once per file: schema + fixtures as the owner, then repositories as churchy_app. */
  const setup = () =>
    (ready ??= (async () => {
      owner = createPool(dbUrl);
      const { rows } = await owner.query<{ exists: boolean }>(
        "select to_regclass('auth.users') is not null as exists",
      );
      if (!rows[0]?.exists) await owner.query(readFileSync(AUTH_STUB, "utf8"));
      await migrateUp(owner);
      await seedDataset(createDb(owner), prepareDataset(contractDataset()), { appEnv: "test" });
      app = new pg.Pool({ connectionString: dbUrl, max: 5, options: `-c role=${APP_ROLE}` });
      return createDbRepositories(createDb(app));
    })());

  afterAll(async () => {
    await app?.end();
    await owner?.end();
  });

  runContractSuites("db", async () => ({ repos: await setup(), env: DB_CONTRACT_ENV }), {
    modules: DB_MODULES,
  });
}
