/**
 * Database connection and the per-transaction tenant context (SDD §4.2, §25.7).
 *
 * The app connects through a dedicated, non-owner role without BYPASSRLS (created with the RLS
 * policies in D-03). Every repository call runs in a transaction that first sets
 * `app.tenant_id` / `app.org_id` with `set_config(…, true)` — transaction-local, so it is safe
 * behind the Supabase transaction pooler — and RLS policies read them.
 */
import { ctxScope, type Ctx } from "@churchy/contracts";
import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

export type Schema = typeof schema;
export type Db = NodePgDatabase<Schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Reads `DATABASE_URL` from the environment; never hard-code connection strings. */
export function databaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.DATABASE_URL;
  if (url === undefined || url.trim() === "") {
    throw new Error("DATABASE_URL is not set");
  }
  return url;
}

export function createPool(url: string = databaseUrl()): pg.Pool {
  return new pg.Pool({ connectionString: url, max: 5 });
}

export function createDb(pool: pg.Pool): Db {
  return drizzle(pool, { schema, casing: "snake_case" });
}

/** The two RLS settings a context maps to; empty string = not set. */
export function contextSettings(ctx: Ctx): { tenantId: string; orgId: string } {
  const scope = ctxScope(ctx); // validates; a ctx never carries both tenantId and orgId
  return {
    tenantId: scope.kind === "tenant" ? scope.tenantId : "",
    orgId: scope.kind === "org" ? scope.orgId : "",
  };
}

/**
 * Runs `fn` in a transaction scoped to `ctx`: tenant ctx → `app.tenant_id`, organization ctx →
 * `app.org_id` (never both, SDD §25.7), platform ctx → neither.
 */
export async function withContext<T>(db: Db, ctx: Ctx, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const { tenantId, orgId } = contextSettings(ctx);
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.tenant_id', ${tenantId}, true), set_config('app.org_id', ${orgId}, true)`,
    );
    return fn(tx);
  });
}
