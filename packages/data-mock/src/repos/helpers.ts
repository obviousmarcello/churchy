/**
 * Scoping helpers shared by the mock repositories. They implement the six adapter rules of the
 * contract README: exclusive ctx scope, tenant scoping (NOT_FOUND, never FORBIDDEN), org ctx
 * reading zero rows outside HR, anonymous ctx receiving public data only, validation through
 * `parseInput`, and `ContractError`s.
 */
import type { Ctx, ListPage, PageRequest } from "@churchy/contracts";
import {
  ContractError,
  IsoDateTimeSchema,
  PageRequestSchema,
  ctxScope,
  isAnonymous,
  notFound,
  paginate,
  parseInput,
  requireTenantId,
} from "@churchy/contracts";
import { toBudapestDate } from "@churchy/schedule";
import type { MockDataset } from "../dataset";
import type { OutboxDraft } from "../outbox";
import type { MockStore } from "../store";

export type Rows<K extends keyof MockDataset> = MockDataset[K];
type TenantRow = { id: string; tenantId: string | null };

/** Tenant of a read: null (→ zero rows) for organization and platform contexts. */
export function readTenant(ctx: Ctx): string | null {
  const scope = ctxScope(ctx);
  return scope.kind === "tenant" ? scope.tenantId : null;
}

/** Tenant of an internal (non-public) read: null for anonymous visitors too. */
export function staffTenant(ctx: Ctx): string | null {
  const tenantId = readTenant(ctx);
  return tenantId !== null && !isAnonymous(ctx) ? tenantId : null;
}

/**
 * Tenant of a write: CONTEXT for organization/platform contexts, FORBIDDEN for anonymous
 * visitors (the only anonymous write, `requests.submit`, does not use this helper).
 */
export function writeTenant(ctx: Ctx): string {
  const tenantId = requireTenantId(ctx);
  if (isAnonymous(ctx)) {
    throw new ContractError("FORBIDDEN", "Anonymous visitors cannot change data");
  }
  return tenantId;
}

/** The ctx actor's user id, FORBIDDEN when anonymous. */
export function actorUserId(ctx: Ctx): string {
  if (ctx.actor.userId === null) {
    throw new ContractError("FORBIDDEN", "This operation needs a signed-in user");
  }
  return ctx.actor.userId;
}

/** Row `id` of `tenantId` in `rows`, or NOT_FOUND (also for rows of another tenant). */
export function own<T extends TenantRow>(
  rows: readonly T[],
  tenantId: string,
  id: string | null | undefined,
  entity: string,
): T {
  const row = id == null ? undefined : rows.find((r) => r.id === id && r.tenantId === tenantId);
  if (!row) throw notFound(entity, id ?? undefined);
  return row;
}

/** Like `own`, but a null/undefined reference is accepted (optional foreign keys). */
export function ownRef<T extends TenantRow>(
  rows: readonly T[],
  tenantId: string,
  id: string | null | undefined,
  entity: string,
): T | null {
  return id == null ? null : own(rows, tenantId, id, entity);
}

/** Replace the row with the same id (or append). */
export function save<T extends { id: string }>(rows: T[], row: NoInfer<T>): T {
  const index = rows.findIndex((r) => r.id === row.id);
  if (index === -1) rows.push(row);
  else rows[index] = row;
  return row;
}

/** Remove rows matching `predicate` in place; returns how many were removed. */
export function removeWhere<T>(rows: T[], predicate: (row: T) => boolean): number {
  let removed = 0;
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (predicate(rows[i] as T)) {
      rows.splice(i, 1);
      removed += 1;
    }
  }
  return removed;
}

/** Validated page request + `paginate`. */
export function pageOf<T>(rows: readonly T[], request: PageRequest | undefined): ListPage<T> {
  const { page, pageSize } = parseInput(PageRequestSchema, {
    page: request?.page,
    pageSize: request?.pageSize,
  });
  return paginate(rows, { page, pageSize });
}

/** Empty page for contexts that see nothing. */
export function emptyPage<T>(request: PageRequest | undefined): ListPage<T> {
  return pageOf<T>([], request);
}

/** Validates an instant and returns it as epoch ms. */
export function instant(value: string): number {
  return Date.parse(parseInput(IsoDateTimeSchema, value));
}

/** Civil year (Europe/Budapest) of an instant — via the real schedule package. */
export function budapestYear(iso: string): number {
  return Number(toBudapestDate(iso).slice(0, 4));
}

/**
 * Next sequential reference `PREFIX-YYYY-NNNN` among `existing` references (per tenant & year).
 */
export function nextReference(prefix: string, year: number, existing: readonly string[]): string {
  const stem = `${prefix}-${year}-`;
  const max = existing
    .filter((r) => r.startsWith(stem))
    .reduce((m, r) => Math.max(m, Number(r.slice(stem.length)) || 0), 0);
  return `${stem}${String(max + 1).padStart(4, "0")}`;
}

/** Adds whole days to an instant (retention periods). */
export function addDaysIso(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * 86_400_000).toISOString();
}

/** Repository dependencies: the store, plus a typed outbox helper. */
export type RepoDeps = { store: MockStore };

export function send(store: MockStore, drafts: OutboxDraft | OutboxDraft[]): void {
  for (const draft of Array.isArray(drafts) ? drafts : [drafts]) store.appendOutbox(draft);
}
