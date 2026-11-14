import { describe, expect, it } from "vitest";
import { parseDemoNow } from "./cookies";

describe("parseDemoNow (demo time travel cookie)", () => {
  const real = new Date("2026-11-14T10:00:00Z");

  it("accepts ISO instants with an offset within a year of the real time", () => {
    expect(parseDemoNow("2026-12-01T09:00:00+01:00", real)?.toISOString()).toBe(
      "2026-12-01T08:00:00.000Z",
    );
    expect(parseDemoNow("2026-11-01T09:00:00.000Z", real)?.toISOString()).toBe(
      "2026-11-01T09:00:00.000Z",
    );
    expect(parseDemoNow("2026-11-14T10:00Z", real)).not.toBeNull();
  });

  it.each([
    undefined,
    null,
    "",
    "2026-12-01",
    "2026-12-01T09:00:00",
    "holnap",
    "2026-13-45T99:00:00Z",
    "2029-01-01T00:00:00Z",
    "2024-01-01T00:00:00Z",
  ])("rejects %s", (value) => {
    expect(parseDemoNow(value, real)).toBeNull();
  });
});
