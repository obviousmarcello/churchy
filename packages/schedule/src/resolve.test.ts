import { describe, expect, it, vi } from "vitest";
import { MAX_RANGE_DAYS, resolve, resolveDays } from "./resolve";
import { brief, exception, location, period, rule, scheduleInput } from "./testing/fixtures";
import type { ServiceException, ServiceRule } from "./types";

describe("rules", () => {
  it("expands weekly rules onto matching weekdays with Budapest instants", () => {
    const input = scheduleInput({
      rules: [
        rule("weekday", { weekday: 3, time: "07:00", durationMin: 30 }),
        rule("sunday", { weekday: 7, time: "10:00", livestream: true, title: "Családi mise" }),
      ],
    });
    const services = resolve(input, "2026-11-09", "2026-11-15");
    expect(brief(services)).toEqual(["2026-11-11 07:00 L1 regular", "2026-11-15 10:00 L1 regular"]);
    expect(services[0]).toMatchObject({
      id: "r:weekday:2026-11-11",
      weekday: 3,
      startsAt: "2026-11-11T07:00:00+01:00",
      endsAt: "2026-11-11T07:30:00+01:00",
      periodId: "alt",
      ruleId: "weekday",
      exceptionId: null,
      original: null,
    });
    expect(services[1]).toMatchObject({ livestream: true, title: "Családi mise", dayContext: {} });
  });

  // November 2026: Fridays 6, 13, 20, 27; Sundays 1, 8, 15, 22, 29.
  it.each<[string, Partial<ServiceRule>, string[]]>([
    ["every Friday", { weekday: 5 }, ["2026-11-06", "2026-11-13", "2026-11-20", "2026-11-27"]],
    ["first Friday", { weekday: 5, nthWeek: 1 }, ["2026-11-06"]],
    ["second Friday", { weekday: 5, nthWeek: 2 }, ["2026-11-13"]],
    ["last Friday", { weekday: 5, nthWeek: -1 }, ["2026-11-27"]],
    ["fifth Friday (none in Nov 2026)", { weekday: 5, nthWeek: 5 }, []],
    ["fifth Sunday", { weekday: 7, nthWeek: 5 }, ["2026-11-29"]],
    ["last Sunday", { weekday: 7, nthWeek: -1 }, ["2026-11-29"]],
    ["fourth Sunday", { weekday: 7, nthWeek: 4 }, ["2026-11-22"]],
  ])("nth week: %s", (_name, overrides, dates) => {
    const input = scheduleInput({ rules: [rule("r", overrides)] });
    expect(resolve(input, "2026-11-01", "2026-11-30").map((s) => s.date)).toEqual(dates);
  });

  it("ignores rules whose period or location is unknown", () => {
    const input = scheduleInput({
      rules: [
        rule("ok"),
        rule("ghost-period", { periodId: "nope" }),
        rule("ghost-location", { locationId: "nope" }),
      ],
    });
    expect(resolve(input, "2026-11-15", "2026-11-15").map((s) => s.ruleId)).toEqual(["ok"]);
  });

  it("sorts by date, time, location sort (not input order), then location id", () => {
    const input = scheduleInput({
      locations: [location("B", 1), location("A", 2), location("C", 1)],
      rules: [
        rule("a10", { locationId: "A", time: "10:00" }),
        rule("b10", { locationId: "B", time: "10:00" }),
        rule("c10", { locationId: "C", time: "10:00" }),
        rule("a08", { locationId: "A", time: "08:00" }),
        rule("sat", { locationId: "A", weekday: 6, time: "18:00" }),
      ],
    });
    expect(resolve(input, "2026-11-14", "2026-11-15").map((s) => s.ruleId)).toEqual([
      "sat",
      "a08",
      "b10",
      "c10",
      "a10",
    ]);
  });
});

