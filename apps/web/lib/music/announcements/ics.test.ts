import { describe, expect, it } from "vitest";

import {
  CalendarBudgetError,
  CalendarParseError,
  firstUrl,
  MAX_CALENDAR_OCCURRENCES,
  parseCalendar,
  plainText,
} from "./ics";

const CALENDAR = "00000000-0000-4000-8000-000000000001";

// As Google exports a calendar: a time zone, a repeating entry with an
// excluded date and a moved occurrence, an entry of all day, an entry of
// more days, a cancelled one and an entry in UTC with an HTML description.
const GOOGLE = `BEGIN:VCALENDAR
PRODID:-//Google Inc//Google Calendar 70.9054//EN
VERSION:2.0
CALSCALE:GREGORIAN
X-WR-TIMEZONE:Europe/Budapest
BEGIN:VTIMEZONE
TZID:Europe/Budapest
X-LIC-LOCATION:Europe/Budapest
BEGIN:DAYLIGHT
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
TZNAME:CEST
DTSTART:19700329T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
TZNAME:CET
DTSTART:19701025T030000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
DTSTART;TZID=Europe/Budapest:20260904T180000
DTEND;TZID=Europe/Budapest:20260904T200000
RRULE:FREQ=WEEKLY;BYDAY=FR
EXDATE;TZID=Europe/Budapest:20261030T180000
UID:youth@google.com
SUMMARY:Youth group
LOCATION:Small hall
END:VEVENT
BEGIN:VEVENT
DTSTART;TZID=Europe/Budapest:20261107T170000
DTEND;TZID=Europe/Budapest:20261107T190000
RECURRENCE-ID;TZID=Europe/Budapest:20261106T180000
UID:youth@google.com
SUMMARY:Youth group (Saturday)
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20261101
DTEND;VALUE=DATE:20261102
UID:all-saints@google.com
SUMMARY:All Saints
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20261113
DTEND;VALUE=DATE:20261116
UID:camp@google.com
SUMMARY:Camp
DESCRIPTION:Register: <a href="https://example.com/camp?a=1&amp;b=2">here</a><br>Bring a <b>sleeping bag</b>.
END:VEVENT
BEGIN:VEVENT
DTSTART:20261028T170000Z
DTEND:20261028T180000Z
UID:cancelled@google.com
STATUS:CANCELLED
SUMMARY:Cancelled
END:VEVENT
BEGIN:VEVENT
DTSTART:20261028T170000Z
DTEND:20261028T183000Z
UID:prayer@google.com
SUMMARY:Prayer meeting
END:VEVENT
BEGIN:VEVENT
DTSTART:20270115T170000Z
UID:later@google.com
SUMMARY:Too late
END:VEVENT
END:VCALENDAR`;

