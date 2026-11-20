import { describe, expect, it } from "vitest";
import { publicHoliday, publicHolidays } from "./holidays";

const short = (year: number) =>
  publicHolidays(year).map((h) => [h.date, h.key, h.name, h.moveable] as const);

describe("publicHolidays", () => {
  it("lists every holiday of 2025 (before Szenteste became a public holiday)", () => {
    expect(short(2025)).toEqual([
      ["2025-01-01", "newYear", "Újév", false],
      ["2025-03-15", "revolution1848", "Nemzeti ünnep", false],
      ["2025-04-18", "goodFriday", "Nagypéntek", true],
      ["2025-04-21", "easterMonday", "Húsvéthétfő", true],
      ["2025-05-01", "labourDay", "A munka ünnepe", false],
      ["2025-06-09", "pentecostMonday", "Pünkösdhétfő", true],
      ["2025-08-20", "stateFoundation", "Államalapítás ünnepe", false],
      ["2025-10-23", "revolution1956", "Nemzeti ünnep", false],
      ["2025-11-01", "allSaints", "Mindenszentek", false],
      ["2025-12-25", "christmas", "Karácsony", false],
      ["2025-12-26", "christmasSecondDay", "Karácsony másnapja", false],
    ]);
  });

  it("lists every holiday of 2026", () => {
    expect(short(2026)).toEqual([
      ["2026-01-01", "newYear", "Újév", false],
      ["2026-03-15", "revolution1848", "Nemzeti ünnep", false],
      ["2026-04-03", "goodFriday", "Nagypéntek", true],
      ["2026-04-06", "easterMonday", "Húsvéthétfő", true],
      ["2026-05-01", "labourDay", "A munka ünnepe", false],
      ["2026-05-25", "pentecostMonday", "Pünkösdhétfő", true],
      ["2026-08-20", "stateFoundation", "Államalapítás ünnepe", false],
      ["2026-10-23", "revolution1956", "Nemzeti ünnep", false],
      ["2026-11-01", "allSaints", "Mindenszentek", false],
      ["2026-12-24", "christmasEve", "Szenteste", false],
      ["2026-12-25", "christmas", "Karácsony", false],
      ["2026-12-26", "christmasSecondDay", "Karácsony másnapja", false],
    ]);
  });

  it("lists every holiday of 2027 (early Easter)", () => {
    expect(short(2027)).toEqual([
      ["2027-01-01", "newYear", "Újév", false],
      ["2027-03-15", "revolution1848", "Nemzeti ünnep", false],
      ["2027-03-26", "goodFriday", "Nagypéntek", true],
      ["2027-03-29", "easterMonday", "Húsvéthétfő", true],
      ["2027-05-01", "labourDay", "A munka ünnepe", false],
      ["2027-05-17", "pentecostMonday", "Pünkösdhétfő", true],
      ["2027-08-20", "stateFoundation", "Államalapítás ünnepe", false],
      ["2027-10-23", "revolution1956", "Nemzeti ünnep", false],
      ["2027-11-01", "allSaints", "Mindenszentek", false],
      ["2027-12-24", "christmasEve", "Szenteste", false],
      ["2027-12-25", "christmas", "Karácsony", false],
      ["2027-12-26", "christmasSecondDay", "Karácsony másnapja", false],
    ]);
  });

  it("has no Nagypéntek holiday before 2017", () => {
    expect(publicHolidays(2016).some((h) => h.key === "goodFriday")).toBe(false);
    expect(publicHolidays(2017).find((h) => h.key === "goodFriday")?.date).toBe("2017-04-14");
  });

  it("is memoised and frozen", () => {
    const list = publicHolidays(2026);
    expect(publicHolidays(2026)).toBe(list);
    expect(Object.isFrozen(list)).toBe(true);
    expect(Object.isFrozen(list[0])).toBe(true);
  });
});

describe("publicHoliday", () => {
  it("returns the holiday on a given date", () => {
    expect(publicHoliday("2026-10-23")).toEqual({
      date: "2026-10-23",
      key: "revolution1956",
      name: "Nemzeti ünnep",
      moveable: false,
    });
    expect(publicHoliday("2026-05-25")?.name).toBe("Pünkösdhétfő");
    expect(publicHoliday("2026-12-24")?.name).toBe("Szenteste");
  });

  it("returns null on ordinary days, Easter Sunday and pre-2026 Christmas Eve", () => {
    expect(publicHoliday("2026-11-13")).toBeNull();
    expect(publicHoliday("2026-04-05")).toBeNull();
    expect(publicHoliday("2025-12-24")).toBeNull();
  });

  it("rejects invalid dates", () => {
    expect(() => publicHoliday("2026-02-30")).toThrow(RangeError);
  });
});
