import { describe, expect, it } from "vitest";
import { dayWindow, expandEvents } from "./expand";
import {
  addMonths,
  formatYearMonth,
  monthGrid,
  occurrencesByDay,
  parseYearMonth,
  yearMonthOf,
} from "./month";
import { richTextParagraphs, richTextPlain } from "./rich-text";
import {
  budapestDate,
  formatInstant,
  offsetAt,
  parseDay,
  parseInstant,
  startOfDay,
  weekdayOf,
  zonedToInstant,
} from "./time";

describe("time", () => {
  it("knows the Budapest offset around both DST changes", () => {
    expect(offsetAt(Date.parse("2026-03-29T00:59:00Z"))).toBe(60);
    expect(offsetAt(Date.parse("2026-03-29T01:00:00Z"))).toBe(120);
    expect(offsetAt(Date.parse("2026-10-25T00:59:00Z"))).toBe(120);
    expect(offsetAt(Date.parse("2026-10-25T01:00:00Z"))).toBe(60);
  });

  it("resolves wall times, gaps and overlaps", () => {
    const day = parseDay("2026-03-29");
    expect(formatInstant(zonedToInstant(day, 90 * 60_000))).toBe("2026-03-29T01:30:00+01:00");
    expect(formatInstant(zonedToInstant(day, 150 * 60_000))).toBe("2026-03-29T03:30:00+02:00");
    const autumn = parseDay("2026-10-25");
    expect(formatInstant(zonedToInstant(autumn, 150 * 60_000))).toBe("2026-10-25T02:30:00+02:00");
    expect(formatInstant(zonedToInstant(autumn, 210 * 60_000))).toBe("2026-10-25T03:30:00+01:00");
  });

  it("parses and formats dates and instants", () => {
    expect(weekdayOf(parseDay("2026-11-16"))).toBe(1);
    expect(weekdayOf(parseDay("1969-12-28"))).toBe(7);
    expect(() => parseDay("2026-02-30")).toThrow(RangeError);
    expect(() => parseDay("2026-13-01")).toThrow(RangeError);
    expect(() => parseInstant("2026-11-20T18:00:00")).toThrow(RangeError);
    expect(budapestDate("2026-11-19T23:30:00Z")).toBe("2026-11-20");
    expect(startOfDay("2026-10-25")).toBe("2026-10-25T00:00:00+02:00");
    expect(formatInstant(Date.parse("2026-11-20T17:05:09Z"))).toBe("2026-11-20T18:05:09+01:00");
  });
});

describe("month view helpers", () => {
  it("builds a Monday-first grid", () => {
    const grid = monthGrid({ year: 2026, month: 11 });
    expect(grid.first).toBe("2026-11-01");
    expect(grid.last).toBe("2026-11-30");
    // 1 November 2026 is a Sunday: six empty cells before it.
    expect(grid.weeks[0]).toEqual([null, null, null, null, null, null, "2026-11-01"]);
    expect(grid.weeks).toHaveLength(6);
    expect(grid.weeks.at(-1)).toEqual(["2026-11-30", null, null, null, null, null, null]);
    expect(grid.weeks.every((w) => w.length === 7)).toBe(true);
    // February 2027 starts on a Monday and fills exactly four weeks.
    expect(monthGrid({ year: 2027, month: 2 }).weeks).toHaveLength(4);
  });

  it("parses, formats and shifts months", () => {
    expect(parseYearMonth("2026-11")).toEqual({ year: 2026, month: 11 });
    for (const bad of ["2026-13", "2026-1", "1800-01", "x", null, undefined]) {
      expect(parseYearMonth(bad)).toBeNull();
    }
    expect(formatYearMonth({ year: 2027, month: 1 })).toBe("2027-01");
    expect(addMonths({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(addMonths({ year: 2026, month: 5 }, -17)).toEqual({ year: 2024, month: 12 });
    expect(yearMonthOf("2026-11-14")).toEqual({ year: 2026, month: 11 });
    expect(() => yearMonthOf("2026-11-31")).toThrow(RangeError);
  });

  it("groups occurrences by day, spreading multi-day ones and clipping to the range", () => {
    const camp = {
      id: "camp",
      startsAt: "2026-10-30T00:00:00+01:00",
      endsAt: "2026-11-03T00:00:00+01:00",
      allDay: true,
      rrule: null,
      exdates: [],
      parentEventId: null,
      recurrenceId: null,
    };
    const talk = {
      ...camp,
      id: "talk",
      startsAt: "2026-11-02T18:00:00+01:00",
      endsAt: null,
      allDay: false,
    };
    const occ = expandEvents([camp, talk], dayWindow("2026-11-01", "2026-11-30"));
    const byDay = occurrencesByDay(occ, "2026-11-01", "2026-11-30");
    expect([...byDay.keys()]).toEqual(["2026-11-01", "2026-11-02"]);
    expect(byDay.get("2026-11-02")!.map((o) => o.event.id)).toEqual(["camp", "talk"]);
  });
});

describe("rich text → plain text", () => {
  const doc = {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Program" }] },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Szeretettel " },
          { type: "text", text: "várjuk", marks: [{ type: "bold" }] },
          { type: "hardBreak" },
          { type: "text", text: "Önöket!" },
        ],
      },
      { type: "paragraph", content: [] },
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [{ type: "paragraph", content: [{ type: "text", text: "ének" }] }],
          },
          {
            type: "listItem",
            content: [{ type: "paragraph", content: [{ type: "text", text: "ima" }] }],
          },
        ],
      },
      { type: "image", attrs: { src: "x" } },
      { type: "paragraph", content: [{ type: "text", text: "<b>nem HTML</b>" }] },
    ],
  };

  it("reads only text nodes", () => {
    expect(richTextParagraphs(doc)).toEqual([
      "Program",
      "Szeretettel várjuk\nÖnöket!",
      "– ének",
      "– ima",
      "<b>nem HTML</b>",
    ]);
    expect(
      richTextPlain({
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "a" }] },
          { type: "paragraph", content: [{ type: "text", text: "b" }] },
        ],
      }),
    ).toBe("a\n\nb");
    expect(richTextParagraphs(null)).toEqual([]);
    expect(richTextParagraphs("doc")).toEqual([]);
  });
});
