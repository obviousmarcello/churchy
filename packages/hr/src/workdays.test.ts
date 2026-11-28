import { describe, expect, it } from "vitest";
import {
  MAX_PERIOD_DAYS,
  breakdown,
  buildWorkdayCalendar,
  dayKind,
  isPublicWorkday,
  workingDays,
  worksOn,
  type WorkdayEntry,
} from "./workdays";

/** Hungarian public holidays 2026/2027 (weekday in the comment) and a few swapped days. */
const HOLIDAYS_2026 = [
  "2026-01-01", // Thu
  "2026-03-15", // Sun
  "2026-04-03", // Fri, Nagypéntek
  "2026-04-06", // Mon, Húsvéthétfő
  "2026-05-01", // Fri
  "2026-05-25", // Mon, Pünkösdhétfő
  "2026-08-20", // Thu
  "2026-10-23", // Fri
  "2026-11-01", // Sun
  "2026-12-24", // Thu
  "2026-12-25", // Fri
  "2026-12-26", // Sat
  "2027-01-01", // Fri
];
const entries: WorkdayEntry[] = [
  ...HOLIDAYS_2026.map((date): WorkdayEntry => ({ date, kind: "holiday", name: "Ünnep" })),
  { date: "2026-01-02", kind: "swapped_restday", name: "Pihenőnap" },
  { date: "2026-01-10", kind: "swapped_workday", name: "Munkanap" },
  { date: "2026-05-14", kind: "swapped_restday", name: "Pihenőnap" },
  { date: "2026-08-08", kind: "swapped_workday", name: "Munkanap" },
  { date: "2026-08-21", kind: "swapped_restday", name: "Pihenőnap" },
];
const calendar = buildWorkdayCalendar(entries);

const MON_FRI = [1, 2, 3, 4, 5];
const TUE_SUN = [2, 3, 4, 5, 6, 7];
const PART_TIME = [1, 2, 4];

interface Case {
  name: string;
  weekdays: number[];
  from: string;
  to: string;
  expected: number;
  halfStart?: boolean;
  halfEnd?: boolean;
}

