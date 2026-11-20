import { defineConfig } from "drizzle-kit";

// `drizzle-kit generate` only diffs the TypeScript schema against the snapshots in
// `migrations/meta` — it never connects to a database. Migrations are applied with
// `pnpm --filter @churchy/db db:migrate` (src/cli.ts), which reads DATABASE_URL from the env.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  casing: "snake_case",
  strict: true,
  verbose: true,
});
