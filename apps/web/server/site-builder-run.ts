import "server-only";

import {
  ANTHROPIC_KEY_ENV,
  siteBuilderMode,
  type SiteBuilderMode,
} from "@/server/site-builder-mode";
import { demoDirectory } from "@/server/data-adapters";
import { DbDraftStore, listDraftsForTenant, listTenantOptions } from "@/server/platform-db";
import { FIXTURE_ORIGIN, fixturePlan, fixtureTransport } from "@/server/site-builder/fixtures";
import { AnthropicPlanner, FakePlanner, type Planner } from "@/server/site-builder/llm";
import { MemoryDraftStore, type DraftStore } from "@/server/site-builder/draft-store";
import { runBudgetFromEnv, type BuildDeps } from "@/server/site-builder/pipeline";
import { SiteFetcher } from "@/server/site-builder/site-fetcher";

/**
 * Wires the site builder to its environment. Live: the real fetcher, the Anthropic planner (platform
 * key `ANTHROPIC_API_KEY`) and the `site_drafts` table. Demo: the fixture site from memory, the fake
 * planner and an in-memory store (no network, no key, no database). Off: neither is configured.
 */
export { siteBuilderMode, type SiteBuilderMode };

const demoStore = (): MemoryDraftStore => {
  const g = globalThis as { __siteBuilderDemoStore?: MemoryDraftStore };
  return (g.__siteBuilderDemoStore ??= new MemoryDraftStore());
};

export function draftStoreFor(mode: SiteBuilderMode, operatorId: string): DraftStore | null {
  if (mode === "demo") return demoStore();
  if (mode === "live") return new DbDraftStore(operatorId);
  return null;
}

/** The URL actually crawled: in demo mode always the fixture site, whatever was typed. */
export function startUrlFor(mode: SiteBuilderMode, typed: string): string {
  return mode === "demo" ? `${FIXTURE_ORIGIN}/` : typed;
}

export function buildDepsFor(
  mode: SiteBuilderMode,
  startUrl: string,
  signal?: AbortSignal,
): Omit<BuildDeps, "onProgress"> | null {
  const budget = runBudgetFromEnv();
  if (mode === "demo") {
    const planner: Planner = new FakePlanner(fixturePlan);
    return {
      planner,
      budget,
      ...(signal ? { signal } : {}),
      fetcher: new SiteFetcher(startUrl, {
        limits: { minDelayMs: 0 },
        sleep: async () => {},
        transport: fixtureTransport(),
      }),
    };
  }
  if (mode === "live") {
    const key = process.env[ANTHROPIC_KEY_ENV]?.trim();
    if (!key) return null;
    return {
      planner: new AnthropicPlanner(key),
      budget,
      ...(signal ? { signal } : {}),
      fetcher: new SiteFetcher(startUrl),
    };
  }
  return null;
}

/** Churches the operator can prepare a draft for (demo: the demo churches). */
export async function tenantOptionsFor(
  mode: SiteBuilderMode,
): Promise<{ id: string; name: string }[]> {
  if (mode === "demo") {
    return demoDirectory().contexts.flatMap((c) =>
      c.kind === "tenant" ? [{ id: c.id, name: c.name }] : [],
    );
  }
  return mode === "live" ? listTenantOptions() : [];
}

/** Drafts prepared for this church and still waiting for its owner. */
export async function ownerDraftsFor(
  mode: SiteBuilderMode,
  tenantId: string,
): Promise<{ id: string; sourceUrl: string; expiresAt: string }[]> {
  if (mode === "live") return listDraftsForTenant(tenantId);
  if (mode !== "demo") return [];
  return demoStore().listForTenant(tenantId);
}
