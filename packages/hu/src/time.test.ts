import { describe, expect, it } from "vitest";
import { formatTime, formatTimeRange, toCivilTime } from "./index";

describe("formatTime", () => {
  it("formats 24-hour clock times", () => {
    expect(formatTime("18:00")).toBe("18:00");
    expect(formatTime("07:05")).toBe("07:05");
    expect(formatTime("00:00")).toBe("00:00");
    expect(formatTime("23:59:30")).toBe("23:59");
  });

  it("formats spoken times", () => {
    expect(formatTime("18:00", { style: "spoken" })).toBe("18 óra");
    expect(formatTime("18:30", { style: "spoken" })).toBe("18 óra 30 perc");
    expect(formatTime("07:05", { style: "spoken" })).toBe("7 óra 5 perc");
    expect(formatTime("00:00", { style: "spoken" })).toBe("0 óra");
  });

  it("converts instants to Budapest wall-clock time (winter and summer)", () => {
    expect(formatTime("2026-11-12T17:00:00Z")).toBe("18:00");
    expect(formatTime("2026-07-12T16:00:00Z")).toBe("18:00");
    expect(formatTime(new Date("2026-11-12T17:30:00Z"), { style: "spoken" })).toBe(
      "18 óra 30 perc",
    );
    expect(formatTime("2026-11-12T18:00:00+01:00")).toBe("18:00");
    expect(formatTime("2026-11-12T12:00:00-05:00")).toBe("18:00");
  });

  it("jumps over the spring-forward gap on the last Sunday of March", () => {
    expect(formatTime("2026-03-29T00:59:59Z")).toBe("01:59");
    expect(formatTime("2026-03-29T01:00:00Z")).toBe("03:00");
  });

  it("repeats the 02:xx hour on the last Sunday of October", () => {
    expect(formatTime("2026-10-25T00:59:59Z")).toBe("02:59"); // CEST
    expect(formatTime("2026-10-25T01:00:00Z")).toBe("02:00"); // CET
    expect(formatTime("2026-10-25T01:59:00Z")).toBe("02:59"); // CET
    expect(formatTime("2026-10-25T02:00:00Z")).toBe("03:00");
  });

  it("rejects invalid input", () => {
    expect(() => formatTime("25:00")).toThrow(RangeError);
    expect(() => formatTime("2026-11-12T18:00:00")).toThrow(RangeError);
    expect(() => formatTime("evening")).toThrow(RangeError);
  });
});

describe("formatTimeRange / toCivilTime", () => {
  it("joins two times with an en dash", () => {
    expect(formatTimeRange("18:00", "19:30")).toBe("18:00–19:30");
    expect(formatTimeRange("18:00", "19:30", { style: "spoken" })).toBe("18 óra–19 óra 30 perc");
  });

  it("resolves inputs to parts", () => {
    expect(toCivilTime("18:30")).toEqual({ hour: 18, minute: 30 });
    expect(toCivilTime("2026-11-12T17:30:00Z")).toEqual({ hour: 18, minute: 30 });
  });
});