describe("periods", () => {
  const summer = period("nyari", {
    yearly: true,
    validFrom: "2000-06-15",
    validTo: "2000-08-31",
    priority: 10,
  });
  const input = scheduleInput({
    periods: [period("alt"), summer],
    rules: [
      rule("alt-L1-sun", { time: "10:00" }),
      rule("alt-L1-wed", { weekday: 3, time: "18:00" }),
      rule("alt-L2-sun", { locationId: "L2", time: "08:00" }),
      rule("nyari-L1-sun", { periodId: "nyari", time: "09:00" }),
    ],
  });

  it.each<[string, string, string, string[]]>([
    [
      "outside summer the general period applies",
      "2026-06-08",
      "2026-06-14",
      ["2026-06-10 18:00 L1 regular", "2026-06-14 08:00 L2 regular", "2026-06-14 10:00 L1 regular"],
    ],
    [
      // L1 has summer rules → the summer period wins for L1 and ALL its general rules
      // (incl. Wednesday) are suppressed; L2 has no summer rules → keeps the general period.
      "in summer the higher-priority period wins per location",
      "2026-06-15",
      "2026-06-21",
      ["2026-06-21 08:00 L2 regular", "2026-06-21 09:00 L1 regular"],
    ],
    [
      "switches back on the first day after the yearly range",
      "2027-08-29",
      "2027-09-05",
      [
        "2027-08-29 08:00 L2 regular",
        "2027-08-29 09:00 L1 regular",
        "2027-09-01 18:00 L1 regular",
        "2027-09-05 08:00 L2 regular",
        "2027-09-05 10:00 L1 regular",
      ],
    ],
  ])("%s", (_name, from, to, expected) => {
    expect(brief(resolve(input, from, to))).toEqual(expected);
  });

  it("handles yearly periods crossing the year end (Dec 1 → Jan 6)", () => {
    const advent = period("karacsony", {
      yearly: true,
      validFrom: "2026-12-01",
      validTo: "2027-01-06",
      priority: 5,
    });
    const wrapInput = scheduleInput({
      periods: [period("alt"), advent],
      rules: [
        rule("alt-daily", { weekday: 5, time: "18:00" }),
        rule("advent-daily", { periodId: "karacsony", weekday: 5, time: "06:00", title: "Roráte" }),
      ],
    });
    // Fridays: Nov 27, Dec 4, …, Jan 1, Jan 8.
    const fridays = resolve(wrapInput, "2026-11-27", "2027-01-08").map(
      (s) => `${s.date} ${s.time}`,
    );
    expect(fridays).toEqual([
      "2026-11-27 18:00",
      "2026-12-04 06:00",
      "2026-12-11 06:00",
      "2026-12-18 06:00",
      "2026-12-25 06:00",
      "2027-01-01 06:00",
      "2027-01-08 18:00",
    ]);
  });

  it("respects date-bounded (non-yearly) periods", () => {
    const bounded = scheduleInput({
      periods: [period("alt", { validFrom: "2026-11-10", validTo: "2026-11-20" })],
      rules: [rule("sun")],
    });
    expect(resolve(bounded, "2026-11-01", "2026-11-30").map((s) => s.date)).toEqual(["2026-11-15"]);
  });

  it("breaks priority ties by period id, independent of input order", () => {
    const make = (periods: ReturnType<typeof period>[]) =>
      scheduleInput({
        periods,
        rules: [rule("in-b", { periodId: "b", time: "11:00" }), rule("in-a", { periodId: "a" })],
      });
    const forward = resolve(make([period("a"), period("b")]), "2026-11-15", "2026-11-15");
    const reverse = resolve(make([period("b"), period("a")]), "2026-11-15", "2026-11-15");
    expect(forward.map((s) => s.ruleId)).toEqual(["in-a"]);
    expect(reverse.map((s) => s.ruleId)).toEqual(["in-a"]);
  });
});

