import { describe, expect, it } from "vitest";

import { jobsConfig } from "./config";

const SUPABASE = {
  SUPABASE_URL: "https://x.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "key",
  SUPABASE_JWT_SECRET: "s".repeat(40),
};

describe("jobsConfig", () => {
  it("is off in demo mode, whatever else is set", () => {
    expect(jobsConfig({ DEMO_MODE: "1", DATABASE_URL: "postgres://x", ...SUPABASE })).toEqual({
      enabled: false,
      reason: "demo",
    });
  });

  it("needs a database and the Supabase settings", () => {
    expect(jobsConfig({ ...SUPABASE })).toEqual({ enabled: false, reason: "no-database" });
    expect(jobsConfig({ DATABASE_URL: "postgres://x" })).toEqual({
      enabled: false,
      reason: "no-supabase",
    });
  });

  it("uses PGBOSS_DATABASE_URL, else DATABASE_URL", () => {
    expect(jobsConfig({ DATABASE_URL: "postgres://app", ...SUPABASE })).toEqual({
      enabled: true,
      connectionString: "postgres://app",
    });
    expect(
      jobsConfig({
        DATABASE_URL: "postgres://app",
        PGBOSS_DATABASE_URL: "postgres://boss",
        ...SUPABASE,
      }),
    ).toEqual({ enabled: true, connectionString: "postgres://boss" });
  });
});
