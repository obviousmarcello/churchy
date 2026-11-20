import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatDateLong,
  formatDateShort,
  formatRelativeDay,
  formatTime,
  formatWeekRange,
  isoWeekday,
  todayInBudapest,
} from "./index";

/**
 * Proof that nothing here depends on the process time zone (CLAUDE.md: "never the server timezone").
 *
 * 1. In-process: switch `process.env.TZ` at run time (Node re-reads it) and re-check
 *    instants around midnight and the DST switches.
 * 2. Out-of-process: re-run every other test file of this package in child Vitest processes
 *    started with different `TZ` values, including zones far from Budapest.
 */

const ZONES = [
  "UTC",
  "America/Los_Angeles",
  "Asia/Tokyo",
  "Pacific/Kiritimati",
  "Pacific/Pago_Pago",
  "Europe/Budapest",
];

function withTimeZone<T>(tz: string, fn: () => T): T {
  const previous = process.env["TZ"];
  process.env["TZ"] = tz;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env["TZ"];
    else process.env["TZ"] = previous;
  }
}

function snapshot(): string[] {
  return [
    formatDateLong(new Date("2026-11-12T23:30:00Z")),
    formatDateShort(new Date("2026-06-30T22:00:00Z")),
    formatDateLong("2026-03-29"),
    formatTime("2026-03-29T00:59:59Z"),
    formatTime("2026-03-29T01:00:00Z"),
    formatTime("2026-10-25T00:59:59Z"),
    formatTime("2026-10-25T01:00:00Z"),
    formatTime(new Date("2026-07-12T16:00:00Z")),
    formatRelativeDay("2026-10-25", "2026-10-24T22:30:00Z"),
    formatRelativeDay("2026-03-29", new Date("2026-03-28T23:30:00Z")),
    formatWeekRange("2026-03-29"),
    todayInBudapest(new Date("2026-12-31T23:30:00Z")),
    String(isoWeekday("2026-10-25")),
  ];
}

describe("process time zone independence (in-process)", () => {
  const expected = [
    "2026. november 13., péntek",
    "2026. 07. 01.",
    "2026. március 29., vasárnap",
    "01:59",
    "03:00",
    "02:59",
    "02:00",
    "18:00",
    "Ma",
    "Ma",
    "márc. 23–29.",
    "2027-01-01",
    "7",
  ];

  it.each(ZONES)("gives identical output when TZ=%s", (tz) => {
    const actual = withTimeZone(tz, () => {
      // sanity check that the switch really took effect
      const probe = new Date("2026-01-15T12:00:00Z").getTimezoneOffset();
      const reference = withTimeZone("UTC", () =>
        new Date("2026-01-15T12:00:00Z").getTimezoneOffset(),
      );
      if (tz !== "UTC") expect(probe).not.toBe(reference);
      return snapshot();
    });
    expect(actual).toEqual(expected);
  });
});

const vitestEntry = path.join(
  path.dirname(createRequire(import.meta.url).resolve("vitest/package.json")),
  "vitest.mjs",
);
const packageRoot = path.resolve(import.meta.dirname, "..");

function runSuite(tz: string): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [vitestEntry, "run", "--exclude", "src/timezone.test.ts", "--reporter", "dot"],
      { cwd: packageRoot, env: { ...process.env, TZ: tz, NO_COLOR: "1" } },
    );
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, output }));
  });
}

describe("process time zone independence (child processes)", () => {
  it.each(["UTC", "America/Los_Angeles", "Pacific/Kiritimati"])(
    "the rest of the suite passes with TZ=%s",
    async (tz) => {
      const { code, output } = await runSuite(tz);
      expect(output).toMatch(/Tests\s+\d+ passed/);
      expect(code, output).toBe(0);
    },
    120_000,
  );
});
