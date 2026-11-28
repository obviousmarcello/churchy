import type { SupabaseClient } from "@supabase/supabase-js";

// The background jobs of the music module, one function for each queue (phase 8c). Each runs for
// every church in turn (`eachTenant`): one church's failure is logged and never stops the others.
// The data of a church is reached only through its own client (`deps.withTenant`: a tenant token),
// so the RLS policies apply as in a request. The log carries counts and the church id, never data.

export type JobDeps = {
  /** The ids of all churches. */
  listTenants(): Promise<string[]>;
  /** Runs `run` for one church: its client, and the models of the scope use it. */
  withTenant<T>(tenantId: string, run: (db: SupabaseClient) => Promise<T>): Promise<T>;
  /** The plan's cap of AI researches per month for the church (`musicResearchPerMonth`). */
  researchLimit(tenantId: string): Promise<number>;
  log(message: string): void;
  error(message: string, error: unknown): void;
};

export type TenantRun = { tenants: number; failed: number };

/** Runs `run` for each church; a failure is logged and counted. */
export async function eachTenant(
  deps: JobDeps,
  name: string,
  run: (tenantId: string, db: SupabaseClient) => Promise<void>,
): Promise<TenantRun> {
  const tenants = await deps.listTenants();
  let failed = 0;
  for (const tenantId of tenants) {
    try {
      await deps.withTenant(tenantId, (db) => run(tenantId, db));
    } catch (error) {
      failed++;
      deps.error(`[jobs] ${name} failed for church ${tenantId}:`, error);
    }
  }
  return { tenants: tenants.length, failed };
}

/** The reminders and setlists that are due (every 15 minutes). */
export async function runDueNotifications(
  deps: JobDeps,
  send: (db: SupabaseClient, tenantId: string) => Promise<{ sent: number; failed: number }>,
): Promise<TenantRun> {
  let sent = 0;
  const result = await eachTenant(deps, "due notifications", async (tenantId, db) => {
    sent += (await send(db, tenantId)).sent;
  });
  if (sent > 0) deps.log(`[jobs] due notifications: ${sent} sent`);
  return result;
}

/** The next songs of each church whose superadmins switched the AI research on (every 10 minutes at night). */
export async function runRightsResearch(
  deps: JobDeps,
  research: (monthlyLimit: number) => Promise<{ researched: number; failed: number }>,
): Promise<TenantRun> {
  let researched = 0;
  let failed = 0;
  const result = await eachTenant(deps, "rights research", async (tenantId) => {
    const limit = await deps.researchLimit(tenantId);
    // The plan has no research: not even a read of the settings.
    if (limit <= 0) return;
    const batch = await research(limit);
    researched += batch.researched;
    failed += batch.failed;
  });
  if (researched > 0 || failed > 0) {
    deps.log(`[jobs] song rights: ${researched} researched, ${failed} failed`);
  }
  return result;
}

export type CleanupSteps = {
  /** Courses and lessons removed more than 90 days ago; images that no course uses. */
  nightly: (db: SupabaseClient) => Promise<void>;
  /** Stray files, unused image sets and announcements, closed projection controllers, expired verses. */
  hourly: (db: SupabaseClient) => Promise<void>;
};

export const runNightlyCleanup = (deps: JobDeps, steps: CleanupSteps) =>
  eachTenant(deps, "nightly cleanup", (_tenantId, db) => steps.nightly(db));

export const runHourlyCleanup = (deps: JobDeps, steps: CleanupSteps) =>
  eachTenant(deps, "hourly cleanup", (_tenantId, db) => steps.hourly(db));
