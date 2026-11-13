import { describe, expect, it } from "vitest";
import { resolve } from "./resolve";
import { exception, rule, scheduleInput } from "./testing/fixtures";
import { formatInstant, parseInstant, toBudapestDate, zonedTimeToInstant } from "./zone";
import { ScheduleError } from "./errors";

// Europe/Budapest: CET (+01:00) ↔ CEST (+02:00), switching at 01:00 UTC on the last
// Sunday of March (02:00 → 03:00) and October (03:00 → 02:00).
describe("DST transitions (last Sunday of March and October)", () => {
  const input = scheduleInput({
    rules: [
      // "Last Sunday of the month" rules land exactly on the DST change days.
      rule("last-sun-early", { nthWeek: -1, time: "01:30", durationMin: 120 }),
      rule("last-sun-10", { nthWeek: -1, time: "10:00" }),
      rule("sat-18", { weekday: 6, time: "18:00", durationMin: 600 }),
    ],
  });

  it.each<[string, string, string, string[]]>([
    [
      "spring forward 2026",
      "2026-03-28",
      "2026-03-29",
      [
        "18:00 2026-03-28T18:00:00+01:00 → 2026-03-29T05:00:00+02:00",
        "01:30 2026-03-29T01:30:00+01:00 → 2026-03-29T04:30:00+02:00",
        "10:00 2026-03-29T10:00:00+02:00 → 2026-03-29T11:00:00+02:00",
      ],
    ],
    [
      "fall back 2026",
      "2026-10-24",
      "2026-10-25",
      [
        "18:00 2026-10-24T18:00:00+02:00 → 2026-10-25T03:00:00+01:00",
        "01:30 2026-10-25T01:30:00+02:00 → 2026-10-25T02:30:00+01:00",
        "10:00 2026-10-25T10:00:00+01:00 → 2026-10-25T11:00:00+01:00",
      ],
    ],
    [
      "spring forward 2027",
      "2027-03-28",
      "2027-03-28",
      [
        "01:30 2027-03-28T01:30:00+01:00 → 2027-03-28T04:30:00+02:00",
        "10:00 2027-03-28T10:00:00+02:00 → 2027-03-28T11:00:00+02:00",
      ],
    ],
    [
      "fall back 2027",
      "2027-10-31",
      "2027-10-31",
      [
        "01:30 2027-10-31T01:30:00+02:00 → 2027-10-31T02:30:00+01:00",
        "10:00 2027-10-31T10:00:00+01:00 → 2027-10-31T11:00:00+01:00",
      ],
    ],
  ])("%s", (_name, from, to, expected) => {
    expect(resolve(input, from, to).map((s) => `${s.time} ${s.startsAt} → ${s.endsAt}`)).toEqual(
      expected,
    );
  });

  it("keeps the real duration across the change (end − start in absolute time)", () => {
    for (const s of resolve(input, "2026-03-28", "2026-10-25")) {
      expect(parseInstant(s.endsAt) - parseInstant(s.startsAt)).toBe(s.durationMin * 60_000);
    }
  });

  it("moves a service into the spring-forward gap by the gap (02:30 → 03:30+02:00)", () => {
    const gap = scheduleInput({
      rules: [rule("gap", { time: "02:30" })],
      exceptions: [
        exception("m", { date: "2026-03-29", kind: "modify", ruleId: "gap", time: "02:15" }),
      ],
    });
    expect(resolve(gap, "2026-03-22", "2026-03-29").map((s) => s.startsAt)).toEqual([
      "2026-03-22T02:30:00+01:00",
      "2026-03-29T03:15:00+02:00",
    ]);
  });

  it("resolves the repeated autumn hour to its first occurrence (+02:00)", () => {
    const overlap = scheduleInput({ rules: [rule("overlap", { time: "02:30" })] });
    expect(resolve(overlap, "2026-10-25", "2026-10-25")[0]?.startsAt).toBe(
      "2026-10-25T02:30:00+02:00",
    );
  });
});

describe("zone helpers", () => {
  it.each([
    [2026, 1, 15, 600, "2026-01-15T10:00:00+01:00"],
    [2026, 7, 15, 600, "2026-07-15T10:00:00+02:00"],
    [2026, 10, 25, 179, "2026-10-25T02:59:00+02:00"],
    [2026, 10, 25, 180, "2026-10-25T03:00:00+01:00"],
    [2026, 3, 29, 120, "2026-03-29T03:00:00+02:00"],
  ])("%i-%i-%i +%i min → %s", (y, m, d, minutes, expected) => {
    expect(formatInstant(zonedTimeToInstant(y, m, d, minutes))).toBe(expected);
  });

  it.each([
    ["2026-11-13T23:30:00Z", "2026-11-14"],
    ["2026-11-13T22:59:59Z", "2026-11-13"],
    ["2026-07-01T22:00:00Z", "2026-07-02"],
    ["2026-11-14T00:10:00+01:00", "2026-11-14"],
    ["2026-11-13T12:00:00.000-05:00", "2026-11-13"],
  ])("toBudapestDate(%s) = %s", (instant, date) => {
    expect(toBudapestDate(instant)).toBe(date);
  });

  it.each(["2026-11-13T10:00:00", "2026-11-13", "not a date", "2026-13-45T10:00:00Z"])(
    "requires an explicit offset / valid instant: %j",
    (value) => {
      expect(() => parseInstant(value)).toThrow(ScheduleError);
      expect(() => parseInstant(value)).toThrow(
        expect.objectContaining({ code: "INVALID_DATETIME" }),
      );
    },
  );
});
