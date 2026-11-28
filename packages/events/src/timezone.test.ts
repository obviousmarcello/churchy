import { afterEach, describe, expect, it } from "vitest";
import { dayWindow, expandEvents, type ExpandableEvent } from "./expand";
import { buildICalendar } from "./ical";
import { describeRecurrence } from "./text";

// The package is runtime-agnostic (no Node types); the test only needs `process.env`.
declare const process: { env: Record<string, string | undefined> };

const base = { endsAt: null, allDay: false, exdates: [], parentEventId: null, recurrenceId: null };
const EVENTS: ExpandableEvent[] = [
  { ...base, id: "a", startsAt: "2026-03-01T02:30:00+01:00", rrule: "FREQ=WEEKLY;BYDAY=SU,WE" },
  { ...base, id: "b", startsAt: "2026-01-02T18:00:00+01:00", rrule: "FREQ=MONTHLY;BYDAY=1FR" },
  {
    ...base,
    id: "c",
    startsAt: "2026-03-27T00:00:00+01:00",
    endsAt: "2026-03-30T00:00:00+02:00",
    allDay: true,
    rrule: "FREQ=YEARLY",
    exdates: ["2027-03-27"],
  },
];

describe("independence from the process time zone", () => {
  const original = process.env.TZ;
  afterEach(() => {
    process.env.TZ = original;
  });

  const snapshot = () =>
    JSON.stringify({
      occurrences: expandEvents(EVENTS, dayWindow("2026-03-01", "2027-03-31")),
      text: describeRecurrence("FREQ=WEEKLY;UNTIL=20261231T233000Z", {
        start: EVENTS[0]!.startsAt,
        withTime: true,
      }),
      ics: buildICalendar({
        events: EVENTS.map(({ status: _status, ...e }) => ({
          ...e,
          uid: e.id,
          updatedAt: e.startsAt,
          summary: e.id,
        })),
      }),
    });

  it.each(["UTC", "America/New_York", "Pacific/Kiritimati", "Asia/Kolkata"])(
    "produces identical results with TZ=%s",
    (zone) => {
      process.env.TZ = "Europe/Budapest";
      expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(-60);
      const budapest = snapshot();
      process.env.TZ = zone;
      expect(new Date(2026, 0, 1).getTimezoneOffset()).not.toBe(-60);
      expect(snapshot()).toBe(budapest);
    },
  );
});