describe("exceptions", () => {
  const SUN = "2026-11-15";
  const rules = [
    rule("r08", { time: "08:00" }),
    rule("r10", { time: "10:00", note: "Gyermekmise" }),
    rule("r18", { time: "18:00", livestream: true }),
    rule("r09", { locationId: "L2", time: "09:00", language: "de", title: "Deutsche Messe" }),
    rule("mon", { weekday: 1, time: "07:00" }),
  ];
  const base = [
    `${SUN} 08:00 L1 regular`,
    `${SUN} 09:00 L2 regular`,
    `${SUN} 10:00 L1 regular`,
    `${SUN} 18:00 L1 regular`,
  ];
  const ex = (id: string, o: Partial<ServiceException> & Pick<ServiceException, "kind">) =>
    exception(id, { date: SUN, ...o });

  it.each<[string, ServiceException[], string[]]>([
    ["no exceptions", [], base],
    [
      "exceptions on other dates are ignored",
      [exception("x", { date: "2026-11-16", kind: "cancel" })],
      base,
    ],
    // cancel
    [
      "cancel one rule occurrence",
      [ex("c", { kind: "cancel", ruleId: "r10" })],
      [base[0]!, base[1]!, base[3]!],
    ],
    ["cancel a whole location", [ex("c", { kind: "cancel", locationId: "L1" })], [base[1]!]],
    ["cancel every location", [ex("c", { kind: "cancel" })], []],
    [
      "cancel with ruleId + mismatching locationId is a no-op",
      [ex("c", { kind: "cancel", ruleId: "r10", locationId: "L2" })],
      base,
    ],
    [
      "cancel of a rule without an occurrence that day is a no-op",
      [ex("c", { kind: "cancel", ruleId: "mon" })],
      base,
    ],
    [
      "exceptions for unknown locations are ignored",
      [ex("c", { kind: "cancel", locationId: "nowhere" })],
      base,
    ],
    // modify
    [
      "modify the time of one occurrence (re-sorted)",
      [ex("m", { kind: "modify", ruleId: "r10", time: "08:30" })],
      [base[0]!, `${SUN} 08:30 L1 modified`, base[1]!, base[3]!],
    ],
    [
      "modify a whole location (note only)",
      [ex("m", { kind: "modify", locationId: "L1", note: "Búcsú" })],
      [
        `${SUN} 08:00 L1 modified`,
        base[1]!,
        `${SUN} 10:00 L1 modified`,
        `${SUN} 18:00 L1 modified`,
      ],
    ],
    [
      "modify never revives a cancelled service (cancel runs first, whatever the input order)",
      [
        ex("m", { kind: "modify", ruleId: "r10", time: "11:00" }),
        ex("c", { kind: "cancel", ruleId: "r10" }),
      ],
      [base[0]!, base[1]!, base[3]!],
    ],
    // add
    [
      "add a service without a template rule",
      [ex("a", { kind: "add", locationId: "L2", time: "15:00", serviceType: "litania" })],
      [...base.slice(0, 3), `${SUN} 15:00 L2 added`, base[3]!],
    ],
    [
      "add from a template rule with a time override",
      [ex("a", { kind: "add", ruleId: "r09", time: "12:00" })],
      [...base.slice(0, 3), `${SUN} 12:00 L2 added`, base[3]!],
    ],
    [
      "add from a template rule at another location",
      [ex("a", { kind: "add", ruleId: "r09", locationId: "L1" })],
      [base[0]!, `${SUN} 09:00 L1 added`, base[1]!, base[2]!, base[3]!],
    ],
    ["add without location and rule is ignored", [ex("a", { kind: "add", time: "12:00" })], base],
    ["add without time and rule is ignored", [ex("a", { kind: "add", locationId: "L1" })], base],
    [
      "add with an unknown rule is ignored",
      [ex("a", { kind: "add", ruleId: "nope", locationId: "L1", time: "12:00" })],
      base,
    ],
    [
      "cancel everything + add one joint service: the add survives",
      [ex("a", { kind: "add", locationId: "L1", time: "10:30" }), ex("c", { kind: "cancel" })],
      [`${SUN} 10:30 L1 added`],
    ],
  ])("%s", (_name, exceptions, expected) => {
    const input = scheduleInput({ rules, exceptions });
    expect(brief(resolve(input, SUN, SUN))).toEqual(expected);
  });

  it("modify records the original values and recomputes instants", () => {
    const input = scheduleInput({
      rules,
      exceptions: [
        ex("m1", { kind: "modify", ruleId: "r10", time: "08:30", reason: "Búcsú" }),
        ex("m2", { kind: "modify", ruleId: "r10", serviceType: "unnepi-mise", time: "09:30" }),
      ],
    });
    const modified = resolve(input, SUN, SUN).find((s) => s.ruleId === "r10");
    expect(modified).toMatchObject({
      id: `r:r10:${SUN}`,
      status: "modified",
      time: "09:30",
      startsAt: `${SUN}T09:30:00+01:00`,
      endsAt: `${SUN}T10:30:00+01:00`,
      serviceType: "unnepi-mise",
      note: "Gyermekmise",
      exceptionId: "m2",
      reason: null,
      original: { time: "10:00", serviceType: "szentmise", note: "Gyermekmise" },
    });
  });

  it("modify with the same time keeps the instants", () => {
    const input = scheduleInput({
      rules,
      exceptions: [ex("m", { kind: "modify", ruleId: "r10", time: "10:00", note: "Új" })],
    });
    expect(resolve(input, SUN, SUN).find((s) => s.ruleId === "r10")).toMatchObject({
      startsAt: `${SUN}T10:00:00+01:00`,
      note: "Új",
    });
  });

  it("added services copy the template and use defaults otherwise", () => {
    const input = scheduleInput({
      rules,
      exceptions: [
        ex("tpl", {
          kind: "add",
          ruleId: "r18",
          time: "20:00",
          note: "Szentségimádás",
          reason: "Ünnep",
        }),
        ex("bare", { kind: "add", locationId: "L2", time: "15:00" }),
      ],
    });
    const services = resolve(input, SUN, SUN);
    expect(services.find((s) => s.id === "x:tpl")).toMatchObject({
      status: "added",
      locationId: "L1",
      ruleId: "r18",
      periodId: "alt",
      livestream: true,
      serviceType: "szentmise",
      note: "Szentségimádás",
      exceptionId: "tpl",
      reason: "Ünnep",
      startsAt: `${SUN}T20:00:00+01:00`,
      endsAt: `${SUN}T21:00:00+01:00`,
    });
    expect(services.find((s) => s.id === "x:bare")).toMatchObject({
      ruleId: null,
      periodId: null,
      durationMin: 60,
      serviceType: "service",
      language: "hu",
      title: null,
      note: null,
      livestream: false,
    });
    const custom = resolve(input, SUN, SUN, {
      addDefaults: { durationMin: 45, serviceType: "istentisztelet" },
    }).find((s) => s.id === "x:bare");
    expect(custom).toMatchObject({
      durationMin: 45,
      serviceType: "istentisztelet",
      language: "hu",
    });
    expect(custom?.endsAt).toBe(`${SUN}T15:45:00+01:00`);
  });

  it("includeCancelled returns cancelled occurrences with the first cancel's reason", () => {
    const input = scheduleInput({
      rules,
      exceptions: [
        ex("c1", { kind: "cancel", ruleId: "r10", reason: "Felújítás" }),
        ex("c2", { kind: "cancel", locationId: "L1", reason: "Áramszünet" }),
      ],
    });
    const services = resolve(input, SUN, SUN, { includeCancelled: true });
    expect(brief(services)).toEqual([
      `${SUN} 08:00 L1 cancelled`,
      `${SUN} 09:00 L2 regular`,
      `${SUN} 10:00 L1 cancelled`,
      `${SUN} 18:00 L1 cancelled`,
    ]);
    expect(services.map((s) => s.reason)).toEqual(["Áramszünet", null, "Felújítás", "Áramszünet"]);
  });
});

