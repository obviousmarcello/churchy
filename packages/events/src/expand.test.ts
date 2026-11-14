import { describe, expect, it } from "vitest";
import {
  dayWindow,
  expandEvents,
  recurrenceDays,
  upcomingOccurrences,
  type ExpandableEvent,
} from "./expand";
import { parseRRule } from "./rrule";
import { formatDay, parseDay } from "./time";

let seq = 0;
function ev(
  overrides: Partial<ExpandableEvent> & Pick<ExpandableEvent, "startsAt">,
): ExpandableEvent {
  seq++;
  return {
    id: `ev-${seq}`,
    endsAt: null,
    allDay: false,
    rrule: null,
    exdates: [],
    parentEventId: null,
    recurrenceId: null,
    status: "published",
    ...overrides,
  };
}

const starts = (events: ExpandableEvent[], from: string, to: string) =>
  expandEvents(events, dayWindow(from, to)).map((o) => o.start);

describe("single events", () => {
  it("returns a timed event overlapping the window, with Budapest offsets", () => {
    const e = ev({ startsAt: "2026-11-20T17:00:00Z", endsAt: "2026-11-20T19:00:00Z" });
    const [occ, ...rest] = expandEvents([e], dayWindow("2026-11-01", "2026-11-30"));
    expect(rest).toEqual([]);
    expect(occ).toMatchObject({
      start: "2026-11-20T18:00:00+01:00",
      end: "2026-11-20T20:00:00+01:00",
      date: "2026-11-20",
      lastDate: "2026-11-20",
      allDay: false,
      seriesId: null,
      recurrenceId: null,
      isOverride: false,
    });
    expect(expandEvents([e], dayWindow("2026-11-21", "2026-11-30"))).toEqual([]);
  });

  it("includes events in progress at the window start and zero-length events", () => {
    const running = ev({
      startsAt: "2026-11-19T22:00:00+01:00",
      endsAt: "2026-11-20T02:00:00+01:00",
    });
    const point = ev({ startsAt: "2026-11-20T00:00:00+01:00" });
    const out = expandEvents([running, point], dayWindow("2026-11-20", "2026-11-20"));
    expect(out.map((o) => o.event.id)).toEqual([running.id, point.id]);
    expect(out[0]!.lastDate).toBe("2026-11-20");
    // An event ending exactly at the window start does not overlap it.
    const ended = ev({
      startsAt: "2026-11-19T22:00:00+01:00",
      endsAt: "2026-11-20T00:00:00+01:00",
    });
    expect(expandEvents([ended], dayWindow("2026-11-20", "2026-11-20"))).toEqual([]);
    expect(expandEvents([ended], dayWindow("2026-11-19", "2026-11-19"))[0]!.lastDate).toBe(
      "2026-11-19",
    );
  });

  it("expands all-day and multi-day all-day events by civil days", () => {
    const day = ev({ startsAt: "2026-12-24T00:00:00+01:00", endsAt: null, allDay: true });
    const camp = ev({
      startsAt: "2026-07-13T00:00:00+02:00",
      endsAt: "2026-07-18T00:00:00+02:00",
      allDay: true,
    });
    const [d] = expandEvents([day], dayWindow("2026-12-01", "2026-12-31"));
    expect(d).toMatchObject({
      start: "2026-12-24T00:00:00+01:00",
      end: "2026-12-25T00:00:00+01:00",
      date: "2026-12-24",
      lastDate: "2026-12-24",
      allDay: true,
    });
    const [c] = expandEvents([camp], dayWindow("2026-07-16", "2026-07-16"));
    expect(c).toMatchObject({ date: "2026-07-13", lastDate: "2026-07-17" });
  });

  it("skips cancelled events", () => {
    const e = ev({ startsAt: "2026-11-20T18:00:00+01:00", status: "cancelled" });
    expect(expandEvents([e], dayWindow("2026-11-01", "2026-11-30"))).toEqual([]);
  });

  it("degrades an unparseable rule to a single event", () => {
    const e = ev({ startsAt: "2026-11-20T18:00:00+01:00", rrule: "FREQ=HOURLY" });
    expect(starts([e], "2026-11-01", "2026-12-31")).toEqual(["2026-11-20T18:00:00+01:00"]);
  });
});

