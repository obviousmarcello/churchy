import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { mod12 } from "@/lib/music/chords/chord-name";
import { keysLike, parseKey } from "@/lib/music/chords/key";
import { scoreTranspose, shownScoreKey } from "./score-interval";
import { keyFromFifths } from "./score-key";

const BASE_SEMITONES = [0, 2, 4, 5, 7, 9, 11];

/** The semitones of an interval, e.g. 2 for "+M2" and -3 for "-m3". */
function semitones(interval: string): number {
  const match = /^([+-])([dmMPA])([1-7])$/.exec(interval);
  if (!match) throw new Error(`Not an interval: ${interval}`);
  const [, sign, quality, digits] = match;
  const number = Number(digits);
  const offsets: Record<string, number> = [1, 4, 5].includes(number)
    ? { d: -1, P: 0, A: 1 }
    : { d: -2, m: -1, M: 0, A: 1 };
  return (sign === "+" ? 1 : -1) * (BASE_SEMITONES[number - 1]! + offsets[quality!]!);
}

describe("scoreTranspose", () => {
  it("moves the score from its own key to the key of the sheet", () => {
    // The chart and the sheet are in G, the file is in Ab.
    expect(scoreTranspose("Ab", "G", "G")).toBe("-m2");
    // A special arrangement in A goes to the key of the sheet too.
    expect(scoreTranspose("A", "G", "Bb")).toBe("+m2");
  });

  it("is null when the score is in the key of the sheet", () => {
    expect(scoreTranspose("G", "G", "G")).toBeNull();
    expect(scoreTranspose("Gb", "F#", "F#")).toBeNull();
    expect(scoreTranspose(null, "F#", "Gb")).toBeNull();
  });

  it("is null for a key that is not valid", () => {
    expect(scoreTranspose("G", "G", "X")).toBeNull();
  });

  it("moves up to a fifth and a half, else down", () => {
    expect(scoreTranspose("G", "G", "A")).toBe("+M2");
    expect(scoreTranspose("G", "G", "Bb")).toBe("+m3");
    expect(scoreTranspose("G", "G", "E")).toBe("-m3");
    expect(scoreTranspose("C", "C", "F#")).toBe("+A4");
    expect(scoreTranspose("C", "C", "Gb")).toBe("+d5");
    expect(scoreTranspose("C", "C", "G")).toBe("-P4");
  });

  it("keeps the mode of the score", () => {
    // A file without a mode reads as major: an F minor song in Ab. On a sheet in E minor it goes to G.
    expect(scoreTranspose("Ab", "Fm", "Em")).toBe("-m2");
    // A minor score on a major sheet goes to the relative minor: G major has E minor.
    expect(scoreTranspose("Fm", "G", "G")).toBe("-m2");
  });

  it("moves a score without a key as the chords move", () => {
    expect(scoreTranspose(null, "D", "Eb")).toBe("+m2");
    expect(scoreTranspose(null, "G", "G")).toBeNull();
    // C# from Gb is no simple interval: the score moves to Db, the same key.
    expect(scoreTranspose(null, "Gb", "C#")).toBe("-P4");
  });

  it("keeps the spelling of the score's key", () => {
    // Gb and F# sound the same: Gb to G is an augmented unison, not a minor second.
    expect(scoreTranspose("Gb", "F#", "G")).toBe("+A1");
  });

  it("always moves the score to the key signature of the sheet", () => {
    const keys = [...keysLike("C"), ...keysLike("Am")];
    fc.assert(
      fc.property(
        fc.constantFrom(...keys),
        // The key signature of the score: its sharps (positive) or flats (negative), and its mode.
        fc.integer({ min: -7, max: 7 }),
        fc.boolean(),
        (shownKey, fifths, scoreMinor) => {
          const scoreKey = keyFromFifths(fifths, scoreMinor)!;
          const interval = scoreTranspose(scoreKey, shownKey, shownKey);
          const shown = parseKey(shownKey)!;
          // The major key of each: the key signature.
          const scoreMajor = mod12(parseKey(scoreKey)!.tonic + (scoreMinor ? 3 : 0));
          const shownMajor = mod12(shown.tonic + (shown.minor ? 3 : 0));
          const shift = mod12(shownMajor - scoreMajor);
          if (shift === 0) {
            expect(interval).toBeNull();
            return;
          }
          expect(interval).not.toBeNull();
          expect(mod12(semitones(interval!))).toBe(shift);
          expect(Math.abs(semitones(interval!))).toBeLessThanOrEqual(6);
        },
      ),
      { numRuns: 2_000 },
    );
  });
});

describe("shownScoreKey", () => {
  it("is the key of the sheet", () => {
    expect(shownScoreKey("Ab", "G")).toBe("G");
    expect(shownScoreKey(null, "G")).toBe("G");
  });

  it("is the score's own key on a sheet without a key", () => {
    expect(shownScoreKey("Ab", null)).toBe("Ab");
    expect(shownScoreKey(null, null)).toBeNull();
  });
});
