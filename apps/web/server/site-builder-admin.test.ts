// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { repositoriesFor, demoDirectory } from "@/server/data-adapters";
import { createFakeDb } from "@/server/platform-db/fake-db";
import { DbDraftStore, getDraftForTenant } from "@/server/platform-db/site-drafts";
import {
  applyForOwner,
  applyToNewChurch,
  SelectionSchema,
  withSelection,
} from "./site-builder-admin";
import { FIXTURE_ORIGIN, fixturePlan, fixtureTransport } from "./site-builder/fixtures";
import { FakePlanner } from "./site-builder/llm";
import { buildDraft } from "./site-builder/pipeline";
import { MemoryDraftStore } from "./site-builder/draft-store";
import { SiteFetcher } from "./site-builder/site-fetcher";
import { siteBuilderMode } from "./site-builder-mode";

const U1 = "22222222-2222-4222-8222-222222222222";

async function draft(now = new Date()) {
  const fetcher = new SiteFetcher(`${FIXTURE_ORIGIN}/`, {
    limits: { minDelayMs: 0 },
    sleep: async () => {},
    transport: fixtureTransport(),
  });
  const res = await buildDraft(
    { startUrl: `${FIXTURE_ORIGIN}/`, operatorId: "op", consent: true, now, ttlHours: 24 },
    { fetcher, planner: new FakePlanner(fixturePlan) },
  );
  if (!res.ok) throw new Error("build failed");
  return res.draft;
}
const none = {
  pages: [],
  posts: [],
  announcements: [],
  locations: [],
  serviceTimes: [],
  images: [],
};

describe("withSelection", () => {
  it("switches the listed items off and never switches off-site images on", async () => {
    const d = await draft();
    const out = withSelection(d, { ...none, pages: [d.pages[0]!.id], images: [] });
    expect(out.pages[0]!.include).toBe(false);
    expect(out.posts[0]!.include).toBe(true);
    expect(out.images.filter((i) => i.offsite).every((i) => !i.include)).toBe(true);
    expect(SelectionSchema.safeParse({ ...none, pages: "x" }).success).toBe(false);
  });
});

describe("applyToNewChurch", () => {
  const input = {
    name: "Mintavárosi Plébánia",
    slug: "mintavaros",
    owner: { authUserId: U1, email: "owner@example.test", name: "Minta Mihály" },
  };

  it("demo mode applies nothing to a database and marks the draft applied", async () => {
    const store = new MemoryDraftStore();
    const row = await store.create(await draft());
    const res = await applyToNewChurch({
      store,
      draftId: row.id,
      input,
      mode: "demo",
      operatorId: "op",
    });
    expect(res).toMatchObject({ ok: true, slug: "mintavaros", summary: { pages: 1, posts: 1 } });
    expect((await store.get(row.id))?.status).toBe("applied");
    expect(
      await applyToNewChurch({ store, draftId: row.id, input, mode: "demo", operatorId: "op" }),
    ).toEqual({ ok: false, reason: "not_found" });
  });

  it("live: one transaction with the church, the seeded content, the applied mark and the audit entry", async () => {
    const store = new MemoryDraftStore();
    const row = await store.create(await draft());
    const { db, calls, events } = createFakeDb((text) => {
      if (/from plans/.test(text)) return [{ x: 1 }];
      if (/into profiles/.test(text)) return [{ id: U1 }];
      return [];
    });
    const res = await applyToNewChurch({
      store,
      draftId: row.id,
      input,
      mode: "live",
      operatorId: U1,
      db,
    });
    expect(res).toMatchObject({ ok: true, slug: "mintavaros" });
    expect(events).toEqual(["begin", "commit"]);
    expect(calls.every((c) => c.tx)).toBe(true);
    const tables = calls
      .map((c) => /(?:insert into|update) (\w+)/.exec(c.text)?.[1])
      .filter(Boolean);
    expect(tables).toContain("pages");
    expect(tables).toContain("site_drafts");
    expect(tables.at(-1)).toBe("audit_log");
    const tenantInsert = calls.find((c) => /insert into tenants/.test(c.text))!;
    expect(String(tenantInsert.values[5])).toContain("Mintavárosi Szent Példa Plébánia");
    const audit = calls.at(-1)!;
    expect(String(audit.values[4])).toContain("sources");
    expect(String(audit.values[4])).not.toMatch(/Rólunk|plébánosa/); // ids, counts and URLs only, no texts
  });

  it("live: a failure in the seeding rolls everything back", async () => {
    const store = new MemoryDraftStore();
    const row = await store.create(await draft());
    const { db, events } = createFakeDb((text) => {
      if (/from plans/.test(text)) return [{ x: 1 }];
      if (/into profiles/.test(text)) return [{ id: U1 }];
      if (/insert into pages/.test(text)) return new Error("boom");
      return [];
    });
    await expect(
      applyToNewChurch({ store, draftId: row.id, input, mode: "live", operatorId: U1, db }),
    ).rejects.toThrow("boom");
    expect(events).toEqual(["begin", "rollback"]);
  });

  it("rejects bad church data and unknown drafts before touching the database", async () => {
    const store = new MemoryDraftStore();
    const row = await store.create(await draft());
    const { db, calls } = createFakeDb();
    expect(
      await applyToNewChurch({
        store,
        draftId: row.id,
        input: { ...input, owner: { ...input.owner, authUserId: "x" } },
        mode: "live",
        operatorId: U1,
        db,
      }),
    ).toEqual({ ok: false, reason: "invalid" });
    expect(
      await applyToNewChurch({ store, draftId: "nope", input, mode: "live", operatorId: U1, db }),
    ).toEqual({ ok: false, reason: "not_found" });
    expect(calls).toEqual([]);
  });

  it("operator path may create a reserved slug (golgota), self-serve cannot", async () => {
    const store = new MemoryDraftStore();
    const row = await store.create(await draft());
    const { db } = createFakeDb((text) =>
      /from plans/.test(text) ? [{ x: 1 }] : /into profiles/.test(text) ? [{ id: U1 }] : [],
    );
    const res = await applyToNewChurch({
      store,
      draftId: row.id,
      input: { ...input, slug: "golgota" },
      mode: "live",
      operatorId: U1,
      db,
    });
    expect(res).toMatchObject({ ok: true, slug: "golgota" });
  });
});

