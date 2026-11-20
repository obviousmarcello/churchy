import { describe, expect, it } from "vitest";
import {
  addDays,
  daysInMonth,
  fromEpochDay,
  isoWeekday,
  matchesNthWeek,
  parseIsoDate,
  parseIsoTime,
  toEpochDay,
} from "./civil";
import { ScheduleError } from "./errors";
import type { NthWeek } from "./types";

describe("parseIsoDate", () => {
  it.each(["2026-11-13", "2024-02-29", "2026-12-31", "1900-01-01"])("accepts %s", (d) => {
    expect(() => parseIsoDate(d)).not.toThrow();
  });

  it.each(["2026-02-29", "2026-13-01", "2026-00-10", "2026-11-31", "2026-1-1", "", "x"])(
    "rejects %j with INVALID_DATE",
    (d) => {
      expect(() => parseIsoDate(d)).toThrow(ScheduleError);
      expect(() => parseIsoDate(d)).toThrow(expect.objectContaining({ code: "INVALID_DATE" }));
    },
  );
});

describe("parseIsoTime", () => {
  it.each([
    ["00:00", 0],
    ["07:05", 425],
    ["23:59", 1439],
  ])("%s → %i minutes", (t, minutes) => {
    expect(parseIsoTime(t)).toBe(minutes);
  });

  it.each(["24:00", "7:00", "12:60", "12:00:00"])("rejects %j", (t) => {
    expect(() => parseIsoTime(t)).toThrow(expect.objectContaining({ code: "INVALID_TIME" }));
  });
});

describe("isoWeekday (1 = Monday … 7 = Sunday)", () => {
  it.each([
    ["1970-01-01", 4],
    ["1969-12-31", 3],
    ["2026-11-09", 1],
    ["2026-11-13", 5],
    ["2026-11-14", 6],
    ["2026-11-15", 7],
    ["2027-01-01", 5],
  ])("%s → %i", (d, wd) => {
    expect(isoWeekday(d)).toBe(wd);
  });
});

describe("addDays / epoch days", () => {
  it.each([
    ["2026-11-13", 1, "2026-11-14"],
    ["2026-11-30", 1, "2026-12-01"],
    ["2026-12-31", 1, "2027-01-01"],
    ["2024-02-28", 1, "2024-02-29"],
    ["2026-03-01", -1, "2026-02-28"],
    ["2026-03-28", 1, "2026-03-29"],
  ])("%s + %i = %s", (d, n, expected) => {
    expect(addDays(d, n)).toBe(expected);
  });

  it("round-trips through epoch days", () => {
    expect(fromEpochDay(toEpochDay("2026-10-25"))).toBe("2026-10-25");
    expect(toEpochDay("1970-01-02")).toBe(1);
  });

  it("knows month lengths", () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2026, 11)).toBe(30);
  });
});

describe("matchesNthWeek", () => {
  // November 2026: Sundays 1, 8, 15, 22, 29; Fridays 6, 13, 20, 27.
  // February 2026: Sundays 1, 8, 15, 22.
  it.each<[string, NthWeek, boolean]>([
    ["2026-11-06", 1, true],
    ["2026-11-13", 1, false],
    ["2026-11-13", 2, true],
    ["2026-11-27", 4, true],
    ["2026-11-27", -1, true],
    ["2026-11-20", -1, false],
    ["2026-11-29", 5, true],
    ["2026-11-29", -1, true],
    ["2026-11-22", -1, false],
    ["2026-02-22", -1, true],
    ["2026-02-22", 4, true],
    ["2026-02-15", -1, false],
  ])("%s nth=%i → %s", (d, nth, expected) => {
    expect(matchesNthWeek(parseIsoDate(d), nth)).toBe(expected);
  });
});