describe("recurring events", () => {
  it("weekly on several days, starting with DTSTART", () => {
    const e = ev({
      startsAt: "2026-11-03T18:00:00+01:00", // Tuesday
      endsAt: "2026-11-03T19:30:00+01:00",
      rrule: "FREQ=WEEKLY;BYDAY=TU,TH",
    });
    expect(starts([e], "2026-11-01", "2026-11-15")).toEqual([
      "2026-11-03T18:00:00+01:00",
      "2026-11-05T18:00:00+01:00",
      "2026-11-10T18:00:00+01:00",
      "2026-11-12T18:00:00+01:00",
    ]);
    const occ = expandEvents([e], dayWindow("2026-11-05", "2026-11-05"))[0]!;
    expect(occ).toMatchObject({
      seriesId: e.id,
      recurrenceId: "2026-11-05T18:00:00+01:00",
      end: "2026-11-05T19:30:00+01:00",
    });
  });

  it("monthly on the first Friday and on the last Sunday", () => {
    const first = ev({ startsAt: "2026-01-02T18:00:00+01:00", rrule: "FREQ=MONTHLY;BYDAY=1FR" });
    expect(starts([first], "2026-10-01", "2027-01-31")).toEqual([
      "2026-10-02T18:00:00+02:00",
      "2026-11-06T18:00:00+01:00",
      "2026-12-04T18:00:00+01:00",
      "2027-01-01T18:00:00+01:00",
    ]);
    const last = ev({ startsAt: "2026-01-25T10:00:00+01:00", rrule: "FREQ=MONTHLY;BYDAY=-1SU" });
    expect(starts([last], "2026-09-01", "2026-12-31")).toEqual([
      "2026-09-27T10:00:00+02:00",
      "2026-10-25T10:00:00+01:00", // DST ended that night
      "2026-11-29T10:00:00+01:00",
      "2026-12-27T10:00:00+01:00",
    ]);
  });

  it("monthly on the 1st and 3rd Friday, the 31st (short months skipped) and the last day", () => {
    const twice = ev({
      startsAt: "2026-11-06T19:00:00+01:00",
      rrule: "FREQ=MONTHLY;BYDAY=1FR,3FR",
    });
    expect(starts([twice], "2026-11-01", "2026-12-31").map((s) => s.slice(0, 10))).toEqual([
      "2026-11-06",
      "2026-11-20",
      "2026-12-04",
      "2026-12-18",
    ]);
    const d31 = ev({ startsAt: "2026-01-31T09:00:00+01:00", rrule: "FREQ=MONTHLY" });
    expect(starts([d31], "2026-01-01", "2026-06-30").map((s) => s.slice(0, 10))).toEqual([
      "2026-01-31",
      "2026-03-31",
      "2026-05-31",
    ]);
    const lastDay = ev({
      startsAt: "2026-01-31T09:00:00+01:00",
      rrule: "FREQ=MONTHLY;BYMONTHDAY=-1",
    });
    expect(starts([lastDay], "2026-01-01", "2026-04-30").map((s) => s.slice(0, 10))).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });

  it("BYSETPOS: the last workday of the month", () => {
    const e = ev({
      startsAt: "2026-10-30T16:00:00+01:00",
      rrule: "FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1",
    });
    expect(starts([e], "2026-10-01", "2027-01-31").map((s) => s.slice(0, 10))).toEqual([
      "2026-10-30",
      "2026-11-30",
      "2026-12-31",
      "2027-01-29",
    ]);
  });

  it("daily, every other day and every other week (WKST respected)", () => {
    const daily = ev({ startsAt: "2026-11-28T07:00:00+01:00", rrule: "FREQ=DAILY;COUNT=3" });
    expect(starts([daily], "2026-11-01", "2026-12-31").map((s) => s.slice(0, 10))).toEqual([
      "2026-11-28",
      "2026-11-29",
      "2026-11-30",
    ]);
    const other = ev({ startsAt: "2026-11-28T07:00:00+01:00", rrule: "FREQ=DAILY;INTERVAL=2" });
    expect(starts([other], "2026-11-28", "2026-12-04").map((s) => s.slice(0, 10))).toEqual([
      "2026-11-28",
      "2026-11-30",
      "2026-12-02",
      "2026-12-04",
    ]);
    const filtered = ev({
      startsAt: "2026-11-30T07:00:00+01:00",
      rrule: "FREQ=DAILY;BYDAY=MO,FR;BYMONTH=12;BYMONTHDAY=4,7,11",
    });
    expect(starts([filtered], "2026-11-30", "2026-12-31").map((s) => s.slice(0, 10))).toEqual([
      "2026-11-30",
      "2026-12-04",
      "2026-12-07",
      "2026-12-11",
    ]);
    // RFC 5545 example: every other week on Tuesday and Sunday, WKST=MO vs WKST=SU.
    const mo = ev({
      startsAt: "1997-08-05T09:00:00+02:00",
      rrule: "FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU;WKST=MO",
    });
    const su = ev({
      startsAt: "1997-08-05T09:00:00+02:00",
      rrule: "FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU;WKST=SU",
    });
    expect(starts([mo], "1997-08-01", "1997-09-30").map((s) => s.slice(0, 10))).toEqual([
      "1997-08-05",
      "1997-08-10",
      "1997-08-19",
      "1997-08-24",
    ]);
    expect(starts([su], "1997-08-01", "1997-09-30").map((s) => s.slice(0, 10))).toEqual([
      "1997-08-05",
      "1997-08-17",
      "1997-08-19",
      "1997-08-31",
    ]);
  });

  it("weekly limited to some months", () => {
    const e = ev({
      startsAt: "2026-07-05T08:00:00+02:00",
      rrule: "FREQ=WEEKLY;BYDAY=SU;BYMONTH=7",
    });
    expect(starts([e], "2026-07-01", "2027-07-12").map((s) => s.slice(0, 10))).toEqual([
      "2026-07-05",
      "2026-07-12",
      "2026-07-19",
      "2026-07-26",
      "2027-07-04",
      "2027-07-11",
    ]);
  });

  it("yearly: fixed date, leap day, nth weekday of a month and of the year", () => {
    const fixed = ev({ startsAt: "2020-03-15T10:00:00+01:00", rrule: "FREQ=YEARLY" });
    expect(starts([fixed], "2026-01-01", "2026-12-31")).toEqual(["2026-03-15T10:00:00+01:00"]);
    const leap = ev({ startsAt: "2024-02-29T10:00:00+01:00", rrule: "FREQ=YEARLY" });
    expect(starts([leap], "2025-01-01", "2025-12-31")).toEqual([]);
    expect(starts([leap], "2028-01-01", "2028-12-31")).toEqual(["2028-02-29T10:00:00+01:00"]);
    const mothers = ev({
      startsAt: "2026-05-03T09:00:00+02:00",
      rrule: "FREQ=YEARLY;BYMONTH=5;BYDAY=1SU",
    });
    expect(starts([mothers], "2027-01-01", "2027-12-31")).toEqual(["2027-05-02T09:00:00+02:00"]);
    const yearDay = ev({ startsAt: "2026-01-04T09:00:00+01:00", rrule: "FREQ=YEARLY;BYDAY=1SU" });
    expect(starts([yearDay], "2027-01-01", "2027-12-31")).toEqual(["2027-01-03T09:00:00+01:00"]);
    const months = ev({ startsAt: "2026-03-15T09:00:00+01:00", rrule: "FREQ=YEARLY;BYMONTH=3,9" });
    expect(starts([months], "2026-01-01", "2026-12-31").map((s) => s.slice(0, 10))).toEqual([
      "2026-03-15",
      "2026-09-15",
    ]);
    const monthDays = ev({
      startsAt: "2026-01-01T09:00:00+01:00",
      rrule: "FREQ=YEARLY;BYMONTHDAY=1;COUNT=3",
    });
    expect(starts([monthDays], "2026-01-01", "2026-12-31").map((s) => s.slice(0, 10))).toEqual([
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
    ]);
    const lastFriday = ev({
      startsAt: "2026-12-25T09:00:00+01:00",
      rrule: "FREQ=YEARLY;BYDAY=-1FR;INTERVAL=2",
    });
    expect(starts([lastFriday], "2027-01-01", "2027-12-31")).toEqual([]);
    expect(starts([lastFriday], "2028-01-01", "2028-12-31").map((s) => s.slice(0, 10))).toEqual([
      "2028-12-29",
    ]);
  });

  it("counts DTSTART as the first occurrence even when it does not match the rule", () => {
    const e = ev({
      startsAt: "2026-11-04T18:00:00+01:00",
      rrule: "FREQ=MONTHLY;BYDAY=1FR;COUNT=2",
    });
    expect(starts([e], "2026-11-01", "2027-03-31").map((s) => s.slice(0, 10))).toEqual([
      "2026-11-04",
      "2026-11-06",
    ]);
  });

  it("COUNT counts exdated occurrences; UNTIL is inclusive", () => {
    const counted = ev({
      startsAt: "2026-11-02T18:00:00+01:00",
      rrule: "FREQ=WEEKLY;COUNT=3",
      exdates: ["2026-11-09"],
    });
    expect(starts([counted], "2026-11-01", "2026-12-31").map((s) => s.slice(0, 10))).toEqual([
      "2026-11-02",
      "2026-11-16",
    ]);
    const untilUtc = ev({
      startsAt: "2026-11-02T18:00:00+01:00",
      rrule: "FREQ=WEEKLY;UNTIL=20261116T170000Z",
    });
    expect(starts([untilUtc], "2026-11-01", "2026-12-31")).toHaveLength(3);
    const untilDate = ev({
      startsAt: "2026-11-02T18:00:00+01:00",
      rrule: "FREQ=WEEKLY;UNTIL=20261116",
    });
    expect(starts([untilDate], "2026-11-01", "2026-12-31")).toHaveLength(3);
    const untilLocal = ev({
      startsAt: "2026-11-02T18:00:00+01:00",
      rrule: "FREQ=WEEKLY;UNTIL=20261116T175959",
    });
    expect(starts([untilLocal], "2026-11-01", "2026-12-31")).toHaveLength(2);
    const allDay = ev({
      startsAt: "2026-11-02T00:00:00+01:00",
      allDay: true,
      rrule: "FREQ=WEEKLY;UNTIL=20261116",
    });
    expect(starts([allDay], "2026-11-01", "2026-12-31")).toHaveLength(3);
    const allDayUtc = ev({
      startsAt: "2026-11-02T00:00:00+01:00",
      allDay: true,
      rrule: "FREQ=WEEKLY;UNTIL=20261115T230000Z",
    });
    expect(starts([allDayUtc], "2026-11-01", "2026-12-31")).toHaveLength(3);
  });

  it("exdates remove occurrences by Budapest date; invalid exdates are ignored", () => {
    const e = ev({
      startsAt: "2026-11-03T18:00:00+01:00",
      rrule: "FREQ=WEEKLY",
      exdates: ["2026-11-10", "2026-02-30"],
    });
    expect(starts([e], "2026-11-01", "2026-11-20").map((s) => s.slice(0, 10))).toEqual([
      "2026-11-03",
      "2026-11-17",
    ]);
  });

  it("all-day recurring events keep their number of days", () => {
    const e = ev({
      startsAt: "2026-03-27T00:00:00+01:00",
      endsAt: "2026-03-29T00:00:00+01:00",
      allDay: true,
      rrule: "FREQ=YEARLY",
    });
    const [occ] = expandEvents([e], dayWindow("2027-03-01", "2027-03-31"));
    expect(occ).toMatchObject({
      start: "2027-03-27T00:00:00+01:00",
      end: "2027-03-29T00:00:00+02:00", // across the spring-forward night
      date: "2027-03-27",
      lastDate: "2027-03-28",
    });
  });
});