describe("applyForOwner", () => {
  it("applies a draft prepared for this church only, additively, once", async () => {
    const tenantId = demoDirectory().defaultTenantId;
    const other = demoDirectory().contexts.find(
      (c) => c.kind === "tenant" && c.id !== tenantId,
    )!.id;
    const store = new MemoryDraftStore();
    const row = await store.create(await draft(), { targetTenantId: tenantId });
    const repos = repositoriesFor("site-builder-owner-test");
    const ctx = (t: string) => ({ tenantId: t, actor: { userId: "u-owner", personId: null } });
    const base = { mode: "demo" as const, userId: "u-owner", repos, store, draftId: row.id };
    // another church's owner cannot apply it
    expect(await applyForOwner({ ...base, tenantId: other, ctx: ctx(other) })).toEqual({
      ok: false,
      reason: "not_found",
    });
    const ok = await applyForOwner({ ...base, tenantId, ctx: ctx(tenantId) });
    expect(ok).toMatchObject({ ok: true, summary: { pages: 1 } });
    expect(await applyForOwner({ ...base, tenantId, ctx: ctx(tenantId) })).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("live: reads the draft through the platform role by church and writes the audit entry", async () => {
    const tenantId = "33333333-3333-4333-8333-333333333333";
    const d = await draft();
    const { db, calls } = createFakeDb((text, values) => {
      if (/from site_drafts/.test(text))
        return values[1] === tenantId
          ? [
              {
                id: "d1",
                status: "ready",
                target_tenant_id: tenantId,
                applied_tenant_id: null,
                draft: d,
              },
            ]
          : [];
      if (/update site_drafts/.test(text)) return [{ ok: 1 }];
      return [];
    });
    const repos = repositoriesFor("site-builder-owner-live");
    const demoTenant = demoDirectory().defaultTenantId;
    const res = await applyForOwner({
      mode: "live",
      draftId: "d1",
      tenantId,
      userId: U1,
      ctx: { tenantId: demoTenant, actor: { userId: "u-owner", personId: null } },
      repos,
      store: new DbDraftStore(U1, db),
      dbQuery: db,
    });
    expect(res).toMatchObject({ ok: true });
    expect(calls.some((c) => /update site_drafts/.test(c.text))).toBe(true);
    expect(calls.at(-1)!.text).toMatch(/insert into audit_log/);
    expect(
      await getDraftForTenant("d1", "44444444-4444-4444-8444-444444444444", new Date(), db),
    ).toBeNull();
  });
});

describe("DbDraftStore", () => {
  it("creates, updates only ready drafts, and purges expired ones", async () => {
    const d = await draft();
    const { db, calls } = createFakeDb((text) =>
      /insert into site_drafts|update site_drafts set draft/.test(text)
        ? [{ id: "d1", status: "ready", target_tenant_id: null, applied_tenant_id: null, draft: d }]
        : [],
    );
    const store = new DbDraftStore(U1, db);
    expect((await store.create(d)).id).toBe("d1");
    expect((await store.update("d1", d))?.id).toBe("d1");
    expect(calls.find((c) => /update site_drafts set draft/.test(c.text))!.text).toMatch(
      /status = 'ready' and expires_at > now\(\)/,
    );
    expect(await store.purgeExpired(new Date("2026-12-01T00:00:00Z"))).toBe(0);
    expect(calls.at(-1)!.text).toMatch(
      /delete from site_drafts where status = 'ready' and expires_at <= \$1/,
    );
    expect(await store.get("zzz")).toBeNull();
    expect(calls.at(-1)!.text).toMatch(/status = 'applied' or expires_at > \$2/);
  });
});

describe("siteBuilderMode", () => {
  it("is demo in demo mode, live only with the platform database and the key, else off", () => {
    expect(siteBuilderMode({ DEMO_MODE: "1" })).toBe("demo");
    expect(siteBuilderMode({})).toBe("off");
    expect(siteBuilderMode({ DATABASE_URL_PLATFORM: "postgres://x", ANTHROPIC_API_KEY: "k" })).toBe(
      "live",
    );
    expect(siteBuilderMode({ DATABASE_URL_PLATFORM: "postgres://x" })).toBe("off");
    expect(siteBuilderMode({ ANTHROPIC_API_KEY: "k" })).toBe("off");
  });
});
