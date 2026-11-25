import { describe, expect, it } from "vitest";

import type { AnnouncementDTO, AnnouncementEntryDTO, CalendarEntry } from "./schema";
import { DEFAULT_ENTRY_SETTINGS, SINGLE_OCCURRENCE } from "./schema";
import { buildAnnouncementView, excludedByWord, weekGroups } from "./sections";

const CALENDAR = "00000000-0000-4000-8000-000000000001";
const OTHER_CALENDAR = "00000000-0000-4000-8000-000000000002";
// Sunday, 25 October 2026, 10:00 in Budapest (still summer time).
const EVENT_START = "2026-10-25T09:00:00Z";

function calendarEntry(
  uid: string,
  start: string,
  overrides: Partial<CalendarEntry> = {},
): CalendarEntry {
  const allDay = /^\d{4}-\d{2}-\d{2}$/.test(start);
  return {
    calendarId: CALENDAR,
    uid,
    occurrence: SINGLE_OCCURRENCE,
    title: uid,
    start,
    end: null,
    allDay,
    location: null,
    description: null,
    url: null,
    ...overrides,
  };
}

function settings(
  uid: string,
  overrides: Partial<AnnouncementEntryDTO> = {},
): AnnouncementEntryDTO {
  return {
    id: `settings-${uid}`,
    ...DEFAULT_ENTRY_SETTINGS,
    source: "calendar",
    calendarId: CALENDAR,
    uid,
    occurrence: SINGLE_OCCURRENCE,
    ...overrides,
  } as AnnouncementEntryDTO;
}

function manual(
  id: string,
  overrides: Partial<Extract<AnnouncementEntryDTO, { source: "manual" }>> = {},
): AnnouncementEntryDTO {
  return {
    id,
    ...DEFAULT_ENTRY_SETTINGS,
    source: "manual",
    title: id,
    startsAt: null,
    endsAt: null,
    startDate: null,
    endDate: null,
    location: null,
    description: null,
    position: 0,
    ...overrides,
  };
}

function view(
  snapshot: CalendarEntry[],
  entries: AnnouncementEntryDTO[] = [],
  options: Partial<Parameters<typeof buildAnnouncementView>[0]> = {},
) {
  const announcement: Pick<
    AnnouncementDTO,
    "snapshot" | "entries" | "showTime" | "showLocation" | "showDescription"
  > = {
    snapshot,
    entries,
    showTime: true,
    showLocation: false,
    showDescription: false,
  };
  return buildAnnouncementView({
    announcement,
    eventStartsAt: EVENT_START,
    calendarIds: null,
    excludeWords: [],
    ...options,
  });
}

const titles = (result: ReturnType<typeof view>) =>
  Object.fromEntries(result.sections.map((s) => [s.id, s.entries.map((e) => e.title)]));