describe("single-occurrence overrides", () => {
  const master = ev({
    id: "master",
    startsAt: "2026-11-01T11:30:00+01:00",
    endsAt: "2026-11-01T13:00:00+01:00",
    rrule: "FREQ=MONTHLY;BYDAY=1SU",
  });

  it("a moved occurrence replaces the original one", () => {
    const moved = ev({
      id: "master-m",
      startsAt: "2026-12-06T12:30:00+01:00",
      endsAt: "2026-12-06T14:00:00+01:00",
      parentEventId: "master",
      recurrenceId: "2026-12-06T10:30:00Z",
    });
    const out = expandEvents([master, moved], dayWindow("2026-11-01", "2027-01-31"));
    expect(out.map((o) => [o.event.id, o.start])).toEqual([
      ["master", "2026-11-01T11:30:00+01:00"],
      ["master-m", "2026-12-06T12:30:00+01:00"],
      ["master", "2027-01-03T11:30:00+01:00"],
    ]);
    expect(out[1]).toMatchObject({
      seriesId: "master",
      isOverride: true,
      recurrenceId: "2026-12-06T11:30:00+01:00",
    });
  });

  it("a cancelled override removes the occurrence; orphans stand alone", () => {
    const cancelled = ev({
      startsAt: "2026-12-06T11:30:00+01:00",
      parentEventId: "master",
      recurrenceId: "2026-12-06T11:30:00+01:00",
      status: "cancelled",
    });
    expect(starts([master, cancelled], "2026-12-01", "2026-12-31")).toEqual([]);
    const orphan = ev({
      startsAt: "2026-12-06T12:30:00+01:00",
      parentEventId: "gone",
      recurrenceId: null,
    });
    const [occ] = expandEvents([orphan], dayWindow("2026-12-01", "2026-12-31"));
    expect(occ).toMatchObject({ seriesId: "gone", recurrenceId: null, isOverride: true });
  });
});

