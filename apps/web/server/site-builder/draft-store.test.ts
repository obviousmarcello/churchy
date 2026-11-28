// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { FIXTURE_ORIGIN, fixtureTransport } from "./fixtures";
import { FakePlanner } from "./llm";
import { buildDraft } from "./pipeline";
import { MemoryDraftStore } from "./draft-store";
import { SiteFetcher } from "./site-fetcher";
import type { LlmPlan } from "./plan-schema";

vi.mock("server-only", () => ({}));

async function draft(now: Date) {
  const plan: LlmPlan = {
    church: {
      name: "Minta",
      shortName: "Minta",
      nameSourceUrl: "",
      denomination: "general",
      denominationConfidence: 0.4,
      tagline: "",
      welcome: "",
    },
    locations: [],
    serviceTimes: [],
    pages: [],
    posts: [],
    announcements: [],
    notes: [],
  };
  const fetcher = new SiteFetcher(`${FIXTURE_ORIGIN}/`, {
    limits: { minDelayMs: 0 },
    sleep: async () => {},
    transport: fixtureTransport(),
  });
  const res = await buildDraft(
    { startUrl: `${FIXTURE_ORIGIN}/`, operatorId: "op", consent: true, now, ttlHours: 24 },
    { fetcher, planner: new FakePlanner(() => plan) },
  );
  if (!res.ok) throw new Error("build failed");
  return res.draft;
}

describe("MemoryDraftStore", () => {
  it("expires drafts after the TTL, purges them, and keeps applied ones", async () => {
    const t0 = new Date("2026-11-28T10:00:00Z");
    const store = new MemoryDraftStore();
    const a = await store.create(await draft(t0));
    const b = await store.create(await draft(t0));
    expect(await store.markApplied(b.id, "tenant-1")).toBe(true);
    expect(await store.get(a.id, new Date("2026-11-29T09:59:00Z"))).not.toBeNull();
    const later = new Date("2026-11-29T10:00:01Z");
    expect(await store.get(a.id, later)).toBeNull();
    expect(await store.purgeExpired(later)).toBe(1);
    expect((await store.get(b.id, later))?.status).toBe("applied");
    expect(await store.update(b.id, await draft(t0))).toBeNull();
    expect(await store.markApplied(b.id, "tenant-2")).toBe(false);
  });
});
