/**
 * Server composition root of the data-access layer (SDD §4.4) — the ONLY app file allowed to
 * import data adapters (lint rule, D-90). Importing it registers the adapters with the contracts
 * registry; everything else resolves repositories through `getRepositories()`.
 *
 * Phase A: the mock adapter for all modules, backed by one default demo store. Per-visitor demo
 * sessions (`createMockSessions`) are wired in with demo mode (#18).
 */
import type { MockStore } from "@churchy/data-mock";
import { createMockStore, defaultDemoDataset, registerMockAdapter } from "@churchy/data-mock";

const STORE_KEY = Symbol.for("churchy.data-adapters.mockStore");
type GlobalWithStore = typeof globalThis & { [STORE_KEY]?: MockStore };

/** The default demo store; kept on `globalThis` so dev hot reloads keep its state. */
function defaultStore(): MockStore {
  const global = globalThis as GlobalWithStore;
  global[STORE_KEY] ??= createMockStore(defaultDemoDataset());
  return global[STORE_KEY];
}

registerMockAdapter(defaultStore);
