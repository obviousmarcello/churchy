import { describe, expect, it } from "vitest";

import { nextWeekStart, splitEventsByTime } from "./event-time";

const event = (id: string, startsAt: string, endsAt: string) => ({ id, startsAt, endsAt });

describe("splitEventsByTime", () => {
  const events = [
    event("past-late", "2026-10-05T10:00:00Z", "2026-10-05T11:00:00Z"),
    event("next", "2026-10-20T10:00:00Z", "2026-10-20T11:00:00Z"),
    event("now", "2026-10-13T09:00:00Z", "2026-10-13T11:00:00Z"),
    event("past-early", "2026-10-01T10:00:00Z", "2026-10-01T11:00:00Z"),
  ];
  const now = Date.parse("2026-10-13T10:00:00Z");

  it("puts upcoming events earliest first, with the running one marked", () => {
    const { upcoming } = splitEventsByTime(events, now);
    expect(upcoming.map((e) => [e.id, e.hasStarted])).toEqual([
      ["now", true],
      ["next", false],
    ]);
  });

  it("puts past events latest first", () => {
    expect(splitEventsByTime(events, now).past.map((e) => e.id)).toEqual([
      "past-late",
      "past-early",
    ]);
  });

  it("moves an event to the past when the time passes, e.g. for an old copy", () => {
    const later = Date.parse("2026-10-21T00:00:00Z");
    expect(splitEventsByTime(events, later).upcoming).toEqual([]);
  });
});

describe("nextWeekStart", () => {
  const start = "2026-10-11T08:30:00.000Z";
  const local = (iso: string) => {
    const date = new Date(iso);
    return [date.getDay(), date.getHours(), date.getMinutes()];
  };

  it("gives the same weekday and time of day one week later", () => {
    const next = nextWeekStart(start, Date.parse("2026-10-12T00:00:00Z"));
    expect(local(next)).toEqual(local(start));
    const days = (Date.parse(next) - Date.parse(start)) / (24 * 60 * 60 * 1000);
    // 7 days, or one hour more or less across a change to or from summer time.
    expect(Math.abs(days - 7)).toBeLessThanOrEqual(1 / 24);
  });

  it("skips the weeks that are not after now, e.g. for an old event", () => {
    const now = Date.parse("2026-12-01T00:00:00Z");
    const next = nextWeekStart(start, now);
    expect(Date.parse(next)).toBeGreaterThan(now);
    expect(Date.parse(next) - now).toBeLessThanOrEqual(7 * 24 * 60 * 60 * 1000);
    expect(local(next)).toEqual(local(start));
  });
});
