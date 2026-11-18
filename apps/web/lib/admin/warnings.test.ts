import { describe, expect, it } from "vitest";
import {
  announcementDue,
  comingSunday,
  dashboardWarnings,
  daysWithoutException,
  missingOnboardingSteps,
  specialDays,
} from "./warnings";

const base = {
  today: "2026-11-18",
  announcementForSunday: true,
  uncoveredDays: [],
  missingSteps: [],
  newRequests: 0,
} as const;

describe("comingSunday / announcementDue", () => {
  it("finds the Sunday of the week", () => {
    expect(comingSunday("2026-11-16")).toBe("2026-11-22"); // Monday
    expect(comingSunday("2026-11-22")).toBe("2026-11-22"); // Sunday itself
  });
  it("is due from Thursday", () => {
    expect(announcementDue("2026-11-18")).toBe(false); // Wednesday
    expect(announcementDue("2026-11-19")).toBe(true); // Thursday
    expect(announcementDue("2026-11-22")).toBe(true);
  });
});

describe("specialDays", () => {
  it("lists holidays and solemnities in the next 14 days", () => {
    const days = specialDays("2026-12-20", "catholic");
    expect(days.map((d) => d.date)).toContain("2026-12-25");
    expect(days.map((d) => d.date)).toContain("2026-12-26");
  });
  it("drops the days an exception already covers", () => {
    const days = specialDays("2026-12-20", "catholic");
    const left = daysWithoutException(days, new Set(["2026-12-25"]));
    expect(left.map((d) => d.date)).not.toContain("2026-12-25");
    expect(left.length).toBe(days.length - 1);
  });
});

describe("dashboardWarnings", () => {
  it("is empty when everything is fine", () => {
    expect(dashboardWarnings(base)).toEqual([]);
  });
  it("flags a missing announcement only from Thursday", () => {
    expect(dashboardWarnings({ ...base, announcementForSunday: false })).toEqual([]);
    expect(
      dashboardWarnings({ ...base, today: "2026-11-19", announcementForSunday: false }),
    ).toEqual([{ kind: "announcement", sunday: "2026-11-22" }]);
  });
  it("skips checks the actor may not see (null)", () => {
    expect(
      dashboardWarnings({
        today: "2026-11-19",
        announcementForSunday: null,
        uncoveredDays: null,
        missingSteps: null,
        newRequests: null,
      }),
    ).toEqual([]);
  });
  it("reports requests, holidays and onboarding", () => {
    const warnings = dashboardWarnings({
      ...base,
      newRequests: 3,
      uncoveredDays: [{ date: "2026-12-25", name: "Karácsony" }],
      missingSteps: missingOnboardingSteps({ location: true, schedule: false, page: false }),
    });
    expect(warnings.map((w) => w.kind)).toEqual(["requests", "holidays", "onboarding"]);
  });
});
