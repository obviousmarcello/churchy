// Writes src/local/sql.generated.ts: the migrations (journal order, split into statements) and
// the Supabase auth stub as strings, so the local database needs no file access at run time
// (the Next.js server bundle cannot read `migrations/`). `local.test.ts` fails when it is stale.
//   pnpm --filter @churchy/db local:sql
import { writeFileSync } from "node:fs";
import { localSqlSource } from "../src/local/sql-source";

writeFileSync(new URL("../src/local/sql.generated.ts", import.meta.url), localSqlSource());
