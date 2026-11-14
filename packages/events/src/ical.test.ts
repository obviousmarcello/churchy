import ICAL from "ical.js";
import { describe, expect, it } from "vitest";
import { dayWindow, expandEvents, type ExpandableEvent } from "./expand";
import {
  buildICalendar,
  escapeText,
  foldLine,
  googleCalendarUrl,
  PRODUCT_ID,
  type IcsEvent,
} from "./ical";

type Fixture = ExpandableEvent & { title: string; description?: string; updatedAt: string };

const base = {
  endsAt: null,
  allDay: false,
  rrule: null,
  exdates: [],
  parentEventId: null,
  recurrenceId: null,
};

/** Single, all-day, recurring, exdated and overridden events, several across DST changes. */
const FIXTURES: Fixture[] = [
  {
    ...base,
    id: "single",
    title: "Adventi hangverseny",
    description: "A kórus ünnepi műsora; belépés díjtalan, adományokat\nköszönettel fogadunk.",
    startsAt: "2026-12-13T17:00:00+01:00",
    endsAt: "2026-12-13T18:15:00+01:00",
    updatedAt: "2026-11-01T09:00:00+01:00",
  },
  {
    ...base,
    id: "allday",
    title: "Karácsony",
    startsAt: "2026-12-25T00:00:00+01:00",
    endsAt: "2026-12-27T00:00:00+01:00",
    allDay: true,
    updatedAt: "2026-11-01T09:00:00+01:00",
  },
  {
    ...base,
    id: "allday-yearly",
    title: "Búcsú",
    startsAt: "2026-03-28T00:00:00+01:00",
    allDay: true,
    rrule: "FREQ=YEARLY",
    exdates: ["2027-03-28"],
    updatedAt: "2026-11-01T09:00:00+01:00",
  },
  {
    ...base,
    id: "weekly",
    title: "Hittanóra",
    startsAt: "2026-09-01T16:00:00+02:00",
    endsAt: "2026-09-01T17:30:00+02:00",
    rrule: "FREQ=WEEKLY;BYDAY=TU,TH",
    exdates: ["2026-12-24", "2026-12-29", "2026-12-31"],
    updatedAt: "2026-11-01T09:00:00+01:00",
  },
  {
    ...base,
    id: "first-friday",
    title: "Ifjúsági est",
    startsAt: "2026-09-04T19:00:00+02:00",
    endsAt: "2026-09-04T21:00:00+02:00",
    rrule: "FREQ=MONTHLY;BYDAY=1FR,3FR;UNTIL=20270630",
    updatedAt: "2026-11-01T09:00:00+01:00",
  },
  {
    ...base,
    id: "last-sunday",
    title: "Szeretetvendégség",
    startsAt: "2026-09-27T11:30:00+02:00",
    endsAt: "2026-09-27T13:00:00+02:00",
    rrule: "FREQ=MONTHLY;BYDAY=-1SU",
    updatedAt: "2026-11-01T09:00:00+01:00",
  },
  {
    ...base,
    id: "last-sunday-moved",
    title: "Szeretetvendégség (később)",
    startsAt: "2026-11-29T12:30:00+01:00",
    endsAt: "2026-11-29T14:00:00+01:00",
    parentEventId: "last-sunday",
    recurrenceId: "2026-11-29T11:30:00+01:00",
    updatedAt: "2026-11-02T09:00:00+01:00",
  },
  {
    ...base,
    id: "night-vigil",
    title: "Éjszakai szentségimádás",
    startsAt: "2026-10-17T22:00:00+02:00",
    endsAt: "2026-10-18T06:00:00+02:00",
    rrule: "FREQ=WEEKLY;COUNT=26",
    updatedAt: "2026-11-01T09:00:00+01:00",
  },
  {
    ...base,
    id: "workday",
    title: "Irodai ügyelet",
    startsAt: "2026-09-30T08:00:00+02:00",
    endsAt: "2026-09-30T12:00:00+02:00",
    rrule: "FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1;UNTIL=20270801T000000Z",
    updatedAt: "2026-11-01T09:00:00+01:00",
  },
];

const HOST = "churchy.hu";

function toIcs(events: Fixture[]): IcsEvent[] {
  return events.map((e) => ({
    uid: `${e.id}@${HOST}`,
    updatedAt: e.updatedAt,
    createdAt: e.updatedAt,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    allDay: e.allDay,
    rrule: e.rrule,
    exdates: e.exdates,
    replacedStarts: events
      .filter((c) => c.parentEventId === e.id && c.recurrenceId !== null)
      .map((c) => c.recurrenceId as string),
    summary: e.title,
    description: e.description ?? null,
    location: "Szent Tivadar-templom, 1011 Budapest, Fő utca 1.",
    url: `https://szent-tivadar.churchy.hu/esemenyek/${e.id}`,
    geo: { lat: 47.5, lng: 19.04 },
    categories: ["Közösség"],
  }));
}

