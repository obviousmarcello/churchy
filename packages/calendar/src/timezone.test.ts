import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The package must give the same answers whatever the server timezone is.
 * Node re-reads `process.env.TZ` when it is assigned, so `Date`-based code would
 * change behaviour inside this test; ours must not. The modules are re-imported
 * for every zone so that the per-year memo caches cannot hide a difference.
 */
const ZONES = ["Europe/Budapest", "UTC", "America/Los_Angeles", "Pacific/Kiritimati"];

// The package's tsconfig has no Node types (production code must not use Node APIs),
// so the two runtime hooks this test needs are typed locally.
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } })
  .process.env;
const sourceFiles = (
  import.meta as unknown as {
    glob: (patterns: string[], options: object) => Record<string, string>;
  }
).glob(["./*.ts", "!./*.test.ts"], { query: "?raw", import: "default", eager: true });

async function fingerprint(): Promise<string> {
  vi.resetModules();
  const calendar = await import("./index");
  const parts: string[] = [];
  for (let year = 1900; year <= 2100; year += 3) {
    parts.push(calendar.easter(year), JSON.stringify(calendar.moveableFeasts(year)));
    parts.push(JSON.stringify(calendar.publicHolidays(year)));
  }
  // Every day around both 2026 DST transitions and the year boundary.
  for (const start of ["2026-03-20", "2026-10-18", "2026-12-24"]) {
    for (let i = 0; i < 14; i++) {
      const date = calendar.addDays(start, i);
      parts.push(JSON.stringify(calendar.liturgicalDay(date, "catholic")));
      parts.push(JSON.stringify(calendar.liturgicalDay(date, "protestant")));
      parts.push(JSON.stringify(calendar.publicHoliday(date)));
    }
  }
  return parts.join("|");
}

describe("timezone independence", () => {
  const original = env.TZ;
  afterEach(() => {
    env.TZ = original;
  });

  it("returns identical results under different server timezones", async () => {
    env.TZ = ZONES[0];
    const reference = await fingerprint();
    const offsets = new Set<number>();
    for (const zone of ZONES) {
      env.TZ = zone;
      offsets.add(new Date(Date.UTC(2026, 0, 1)).getTimezoneOffset());
      expect(await fingerprint(), zone).toBe(reference);
    }
    // Sanity check that switching TZ really changes `Date` behaviour in this process,
    // i.e. the comparison above would catch timezone-dependent code.
    expect(offsets.size).toBeGreaterThan(1);
  });

  it("never uses the Date object in production code", () => {
    const files = Object.entries(sourceFiles);
    expect(files.map(([file]) => file)).toContain("./liturgical.ts");
    expect(files.some(([file]) => file.endsWith(".test.ts"))).toBe(false);
    for (const [file, code] of files) {
      expect(code, file).not.toMatch(/\bDate\s*[.(]|new\s+Date\b|Intl\.DateTimeFormat/);
    }
  });
});
