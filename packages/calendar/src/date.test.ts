import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  daysInMonth,
  fromDayNumber,
  isoDate,
  isoWeekday,
  isLeapYear,
  parseIsoDate,
  sundayAfter,
  sundayOnOrBefore,
  toDayNumber,
} from "./date";

describe("civil date arithmetic", () => {
  it("parses valid dates and rejects malformed or impossible ones", () => {
    expect(parseIsoDate("2026-11-13")).toEqual({ year: 2026, month: 11, day: 13 });
    expect(parseIsoDate("2024-02-29")).toEqual({ year: 2024, month: 2, day: 29 });
    for (const bad of [
      "2026-1-13",
      "2026/11/13",
      "2026-11-13T00:00:00Z",
      "",
      "2026-00-10",
      "2026-13-01",
      "2026-04-31",
      "2025-02-29",
      "1900-02-29",
      "2026-11-00",
      "1582-12-31",
    ]) {
      expect(() => parseIsoDate(bad), bad).toThrow(RangeError);
    }
    expect(() => isoDate(10000, 1, 1)).toThrow(RangeError);
  });

  it("knows leap years and month lengths", () => {
    expect([1900, 2000, 2024, 2026, 2100].map(isLeapYear)).toEqual([
      false,
      true,
      true,
      false,
      false,
    ]);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it("converts to and from day numbers", () => {
    expect(toDayNumber("1970-01-01")).toBe(0);
    expect(toDayNumber("2000-03-01")).toBe(11017);
    expect(toDayNumber("1900-01-01")).toBe(-25567);
    expect(fromDayNumber(-25567)).toBe("1900-01-01");
    // Round-trip every day of 1899-12-01 … 2101-01-31.
    const start = toDayNumber("1899-12-01");
    const end = toDayNumber("2101-01-31");
    for (let n = start; n <= end; n++) {
      expect(toDayNumber(fromDayNumber(n))).toBe(n);
    }
  });

  it("adds days across month, year and leap boundaries", () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2024-02-29", 1)).toBe("2024-03-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(daysBetween("2026-01-01", "2027-01-01")).toBe(365);
    expect(daysBetween("2027-01-01", "2026-01-01")).toBe(-365);
  });

  it("computes ISO weekdays (1 = Monday … 7 = Sunday)", () => {
    expect(isoWeekday("2026-11-09")).toBe(1);
    expect(isoWeekday("2026-11-13")).toBe(5);
    expect(isoWeekday("2026-11-15")).toBe(7);
    expect(isoWeekday("1900-01-01")).toBe(1);
    expect(isoWeekday("1969-12-28")).toBe(7);
    // DST change days in Budapest are ordinary civil days here.
    expect(isoWeekday("2026-03-29")).toBe(7);
    expect(isoWeekday("2026-10-25")).toBe(7);
    expect(addDays("2026-03-28", 1)).toBe("2026-03-29");
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
  });

  it("finds neighbouring Sundays", () => {
    expect(sundayOnOrBefore("2026-11-15")).toBe("2026-11-15");
    expect(sundayOnOrBefore("2026-11-14")).toBe("2026-11-08");
    expect(sundayAfter("2026-11-15")).toBe("2026-11-22");
    expect(sundayAfter("2026-11-14")).toBe("2026-11-15");
  });
});
