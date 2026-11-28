/**
 * Registration with the contracts adapter registry (SDD §4.4). `getStore` is called every time
 * the registry builds a repository, so the composition root can return the store of the current
 * demo session (per-visitor isolation) or a single default store.
 */
import type { DataModule, RepositoryFactories } from "@churchy/contracts";
import { DATA_MODULES, registerAdapter } from "@churchy/contracts";
import { createMockRepository } from "./repositories";
import type { MockStore } from "./store";

/** One factory per module, each bound to the store returned by `getStore()` at resolve time. */
export function mockRepositoryFactories(getStore: () => MockStore): RepositoryFactories {
  const factories: Record<string, () => unknown> = {};
  for (const module of DATA_MODULES) {
    factories[module] = () => createMockRepository(getStore(), module as DataModule);
  }
  return factories as RepositoryFactories;
}

/** Registers the mock adapter for all 23 modules (`registerAdapter("mock", …)`). */
export function registerMockAdapter(getStore: () => MockStore): void {
  registerAdapter("mock", mockRepositoryFactories(getStore));
}
