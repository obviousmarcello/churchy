/**
 * Column helpers shared by every table (SDD §8.2, §4.2).
 *
 * - `huText`: text sorted with the ICU Hungarian collation `hu-HU-x-icu` (L-03). Use it for every
 *   user-visible text column that lists are sorted by (names, titles).
 * - `tsvector`, `tstzrange`, `bytea`: Postgres types Drizzle has no builder for.
 * - `tenantId()`: the non-null tenant column every tenant-owned table carries; `tenantIndexes()`
 *   adds the index on it and the `(tenant_id, id)` key that tenant-consistent foreign keys use.
 */
import { sql } from "drizzle-orm";
import {
  customType,
  foreignKey,
  index,
  timestamp,
  unique,
  uuid,
  type PgColumn,
  type PgTableExtraConfigValue,
} from "drizzle-orm/pg-core";

/** Name of the ICU Hungarian collation (pg_catalog, created by initdb on ICU-enabled builds). */
export const HU_COLLATION = "hu-HU-x-icu";

/** `text COLLATE "hu-HU-x-icu"` — Hungarian sort order (`cs` after `c`, `zs` after `z`). */
export const huText = customType<{ data: string; driverData: string }>({
  dataType: () => `text COLLATE "${HU_COLLATION}"`,
});

/** Full-text search vector; always a generated column built with `public.hu_tsvector()`. */
export const tsvector = customType<{ data: string; driverData: string }>({
  dataType: () => "tsvector",
});

/** Time range (half-open `[)`), used for generated booking blocks. */
export const tstzrange = customType<{ data: string; driverData: string }>({
  dataType: () => "tstzrange",
});

/**
 * Ciphertext of application-level encryption (SDD §8.3, §25.1). The column only stores bytes;
 * encryption and decryption are D-30 and live in the DB adapter, never in SQL.
 */
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/** `timestamptz` returned as the driver's string; the adapter maps it to ISO-8601. */
export const timestamptz = (name?: string) =>
  name === undefined
    ? timestamp({ withTimezone: true, mode: "string" })
    : timestamp(name, { withTimezone: true, mode: "string" });

/** Primary key `id uuid default gen_random_uuid()`. */
export const idColumn = () => uuid().primaryKey().defaultRandom();

/** `created_at` / `updated_at` with `now()` defaults. */
export const timestamps = () => ({
  createdAt: timestamptz().notNull().defaultNow(),
  updatedAt: timestamptz().notNull().defaultNow(),
});

/** Empty-array default for `uuid[]` / `text[]` columns. */
export const emptyArray = sql`'{}'`;

/**
 * Index on `tenant_id` plus the `(tenant_id, id)` unique key. Child tables reference a parent
 * through `(tenant_id, parent_id) → parent(tenant_id, id)`, so a row can never point at a row of
 * another tenant (defence in depth next to RLS, SDD §4.2).
 */
export function tenantIndexes(
  table: string,
  t: { tenantId: PgColumn; id?: PgColumn },
): PgTableExtraConfigValue[] {
  const out: PgTableExtraConfigValue[] = [index(`${table}_tenant_id_idx`).on(t.tenantId)];
  if (t.id !== undefined) out.push(unique(`${table}_tenant_id_id_key`).on(t.tenantId, t.id));
  return out;
}

type FkAction = "cascade" | "restrict" | "no action";

/**
 * Tenant-consistent foreign key `(tenant_id, column) → parent(tenant_id, parentColumn)`.
 * A nullable `column` is not checked while null (MATCH SIMPLE). Default action: `no action`
 * (the adapter detaches references before deleting); `cascade` for owned children.
 */
export function sameTenantFk(
  name: string,
  tenantColumn: PgColumn,
  column: PgColumn,
  parent: { tenantId: PgColumn; id: PgColumn },
  onDelete: FkAction = "no action",
) {
  return foreignKey({
    name,
    columns: [tenantColumn, column],
    foreignColumns: [parent.tenantId, parent.id],
  }).onDelete(onDelete);
}
