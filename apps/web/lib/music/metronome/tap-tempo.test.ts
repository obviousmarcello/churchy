import { describe, expect, it } from "vitest";

import { TapTempo } from "./tap-tempo";

function tapAll(times: number[], tapTempo = new TapTempo()) {
  return times.map((time) => tapTempo.tap(time));
}

describe("TapTempo", () => {
  it("has no tempo after one tap", () => {
    expect(new TapTempo().tap(1000)).toBeNull();
  });

  it("gives the tempo of even taps", () => {
    expect(tapAll([0, 500, 1000, 1500])).toEqual([null, 120, 120, 120]);
    expect(tapAll([0, 750, 1500])).toEqual([null, 80, 80]);
  });

  it("uses the median, so one bad tap has little effect", () => {
    const results = tapAll([0, 500, 1000, 1400, 2000, 2500]);
    expect(results[results.length - 1]).toBe(120);
  });

  it("starts again after a pause", () => {
    const tapTempo = new TapTempo();
    tapAll([0, 500, 1000], tapTempo);
    expect(tapTempo.tap(5000)).toBeNull();
    expect(tapTempo.tap(6000)).toBe(60);
  });

  it("follows a tempo change: it uses the most recent taps", () => {
    const slow = Array.from({ length: 8 }, (_, index) => index * 1000);
    const fast = Array.from({ length: 8 }, (_, index) => 7000 + (index + 1) * 500);
    const results = tapAll([...slow, ...fast]);
    expect(results[7]).toBe(60);
    expect(results[results.length - 1]).toBe(120);
  });

  it("keeps the tempo in the range of the metronome", () => {
    expect(tapAll([0, 50])[1]).toBe(400);
    expect(tapAll([0, 1900])[1]).toBe(32);
  });

  it("starts again when the time goes back", () => {
    const tapTempo = new TapTempo();
    tapAll([1000, 1500], tapTempo);
    expect(tapTempo.tap(200)).toBeNull();
  });
});