describe("buildAnnouncementView", () => {
  it("puts the entries in the sections by the day of their start", () => {
    const result = view([
      calendarEntry("after-service", "2026-10-25T12:00:00Z"),
      calendarEntry("next-sunday", "2026-11-01"),
      calendarEntry("monday", "2026-11-02T17:00:00Z"),
      calendarEntry("mid-november", "2026-11-15T17:00:00Z"),
      calendarEntry("december", "2026-12-01T17:00:00Z"),
    ]);
    expect(result.sections.map(({ id, from, to }) => ({ id, from, to }))).toEqual([
      { id: "nextWeek", from: "2026-10-25", to: "2026-11-01" },
      { id: "thisMonth", from: "2026-11-02", to: "2026-10-31" },
      { id: "nextMonth", from: "2026-11-02", to: "2026-11-30" },
    ]);
    expect(titles(result)).toEqual({
      nextWeek: ["after-service", "next-sunday"],
      thisMonth: [],
      nextMonth: ["monday", "mid-november"],
    });
  });

  it("keeps the rest of this month apart from next week", () => {
    const result = view(
      [
        calendarEntry("a", "2026-10-12T17:00:00Z"),
        calendarEntry("b", "2026-10-28T17:00:00Z"),
        calendarEntry("c", "2026-11-03T17:00:00Z"),
      ],
      [],
      { eventStartsAt: "2026-10-11T08:00:00Z" },
    );
    expect(titles(result)).toEqual({ nextWeek: ["a"], thisMonth: ["b"], nextMonth: ["c"] });
  });

  it("goes over the end of the year", () => {
    const result = view(
      [calendarEntry("new-year", "2027-01-01"), calendarEntry("later", "2027-01-20")],
      [],
      {
        eventStartsAt: "2026-12-27T09:00:00Z",
      },
    );
    expect(result.sections.map((s) => [s.from, s.to])).toEqual([
      ["2026-12-27", "2027-01-03"],
      ["2027-01-04", "2026-12-31"],
      ["2027-01-04", "2027-01-31"],
    ]);
    expect(titles(result)).toEqual({ nextWeek: ["new-year"], thisMonth: [], nextMonth: ["later"] });
  });

  it("leaves out what ended before the start of the event, and keeps what is in progress", () => {
    const result = view([
      calendarEntry("morning-prayer", "2026-10-25T06:00:00Z", { end: "2026-10-25T07:00:00Z" }),
      calendarEntry("ends-at-start", "2026-10-25T08:00:00Z", { end: EVENT_START }),
      calendarEntry("today-all-day", "2026-10-25"),
      calendarEntry("fast", "2026-10-24", { end: "2026-10-26" }),
      calendarEntry("yesterday", "2026-10-24"),
    ]);
    expect(titles(result).nextWeek).toEqual(["fast", "today-all-day"]);
  });

  it("leaves out the excluded entries and those of other calendars", () => {
    const result = view(
      [
        calendarEntry("Leaders [internal]", "2026-10-27T17:00:00Z"),
        calendarEntry("hidden", "2026-10-28T17:00:00Z"),
        calendarEntry("other", "2026-10-28T17:00:00Z", { calendarId: OTHER_CALENDAR }),
        calendarEntry("kept", "2026-10-29T17:00:00Z"),
      ],
      [settings("hidden", { excluded: true })],
      { excludeWords: ["[INTERNAL]"], calendarIds: new Set([CALENDAR]) },
    );
    expect(titles(result).nextWeek).toEqual(["kept"]);
    expect(result.excluded.map((e) => [e.title, e.excludedBy])).toEqual([
      ["Leaders [internal]", "word"],
      ["hidden", "entry"],
    ]);
  });

  it("resolves the details for the lists and for the own slides", () => {
    const result = view(
      [calendarEntry("a", "2026-10-27T17:00:00Z"), calendarEntry("b", "2026-10-28T17:00:00Z")],
      [settings("a", { showLocation: true, showTime: false, highlighted: true })],
    );
    const [a, b] = result.sections[0]!.entries as [
      (typeof result.sections)[0]["entries"][0],
      (typeof result.sections)[0]["entries"][0],
    ];
    expect(a.show).toEqual({ time: false, location: true, description: false });
    expect(a.ownShow).toEqual({ time: false, location: true, description: true });
    expect(b.show).toEqual({ time: true, location: false, description: false });
    expect(result.own.map((e) => e.title)).toEqual(["a"]);
  });

  it("gives own slides to highlighted entries, to attachments and QR codes, then to the manual entries without a date", () => {
    const result = view(
      [calendarEntry("qr", "2026-11-10T17:00:00Z"), calendarEntry("plain", "2026-10-27T17:00:00Z")],
      [
        settings("qr", { qrText: "https://example.com" }),
        manual("second", { position: 2 }),
        manual("first", { position: 1 }),
        manual("dated", { startDate: "2026-10-26", highlighted: true }),
      ],
    );
    expect(result.own.map((e) => e.title)).toEqual(["dated", "qr", "first", "second"]);
    expect(result.undated.map((e) => e.title)).toEqual(["first", "second"]);
    expect(result.sections[0]!.entries.find((e) => e.title === "dated")?.highlighted).toBe(true);
  });

  it("alternates the side of the QR codes that follow each other", () => {
    const qr = { qrText: "https://example.com", attachmentSetId: "set" };
    const result = view(
      ["a", "b", "c", "d", "e"].map((uid, index) =>
        calendarEntry(uid, `2026-10-${26 + index}T17:00:00Z`),
      ),
      [
        settings("a", qr),
        settings("b", qr),
        settings("c", { highlighted: true }),
        settings("d", qr),
        settings("e", qr),
      ],
    );
    expect(result.own.map((e) => [e.title, e.qrSide])).toEqual([
      ["a", "end"],
      ["b", "start"],
      ["c", null],
      ["d", "end"],
      ["e", "start"],
    ]);
  });

  it("keeps the settings of a calendar entry only for its occurrence", () => {
    const result = view(
      [
        calendarEntry("series", "2026-10-27T17:00:00Z", { occurrence: "2026-10-27T17:00:00.000Z" }),
        calendarEntry("series", "2026-11-03T17:00:00Z", { occurrence: "2026-11-03T17:00:00.000Z" }),
      ],
      [settings("series", { occurrence: "2026-11-03T17:00:00.000Z", highlighted: true })],
    );
    expect(result.own.map((e) => e.start)).toEqual(["2026-11-03T17:00:00Z"]);
  });
});

describe("weekGroups", () => {
  it("splits next week into the day of the event, the 6 days after it and the same day of the next week", () => {
    const result = view([
      calendarEntry("fast", "2026-10-24", { end: "2026-10-26" }),
      calendarEntry("after-service", "2026-10-25T12:00:00Z"),
      calendarEntry("monday", "2026-10-26T17:00:00Z"),
      calendarEntry("saturday", "2026-10-31"),
      // Sunday 00:30 in Budapest, still Saturday in UTC.
      calendarEntry("sunday-night", "2026-10-31T23:30:00Z"),
    ]);
    expect(
      weekGroups(result.sections[0]!).map(({ id, from, to, entries }) => ({
        id,
        from,
        to,
        titles: entries.map((e) => e.title),
      })),
    ).toEqual([
      { id: "eventDay", from: "2026-10-25", to: "2026-10-25", titles: ["fast", "after-service"] },
      { id: "restOfWeek", from: "2026-10-26", to: "2026-10-31", titles: ["monday", "saturday"] },
      { id: "nextEventDay", from: "2026-11-01", to: "2026-11-01", titles: ["sunday-night"] },
    ]);
  });
});

describe("excludedByWord", () => {
  it("finds a word in the title without case", () => {
    expect(excludedByWord("Vezetői [BELSŐ] ülés", ["[belső]"])).toBe(true);
    expect(excludedByWord("Lorem", ["", "ipsum"])).toBe(false);
  });
});
