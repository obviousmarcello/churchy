import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { MetronomeConfig, Tick } from "./beat-clock";
import { GridClock, type GridSchedule } from "./grid-clock";

const CONFIG: MetronomeConfig = { bpm: 999, beatsPerBar: 99, subdivision: 1, accent: true };
const RATE = 48000;
/** 120 BPM at 48 kHz. */
const BEAT = 24000;

/** Runs the clock from frame `from` to `to` in blocks of `blockSize` (or of each size in turn). */
function run(
  clock: GridClock,
  from: number,
  to: number,
  blockSize: number | number[] = 128,
): Tick[] {
  const sizes = Array.isArray(blockSize) ? blockSize : [blockSize];
  const ticks: Tick[] = [];
  let frame = from;
  let index = 0;
  while (frame < to) {
    const end = Math.min(frame + sizes[index++ % sizes.length]!, to);
    ticks.push(...clock.ticksIn(frame, end));
    frame = end;
  }
  return ticks;
}

function following(schedule: Partial<GridSchedule> = {}, config: Partial<MetronomeConfig> = {}) {
  const clock = new GridClock(RATE, { ...CONFIG, ...config });
  clock.follow({ id: 1, anchorFrame: 0, bpm: 120, beatsPerBar: 4, ...schedule });
  return clock;
}

const framesOf = (ticks: Tick[]) => ticks.map((tick) => tick.frame);

