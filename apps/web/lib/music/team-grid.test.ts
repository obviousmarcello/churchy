import { describe, expect, it } from "vitest";

import {
  bookingKey,
  doubleBookings,
  emptyCounts,
  gridTable,
  isAreaUsed,
  MAX_RANGE_DAYS,
  parseRange,
  presetOf,
  rangeBounds,
  rangeDays,
  rangePresets,
  UNUSED_CELL,
} from "./team-grid";

describe("rangePresets", () => {
  it("gives the next weeks and months, this month and the previous month", () => {
    expect(rangePresets("2026-01-15")).toEqual({
      next4Weeks: { from: "2026-01-15", until: "2026-02-11" },
      next3Months: { from: "2026-01-15", until: "2026-04-14" },
      thisMonth: { from: "2026-01-01", until: "2026-01-31" },
      previousMonth: { from: "2025-12-01", until: "2025-12-31" },
    });
  });

  it("finds the preset of a timeframe", () => {
    expect(presetOf({ from: "2026-01-01", until: "2026-01-31" }, "2026-01-15")).toBe("thisMonth");
    expect(presetOf({ from: "2026-01-02", until: "2026-01-31" }, "2026-01-15")).toBeNull();
  });
});

describe("parseRange", () => {
  const today = "2026-11-04";

  it("keeps a good timeframe", () => {
    expect(parseRange({ from: "2026-11-01", until: "2026-11-30" }, today)).toEqual({
      from: "2026-11-01",
      until: "2026-11-30",
    });
    expect(parseRange({ from: "2026-11-01", until: "2026-11-01" }, today)).toEqual({
      from: "2026-11-01",
      until: "2026-11-01",
    });
  });

  it("gives the next 4 weeks without a good start", () => {
    for (const from of [undefined, "", "2026-02-30", "tomorrow", ["2026-11-01"]]) {
      expect(parseRange({ from, until: "2026-12-01" }, today)).toEqual(
        rangePresets(today).next4Weeks,
      );
    }
  });

  it("gives 4 weeks from the start without a good end", () => {
    for (const until of [undefined, "2026-10-31", "2026-13-01"]) {
      expect(parseRange({ from: "2026-11-01", until }, today)).toEqual({
        from: "2026-11-01",
        until: "2026-11-28",
      });
    }
  });

  it("shortens a long timeframe", () => {
    const range = parseRange({ from: "2026-01-01", until: "2028-01-01" }, today);
    expect(range).toEqual({ from: "2026-01-01", until: "2027-01-01" });
    expect(rangeDays(range)).toBe(MAX_RANGE_DAYS);
  });
});

describe("rangeBounds", () => {
  it("gives the start of the first day and the end of the last day in the time zone of the church", () => {
    expect(rangeBounds({ from: "2026-11-01", until: "2026-11-30" })).toEqual({
      start: "2026-10-31T23:00:00.000Z",
      end: "2026-11-30T23:00:00.000Z",
    });
    // Summer time ends on 2026-10-25.
    expect(rangeBounds({ from: "2026-10-25", until: "2026-10-25" })).toEqual({
      start: "2026-10-24T22:00:00.000Z",
      end: "2026-10-25T23:00:00.000Z",
    });
  });
});

describe("doubleBookings", () => {
  const morning = {
    id: "morning",
    startsAt: "2026-11-08T09:00:00Z",
    endsAt: "2026-11-08T11:00:00Z",
  };
  const overlapping = {
    id: "overlapping",
    startsAt: "2026-11-08T10:30:00Z",
    endsAt: "2026-11-08T12:00:00Z",
  };
  const afterwards = {
    id: "afterwards",
    startsAt: "2026-11-08T11:00:00Z",
    endsAt: "2026-11-08T13:00:00Z",
  };

  it("finds a user in two areas of an event", () => {
    const result = doubleBookings([morning], {
      morning: { music: ["anna", "bela"], sound: ["anna"] },
    });
    expect(Object.fromEntries(result)).toEqual({
      [bookingKey("morning", "music", "anna")]: [{ kind: "area", areaId: "sound" }],
      [bookingKey("morning", "sound", "anna")]: [{ kind: "area", areaId: "music" }],
    });
  });

  it("finds a user in two events that overlap, and not in events one after the other", () => {
    const result = doubleBookings([afterwards, overlapping, morning], {
      morning: { music: ["anna", "bela"] },
      overlapping: { sound: ["anna"] },
      afterwards: { music: ["anna", "bela"] },
    });
    expect(Object.fromEntries(result)).toEqual({
      [bookingKey("morning", "music", "anna")]: [{ kind: "event", eventId: "overlapping" }],
      [bookingKey("overlapping", "sound", "anna")]: [
        { kind: "event", eventId: "morning" },
        { kind: "event", eventId: "afterwards" },
      ],
      [bookingKey("afterwards", "music", "anna")]: [{ kind: "event", eventId: "overlapping" }],
    });
  });

  it("finds nothing in empty cells", () => {
    expect(doubleBookings([morning, overlapping], {}).size).toBe(0);
  });
});

describe("emptyCounts", () => {
  it("counts the events without users and without a text in each area", () => {
    const events = [
      { id: "a", template: null },
      { id: "b", template: null },
      { id: "c", template: null },
    ];
    const areas = [{ id: "music" }, { id: "sound" }];
    expect(
      emptyCounts(events, areas, { a: { music: ["anna"], sound: [] }, b: { music: ["bela"] } }),
    ).toEqual({ music: 1, sound: 3 });
    expect(
      emptyCounts(
        events,
        areas,
        { a: { music: ["anna"] } },
        { b: { music: "Sign up at Gábor" }, c: { sound: "Ask Anna" } },
      ),
    ).toEqual({
      music: 1,
      sound: 2,
    });
  });

  it("does not count the areas that the template of an event leaves out", () => {
    const events = [
      { id: "morning", template: { name: "Morning", areaIds: ["music", "prayer"] } },
      { id: "afternoon", template: { name: "Afternoon", areaIds: ["music"] } },
      { id: "other", template: null },
    ];
    const areas = [{ id: "music" }, { id: "prayer" }];
    expect(emptyCounts(events, areas, {})).toEqual({ music: 3, prayer: 2 });
    expect(isAreaUsed(events[1]!, "prayer")).toBe(false);
    expect(isAreaUsed(events[2]!, "prayer")).toBe(true);
  });
});

describe("gridTable", () => {
  it("gives the names, the texts, the unused cells and the notes", () => {
    const table = gridTable(
      {
        events: [
          {
            id: "morning",
            title: "Morning service",
            startsAt: "2026-11-08T09:00:00Z",
            template: null,
          },
          {
            id: "afternoon",
            title: "Afternoon service",
            startsAt: "2026-11-08T15:00:00Z",
            template: { name: "Afternoon", areaIds: ["music"] },
          },
        ],
        areas: [
          { id: "music", name: "Music" },
          { id: "prayer", name: "Prayer" },
        ],
        cells: { morning: { music: ["anna", "bela"] } },
        notes: { afternoon: { music: "Sign up at Gábor" } },
        eventNotes: { morning: "Baptism" },
      },
      {
        date: (instant) => instant.slice(0, 10),
        name: (id) => id.toUpperCase(),
        labels: { date: "Date", event: "Event", note: "Note" },
      },
    );
    expect(table).toEqual({
      header: ["Date", "Event", "Music", "Prayer", "Note"],
      rows: [
        ["2026-11-08", "Morning service", "ANNA, BELA", "", "Baptism"],
        ["2026-11-08", "Afternoon service", "Sign up at Gábor", UNUSED_CELL, ""],
      ],
    });
  });
});
