import { describe, expect, it } from "vitest";
import {
  budapestNow,
  currentAndUpcomingExceptions,
  exceptionOn,
  hoursOn,
  openingStatus,
  weeklyTable,
  type OpeningHoursInput,
} from "./opening-hours";

// Office: Mon 09–12 and 14–17, Wed 15–18, Sun 08:30–10:00 (a DST change day in the tests).
const OFFICE: OpeningHoursInput = {
  weekly: [
    { weekday: 1, from: "14:00", to: "17:00" },
    { weekday: 1, from: "09:00", to: "12:00" },
    { weekday: 3, from: "15:00", to: "18:00" },
    { weekday: 7, from: "01:00", to: "04:00" },
    // Ignored: `to` is not after `from`.
    { weekday: 5, from: "18:00", to: "09:00" },
  ],
  exceptions: [],
};

const withExceptions = (exceptions: OpeningHoursInput["exceptions"]): OpeningHoursInput => ({
  ...OFFICE,
  exceptions,
});

describe("budapestNow", () => {
  it("reads instants, ISO strings and epoch ms in Budapest time", () => {
    expect(budapestNow("2026-11-16T08:30:00Z")).toEqual({ date: "2026-11-16", minutes: 570 });
    expect(budapestNow(new Date("2026-07-01T22:30:00Z"))).toEqual({
      date: "2026-07-02",
      minutes: 30,
    });
    expect(budapestNow(Date.parse("2026-12-31T23:00:00Z"))).toEqual({
      date: "2027-01-01",
      minutes: 0,
    });
  });

  it("rejects invalid clocks and strings without an offset", () => {
    expect(() => budapestNow(new Date("nope"))).toThrow(RangeError);
    expect(() => budapestNow("2026-11-16T08:30:00")).toThrow();
  });
});

describe("hoursOn", () => {
  it("returns the sorted regular hours of the weekday", () => {
    expect(hoursOn(OFFICE, "2026-11-16")).toEqual({
      date: "2026-11-16",
      weekday: 1,
      intervals: [
        { from: "09:00", to: "12:00" },
        { from: "14:00", to: "17:00" },
      ],
      exception: null,
    });
    expect(hoursOn(OFFICE, "2026-11-17").intervals).toEqual([]);
    expect(hoursOn(OFFICE, "2026-11-20").intervals).toEqual([]);
  });

  it("a closed exception overrides the regular hours for the whole inclusive range", () => {
    const summer = { from: "2026-07-15", to: "2026-07-31", closed: true, note: "Nyári szünet" };
    const hours = withExceptions([summer]);
    expect(hoursOn(hours, "2026-07-13").intervals).toHaveLength(2);
    expect(hoursOn(hours, "2026-07-15").intervals).toEqual([]);
    expect(hoursOn(hours, "2026-07-20")).toMatchObject({ intervals: [], exception: summer });
    expect(hoursOn(hours, "2026-07-29").intervals).toEqual([]);
    expect(hoursOn(hours, "2026-08-03").intervals).toHaveLength(2);
  });

  it("an open exception with its own hours replaces them; without hours keeps the regular ones", () => {
    const reduced = {
      from: "2026-08-01",
      to: "2026-08-31",
      closed: false,
      hours: [{ weekday: 1, from: "10:00", to: "11:00" }],
    };
    const noteOnly = { from: "2026-09-01", to: "2026-09-07", closed: false, note: "Új címen" };
    const hours = withExceptions([reduced, noteOnly]);
    expect(hoursOn(hours, "2026-08-03").intervals).toEqual([{ from: "10:00", to: "11:00" }]);
    expect(hoursOn(hours, "2026-08-05").intervals).toEqual([]);
    expect(hoursOn(hours, "2026-09-07")).toMatchObject({
      intervals: [
        { from: "09:00", to: "12:00" },
        { from: "14:00", to: "17:00" },
      ],
      exception: noteOnly,
    });
  });

  it("rejects an invalid date", () => {
    expect(() => hoursOn(OFFICE, "2026-02-30")).toThrow();
  });
});

describe("exceptionOn", () => {
  it("prefers the narrowest overlapping range, then the one listed last", () => {
    const summer = { from: "2026-07-01", to: "2026-08-31", closed: true };
    const openDay = { from: "2026-07-20", to: "2026-07-20", closed: false };
    const sameDay = { from: "2026-07-20", to: "2026-07-20", closed: true };
    expect(exceptionOn({ exceptions: [openDay, summer] }, "2026-07-20")).toBe(openDay);
    expect(exceptionOn({ exceptions: [summer, openDay, sameDay] }, "2026-07-20")).toBe(sameDay);
    expect(exceptionOn({ exceptions: [summer, openDay] }, "2026-07-21")).toBe(summer);
    expect(exceptionOn({ exceptions: [summer] }, "2026-09-01")).toBeNull();
  });
});

