// @churchy/data-mock — mock adapter (#14) and demo data (#16). See docs/02-SDD.md §4.4.
// Only `apps/web/server/data-adapters.ts` may import this package from the app (lint rule).
export type { MockCollection, MockDataset } from "./dataset";
export { emptyDataset } from "./dataset";
export { defaultDemoDataset } from "./default-dataset";
export {
  DEMO_ORG_ID,
  DEMO_TENANT_IDS,
  createDemoDataset,
  createDemoDatasetWithPersonas,
} from "./seed";

export type { MockStore, MockStoreOptions } from "./store";
export { createMockStore } from "./store";

export type { MockSessions, MockSessionsOptions } from "./sessions";
export { DEFAULT_MAX_SESSIONS, DEFAULT_SESSION_TTL_MS, createMockSessions } from "./sessions";

export type { MockSimulationCode, SimulationSwitches } from "./simulation";
export {
  DEFAULT_SWITCHES,
  MAX_LATENCY_MS,
  MockOfflineError,
  MockSimulationError,
  isMockSimulationError,
} from "./simulation";

export type {
  OutboxChannel,
  OutboxDraft,
  OutboxEntry,
  OutboxFilter,
  OutboxParams,
  OutboxPersona,
  OutboxRecipient,
  OutboxTemplate,
} from "./outbox";

export { createMockRepositories, createMockRepository } from "./repositories";
export { mockRepositoryFactories, registerMockAdapter } from "./register";
