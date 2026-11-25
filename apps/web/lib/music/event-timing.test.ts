import { describe, expect, it } from "vitest";

import { parseItemDuration, plannedSeconds, runSheet, scheduleStatus } from "./event-timing";
import { formatMinutesSeconds } from "./format";

describe("plannedSeconds", () => {
  it("prefers the time of the item, then the duration of the arrangement", () => {
    expect(plannedSeconds(120, 245)).toBe(120);
    expect(plannedSeconds(null, 245)).toBe(245);
    expect(plannedSeconds(undefined, null)).toBeNull();
  });
});

describe("runSheet", () => {
  it("starts each item after the items before it, and counts the items without a time as 0", () => {
    const sheet = runSheet("2026-10-30T10:00:00Z", [300, null, 245, 60]);
    expect(sheet.starts.map((start) => new Date(start).toISOString())).toEqual([
      "2026-10-30T10:00:00.000Z",
      "2026-10-30T10:05:00.000Z",
      "2026-10-30T10:05:00.000Z",
      "2026-10-30T10:09:05.000Z",
    ]);
    expect(sheet.totalSeconds).toBe(605);
    expect(sheet.unknown).toBe(1);
  });

  it("has no starts for no items", () => {
    expect(runSheet("2026-10-30T10:00:00Z", [])).toEqual({
      starts: [],
      totalSeconds: 0,
      unknown: 0,
    });
  });
});

describe("parseItemDuration", () => {
  it("reads whole minutes and minutes with seconds", () => {
    expect(parseItemDuration("5")).toBe(300);
    expect(parseItemDuration(" 4:05 ")).toBe(245);
    expect(parseItemDuration("0:30")).toBe(30);
    expect(parseItemDuration("90")).toBe(5400);
  });

  it("gives null for an empty field", () => {
    expect(parseItemDuration("  ")).toBeNull();
  });

  it("rejects other texts, 0 and more than 24 hours", () => {
    for (const text of ["abc", "4:5", "4:60", "1.5", "-3", "0", "0:00", "1441", "1440:01"]) {
      expect(parseItemDuration(text)).toBeUndefined();
    }
    expect(parseItemDuration("1440")).toBe(86400);
  });

  it("reads back the text of formatMinutesSeconds", () => {
    for (const seconds of [30, 245, 3600, 4530])
      expect(parseItemDuration(formatMinutesSeconds(seconds))).toBe(seconds);
  });
});

describe("scheduleStatus", () => {
  const start = Date.parse("2026-10-30T10:00:00Z");
  const plan = { start, seconds: 300 };

  it("is on time from the planned start to the planned end, with less than a minute around them", () => {
    expect(scheduleStatus(plan, start - 59_000)).toEqual({ kind: "onTime" });
    expect(scheduleStatus(plan, start + 120_000)).toEqual({ kind: "onTime" });
    expect(scheduleStatus(plan, start + 300_000 + 59_000)).toEqual({ kind: "onTime" });
  });

  it("is early before the planned start and late after the planned end, by whole minutes", () => {
    expect(scheduleStatus(plan, start - 150_000)).toEqual({ kind: "early", minutes: 2 });
    expect(scheduleStatus(plan, start + 300_000 + 61_000)).toEqual({ kind: "late", minutes: 1 });
  });

  it("has no status without a plan or a time", () => {
    expect(scheduleStatus(undefined, start)).toBeNull();
    expect(scheduleStatus({ start, seconds: null }, start)).toBeNull();
  });
});
