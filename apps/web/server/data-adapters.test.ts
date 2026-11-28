// @vitest-environment node
/**
 * Registry wiring of the composition root (D-90 [BE]): a module switched to `db` resolves to the
 * DB adapter, every other module stays on mock, and selecting `db` for a module without a DB
 * adapter fails when the composition root is loaded. No database is used: the DB repository is
 * recognised by needing `DATABASE_URL` on its first query.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Ctx } from "@churchy/contracts";

const ctx: Ctx = {
  tenantId: "00000000-0000-4000-8000-00000000000a",
  actor: { userId: "u-1", personId: null },
};

/** A fresh module graph, so the composition root registers into a fresh registry. */
async function loadCompositionRoot() {
  vi.resetModules();
  return import("./data-adapters");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("data-adapters: per-module adapter selection", () => {
  it("routes a module set to db to the DB adapter and keeps the rest on mock", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("DATA_ADAPTER_LOCATIONS", "db");
    const { repositoriesFor } = await loadCompositionRoot();
    const repos = repositoriesFor(null);
    await expect(repos.locations.list(ctx)).rejects.toThrow("DATABASE_URL is not set");
    await expect(repos.announcements.list(ctx)).resolves.toMatchObject({ items: [] });
  });

  it("fails at load time when a module without a DB adapter is set to db", async () => {
    vi.stubEnv("DATA_ADAPTER_NEWS", "db");
    await expect(loadCompositionRoot()).rejects.toThrow(
      "No adapter registered for: DATA_ADAPTER_NEWS=db",
    );
  });
});
