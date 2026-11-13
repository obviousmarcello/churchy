import { expect, it } from "vitest";
import {
  FUTURE,
  PAST,
  defineContractSuite,
  doc,
  expectContractError,
  expectHiddenFromTenantB,
  ids,
  uniqueSunday,
} from "../harness";

export const announcementsContract = defineContractSuite("announcements", (t) => {
  it("creates a draft, publishes it and serves it to visitors", async () => {
    const sunday = uniqueSunday();
    const created = await t.repo.upsert(t.ctx.a, {
      weekSunday: sunday,
      body: doc("Szombaton 15 órakor adventi koszorúkötés a hittanteremben."),
    });
    expect(created).toMatchObject({
      tenantId: t.env.tenantA,
      weekSunday: sunday,
      status: "draft",
      publishedAt: null,
      pdfMediaId: null,
    });

    await t.repo.publish(t.ctx.a, created.id, PAST);
    const byWeek = await t.repo.byWeek(t.ctx.anonA, sunday);
    expect(byWeek?.id).toBe(created.id);
    expect(byWeek?.status).toBe("published");
    const latest = await t.repo.latest(t.ctx.anonA);
    expect(latest).not.toBeNull();
    expect(latest!.weekSunday >= sunday).toBe(true);
    expect(ids((await t.repo.list(t.ctx.anonA, { pageSize: 200 })).items)).toContain(created.id);
  });

  it("updates in place and keeps weekSunday unique per tenant", async () => {
    const sunday = uniqueSunday();
    const created = await t.repo.upsert(t.ctx.a, { weekSunday: sunday, body: doc("Első") });
    const updated = await t.repo.upsert(t.ctx.a, {
      id: created.id,
      weekSunday: sunday,
      body: doc("Javított szöveg"),
    });
    expect(updated.id).toBe(created.id);
    expect(updated.body).toEqual(doc("Javított szöveg"));

    await expectContractError(
      t.repo.upsert(t.ctx.a, { weekSunday: sunday, body: doc("Másik") }),
      "CONFLICT",
    );
    // The same week in another tenant is fine.
    const other = await t.repo.upsert(t.ctx.b, { weekSunday: sunday, body: doc("Más egyház") });
    expect(other.tenantId).toBe(t.env.tenantB);
  });

  it("rejects invalid input", async () => {
    await expectContractError(
      t.repo.upsert(t.ctx.a, { weekSunday: "2026-11-12", body: doc("Csütörtök") }),
      "VALIDATION",
    );
    await expectContractError(t.repo.upsert(t.ctx.a, { weekSunday: uniqueSunday() }), "VALIDATION");
    await expectContractError(
      t.repo.upsert(t.ctx.a, { id: "nincs-ilyen", weekSunday: uniqueSunday(), body: doc("x") }),
      "NOT_FOUND",
    );
  });

  it("hides drafts and scheduled announcements from anonymous visitors", async () => {
    const draftWeek = uniqueSunday();
    const draft = await t.repo.upsert(t.ctx.a, { weekSunday: draftWeek, body: doc("Piszkozat") });
    const scheduledWeek = uniqueSunday();
    const scheduled = await t.repo.upsert(t.ctx.a, {
      weekSunday: scheduledWeek,
      body: doc("Időzítve"),
    });
    await t.repo.publish(t.ctx.a, scheduled.id, FUTURE);

    for (const row of [draft, scheduled]) {
      expect(await t.repo.get(t.ctx.anonA, row.id)).toBeNull();
      expect(await t.repo.byWeek(t.ctx.anonA, row.weekSunday)).toBeNull();
      expect(await t.repo.get(t.ctx.a, row.id)).not.toBeNull();
    }
    const publicIds = ids((await t.repo.list(t.ctx.anonA, { pageSize: 200 })).items);
    expect(publicIds).not.toContain(draft.id);
    expect(publicIds).not.toContain(scheduled.id);
    expect(ids((await t.repo.list(t.ctx.a, { pageSize: 200 })).items)).toContain(draft.id);

    const live = await t.repo.upsert(t.ctx.a, { weekSunday: uniqueSunday(), body: doc("Élő") });
    await t.repo.publish(t.ctx.a, live.id, PAST);
    expect(await t.repo.get(t.ctx.anonA, live.id)).not.toBeNull();
    await t.repo.unpublish(t.ctx.a, live.id);
    expect(await t.repo.get(t.ctx.anonA, live.id)).toBeNull();
  });

  it("never returns or modifies tenant A's announcements for tenant B", async () => {
    const sunday = uniqueSunday();
    const row = await t.repo.upsert(t.ctx.a, { weekSunday: sunday, body: doc("Csak A") });
    await t.repo.publish(t.ctx.a, row.id, PAST);

    await expectHiddenFromTenantB({
      id: row.id,
      getAsB: () => t.repo.get(t.ctx.b, row.id),
      listAsB: async () => (await t.repo.list(t.ctx.b, { pageSize: 200 })).items,
    });
    expect(await t.repo.byWeek(t.ctx.anonB, sunday)).toBeNull();
    expect(await t.repo.get(t.ctx.org, row.id)).toBeNull();
    await expectContractError(t.repo.publish(t.ctx.b, row.id), "NOT_FOUND");
    await expectContractError(t.repo.delete(t.ctx.b, row.id), "NOT_FOUND");
    await expectContractError(
      t.repo.upsert(t.ctx.b, { id: row.id, weekSunday: sunday, body: doc("Átírva") }),
      "NOT_FOUND",
    );
    expect((await t.repo.get(t.ctx.a, row.id))?.body).toEqual(doc("Csak A"));
  });

  it("deletes", async () => {
    const row = await t.repo.upsert(t.ctx.a, { weekSunday: uniqueSunday(), body: doc("Törlendő") });
    await t.repo.delete(t.ctx.a, row.id);
    expect(await t.repo.get(t.ctx.a, row.id)).toBeNull();
    await expectContractError(t.repo.delete(t.ctx.a, row.id), "NOT_FOUND");
  });

  it("requires a tenant context for writes", async () => {
    await expectContractError(
      t.repo.upsert(t.ctx.org, { weekSunday: uniqueSunday(), body: doc("x") }),
      "CONTEXT",
    );
    await expectContractError(
      t.repo.upsert(
        { tenantId: t.env.tenantA, orgId: t.env.orgId, actor: t.env.actorA },
        { weekSunday: uniqueSunday(), body: doc("x") },
      ),
      "CONTEXT",
    );
  });
});
