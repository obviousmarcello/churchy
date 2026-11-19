import { describe, expect, it } from "vitest";
import { REMINDER_RATIO, addWorkingMinutes, dueAt, slaStatus, workingMinutesBetween } from "./sla";
import { median, ticketStats, type StatTicket } from "./stats";
import { buildWorkdayCalendar } from "./workdays";

// Budapest is UTC+1 in winter (CET), UTC+2 in summer (CEST).
const calendar = buildWorkdayCalendar([
  { date: "2026-12-24", kind: "holiday" },
  { date: "2026-12-25", kind: "holiday" },
  { date: "2026-03-16", kind: "swapped_restday" },
  { date: "2026-03-21", kind: "swapped_workday" },
]);

describe("working-time arithmetic", () => {
  it("adds working hours inside one day", () => {
    // Tue 2026-11-17 09:00 CET + 2 h = 11:00 CET
    expect(addWorkingMinutes("2026-11-17T08:00:00Z", 120, calendar).toISOString()).toBe(
      "2026-11-17T10:00:00.000Z",
    );
  });

  it("rolls over to the next working day and skips the weekend", () => {
    // Fri 2026-11-20 15:00 CET + 2 h → Mon 2026-11-23 09:00 CET
    expect(addWorkingMinutes("2026-11-20T14:00:00Z", 120, calendar).toISOString()).toBe(
      "2026-11-23T08:00:00.000Z",
    );
  });

  it("starts the clock at opening time when submitted out of hours", () => {
    // Sat 10:00 → Mon 08:00 + 1 h
    expect(addWorkingMinutes("2026-11-21T09:00:00Z", 60, calendar).toISOString()).toBe(
      "2026-11-23T08:00:00.000Z",
    );
    // Tue 06:00 CET → 08:00 + 1 h
    expect(addWorkingMinutes("2026-11-17T05:00:00Z", 60, calendar).toISOString()).toBe(
      "2026-11-17T08:00:00.000Z",
    );
    // Tue 17:00 CET → Wed 08:00 + 1 h
    expect(addWorkingMinutes("2026-11-17T16:00:00Z", 60, calendar).toISOString()).toBe(
      "2026-11-18T08:00:00.000Z",
    );
  });

  it("skips holidays and swapped rest days, uses swapped workdays", () => {
    // Wed 23 Dec 15:00 CET + 2 h → Thu/Fri holidays, Sat/Sun → Mon 28 Dec 09:00
    expect(addWorkingMinutes("2026-12-23T14:00:00Z", 120, calendar).toISOString()).toBe(
      "2026-12-28T08:00:00.000Z",
    );
    // Fri 13 Mar 15:00 + 2 h: Mon 16 is a swapped rest day → Tue 17 09:00 (CET until 29 Mar)
    expect(addWorkingMinutes("2026-03-13T14:00:00Z", 120, calendar).toISOString()).toBe(
      "2026-03-17T08:00:00.000Z",
    );
    // Sat 21 Mar is a workday
    expect(workingMinutesBetween("2026-03-21T07:00:00Z", "2026-03-21T15:00:00Z", calendar)).toBe(
      480,
    );
  });

  it("handles the DST change (29 March 2026) and summer time", () => {
    // Fri 27 Mar 15:00 CET + 2 h → Mon 30 Mar 09:00 CEST = 07:00Z
    expect(addWorkingMinutes("2026-03-27T14:00:00Z", 120, calendar).toISOString()).toBe(
      "2026-03-30T07:00:00.000Z",
    );
  });

  it("counts working minutes between instants", () => {
    // Mon 09:00 → Wed 12:00 CET = 7 h + 8 h + 4 h
    expect(workingMinutesBetween("2026-11-16T08:00:00Z", "2026-11-18T11:00:00Z", calendar)).toBe(
      (7 + 8 + 4) * 60,
    );
    expect(workingMinutesBetween("2026-11-18T11:00:00Z", "2026-11-16T08:00:00Z", calendar)).toBe(0);
    // A weekend counts nothing.
    expect(workingMinutesBetween("2026-11-21T08:00:00Z", "2026-11-22T20:00:00Z", calendar)).toBe(0);
  });

  it("dueAt is null without an SLA", () => {
    expect(dueAt("2026-11-17T08:00:00Z", null, calendar)).toBeNull();
    expect(dueAt("2026-11-17T08:00:00Z", 8, calendar)).toBe("2026-11-18T08:00:00.000Z");
  });
});