describe("DST weekends (Europe/Budapest)", () => {
  // Spring forward: 2027-03-28 02:00 → 03:00. Fall back: 2026-10-25 03:00 → 02:00.
  it("keeps the wall-clock time across both changes", () => {
    const e = ev({
      startsAt: "2026-10-24T18:00:00+02:00",
      endsAt: "2026-10-24T19:00:00+02:00",
      rrule: "FREQ=DAILY",
    });
    expect(starts([e], "2026-10-24", "2026-10-26")).toEqual([
      "2026-10-24T18:00:00+02:00",
      "2026-10-25T18:00:00+01:00",
      "2026-10-26T18:00:00+01:00",
    ]);
    const spring = ev({ startsAt: "2027-03-27T09:00:00+01:00", rrule: "FREQ=DAILY;COUNT=3" });
    expect(starts([spring], "2027-03-27", "2027-03-29")).toEqual([
      "2027-03-27T09:00:00+01:00",
      "2027-03-28T09:00:00+02:00",
      "2027-03-29T09:00:00+02:00",
    ]);
  });

  it("shifts a non-existent time forward and picks summer time for an ambiguous one", () => {
    const night = ev({ startsAt: "2027-03-21T02:30:00+01:00", rrule: "FREQ=WEEKLY;COUNT=2" });
    expect(starts([night], "2027-03-21", "2027-03-31")).toEqual([
      "2027-03-21T02:30:00+01:00",
      "2027-03-28T03:30:00+02:00",
    ]);
    const autumn = ev({ startsAt: "2026-10-18T02:30:00+02:00", rrule: "FREQ=WEEKLY;COUNT=3" });
    expect(starts([autumn], "2026-10-18", "2026-11-30")).toEqual([
      "2026-10-18T02:30:00+02:00",
      "2026-10-25T02:30:00+02:00",
      "2026-11-01T02:30:00+01:00",
    ]);
  });

  it("keeps the exact duration of an event spanning the change", () => {
    const vigil = ev({
      startsAt: "2026-10-17T22:00:00+02:00",
      endsAt: "2026-10-18T06:00:00+02:00", // 8 hours
      rrule: "FREQ=WEEKLY;COUNT=2",
    });
    const [, second] = expandEvents([vigil], dayWindow("2026-10-17", "2026-10-31"));
    expect(second).toMatchObject({
      start: "2026-10-24T22:00:00+02:00",
      end: "2026-10-25T05:00:00+01:00",
      lastDate: "2026-10-25",
    });
  });

  it("all-day occurrences on DST Sundays are whole local days", () => {
    const sunday = ev({
      startsAt: "2026-10-18T00:00:00+02:00",
      allDay: true,
      rrule: "FREQ=WEEKLY;BYDAY=SU",
    });
    const out = expandEvents([sunday], dayWindow("2026-10-25", "2026-10-25"));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      start: "2026-10-25T00:00:00+02:00",
      end: "2026-10-26T00:00:00+01:00",
      lastDate: "2026-10-25",
    });
    expect(out[0]!.endMs - out[0]!.startMs).toBe(25 * 3_600_000);
  });
});