describe("multiple locations and the location filter", () => {
  const input = scheduleInput({
    locations: [location("L1", 1), location("L2", 2), location("L3", 3)],
    rules: [
      rule("r1", { locationId: "L1" }),
      rule("r2", { locationId: "L2", time: "09:00" }),
      rule("r3", { locationId: "L3", time: "11:00" }),
    ],
    exceptions: [
      exception("all", { date: "2026-11-15", kind: "modify", note: "Mindenhol" }),
      exception("add3", { date: "2026-11-15", kind: "add", locationId: "L3", time: "16:00" }),
      exception("tpl3", { date: "2026-11-15", kind: "add", ruleId: "r3" }),
    ],
  });

  it("resolves every location without a filter", () => {
    expect(resolve(input, "2026-11-15", "2026-11-15").map((s) => s.locationId)).toEqual([
      "L2",
      "L1",
      "L3",
      "L3",
      "L3",
    ]);
  });

  it("limits rules and exceptions to the filtered locations", () => {
    const services = resolve(input, "2026-11-15", "2026-11-15", { locationIds: ["L1", "L2"] });
    expect(brief(services)).toEqual([
      "2026-11-15 09:00 L2 modified",
      "2026-11-15 10:00 L1 modified",
    ]);
    expect(services.every((s) => s.note === "Mindenhol")).toBe(true);
  });

  it("returns nothing for an empty filter", () => {
    expect(resolve(input, "2026-11-15", "2026-11-15", { locationIds: [] })).toEqual([]);
  });
});

