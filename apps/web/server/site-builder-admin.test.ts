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
import { MemoryMediaSink } from "./site-builder/media-sink";
import type { ApplyMedia } from "./site-builder/apply-existing";
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

describe("applying with a media sink", () => {
  const input = {
    name: "Mintavárosi Plébánia",
    slug: "mintavaros",
    owner: { authUserId: U1, email: "owner@example.test", name: "Minta Mihály" },
  };
  const mediaWith = (sink: MemoryMediaSink) => (): ApplyMedia => ({
    fetcher: new SiteFetcher(`${FIXTURE_ORIGIN}/`, {
      limits: { minDelayMs: 0 },
      sleep: async () => {},
      transport: fixtureTransport(),
    }),
    sink,
  });
  const liveDb = (failAt?: RegExp) =>
    createFakeDb((text) => {
      if (/from plans/.test(text)) return [{ x: 1 }];
      if (/into profiles/.test(text)) return [{ id: U1 }];
      if (failAt?.test(text)) return new Error("boom");
      return [];
    });

  it("new church: uploads inside the seed, inserts media rows under the new tenant, reports what is left", async () => {
    const store = new MemoryDraftStore();
    const d = await draft();
    const kept = d.images.filter((i) => i.include && !i.offsite).length;
    expect(kept).toBeGreaterThan(0);
    const row = await store.create(d);
    const sink = new MemoryMediaSink();
    const { db, calls } = liveDb();
    const res = await applyToNewChurch({
      store,
      draftId: row.id,
      input,
      mode: "live",
      operatorId: U1,
      db,
      mediaFor: mediaWith(sink),
    });
    expect(res).toMatchObject({ ok: true, summary: { media: kept, mediaFailed: 0 } });
    expect(res.ok && res.imagesNotApplied).toBe(d.images.filter((i) => i.include).length - kept);
    const inserts = calls.filter((c) => /insert into media/.test(c.text));
    expect(inserts).toHaveLength(kept);
    const tenantId = String(inserts[0]!.values[1]);
    for (const c of inserts) {
      expect(String(c.values[4])).toMatch(new RegExp(`^t/${tenantId}/media/[0-9a-f-]{36}\\.webp$`));
      expect(sink.objects.has(String(c.values[4]))).toBe(true);
      expect(c.values[3]).toBe("image/webp");
    }
  });

  it("new church: a rolled-back transaction removes the uploaded objects again", async () => {
    const store = new MemoryDraftStore();
    const row = await store.create(await draft());
    const sink = new MemoryMediaSink();
    const { db, events } = liveDb(/insert into pages/);
    await expect(
      applyToNewChurch({
        store,
        draftId: row.id,
        input,
        mode: "live",
        operatorId: U1,
        db,
        mediaFor: mediaWith(sink),
      }),
    ).rejects.toThrow("boom");
    expect(events).toEqual(["begin", "rollback"]);
    expect(sink.objects.size).toBe(0);
  });

  it("new church: one failing upload is a warning count, the church is still created", async () => {
    const store = new MemoryDraftStore();
    const d = await draft();
    const row = await store.create(d);
    const kept = d.images.filter((i) => i.include && !i.offsite).length;
    const sink = new MemoryMediaSink();
    const realPut = sink.put.bind(sink);
    let n = 0;
    sink.put = async (c, k, b) => {
      if (n++ === 0) throw new Error("storage down");
      return realPut(c, k, b);
    };
    const { db, events } = liveDb();
    const res = await applyToNewChurch({
      store,
      draftId: row.id,
      input,
      mode: "live",
      operatorId: U1,
      db,
      mediaFor: mediaWith(sink),
    });
    expect(events).toEqual(["begin", "commit"]);
    expect(res).toMatchObject({ ok: true, summary: { media: kept - 1, mediaFailed: 1 } });
  });

  it("new church without a sink: nothing is carried over and all kept images are reported", async () => {
    const store = new MemoryDraftStore();
    const d = await draft();
    const row = await store.create(d);
    const { db } = liveDb();
    const res = await applyToNewChurch({
      store,
      draftId: row.id,
      input,
      mode: "live",
      operatorId: U1,
      db,
    });
    expect(res).toMatchObject({
      ok: true,
      summary: { media: 0 },
      imagesNotApplied: d.images.filter((i) => i.include).length,
    });
  });

  it("demo mode uses the fixture site and the memory sink (no network)", async () => {
    const store = new MemoryDraftStore();
    const row = await store.create(await draft());
    const sink = new MemoryMediaSink();
    const res = await applyToNewChurch({
      store,
      draftId: row.id,
      input,
      mode: "demo",
      operatorId: "op",
      mediaFor: mediaWith(sink),
    });
    expect(res.ok && res.summary.media).toBeGreaterThan(0);
    expect(sink.objects.size).toBe(res.ok ? res.summary.media : -1);
  });

  it("owner: carries images over through the media repository and replaces image blocks", async () => {
    const repos = repositoriesFor("site-builder-media-owner");
    const tenantId = demoDirectory().defaultTenantId;
    const store = new MemoryDraftStore();
    const d = await draft();
    const row = await store.create(d, { targetTenantId: tenantId });
    const sink = new MemoryMediaSink();
    const ctx = { tenantId, actor: { userId: U1, personId: null } };
    const before = (await repos.media.list(ctx)).total;
    const res = await applyForOwner({
      mode: "demo",
      draftId: row.id,
      tenantId,
      userId: U1,
      ctx,
      repos,
      store,
      mediaFor: mediaWith(sink),
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.summary.media).toBeGreaterThan(0);
    expect((await repos.media.list(ctx)).total).toBe(before + res.summary.media);
    expect(sink.objects.size).toBe(res.summary.media);
    for (const key of sink.objects.keys())
      expect(key.startsWith(`t/${tenantId}/media/`)).toBe(true);
  });

  it("owner: a failure after the upload removes the objects and media rows again", async () => {
    const repos = repositoriesFor("site-builder-media-owner-fail");
    const tenantId = demoDirectory().defaultTenantId;
    const store = new MemoryDraftStore();
    const row = await store.create(await draft(), { targetTenantId: tenantId });
    const sink = new MemoryMediaSink();
    const ctx = { tenantId, actor: { userId: U1, personId: null } };
    const before = (await repos.media.list(ctx)).total;
    repos.pages.upsert = async () => {
      throw new Error("boom");
    };
    await expect(
      applyForOwner({
        mode: "demo",
        draftId: row.id,
        tenantId,
        userId: U1,
        ctx,
        repos,
        store,
        mediaFor: mediaWith(sink),
      }),
    ).rejects.toThrow("boom");
    expect(sink.objects.size).toBe(0);
    expect((await repos.media.list(ctx)).total).toBe(before);
  });

  it("new church: logoMediaId in the tenant INSERT matches the media row inserted in the seed", async () => {
    const store = new MemoryDraftStore();
    const d = await draft();
    expect(d.images.some((i) => i.role === "logo" && i.include && !i.offsite)).toBe(true);
    const row = await store.create(d);
    const sink = new MemoryMediaSink();
    const { db, calls } = liveDb();
    const res = await applyToNewChurch({
      store,
      draftId: row.id,
      input,
      mode: "live",
      operatorId: U1,
      db,
      mediaFor: mediaWith(sink),
    });
    expect(res).toMatchObject({ ok: true, logoMissing: false, summary: { logoSet: true } });
    const tenantInsert = calls.find((c) => /insert into tenants/.test(c.text))!;
    const logoId = JSON.parse(String(tenantInsert.values[5])).identity.logoMediaId as string;
    expect(logoId).toMatch(/^[0-9a-f-]{36}$/);
    expect(String(tenantInsert.values[0])).toBe(
      String(calls.find((c) => /insert into media/.test(c.text))!.values[1]),
    );
    const mediaRow = calls.find((c) => /insert into media/.test(c.text) && c.values[0] === logoId);
    expect(mediaRow).toBeDefined();
    expect(sink.objects.has(String(mediaRow!.values[4]))).toBe(true);
    expect(calls.findIndex((c) => c === tenantInsert)).toBeLessThan(calls.indexOf(mediaRow!));
  });

  it("new church: a failing logo leaves logoMediaId unset and is reported", async () => {
    const store = new MemoryDraftStore();
    const row = await store.create(await draft());
    const sink = new MemoryMediaSink();
    const realPut = sink.put.bind(sink);
    let n = 0;
    sink.put = async (c, k, b) => {
      if (n++ === 0) throw new Error("storage down"); // the logo is uploaded first
      return realPut(c, k, b);
    };
    const { db, calls } = liveDb();
    const res = await applyToNewChurch({
      store,
      draftId: row.id,
      input,
      mode: "live",
      operatorId: U1,
      db,
      mediaFor: mediaWith(sink),
    });
    expect(res).toMatchObject({ ok: true, logoMissing: true, summary: { logoSet: false } });
    const tenantInsert = calls.find((c) => /insert into tenants/.test(c.text))!;
    expect(JSON.parse(String(tenantInsert.values[5])).identity.logoMediaId).toBeUndefined();
  });

  it("new church: the logo object is removed too when the transaction rolls back", async () => {
    const store = new MemoryDraftStore();
    const row = await store.create(await draft());
    const sink = new MemoryMediaSink();
    const { db } = liveDb(/insert into pages/);
    await expect(
      applyToNewChurch({
        store,
        draftId: row.id,
        input,
        mode: "live",
        operatorId: U1,
        db,
        mediaFor: mediaWith(sink),
      }),
    ).rejects.toThrow("boom");
    expect(sink.objects.size).toBe(0);
  });

  it("owner: sets the logo when none exists, never overwrites an existing one", async () => {
    const tenantId = demoDirectory().defaultTenantId;
    const ctx = { tenantId, actor: { userId: U1, personId: null } };
    const run = async (name: string, preset?: string) => {
      const repos = repositoriesFor(name);
      const cur = await repos.tenants.current(ctx);
      await repos.tenants.updateSiteConfig(ctx, {
        ...cur!.siteConfig,
        identity: { ...cur!.siteConfig.identity, logoMediaId: preset },
      } as never);
      const store = new MemoryDraftStore();
      const row = await store.create(await draft(), { targetTenantId: tenantId });
      const res = await applyForOwner({
        mode: "demo",
        draftId: row.id,
        tenantId,
        userId: U1,
        ctx,
        repos,
        store,
        mediaFor: mediaWith(new MemoryMediaSink()),
      });
      return { res, after: (await repos.tenants.current(ctx))!.siteConfig.identity?.logoMediaId };
    };
    const fresh = await run("site-builder-logo-none");
    expect(fresh.res).toMatchObject({ ok: true, logoMissing: false, summary: { logoSet: true } });
    expect(fresh.after).toMatch(/^[0-9a-f-]{36}$|^.+$/);
    const existing = "11111111-1111-4111-8111-111111111111";
    const kept = await run("site-builder-logo-kept", existing);
    expect(kept.after).toBe(existing);
    expect(kept.res).toMatchObject({ ok: true, logoMissing: false, summary: { logoSet: true } });
  });
});
