import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  GRID_LEAD_MS,
  STOPPED_GRID,
  beatAtOrAfter,
  beatLengthMs,
  changeGrid,
  newerGrid,
  nextBarLine,
  startGrid,
  stopGrid,
  type BeatGrid,
} from "./beat-grid";

describe("changeGrid", () => {
  const running = startGrid(STOPPED_GRID, 1000);

  it("makes zero, negative and NaN beats per bar safe", () => {
    for (const beatsPerBar of [0, -3, Number.NaN]) {
      const grid = changeGrid(running, { bpm: 120, beatsPerBar }, 2000);
      expect(grid.beatsPerBar).toBe(1);
      expect(Number.isFinite(grid.startTime)).toBe(true);
      expect(beatAtOrAfter(grid, 5000).barBeat).toBe(0);
    }
  });

  it("keeps the tempo for a NaN bpm", () => {
    expect(changeGrid(running, { bpm: Number.NaN, beatsPerBar: 3 }, 2000).bpm).toBe(running.bpm);
  });
});

/** The beat times from `from` to `to`: the old grid before the start of the new one, then the new one. */
function beatTimes(old: BeatGrid, next: BeatGrid, from: number, to: number) {
  const times: number[] = [];
  for (let beat = beatAtOrAfter(old, from); beat.time < Math.min(to, next.startTime);) {
    times.push(beat.time);
    beat = beatAtOrAfter(old, beat.time + beatLengthMs(old.bpm) / 2);
  }
  for (let beat = beatAtOrAfter(next, Math.max(from, next.startTime)); beat.time < to;) {
    times.push(beat.time);
    beat = beatAtOrAfter(next, beat.time + beatLengthMs(next.bpm) / 2);
  }
  return times;
}

describe("beat grid", () => {
  const grid: BeatGrid = { epoch: 1, running: true, startTime: 1000, bpm: 120, beatsPerBar: 4 };

  it("puts beat n at startTime + n * 60000 / bpm", () => {
    expect(beatAtOrAfter(grid, 0)).toEqual({ index: 0, time: 1000, barBeat: 0 });
    expect(beatAtOrAfter(grid, 1000)).toEqual({ index: 0, time: 1000, barBeat: 0 });
    expect(beatAtOrAfter(grid, 1001)).toEqual({ index: 1, time: 1500, barBeat: 1 });
    expect(beatAtOrAfter(grid, 3000)).toEqual({ index: 4, time: 3000, barBeat: 0 });
    expect(beatAtOrAfter(grid, 3600)).toEqual({ index: 6, time: 4000, barBeat: 2 });
  });

  it("finds the next bar line", () => {
    expect(nextBarLine(grid, 0)).toBe(1000);
    expect(nextBarLine(grid, 1001)).toBe(3000);
    expect(nextBarLine(grid, 3000)).toBe(3000);
  });

  it("starts on beat 1 after the lead time, and stops at once", () => {
    const started = startGrid(STOPPED_GRID, 5000);
    expect(started).toMatchObject({ epoch: 1, running: true, startTime: 5000 + GRID_LEAD_MS });
    expect(startGrid(started, 9000)).toBe(started);
    const stopped = stopGrid(started);
    expect(stopped).toMatchObject({ epoch: 2, running: false });
    expect(stopGrid(stopped)).toBe(stopped);
  });

  it("keeps the newer grid", () => {
    const newer = { ...grid, epoch: 2 };
    expect(newerGrid(null, grid)).toBe(grid);
    expect(newerGrid(grid, newer)).toBe(newer);
    expect(newerGrid(newer, grid)).toBe(newer);
  });

  it("returns the same grid when nothing changes", () => {
    expect(changeGrid(grid, { bpm: 120, beatsPerBar: 4 }, 2000)).toBe(grid);
  });

  it("changes a stopped grid at once, without a new start time", () => {
    const stopped = { ...grid, running: false };
    expect(changeGrid(stopped, { bpm: 90, beatsPerBar: 3 }, 99999)).toEqual({
      ...stopped,
      epoch: 2,
      bpm: 90,
      beatsPerBar: 3,
    });
  });

  it("starts a change on the first bar line of the old grid after the lead time", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 20, max: 400, noNaN: true }),
        fc.double({ min: 20, max: 400, noNaN: true }),
        fc.integer({ min: 1, max: 16 }),
        fc.integer({ min: 1, max: 16 }),
        fc.double({ min: 0, max: 3_600_000, noNaN: true }),
        (bpm, newBpm, beatsPerBar, newBeatsPerBar, elapsed) => {
          const old: BeatGrid = {
            epoch: 1,
            running: true,
            startTime: 1_700_000_000_000,
            bpm,
            beatsPerBar,
          };
          const now = old.startTime + elapsed;
          const next = changeGrid(old, { bpm: newBpm, beatsPerBar: newBeatsPerBar }, now);
          if (next === old) return;
          const bar = beatLengthMs(bpm) * beatsPerBar;
          expect(next.startTime).toBeGreaterThanOrEqual(now + GRID_LEAD_MS);
          expect(next.startTime).toBeLessThan(now + GRID_LEAD_MS + bar + 1e-3);
          // On a bar line of the old grid.
          const bars = (next.startTime - old.startTime) / bar;
          expect(Math.abs(bars - Math.round(bars))).toBeLessThan(1e-6);
        },
      ),
    );
  });

  it("has no gap and no double beat at a change", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 20, max: 400, noNaN: true }),
        fc.double({ min: 20, max: 400, noNaN: true }),
        fc.double({ min: 0, max: 600_000, noNaN: true }),
        (bpm, newBpm, elapsed) => {
          const old: BeatGrid = {
            epoch: 1,
            running: true,
            startTime: 1_700_000_000_000,
            bpm,
            beatsPerBar: 4,
          };
          const now = old.startTime + elapsed;
          const next = changeGrid(old, { bpm: newBpm, beatsPerBar: 3 }, now);
          if (next === old) return;
          const times = beatTimes(old, next, now, next.startTime + 4 * beatLengthMs(next.bpm));
          const intervals = times.slice(1).map((time, index) => time - times[index]!);
          for (const interval of intervals) {
            const isOld = Math.abs(interval - beatLengthMs(old.bpm)) < 1e-3;
            const isNew = Math.abs(interval - beatLengthMs(next.bpm)) < 1e-3;
            expect(isOld || isNew).toBe(true);
          }
        },
      ),
    );
  });
});
