import { expect, it } from "vitest";
import type { Ctx } from "../../ctx";
import type { AttachmentInput } from "../../modules/attachments";
import type { SongRepo } from "../../modules/songs";
import { defineContractSuite, expectContractError, ids, uniq } from "../harness";

async function song(songs: SongRepo, ctx: Ctx) {
  return songs.upsert(ctx, { title: "Te vagy a fény" });
}

export const attachmentsContract = defineContractSuite("attachments", (t) => {
  const input = (ownerId: string, overrides: Partial<AttachmentInput> = {}): AttachmentInput => ({
    ownerType: "song",
    ownerId,
    kind: "chord_chart",
    label: "Akkordok",
    url: "https://example.test/akkordok.pdf",
    rightsConfirmed: true,
    rightsConfirmedBy: t.env.actorA.personId,
    ...overrides,
  });

  it("versions attachments by label", async () => {
    const s = await song(t.need("songs"), t.ctx.a);
    const v1 = await t.repo.create(t.ctx.a, input(s.id));
    expect(v1).toMatchObject({ version: 1, supersedesId: null, disabled: false, mediaId: null });
    const v2 = await t.repo.create(
      t.ctx.a,
      input(s.id, { url: "https://example.test/akkordok-v2.pdf" }),
    );
    expect(v2).toMatchObject({ version: 2, supersedesId: v1.id });
    const owner = { ownerType: "song" as const, ownerId: s.id };
    expect(ids(await t.repo.listByOwner(t.ctx.a, owner))).toEqual([v2.id]);
    expect(ids(await t.repo.listByOwner(t.ctx.a, owner, { history: true })).sort()).toEqual(
      [v1.id, v2.id].sort(),
    );
    await t.repo.delete(t.ctx.a, v1.id);
    expect(await t.repo.get(t.ctx.a, v1.id)).toBeNull();
  });

  it("supports takedown by content hash", async () => {
    const s = await song(t.need("songs"), t.ctx.a);
    const hash = uniq("sha256");
    const a = await t.repo.create(t.ctx.a, input(s.id, { label: "Kotta", contentHash: hash }));
    expect(await t.repo.disableByHash(t.ctx.a, hash)).toBe(1);
    expect(
      ids(await t.repo.listByOwner(t.ctx.a, { ownerType: "song", ownerId: s.id })),
    ).not.toContain(a.id);
    expect((await t.repo.get(t.ctx.a, a.id))?.disabled).toBe(true);
  });

  it("requires rights confirmation and exactly one source", async () => {
    const s = await song(t.need("songs"), t.ctx.a);
    await expectContractError(
      t.repo.create(t.ctx.a, input(s.id, { rightsConfirmed: false as never })),
      "VALIDATION",
    );
    await expectContractError(t.repo.create(t.ctx.a, input(s.id, { url: null })), "VALIDATION");
    await expectContractError(
      t.repo.create(t.ctx.a, input(s.id, { mediaId: "media-1" })),
      "VALIDATION",
    );
    await expectContractError(t.repo.create(t.ctx.a, input("nincs-ilyen")), "NOT_FOUND");
  });

  it("never returns or attaches across tenants and never to anonymous visitors", async () => {
    const s = await song(t.need("songs"), t.ctx.a);
    const a = await t.repo.create(t.ctx.a, input(s.id));
    expect(await t.repo.get(t.ctx.anonA, a.id)).toBeNull();
    expect(await t.repo.get(t.ctx.b, a.id)).toBeNull();
    expect(await t.repo.listByOwner(t.ctx.b, { ownerType: "song", ownerId: s.id })).toEqual([]);
    expect(await t.repo.listByOwner(t.ctx.anonA, { ownerType: "song", ownerId: s.id })).toEqual([]);
    await expectContractError(
      t.repo.create(t.ctx.b, input(s.id, { rightsConfirmedBy: t.env.actorB.personId })),
      "NOT_FOUND",
    );
    await expectContractError(t.repo.delete(t.ctx.b, a.id), "NOT_FOUND");
  });
});
