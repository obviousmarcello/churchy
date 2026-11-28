import { expect, it } from "vitest";
import type { MediaCreateInput } from "../../modules/media";
import { defineContractSuite, expectContractError, ids, uniq } from "../harness";

const image = (overrides: Partial<MediaCreateInput> = {}): MediaCreateInput => ({
  kind: "image",
  filename: "templom-homlokzat.jpg",
  mimeType: "image/jpeg",
  storageKey: `${uniq("media")}/original.jpg`,
  bytes: 2_400_000,
  width: 4000,
  height: 3000,
  alt: "A templom homlokzata tavasszal",
  ...overrides,
});

export const mediaContract = defineContractSuite("media", (t) => {
  it("records uploads and serves public metadata", async () => {
    const before = await t.repo.usage(t.ctx.a);
    const created = await t.repo.create(t.ctx.a, image());
    expect(created).toMatchObject({
      tenantId: t.env.tenantA,
      visibility: "public",
      decorative: false,
      peopleConsent: false,
      uploadedBy: t.env.actorA.userId,
    });
    expect((await t.repo.get(t.ctx.anonA, created.id))?.alt).toBe("A templom homlokzata tavasszal");
    expect(ids(await t.repo.getMany(t.ctx.anonA, [created.id, "nincs-ilyen"]))).toEqual([
      created.id,
    ]);
    const after = await t.repo.usage(t.ctx.a);
    expect(after.bytes - before.bytes).toBe(2_400_000);
    expect(after.count - before.count).toBe(1);
    const updated = await t.repo.update(t.ctx.a, created.id, {
      caption: "Húsvét",
      peopleConsent: true,
    });
    expect(updated).toMatchObject({ caption: "Húsvét", peopleConsent: true });
  });

  it("keeps private media and the library away from anonymous visitors", async () => {
    const pdf = await t.repo.create(t.ctx.a, {
      kind: "pdf",
      filename: "jelentkezesi-lap.pdf",
      mimeType: "application/pdf",
      storageKey: `${uniq("media")}/lap.pdf`,
      bytes: 120_000,
      visibility: "private",
    });
    expect(await t.repo.get(t.ctx.anonA, pdf.id)).toBeNull();
    expect(await t.repo.getMany(t.ctx.anonA, [pdf.id])).toEqual([]);
    expect((await t.repo.list(t.ctx.anonA)).items).toEqual([]);
    expect(ids((await t.repo.list(t.ctx.a, { kind: "pdf", pageSize: 200 })).items)).toContain(
      pdf.id,
    );
  });

  it("requires alt text or the decorative flag on images", async () => {
    await expectContractError(t.repo.create(t.ctx.a, image({ alt: null })), "VALIDATION");
    await expectContractError(t.repo.create(t.ctx.a, image({ mimeType: "kép" })), "VALIDATION");
    const decorative = await t.repo.create(t.ctx.a, image({ alt: null, decorative: true }));
    expect(decorative.decorative).toBe(true);
    const withAlt = await t.repo.create(t.ctx.a, image());
    await expectContractError(t.repo.update(t.ctx.a, withAlt.id, { alt: null }), "VALIDATION");
  });

  it("never returns or modifies tenant A's media for tenant B", async () => {
    const created = await t.repo.create(t.ctx.a, image());
    expect(await t.repo.get(t.ctx.b, created.id)).toBeNull();
    expect(await t.repo.get(t.ctx.anonB, created.id)).toBeNull();
    expect(ids((await t.repo.list(t.ctx.b, { pageSize: 200 })).items)).not.toContain(created.id);
    await expectContractError(t.repo.update(t.ctx.b, created.id, { caption: "x" }), "NOT_FOUND");
    await expectContractError(t.repo.delete(t.ctx.b, created.id), "NOT_FOUND");
    await t.repo.delete(t.ctx.a, created.id);
    expect(await t.repo.get(t.ctx.a, created.id)).toBeNull();
  });
});
