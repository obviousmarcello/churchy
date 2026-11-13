import { expect, it } from "vitest";
import type { Ctx } from "../../ctx";
import type { EventInput, EventRepo, EventVisibility } from "../../modules/events";
import { defineContractSuite, expectContractError, ids, uniq } from "../harness";

const WINDOW = { from: "2031-03-01T00:00:00+01:00", to: "2031-03-31T23:59:59+02:00" };

async function calendar(repo: EventRepo, ctx: Ctx) {
  return repo.upsertCalendar(ctx, { name: "Közös naptár", color: "#7a1f2b", kind: "shared" });
}

function event(
  calendarId: string,
  visibility: EventVisibility,
  overrides: Partial<EventInput> = {},
): EventInput {
  return {
    calendarId,
    visibility,
    slug: uniq("esemeny"),
    title: "Ifjúsági est",
    startsAt: "2031-03-14T19:00:00+01:00",
    endsAt: "2031-03-14T21:00:00+01:00",
    category: "ifjusag",
    ...overrides,
  };
}

export const eventsContract = defineContractSuite("events", (t) => {
  it("creates events and calendars; publishing makes public events visible", async () => {
    const cal = await calendar(t.repo, t.ctx.a);
    expect(cal).toMatchObject({ defaultVisibility: "staff", ownerPersonId: null });
    const created = await t.repo.upsert(t.ctx.a, event(cal.id, "public"));
    expect(created).toMatchObject({ status: "draft", allDay: false, rrule: null, exdates: [] });
    expect(await t.repo.getPublicBySlug(t.ctx.anonA, created.slug)).toBeNull();
    await t.repo.setStatus(t.ctx.a, created.id, "published");
    expect((await t.repo.getPublicBySlug(t.ctx.anonA, created.slug))?.id).toBe(created.id);
    expect(ids(await t.repo.listPublic(t.ctx.anonA, WINDOW))).toContain(created.id);
    expect(ids(await t.repo.listPublic(t.ctx.anonA, { ...WINDOW, category: "mas" }))).not.toContain(
      created.id,
    );

    const recurring = await t.repo.upsert(
      t.ctx.a,
      event(cal.id, "public", {
        startsAt: "2030-01-04T18:00:00+01:00",
        endsAt: "2030-01-04T19:00:00+01:00",
        rrule: "FREQ=MONTHLY;BYDAY=1FR",
        exdates: ["2031-03-07"],
      }),
    );
    await t.repo.setStatus(t.ctx.a, recurring.id, "published");
    expect(ids(await t.repo.list(t.ctx.a, WINDOW))).toContain(recurring.id);
  });

  it("never shows private, team or staff events to anonymous visitors", async () => {
    const cal = await calendar(t.repo, t.ctx.a);
    for (const visibility of ["private", "team", "staff"] as const) {
      const hidden = await t.repo.upsert(t.ctx.a, event(cal.id, visibility));
      await t.repo.setStatus(t.ctx.a, hidden.id, "published");
      expect(ids(await t.repo.listPublic(t.ctx.anonA, WINDOW))).not.toContain(hidden.id);
      expect(ids(await t.repo.list(t.ctx.anonA, WINDOW))).not.toContain(hidden.id);
      expect(await t.repo.getPublicBySlug(t.ctx.anonA, hidden.slug)).toBeNull();
      expect(await t.repo.getPublicBySlug(t.ctx.a, hidden.slug)).toBeNull();
      expect(await t.repo.get(t.ctx.anonA, hidden.id)).toBeNull();
      expect((await t.repo.get(t.ctx.a, hidden.id))?.visibility).toBe(visibility);
    }
    expect(await t.repo.listCalendars(t.ctx.anonA)).toEqual([]);
  });

  it("rejects invalid input", async () => {
    const cal = await calendar(t.repo, t.ctx.a);
    await expectContractError(
      t.repo.upsert(t.ctx.a, event(cal.id, "public", { endsAt: "2031-03-14T18:00:00+01:00" })),
      "VALIDATION",
    );
    await expectContractError(
      t.repo.upsert(t.ctx.a, event(cal.id, "public", { rrule: "minden kedden" })),
      "VALIDATION",
    );
    await expectContractError(
      t.repo.upsert(t.ctx.a, event(cal.id, "nyilvanos" as never)),
      "VALIDATION",
    );
    await expectContractError(
      t.repo.upsertCalendar(t.ctx.a, { name: "X", color: "red", kind: "shared" }),
      "VALIDATION",
    );
    const first = await t.repo.upsert(t.ctx.a, event(cal.id, "public"));
    await expectContractError(
      t.repo.upsert(t.ctx.a, event(cal.id, "public", { slug: first.slug })),
      "CONFLICT",
    );
    await expectContractError(t.repo.deleteCalendar(t.ctx.a, cal.id), "CONFLICT");
  });

  it("never returns, modifies or references tenant A's events from tenant B", async () => {
    const cal = await calendar(t.repo, t.ctx.a);
    const created = await t.repo.upsert(t.ctx.a, event(cal.id, "public"));
    await t.repo.setStatus(t.ctx.a, created.id, "published");
    expect(ids(await t.repo.listPublic(t.ctx.anonB, WINDOW))).not.toContain(created.id);
    expect(ids(await t.repo.list(t.ctx.b, WINDOW))).not.toContain(created.id);
    expect(await t.repo.get(t.ctx.b, created.id)).toBeNull();
    expect(ids(await t.repo.listCalendars(t.ctx.b))).not.toContain(cal.id);
    expect(await t.repo.list(t.ctx.org, WINDOW)).toEqual([]);
    const calB = await calendar(t.repo, t.ctx.b);
    await expectContractError(t.repo.upsert(t.ctx.b, event(cal.id, "public")), "NOT_FOUND");
    await expectContractError(
      t.repo.upsert(t.ctx.b, { ...event(calB.id, "public"), id: created.id }),
      "NOT_FOUND",
    );
    await expectContractError(t.repo.setStatus(t.ctx.b, created.id, "cancelled"), "NOT_FOUND");
    await expectContractError(t.repo.delete(t.ctx.b, created.id), "NOT_FOUND");
    await t.repo.delete(t.ctx.a, created.id);
    expect(await t.repo.get(t.ctx.a, created.id)).toBeNull();
  });
});
