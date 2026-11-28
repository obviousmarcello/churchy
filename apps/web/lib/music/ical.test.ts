import { describe, expect, it } from "vitest";

import { buildCalendar, escapeText, foldLine, formatUtc } from "./ical";

const octets = (text: string) => new TextEncoder().encode(text).length;

describe("formatUtc", () => {
  it("writes the time in UTC without separators", () => {
    expect(formatUtc(Date.parse("2026-10-11T08:30:05.123Z"))).toBe("20261011T083005Z");
  });
});

describe("escapeText", () => {
  it("escapes the special characters and the line breaks", () => {
    expect(escapeText("a\\b;c,d\r\ne\nf")).toBe("a\\\\b\\;c\\,d\\ne\\nf");
  });

  it("removes other control characters", () => {
    expect(escapeText("a\u0007b\tc")).toBe("abc");
  });
});

describe("foldLine", () => {
  it("keeps a short line", () => {
    expect(foldLine("SUMMARY:Sunday service")).toBe("SUMMARY:Sunday service");
  });

  it("folds a long line into lines of at most 75 octets", () => {
    const line = `DESCRIPTION:${"Árvíztűrő tükörfúrógép ".repeat(10)}🎵`;
    const folded = foldLine(line);
    const lines = folded.split("\r\n");
    expect(lines.length).toBeGreaterThan(1);
    for (const part of lines) expect(octets(part)).toBeLessThanOrEqual(75);
    expect(lines.slice(1).every((part) => part.startsWith(" "))).toBe(true);
    // Unfolding gives the line back, so no character was cut.
    expect(folded.replace(/\r\n /g, "")).toBe(line);
  });
});

describe("buildCalendar", () => {
  it("writes one event with CRLF line ends", () => {
    const text = buildCalendar({
      name: "My events",
      now: Date.parse("2026-10-17T12:00:00Z"),
      events: [
        {
          uid: "abc@music-sheet-db",
          start: "2026-10-18T08:00:00.000Z",
          end: "2026-10-18T09:30:00.000Z",
          title: "Sunday service, 10:00",
          description: "1. Amazing Grace (G)\n2. Announcements",
          url: "https://example.com/en/events/abc",
        },
      ],
    });
    expect(text.endsWith("\r\n")).toBe(true);
    expect(text.split("\r\n").slice(0, -1)).toEqual([
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Music Sheet DB//Events//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:My events",
      "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
      "X-PUBLISHED-TTL:PT1H",
      "BEGIN:VEVENT",
      "UID:abc@music-sheet-db",
      "DTSTAMP:20261017T120000Z",
      "DTSTART:20261018T080000Z",
      "DTEND:20261018T093000Z",
      "SUMMARY:Sunday service\\, 10:00",
      "DESCRIPTION:1. Amazing Grace (G)\\n2. Announcements",
      "URL:https://example.com/en/events/abc",
      "END:VEVENT",
      "END:VCALENDAR",
    ]);
  });

  it("writes a calendar without events", () => {
    const text = buildCalendar({ name: "My events", now: 0, events: [] });
    expect(text).toContain("BEGIN:VCALENDAR\r\n");
    expect(text).not.toContain("BEGIN:VEVENT");
  });
});
