import { defineConfig } from "vitest/config";

// `*.db.test.ts` need a disposable Postgres in TEST_DATABASE_URL (CI job "Database"); without it
// they are skipped. Coverage thresholds therefore only apply when the database tests run.
const withDb = Boolean(process.env.TEST_DATABASE_URL);

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // The DB tests share one database; never run files in parallel.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts", "src/seed/index.ts", "src/cli.ts"],
      thresholds: withDb ? { lines: 80, branches: 80, functions: 80, statements: 80 } : undefined,
    },
  },
});
