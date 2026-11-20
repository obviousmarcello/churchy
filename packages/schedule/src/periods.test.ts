import { describe, expect, it } from "vitest";
import { isPeriodActive } from "./periods";
import { period } from "./testing/fixtures";
import type { SchedulePeriod } from "./types";

const cases: Array<[string, Partial<SchedulePeriod>, string, boolean]> = [
  // non-yearly, inclusive bounds
  ["open-ended both sides", {}, "2026-11-13", true],
  ["date range: before", { validFrom: "2026-09-01", validTo: "2027-06-30" }, "2026-08-31", false],
  ["date range: first day", { validFrom: "2026-09-01", validTo: "2027-06-30" }, "2026-09-01", true],
  ["date range: last day", { validFrom: "2026-09-01", validTo: "2027-06-30" }, "2027-06-30", true],
  ["date range: after", { validFrom: "2026-09-01", validTo: "2027-06-30" }, "2027-07-01", false],
  ["only validFrom", { validFrom: "2026-09-01" }, "2030-01-01", true],
  ["only validTo", { validTo: "2026-09-01" }, "2026-09-02", false],
  // yearly, month-day only
  ["yearly summer: inside, other year", summer(), "2031-07-10", true],
  ["yearly summer: first day", summer(), "2026-06-15", true],
  ["yearly summer: last day", summer(), "2026-08-31", true],
  ["yearly summer: before", summer(), "2026-06-14", false],
  ["yearly summer: after", summer(), "2026-09-01", false],
  ["yearly wrap: Nov 30", wrap(), "2026-11-30", false],
  ["yearly wrap: Dec 1", wrap(), "2026-12-01", true],
  ["yearly wrap: Dec 31", wrap(), "2026-12-31", true],
  ["yearly wrap: Jan 1", wrap(), "2027-01-01", true],
  ["yearly wrap: Jan 6", wrap(), "2027-01-06", true],
  ["yearly wrap: Jan 7", wrap(), "2027-01-07", false],
  ["yearly wrap: July", wrap(), "2027-07-01", false],
  ["yearly open-ended = every day", { yearly: true }, "2026-02-28", true],
  ["yearly from only → to Dec 31", { yearly: true, validFrom: "2000-10-01" }, "2026-12-31", true],
  ["yearly from only, before", { yearly: true, validFrom: "2000-10-01" }, "2026-09-30", false],
  ["yearly to only → from Jan 1", { yearly: true, validTo: "2000-03-01" }, "2026-01-01", true],
  ["yearly to only, after", { yearly: true, validTo: "2000-03-01" }, "2026-03-02", false],
];

function summer(): Partial<SchedulePeriod> {
  return { yearly: true, validFrom: "2000-06-15", validTo: "2000-08-31" };
}

function wrap(): Partial<SchedulePeriod> {
  return { yearly: true, validFrom: "2025-12-01", validTo: "2026-01-06" };
}

describe("isPeriodActive", () => {
  it.each(cases)("%s", (_name, overrides, date, expected) => {
    expect(isPeriodActive(period("p", overrides), date)).toBe(expected);
  });
});
