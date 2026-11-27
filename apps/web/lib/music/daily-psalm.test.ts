import { describe, expect, it } from "vitest";

import {
  EXCERPT_MAX_LENGTH,
  localDay,
  msToNextDay,
  PSALM_COUNT,
  psalmExcerpt,
  psalmOfDay,
} from "./daily-psalm";

describe("psalmOfDay", () => {
  it("starts at Psalm 1 and goes one psalm per day", () => {
    expect(psalmOfDay(new Date(2026, 9, 11))).toBe(1);
    expect(psalmOfDay(new Date(2026, 9, 11, 23, 59))).toBe(1);
    expect(psalmOfDay(new Date(2026, 9, 12, 0, 1))).toBe(2);
    expect(psalmOfDay(new Date(2026, 9, 12 + 148))).toBe(150);
  });

  it("starts again at Psalm 1 after Psalm 150", () => {
    expect(psalmOfDay(new Date(2026, 9, 11 + PSALM_COUNT))).toBe(1);
    expect(psalmOfDay(new Date(2026, 9, 10))).toBe(150);
  });

  it("does not skip or repeat a day across a daylight saving change", () => {
    let previous = psalmOfDay(new Date(2027, 0, 1));
    for (let day = 2; day <= 366; day++) {
      const psalm = psalmOfDay(new Date(2027, 0, day));
      expect(psalm).toBe((previous % PSALM_COUNT) + 1);
      previous = psalm;
    }
  });
});

describe("localDay and msToNextDay", () => {
  it("is the local calendar date", () => {
    expect(localDay(new Date(2026, 9, 1, 0, 0))).toBe("2026-10-01");
    expect(localDay(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31");
  });

  it("is the time to the next local midnight", () => {
    expect(msToNextDay(new Date(2026, 9, 11, 23, 0))).toBe(60 * 60 * 1000);
  });
});

describe("psalmExcerpt", () => {
  it("takes the first verses while the text is short", () => {
    expect(psalmExcerpt(["Egy.", "Kettő.", "Három.", "Négy."])).toEqual({
      first: 1,
      last: 3,
      text: "Egy. Kettő. Három.",
    });
  });

  it("takes at least one verse, however long, and skips empty ones", () => {
    const long = "x".repeat(EXCERPT_MAX_LENGTH + 50);
    expect(psalmExcerpt([long, "Kettő."])).toEqual({ first: 1, last: 1, text: long });
    expect(psalmExcerpt(["", "  ", "Három.", "Négy."])).toEqual({
      first: 3,
      last: 4,
      text: "Három. Négy.",
    });
  });

  it("stops before a verse that would make the text too long", () => {
    const verse = "y".repeat(150);
    expect(psalmExcerpt([verse, verse])?.last).toBe(1);
  });

  it("has nothing for a book without text", () => {
    expect(psalmExcerpt([])).toBeNull();
    expect(psalmExcerpt([" "])).toBeNull();
  });
});