describe("GridClock", () => {
  it("is silent before it follows a grid", () => {
    expect(run(new GridClock(RATE, CONFIG), 0, RATE * 2)).toEqual([]);
  });

  it("plays beat 1 of the bar on the anchor, with the tempo and the beats of the grid", () => {
    const ticks = run(following({ anchorFrame: 1000 }), 0, 1000 + BEAT * 5);
    expect(framesOf(ticks)).toEqual([1000, 25000, 49000, 73000, 97000]);
    expect(ticks.map((tick) => tick.beat)).toEqual([0, 1, 2, 3, 0]);
    expect(ticks.map((tick) => tick.kind)).toEqual(["accent", "beat", "beat", "beat", "accent"]);
    expect(ticks.every((tick) => tick.beatsPerBar === 4)).toBe(true);
  });

  it("joins a grid that started long ago on the next beat, with the right beat of the bar", () => {
    // Beat 1001 of the grid is the first one after frame 24_000_000 + 1.
    const clock = following({ anchorFrame: 0 });
    const ticks = run(clock, 24_000_001, 24_000_001 + BEAT * 2);
    expect(framesOf(ticks)).toEqual([24_024_000, 24_048_000]);
    expect(ticks.map((tick) => tick.beat)).toEqual([1001 % 4, 1002 % 4]);
  });

  it("uses the subdivision and the accent of the user", () => {
    const ticks = run(following({}, { subdivision: 3, accent: false }), 0, BEAT * 2);
    expect(framesOf(ticks)).toEqual([0, 8000, 16000, 24000, 32000, 40000]);
    expect(ticks.map((tick) => tick.kind)).toEqual([
      "beat",
      "subdivision",
      "subdivision",
      "beat",
      "subdivision",
      "subdivision",
    ]);
  });

  it("makes the same clicks for all block sizes", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 20, max: 400, noNaN: true }),
        fc.double({ min: -1e7, max: 1e5, noNaN: true }),
        fc.integer({ min: 1, max: 4 }),
        fc.array(fc.integer({ min: 1, max: 1024 }), { minLength: 1, maxLength: 10 }),
        (bpm, anchorFrame, subdivision, sizes) => {
          const reference = run(following({ bpm, anchorFrame }, { subdivision }), 0, RATE * 3, 128);
          expect(run(following({ bpm, anchorFrame }, { subdivision }), 0, RATE * 3, sizes)).toEqual(
            reference,
          );
        },
      ),
      { numRuns: 50 },
    );
  });

  it("does not drift from the grid in one hour", () => {
    const bpm = 123.7;
    const framesPerBeat = (RATE * 60) / bpm;
    const anchorFrame = 12345.678;
    const ticks = run(following({ bpm, anchorFrame }), 0, RATE * 3600, 128);
    let maxError = 0;
    ticks.forEach((tick, index) => {
      maxError = Math.max(maxError, Math.abs(tick.frame - (anchorFrame + index * framesPerBeat)));
    });
    expect(maxError).toBeLessThan(1e-6);
  });

  it("starts a new grid at its anchor, after the beats of the old one", () => {
    const clock = following();
    run(clock, 0, BEAT + 128); // Beats at 0 and 24000.
    clock.follow({ id: 2, anchorFrame: BEAT * 4, bpm: 60, beatsPerBar: 3 });
    const ticks = run(clock, BEAT + 128, BEAT * 4 + RATE * 4);
    expect(framesOf(ticks)).toEqual([48000, 72000, 96000, 144000, 192000, 240000]);
    expect(ticks.map((tick) => tick.beat)).toEqual([2, 3, 0, 1, 2, 0]);
    expect(ticks.at(-1)?.beatsPerBar).toBe(3);
  });

  it("replaces the beats of the old grid from half a beat before the new anchor", () => {
    const clock = following();
    run(clock, 0, 128);
    // 10 ms before a beat of the old grid: the new beat 1 replaces that beat.
    clock.follow({ id: 2, anchorFrame: BEAT * 2 - 480, bpm: 120, beatsPerBar: 4 });
    const ticks = run(clock, 128, BEAT * 3);
    expect(framesOf(ticks)).toEqual([BEAT, BEAT * 2 - 480, BEAT * 3 - 480]);
    expect(ticks.map((tick) => tick.beat)).toEqual([1, 0, 1]);
  });

  it("does not play a double beat when a new grid comes late", () => {
    const clock = following();
    run(clock, 0, BEAT + 128); // Beats at 0 and 24000.
    // Its anchor was 100 ms after the last beat: too close, so it waits for its next beat.
    clock.follow({ id: 2, anchorFrame: BEAT + 4800, bpm: 120, beatsPerBar: 4 });
    const ticks = run(clock, BEAT + 128, BEAT * 4);
    expect(framesOf(ticks)).toEqual([BEAT * 2 + 4800, BEAT * 3 + 4800]);
    expect(ticks.map((tick) => tick.beat)).toEqual([1, 2]);
  });

  it("ignores an old grid", () => {
    const clock = following({ id: 5 });
    clock.follow({ id: 4, anchorFrame: 100, bpm: 60, beatsPerBar: 3 });
    expect(framesOf(run(clock, 0, BEAT * 2))).toEqual([0, BEAT]);
  });

  it("corrects a small difference slowly, by 0.5 ms per beat at most", () => {
    const clock = following();
    run(clock, 0, 128);
    // 2 ms later: 96 frames, in steps of 24. Beat 1 was the next beat already, so the steps start at beat 2.
    clock.follow({ id: 1, anchorFrame: 96, bpm: 120, beatsPerBar: 4 });
    const ticks = run(clock, 128, BEAT * 8);
    expect(framesOf(ticks)).toEqual([
      BEAT,
      BEAT * 2 + 24,
      BEAT * 3 + 48,
      BEAT * 4 + 72,
      BEAT * 5 + 96,
      BEAT * 6 + 96,
      BEAT * 7 + 96,
    ]);
    expect(ticks.map((tick) => tick.beat)).toEqual([1, 2, 3, 0, 1, 2, 3]);
  });

  it("corrects a large difference at once, without a double beat", () => {
    const clock = following();
    run(clock, 0, BEAT + 128); // Beats at 0 and 24000.
    // 50 ms later. The beat at 24000 + 2400 is too close to the last one.
    clock.follow({ id: 1, anchorFrame: 2400, bpm: 120, beatsPerBar: 4 });
    const ticks = run(clock, BEAT + 128, BEAT * 4);
    expect(framesOf(ticks)).toEqual([BEAT * 2 + 2400, BEAT * 3 + 2400]);
    expect(ticks.map((tick) => tick.beat)).toEqual([2, 3]);
  });

  it("is silent after a stop, and can follow again", () => {
    const clock = following();
    run(clock, 0, 128);
    clock.stop();
    expect(clock.running).toBe(false);
    expect(run(clock, 128, BEAT * 3)).toEqual([]);
    clock.follow({ id: 2, anchorFrame: BEAT * 3, bpm: 120, beatsPerBar: 4 });
    expect(framesOf(run(clock, BEAT * 3, BEAT * 4 + 1))).toEqual([BEAT * 3, BEAT * 4]);
  });

  it("ignores a schedule with a broken anchor or tempo", () => {
    const clock = new GridClock(RATE, CONFIG);
    clock.follow({ id: 1, anchorFrame: Number.NaN, bpm: 120, beatsPerBar: 4 });
    clock.follow({ id: 1, anchorFrame: 0, bpm: Number.NaN, beatsPerBar: 4 });
    expect(clock.running).toBe(false);
  });

  it("gives two devices with different sample rates the same click times", () => {
    // The page puts the shared start time 0.5 s after the start of the audio on both devices.
    const times = [44100, 48000].map((rate) => {
      const clock = new GridClock(rate, CONFIG);
      clock.follow({ id: 1, anchorFrame: rate * 0.5, bpm: 137, beatsPerBar: 4 });
      return run(clock, 0, rate * 60).map((tick) => tick.frame / rate);
    });
    expect(times[0]).toHaveLength(times[1]!.length);
    times[0]!.forEach((time, index) =>
      expect(Math.abs(time - times[1]![index]!)).toBeLessThan(1e-9),
    );
  });
});
