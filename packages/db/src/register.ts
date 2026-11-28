/**
 * `@churchy/db/register` — registers the DB adapter with the contracts registry (SDD §4.4).
 * Imported only by the app's composition root (`apps/web/server/data-adapters.ts`, lint rule).
 *
 * Registering does not connect: the pool is created from `DATABASE_URL` the first time a module
 * switched to the DB adapter (`DATA_ADAPTER_<MODULE>=db`) is used. Modules without a DB adapter
 * have no `db` factory; selecting `db` for them is a configuration error reported by the
 * registry (`unavailableModules`).
 */
import { registerAdapter } from "@churchy/contracts";
import { dbRepositoryFactories, type DbSource } from "./adapter";
import { createDb, createPool, type Db } from "./client";

const DB_KEY = Symbol.for("churchy.db.appDb");
type GlobalWithDb = typeof globalThis & { [DB_KEY]?: Db };

/**
 * The app's database, created lazily from `DATABASE_URL` (the `churchy_app` role) and kept on
 * `globalThis` so dev hot reloads reuse one pool.
 */
export function appDb(): Db {
  const global = globalThis as GlobalWithDb;
  global[DB_KEY] ??= createDb(createPool());
  return global[DB_KEY];
}

/** Registers the `db` factories of every module in `DB_MODULES`. */
export function registerDbAdapter(source: DbSource = appDb): void {
  registerAdapter("db", dbRepositoryFactories(source));
}
