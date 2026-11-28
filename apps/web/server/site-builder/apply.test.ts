// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { SiteConfigOverridesSchema } from "@churchy/contracts";
import { repositoriesFor } from "@/server/data-adapters";
import { applyDraftWithRepositories } from "./apply-existing";
import { seedStatements, serviceTypeKey, siteConfigFromDraft, attribution } from "./apply-new";
import type { SiteDraft } from "./draft-schema";
import { FIXTURE_ORIGIN, fixturePlan, fixtureTransport } from "./fixtures";
import { FakePlanner } from "./llm";
import { buildDraft } from "./pipeline";
import { SiteFetcher } from "./site-fetcher";

async function fixtureDraft(): Promise<SiteDraft> {
  const fetcher = new SiteFetcher(`${FIXTURE_ORIGIN}/`, {
    limits: { minDelayMs: 0 },
    sleep: async () => {},
    transport: fixtureTransport(),
  });
  const res = await buildDraft(
    { startUrl: `${FIXTURE_ORIGIN}/`, operatorId: "op", consent: true },
    { fetcher, planner: new FakePlanner(fixturePlan) },
  );
  if (!res.ok) throw new Error("build failed");
  return res.draft;
}

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
let n = 0;
const ids = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;

describe("seedStatements (new church)", () => {
  it("inserts only included items, all as unpublished drafts, scoped to the new tenant", async () => {
    const draft = await fixtureDraft();
    const { statements, summary } = seedStatements(draft, T, [], ids);
    expect(summary).toMatchObject({
      pages: 1,
      posts: 1,
      announcements: 0,
      locations: 1,
      serviceRules: 2,
      media: 0,
    });
    const tables = statements.map((s) => /insert into (\w+)/.exec(s.text)![1]);
    expect(tables.sort()).toEqual(
      ["locations", "pages", "posts", "schedule_periods", "service_rules", "service_rules"].sort(),
    );
    for (const s of statements) {
      expect(s.values).toContain(T);
      // nothing is published by the apply
      expect(s.text).not.toMatch(/status|published_at/);
    }
    expect(JSON.stringify(statements)).not.toMatch(/pal\.pelda|555 0123|súlyosan beteg/);
  });

  it("skips items switched off in the review and keeps rules on a fallback location", async () => {
    const draft = await fixtureDraft();
    const off: SiteDraft = {
      ...draft,
      pages: draft.pages.map((p) => ({ ...p, include: false })),
      posts: draft.posts.map((p) => ({ ...p, include: false })),
      locations: draft.locations.map((l) => ({ ...l, include: false })),
    };
    const { statements, summary } = seedStatements(off, T, [], ids);
    expect(summary).toMatchObject({ pages: 0, posts: 0, locations: 0, serviceRules: 2 });
    // a placeholder location named after the church carries the rules
    expect(statements.some((s) => /insert into locations/.test(s.text))).toBe(true);
  });

  it("maps image blocks to media only when a stored image exists", async () => {
    const draft = await fixtureDraft();
    const withImages = {
      ...draft,
      pages: [
        {
          ...draft.pages[0]!,
          blocks: [
            { type: "image" as const, imageId: "img-1", caption: null },
            ...draft.pages[0]!.blocks,
          ],
        },
      ],
    };
    const none = seedStatements(withImages, T, [], ids).statements.find((s) =>
      /into pages/.test(s.text),
    )!;
    expect(String(none.values[4])).not.toContain('"image"');
    const stored = [
      {
        draftImageId: "img-1",
        id: "m-1",
        filename: "a.webp",
        mimeType: "image/webp",
        storageKey: `t/${T}/a.webp`,
        bytes: 10,
        width: 1,
        height: 1,
        alt: null,
      },
    ];
    const some = seedStatements(withImages, T, stored, ids);
    expect(String(some.statements.find((s) => /into pages/.test(s.text))!.values[4])).toContain(
      '"mediaId":"m-1"',
    );
    expect(some.summary.media).toBe(1);
  });

  it("builds a valid site config and attribution", async () => {
    const draft = await fixtureDraft();
    const cfg = siteConfigFromDraft(draft);
    expect(SiteConfigOverridesSchema.safeParse(cfg).success).toBe(true);
    expect(cfg.identity?.name).toBe("Mintavárosi Szent Példa Plébánia");
    expect(cfg.theme?.colors?.primary).toBe("#7a1f2b");
    expect(cfg.contact?.email).toBe("iroda@plebania.example.hu");
    expect(attribution(draft).every((a) => a.sourceUrl.startsWith(FIXTURE_ORIGIN))).toBe(true);
  });

  it("uses the preset's service type when the label matches", async () => {
    const draft = await fixtureDraft();
    expect(serviceTypeKey("Szentmise", draft)).toBe("szentmise");
    expect(serviceTypeKey("Gyermekmise vasárnap", draft)).toBe("gyermekmise");
    expect(serviceTypeKey("Különleges alkalom", draft)).toBe("kulonleges-alkalom");
  });
});

describe("applyDraftWithRepositories (existing church)", () => {
  const ctx = (tenantId: string) => ({ tenantId, actor: { userId: "user-owner", personId: null } });

  it("adds content additively with unique slugs, unpublished, and fills an empty schedule once", async () => {
    const repos = repositoriesFor("site-builder-test-1");
    const { demoDirectory } = await import("@/server/data-adapters");
    const tenantId = demoDirectory().defaultTenantId;
    const c = ctx(tenantId);
    const before = await repos.pages.list(c);
    const draft = await fixtureDraft();
    const first = await applyDraftWithRepositories(c, repos, draft);
    expect(first.pages).toBe(1);
    expect(first.posts).toBe(1);
    const after = await repos.pages.list(c);
    expect(after.length).toBe(before.length + 1);
    const added = after.find((p) => !before.some((b) => b.id === p.id))!;
    expect(added.status).toBe("draft");
    // existing pages untouched
    for (const b of before) expect(after.find((p) => p.id === b.id)?.title).toBe(b.title);
    // second apply: slugs get a suffix, nothing collides or throws
    const second = await applyDraftWithRepositories(c, repos, draft);
    expect(second.pages).toBe(1);
    expect(
      (await repos.pages.list(c)).filter((p) => p.slug.startsWith(added.slug.replace(/-\d+$/, "")))
        .length,
    ).toBeGreaterThan(1);
    // the demo church already has a schedule: the apply does not touch it
    expect(second.serviceRules).toBe(0);
  });
});
