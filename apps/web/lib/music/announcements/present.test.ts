import { describe, expect, it } from "vitest";

import { DEFAULT_IMAGE_ADJUST, type EventImageDTO } from "@/lib/music/projection/images";
import { parseProjectionState } from "@/lib/music/projection/protocol";
import { buildProjectionItems } from "@/lib/music/projection/slides";
import { announcementSource, formatRange, formatWhen, groupHeadings, shortId } from "./present";
import {
  DEFAULT_ENTRY_SETTINGS,
  SINGLE_OCCURRENCE,
  type AnnouncementEntryDTO,
  type CalendarEntry,
} from "./schema";
import { buildAnnouncementView, type ViewEntry } from "./sections";

const CALENDAR = "00000000-0000-4000-8000-000000000001";
const SET = "00000000-0000-4000-8000-0000000000aa";

function viewEntry(overrides: Partial<ViewEntry>): ViewEntry {
  return {
    key: "k",
    source: "calendar",
    entryId: null,
    calendarId: CALENDAR,
    title: "Lorem",
    allDay: false,
    start: "2026-11-01T17:00:00Z",
    end: "2026-11-01T19:00:00Z",
    startDay: "2026-11-01",
    endDay: "2026-11-01",
    location: null,
    description: null,
    url: null,
    settings: DEFAULT_ENTRY_SETTINGS,
    show: { time: true, location: false, description: false },
    ownShow: { time: true, location: true, description: true },
    highlighted: false,
    excludedBy: null,
    ...overrides,
  };
}

// Intl puts thin spaces (U+2009) around the dash of a range, and a narrow space (U+202F) before "PM" of a range.
describe("formatWhen", () => {
  it("gives the days and the time in Budapest", () => {
    expect(formatWhen(viewEntry({}), true, "en")).toBe("Sun, Nov 1, 6:00\u2009–\u20098:00\u202fPM");
    expect(formatWhen(viewEntry({}), false, "en")).toBe("Sun, Nov 1");
    expect(
      formatWhen(
        viewEntry({
          allDay: true,
          start: "2026-11-13",
          end: "2026-11-15",
          startDay: "2026-11-13",
          endDay: "2026-11-15",
        }),
        true,
        "en",
      ),
    ).toBe("Fri, Nov 13\u2009–\u2009Sun, Nov 15");
    expect(formatWhen(viewEntry({ start: null, startDay: null }), true, "en")).toBeNull();
    expect(formatWhen(viewEntry({ end: null }), true, "hu")).toBe("nov. 1., V 18:00");
  });

  it("gives the days of a section", () => {
    expect(formatRange("en", "2026-10-25", "2026-11-01")).toBe("Oct 25\u2009–\u2009Nov 1");
  });
});

const GROUP_TITLES = {
  eventDay: "Today",
  restOfWeek: "In the coming days",
  nextEventDay: "Next Sunday",
};

describe("groupHeadings", () => {
  it("puts the weekday of the event into the headings", () => {
    const texts = {
      eventDay: "Ma",
      restOfWeek: "A következő napokban",
      nextEventDay: "Jövő {weekday}",
    };
    const format = (message: string, values?: Record<string, string | number>) =>
      message.replace("{weekday}", String(values?.weekday));
    expect(groupHeadings(texts, "2026-10-25", { locale: "hu", format })).toEqual({
      eventDay: "Ma",
      restOfWeek: "A következő napokban",
      nextEventDay: "Jövő vasárnap",
    });
  });
});

