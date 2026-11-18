/**
 * DB adapter (D-90 [BE], SDD §4.4): one repository per module, all built on the adapter base.
 * Modules are added slice by slice (S1–S7, `docs/runbooks/switch-module-to-db.md`); a module
 * listed in `DB_MODULES` must pass its contract suite against Postgres
 * (`src/db.contract.test.ts`).
 */
import type { DataModule, RepositoryFactories, Repositories } from "@churchy/contracts";
import { dbAnnouncements } from "./announcements";
import {
  createDbAdapterBase,
  type DbAdapterBase,
  type DbAdapterOptions,
  type DbSource,
} from "./base";
import { dbLocations } from "./locations";

type DbRepositoryBuilders = { [M in DataModule]?: (base: DbAdapterBase) => Repositories[M] };

const BUILDERS = {
  locations: dbLocations,
  announcements: dbAnnouncements,
} satisfies DbRepositoryBuilders;

export type DbModule = keyof typeof BUILDERS;

/** Modules that have a DB adapter (and therefore run their contract suite against Postgres). */
export const DB_MODULES = Object.keys(BUILDERS) as DbModule[];

/** Repositories of every module with a DB adapter, sharing one adapter base. */
export function createDbRepositories(
  source: DbSource,
  options: DbAdapterOptions = {},
): Pick<Repositories, DbModule> {
  const base = createDbAdapterBase(source, options);
  const build = (module: DbModule) => (BUILDERS[module] as (b: DbAdapterBase) => unknown)(base);
  return Object.fromEntries(DB_MODULES.map((m) => [m, build(m)])) as Pick<Repositories, DbModule>;
}

/** Registry factories (`registerAdapter("db", …)`), one per module in `DB_MODULES`. */
export function dbRepositoryFactories(
  source: DbSource,
  options: DbAdapterOptions = {},
): RepositoryFactories {
  const base = createDbAdapterBase(source, options);
  const factories: Record<string, () => unknown> = {};
  for (const module of DB_MODULES) {
    const build = BUILDERS[module] as (base: DbAdapterBase) => unknown;
    factories[module] = () => build(base);
  }
  return factories as RepositoryFactories;
}

export {
  UnsafeDatabaseRoleError,
  asUuid,
  assertAppRole,
  createDbAdapterBase,
  expectRow,
  isoInstant,
  isoInstantOrNull,
  requireUuid,
  type DbAdapterBase,
  type DbAdapterOptions,
  type DbSource,
} from "./base";
export { DbAdapterError, mapDbError, pgErrorOf, type PgErrorLike } from "./errors";
