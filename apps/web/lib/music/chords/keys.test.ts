import { describe, expect, it } from "vitest";

import { parseChordName } from "./chord-name";
import { keysVoicings } from "./keys";

describe("keysVoicings", () => {
  it("plays the bass with the left hand and the chord with the right hand", () => {
    expect(keysVoicings(parseChordName("C")!)[0]).toEqual({ left: [48], right: [60, 64, 67] });
  });

  it("plays the slash bass with the left hand", () => {
    expect(keysVoicings(parseChordName("G/B")!)[0]).toEqual({ left: [59], right: [67, 71, 74] });
  });

  it("gives each inversion", () => {
    const voicings = keysVoicings(parseChordName("C")!);
    expect(voicings.map(({ right }) => right)).toEqual([
      [60, 64, 67],
      [64, 67, 72],
      [67, 72, 76],
    ]);
  });

  it("keeps the right hand at G5 or lower", () => {
    for (const symbol of ["B", "Bmaj9", "A#m7", "Gadd9"]) {
      for (const { right } of keysVoicings(parseChordName(symbol)!)) {
        expect(Math.max(...right)).toBeLessThanOrEqual(79);
        expect(Math.min(...right)).toBeGreaterThanOrEqual(48);
      }
    }
  });
});