describe("announcementSource", () => {
  const image: EventImageDTO = {
    id: "00000000-0000-4000-8000-0000000000bb",
    name: "Poster",
    url: `/munkater/esemenyek/fajl/kep/${CALENDAR}/00000000-0000-4000-8000-0000000000cc.webp`,
    width: 1600,
    height: 900,
    adjust: DEFAULT_IMAGE_ADJUST,
  };
  const snapshot: CalendarEntry[] = [
    {
      calendarId: CALENDAR,
      uid: "camp",
      occurrence: SINGLE_OCCURRENCE,
      title: "Camp",
      start: "2026-10-28T17:00:00Z",
      end: null,
      allDay: false,
      location: "Hall",
      description: null,
      url: null,
    },
  ];
  const entries: AnnouncementEntryDTO[] = [
    {
      id: "s1",
      ...DEFAULT_ENTRY_SETTINGS,
      attachmentSetId: SET,
      qrText: "https://example.com",
      qrCaption: "Register",
      source: "calendar",
      calendarId: CALENDAR,
      uid: "camp",
      occurrence: SINGLE_OCCURRENCE,
    },
    {
      id: "m1",
      ...DEFAULT_ENTRY_SETTINGS,
      qrText: "https://example.org",
      qrCaption: null,
      source: "manual",
      title: "Offering",
      startsAt: null,
      endsAt: null,
      startDate: null,
      endDate: null,
      location: null,
      description: "For the roof",
      position: 0,
    },
  ];
  const view = buildAnnouncementView({
    announcement: {
      snapshot,
      entries,
      showTime: true,
      showLocation: false,
      showDescription: false,
    },
    eventStartsAt: "2026-10-25T09:00:00Z",
    calendarIds: null,
    excludeWords: [],
  });
  const source = announcementSource({
    key: "item",
    title: "Announcements",
    view,
    titles: { nextWeek: "Next week", thisMonth: "Later this month", nextMonth: "Next month" },
    groupTitles: GROUP_TITLES,
    images: { [SET]: [image] },
    locale: "en",
  });

  it("has the sections with entries and the own slides", () => {
    expect(source.sections).toEqual([
      {
        id: "nextWeek",
        heading: "Next week",
        range: "Oct 25\u2009–\u2009Nov 1",
        entries: [{ when: "Wed, Oct 28, 6:00 PM", title: "Camp", details: [], accent: true }],
      },
    ]);
    expect(
      source.own.map(({ id, title, details, images, qr, qrSide }) => ({
        id,
        title,
        details,
        images: images.length,
        qr,
        qrSide,
      })),
    ).toEqual([
      {
        id: shortId(view.own[0]!.key),
        title: "Camp",
        details: ["Hall"],
        images: 1,
        qr: { text: "https://example.com", caption: "Register" },
        qrSide: "end",
      },
      {
        id: shortId(view.own[1]!.key),
        title: "Offering",
        details: ["For the roof"],
        images: 0,
        qr: { text: "https://example.org", caption: null },
        qrSide: null,
      },
    ]);
  });

  it("gives the tiles: the list, the attachment with its QR code, the text and the QR code of the entry without a date", () => {
    const [item] = buildProjectionItems([source], 16 / 9);
    const camp = shortId(view.own[0]!.key);
    const offering = shortId(view.own[1]!.key);
    expect(item!.tiles.map((tile) => [tile.id, tile.slide.kind])).toEqual([
      ["nw.0", "announcements"],
      [`${camp}.1`, "image"],
      [`${offering}.t`, "announcement"],
      [`${offering}.qr`, "qr"],
    ]);
    expect(item!.tiles[1]!.slide).toMatchObject({
      qr: { text: "https://example.com", caption: "Register", side: "end" },
    });
    for (const tile of item!.tiles) {
      expect(tile.id.length).toBeLessThanOrEqual(20);
      const state = {
        seq: 1,
        mode: "show",
        slide: tile.slide,
        position: { itemKey: item!.key, tileId: tile.id },
        preload: null,
      };
      expect(parseProjectionState(state)?.slide).toEqual(tile.slide);
    }
  });

  it("puts the text slide first on request", () => {
    const [item] = buildProjectionItems(
      [{ ...source, own: [{ ...source.own[0]!, textFirst: true }] }],
      16 / 9,
    );
    expect(item!.tiles.map((tile) => tile.slide.kind)).toEqual([
      "announcements",
      "announcement",
      "image",
    ]);
  });
});

describe("announcementSource with the groups of next week", () => {
  const snapshot: CalendarEntry[] = [
    ["service", "2026-10-25T16:00:00Z", "Hall"],
    ["prayer", "2026-10-28T17:00:00Z", "Room 2"],
    ["choir", "2026-10-29T17:00:00Z", null],
    ["lunch", "2026-11-01T11:00:00Z", "Garden"],
  ].map(([uid, start, location]) => ({
    calendarId: CALENDAR,
    uid: uid as string,
    occurrence: SINGLE_OCCURRENCE,
    title: uid as string,
    start: start as string,
    end: null,
    allDay: false,
    location: location!,
    description: null,
    url: null,
  }));
  const source = (entries: CalendarEntry[]) =>
    announcementSource({
      key: "item",
      title: "Announcements",
      view: buildAnnouncementView({
        announcement: {
          snapshot: entries,
          entries: [],
          showTime: true,
          showLocation: true,
          showDescription: false,
        },
        eventStartsAt: "2026-10-25T09:00:00Z",
        calendarIds: null,
        excludeWords: [],
      }),
      titles: { nextWeek: "Next week", thisMonth: "Later this month", nextMonth: "Next month" },
      groupTitles: GROUP_TITLES,
      images: {},
      locale: "en",
    });

  it("gives an overview without the details, then a list for each group with entries", () => {
    const [section] = source(snapshot).sections;
    expect(section!.entries.map(({ title, details }) => [title, details])).toEqual([
      ["service", []],
      ["prayer", []],
      ["choir", []],
      ["lunch", []],
    ]);
    expect(
      section!.groups?.map(({ id, heading, range, entries }) => ({
        id,
        heading,
        range,
        entries: entries.map((e) => [e.title, e.details]),
      })),
    ).toEqual([
      { id: "eventDay", heading: "Today", range: "Sun, Oct 25", entries: [["service", ["Hall"]]] },
      {
        id: "restOfWeek",
        heading: "In the coming days",
        range: "Mon, Oct 26\u2009–\u2009Sat, Oct 31",
        entries: [
          ["prayer", ["Room 2"]],
          ["choir", []],
        ],
      },
      {
        id: "nextEventDay",
        heading: "Next Sunday",
        range: "Sun, Nov 1",
        entries: [["lunch", ["Garden"]]],
      },
    ]);
    const [item] = buildProjectionItems([source(snapshot)], 16 / 9);
    expect(item!.tiles.map((tile) => [tile.id, tile.label])).toEqual([
      ["nw.0", "Next week"],
      ["nwd.0", "Today"],
      ["nww.0", "In the coming days"],
      ["nwn.0", "Next Sunday"],
    ]);
  });

  it("has no groups when the entries are in one group", () => {
    const [section] = source(snapshot.slice(1, 3)).sections;
    expect(section!.groups).toBeUndefined();
    expect(section!.entries.map(({ title, details }) => [title, details])).toEqual([
      ["prayer", ["Room 2"]],
      ["choir", []],
    ]);
  });
});
