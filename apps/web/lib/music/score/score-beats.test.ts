import { describe, expect, it } from "vitest";

import { startBeat } from "./score-beats";

describe("startBeat", () => {
  const bars = [0, 4, 8, 12];

  it("starts the score on beat 1 of a bar", () => {
    expect(startBeat(bars, 0, 4, 1)).toEqual({ beat: 0, barBeat: 0 });
  });

  it("starts a note on the beat that has it", () => {
    // The third beat of the second bar.
    expect(startBeat(bars, 6, 4, 1)).toEqual({ beat: 6, barBeat: 2 });
    // An eighth note after the third beat: from the third beat.
    expect(startBeat(bars, 6.5, 4, 1)).toEqual({ beat: 6, barBeat: 2 });
  });

  it("puts a pickup bar on the last beats", () => {
    // One quarter note before the first full bar.
    expect(startBeat([0, 1, 5], 0, 4, 1)).toEqual({ beat: 0, barBeat: 3 });
    expect(startBeat([0, 1, 5], 1, 4, 1)).toEqual({ beat: 1, barBeat: 0 });
  });

  it("counts dotted quarter notes in 6/8", () => {
    const sixEight = [0, 3, 6];
    expect(startBeat(sixEight, 4.5, 2, 1.5)).toEqual({ beat: 4.5, barBeat: 1 });
    expect(startBeat(sixEight, 5, 2, 1.5)).toEqual({ beat: 4.5, barBeat: 1 });
  });

  it("starts on a beat when the bars of the score are longer than the metronome's", () => {
    // A 4/4 score with a 3/4 metronome.
    expect(startBeat(bars, 7, 3, 1)).toEqual({ beat: 7, barBeat: 0 });
  });

  it("works without bars", () => {
    expect(startBeat([], 5, 4, 1)).toEqual({ beat: 5, barBeat: 1 });
  });
});
