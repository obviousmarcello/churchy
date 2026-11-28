import { expect, it } from "vitest";
import { defineContractSuite, expectContractError, uniq } from "../harness";

const email = () => `${uniq("tag")}@example.test`;

export const membersContract = defineContractSuite("members", (t) => {
  it("invites members with website and workspace roles", async () => {
    const invited = await t.repo.invite(t.ctx.a, {
      email: email(),
      name: "Minta Mária",
      role: "editor",
      wsRoles: ["employee"],
    });
    expect(invited).toMatchObject({ tenantId: t.env.tenantA, role: "editor", active: true });
    expect(invited.wsRoles).toEqual(["employee"]);
    const volunteer = await t.repo.invite(t.ctx.a, {
      email: email(),
      name: "Próba Péter",
      wsRoles: ["volunteer"],
      teamIds: [],
    });
    expect(volunteer.role).toBeNull();
    const updated = await t.repo.update(t.ctx.a, volunteer.userId, { wsRoles: ["teamLeader"] });
    expect(updated.wsRoles).toEqual(["teamLeader"]);
    expect((await t.repo.list(t.ctx.a)).map((m) => m.userId)).toContain(invited.userId);
  });

  it("rejects invalid invitations and duplicates", async () => {
    await expectContractError(
      t.repo.invite(t.ctx.a, { email: "nem-email", name: "X", role: "editor" }),
      "VALIDATION",
    );
    await expectContractError(
      t.repo.invite(t.ctx.a, { email: email(), name: "Szerep nélkül" }),
      "VALIDATION",
    );
    const address = email();
    await t.repo.invite(t.ctx.a, { email: address, name: "Kettő", role: "office" });
    await expectContractError(
      t.repo.invite(t.ctx.a, { email: address, name: "Kettő", role: "office" }),
      "CONFLICT",
    );
  });

  it("keeps at least one active owner", async () => {
    const tenant = await t.need("tenants").create(t.ctx.platform, {
      slug: uniq("tulaj"),
      name: "Tulajdonos Teszt Gyülekezet",
      denomination: "bapt",
    });
    const ctx = { tenantId: tenant.id, actor: t.env.platformActor };
    const first = await t.repo.invite(ctx, { email: email(), name: "Első Tulaj", role: "owner" });
    await expectContractError(t.repo.update(ctx, first.userId, { role: "admin" }), "CONFLICT");
    const second = await t.repo.invite(ctx, {
      email: email(),
      name: "Második Tulaj",
      role: "owner",
    });
    await t.repo.update(ctx, first.userId, { role: "admin" });
    await expectContractError(t.repo.update(ctx, second.userId, { active: false }), "CONFLICT");
  });

  it("never returns or modifies tenant A's members for tenant B", async () => {
    const member = await t.repo.invite(t.ctx.a, { email: email(), name: "Csak A", role: "editor" });
    expect((await t.repo.list(t.ctx.b)).map((m) => m.userId)).not.toContain(member.userId);
    expect(await t.repo.get(t.ctx.b, member.userId)).toBeNull();
    expect(await t.repo.list(t.ctx.anonA)).toEqual([]);
    await expectContractError(
      t.repo.update(t.ctx.b, member.userId, { role: "admin" }),
      "NOT_FOUND",
    );
    expect((await t.repo.get(t.ctx.a, member.userId))?.role).toBe("editor");
  });

  it("lists only the actor's own memberships", async () => {
    const own = await t.repo.listOwnMemberships(t.ctx.a);
    expect(own.every((m) => m.userId === t.env.actorA.userId)).toBe(true);
    expect(own.map((m) => m.tenantId)).toContain(t.env.tenantA);
    expect(await t.repo.listOwnMemberships(t.ctx.anonA)).toEqual([]);
  });
});
