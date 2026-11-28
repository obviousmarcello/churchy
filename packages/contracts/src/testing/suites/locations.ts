import { expect, it } from "vitest";
import type { LocationInput } from "../../modules/locations";
import {
  defineContractSuite,
  expectContractError,
  expectHiddenFromTenantB,
  ids,
  uniq,
} from "../harness";

function sample(overrides: Partial<LocationInput> = {}): LocationInput {
  return {
    name: "Nagyboldogasszony-templom",
    slug: uniq("templom"),
    kind: "templom",
    address: { postalCode: "1056", city: "Budapest", line1: "Minta tér 1.", line2: null },
    sort: 0,
    ...overrides,
  };
}

export const locationsContract = defineContractSuite("locations", (t) => {
  it("creates, updates, finds by slug and orders locations", async () => {
    const chapel = await t.repo.upsert(
      t.ctx.a,
      sample({ name: "Szent Anna-kápolna", kind: "kapolna", sort: 2 }),
    );
    const church = await t.repo.upsert(t.ctx.a, sample({ sort: 1 }));
    expect(church).toMatchObject({ tenantId: t.env.tenantA, kind: "templom", sort: 1 });
    expect(church.accessibility.wheelchair).toBe(false);
    expect(church.openingHours).toEqual({ weekly: [], exceptions: [] });

    const updated = await t.repo.upsert(t.ctx.a, {
      ...sample({ slug: church.slug, sort: 1 }),
      id: church.id,
      name: "Nagyboldogasszony Főplébánia-templom",
    });
    expect(updated.id).toBe(church.id);
    expect((await t.repo.getBySlug(t.ctx.a, church.slug))?.name).toBe(
      "Nagyboldogasszony Főplébánia-templom",
    );

    const order = ids(await t.repo.list(t.ctx.a)).filter((id) =>
      [church.id, chapel.id].includes(id),
    );
    expect(order).toEqual([church.id, chapel.id]);
    await t.repo.reorder(t.ctx.a, [chapel.id, church.id]);
    const reordered = ids(await t.repo.list(t.ctx.a)).filter((id) =>
      [church.id, chapel.id].includes(id),
    );
    expect(reordered).toEqual([chapel.id, church.id]);
  });

  it("serves locations to anonymous visitors (public data)", async () => {
    const church = await t.repo.upsert(t.ctx.a, sample());
    expect(ids(await t.repo.list(t.ctx.anonA))).toContain(church.id);
    expect((await t.repo.getBySlug(t.ctx.anonA, church.slug))?.id).toBe(church.id);
  });

  it("rejects invalid input and duplicate slugs", async () => {
    await expectContractError(
      t.repo.upsert(t.ctx.a, sample({ slug: "Nem Jó Slug" })),
      "VALIDATION",
    );
    await expectContractError(
      t.repo.upsert(t.ctx.a, { ...sample(), kind: "katedralis" as never }),
      "VALIDATION",
    );
    await expectContractError(
      t.repo.upsert(t.ctx.a, sample({ address: { postalCode: "10", city: "X", line1: "Y" } })),
      "VALIDATION",
    );
    const first = await t.repo.upsert(t.ctx.a, sample());
    await expectContractError(t.repo.upsert(t.ctx.a, sample({ slug: first.slug })), "CONFLICT");
    await expectContractError(
      t.repo.upsert(t.ctx.a, { ...sample(), id: "nincs-ilyen" }),
      "NOT_FOUND",
    );
    // Same slug in another tenant is allowed.
    const other = await t.repo.upsert(t.ctx.b, sample({ slug: first.slug }));
    expect(other.tenantId).toBe(t.env.tenantB);
  });

  it("never returns or modifies tenant A's locations for tenant B", async () => {
    const church = await t.repo.upsert(t.ctx.a, sample());
    await expectHiddenFromTenantB({
      id: church.id,
      getAsB: () => t.repo.get(t.ctx.b, church.id),
      listAsB: () => t.repo.list(t.ctx.anonB),
    });
    expect(await t.repo.getBySlug(t.ctx.b, church.slug)).toBeNull();
    expect(await t.repo.list(t.ctx.org)).toEqual([]);
    await expectContractError(t.repo.delete(t.ctx.b, church.id), "NOT_FOUND");
    await expectContractError(t.repo.upsert(t.ctx.b, { ...sample(), id: church.id }), "NOT_FOUND");
    await expectContractError(t.repo.reorder(t.ctx.b, [church.id]), "NOT_FOUND");
    expect((await t.repo.get(t.ctx.a, church.id))?.name).toBe(church.name);
  });

  it("deletes", async () => {
    const church = await t.repo.upsert(t.ctx.a, sample());
    await t.repo.delete(t.ctx.a, church.id);
    expect(await t.repo.get(t.ctx.a, church.id)).toBeNull();
    await expectContractError(t.repo.delete(t.ctx.a, church.id), "NOT_FOUND");
  });
});
