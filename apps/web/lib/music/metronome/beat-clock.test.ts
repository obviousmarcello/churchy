import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { BeatClock, normalizeConfig, type MetronomeConfig, type Tick } from "./beat-clock";

const CONFIG: MetronomeConfig = { bpm: 120, beatsPerBar: 4, subdivision: 1, accent: true };

/** Runs the clock from frame `from` to `to` in blocks of `blockSize` (or of each size in turn). */
function run(
  clock: BeatClock,
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

function started(config: Partial<MetronomeConfig> = {}, sampleRate = 48000, frame = 0) {
  const clock = new BeatClock(sampleRate, { ...CONFIG, ...config });
  clock.start(frame);
  return clock;
}

const beatsOf = (ticks: Tick[]) => ticks.filter((tick) => tick.sub === 0);

describe("BeatClock", () => {
  it("puts beat 1 of the bar on the start frame", () => {
    const ticks = run(started({}, 48000, 1000), 1000, 2000);
    expect(ticks).toEqual([
      { frame: 1000, beat: 0, sub: 0, beatsPerBar: 4, bpm: 120, kind: "accent" },
    ]);
  });

  it("has exactly 60 / BPM seconds between beats", () => {
    const ticks = run(started(), 0, 48000 * 4);
    expect(ticks.map((tick) => tick.frame)).toEqual([
      0, 24000, 48000, 72000, 96000, 120000, 144000, 168000,
    ]);
    expect(ticks.map((tick) => tick.beat)).toEqual([0, 1, 2, 3, 0, 1, 2, 3]);
    expect(ticks.map((tick) => tick.kind)).toEqual([
      "accent",
      "beat",
      "beat",
      "beat",
      "accent",
      "beat",
      "beat",
      "beat",
    ]);
  });

  it("keeps beats between samples: the frames have fractions", () => {
    // 137 BPM at 44.1 kHz: 19313.868... frames per beat.
    const ticks = run(started({ bpm: 137 }, 44100), 0, 44100 * 2);
    const framesPerBeat = (44100 * 60) / 137;
    ticks.forEach((tick, index) => expect(tick.frame).toBeCloseTo(index * framesPerBeat, 9));
    expect(ticks[1]!.frame % 1).not.toBe(0);
  });

  it.each([44100, 48000])("does not drift in one hour at %i Hz", (sampleRate) => {
    const bpm = 123.7;
    const end = sampleRate * 3600;
    const beats = run(started({ bpm }, sampleRate), 0, end, 128);
    const framesPerBeat = (sampleRate * 60) / bpm;
    expect(beats.length).toBe(Math.floor((end - 1) / framesPerBeat) + 1);
    let maxError = 0;
    beats.forEach((tick, index) => {
      maxError = Math.max(maxError, Math.abs(tick.frame - (index * sampleRate * 60) / bpm));
    });
    // A millionth of a sample after one hour.
    expect(maxError).toBeLessThan(1e-6);
  });

  it("gives the same clicks for all block sizes", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(22050, 44100, 48000, 96000),
        fc.double({ min: 20, max: 400, noNaN: true }),
        fc.integer({ min: 1, max: 16 }),
        fc.integer({ min: 1, max: 4 }),
        fc.array(fc.integer({ min: 1, max: 4096 }), { minLength: 1, maxLength: 20 }),
        (sampleRate, bpm, beatsPerBar, subdivision, sizes) => {
          const config = { bpm, beatsPerBar, subdivision };
          const end = sampleRate * 5;
          const whole = run(started(config, sampleRate), 0, end, end);
          const blocks = run(started(config, sampleRate), 0, end, sizes);
          expect(blocks).toEqual(whole);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("puts each click in the block of its first sample", () => {
    const clock = started({ bpm: 137 }, 44100);
    const framesPerBeat = (44100 * 60) / 137;
    // Beat 2 is at 19313.87, so its first sample is 19314.
    expect(clock.ticksIn(0, 19314)).toHaveLength(1);
    const [tick] = clock.ticksIn(19314, 19315);
    expect(tick!.frame).toBeCloseTo(framesPerBeat, 9);
  });

  it("places the subdivisions evenly in the beat", () => {
    const ticks = run(started({ subdivision: 3 }), 0, 48000);
    expect(ticks.map((tick) => tick.frame)).toEqual([0, 8000, 16000, 24000, 32000, 40000]);
    expect(ticks.map((tick) => [tick.beat, tick.sub, tick.kind])).toEqual([
      [0, 0, "accent"],
      [0, 1, "subdivision"],
      [0, 2, "subdivision"],
      [1, 0, "beat"],
      [1, 1, "subdivision"],
      [1, 2, "subdivision"],
    ]);
  });

  it("has no accent when the accent is off", () => {
    const ticks = run(started({ accent: false }), 0, 48000 * 3);
    expect(ticks.every((tick) => tick.kind === "beat")).toBe(true);
  });

  it("starts a new tempo at the next beat", () => {
    const clock = started();
    run(clock, 0, 30000); // Beats at 0 and 24000. The next beat is at 48000.
    clock.setConfig({ ...CONFIG, bpm: 60 });
    const ticks = run(clock, 30000, 200000);
    expect(ticks.map((tick) => tick.frame)).toEqual([48000, 96000, 144000, 192000]);
  });

  it("continues the count of the bar when the tempo changes", () => {
    const clock = started();
    const before = run(clock, 0, 30000);
    clock.setConfig({ ...CONFIG, bpm: 90 });
    const after = run(clock, 30000, 48000 * 6);
    expect([...before, ...after].map((tick) => tick.beat).slice(0, 8)).toEqual([
      0, 1, 2, 3, 0, 1, 2, 3,
    ]);
  });

  it("continues the count when the beats of the bar change", () => {
    const clock = started();
    const before = run(clock, 0, 50000); // Beats 0, 1, 2.
    clock.setConfig({ ...CONFIG, beatsPerBar: 6 });
    const after = run(clock, 50000, 24000 * 9);
    expect([...before, ...after].map((tick) => tick.beat)).toEqual([0, 1, 2, 3, 4, 5, 0, 1, 2]);
  });

  it("never misses or doubles a beat when the tempo changes", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 20, max: 400 }),
        fc.integer({ min: 20, max: 400 }),
        fc.integer({ min: 1, max: 48000 * 4 }),
        fc.array(fc.integer({ min: 1, max: 2048 }), { minLength: 1, maxLength: 8 }),
        (oldBpm, newBpm, changeFrame, sizes) => {
          const clock = started({ bpm: oldBpm });
          const before = run(clock, 0, changeFrame, sizes);
          clock.setConfig({ ...CONFIG, bpm: newBpm });
          const after = run(clock, changeFrame, changeFrame + 48000 * 8, sizes);
          const oldInterval = (48000 * 60) / oldBpm;
          const newInterval = (48000 * 60) / newBpm;
          // The first beat after the change is where the old tempo puts it.
          const next = before.length * oldInterval;
          expect(after[0]!.frame).toBeCloseTo(next, 6);
          after.forEach((tick, index) =>
            expect(tick.frame).toBeCloseTo(next + index * newInterval, 6),
          );
        },
      ),
      { numRuns: 300 },
    );
  });

  it("makes no clicks when stopped, and starts again on beat 1", () => {
    const clock = started();
    run(clock, 0, 30000);
    clock.stop();
    expect(run(clock, 30000, 100000)).toEqual([]);
    clock.start(100000);
    expect(run(clock, 100000, 130000).map((tick) => [tick.frame, tick.beat])).toEqual([
      [100000, 0],
      [124000, 1],
    ]);
  });

  it("uses a new config at once when stopped", () => {
    const clock = new BeatClock(48000, CONFIG);
    clock.setConfig({ ...CONFIG, bpm: 60 });
    clock.start(0);
    expect(beatsOf(run(clock, 0, 100000)).map((tick) => tick.frame)).toEqual([0, 48000, 96000]);
  });

  it("makes a bad config safe", () => {
    expect(normalizeConfig({ bpm: 0, beatsPerBar: 0, subdivision: 9, accent: true })).toEqual({
      bpm: 20,
      beatsPerBar: 1,
      subdivision: 4,
      accent: true,
    });
    expect(
      normalizeConfig({ bpm: Number.NaN, beatsPerBar: 99, subdivision: 2.4, accent: false }),
    ).toEqual({
      bpm: 20,
      beatsPerBar: 16,
      subdivision: 2,
      accent: false,
    });
    expect(normalizeConfig({ ...CONFIG, bpm: 1000 }).bpm).toBe(400);
  });
});
