import { afterEach, describe, expect, it } from "vitest";

import {
  addDays,
  churchDay,
  churchTime,
  churchTimeZone,
  churchWallTime,
  endOfMonth,
  fromChurchWallTime,
  isDayKey,
  setChurchTimeZone,
  startOfNextMonth,
} from "./church-time";

describe("church time", () => {
  it("gives the day in Budapest, also near midnight and in summer time", () => {
    expect(churchDay("2026-11-01T22:59:00Z")).toBe("2026-11-01");
    expect(churchDay("2026-11-01T23:00:00Z")).toBe("2026-11-02");
    expect(churchDay("2026-07-01T21:59:00Z")).toBe("2026-07-01");
    expect(churchDay("2026-07-01T22:00:00Z")).toBe("2026-07-02");
  });

  it("counts days and months over the end of a month and of a year", () => {
    expect(addDays("2026-10-28", 7)).toBe("2026-11-04");
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(endOfMonth("2028-02-10")).toBe("2028-02-29");
    expect(endOfMonth("2026-12-01")).toBe("2026-12-31");
    expect(startOfNextMonth("2026-12-15")).toBe("2027-01-01");
  });

  it("finds the instant of a wall-clock time in Budapest", () => {
    expect(churchTime(2026, 11, 1, 10).toISOString()).toBe("2026-11-01T09:00:00.000Z");
    expect(churchTime(2026, 7, 1, 10, 30).toISOString()).toBe("2026-07-01T08:30:00.000Z");
    // The day after the change to winter time.
    expect(churchTime(2026, 10, 26, 0).toISOString()).toBe("2026-10-25T23:00:00.000Z");
  });

  it("gives and reads the wall-clock time of a field", () => {
    expect(churchWallTime("2026-11-01T09:05:00Z")).toBe("2026-11-01T10:05");
    expect(fromChurchWallTime("2026-07-01T10:30")?.toISOString()).toBe("2026-07-01T08:30:00.000Z");
    expect(fromChurchWallTime("lorem")).toBeNull();
  });

  it("knows a day", () => {
    expect(isDayKey("2026-11-01")).toBe(true);
    expect(isDayKey("2026-11-01T10:00:00Z")).toBe(false);
  });
});

describe("the configured time zone", () => {
  afterEach(() => setChurchTimeZone("Europe/Budapest"));

  it("gives days and wall-clock times in the zone of the configuration", () => {
    setChurchTimeZone("America/New_York");
    expect(churchTimeZone()).toBe("America/New_York");
    expect(churchDay("2026-11-02T03:00:00Z")).toBe("2026-11-01");
    expect(churchTime(2026, 11, 1, 10).toISOString()).toBe("2026-11-01T15:00:00.000Z");
    expect(churchWallTime("2026-11-01T15:05:00Z")).toBe("2026-11-01T10:05");
  });

  it("keeps the zone for a zone that Intl does not know", () => {
    setChurchTimeZone("Mars/Olympus");
    expect(churchTimeZone()).toBe("Europe/Budapest");
  });
});
