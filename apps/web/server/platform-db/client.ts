import "server-only";

import { assertPlatformRole, createPlatformPool, PLATFORM_URL_ENV } from "@churchy/db/platform";
import { demoModeEnabled, type Env } from "@/lib/demo/flag";

/**
 * The platform database connection (migration 0025_platform_role, SDD §4.2): the role
 * `churchy_platform` for everything without a tenant context — host resolution, profile
 * bootstrap, plan lookups and creating a church. Own connection string
 * (`DATABASE_URL_PLATFORM`, never `DATABASE_URL`); the only files that may import this module are
 * listed in `eslint.platform.mjs`, so tenant code cannot reach it.
 */

export interface PlatformQueryResult<R> {
  readonly rows: R[];
  readonly rowCount: number | null;
}

export interface PlatformQueryable {
  query<R = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<PlatformQueryResult<R>>;
}

export interface PlatformDb extends PlatformQueryable {
  /** Runs `fn` in one transaction (commit on return, rollback on throw). */
  transaction<T>(fn: (tx: PlatformQueryable) => Promise<T>): Promise<T>;
}

/**
 * Whether this deployment uses the platform database: `DATABASE_URL_PLATFORM` is set and the app
 * is not in demo mode (demo mode runs on mock adapters only; `lib/demo/safety.ts` refuses to start
 * with the variable set).
 */
export function platformDbEnabled(env: Env = process.env): boolean {
  const url = env[PLATFORM_URL_ENV];
  return (
    url !== undefined &&
    url.trim() !== "" &&
    !demoModeEnabled(env) &&
    (env.APP_ENV ?? "").trim().toLowerCase() !== "demo"
  );
}

let shared: PlatformDb | undefined;
let roleChecked: Promise<void> | undefined;

/** The process-wide platform connection (created on first use; verifies the role once). */
export async function getPlatformDb(): Promise<PlatformDb> {
  if (!platformDbEnabled()) throw new Error("The platform database is not configured");
  if (shared === undefined) {
    const pool = createPlatformPool();
    shared = {
      query: (text, values) => pool.query(text, values as unknown[] | undefined) as never,
      async transaction(fn) {
        const client = await pool.connect();
        try {
          await client.query("begin");
          const result = await fn({
            query: (text, values) => client.query(text, values as unknown[] | undefined) as never,
          });
          await client.query("commit");
          return result;
        } catch (error) {
          await client.query("rollback").catch(() => undefined);
          throw error;
        } finally {
          client.release();
        }
      },
    };
    roleChecked = assertPlatformRole(pool).catch((error: unknown) => {
      shared = undefined; // never serve queries on an unchecked or unsafe connection
      roleChecked = undefined;
      void pool.end().catch(() => undefined);
      throw error;
    });
  }
  const db = shared;
  await roleChecked;
  return db;
}
