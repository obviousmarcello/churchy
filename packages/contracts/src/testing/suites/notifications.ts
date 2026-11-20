import { expect, it } from "vitest";
import { defineContractSuite, expectContractError, ids } from "../harness";

export const notificationsContract = defineContractSuite("notifications", (t) => {
  const note = (userId: string) => ({
    userId,
    kind: "planReview" as const,
    link: "/munkater/szolgalatok/terv-1",
    payload: { reference: "vasárnap 10:00" },
  });

  it("creates notifications for a user and marks them read", async () => {
    const before = await t.repo.unreadCount(t.ctx.a);
    const created = await t.repo.create(t.ctx.a, note(t.env.actorA.userId));
    expect(created).toMatchObject({ tenantId: t.env.tenantA, readAt: null });
    expect(await t.repo.unreadCount(t.ctx.a)).toBe(before + 1);
    expect(ids(await t.repo.list(t.ctx.a, { unreadOnly: true }))).toContain(created.id);
    await t.repo.markRead(t.ctx.a, created.id);
    expect(ids(await t.repo.list(t.ctx.a, { unreadOnly: true }))).not.toContain(created.id);
    await t.repo.create(t.ctx.a, note(t.env.actorA.userId));
    expect(await t.repo.markAllRead(t.ctx.a)).toBeGreaterThanOrEqual(1);
    expect(await t.repo.unreadCount(t.ctx.a)).toBe(0);
  });

  it("stores preferences per kind", async () => {
    const pref = await t.repo.setPref(t.ctx.a, {
      kind: "assignmentRequest",
      channels: ["push", "email"],
      digest: false,
    });
    expect(pref.userId).toBe(t.env.actorA.userId);
    expect(
      (await t.repo.getPrefs(t.ctx.a)).find((p) => p.kind === "assignmentRequest")?.channels,
    ).toEqual(["push", "email"]);
  });

  it("rejects payloads with free text and bad links", async () => {
    await expectContractError(
      t.repo.create(t.ctx.a, { ...note(t.env.actorA.userId), payload: { body: "x".repeat(500) } }),
      "VALIDATION",
    );
    await expectContractError(
      t.repo.create(t.ctx.a, { ...note(t.env.actorA.userId), link: "https://example.test" }),
      "VALIDATION",
    );
    await expectContractError(
      t.repo.create(t.ctx.a, { ...note(t.env.actorA.userId), kind: "spam" as never }),
      "VALIDATION",
    );
  });

  it("scopes notifications to the tenant and to the actor", async () => {
    const own = await t.repo.create(t.ctx.a, note(t.env.actorA.userId));
    const someoneElse = await t.repo.create(t.ctx.a, note(t.env.actorB.userId));
    expect(ids(await t.repo.list(t.ctx.a))).not.toContain(someoneElse.id);
    await expectContractError(t.repo.markRead(t.ctx.a, someoneElse.id), "NOT_FOUND");
    expect(ids(await t.repo.list(t.ctx.b))).not.toContain(own.id);
    expect(ids(await t.repo.list(t.ctx.b))).not.toContain(someoneElse.id);
    const actorAInTenantB = { tenantId: t.env.tenantB, actor: t.env.actorA };
    expect(ids(await t.repo.list(actorAInTenantB))).not.toContain(own.id);
    await expectContractError(t.repo.markRead(t.ctx.b, own.id), "NOT_FOUND");
    expect(await t.repo.list(t.ctx.anonA)).toEqual([]);
    expect(await t.repo.unreadCount(t.ctx.anonA)).toBe(0);
  });
});
