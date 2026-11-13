import {
  AdapterRegistry,
  DATA_MODULES,
  adapterRegistry,
  getRepositories,
} from "@churchy/contracts";
import { afterEach, describe, expect, it } from "vitest";
import { defaultDemoDataset } from "./default-dataset";
import { emptyDataset } from "./dataset";
import { mockRepositoryFactories, registerMockAdapter } from "./register";
import { createMockSessions } from "./sessions";
import { createMockStore } from "./store";
import { CONTRACT_ENV, contractDataset } from "./testing/fixtures";

const ctxA = { tenantId: CONTRACT_ENV.tenantA, actor: CONTRACT_ENV.actorA };

afterEach(() => adapterRegistry.clear());

describe("registerMockAdapter", () => {
  it("registers all 23 modules with the process-wide registry", async () => {
    const store = createMockStore(contractDataset());
    registerMockAdapter(() => store);
    expect(adapterRegistry.registeredModules("mock")).toEqual([...DATA_MODULES]);
    const repos = getRepositories({});
    expect((await repos.tenants.current(ctxA))?.id).toBe(CONTRACT_ENV.tenantA);
  });

  it("resolves the store at resolve time (per demo session)", async () => {
    const sessions = createMockSessions({ datasetFactory: contractDataset });
    let current = "s1";
    const registry = new AdapterRegistry();
    registry.register(
      "mock",
      mockRepositoryFactories(() => sessions.get(current)),
    );
    await registry
      .getRepositories({})
      .locations.upsert(ctxA, { name: "Kápolna", slug: "kapolna", kind: "kapolna" });
    current = "s2";
    expect(await registry.getRepositories({}).locations.list(ctxA)).toEqual([]);
    current = "s1";
    expect(await registry.getRepositories({}).locations.list(ctxA)).toHaveLength(1);
  });

  it("starts demo sessions from the default dataset", () => {
    expect(defaultDemoDataset()).toEqual(emptyDataset());
  });
});
