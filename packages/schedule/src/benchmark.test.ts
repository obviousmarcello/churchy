import { describe, expect, it } from "vitest";
import { resolve } from "./resolve";
import { benchmarkTenant } from "./testing/benchmark-tenant";
import type { DayContext } from "./types";

const BUDGET_MS = 50; // D-09 AC 5
const RUNS = 5;

describe("benchmark", () => {
  it("fixture is the realistic tenant from the acceptance criteria", () => {
    const input = benchmarkTenant();
    expect(input.locations).toHaveLength(3);
    expect(input.periods).toHaveLength(2);
    expect(input.rules).toHaveLength(25);
    expect(input.exceptions).toHaveLength(20);
  });

  it(`resolves one year for a 3-location tenant in ≤ ${BUDGET_MS} ms (median of ${RUNS})`, () => {
    const input = benchmarkTenant();
    const dayContext = (date: string): DayContext =>
      date.endsWith("-12-25") ? { publicHolidayName: "Karácsony" } : {};
    const run = () => resolve(input, "2026-01-01", "2026-12-31", { dayContext });

    const coldStart = performance.now();
    const warmup = run();
    const cold = performance.now() - coldStart;
    expect(warmup.length).toBeGreaterThan(800);
    expect(cold).toBeLessThanOrEqual(BUDGET_MS * 4); // first run incl. JIT warm-up, sanity only

    const timings: number[] = [];
    for (let i = 0; i < RUNS; i++) {
      const start = performance.now();
      run();
      timings.push(performance.now() - start);
    }
    timings.sort((a, b) => a - b);
    const median = timings[Math.floor(RUNS / 2)]!;
    console.info(
      `[schedule benchmark] ${warmup.length} services/year; cold run ${cold.toFixed(1)} ms; runs (ms): ${timings
        .map((t) => t.toFixed(1))
        .join(", ")}; median ${median.toFixed(1)} ms`,
    );
    expect(median).toBeLessThanOrEqual(BUDGET_MS);
  });
});