const WINDOW = dayWindow("2026-09-01", "2027-08-31");

/** Every occurrence ical.js (an independent RFC 5545 implementation) finds in the window. */
function icalJsOccurrences(ics: string): { uid: string; key: string }[] {
  const calendar = new ICAL.Component(ICAL.parse(ics));
  for (const tz of calendar.getAllSubcomponents("vtimezone")) ICAL.TimezoneService.register(tz);
  const from = Date.parse(WINDOW.from);
  const to = Date.parse(WINDOW.to);
  const out: { uid: string; key: string }[] = [];
  for (const vevent of calendar.getAllSubcomponents("vevent")) {
    const event = new ICAL.Event(vevent);
    const iterator = event.iterator();
    for (let next = iterator.next(); next; next = iterator.next()) {
      if (next.isDate) {
        const date = next.toString();
        if (date > WINDOW.to.slice(0, 10)) break;
        if (date >= WINDOW.from.slice(0, 10)) out.push({ uid: event.uid, key: date });
      } else {
        const ms = next.toJSDate().getTime();
        if (ms > to) break;
        const end = ms + event.duration.toSeconds() * 1000;
        if (end > from) out.push({ uid: event.uid, key: new Date(ms).toISOString() });
      }
    }
  }
  return out.sort((a, b) => (a.uid + a.key < b.uid + b.key ? -1 : 1));
}

describe("buildICalendar", () => {
  const ics = buildICalendar({
    name: "Szent Tivadar Plébánia – események",
    description: "Nyilvános események",
    events: toIcs(FIXTURES),
  });

  it("is RFC 5545 shaped: CRLF, folded lines ≤ 75 octets, calendar and timezone headers", () => {
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    const encoder = new TextEncoder();
    for (const line of ics.split("\r\n"))
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toMatch(/^BEGIN:VCALENDAR\r\nVERSION:2\.0\r\nPRODID:/);
    expect(unfolded).toContain(`PRODID:${PRODUCT_ID}\r\n`);
    expect(unfolded).toContain("X-WR-CALNAME:Szent Tivadar Plébánia – események\r\n");
    expect(unfolded).toContain("BEGIN:VTIMEZONE\r\nTZID:Europe/Budapest\r\n");
    expect(unfolded).toContain("RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU");
    expect(unfolded.match(/BEGIN:VEVENT/g)).toHaveLength(FIXTURES.length);
    expect(unfolded.match(/END:VEVENT/g)).toHaveLength(FIXTURES.length);
  });

  it("writes zoned times, all-day dates, normalized UNTIL and EXDATEs", () => {
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain("DTSTART;TZID=Europe/Budapest:20261213T170000\r\n");
    expect(unfolded).toContain("DTSTART;VALUE=DATE:20261225\r\nDTEND;VALUE=DATE:20261227\r\n");
    expect(unfolded).toContain("DTSTART;VALUE=DATE:20260328\r\nDTEND;VALUE=DATE:20260329\r\n");
    expect(unfolded).toContain("EXDATE;VALUE=DATE:20270328\r\n");
    expect(unfolded).toContain("EXDATE;TZID=Europe/Budapest:20261224T160000\r\n");
    // A date UNTIL on a zoned event becomes the end of that Budapest day in UTC.
    expect(unfolded).toContain("RRULE:FREQ=MONTHLY;UNTIL=20270630T215959Z;BYDAY=1FR,3FR\r\n");
    // The occurrence replaced by the override child is excluded from the master.
    expect(unfolded).toContain("EXDATE;TZID=Europe/Budapest:20261129T113000\r\n");
    expect(unfolded).toContain("DTSTAMP:20261101T080000Z\r\n");
    expect(unfolded).toContain(
      "DESCRIPTION:A kórus ünnepi műsora\\; belépés díjtalan\\, adományokat\\nköszönettel fogadunk.\r\n",
    );
    expect(unfolded).toContain("GEO:47.5;19.04\r\n");
    expect(unfolded).toContain("CATEGORIES:Közösség\r\n");
  });

  it("round-trips through an independent parser (ical.js) with the same occurrences", () => {
    const parsed = new ICAL.Component(ICAL.parse(ics));
    const events = parsed.getAllSubcomponents("vevent").map((v) => new ICAL.Event(v));
    expect(events.map((e) => e.summary)).toEqual(FIXTURES.map((f) => f.title));
    expect(events[0]!.description).toBe(FIXTURES[0]!.description);
    expect(events[0]!.location).toBe("Szent Tivadar-templom, 1011 Budapest, Fő utca 1.");
    expect(parsed.getFirstPropertyValue("x-wr-calname")).toBe("Szent Tivadar Plébánia – események");

    const ours = expandEvents(FIXTURES, WINDOW)
      .map((o) => ({
        uid: `${o.event.id}@${HOST}`,
        key: o.allDay ? o.date : new Date(o.startMs).toISOString(),
      }))
      .sort((a, b) => (a.uid + a.key < b.uid + b.key ? -1 : 1));
    expect(ours.length).toBeGreaterThan(150);
    expect(icalJsOccurrences(ics)).toEqual(ours);
  });

  it("emits an unparseable rule as a single event, like the expansion", () => {
    const out = buildICalendar({
      events: [
        {
          uid: "x@churchy.hu",
          updatedAt: "2026-11-01T09:00:00Z",
          startsAt: "2026-11-20T18:00:00+01:00",
          endsAt: null,
          allDay: false,
          rrule: "FREQ=HOURLY",
          exdates: [],
          summary: "Próba",
          status: "CANCELLED",
        },
      ],
    });
    expect(out).not.toContain("RRULE:FREQ=HOURLY");
    expect(out).not.toContain("DTEND");
    expect(out).toContain("STATUS:CANCELLED");
    expect(out).not.toContain("X-WR-CALNAME");
  });

  it("skips invalid exdates and writes all-day replaced starts as dates", () => {
    const out = buildICalendar({
      refreshHours: 6,
      events: [
        {
          uid: "y@churchy.hu",
          updatedAt: "2026-11-01T09:00:00Z",
          startsAt: "2026-11-01T00:00:00+01:00",
          endsAt: null,
          allDay: true,
          rrule: "FREQ=WEEKLY;UNTIL=20261231T230000Z",
          exdates: ["nem-datum", "2026-11-08"],
          replacedStarts: ["2026-11-15T00:00:00+01:00"],
          summary: "Ügyelet",
        },
      ],
    });
    expect(out).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT6H");
    expect(out).toContain("RRULE:FREQ=WEEKLY;UNTIL=20270101\r\n");
    expect(out).toContain("EXDATE;VALUE=DATE:20261108\r\nEXDATE;VALUE=DATE:20261115\r\n");
  });
});

