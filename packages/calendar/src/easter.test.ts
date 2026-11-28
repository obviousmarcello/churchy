import { describe, expect, it } from "vitest";
import reference from "./__fixtures__/easter-1900-2100.json";
import { addDays, isoWeekday } from "./date";
import { easter, firstSundayOfAdvent, moveableFeasts } from "./easter";

/**
 * `__fixtures__/easter-1900-2100.json` was generated independently by
 * `scripts/generate-easter-reference.py` (Knuth's epact algorithm, cross-checked
 * against python-dateutil for every year). `easter()` uses the anonymous Gregorian
 * (Meeus/Jones/Butcher) algorithm.
 */
describe("easter", () => {
  const table = reference as Record<string, string>;

  it("has a reference entry for every year 1900–2100", () => {
    expect(Object.keys(table)).toHaveLength(201);
  });

  it("matches the reference table for every year 1900–2100", () => {
    for (let year = 1900; year <= 2100; year++) {
      expect(easter(year), String(year)).toBe(table[String(year)]);
    }
  });

  it("matches well-known dates", () => {
    expect(easter(2024)).toBe("2024-03-31");
    expect(easter(2025)).toBe("2025-04-20");
    expect(easter(2026)).toBe("2026-04-05");
    expect(easter(2027)).toBe("2027-03-28");
    expect(easter(2000)).toBe("2000-04-23");
    expect(easter(2008)).toBe("2008-03-23");
    expect(easter(2038)).toBe("2038-04-25"); // latest possible
    expect(easter(2285)).toBe("2285-03-22"); // earliest possible
  });

  it("is always a Sunday between Mar 22 and Apr 25", () => {
    for (let year = 1583; year <= 3000; year++) {
      const date = easter(year);
      expect(isoWeekday(date)).toBe(7);
      const monthDay = date.slice(5);
      expect(monthDay >= "03-22" && monthDay <= "04-25", date).toBe(true);
    }
  });

  it("rejects years outside the Gregorian range", () => {
    expect(() => easter(1582)).toThrow(RangeError);
    expect(() => easter(10000)).toThrow(RangeError);
    expect(() => easter(2026.5)).toThrow(RangeError);
  });
});

describe("moveableFeasts", () => {
  // Three sample years with early, middle and late Easter; dates checked against
  // the Hungarian church calendars of those years.
  const samples = {
    2024: {
      ashWednesday: "2024-02-14",
      palmSunday: "2024-03-24",
      maundyThursday: "2024-03-28",
      goodFriday: "2024-03-29",
      holySaturday: "2024-03-30",
      easterSunday: "2024-03-31",
      easterMonday: "2024-04-01",
      ascension: "2024-05-09",
      pentecostSunday: "2024-05-19",
      pentecostMonday: "2024-05-20",
      trinitySunday: "2024-05-26",
      corpusChristi: "2024-06-02",
      sacredHeart: "2024-06-07",
      christTheKing: "2024-11-24",
      adventSundays: ["2024-12-01", "2024-12-08", "2024-12-15", "2024-12-22"],
    },
    2025: {
      ashWednesday: "2025-03-05",
      palmSunday: "2025-04-13",
      maundyThursday: "2025-04-17",
      goodFriday: "2025-04-18",
      holySaturday: "2025-04-19",
      easterSunday: "2025-04-20",
      easterMonday: "2025-04-21",
      ascension: "2025-05-29",
      pentecostSunday: "2025-06-08",
      pentecostMonday: "2025-06-09",
      trinitySunday: "2025-06-15",
      corpusChristi: "2025-06-22",
      sacredHeart: "2025-06-27",
      christTheKing: "2025-11-23",
      adventSundays: ["2025-11-30", "2025-12-07", "2025-12-14", "2025-12-21"],
    },
    2026: {
      ashWednesday: "2026-02-18",
      palmSunday: "2026-03-29",
      maundyThursday: "2026-04-02",
      goodFriday: "2026-04-03",
      holySaturday: "2026-04-04",
      easterSunday: "2026-04-05",
      easterMonday: "2026-04-06",
      ascension: "2026-05-14",
      pentecostSunday: "2026-05-24",
      pentecostMonday: "2026-05-25",
      trinitySunday: "2026-05-31",
      corpusChristi: "2026-06-07",
      sacredHeart: "2026-06-12",
      christTheKing: "2026-11-22",
      adventSundays: ["2026-11-29", "2026-12-06", "2026-12-13", "2026-12-20"],
    },
  } as const;

  for (const [year, expected] of Object.entries(samples)) {
    it(`produces every moveable day for ${year}`, () => {
      expect(moveableFeasts(Number(year))).toEqual({ year: Number(year), ...expected });
    });
  }

  it("is memoised and frozen", () => {
    const first = moveableFeasts(2026);
    expect(moveableFeasts(2026)).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.adventSundays)).toBe(true);
  });

  it("keeps weekday invariants for every year 1900–2100", () => {
    for (let year = 1900; year <= 2100; year++) {
      const m = moveableFeasts(year);
      expect(isoWeekday(m.ashWednesday)).toBe(3);
      expect(isoWeekday(m.maundyThursday)).toBe(4);
      expect(isoWeekday(m.ascension)).toBe(4);
      expect(isoWeekday(m.goodFriday)).toBe(5);
      expect(isoWeekday(m.sacredHeart)).toBe(5);
      for (const sunday of [m.palmSunday, m.pentecostSunday, m.trinitySunday, m.corpusChristi]) {
        expect(isoWeekday(sunday)).toBe(7);
      }
      for (const sunday of m.adventSundays) expect(isoWeekday(sunday)).toBe(7);
      // Advent 1 is between Nov 27 and Dec 3; Advent 4 is between Dec 18 and Dec 24.
      expect(m.adventSundays[0] >= `${year}-11-27` && m.adventSundays[0] <= `${year}-12-03`).toBe(
        true,
      );
      expect(m.adventSundays[3] >= `${year}-12-18` && m.adventSundays[3] <= `${year}-12-24`).toBe(
        true,
      );
      expect(addDays(m.christTheKing, 7)).toBe(firstSundayOfAdvent(year));
    }
  });

  it("puts Advent 4 on Dec 24 when Christmas Eve is a Sunday", () => {
    expect(moveableFeasts(2023).adventSundays).toEqual([
      "2023-12-03",
      "2023-12-10",
      "2023-12-17",
      "2023-12-24",
    ]);
  });
});
