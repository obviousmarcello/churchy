import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { MetronomeConfig, Tick } from "./beat-clock";
import { CLICK_LENGTH_S } from "./click";
import { MetronomeCore } from "./metronome-core";
import { detectOnsets, measureOnset, peak } from "./testing/analysis";

// These tests record the sound of the metronome and measure it, as a
// microphone would: they check the samples, not only the calculated times.

const CONFIG: MetronomeConfig = { bpm: 120, beatsPerBar: 4, subdivision: 1, accent: true };

/** Records `seconds` of sound in blocks of `blockSize` (or of each size in turn). */
function record(
  core: MetronomeCore,
  seconds: number,
  blockSize: number | number[] = 128,
  onBlock?: (startFrame: number) => void,
) {
  const samples = new Float32Array(Math.round(seconds * core.sampleRate));
  const sizes = Array.isArray(blockSize) ? blockSize : [blockSize];
  const ticks: Tick[] = [];
  let frame = 0;
  let index = 0;
  while (frame < samples.length) {
    onBlock?.(frame);
    const end = Math.min(frame + sizes[index++ % sizes.length]!, samples.length);
    ticks.push(...core.render(frame, samples.subarray(frame, end)));
    frame = end;
  }
  return { samples, ticks };
}

function playing(config: Partial<MetronomeConfig> = {}, sampleRate = 48000, gain = 1) {
  const core = new MetronomeCore(sampleRate, { ...CONFIG, ...config }, gain);
  core.clock.start(0);
  return core;
}

describe("MetronomeCore", () => {
  it("is silent when stopped", () => {
    const { samples } = record(new MetronomeCore(48000, CONFIG), 1);
    expect(peak(samples)).toBe(0);
  });

  it.each([
    [44100, 120],
    [48000, 137],
    [48000, 61.3],
  ])(
    "starts each click within a thousandth of a sample of its time (%i Hz, %f BPM)",
    (sampleRate, bpm) => {
      const minutes = 10;
      const { samples, ticks } = record(playing({ bpm }, sampleRate), minutes * 60);
      const framesPerBeat = (sampleRate * 60) / bpm;
      expect(ticks.length).toBe(Math.ceil((samples.length - 1) / framesPerBeat));

      // The first 50 beats and the last 50 beats, so a drift would show.
      const checked = [...ticks.slice(0, 50), ...ticks.slice(-50, -1)];
      for (const tick of checked) {
        const expected = Math.round(tick.frame / framesPerBeat) * framesPerBeat;
        const measured = measureOnset(samples, sampleRate, tick.kind, Math.round(expected));
        expect(Math.abs(measured - expected)).toBeLessThan(1e-3);
      }
    },
  );

  it("has the same interval between all clicks, for a detector that does not know the sound", () => {
    const sampleRate = 48000;
    const { samples } = record(playing({ bpm: 120, accent: false }), 60);
    const onsets = detectOnsets(samples, 0.01, sampleRate * 0.1);
    expect(onsets).toHaveLength(120);
    const intervals = onsets.slice(1).map((onset, index) => onset - onsets[index]!);
    // 120 BPM is 24000 samples per beat; the detector rounds to whole samples.
    expect(new Set(intervals)).toEqual(new Set([24000]));
  });

  it("makes the same samples for all block sizes", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 20, max: 400, noNaN: true }),
        fc.integer({ min: 1, max: 4 }),
        fc.array(fc.integer({ min: 1, max: 1024 }), { minLength: 1, maxLength: 10 }),
        (bpm, subdivision, sizes) => {
          const config = { bpm, subdivision };
          const reference = record(playing(config), 3, 128).samples;
          const blocks = record(playing(config), 3, sizes).samples;
          expect(blocks).toEqual(reference);
        },
      ),
      { numRuns: 30 },
    );
  });

  it("plays the accent louder and the subdivisions softer than the beat", () => {
    const sampleRate = 48000;
    const { samples, ticks } = record(playing({ subdivision: 2 }), 2);
    const loudness = (tick: Tick) =>
      peak(samples, Math.ceil(tick.frame), Math.ceil(tick.frame) + sampleRate * 0.02);
    const accent = ticks.find((tick) => tick.kind === "accent")!;
    const beat = ticks.find((tick) => tick.kind === "beat")!;
    const subdivision = ticks.find((tick) => tick.kind === "subdivision")!;
    expect(loudness(accent)).toBeGreaterThan(loudness(beat));
    expect(loudness(beat)).toBeGreaterThan(loudness(subdivision));
  });

  it("never clips, also at the fastest tempo with all subdivisions", () => {
    const { samples } = record(playing({ bpm: 400, subdivision: 4 }), 10);
    expect(samples.every((value) => Number.isFinite(value))).toBe(true);
    expect(peak(samples)).toBeLessThanOrEqual(1);
  });

  it("lets the last click ring to its end after a stop, then is silent", () => {
    const sampleRate = 48000;
    const reference = record(playing(), 1).samples;
    const stopFrame = 24000 + 256; // Just after the start of beat 2.
    const core = playing();
    const { samples } = record(core, 1, 128, (frame) => {
      if (frame === stopFrame) core.clock.stop();
    });
    const clickEnd = 24000 + Math.ceil(CLICK_LENGTH_S * sampleRate);
    expect(samples.subarray(0, clickEnd)).toEqual(reference.subarray(0, clickEnd));
    expect(peak(samples, clickEnd)).toBe(0);
  });

  it("changes the volume smoothly", () => {
    const sampleRate = 48000;
    const reference = record(playing(), 0.05).samples;
    const core = playing();
    const changeFrame = 512; // During the first click.
    const { samples } = record(core, 0.05, 128, (frame) => {
      if (frame === changeFrame) core.setGain(0);
    });
    // No jump: each sample is between the full click and silence.
    for (let index = changeFrame; index < samples.length; index++) {
      expect(Math.abs(samples[index]!)).toBeLessThanOrEqual(Math.abs(reference[index]!));
    }
    // The first sample after the change is almost as loud as before it...
    expect(Math.abs(samples[changeFrame + 1]! / reference[changeFrame + 1]!)).toBeGreaterThan(0.99);
    // ...and after 25 ms (5 time constants) the click is below 1% of its volume.
    const later = changeFrame + 0.025 * sampleRate;
    expect(peak(samples, later, later + 100)).toBeLessThan(
      0.01 * peak(reference, later, later + 100),
    );
  });
});
