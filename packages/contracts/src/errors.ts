import type { z } from "zod";

/**
 * Error codes every adapter must use, so contract tests (and UI error handling) behave the same
 * against the mock and the DB adapter.
 *
 * - `VALIDATION` — input failed its Zod schema or a documented business invariant on the input.
 * - `NOT_FOUND`  — the target (or a referenced id) does not exist **in the ctx's scope**. Rows of
 *                  another tenant are reported as NOT_FOUND, never as FORBIDDEN (no existence leak).
 * - `CONFLICT`   — a uniqueness/overlap/state invariant was violated (duplicate slug, booking
 *                  overlap, editing a locked plan, removing the last owner…).
 * - `CONTEXT`    — the ctx is malformed or of the wrong kind (both tenantId and orgId; a tenant-only
 *                  method called with an organization or platform ctx…).
 * - `FORBIDDEN`  — the ctx may never perform this operation regardless of roles (e.g. reading
 *                  another user's notifications). Role checks themselves belong to `can()`.
 */
export const CONTRACT_ERROR_CODES = [
  "VALIDATION",
  "NOT_FOUND",
  "CONFLICT",
  "CONTEXT",
  "FORBIDDEN",
] as const;
export type ContractErrorCode = (typeof CONTRACT_ERROR_CODES)[number];

export type ValidationIssue = { path: (string | number)[]; message: string };

export class ContractError extends Error {
  readonly code: ContractErrorCode;
  /** Structured, non-sensitive details (e.g. `{ conflictingBookingId }`). */
  readonly details: Record<string, unknown>;
  /** Field-level problems for `VALIDATION`. */
  readonly issues: ValidationIssue[];

  constructor(
    code: ContractErrorCode,
    message: string,
    options: { details?: Record<string, unknown>; issues?: ValidationIssue[] } = {},
  ) {
    super(message);
    this.name = "ContractError";
    this.code = code;
    this.details = options.details ?? {};
    this.issues = options.issues ?? [];
  }
}

/** Duck-typed check so errors survive bundling/duplicated module instances. */
export function isContractError(error: unknown, code?: ContractErrorCode): error is ContractError {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { name?: unknown; code?: unknown };
  if (candidate.name !== "ContractError") return false;
  if (!CONTRACT_ERROR_CODES.includes(candidate.code as ContractErrorCode)) return false;
  return code === undefined || candidate.code === code;
}

export function validationError(
  issues: ValidationIssue[],
  message = "Invalid input",
): ContractError {
  return new ContractError("VALIDATION", message, { issues });
}

export function notFound(entity: string, id?: string): ContractError {
  return new ContractError("NOT_FOUND", id ? `${entity} ${id} not found` : `${entity} not found`, {
    details: { entity },
  });
}

export function conflict(message: string, details: Record<string, unknown> = {}): ContractError {
  return new ContractError("CONFLICT", message, { details });
}

/**
 * Parse adapter input with a contract schema; throws `ContractError("VALIDATION")` with the Zod
 * issues mapped to `{ path, message }`. Adapters MUST run every input through this (or the same
 * schema) before persisting.
 */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw validationError(
    result.error.issues.map((issue) => ({
      path: issue.path.filter((p): p is string | number => typeof p !== "symbol"),
      message: issue.message,
    })),
  );
}
