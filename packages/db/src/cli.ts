/**
 * `pnpm --filter @churchy/db db <command>` — migrations and demo seed. Reads DATABASE_URL from
 * the environment only.
 *
 *   up               apply all pending migrations
 *   down [steps]     revert the newest applied migration(s) (default 1)
 *   reset            revert every applied migration
 *   status           list applied and pending migrations
 *   auth-stub        create a minimal `auth.users` on a plain Postgres (tests/CI; never Supabase)
 *   seed-plans       upsert the 5 plans (PLACEHOLDER prices; catalog data, owner role)
 *   seed             load the D-91 demo fixtures (refused when APP_ENV=production)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createDb, createPool } from "./client";
import { appliedMigrations, migrateDown, migrateReset, migrateUp, readJournal } from "./migrate";
import { seedDemo } from "./seed/demo";
import { seedPlans } from "./seed/plans";

const AUTH_STUB = fileURLToPath(new URL("../sql/supabase-auth-stub.sql", import.meta.url));

async function main(argv: string[]): Promise<void> {
  const [command, arg] = argv;
  const pool = createPool();
  try {
    switch (command) {
      case "up":
        await migrateUp(pool);
        console.log(`Applied: ${(await appliedMigrations(pool)).join(", ") || "none"}`);
        break;
      case "down": {
        const steps = arg === undefined ? 1 : Number.parseInt(arg, 10);
        if (!Number.isInteger(steps) || steps < 1) throw new Error("steps must be ≥ 1");
        console.log(`Reverted: ${(await migrateDown(pool, steps)).join(", ") || "none"}`);
        break;
      }
      case "reset":
        console.log(`Reverted: ${(await migrateReset(pool)).join(", ") || "none"}`);
        break;
      case "status": {
        const applied = new Set(await appliedMigrations(pool));
        for (const e of readJournal()) {
          console.log(`${applied.has(e.tag) ? "applied" : "pending"}  ${e.tag}`);
        }
        break;
      }
      case "auth-stub": {
        if (["staging", "production"].includes(process.env.APP_ENV ?? "")) {
          throw new Error("auth-stub is for plain local/CI Postgres only");
        }
        const res = await pool.query<{ ok: boolean }>(
          "select exists (select 1 from pg_namespace where nspname = 'auth') as ok",
        );
        if (res.rows[0]?.ok) {
          console.log("Schema auth already exists (Supabase or stub) — nothing to do.");
          break;
        }
        await pool.query(readFileSync(AUTH_STUB, "utf8"));
        console.log("Created auth.users stub.");
        break;
      }
      case "seed-plans":
        console.log(`plans: ${await seedPlans(createDb(pool))}`);
        break;
      case "seed": {
        const report = await seedDemo(createDb(pool));
        for (const [table, n] of Object.entries(report.counts)) console.log(`${table}: ${n}`);
        for (const [collection, n] of Object.entries(report.skipped)) {
          console.log(`skipped ${collection}: ${n} (needs D-30 encryption)`);
        }
        break;
      }
      default:
        throw new Error(
          `Unknown command "${command ?? ""}" (up | down | reset | status | auth-stub | seed | seed-plans)`,
        );
    }
  } finally {
    await pool.end();
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  // Drizzle wraps driver errors; print the database's message, never the query parameters.
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
  console.error(cause instanceof Error ? cause.message : cause);
  process.exitCode = 1;
});