const CASES: Case[] = [
  { name: "a single Monday", weekdays: MON_FRI, from: "2026-03-02", to: "2026-03-02", expected: 1 },
  {
    name: "a Monday–Friday week",
    weekdays: MON_FRI,
    from: "2026-03-02",
    to: "2026-03-06",
    expected: 5,
  },
  {
    name: "a full week skips the weekend",
    weekdays: MON_FRI,
    from: "2026-03-02",
    to: "2026-03-08",
    expected: 5,
  },
  { name: "a weekend only", weekdays: MON_FRI, from: "2026-03-07", to: "2026-03-08", expected: 0 },
  {
    name: "Tue–Sun pattern, Monday to Sunday",
    weekdays: TUE_SUN,
    from: "2026-03-02",
    to: "2026-03-08",
    expected: 6,
  },
  {
    name: "Tue–Sun pattern, a Sunday",
    weekdays: TUE_SUN,
    from: "2026-03-08",
    to: "2026-03-08",
    expected: 1,
  },
  {
    name: "Tue–Sun pattern, a Monday",
    weekdays: TUE_SUN,
    from: "2026-03-02",
    to: "2026-03-02",
    expected: 0,
  },
  {
    name: "Tue–Sun pattern with a Sunday holiday",
    weekdays: TUE_SUN,
    from: "2026-03-09",
    to: "2026-03-15",
    expected: 5,
  },
  {
    name: "a Sunday holiday does not touch Mon–Fri",
    weekdays: MON_FRI,
    from: "2026-03-13",
    to: "2026-03-17",
    expected: 3,
  },
  {
    name: "Easter: Good Friday to Easter Monday",
    weekdays: MON_FRI,
    from: "2026-04-03",
    to: "2026-04-06",
    expected: 0,
  },
  {
    name: "two weeks around Easter, Mon–Fri",
    weekdays: MON_FRI,
    from: "2026-03-30",
    to: "2026-04-10",
    expected: 8,
  },
  {
    name: "two weeks around Easter, Tue–Sun",
    weekdays: TUE_SUN,
    from: "2026-03-30",
    to: "2026-04-10",
    expected: 9,
  },
  {
    name: "half day at the start",
    weekdays: MON_FRI,
    from: "2026-03-02",
    to: "2026-03-06",
    halfStart: true,
    expected: 4.5,
  },
  {
    name: "half day at the end",
    weekdays: MON_FRI,
    from: "2026-03-02",
    to: "2026-03-06",
    halfEnd: true,
    expected: 4.5,
  },
  {
    name: "half days at both ends",
    weekdays: MON_FRI,
    from: "2026-03-02",
    to: "2026-03-06",
    halfStart: true,
    halfEnd: true,
    expected: 4,
  },
  {
    name: "one day, half at the start",
    weekdays: MON_FRI,
    from: "2026-03-03",
    to: "2026-03-03",
    halfStart: true,
    expected: 0.5,
  },
  {
    name: "one day, half at the end",
    weekdays: MON_FRI,
    from: "2026-03-03",
    to: "2026-03-03",
    halfEnd: true,
    expected: 0.5,
  },
  {
    name: "one day, both flags are still one half day",
    weekdays: MON_FRI,
    from: "2026-03-03",
    to: "2026-03-03",
    halfStart: true,
    halfEnd: true,
    expected: 0.5,
  },
  {
    name: "two days, both half",
    weekdays: MON_FRI,
    from: "2026-03-02",
    to: "2026-03-03",
    halfStart: true,
    halfEnd: true,
    expected: 1,
  },
  {
    name: "half day on a Saturday changes nothing",
    weekdays: MON_FRI,
    from: "2026-03-07",
    to: "2026-03-10",
    halfStart: true,
    expected: 2,
  },
  {
    name: "half day on a holiday changes nothing",
    weekdays: MON_FRI,
    from: "2026-04-02",
    to: "2026-04-03",
    halfEnd: true,
    expected: 1,
  },
  {
    name: "half day at the start on a holiday changes nothing",
    weekdays: MON_FRI,
    from: "2026-05-01",
    to: "2026-05-04",
    halfStart: true,
    expected: 1,
  },
  {
    name: "half day with a Tue–Sun pattern at the weekend",
    weekdays: TUE_SUN,
    from: "2026-03-06",
    to: "2026-03-07",
    halfEnd: true,
    expected: 1.5,
  },
  { name: "year boundary", weekdays: MON_FRI, from: "2026-12-28", to: "2027-01-05", expected: 6 },
  {
    name: "Christmas week 2026",
    weekdays: MON_FRI,
    from: "2026-12-21",
    to: "2026-12-31",
    expected: 7,
  },
  {
    name: "a swapped Saturday workday counts for a full week",
    weekdays: MON_FRI,
    from: "2026-01-05",
    to: "2026-01-11",
    expected: 6,
  },
  {
    name: "a swapped rest day is off, the holiday too",
    weekdays: MON_FRI,
    from: "2026-01-01",
    to: "2026-01-04",
    expected: 0,
  },
  {
    name: "New Year week with a swapped rest day",
    weekdays: MON_FRI,
    from: "2026-01-01",
    to: "2026-01-09",
    expected: 5,
  },
  {
    name: "a swapped rest day does not bind a Tue–Sun worker",
    weekdays: TUE_SUN,
    from: "2026-01-02",
    to: "2026-01-02",
    expected: 1,
  },
  {
    name: "a swapped Saturday is not counted twice for Tue–Sun",
    weekdays: TUE_SUN,
    from: "2026-01-10",
    to: "2026-01-10",
    expected: 1,
  },
  {
    name: "part-time Mon/Tue/Thu",
    weekdays: PART_TIME,
    from: "2026-03-02",
    to: "2026-03-08",
    expected: 3,
  },
  {
    name: "a swapped Saturday does not apply to part-time",
    weekdays: PART_TIME,
    from: "2026-01-10",
    to: "2026-01-10",
    expected: 0,
  },
  {
    name: "a swapped Thursday rest day applies to part-time",
    weekdays: PART_TIME,
    from: "2026-05-11",
    to: "2026-05-17",
    expected: 2,
  },
  {
    name: "August swap: Saturday work, Friday rest",
    weekdays: MON_FRI,
    from: "2026-08-03",
    to: "2026-08-23",
    expected: 14,
  },
  {
    name: "a reversed period",
    weekdays: MON_FRI,
    from: "2026-03-06",
    to: "2026-03-02",
    expected: 0,
  },
  { name: "a holiday alone", weekdays: MON_FRI, from: "2026-05-01", to: "2026-05-01", expected: 0 },
  {
    name: "a weekend day alone",
    weekdays: MON_FRI,
    from: "2026-03-07",
    to: "2026-03-07",
    expected: 0,
  },
  { name: "month boundary", weekdays: MON_FRI, from: "2026-02-27", to: "2026-03-03", expected: 3 },
  { name: "leap day", weekdays: MON_FRI, from: "2028-02-28", to: "2028-03-01", expected: 3 },
  { name: "no working weekdays", weekdays: [], from: "2026-03-02", to: "2026-03-08", expected: 0 },
  {
    name: "weekend-only pattern",
    weekdays: [6, 7],
    from: "2026-03-02",
    to: "2026-03-08",
    expected: 2,
  },
  {
    name: "seven-day pattern",
    weekdays: [1, 2, 3, 4, 5, 6, 7],
    from: "2026-03-02",
    to: "2026-03-08",
    expected: 7,
  },
  {
    name: "seven-day pattern with a holiday",
    weekdays: [1, 2, 3, 4, 5, 6, 7],
    from: "2026-03-09",
    to: "2026-03-15",
    expected: 6,
  },
  {
    name: "the whole of 2026, Mon–Fri",
    weekdays: MON_FRI,
    from: "2026-01-01",
    to: "2026-12-31",
    expected: 251,
  },
  {
    name: "the whole of 2026, Tue–Sun",
    weekdays: TUE_SUN,
    from: "2026-01-01",
    to: "2026-12-31",
    expected: 303,
  },
];

