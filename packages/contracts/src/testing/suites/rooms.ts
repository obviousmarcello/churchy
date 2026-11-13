import { expect, it } from "vitest";
import type { Ctx } from "../../ctx";
import type { LocationRepo } from "../../modules/locations";
import { defineContractSuite, expectContractError, ids, uniq } from "../harness";

export async function locationFor(locations: LocationRepo, ctx: Ctx) {
  return locations.upsert(ctx, { name: "Plébániaház", slug: uniq("haz"), kind: "egyeb" });
}

export const roomsContract = defineContractSuite("rooms", (t) => {
  it("manages rooms with approval policy defaults", async () => {
    const loc = await locationFor(t.need("locations"), t.ctx.a);
    const room = await t.repo.upsert(t.ctx.a, {
      locationId: loc.id,
      name: "Kórusterem",
      capacity: 40,
      features: ["zongora", "projektor"],
    });
    expect(room).toMatchObject({ kind: "room", active: true, managerPersonIds: [] });
    expect(room.approvalPolicy).toEqual({
      autoApprove: { roles: [], teamIds: [] },
      approvers: "room_managers",
      holdHours: 48,
    });
    expect(ids(await t.repo.list(t.ctx.a, { locationId: loc.id }))).toEqual([room.id]);
    await t.repo.upsert(t.ctx.a, { ...room, active: false });
    expect(ids(await t.repo.list(t.ctx.a, { locationId: loc.id, activeOnly: true }))).toEqual([]);

    const block = await t.repo.upsertServiceBlock(t.ctx.a, {
      locationId: loc.id,
      serviceType: "szentmise",
      roomIds: [room.id],
      bufferBeforeMin: 30,
      bufferAfterMin: 15,
    });
    expect(ids(await t.repo.listServiceBlocks(t.ctx.a))).toContain(block.id);
    await t.repo.deleteServiceBlock(t.ctx.a, block.id);
    expect(ids(await t.repo.listServiceBlocks(t.ctx.a))).not.toContain(block.id);
  });

  it("rejects invalid input", async () => {
    const loc = await locationFor(t.need("locations"), t.ctx.a);
    await expectContractError(
      t.repo.upsert(t.ctx.a, { locationId: loc.id, name: "X", capacity: -1 }),
      "VALIDATION",
    );
    await expectContractError(
      t.repo.upsert(t.ctx.a, {
        locationId: loc.id,
        name: "X",
        approvalPolicy: { autoApprove: {}, approvers: "room_managers", holdHours: 0 },
      }),
      "VALIDATION",
    );
    await expectContractError(
      t.repo.upsertServiceBlock(t.ctx.a, {
        locationId: loc.id,
        serviceType: "szentmise",
        roomIds: [],
      }),
      "VALIDATION",
    );
  });

  it("never returns, modifies or references tenant A's rooms from tenant B", async () => {
    const loc = await locationFor(t.need("locations"), t.ctx.a);
    const room = await t.repo.upsert(t.ctx.a, { locationId: loc.id, name: "Hittanterem" });
    expect(await t.repo.get(t.ctx.b, room.id)).toBeNull();
    expect(ids(await t.repo.list(t.ctx.b))).not.toContain(room.id);
    expect(await t.repo.list(t.ctx.anonA)).toEqual([]);
    await expectContractError(
      t.repo.upsert(t.ctx.b, { locationId: loc.id, name: "Idegen" }),
      "NOT_FOUND",
    );
    const locB = await locationFor(t.need("locations"), t.ctx.b);
    await expectContractError(
      t.repo.upsertServiceBlock(t.ctx.b, {
        locationId: locB.id,
        serviceType: "istentisztelet",
        roomIds: [room.id],
      }),
      "NOT_FOUND",
    );
    await expectContractError(t.repo.delete(t.ctx.b, room.id), "NOT_FOUND");
    await t.repo.delete(t.ctx.a, room.id);
    expect(await t.repo.get(t.ctx.a, room.id)).toBeNull();
  });
});
