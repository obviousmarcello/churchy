import { expect, it } from "vitest";
import type { PageInput } from "../../modules/pages";
import { PAST, defineContractSuite, doc, expectContractError, ids, uniq } from "../harness";

const page = (overrides: Partial<PageInput> = {}): PageInput => ({
  slug: uniq("rolunk"),
  title: "Rólunk",
  blocks: [
    { type: "heading", text: "Történetünk", level: 2 },
    { type: "text", content: doc("A templomot 1890-ben szentelték fel.") },
    { type: "quote", text: "Az Úr az én pásztorom.", source: "Zsolt 23,1" },
  ],
  ...overrides,
});

export const pagesContract = defineContractSuite("pages", (t) => {
  it("creates nested pages, publishes them and lists summaries", async () => {
    const parent = await t.repo.upsert(t.ctx.a, page());
    const child = await t.repo.upsert(
      t.ctx.a,
      page({ title: "Keresztelő", parentId: parent.id, riteKey: "keresztelo" }),
    );
    expect(child).toMatchObject({ parentId: parent.id, riteKey: "keresztelo", status: "draft" });
    await t.repo.publish(t.ctx.a, parent.id, PAST);
    await t.repo.publish(t.ctx.a, child.id, PAST);
    expect((await t.repo.getBySlug(t.ctx.anonA, child.slug))?.blocks).toHaveLength(3);
    const summaries = await t.repo.listPublished(t.ctx.anonA);
    const summary = summaries.find((s) => s.id === child.id);
    expect(summary).toEqual({
      id: child.id,
      slug: child.slug,
      title: "Keresztelő",
      parentId: parent.id,
      riteKey: "keresztelo",
      sort: 0,
    });
  });

  it("hides drafts from anonymous visitors", async () => {
    const draft = await t.repo.upsert(t.ctx.a, page());
    expect(await t.repo.getBySlug(t.ctx.anonA, draft.slug)).toBeNull();
    expect(ids(await t.repo.listPublished(t.ctx.anonA))).not.toContain(draft.id);
    expect(ids(await t.repo.list(t.ctx.anonA))).not.toContain(draft.id);
    expect(await t.repo.get(t.ctx.anonA, draft.id)).toBeNull();
    expect(ids(await t.repo.list(t.ctx.a))).toContain(draft.id);
  });

  it("rejects invalid blocks, duplicate slugs and unknown parents", async () => {
    await expectContractError(
      t.repo.upsert(
        t.ctx.a,
        page({
          blocks: [{ type: "embed", provider: "tiktok" as never, url: "https://example.test" }],
        }),
      ),
      "VALIDATION",
    );
    await expectContractError(
      t.repo.upsert(t.ctx.a, page({ blocks: [{ type: "html" } as never] })),
      "VALIDATION",
    );
    const first = await t.repo.upsert(t.ctx.a, page());
    await expectContractError(t.repo.upsert(t.ctx.a, page({ slug: first.slug })), "CONFLICT");
    await expectContractError(
      t.repo.upsert(t.ctx.a, page({ parentId: "nincs-ilyen" })),
      "NOT_FOUND",
    );
  });

  it("never returns, modifies or references tenant A's pages from tenant B", async () => {
    const created = await t.repo.upsert(t.ctx.a, page());
    await t.repo.publish(t.ctx.a, created.id, PAST);
    expect(await t.repo.getBySlug(t.ctx.anonB, created.slug)).toBeNull();
    expect(await t.repo.get(t.ctx.b, created.id)).toBeNull();
    expect(ids(await t.repo.list(t.ctx.b))).not.toContain(created.id);
    expect(await t.repo.list(t.ctx.org)).toEqual([]);
    await expectContractError(t.repo.upsert(t.ctx.b, page({ parentId: created.id })), "NOT_FOUND");
    await expectContractError(t.repo.delete(t.ctx.b, created.id), "NOT_FOUND");
  });
});
