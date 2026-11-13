import { expect, it } from "vitest";
import type { PersonInput } from "../../modules/people";
import { defineContractSuite, expectContractError, ids } from "../harness";

const person = (overrides: Partial<PersonInput> = {}): PersonInput => ({
  prefix: "dr.",
  familyName: "Kovács",
  givenName: "Péter",
  roleTitle: "plébános",
  staffGroup: "clergy",
  isPublic: true,
  email: "pelda.plebanos@example.test",
  phone: "+36 30 123 4567",
  contactVisibility: { email: "public", phone: "workspace" },
  skills: ["orgona"],
  ...overrides,
});

export const peopleContract = defineContractSuite("people", (t) => {
  it("creates people and finds them in the directory (accent-insensitive)", async () => {
    const created = await t.repo.upsert(t.ctx.a, person());
    expect(created).toMatchObject({
      tenantId: t.env.tenantA,
      active: true,
      isMinor: false,
      userId: null,
    });
    expect(ids(await t.repo.list(t.ctx.a, { query: "kovacs" }))).toContain(created.id);
    expect(ids(await t.repo.list(t.ctx.a, { skill: "orgona" }))).toContain(created.id);
    expect(ids(await t.repo.list(t.ctx.a, { staffGroup: "volunteer" }))).not.toContain(created.id);
    const updated = await t.repo.upsert(t.ctx.a, {
      ...person(),
      id: created.id,
      roleTitle: "káplán",
    });
    expect(updated).toMatchObject({ id: created.id, roleTitle: "káplán" });
  });

  it("exposes only public, active staff with public contact fields to visitors", async () => {
    const shown = await t.repo.upsert(t.ctx.a, person());
    const hidden = await t.repo.upsert(t.ctx.a, person({ familyName: "Rejtett", isPublic: false }));
    const inactive = await t.repo.upsert(t.ctx.a, person({ familyName: "Volt", active: false }));
    const staff = await t.repo.listPublicStaff(t.ctx.anonA);
    const entry = staff.find((p) => p.id === shown.id);
    expect(entry?.email).toBe("pelda.plebanos@example.test");
    expect(entry?.phone).toBeNull();
    expect(Object.keys(entry ?? {})).not.toContain("skills");
    expect(ids(staff)).not.toContain(hidden.id);
    expect(ids(staff)).not.toContain(inactive.id);
    expect(await t.repo.list(t.ctx.anonA)).toEqual([]);
    expect(await t.repo.get(t.ctx.anonA, shown.id)).toBeNull();
  });

  it("rejects invalid input", async () => {
    await expectContractError(t.repo.upsert(t.ctx.a, person({ email: "nem-email" })), "VALIDATION");
    await expectContractError(t.repo.upsert(t.ctx.a, person({ familyName: "" })), "VALIDATION");
    await expectContractError(
      t.repo.upsert(
        t.ctx.a,
        person({ contactVisibility: { email: "mindenki" as never, phone: "public" } }),
      ),
      "VALIDATION",
    );
    const p = await t.repo.upsert(t.ctx.a, person());
    await expectContractError(
      t.repo.addAvailability(t.ctx.a, {
        personId: p.id,
        from: "2026-12-01T10:00:00+01:00",
        to: "2026-12-01T09:00:00+01:00",
      }),
      "VALIDATION",
    );
  });

  it("manages availability blocks", async () => {
    const p = await t.repo.upsert(t.ctx.a, person({ isPublic: false, staffGroup: "volunteer" }));
    const block = await t.repo.addAvailability(t.ctx.a, {
      personId: p.id,
      from: "2026-12-24T00:00:00+01:00",
      to: "2026-12-27T00:00:00+01:00",
      note: "Családi program",
    });
    const range = { from: "2026-12-25T00:00:00+01:00", to: "2026-12-25T23:00:00+01:00" };
    expect(ids(await t.repo.listAvailability(t.ctx.a, { ...range, personIds: [p.id] }))).toEqual([
      block.id,
    ]);
    expect(await t.repo.listAvailability(t.ctx.anonA, range)).toEqual([]);
    await t.repo.removeAvailability(t.ctx.a, block.id);
    expect(await t.repo.listAvailability(t.ctx.a, { ...range, personIds: [p.id] })).toEqual([]);
  });

  it("never returns, modifies or references tenant A's people from tenant B", async () => {
    const p = await t.repo.upsert(t.ctx.a, person());
    expect(await t.repo.get(t.ctx.b, p.id)).toBeNull();
    expect(ids(await t.repo.list(t.ctx.b))).not.toContain(p.id);
    expect(ids(await t.repo.listPublicStaff(t.ctx.anonB))).not.toContain(p.id);
    expect(await t.repo.list(t.ctx.org)).toEqual([]);
    await expectContractError(t.repo.upsert(t.ctx.b, { ...person(), id: p.id }), "NOT_FOUND");
    await expectContractError(t.repo.delete(t.ctx.b, p.id), "NOT_FOUND");
    await expectContractError(
      t.repo.addAvailability(t.ctx.b, {
        personId: p.id,
        from: "2026-12-01T09:00:00+01:00",
        to: "2026-12-01T10:00:00+01:00",
      }),
      "NOT_FOUND",
    );
    await t.repo.delete(t.ctx.a, p.id);
    expect(await t.repo.get(t.ctx.a, p.id)).toBeNull();
  });
});
