/**
 * DB adapter base (D-90 [BE], SDD §4.2, §4.4, §25.7). Every DB repository runs its queries
 * through one of these helpers, never through the raw `Db`:
 *
 * - **One transaction per unit of work.** Each repository call is one transaction opened by
 *   `withContext`, which sets `app.tenant_id` / `app.org_id` transaction-locally from the `Ctx`
 *   (safe behind the Supabase transaction pooler). RLS (D-03) reads those settings.
 * - **No query without a context.** The ctx is validated before a connection is taken: a missing
 *   or malformed ctx, or one carrying both `tenantId` and `orgId`, throws `CONTEXT`. Tenant reads
 *   with an organization/platform ctx return the empty value without querying (the database
 *   would return 0 rows anyway); tenant writes throw `CONTEXT`, anonymous writes `FORBIDDEN`.
 * - **Never as a privileged role.** Before the first query the adapter checks that the current
 *   role is neither superuser nor BYPASSRLS (it must be `churchy_app`) and refuses to run
 *   otherwise, so a misconfigured `DATABASE_URL` cannot silently disable tenant isolation.
 * - **Error mapping.** Database errors become `ContractError`s (`mapDbError`).
 */
import {
  ContractError,
  ctxScope,
  isAnonymous,
  requireTenantId,
  type Ctx,
  type CtxScope,
} from "@churchy/contracts";
import { sql } from "drizzle-orm";
import { withContext, type Db, type Tx } from "../client";
import { isUuid } from "../seed/ids";
import { mapDbError } from "./errors";

/** A database, or a lazy getter (the app creates its pool only when a DB module is used). */
export type DbSource = Db | (() => Db);

export type DbAdapterOptions = {
  /**
   * Check once that the connected role cannot bypass RLS (default `true`). Only integration
   * tests that exercise the base as the owner turn this off.
   */
  verifyAppRole?: boolean;
};

export interface DbAdapterBase {
  /** Runs `fn` in one context-bound transaction (tenant, organization or platform ctx). */
  run<T>(ctx: Ctx, fn: (tx: Tx, scope: CtxScope) => Promise<T>): Promise<T>;
  /**
   * A tenant-scoped read: `fn` gets the ctx's tenant id; organization/platform contexts receive
   * `empty` (they read 0 rows from non-HR tables, SDD §25.7).
   */
  read<T>(ctx: Ctx, empty: T, fn: (tx: Tx, tenantId: string) => Promise<T>): Promise<T>;
  /** A tenant-scoped write: `CONTEXT` without a tenant ctx, `FORBIDDEN` for anonymous visitors. */
  write<T>(ctx: Ctx, fn: (tx: Tx, tenantId: string) => Promise<T>): Promise<T>;
}

/** Thrown when the adapter is connected as a role that would bypass row-level security. */
export class UnsafeDatabaseRoleError extends Error {
  constructor(role: string) {
    super(
      `Refusing to run the DB adapter as role "${role}": it is a superuser or has BYPASSRLS. ` +
        `Connect as churchy_app (packages/db/README.md, "Row-level security").`,
    );
    this.name = "UnsafeDatabaseRoleError";
  }
}

/** Fails unless the connected role is subject to RLS (no SUPERUSER, no BYPASSRLS). */
export async function assertAppRole(db: Db): Promise<void> {
  const result = await db.execute<{ role: string; privileged: boolean }>(
    sql`select current_user as role, (rolsuper or rolbypassrls) as privileged from pg_catalog.pg_roles where rolname = current_user`,
  );
  const row = result.rows[0];
  if (!row || row.privileged) throw new UnsafeDatabaseRoleError(row?.role ?? "unknown");
}

export function createDbAdapterBase(
  source: DbSource,
  options: DbAdapterOptions = {},
): DbAdapterBase {
  const resolve = typeof source === "function" ? source : () => source;
  let roleChecked: Promise<void> | undefined;

  const ready = async (): Promise<Db> => {
    const db = resolve();
    if (options.verifyAppRole !== false) {
      roleChecked ??= assertAppRole(db).catch((error: unknown) => {
        roleChecked = undefined; // re-check on the next call (e.g. a transient connection error)
        throw error;
      });
      await roleChecked;
    }
    return db;
  };

  const run = async <T>(ctx: Ctx, fn: (tx: Tx, scope: CtxScope) => Promise<T>): Promise<T> => {
    const scope = ctxScope(ctx); // CONTEXT before any connection is taken
    const scopeId =
      scope.kind === "tenant" ? scope.tenantId : scope.kind === "org" ? scope.orgId : null;
    if (scopeId !== null && asUuid(scopeId) === null) {
      // e.g. a mock tenant id ("t-…") reaching a DB module: a configuration error, not "no rows"
      throw new ContractError("CONTEXT", `The ${scope.kind} id of the context is not a uuid`);
    }
    const db = await ready();
    try {
      return await withContext(db, ctx, (tx) => fn(tx, scope));
    } catch (error) {
      throw mapDbError(error);
    }
  };

  return {
    run,
    async read(ctx, empty, fn) {
      const scope = ctxScope(ctx);
      if (scope.kind !== "tenant") return empty;
      return run(ctx, (tx) => fn(tx, scope.tenantId));
    },
    async write(ctx, fn) {
      const tenantId = requireTenantId(ctx);
      if (isAnonymous(ctx)) {
        throw new ContractError("FORBIDDEN", "Anonymous visitors cannot change data");
      }
      return run(ctx, (tx) => fn(tx, tenantId));
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Row mapping helpers shared by the DB repositories
// ---------------------------------------------------------------------------------------------

/**
 * Contract ids are opaque strings; database ids are uuids. A value that is not a uuid cannot
 * name a row, so lookups treat it as "not found" instead of sending it to Postgres (22P02).
 */
export function asUuid(id: string | null | undefined): string | null {
  return typeof id === "string" && isUuid(id) ? id.toLowerCase() : null;
}

/** `asUuid`, or `NOT_FOUND` for an id that cannot exist. */
export function requireUuid(id: string, entity: string): string {
  const uuid = asUuid(id);
  if (uuid === null) {
    throw new ContractError("NOT_FOUND", `${entity} not found`, { details: { entity } });
  }
  return uuid;
}

/**
 * A `timestamptz` as returned by the driver (`2026-11-18 09:00:00.123+01`) → ISO-8601 UTC
 * (`2026-11-18T08:00:00.123Z`), the contract's `IsoDateTime`.
 */
export function isoInstant(value: string): string {
  const normalized = value.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const ms = Date.parse(normalized);
  if (Number.isNaN(ms)) throw new Error(`Unexpected timestamptz value "${value}"`);
  return new Date(ms).toISOString();
}

/** `isoInstant` for nullable columns. */
export function isoInstantOrNull(value: string | null): string | null {
  return value === null ? null : isoInstant(value);
}

/** `NOT_FOUND` unless a write touched a row (`returning` result of UPDATE/DELETE). */
export function expectRow<T>(rows: readonly T[], entity: string, id: string): T {
  const row = rows[0];
  if (row === undefined) {
    throw new ContractError("NOT_FOUND", `${entity} ${id} not found`, { details: { entity } });
  }
  return row;
}
