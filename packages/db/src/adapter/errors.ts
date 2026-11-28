/**
 * Database error → contract error mapping (D-90, `packages/contracts/src/errors.ts`). Both
 * adapters must fail the same way, so the DB adapter translates Postgres SQLSTATEs into
 * `ContractError` codes:
 *
 * | SQLSTATE                                   | Meaning                                  | Code         |
 * | ------------------------------------------ | ---------------------------------------- | ------------ |
 * | 23505 unique, 23P01 exclusion              | duplicate slug/week, overlap             | `CONFLICT`   |
 * | 23503 foreign key                          | reference not in the tenant (composite FK) | `NOT_FOUND` |
 * | 42501 + "row-level security"               | write outside the tenant (RLS WITH CHECK) | `NOT_FOUND` |
 * | 42501 other                                | privilege missing for the app role       | `FORBIDDEN`  |
 * | 23502, 23514, 22P02, 22001, 22003, 22007, 22008 | not null, check, bad value          | `VALIDATION` |
 *
 * Another tenant's rows are reported as NOT_FOUND, never FORBIDDEN (no existence leak). Anything
 * else becomes a `DbAdapterError` carrying only the SQLSTATE, constraint and table — never the
 * driver message or `detail`, which can contain row values (no personal data in logs).
 */
import { ContractError, isContractError } from "@churchy/contracts";

/** The fields of a `pg` `DatabaseError` the mapping reads. */
export type PgErrorLike = {
  code: string;
  message?: string;
  constraint?: string;
  table?: string;
  column?: string;
};

const SQLSTATE = /^[0-9A-Z]{5}$/;

/** The Postgres error in `error` or its `cause` chain (Drizzle wraps driver errors). */
export function pgErrorOf(error: unknown): PgErrorLike | null {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === "object" && current !== null; depth += 1) {
    const candidate = current as { code?: unknown; cause?: unknown };
    if (typeof candidate.code === "string" && SQLSTATE.test(candidate.code)) {
      return candidate as PgErrorLike;
    }
    current = candidate.cause;
  }
  return null;
}

/** An unexpected database failure, reduced to non-sensitive metadata. */
export class DbAdapterError extends Error {
  readonly sqlState: string | null;
  readonly constraint: string | null;
  readonly table: string | null;

  constructor(pg: PgErrorLike | null) {
    super(
      pg === null
        ? "Database adapter failure"
        : `Database error ${pg.code}${pg.constraint ? ` (${pg.constraint})` : ""}`,
    );
    this.name = "DbAdapterError";
    this.sqlState = pg?.code ?? null;
    this.constraint = pg?.constraint ?? null;
    this.table = pg?.table ?? null;
  }
}

const VALIDATION_STATES = new Set(["23502", "23514", "22P02", "22001", "22003", "22007", "22008"]);

/**
 * Translates a thrown value into the error the repository rethrows: contract errors pass through,
 * known SQLSTATEs become `ContractError`s, everything else a `DbAdapterError`.
 */
export function mapDbError(error: unknown): Error {
  if (isContractError(error)) return error;
  const pg = pgErrorOf(error);
  if (pg === null) return error instanceof Error ? error : new DbAdapterError(null);
  const details: Record<string, unknown> = {};
  if (pg.constraint) details.constraint = pg.constraint;
  if (pg.table) details.entity = pg.table;

  switch (pg.code) {
    case "23505":
    case "23P01":
      return new ContractError("CONFLICT", "Conflicts with an existing row", { details });
    case "23503":
      return new ContractError("NOT_FOUND", "A referenced row was not found", { details });
    case "42501":
      return /row-level security/i.test(pg.message ?? "")
        ? new ContractError("NOT_FOUND", "Row not found in this context", { details })
        : new ContractError("FORBIDDEN", "Not permitted for the application role", { details });
    default:
      if (VALIDATION_STATES.has(pg.code)) {
        return new ContractError("VALIDATION", "Invalid value", {
          details,
          issues: [{ path: pg.column ? [pg.column] : [], message: `Rejected (${pg.code})` }],
        });
      }
      return new DbAdapterError(pg);
  }
}
