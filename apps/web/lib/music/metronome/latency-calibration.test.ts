import { describe, expect, it } from "vitest";

import { CALIBRATION_TAPS, estimateLatency, tapDelays } from "./latency-calibration";

/** Clicks every 1000 ms (60 BPM), from 1000. */
const CLICKS = Array.from({ length: 20 }, (_, index) => 1000 + index * 1000);

describe("tapDelays", () => {
  it("measures each tap from the last click before it", () => {
    expect(tapDelays(CLICKS, [1250, 2010, 3980])).toEqual([250, 10, -20]);
  });

  it("ignores a tap before the first click", () => {
    expect(tapDelays(CLICKS, [500])).toEqual([]);
  });
});

describe("estimateLatency", () => {
  const taps = (delay: number, jitter: number[] = []) =>
    CLICKS.slice(0, CALIBRATION_TAPS).map((click, index) => click + delay + (jitter[index] ?? 0));

  it("needs enough taps", () => {
    expect(estimateLatency(CLICKS, taps(200).slice(1))).toBeNull();
  });

  it("finds the delay of Bluetooth speakers", () => {
    expect(estimateLatency(CLICKS, taps(230, [-8, 5, 0, 12, -3, 7, -10, 2]))).toEqual({
      latencyMs: 231,
      spreadMs: 5,
      reliable: true,
    });
  });

  it("does not go below 0 when the user taps early", () => {
    expect(estimateLatency(CLICKS, taps(-30))?.latencyMs).toBe(0);
  });

  it("ignores a single wrong tap", () => {
    const estimate = estimateLatency(CLICKS, taps(120, [0, 0, 0, 400, 0, 0, 0, 0]));
    expect(estimate?.latencyMs).toBe(120);
    expect(estimate?.reliable).toBe(true);
  });

  it("is not reliable when the taps are uneven", () => {
    expect(
      estimateLatency(CLICKS, taps(150, [-120, 90, -60, 130, -100, 70, 0, -80]))?.reliable,
    ).toBe(false);
  });

  it("uses the last taps", () => {
    const old = taps(400).slice(0, 4);
    const recent = CLICKS.slice(10, 10 + CALIBRATION_TAPS).map((click) => click + 100);
    expect(estimateLatency(CLICKS, [...old, ...recent])?.latencyMs).toBe(100);
  });
});
