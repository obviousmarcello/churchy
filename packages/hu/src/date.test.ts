import { describe, expect, it } from "vitest";
import {
  MONTH_NAMES,
  MONTH_NAMES_SHORT,
  WEEKDAY_NAMES,
  addDays,
  budapestWallClock,
  daysBetween,
  formatDateLong,
  formatDateRange,
  formatDateShort,
  formatMonthDay,
  formatRelativeDay,
  formatWeekRange,
  isoWeekday,
  monthName,
  parseIsoDate,
  parseIsoTime,
  startOfIsoWeek,
  toCivilDate,
  toInstant,
  toIsoDate,
  toIsoDateString,
  todayInBudapest,
  weekdayName,
  weekdayNames,
} from "./index";

describe("parsing", () => {
  it("parses ISO dates", () => {
    expect(parseIsoDate("2026-11-12")).toEqual({ year: 2026, month: 11, day: 12 });
    expect(parseIsoDate("2028-02-29")).toEqual({ year: 2028, month: 2, day: 29 });
  });

  it.each(["2026-13-01", "2026-02-29", "2026-11-31", "2026-1-1", "2026/11/12", "", "x"])(
    "rejects invalid date %j",
    (value) => {
      expect(() => parseIsoDate(value)).toThrow(RangeError);
    },
  );

  it("parses ISO times and ignores seconds", () => {
    expect(parseIsoTime("18:05")).toEqual({ hour: 18, minute: 5 });
    expect(parseIsoTime("07:30:59")).toEqual({ hour: 7, minute: 30 });
  });

  it.each(["24:00", "12:60", "9:00", "12", "ab:cd"])("rejects invalid time %j", (value) => {
    expect(() => parseIsoTime(value)).toThrow(RangeError);
  });

  it("requires an explicit offset on instants", () => {
    expect(() => toInstant("2026-11-12T18:00:00")).toThrow(RangeError);
    expect(() => toInstant("2026-11-12T25:00:00+01:00")).toThrow(RangeError);
    expect(() => toInstant(new Date(NaN))).toThrow(RangeError);
    expect(toInstant("2026-11-12T18:00:00+01:00").toISOString()).toBe("2026-11-12T17:00:00.000Z");
    expect(toInstant("2026-11-12T17:00Z").toISOString()).toBe("2026-11-12T17:00:00.000Z");
    expect(toInstant("2026-11-12T17:00:00.250Z").getUTCMilliseconds()).toBe(250);
    const d = new Date(0);
    expect(toInstant(d)).toBe(d);
  });

  it("formats parts back to an ISO date", () => {
    expect(toIsoDate({ year: 2026, month: 3, day: 5 })).toBe("2026-03-05");
    expect(toIsoDate({ year: 999, month: 1, day: 1 })).toBe("0999-01-01");
  });
});

