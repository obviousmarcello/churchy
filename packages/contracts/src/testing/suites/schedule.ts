import { expect, it } from "vitest";
import type { Ctx } from "../../ctx";
import type { Repositories } from "../../registry";
import { defineContractSuite, expectContractError, ids, uniq } from "../harness";

async function location(repos: { locations: Repositories["locations"] }, ctx: Ctx) {
  return repos.locations.upsert(ctx, {
    name: "Szent Anna-kápolna",
    slug: uniq("kapolna"),
    kind: "kapolna",
  });
}

export const scheduleContract = defineContractSuite("schedule", (t) => {
  const locations = () => ({ locations: t.need("locations") });

  it("stores periods, rules and exceptions and serves them publicly", async () => {
    const loc = await location(locations(), t.ctx.a);
    const period = await t.repo.upsertPeriod(t.ctx.a, { name: "Általános", priority: 0 });
    expect(period).toMatchObject({ yearly: false, validFrom: null, validTo: null });
    const summer = await t.repo.upsertPeriod(t.ctx.a, {
      name: "Nyári miserend",
      validFrom: "2026-07-01",
      validTo: "2026-08-31",
      yearly: true,
      priority: 10,
    });
    const rule = await t.repo.upsertRule(t.ctx.a, {
      periodId: period.id,
      locationId: loc.id,
      weekday: 7,
      time: "10:00",
      serviceType: "szentmise",
    });
    expect(rule).toMatchObject({
      nthWeek: null,
      durationMin: 60,
      language: "hu",
      livestream: false,
    });
    const firstFriday = await t.repo.upsertRule(t.ctx.a, {
      periodId: summer.id,
      locationId: loc.id,
      weekday: 5,
      nthWeek: 1,
      time: "18:00",
      serviceType: "szentmise",
    });
    const exception = await t.repo.upsertException(t.ctx.a, {
      date: "2026-11-15",
      kind: "modify",
      ruleId: rule.id,
      locationId: loc.id,
      time: "08:30",
      reason: "Búcsú",
    });

    const data = await t.repo.getScheduleData(t.ctx.anonA);
    expect(ids(data.periods)).toEqual(expect.arrayContaining([period.id, summer.id]));
    expect(ids(data.rules)).toEqual(expect.arrayContaining([rule.id, firstFriday.id]));
    expect(ids(data.exceptions)).toContain(exception.id);
    const inRange = await t.repo.listExceptions(t.ctx.anonA, {
      from: "2026-11-09",
      to: "2026-11-15",
    });
    expect(ids(inRange)).toContain(exception.id);
    const outOfRange = await t.repo.listExceptions(t.ctx.a, {
      from: "2026-11-16",
      to: "2026-11-22",
    });
    expect(ids(outOfRange)).not.toContain(exception.id);
  });

  it("replaces the rules of a period/location atomically and cascades period deletes", async () => {
    const loc = await location(locations(), t.ctx.a);
    const period = await t.repo.upsertPeriod(t.ctx.a, { name: uniq("idoszak") });
    const old = await t.repo.upsertRule(t.ctx.a, {
      periodId: period.id,
      locationId: loc.id,
      weekday: 1,
      time: "07:00",
      serviceType: "szentmise",
    });
    const replaced = await t.repo.replaceRules(t.ctx.a, period.id, loc.id, [
      { weekday: 2, time: "07:00", serviceType: "szentmise" },
      { weekday: 7, time: "09:00", serviceType: "szentmise", language: "la" },
    ]);
    expect(replaced).toHaveLength(2);
    let rules = (await t.repo.getScheduleData(t.ctx.a)).rules.filter(
      (r) => r.periodId === period.id,
    );
    expect(ids(rules)).not.toContain(old.id);
    expect(rules).toHaveLength(2);
    await t.repo.deletePeriod(t.ctx.a, period.id);
    rules = (await t.repo.getScheduleData(t.ctx.a)).rules.filter((r) => r.periodId === period.id);
    expect(rules).toEqual([]);
  });

  it("rejects invalid input", async () => {
    const loc = await location(locations(), t.ctx.a);
    const period = await t.repo.upsertPeriod(t.ctx.a, { name: "Általános" });
    const base = {
      periodId: period.id,
      locationId: loc.id,
      weekday: 7,
      time: "10:00",
      serviceType: "szentmise",
    };
    await expectContractError(t.repo.upsertRule(t.ctx.a, { ...base, weekday: 8 }), "VALIDATION");
    await expectContractError(t.repo.upsertRule(t.ctx.a, { ...base, time: "25:00" }), "VALIDATION");
    await expectContractError(
      t.repo.upsertRule(t.ctx.a, { ...base, nthWeek: 6 as never }),
      "VALIDATION",
    );
    await expectContractError(
      t.repo.upsertPeriod(t.ctx.a, {
        name: "Fordított",
        validFrom: "2026-09-01",
        validTo: "2026-06-01",
      }),
      "VALIDATION",
    );
    await expectContractError(
      t.repo.upsertException(t.ctx.a, { date: "2026-12-24", kind: "add", locationId: loc.id }),
      "VALIDATION",
    );
    await expectContractError(
      t.repo.upsertException(t.ctx.a, { date: "2026-02-30", kind: "cancel" }),
      "VALIDATION",
    );
    await expectContractError(
      t.repo.upsertRule(t.ctx.a, { ...base, periodId: "nincs-ilyen" }),
      "NOT_FOUND",
    );
  });

  it("never returns, modifies or references tenant A's schedule from tenant B", async () => {
    const loc = await location(locations(), t.ctx.a);
    const period = await t.repo.upsertPeriod(t.ctx.a, { name: "Csak A" });
    const rule = await t.repo.upsertRule(t.ctx.a, {
      periodId: period.id,
      locationId: loc.id,
      weekday: 3,
      time: "18:00",
      serviceType: "szentmise",
    });
    const ex = await t.repo.upsertException(t.ctx.a, {
      date: "2026-12-25",
      kind: "cancel",
      ruleId: rule.id,
    });
    const dataB = await t.repo.getScheduleData(t.ctx.anonB);
    expect(ids(dataB.periods)).not.toContain(period.id);
    expect(ids(dataB.rules)).not.toContain(rule.id);
    expect(ids(dataB.exceptions)).not.toContain(ex.id);
    expect(await t.repo.getScheduleData(t.ctx.org)).toEqual({
      periods: [],
      rules: [],
      exceptions: [],
    });

    const locB = await location(locations(), t.ctx.b);
    await expectContractError(
      t.repo.upsertRule(t.ctx.b, {
        periodId: period.id,
        locationId: locB.id,
        weekday: 1,
        time: "08:00",
        serviceType: "szentmise",
      }),
      "NOT_FOUND",
    );
    await expectContractError(t.repo.deletePeriod(t.ctx.b, period.id), "NOT_FOUND");
    await expectContractError(t.repo.deleteRule(t.ctx.b, rule.id), "NOT_FOUND");
    await expectContractError(t.repo.deleteException(t.ctx.b, ex.id), "NOT_FOUND");
    expect(ids((await t.repo.getScheduleData(t.ctx.a)).rules)).toContain(rule.id);
  });

  it("materializes occurrences idempotently and keeps them internal", async () => {
    const loc = await location(locations(), t.ctx.a);
    const key = {
      locationId: loc.id,
      startsAt: "2026-11-15T10:00:00+01:00",
      serviceType: "szentmise",
    };
    const first = await t.repo.ensureOccurrence(t.ctx.a, key);
    const again = await t.repo.ensureOccurrence(t.ctx.a, key);
    expect(again.id).toBe(first.id);
    expect(first.status).toBe("scheduled");
    const range = { from: "2026-11-15T00:00:00+01:00", to: "2026-11-15T23:59:59+01:00" };
    expect(ids(await t.repo.listOccurrences(t.ctx.a, range))).toContain(first.id);
    expect(await t.repo.listOccurrences(t.ctx.anonA, range)).toEqual([]);
    expect(ids(await t.repo.listOccurrences(t.ctx.b, range))).not.toContain(first.id);
    const cancelled = await t.repo.updateOccurrence(t.ctx.a, first.id, { status: "cancelled" });
    expect(cancelled.status).toBe("cancelled");
    await expectContractError(
      t.repo.updateOccurrence(t.ctx.b, first.id, { status: "scheduled" }),
      "NOT_FOUND",
    );
    await expectContractError(
      t.repo.ensureOccurrence(t.ctx.a, { ...key, startsAt: "holnap" }),
      "VALIDATION",
    );
  });
});