describe("workingDays", () => {
  it("has at least 40 cases", () => {
    expect(CASES.length).toBeGreaterThanOrEqual(40);
  });

  it.each(CASES)("$name", ({ weekdays, from, to, halfStart, halfEnd, expected }) => {
    expect(
      workingDays({
        weekdays,
        startDate: from,
        endDate: to,
        halfDayStart: halfStart,
        halfDayEnd: halfEnd,
        calendar,
      }),
    ).toBe(expected);
  });

  it("is a multiple of 0.5 and never negative", () => {
    for (const c of CASES) {
      const n = workingDays({
        weekdays: c.weekdays,
        startDate: c.from,
        endDate: c.to,
        halfDayStart: c.halfStart,
        halfDayEnd: c.halfEnd,
        calendar,
      });
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n * 2).toBe(Math.round(n * 2));
    }
  });
});

describe("dayKind and breakdown", () => {
  it("explains how each day counts", () => {
    expect(dayKind("2026-03-02", MON_FRI, calendar)).toBe("workday");
    expect(dayKind("2026-03-07", MON_FRI, calendar)).toBe("notInPattern");
    expect(dayKind("2026-05-01", MON_FRI, calendar)).toBe("holiday");
    expect(dayKind("2026-01-10", MON_FRI, calendar)).toBe("swappedWorkday");
    expect(dayKind("2026-01-02", MON_FRI, calendar)).toBe("swappedRestday");
  });

  it("lists every day of a period, and nothing for a reversed one", () => {
    expect(
      breakdown({ weekdays: MON_FRI, startDate: "2026-03-02", endDate: "2026-03-04", calendar }),
    ).toHaveLength(3);
    expect(
      breakdown({ weekdays: MON_FRI, startDate: "2026-03-04", endDate: "2026-03-02", calendar }),
    ).toEqual([]);
  });

  it("caps very long periods", () => {
    const days = breakdown({
      weekdays: MON_FRI,
      startDate: "2026-01-01",
      endDate: "2030-12-31",
      calendar,
    });
    expect(days).toHaveLength(MAX_PERIOD_DAYS);
  });

  it("worksOn and isPublicWorkday follow the calendar", () => {
    expect(worksOn("2026-03-02", TUE_SUN, calendar)).toBe(false);
    expect(worksOn("2026-03-03", TUE_SUN, calendar)).toBe(true);
    expect(isPublicWorkday("2026-01-10", calendar)).toBe(true);
    expect(isPublicWorkday("2026-01-02", calendar)).toBe(false);
    expect(isPublicWorkday("2026-12-24", calendar)).toBe(false);
  });
});