describe("text helpers", () => {
  it("escapes TEXT values", () => {
    expect(escapeText("a\\b;c,d\r\ne\nf")).toBe("a\\\\b\\;c\\,d\\ne\\nf");
  });

  it("folds long lines without splitting UTF-8 characters", () => {
    expect(foldLine("SUMMARY:rövid")).toBe("SUMMARY:rövid");
    const long = `SUMMARY:${"ő".repeat(100)}`;
    const folded = foldLine(long);
    const parts = folded.split("\r\n");
    expect(parts.length).toBeGreaterThan(2);
    const encoder = new TextEncoder();
    for (const part of parts) expect(encoder.encode(part).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe(long);
  });
});

describe("googleCalendarUrl", () => {
  it("adds a timed series in Budapest time", () => {
    const url = new URL(
      googleCalendarUrl({
        uid: "a",
        updatedAt: "2026-11-01T09:00:00Z",
        startsAt: "2026-11-06T19:00:00+01:00",
        endsAt: "2026-11-06T21:00:00+01:00",
        allDay: false,
        rrule: "RRULE:FREQ=MONTHLY;BYDAY=1FR",
        exdates: [],
        summary: "Ifjúsági est",
        description: "Fiataloknak",
        location: "Plébánia",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      action: "TEMPLATE",
      text: "Ifjúsági est",
      dates: "20261106T190000/20261106T210000",
      ctz: "Europe/Budapest",
      details: "Fiataloknak",
      location: "Plébánia",
      recur: "RRULE:FREQ=MONTHLY;BYDAY=1FR",
    });
  });

  it("adds all-day and open-ended events", () => {
    const allDay = new URL(
      googleCalendarUrl({
        uid: "b",
        updatedAt: "2026-11-01T09:00:00Z",
        startsAt: "2026-12-24T00:00:00+01:00",
        endsAt: null,
        allDay: true,
        rrule: null,
        exdates: [],
        summary: "Szenteste",
      }),
    );
    expect(allDay.searchParams.get("dates")).toBe("20261224/20261225");
    expect(allDay.searchParams.has("recur")).toBe(false);
    const open = new URL(
      googleCalendarUrl({
        uid: "c",
        updatedAt: "2026-11-01T09:00:00Z",
        startsAt: "2026-12-24T22:00:00+01:00",
        endsAt: null,
        allDay: false,
        rrule: null,
        exdates: [],
        summary: "Éjféli mise",
      }),
    );
    expect(open.searchParams.get("dates")).toBe("20261224T220000/20261224T220000");
  });
});
