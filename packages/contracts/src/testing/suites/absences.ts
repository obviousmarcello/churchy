import { expect, it } from "vitest";
import { WorkdayCalendarEntrySchema } from "../../modules/absences";
import { defineContractSuite, expectContractError, ids } from "../harness";
import { activeLink } from "./organizations";

const RANGE = { from: "2032-12-01", to: "2032-12-31" };

export const absencesContract = defineContractSuite("absences", (t) => {
  const person = (ctx = t.ctx.a) =>
    t
      .need("people")
      .upsert(ctx, { familyName: "Nagy", givenName: "Erzsébet", staffGroup: "staff" });
  const absence = (personId: string) => ({
    personId,
    startDate: "2032-12-20",
    endDate: "2032-12-23",
    type: "rendes_szabadsag",
    workingDays: 3.5,
    halfDayEnd: true,
  });

  it("creates absences and changes their status", async () => {
    const p = await person();
    const created = await t.repo.create(t.ctx.a, absence(p.id));
    expect(created).toMatchObject({ status: "requested", ticketId: null, halfDayStart: false });
    const approved = await t.repo.setStatus(t.ctx.a, created.id, "approved");
    expect(approved.status).toBe("approved");
    expect(
      ids(await t.repo.list(t.ctx.a, { ...RANGE, personIds: [p.id], statuses: ["approved"] })),
    ).toEqual([created.id]);
    expect(
      await t.repo.list(t.ctx.a, { from: "2033-01-01", to: "2033-01-31", personIds: [p.id] }),
    ).toEqual([]);
  });

  it("stores staff profiles and leave entitlements", async () => {
    const p = await person();
    const profile = await t.repo.upsertStaffProfile(t.ctx.a, {
      personId: p.id,
      position: "sekrestyés",
      employmentType: "munkaviszony",
      startDate: "2020-03-01",
      weeklyHours: 40,
      workPattern: { weekdays: [2, 3, 4, 5, 6, 7] },
    });
    expect(profile).toMatchObject({ employer: "parish", endDate: null, managerPersonId: null });
    expect((await t.repo.getStaffProfile(t.ctx.a, p.id))?.workPattern.weekdays).toEqual([
      2, 3, 4, 5, 6, 7,
    ]);
    const ent = await t.repo.upsertEntitlement(t.ctx.a, {
      personId: p.id,
      year: 2032,
      daysTotal: 25,
    });
    expect(ent).toMatchObject({ carriedOver: 0, adjustments: [] });
    expect((await t.repo.getEntitlement(t.ctx.a, p.id, 2032))?.daysTotal).toBe(25);
    const calendar = await t.repo.listWorkdayCalendar(t.ctx.a, 2026);
    for (const entry of calendar)
      expect(WorkdayCalendarEntrySchema.safeParse(entry).success).toBe(true);
  });

  it("rejects invalid input", async () => {
    const p = await person();
    await expectContractError(
      t.repo.create(t.ctx.a, { ...absence(p.id), endDate: "2032-12-19" }),
      "VALIDATION",
    );
    await expectContractError(
      t.repo.create(t.ctx.a, { ...absence(p.id), workingDays: 0.3 }),
      "VALIDATION",
    );
    await expectContractError(
      t.repo.upsertStaffProfile(t.ctx.a, {
        personId: p.id,
        position: "x",
        employmentType: "alkalmi" as never,
        startDate: "2020-01-01",
        weeklyHours: 10,
      }),
      "VALIDATION",
    );
    await expectContractError(t.repo.create(t.ctx.a, absence("nincs-ilyen")), "NOT_FOUND");
  });

  it("never returns or modifies tenant A's absences for tenant B or visitors", async () => {
    const p = await person();
    const created = await t.repo.create(t.ctx.a, absence(p.id));
    expect(await t.repo.get(t.ctx.b, created.id)).toBeNull();
    expect(ids(await t.repo.list(t.ctx.b, RANGE))).not.toContain(created.id);
    expect(await t.repo.list(t.ctx.anonA, RANGE)).toEqual([]);
    expect(await t.repo.getStaffProfile(t.ctx.b, p.id)).toBeNull();
    await expectContractError(t.repo.setStatus(t.ctx.b, created.id, "approved"), "NOT_FOUND");
    await expectContractError(t.repo.create(t.ctx.b, absence(p.id)), "NOT_FOUND");
  });

  it("lets a diocese read absences of actively linked parishes only (read-only)", async () => {
    const p = await person();
    const created = await t.repo.create(t.ctx.a, absence(p.id));
    const orgs = t.need("organizations");
    for (const l of await orgs.listLinks(t.ctx.a)) {
      if (l.orgId === t.env.orgId && l.status !== "revoked") await orgs.revokeLink(t.ctx.a, l.id);
    }
    expect(ids(await t.repo.list(t.ctx.org, RANGE))).not.toContain(created.id);
    const link = await activeLink(orgs, t.ctx.org, t.ctx.a, t.env.tenantA);
    expect(ids(await t.repo.list(t.ctx.org, RANGE))).toContain(created.id);
    await expectContractError(t.repo.create(t.ctx.org, absence(p.id)), "CONTEXT");
    await orgs.revokeLink(t.ctx.a, link.id);
    expect(ids(await t.repo.list(t.ctx.org, RANGE))).not.toContain(created.id);
  });
});
