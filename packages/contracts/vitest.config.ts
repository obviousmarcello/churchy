import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Contract suites run via the root `pnpm test:contract` (vitest.contract.config.ts).
    exclude: ["src/**/*.contract.test.ts", "**/node_modules/**"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      // `src/testing/**` is test code (harness, suites, reference implementation); it is exercised
      // by `pnpm test:contract` against adapters, not by unit tests.
      exclude: ["src/**/*.test.{ts,tsx}", "src/index.ts", "src/testing/**"],
      thresholds: { lines: 80, branches: 80, functions: 80, statements: 80 },
    },
  },
});