describe("civil date resolution (Europe/Budapest)", () => {
  it("passes IsoDate through without a time zone", () => {
    expect(toIsoDateString("2026-11-12")).toBe("2026-11-12");
  });

  it("converts instants using the Budapest offset", () => {
    // 23:30Z on 12 Nov is already 00:30 on 13 Nov in Budapest (CET, +01:00)
    expect(toIsoDateString("2026-11-12T23:30:00Z")).toBe("2026-11-13");
    expect(toIsoDateString(new Date("2026-11-12T22:59:00Z"))).toBe("2026-11-12");
    expect(toCivilDate("2026-07-01T22:30:00Z")).toEqual({ year: 2026, month: 7, day: 2 });
  });

  it("reports the Budapest wall clock including midnight as 00", () => {
    expect(budapestWallClock(new Date("2026-11-12T23:00:00Z"))).toEqual({
      year: 2026,
      month: 11,
      day: 13,
      hour: 0,
      minute: 0,
    });
  });

  it("todayInBudapest takes an explicit now", () => {
    expect(todayInBudapest("2026-11-12T10:00:00+01:00")).toBe("2026-11-12");
    expect(todayInBudapest(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
  });
});

describe("weekdays and months", () => {
  it("computes ISO weekdays (Monday = 1, Sunday = 7)", () => {
    expect(isoWeekday("2026-11-09")).toBe(1);
    expect(isoWeekday("2026-11-12")).toBe(4);
    expect(isoWeekday("2026-11-15")).toBe(7);
    expect(isoWeekday("2026-03-29")).toBe(7);
  });

  it("lists weekday names Monday first, with capitalised variants", () => {
    expect(weekdayNames()).toEqual([
      "hétfő",
      "kedd",
      "szerda",
      "csütörtök",
      "péntek",
      "szombat",
      "vasárnap",
    ]);
    expect(weekdayNames({ capitalize: true })[0]).toBe("Hétfő");
    expect(weekdayNames({ capitalize: true })[6]).toBe("Vasárnap");
  });

  it("names weekdays by number or by date", () => {
    expect(weekdayName(1)).toBe("hétfő");
    expect(weekdayName(7, { capitalize: true })).toBe("Vasárnap");
    expect(weekdayName("2026-11-12")).toBe("csütörtök");
    expect(weekdayName("2026-11-14", { capitalize: true })).toBe("Szombat");
  });

  it.each([0, 8, 1.5, NaN])("rejects weekday number %s", (n) => {
    expect(() => weekdayName(n)).toThrow(RangeError);
  });

  it("names months in full, short and capitalised form", () => {
    expect(monthName(11)).toBe("november");
    expect(monthName(11, { short: true })).toBe("nov.");
    expect(monthName(3, { capitalize: true })).toBe("Március");
    expect(() => monthName(0)).toThrow(RangeError);
    expect(() => monthName(13)).toThrow(RangeError);
  });

  it("agrees with the ICU names for weekdays and full month names", () => {
    const wd = new Intl.DateTimeFormat("hu-HU", { weekday: "long", timeZone: "UTC" });
    WEEKDAY_NAMES.forEach((name, i) => {
      expect(wd.format(new Date(Date.UTC(2026, 10, 9 + i, 12)))).toBe(name);
    });
    const mo = new Intl.DateTimeFormat("hu-HU", { month: "long", timeZone: "UTC" });
    MONTH_NAMES.forEach((name, i) => {
      expect(mo.format(new Date(Date.UTC(2026, i, 15, 12)))).toBe(name);
    });
    const short = new Intl.DateTimeFormat("hu-HU", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
    MONTH_NAMES_SHORT.forEach((name, i) => {
      expect(short.format(new Date(Date.UTC(2026, i, 15, 12)))).toBe(`${name} 15.`);
    });
  });
});

describe("long, short and month-day formats", () => {
  it("formats the long date exactly as the PRD (L-02) shows it", () => {
    expect(formatDateLong("2026-11-12")).toBe("2026. november 12., csütörtök");
  });

  it("matches Intl dateStyle full for a spread of dates", () => {
    const full = new Intl.DateTimeFormat("hu-HU", { dateStyle: "full", timeZone: "UTC" });
    for (const iso of [
      "2026-01-01",
      "2026-03-29",
      "2026-08-20",
      "2026-10-25",
      "2027-02-28",
      "2028-02-29",
    ]) {
      const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
      expect(formatDateLong(iso)).toBe(full.format(new Date(Date.UTC(y, m - 1, d, 12))));
    }
  });

  it("formats the short date", () => {
    expect(formatDateShort("2026-11-12")).toBe("2026. 11. 12.");
    expect(formatDateShort("2026-01-05")).toBe("2026. 01. 05.");
  });

  it("formats month-day in short and long style", () => {
    expect(formatMonthDay("2026-11-15")).toBe("nov. 15.");
    expect(formatMonthDay("2026-11-15", { style: "long" })).toBe("november 15.");
    expect(formatMonthDay("2026-09-03")).toBe("szept. 3.");
  });

  it("formats instants in Budapest time", () => {
    expect(formatDateLong("2026-11-12T23:30:00Z")).toBe("2026. november 13., péntek");
    expect(formatDateShort(new Date("2026-06-30T22:00:00Z"))).toBe("2026. 07. 01.");
  });
});

describe("relative day labels", () => {
  const now = "2026-11-12T10:00:00+01:00";

  it("labels today, tomorrow and yesterday", () => {
    expect(formatRelativeDay("2026-11-12", now)).toBe("Ma");
    expect(formatRelativeDay("2026-11-13", now)).toBe("Holnap");
    expect(formatRelativeDay("2026-11-11", now)).toBe("Tegnap");
  });

  it("falls back to weekday and date", () => {
    expect(formatRelativeDay("2026-11-14", now)).toBe("Szombat, nov. 14.");
    expect(formatRelativeDay("2026-11-15", now)).toBe("Vasárnap, nov. 15.");
    expect(formatRelativeDay("2026-11-10", now)).toBe("Kedd, nov. 10.");
  });

  it("supports lower-case labels", () => {
    expect(formatRelativeDay("2026-11-12", now, { lowercase: true })).toBe("ma");
    expect(formatRelativeDay("2026-11-15", now, { lowercase: true })).toBe("vasárnap, nov. 15.");
  });

  it("evaluates now in Budapest, not UTC", () => {
    // 23:30Z on 12 Nov is 13 Nov in Budapest
    expect(formatRelativeDay("2026-11-13", "2026-11-12T23:30:00Z")).toBe("Ma");
    expect(formatRelativeDay("2026-11-13", new Date("2026-11-12T10:00:00Z"))).toBe("Holnap");
  });

  it("accepts a civil date as now", () => {
    expect(formatRelativeDay("2026-11-13", "2026-11-12")).toBe("Holnap");
  });

  it("works across month and year ends", () => {
    expect(formatRelativeDay("2027-01-01", "2026-12-31T12:00:00+01:00")).toBe("Holnap");
    expect(formatRelativeDay("2026-12-31", "2027-01-01T08:00:00+01:00")).toBe("Tegnap");
  });
});

describe("ranges and weeks", () => {
  it("formats a week inside one month", () => {
    expect(formatWeekRange("2026-11-12")).toBe("nov. 9–15.");
    expect(formatWeekRange("2026-11-09")).toBe("nov. 9–15.");
    expect(formatWeekRange("2026-11-15")).toBe("nov. 9–15.");
  });

  it("formats a week across months", () => {
    expect(formatWeekRange("2026-12-02")).toBe("nov. 30. – dec. 6.");
  });

  it("formats a week across years", () => {
    expect(formatWeekRange("2027-01-01")).toBe("2026. dec. 28. – 2027. jan. 3.");
  });

  it("formats generic ranges", () => {
    expect(formatDateRange("2026-11-15", "2026-11-15")).toBe("nov. 15.");
    expect(formatDateRange("2026-11-15", "2026-11-16")).toBe("nov. 15–16.");
    expect(formatDateRange("2026-05-04", "2026-05-10")).toBe("máj. 4–10.");
    expect(formatDateRange("2026-01-01", "2027-01-01")).toBe("2026. jan. 1. – 2027. jan. 1.");
  });

  it("rejects a reversed range", () => {
    expect(() => formatDateRange("2026-11-16", "2026-11-15")).toThrow(RangeError);
  });
});

describe("civil date arithmetic", () => {
  it("adds days across months, years and leap days", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("counts days between dates", () => {
    expect(daysBetween("2026-11-12", "2026-11-15")).toBe(3);
    expect(daysBetween("2026-11-15", "2026-11-12")).toBe(-3);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
  });

  it("finds the Monday of a week", () => {
    expect(startOfIsoWeek("2026-11-15")).toBe("2026-11-09");
    expect(startOfIsoWeek("2026-11-09")).toBe("2026-11-09");
  });
});

describe("DST boundaries (last Sunday of March and October)", () => {
  it("2026-03-29 is the last Sunday of March; the day is 23 hours long", () => {
    expect(isoWeekday("2026-03-29")).toBe(7);
    expect(formatDateLong("2026-03-29")).toBe("2026. március 29., vasárnap");
    // just before and just after the switch, the civil date is the same
    expect(toIsoDateString("2026-03-29T00:59:59Z")).toBe("2026-03-29");
    expect(toIsoDateString("2026-03-29T01:00:00Z")).toBe("2026-03-29");
    // local midnight is 23:00Z the day before (still CET)
    expect(toIsoDateString("2026-03-28T22:59:59Z")).toBe("2026-03-28");
    expect(toIsoDateString("2026-03-28T23:00:00Z")).toBe("2026-03-29");
    // end of the day is 22:00Z (CEST)
    expect(toIsoDateString("2026-03-29T21:59:59Z")).toBe("2026-03-29");
    expect(toIsoDateString("2026-03-29T22:00:00Z")).toBe("2026-03-30");
  });

  it("2026-10-25 is the last Sunday of October; the day is 25 hours long", () => {
    expect(isoWeekday("2026-10-25")).toBe(7);
    expect(formatDateLong("2026-10-25")).toBe("2026. október 25., vasárnap");
    // local midnight is 22:00Z the day before (still CEST)
    expect(toIsoDateString("2026-10-24T21:59:59Z")).toBe("2026-10-24");
    expect(toIsoDateString("2026-10-24T22:00:00Z")).toBe("2026-10-25");
    // end of the day is 23:00Z (CET)
    expect(toIsoDateString("2026-10-25T22:59:59Z")).toBe("2026-10-25");
    expect(toIsoDateString("2026-10-25T23:00:00Z")).toBe("2026-10-26");
  });

  it("relative labels follow Budapest midnight on the transition days", () => {
    expect(formatRelativeDay("2026-03-29", "2026-03-28T23:30:00Z")).toBe("Ma");
    expect(formatRelativeDay("2026-03-30", "2026-03-28T23:30:00Z")).toBe("Holnap");
    expect(formatRelativeDay("2026-10-25", "2026-10-24T22:30:00Z")).toBe("Ma");
    expect(formatRelativeDay("2026-10-25", "2026-10-25T23:30:00Z")).toBe("Tegnap");
  });

  it("weeks containing a transition keep seven civil days", () => {
    expect(formatWeekRange("2026-03-29")).toBe("márc. 23–29.");
    expect(formatWeekRange("2026-03-30")).toBe("márc. 30. – ápr. 5.");
    expect(formatWeekRange("2026-10-25")).toBe("okt. 19–25.");
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30");
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26");
  });

  it("the following year's transitions (28 March and 31 October 2027)", () => {
    expect(isoWeekday("2027-03-28")).toBe(7);
    expect(isoWeekday("2027-10-31")).toBe(7);
    expect(toIsoDateString("2027-03-27T23:00:00Z")).toBe("2027-03-28");
    expect(toIsoDateString("2027-10-30T22:00:00Z")).toBe("2027-10-31");
  });
});
