import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  eachTenant,
  runDueNotifications,
  runHourlyCleanup,
  runNightlyCleanup,
  runRightsResearch,
  type JobDeps,
} from "./handlers";

const db = {} as SupabaseClient;

function deps(
  tenants: string[],
  limits: Record<string, number> = {},
): JobDeps & {
  seen: string[];
  errors: string[];
} {
  const seen: string[] = [];
  const errors: string[] = [];
  return {
    seen,
    errors,
    listTenants: async () => tenants,
    withTenant: async (tenantId, run) => {
      seen.push(tenantId);
      return run(db);
    },
    researchLimit: async (tenantId) => limits[tenantId] ?? 0,
    log: () => {},
    error: (message) => errors.push(message),
  };
}

describe("the jobs run for each church in turn", () => {
  it("isolates a failing church: the others still run, and the failure is logged without data", async () => {
    const d = deps(["a", "b", "c"]);
    const ran: string[] = [];
    const result = await eachTenant(d, "test", async (tenantId) => {
      if (tenantId === "b") throw new Error("secret detail");
      ran.push(tenantId);
    });
    expect(ran).toEqual(["a", "c"]);
    expect(result).toEqual({ tenants: 3, failed: 1 });
    expect(d.errors).toEqual(["[jobs] test failed for church b:"]);
  });

  it("sends the due notifications of each church with its own id", async () => {
    const send = vi.fn(async () => ({ sent: 2, failed: 0 }));
    const result = await runDueNotifications(deps(["a", "b"]), send);
    expect(send.mock.calls.map((call) => (call as unknown[])[1])).toEqual(["a", "b"]);
    expect(result).toEqual({ tenants: 2, failed: 0 });
  });

  it("researches only for churches whose plan has a cap, with that cap", async () => {
    const research = vi.fn(async () => ({ researched: 1, failed: 0 }));
    await runRightsResearch(deps(["a", "b", "c"], { a: 20, c: 5 }), research);
    expect(research.mock.calls).toEqual([[20], [5]]);
  });

  it("runs the cleanup steps for every church", async () => {
    const nightly = vi.fn(async () => {});
    const hourly = vi.fn(async () => {});
    await runNightlyCleanup(deps(["a", "b"]), { nightly, hourly });
    await runHourlyCleanup(deps(["a"]), { nightly, hourly });
    expect(nightly).toHaveBeenCalledTimes(2);
    expect(hourly).toHaveBeenCalledTimes(1);
  });
});
