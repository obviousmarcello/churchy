import { afterEach, describe, expect, it } from "vitest";
import { nextServices, upcomingExceptions } from "./display";
import { resolve } from "./resolve";
import { benchmarkTenant } from "./testing/benchmark-tenant";
import { clearZoneCache } from "./zone";

// The package is runtime-agnostic (no Node types); the test only needs `process.env`.
declare const process: { env: Record<string, string | undefined> };

// The test script runs with TZ=Europe/Budapest; the engine must not depend on it.
describe("independence from the process time zone", () => {
  const original = process.env.TZ;
  afterEach(() => {
    process.env.TZ = original;
  });

  function snapshot() {
    clearZoneCache(); // compute everything afresh under the current process TZ
    const input = benchmarkTenant();
    return JSON.stringify({
      // Covers both DST changes of 2026 and the year end.
      year: resolve(input, "2026-01-01", "2026-12-31", { includeCancelled: true }),
      next: [
        "2026-03-28T23:30:00+01:00",
        "2026-10-24T22:30:00Z",
        "2026-11-13T23:10:00Z",
        "2026-12-31T23:59:00+01:00",
      ].map((now) => nextServices(input, now)),
      exceptions: upcomingExceptions(input, "2026-12-20T12:00:00+01:00", 30),
    });
  }

  it.each(["UTC", "America/New_York", "Pacific/Kiritimati", "Asia/Kolkata"])(
    "produces identical results with TZ=%s",
    (zone) => {
      process.env.TZ = "Europe/Budapest";
      expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(-60);
      const budapest = snapshot();

      process.env.TZ = zone;
      // Make sure the switch really took effect in this process.
      expect(new Date(2026, 0, 1).getTimezoneOffset()).not.toBe(-60);
      expect(snapshot()).toBe(budapest);
    },
  );
});