describe("day context and days", () => {
  it("annotates every day and its services, calling the callback once per date", () => {
    const dayContext = vi.fn((date: string) =>
      date === "2026-11-01"
        ? { liturgicalDayName: "Mindenszentek", publicHolidayName: "Mindenszentek" }
        : {},
    );
    const input = scheduleInput({ rules: [rule("sun"), rule("sun2", { time: "18:00" })] });
    const days = resolveDays(input, "2026-10-31", "2026-11-02", { dayContext });
    expect(dayContext).toHaveBeenCalledTimes(3);
    expect(days.map((d) => [d.date, d.weekday, d.services.length])).toEqual([
      ["2026-10-31", 6, 0],
      ["2026-11-01", 7, 2],
      ["2026-11-02", 1, 0],
    ]);
    expect(days[1]?.dayContext).toEqual({
      liturgicalDayName: "Mindenszentek",
      publicHolidayName: "Mindenszentek",
    });
    expect(days[1]?.services.every((s) => s.dayContext.liturgicalDayName === "Mindenszentek")).toBe(
      true,
    );
  });
});

describe("range validation", () => {
  const input = scheduleInput({ rules: [rule("sun")] });

  it(`accepts exactly ${MAX_RANGE_DAYS} days`, () => {
    expect(resolveDays(input, "2026-01-01", "2027-02-04")).toHaveLength(MAX_RANGE_DAYS);
  });

  it.each<[string, string, string, string]>([
    ["more than 400 days", "2026-01-01", "2027-02-05", "RANGE_TOO_LARGE"],
    ["inverted range", "2026-11-15", "2026-11-14", "RANGE_INVERTED"],
    ["invalid date", "2026-02-30", "2026-03-01", "INVALID_DATE"],
  ])("throws a typed error for %s", (_name, from, to, code) => {
    expect(() => resolve(input, from, to)).toThrow(
      expect.objectContaining({ name: "ScheduleError", code }),
    );
  });

  it.each<[string, Parameters<typeof scheduleInput>[0], string]>([
    ["an invalid rule time", { rules: [rule("bad", { time: "25:00" })] }, "INVALID_TIME"],
    [
      "an invalid exception time",
      { exceptions: [exception("bad", { date: "2026-11-15", kind: "add", time: "9:00" })] },
      "INVALID_TIME",
    ],
    [
      "an invalid exception date",
      { exceptions: [exception("bad", { date: "2026-11-31", kind: "cancel" })] },
      "INVALID_DATE",
    ],
    [
      "an invalid period bound",
      { periods: [period("alt", { validFrom: "2026-13-01" })] },
      "INVALID_DATE",
    ],
  ])("rejects input with %s", (_name, partial, code) => {
    expect(() => resolve(scheduleInput(partial), "2026-11-15", "2026-11-15")).toThrow(
      expect.objectContaining({ code }),
    );
  });
});
