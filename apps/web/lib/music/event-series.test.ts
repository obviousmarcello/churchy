import { describe, expect, it } from "vitest";

import {
  MAX_SERIES_EVENTS,
  periodEnd,
  planEventSeries,
  toDayString,
  type SeriesSlot,
} from "./event-series";

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const SERVICE: SeriesSlot = { title: "Sunday service", time: "10:00", durationMinutes: 90 };

// Local day and time, so the tests pass in any time zone.
const local = (event: { startsAt: Date }) =>
  `${toDayString(event.startsAt)} ${String(event.startsAt.getHours()).padStart(2, "0")}:${String(event.startsAt.getMinutes()).padStart(2, "0")}`;

describe("planEventSeries", () => {
  it("adds an event on each Sunday for three months", () => {
    const events = planEventSeries({
      from: "2026-10-11",
      until: periodEnd("2026-10-11", { months: 3 }),
      weekdays: [0],
      slots: [SERVICE],
    });
    expect(events).toHaveLength(14);
    expect(events.every((event) => event.startsAt.getDay() === 0)).toBe(true);
    expect(local(events[0]!)).toBe("2026-10-11 10:00");
    expect(local(events.at(-1)!)).toBe("2027-01-10 10:00");
    expect(events[0]).toMatchObject({ title: "Sunday service", durationMinutes: 90 });
  });

  it("adds an event on each day for two weeks", () => {
    const events = planEventSeries({
      from: "2026-10-11",
      until: periodEnd("2026-10-11", { days: 14 }),
      weekdays: EVERY_DAY,
      slots: [SERVICE],
    });
    expect(events).toHaveLength(14);
    expect(local(events.at(-1)!)).toBe("2026-10-24 10:00");
  });

  it("adds a morning and an evening event on each day, by start time", () => {
    const slots = [
      { title: "Evening", time: "18:30", durationMinutes: 60 },
      { title: "Morning", time: "08:00", durationMinutes: 45 },
    ];
    const events = planEventSeries({
      from: "2026-10-11",
      until: periodEnd("2026-10-11", { days: 10 }),
      weekdays: EVERY_DAY,
      slots,
    });
    expect(events).toHaveLength(20);
    expect(events.slice(0, 3).map((event) => `${local(event)} ${event.title}`)).toEqual([
      "2026-10-11 08:00 Morning",
      "2026-10-11 18:30 Evening",
      "2026-10-12 08:00 Morning",
    ]);
  });

  it("keeps the local time of day across a daylight saving time change", () => {
    const events = planEventSeries({
      from: "2026-03-20",
      until: "2026-04-05",
      weekdays: [0],
      slots: [SERVICE],
    });
    expect(events.map(local)).toEqual(["2026-03-22 10:00", "2026-03-29 10:00", "2026-04-05 10:00"]);
  });

  it("is empty without days, weekdays or valid times", () => {
    const plan = { from: "2026-10-11", until: "2026-10-20", weekdays: EVERY_DAY, slots: [SERVICE] };
    expect(planEventSeries({ ...plan, from: "" })).toEqual([]);
    expect(planEventSeries({ ...plan, until: "2026-10-10" })).toEqual([]);
    expect(planEventSeries({ ...plan, until: "2026-02-30" })).toEqual([]);
    expect(planEventSeries({ ...plan, weekdays: [] })).toEqual([]);
    expect(planEventSeries({ ...plan, slots: [{ ...SERVICE, time: "" }] })).toEqual([]);
    expect(planEventSeries({ ...plan, slots: [{ ...SERVICE, time: "24:00" }] })).toEqual([]);
  });

  it("stops after one event more than the limit", () => {
    const events = planEventSeries({
      from: "2026-01-01",
      until: "2036-01-01",
      weekdays: EVERY_DAY,
      slots: [SERVICE],
    });
    expect(events).toHaveLength(MAX_SERIES_EVENTS + 1);
  });
});

describe("periodEnd", () => {
  it("ends the day before the same day of the later month", () => {
    expect(periodEnd("2026-10-11", { months: 1 })).toBe("2026-11-10");
    expect(periodEnd("2026-11-01", { months: 3 })).toBe("2027-01-31");
    expect(periodEnd("2026-11-30", { months: 3 })).toBe("2027-02-28");
  });

  it("counts the first day in a period of days", () => {
    expect(periodEnd("2026-10-11", { days: 1 })).toBe("2026-10-11");
    expect(periodEnd("2026-10-25", { days: 10 })).toBe("2026-11-03");
  });

  it("is empty without a valid first day", () => {
    expect(periodEnd("", { days: 7 })).toBe("");
  });
});
