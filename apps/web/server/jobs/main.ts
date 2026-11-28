import { PgBoss } from "pg-boss";

// The worker reads the list of churches (a platform table) with its own connection: no repository covers it.
// eslint-disable-next-line no-restricted-imports -- platform-level read in the worker process, not tenant data
import { createPool } from "@churchy/db";

import { entitlements } from "@/lib/plans/entitlements";
import { repositoriesFor } from "@/server/data-adapters";
import { runWithMusicClient } from "@/server/music/db";
import { createMusicJobClient } from "@/server/music/supabase";
import { JOBS_DISABLED_NOTICE, jobsConfig } from "./config";
import {
  runDueNotifications,
  runHourlyCleanup,
  runNightlyCleanup,
  runRightsResearch,
  type JobDeps,
} from "./handlers";
import { cleanupSteps, research, sendDue } from "./steps";

// The worker of the background jobs (phase 8c): `pnpm worker`. It is a process of its own, next to
// the web app, with pg-boss for the queues and the schedules. Runbook: docs/runbooks/jobs-worker.md.
//
//   music-due-notifications  every 15 minutes   reminders and setlists that are due
//   music-rights-research    every 10 minutes, 00:00-04:59 (Europe/Budapest)   AI research of the song rights
//   music-cleanup-hourly     at minute 7 of each hour   stray files, unused sets, expired rows
//   music-cleanup-nightly    03:17 (Europe/Budapest)    removed courses, unused course images

const TZ = "Europe/Budapest";
const SCHEDULES = [
  { queue: "music-due-notifications", cron: "*/15 * * * *" },
  { queue: "music-rights-research", cron: "*/10 0-4 * * *" },
  { queue: "music-cleanup-hourly", cron: "7 * * * *" },
  { queue: "music-cleanup-nightly", cron: "17 3 * * *" },
] as const;

async function main(): Promise<void> {
  const config = jobsConfig();
  if (!config.enabled) {
    console.warn(`[jobs] ${JOBS_DISABLED_NOTICE[config.reason]}`);
    return;
  }

  // The churches: a platform table, read with the connection of the worker.
  const pool = createPool(config.connectionString);
  const deps: JobDeps = {
    listTenants: async () =>
      (await pool.query<{ id: string }>("select id from tenants order by id")).rows.map(
        (row) => row.id,
      ),
    withTenant: (tenantId, run) => {
      const db = createMusicJobClient(tenantId);
      return runWithMusicClient(db, () => run(db));
    },
    researchLimit: async (tenantId) =>
      entitlements(
        await repositoriesFor(null).billing.getEntitlementSources({
          tenantId,
          actor: { userId: null, personId: null },
        }),
      ).musicResearchPerMonth,
    log: (message) => console.info(message),
    error: (message, error) =>
      console.error(message, error instanceof Error ? error.message : "error"),
  };

  const boss = new PgBoss(config.connectionString);
  boss.on("error", (error) => console.error("[jobs] pg-boss:", error.message));
  await boss.start();
  for (const { queue, cron } of SCHEDULES) {
    await boss.createQueue(queue);
    await boss.schedule(queue, cron, null, { tz: TZ });
  }
  await boss.work(
    "music-due-notifications",
    async () => void (await runDueNotifications(deps, sendDue)),
  );
  await boss.work(
    "music-rights-research",
    async () => void (await runRightsResearch(deps, research)),
  );
  await boss.work(
    "music-cleanup-hourly",
    async () => void (await runHourlyCleanup(deps, cleanupSteps)),
  );
  await boss.work(
    "music-cleanup-nightly",
    async () => void (await runNightlyCleanup(deps, cleanupSteps)),
  );
  console.info("[jobs] worker started");

  const stop = async () => {
    await boss.stop({ graceful: true });
    await pool.end();
    process.exit(0);
  };
  process.once("SIGTERM", () => void stop());
  process.once("SIGINT", () => void stop());
}

main().catch((error: unknown) => {
  console.error("[jobs] the worker stopped:", error instanceof Error ? error.message : "error");
  process.exit(1);
});
