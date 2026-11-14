/**
 * The mock adapter against EVERY contract suite (D-91 AC: 100 %, 0 skipped). A fresh store
 * seeded with the small contract fixtures is created before each test.
 */
import { runContractSuites } from "@churchy/contracts/testing";
import { createMockRepositories } from "./repositories";
import { seedContractFixtures } from "./testing/fixtures";

runContractSuites("mock", () => {
  const store = seedContractFixtures();
  return { repos: createMockRepositories(store), env: store.contractEnv };
});
