import { expect, it } from "vitest";
import type { PostInput } from "../../modules/news";
import { FUTURE, PAST, defineContractSuite, doc, expectContractError, ids, uniq } from "../harness";

const post = (overrides: Partial<PostInput> = {}): PostInput => ({
  slug: uniq("hir"),
  title: "Adventi koszorúkötés",
  lead: "Szeretettel várjuk a családokat.",
  body: doc("Részletek a plébánia irodájában."),
  categories: ["kozosseg"],
  ...overrides,
});

export const newsContract = defineContractSuite("news", (t) => {
  it("creates, publishes and serves posts by slug and category", async () => {
    const created = await t.repo.upsert(t.ctx.a, post());
    expect(created).toMatchObject({ tenantId: t.env.tenantA, status: "draft", publishedAt: null });
    await t.repo.publish(t.ctx.a, created.id, PAST);
    expect((await t.repo.getBySlug(t.ctx.anonA, created.slug))?.id).toBe(created.id);
    const page = await t.repo.listPublished(t.ctx.anonA, { category: "kozosseg", pageSize: 200 });
    expect(ids(page.items)).toContain(created.id);
    const other = await t.repo.listPublished(t.ctx.anonA, {
      category: "nincs-ilyen",
      pageSize: 200,
    });
    expect(ids(other.items)).not.toContain(created.id);
    const updated = await t.repo.upsert(t.ctx.a, {
      ...post({ slug: created.slug }),
      id: created.id,
      title: "Új cím",
    });
    expect(updated).toMatchObject({ id: created.id, title: "Új cím", status: "published" });
  });

  it("hides drafts, scheduled and expired posts from anonymous visitors", async () => {
    const draft = await t.repo.upsert(t.ctx.a, post());
    const scheduled = await t.repo.upsert(t.ctx.a, post());
    await t.repo.publish(t.ctx.a, scheduled.id, FUTURE);
    const expired = await t.repo.upsert(t.ctx.a, post({ expiresAt: "2021-01-01T00:00:00+01:00" }));
    await t.repo.publish(t.ctx.a, expired.id, PAST);
    const publicIds = ids((await t.repo.listPublished(t.ctx.anonA, { pageSize: 200 })).items);
    const anonListIds = ids((await t.repo.list(t.ctx.anonA, { pageSize: 200 })).items);
    for (const p of [draft, scheduled, expired]) {
      expect(publicIds).not.toContain(p.id);
      expect(anonListIds).not.toContain(p.id);
      expect(await t.repo.getBySlug(t.ctx.anonA, p.slug)).toBeNull();
      expect(await t.repo.get(t.ctx.anonA, p.id)).toBeNull();
      expect(await t.repo.get(t.ctx.a, p.id)).not.toBeNull();
    }
    expect(ids((await t.repo.list(t.ctx.a, { status: "draft", pageSize: 200 })).items)).toContain(
      draft.id,
    );
  });

  it("rejects invalid input and duplicate slugs", async () => {
    await expectContractError(
      t.repo.upsert(t.ctx.a, post({ slug: "Ékezetes Slug" })),
      "VALIDATION",
    );
    await expectContractError(t.repo.upsert(t.ctx.a, post({ title: "" })), "VALIDATION");
    const first = await t.repo.upsert(t.ctx.a, post());
    await expectContractError(t.repo.upsert(t.ctx.a, post({ slug: first.slug })), "CONFLICT");
  });

  it("never returns or modifies tenant A's posts for tenant B", async () => {
    const created = await t.repo.upsert(t.ctx.a, post());
    await t.repo.publish(t.ctx.a, created.id, PAST);
    expect(await t.repo.get(t.ctx.b, created.id)).toBeNull();
    expect(await t.repo.getBySlug(t.ctx.anonB, created.slug)).toBeNull();
    expect(ids((await t.repo.listPublished(t.ctx.anonB, { pageSize: 200 })).items)).not.toContain(
      created.id,
    );
    expect((await t.repo.list(t.ctx.org)).items).toEqual([]);
    await expectContractError(t.repo.unpublish(t.ctx.b, created.id), "NOT_FOUND");
    await expectContractError(t.repo.delete(t.ctx.b, created.id), "NOT_FOUND");
    await t.repo.delete(t.ctx.a, created.id);
    expect(await t.repo.get(t.ctx.a, created.id)).toBeNull();
  });
});