describe("openingStatus", () => {
  it("is open inside an interval (from inclusive, to exclusive) and reports it", () => {
    // Monday 2026-11-16, CET (+01:00).
    const at = (time: string) => `2026-11-16T${time}:00+01:00`;
    expect(openingStatus(OFFICE, at("09:00"))).toMatchObject({
      today: "2026-11-16",
      open: true,
      current: { from: "09:00", to: "12:00" },
      next: { date: "2026-11-16", from: "14:00" },
    });
    expect(openingStatus(OFFICE, at("11:59")).open).toBe(true);
    expect(openingStatus(OFFICE, at("12:00"))).toMatchObject({
      open: false,
      current: null,
      next: { date: "2026-11-16", from: "14:00" },
    });
    expect(openingStatus(OFFICE, at("16:30")).current).toEqual({ from: "14:00", to: "17:00" });
    // After closing: the next opening is Wednesday 15:00.
    expect(openingStatus(OFFICE, at("17:00"))).toMatchObject({
      open: false,
      next: { date: "2026-11-18", from: "15:00" },
    });
  });

  it("uses Budapest time, not UTC or the process time zone", () => {
    // 08:30 UTC = 09:30 in Budapest (CET): open.
    expect(openingStatus(OFFICE, "2026-11-16T08:30:00Z").open).toBe(true);
    // Sunday 23:30 UTC is already Monday 00:30 in Budapest: closed, opens 09:00 the same day.
    expect(openingStatus(OFFICE, "2026-11-15T23:30:00Z")).toMatchObject({
      today: "2026-11-16",
      open: false,
      next: { date: "2026-11-16", from: "09:00" },
    });
  });

  it("follows the wall clock on the spring-forward day (2026-03-29, 02:00 → 03:00)", () => {
    // Sunday hours 01:00–04:00 local. 00:30Z = 01:30 CET: open.
    expect(openingStatus(OFFICE, "2026-03-29T00:30:00Z").open).toBe(true);
    // 01:30Z = 03:30 CEST (02:00–03:00 does not exist): still open.
    expect(openingStatus(OFFICE, "2026-03-29T01:30:00Z")).toMatchObject({
      today: "2026-03-29",
      open: true,
    });
    // 02:00Z = 04:00 CEST: closed (only two real hours of opening that day).
    expect(openingStatus(OFFICE, "2026-03-29T02:00:00Z").open).toBe(false);
    // The day before, 09:00 Saturday CET → closed; next opening is Sunday 01:00.
    expect(openingStatus(OFFICE, "2026-03-28T08:00:00Z").next).toEqual({
      date: "2026-03-29",
      from: "01:00",
    });
    // Monday after the change, 09:30 CEST = 07:30Z: open.
    expect(openingStatus(OFFICE, "2026-03-30T07:30:00Z").open).toBe(true);
    expect(openingStatus(OFFICE, "2026-03-30T06:30:00Z").open).toBe(false);
  });

  it("follows the wall clock on the fall-back day (2026-10-25, 03:00 → 02:00)", () => {
    // 01:30Z = 02:30 CET (the repeated hour, second pass): open.
    expect(openingStatus(OFFICE, "2026-10-25T01:30:00Z").open).toBe(true);
    // 00:30Z = 02:30 CEST (first pass): open as well.
    expect(openingStatus(OFFICE, "2026-10-25T00:30:00Z").open).toBe(true);
    // 03:00Z = 04:00 CET: closed.
    expect(openingStatus(OFFICE, "2026-10-25T03:00:00Z").open).toBe(false);
    // Monday after the change, 09:30 CET = 08:30Z: open; 07:30Z = 08:30 CET: closed.
    expect(openingStatus(OFFICE, "2026-10-26T08:30:00Z").open).toBe(true);
    expect(openingStatus(OFFICE, "2026-10-26T07:30:00Z").open).toBe(false);
  });

  it("a closed exception makes today closed and moves the next opening past the range", () => {
    const hours = withExceptions([
      { from: "2026-12-24", to: "2027-01-01", closed: true, note: "Téli szünet" },
    ]);
    // Monday 2026-12-28 10:00 would be open regularly.
    const status = openingStatus(hours, "2026-12-28T10:00:00+01:00");
    expect(status.open).toBe(false);
    expect(status.day.exception?.note).toBe("Téli szünet");
    expect(status.next).toEqual({ date: "2027-01-03", from: "01:00" });
  });

  it("reports no next opening when there are no hours at all", () => {
    expect(openingStatus({ weekly: [], exceptions: [] }, "2026-11-16T10:00:00+01:00")).toEqual({
      today: "2026-11-16",
      open: false,
      current: null,
      next: null,
      day: { date: "2026-11-16", weekday: 1, intervals: [], exception: null },
    });
  });
});

describe("weeklyTable", () => {
  it("lists Monday to Sunday with today's weekday marked (Budapest date)", () => {
    // Saturday 23:30 UTC in summer = Sunday 01:30 in Budapest.
    const rows = weeklyTable(OFFICE, "2026-07-04T23:30:00Z");
    expect(rows.map((r) => r.weekday)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(rows.filter((r) => r.isToday).map((r) => r.weekday)).toEqual([7]);
    expect(rows[0]!.intervals).toEqual([
      { from: "09:00", to: "12:00" },
      { from: "14:00", to: "17:00" },
    ]);
    expect(rows[4]!.intervals).toEqual([]);
  });
});

describe("currentAndUpcomingExceptions", () => {
  const past = { from: "2026-07-15", to: "2026-07-31", closed: true };
  const ongoing = { from: "2026-11-10", to: "2026-11-20", closed: false };
  const soon = { from: "2026-12-24", to: "2027-01-01", closed: true };
  const far = { from: "2027-07-15", to: "2027-07-31", closed: true };

  it("keeps ongoing and upcoming exceptions within the horizon, by start date", () => {
    const hours = { exceptions: [soon, far, past, ongoing] };
    expect(currentAndUpcomingExceptions(hours, "2026-11-16T10:00:00+01:00")).toEqual([
      ongoing,
      soon,
    ]);
    expect(currentAndUpcomingExceptions(hours, "2026-11-16T10:00:00+01:00", 365)).toEqual([
      ongoing,
      soon,
      far,
    ]);
    // The last day of a range still counts.
    expect(currentAndUpcomingExceptions(hours, "2026-11-20T23:59:00+01:00")).toContain(ongoing);
    expect(currentAndUpcomingExceptions(hours, "2026-11-21T00:00:00+01:00")).not.toContain(ongoing);
  });
});
