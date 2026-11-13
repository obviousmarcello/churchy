import { defineConfig } from "vitest/config";

// Contract suites (D-90): run against the mock adapter by default,
// and against the DB adapter when DATABASE_URL is set (D-90 [BE]).
export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.contract.test.ts"],
  },
});