describe("slaStatus", () => {
  const base = { createdAt: "2026-11-16T07:00:00Z", slaHours: 16, closedAt: null }; // Mon 08:00 CET

  it("has no state without an SLA", () => {
    expect(slaStatus({ ...base, slaHours: null }, "2026-11-30T07:00:00Z", calendar).state).toBe(
      "none",
    );
  });

  it("is ok, then reminds at 75 %, then is overdue", () => {
    expect(REMINDER_RATIO).toBe(0.75);
    // 16 working hours = Mon + Tue. Mon 12:00 = 4 h used (25 %).
    expect(slaStatus(base, "2026-11-16T11:00:00Z", calendar).state).toBe("ok");
    // Tue 10:00 = 8 + 2 = 10 h (62.5 %) still ok; Tue 12:00 = 12 h = 75 % → reminder
    expect(slaStatus(base, "2026-11-17T09:00:00Z", calendar).state).toBe("ok");
    expect(slaStatus(base, "2026-11-17T11:00:00Z", calendar).state).toBe("reminder");
    // Due exactly Tue 16:00; one minute later: overdue
    expect(slaStatus(base, "2026-11-17T15:00:00Z", calendar).state).toBe("reminder");
    const late = slaStatus(base, "2026-11-18T08:00:00Z", calendar);
    expect(late.state).toBe("overdue");
    expect(late.minutesLeft).toBeLessThan(0);
    expect(late.dueAt).toBe("2026-11-17T15:00:00.000Z");
  });

  it("judges a closed ticket at its closing time", () => {
    expect(
      slaStatus({ ...base, closedAt: "2026-11-17T10:00:00Z" }, "2026-12-01T00:00:00Z", calendar)
        .state,
    ).toBe("metOnTime");
    expect(
      slaStatus({ ...base, closedAt: "2026-11-19T10:00:00Z" }, "2026-12-01T00:00:00Z", calendar)
        .state,
    ).toBe("metLate");
  });

  it("does not run on the weekend", () => {
    // Created Fri 15:00 CET, 16 h SLA; on Sunday only 1 h has elapsed.
    const s = slaStatus(
      { createdAt: "2026-11-20T14:00:00Z", slaHours: 16, closedAt: null },
      "2026-11-22T12:00:00Z",
      calendar,
    );
    expect(s.state).toBe("ok");
    expect(s.ratio).toBeCloseTo(1 / 16);
  });
});

describe("ticketStats", () => {
  const ticket = (over: Partial<StatTicket> & { id: string }): StatTicket => ({
    categoryId: "leave",
    status: "folyamatban",
    createdAt: "2026-11-16T07:00:00Z",
    closedAt: null,
    slaHours: 8,
    ...over,
  });
  const now = "2026-11-19T12:00:00Z";

  it("counts open tickets by status and category, lists the overdue ones and the median", () => {
    const stats = ticketStats(
      [
        ticket({ id: "a" }), // overdue (8 h SLA long gone)
        ticket({ id: "b", status: "uj", createdAt: "2026-11-19T10:00:00Z" }), // fresh
        ticket({ id: "c", categoryId: "cost", slaHours: null }),
        ticket({ id: "d", status: "lezart", closedAt: "2026-11-16T09:00:00Z" }), // 2 h
        ticket({ id: "e", status: "lezart", closedAt: "2026-11-17T07:00:00Z" }), // 8 + 0 → 8 h
        ticket({ id: "f", status: "lezart", categoryId: "cost", closedAt: "2026-11-16T10:00:00Z" }), // 3 h
      ],
      now,
      calendar,
    );
    expect(stats.open).toBe(3);
    expect(stats.byStatus).toMatchObject({ uj: 1, folyamatban: 2, lezart: 3 });
    expect(stats.overdueIds).toEqual(["a"]);
    const leave = stats.byCategory.find((c) => c.categoryId === "leave");
    expect(leave).toMatchObject({ open: 2, overdue: 1, medianResolutionMinutes: (120 + 480) / 2 });
    expect(stats.byCategory.find((c) => c.categoryId === "cost")).toMatchObject({
      open: 1,
      overdue: 0,
      medianResolutionMinutes: 180,
    });
    expect(stats.medianResolutionMinutes).toBe(180);
  });

  it("orders the overdue list by how late, and handles no tickets", () => {
    const stats = ticketStats(
      [ticket({ id: "new", createdAt: "2026-11-18T07:00:00Z" }), ticket({ id: "old" })],
      now,
      calendar,
    );
    expect(stats.overdueIds).toEqual(["old", "new"]);
    const empty = ticketStats([], now, calendar);
    expect(empty).toMatchObject({ open: 0, overdueIds: [], medianResolutionMinutes: null });
  });

  it("median of nothing, odd and even lists", () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});
