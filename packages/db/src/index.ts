// @churchy/db — Drizzle schema, migrations and demo seed (D-02); DB adapters follow per module
// (S1–S7). Only `apps/web/server/data-adapters.ts` may import this package from the app (lint).
export * as schema from "./schema";
export {
  contextSettings,
  createDb,
  createPool,
  databaseUrl,
  withContext,
  type Db,
  type Schema,
  type Tx,
} from "./client";
export {
  DB_MODULES,
  DbAdapterError,
  UnsafeDatabaseRoleError,
  assertAppRole,
  createDbAdapterBase,
  createDbRepositories,
  dbRepositoryFactories,
  mapDbError,
  type DbAdapterBase,
  type DbAdapterOptions,
  type DbModule,
  type DbSource,
} from "./adapter";
export {
  MIGRATIONS_FOLDER,
  appliedMigrations,
  migrateDown,
  migrateReset,
  migrateUp,
  readJournal,
} from "./migrate";
export {
  HR_TABLES,
  TABLE_SCOPES,
  tablesWithScope,
  type TableName,
  type TableScope,
} from "./table-scopes";
export {
  APP_ROLE,
  CATALOG_READ_POLICY,
  POSTGREST_ROLES,
  TENANT_POLICY,
  rlsViolations,
} from "./rls";
export {
  StorageKeyError,
  assertTenantStorageKey,
  tenantStorageKey,
  tenantStoragePrefix,
} from "./storage-keys";
// The demo seed (it imports the mock fixtures) is a separate entry: `@churchy/db/seed`.