describe("windows and helpers", () => {
  it("rejects reversed and over-long windows, but allows 400 days across DST", () => {
    const e = ev({ startsAt: "2026-11-20T18:00:00+01:00" });
    expect(() =>
      expandEvents([e], { from: "2026-11-02T00:00:00+01:00", to: "2026-11-01T00:00:00+01:00" }),
    ).toThrow(RangeError);
    expect(() => expandEvents([e], dayWindow("2026-01-01", "2027-03-01"))).toThrow(/400/);
    expect(() => expandEvents([e], dayWindow("2026-01-01", "2027-02-04"))).not.toThrow();
    expect(() => expandEvents([e], { from: "2026-11-01", to: "2026-11-30" })).toThrow(RangeError);
  });

  it("sorts by start, then by event id", () => {
    const b = ev({ id: "b", startsAt: "2026-11-20T18:00:00+01:00" });
    const a = ev({ id: "a", startsAt: "2026-11-20T18:00:00+01:00" });
    const early = ev({ id: "z", startsAt: "2026-11-20T08:00:00+01:00" });
    expect(
      expandEvents([b, a, early], dayWindow("2026-11-20", "2026-11-20")).map((o) => o.event.id),
    ).toEqual(["z", "a", "b"]);
  });

  it("upcomingOccurrences returns the next n, in progress included", () => {
    const e = ev({
      startsAt: "2026-11-03T18:00:00+01:00",
      endsAt: "2026-11-03T20:00:00+01:00",
      rrule: "FREQ=WEEKLY",
    });
    const next = upcomingOccurrences([e], "2026-11-10T19:00:00+01:00", 3);
    expect(next.map((o) => o.date)).toEqual(["2026-11-10", "2026-11-17", "2026-11-24"]);
  });

  it("recurrenceDays stops for rules that never match", () => {
    const rule = parseRRule("FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30");
    const days = [...recurrenceDays(rule, parseDay("2026-01-30"), parseDay("2036-01-01"))];
    expect(days.map(formatDay)).toEqual(["2026-01-30"]);
  });
});