describe("parseCalendar", () => {
  const entries = parseCalendar(GOOGLE, CALENDAR, "2026-10-25", "2026-11-30");

  it("expands the repeating entries in the range, without the excluded dates, with the moved occurrences", () => {
    const youth = entries.filter((entry) => entry.uid === "youth@google.com");
    expect(youth.map((entry) => [entry.title, entry.start, entry.occurrence])).toEqual([
      ["Youth group (Saturday)", "2026-11-07T16:00:00.000Z", "2026-11-06T17:00:00.000Z"],
      ["Youth group", "2026-11-13T17:00:00.000Z", "2026-11-13T17:00:00.000Z"],
      ["Youth group", "2026-11-20T17:00:00.000Z", "2026-11-20T17:00:00.000Z"],
      ["Youth group", "2026-11-27T17:00:00.000Z", "2026-11-27T17:00:00.000Z"],
    ]);
    expect(youth[1]).toMatchObject({
      end: "2026-11-13T19:00:00.000Z",
      location: "Small hall",
      allDay: false,
    });
  });

  it("reads the entries of all day with their last day, and the texts", () => {
    expect(entries.find((entry) => entry.uid === "all-saints@google.com")).toMatchObject({
      start: "2026-11-01",
      end: null,
      allDay: true,
      occurrence: "single",
    });
    expect(entries.find((entry) => entry.uid === "camp@google.com")).toMatchObject({
      start: "2026-11-13",
      end: "2026-11-15",
      description: "Register: here\nBring a sleeping bag.",
      url: "https://example.com/camp?a=1&b=2",
    });
  });

  it("leaves out the cancelled entries and those out of the range, and orders by start", () => {
    expect(entries.map((entry) => entry.title)).toEqual([
      "Prayer meeting",
      "All Saints",
      "Youth group (Saturday)",
      "Camp",
      "Youth group",
      "Youth group",
      "Youth group",
    ]);
  });

  it("keeps an entry in progress at the start of the range", () => {
    const camp = parseCalendar(GOOGLE, CALENDAR, "2026-11-15", "2026-11-16");
    expect(camp.map((entry) => entry.title)).toEqual(["Camp"]);
  });

  it("puts a time without a time zone in the time zone of the church", () => {
    const floating = parseCalendar(
      "BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:a\nDTSTART:20261101T100000\nSUMMARY:Service\nEND:VEVENT\nEND:VCALENDAR",
      CALENDAR,
      "2026-11-01",
      "2026-11-01",
    );
    expect(floating[0]!.start).toBe("2026-11-01T09:00:00.000Z");
  });

  it("keeps the occurrences after one that moved out of the range, and adds one that moved into it", () => {
    const weekly = (exceptions: string) =>
      `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:w\nDTSTART:20261101T170000Z\nRRULE:FREQ=WEEKLY;COUNT=10\nSUMMARY:Weekly\nEND:VEVENT\n${exceptions}END:VCALENDAR`;
    const movedOut = parseCalendar(
      weekly(
        "BEGIN:VEVENT\nUID:w\nRECURRENCE-ID:20261108T170000Z\nDTSTART:20261220T170000Z\nSUMMARY:Weekly\nEND:VEVENT\n",
      ),
      CALENDAR,
      "2026-11-01",
      "2026-11-30",
    );
    expect(movedOut.map((entry) => entry.start.slice(0, 10))).toEqual([
      "2026-11-01",
      "2026-11-15",
      "2026-11-22",
      "2026-11-29",
    ]);

    const movedIn = parseCalendar(
      weekly(
        "BEGIN:VEVENT\nUID:w\nRECURRENCE-ID:20261213T170000Z\nDTSTART:20261110T170000Z\nSUMMARY:Moved\nEND:VEVENT\n",
      ),
      CALENDAR,
      "2026-11-09",
      "2026-11-12",
    );
    expect(movedIn.map((entry) => [entry.title, entry.occurrence])).toEqual([
      ["Moved", "2026-12-13T17:00:00.000Z"],
    ]);
  });

  it("relates an exception only to the repeating entry of its UID", () => {
    // Google: many repeating entries that ended, and a changed occurrence of an other one.
    const ended = Array.from(
      { length: 5 },
      (_, i) =>
        `BEGIN:VEVENT\nUID:old${i}\nDTSTART:2019010${i + 1}T090000Z\nRRULE:FREQ=WEEKLY;COUNT=3\nSUMMARY:Old\nEND:VEVENT\n`,
    ).join("");
    const calendar = `BEGIN:VCALENDAR\nVERSION:2.0\n${ended}BEGIN:VEVENT\nUID:service\nDTSTART:20261101T090000Z\nRRULE:FREQ=WEEKLY;COUNT=3\nSUMMARY:Service\nEND:VEVENT\nBEGIN:VEVENT\nUID:prayer\nDTSTART:20261101T170000Z\nRRULE:FREQ=WEEKLY;COUNT=3\nSUMMARY:Prayer\nEND:VEVENT\nBEGIN:VEVENT\nUID:prayer\nRECURRENCE-ID:20261108T170000Z\nDTSTART:20261108T090000Z\nSUMMARY:Prayer (morning)\nEND:VEVENT\nEND:VCALENDAR`;
    const related = parseCalendar(calendar, CALENDAR, "2026-11-01", "2026-11-30");
    expect(related.map((entry) => [entry.uid, entry.title, entry.start])).toEqual([
      ["service", "Service", "2026-11-01T09:00:00.000Z"],
      ["prayer", "Prayer", "2026-11-01T17:00:00.000Z"],
      ["service", "Service", "2026-11-08T09:00:00.000Z"],
      ["prayer", "Prayer (morning)", "2026-11-08T09:00:00.000Z"],
      ["service", "Service", "2026-11-15T09:00:00.000Z"],
      ["prayer", "Prayer", "2026-11-15T17:00:00.000Z"],
    ]);
  });

  it("does not keep the time zones of a calendar for the next calendars", () => {
    const wrongZone = GOOGLE.replace(/TZOFFSETTO:\+0100/g, "TZOFFSETTO:+0500").replace(
      /TZOFFSETTO:\+0200/g,
      "TZOFFSETTO:+0600",
    );
    parseCalendar(wrongZone, CALENDAR, "2026-11-01", "2026-11-30");
    const after = parseCalendar(
      "BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:a\nDTSTART;TZID=Europe/Budapest:20261101T100000\nSUMMARY:Service\nEND:VEVENT\nEND:VCALENDAR",
      CALENDAR,
      "2026-11-01",
      "2026-11-01",
    );
    expect(after[0]!.start).toBe("2026-11-01T09:00:00.000Z");
  });

  it("refuses a file that is not a calendar", () => {
    expect(() => parseCalendar("<html></html>", CALENDAR, "2026-11-01", "2026-11-30")).toThrow(
      CalendarParseError,
    );
  });

  it("stops at the budget of occurrences of all repeating entries of a calendar", () => {
    // Hourly entries since 2026-01-01: about 7300 occurrences each until the range, under the limit of one entry.
    const hourly = (count: number) =>
      `BEGIN:VCALENDAR\nVERSION:2.0\n${Array.from(
        { length: count },
        (_, i) =>
          `BEGIN:VEVENT\nUID:hourly${i}\nDTSTART:20260101T000${i}00Z\nRRULE:FREQ=HOURLY\nSUMMARY:Hourly ${i}\nEND:VEVENT\n`,
      ).join("")}END:VCALENDAR`;
    const perEntry = 7400;
    const under = Math.floor(MAX_CALENDAR_OCCURRENCES / perEntry) - 1;
    expect(parseCalendar(hourly(under), CALENDAR, "2026-11-01", "2026-11-01")).toHaveLength(
      under * 24,
    );
    expect(() => parseCalendar(hourly(under + 3), CALENDAR, "2026-11-01", "2026-11-01")).toThrow(
      CalendarBudgetError,
    );
  });

  it("skips the years before the range of daily and weekly entries", () => {
    // 60 weekly entries since 2010 (about 880 occurrences each, more than the budget together)
    // and 10 daily entries since 2000.
    const weekly = Array.from(
      { length: 60 },
      (_, i) =>
        `BEGIN:VEVENT\nUID:weekly${i}\nDTSTART;TZID=Europe/Budapest:20100105T18${String(i).padStart(2, "0")}00\nDURATION:PT1H\nRRULE:FREQ=WEEKLY;BYDAY=TU\nSUMMARY:Weekly ${i}\nEND:VEVENT\n`,
    ).join("");
    const daily = Array.from(
      { length: 10 },
      (_, i) =>
        `BEGIN:VEVENT\nUID:daily${i}\nDTSTART:20000101T0${i}0000Z\nRRULE:FREQ=DAILY;INTERVAL=3\nSUMMARY:Daily ${i}\nEND:VEVENT\n`,
    ).join("");
    const entries = parseCalendar(
      `BEGIN:VCALENDAR\nVERSION:2.0\n${weekly}${daily}END:VCALENDAR`,
      CALENDAR,
      "2026-11-01",
      "2026-11-30",
    );
    // 4 Tuesdays in November 2026; every third day from 2000-01-01 (2026-11-01 is day 9801, so it is the first).
    expect(
      entries.filter((entry) => entry.title === "Weekly 0").map((entry) => entry.start),
    ).toEqual([
      "2026-11-03T17:00:00.000Z",
      "2026-11-10T17:00:00.000Z",
      "2026-11-17T17:00:00.000Z",
      "2026-11-24T17:00:00.000Z",
    ]);
    expect(
      entries.filter((entry) => entry.title === "Daily 0").map((entry) => entry.start.slice(0, 10)),
    ).toEqual(
      Array.from({ length: 10 }, (_, i) => `2026-11-${String(1 + 3 * i).padStart(2, "0")}`),
    );
    expect(entries).toHaveLength(60 * 4 + 10 * 10);
  });

  it("keeps the excluded dates and the exceptions of skipped years", () => {
    const calendar = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:series
DTSTART:20100105T170000Z
DTEND:20100105T180000Z
RRULE:FREQ=WEEKLY;UNTIL=20301231T000000Z
EXDATE:20261110T170000Z
SUMMARY:Series
END:VEVENT
BEGIN:VEVENT
UID:series
RECURRENCE-ID:20120103T170000Z
DTSTART:20261105T170000Z
DTEND:20261105T180000Z
SUMMARY:Moved from 2012
END:VEVENT
BEGIN:VEVENT
UID:ended
DTSTART:20100105T170000Z
RRULE:FREQ=DAILY;UNTIL=20200101T000000Z
SUMMARY:Ended
END:VEVENT
END:VCALENDAR`;
    const entries = parseCalendar(calendar, CALENDAR, "2026-11-01", "2026-11-30");
    expect(entries.map((entry) => `${entry.title} ${entry.start}`).sort()).toEqual([
      "Moved from 2012 2026-11-05T17:00:00.000Z",
      "Series 2026-11-03T17:00:00.000Z",
      "Series 2026-11-17T17:00:00.000Z",
      "Series 2026-11-24T17:00:00.000Z",
    ]);
  });
});

describe("description texts", () => {
  it("removes the HTML and keeps the lines", () => {
    expect(plainText("<p>One &amp; two</p><ul><li>three</li></ul>&#233;")).toBe(
      "One & two\n• three\né",
    );
  });

  it("finds the first web address", () => {
    expect(firstUrl("See https://example.com/x. Or http://other")).toBe("https://example.com/x");
    expect(firstUrl("nothing")).toBeNull();
  });
});
