import { describe, expect, it } from "vitest";

import {
  chordSpelling,
  isChordName,
  noteName,
  parseChordName,
  transposeChordName,
} from "./chord-name";

describe("parseChordName", () => {
  it("reads the root and the quality", () => {
    expect(parseChordName("C")).toMatchObject({ root: 0, intervals: [0, 4, 7], bass: 0 });
    expect(parseChordName("F#m")).toMatchObject({ root: 6, intervals: [0, 3, 7] });
    expect(parseChordName("Bbmaj7")).toMatchObject({ root: 10, intervals: [0, 4, 7, 11] });
    expect(parseChordName("Esus4")?.intervals).toEqual([0, 5, 7]);
    expect(parseChordName("Dsus")?.intervals).toEqual([0, 5, 7]);
    expect(parseChordName("Am7")?.intervals).toEqual([0, 3, 7, 10]);
    expect(parseChordName("Bm7b5")?.intervals).toEqual([0, 3, 6, 10]);
    expect(parseChordName("Cadd9")?.intervals).toEqual([0, 4, 7, 14]);
    expect(parseChordName("E5")?.intervals).toEqual([0, 7]);
    expect(parseChordName("G7sus4")?.intervals).toEqual([0, 5, 7, 10]);
    expect(parseChordName("C(add9)")?.intervals).toEqual([0, 4, 7, 14]);
  });

  it("reads the bass note after a slash", () => {
    expect(parseChordName("G/B")).toMatchObject({ root: 7, bass: 11 });
    expect(parseChordName("Am7/G")).toMatchObject({ root: 9, bass: 7 });
    expect(parseChordName("D/F#")).toMatchObject({ root: 2, bass: 6 });
  });

  it("lets a four-note chord leave out its fifth", () => {
    expect(parseChordName("C7")?.required.sort((a, b) => a - b)).toEqual([0, 4, 10]);
    expect(parseChordName("C")?.required.sort((a, b) => a - b)).toEqual([0, 4, 7]);
    // A changed fifth is part of the chord's sound.
    expect(parseChordName("Cm7b5")?.required.sort((a, b) => a - b)).toEqual([0, 3, 6, 10]);
  });

  it("gives null for a name it does not know", () => {
    expect(parseChordName("N.C.")).toBeNull();
    expect(parseChordName("")).toBeNull();
    expect(parseChordName("Cxyz")).toBeNull();
    expect(parseChordName("H")).toBeNull();
  });
});

describe("isChordName", () => {
  it("knows chords with unusual qualities and optional chords", () => {
    for (const name of ["G2", "C13", "E7#9", "Gadd4", "D/F#", "G6/9", "(Em)", "Bbmaj7"]) {
      expect(isChordName(name)).toBe(true);
    }
  });

  it("does not take words or marks for chords", () => {
    for (const name of ["End", "Bad", "Chorus", "Fine", "N.C.", "%", ".", "x2"]) {
      expect(isChordName(name)).toBe(false);
    }
  });
});

describe("transposeChordName", () => {
  it("moves the root and the bass", () => {
    expect(transposeChordName("G/B", 2)).toBe("A/C#");
    expect(transposeChordName("Am7", 3)).toBe("Cm7");
    expect(transposeChordName("E", -2)).toBe("D");
    expect(transposeChordName("C/E", 5)).toBe("F/A");
    expect(transposeChordName("F/A", 5)).toBe("Bb/D");
    expect(transposeChordName("C/G", 3)).toBe("Eb/Bb");
  });

  it("follows the sharps or flats of the name", () => {
    expect(transposeChordName("F#", 1)).toBe("G");
    expect(transposeChordName("C#m", 1)).toBe("Dm");
    expect(transposeChordName("C#", 2)).toBe("D#");
    expect(transposeChordName("Db", 2)).toBe("Eb");
    expect(transposeChordName("G", 1)).toBe("Ab");
    expect(transposeChordName("Bm", 2)).toBe("C#m");
    expect(transposeChordName("Em/B", 2)).toBe("F#m/C#");
  });

  it("keeps the parentheses of an optional chord", () => {
    expect(transposeChordName("(Em)", 2)).toBe("(F#m)");
    expect(transposeChordName("(G/B)", -2)).toBe("(F/A)");
  });

  it("keeps names it does not know, and names moved by 0", () => {
    expect(transposeChordName("N.C.", 2)).toBe("N.C.");
    expect(transposeChordName("G#", 12)).toBe("G#");
  });
});

describe("chordSpelling", () => {
  it("follows the root, else the key of the chord", () => {
    expect(chordSpelling("Bb")).toBe("flat");
    expect(chordSpelling("C#m")).toBe("sharp");
    expect(chordSpelling("A")).toBe("sharp");
    expect(chordSpelling("F")).toBe("flat");
    expect(chordSpelling("Dm")).toBe("flat");
    expect(chordSpelling("Em")).toBe("sharp");
  });
});

describe("noteName", () => {
  it("names the pitch classes", () => {
    expect(noteName(1)).toBe("Db");
    expect(noteName(1, "sharp")).toBe("C#");
    expect(noteName(-1)).toBe("B");
  });
});

describe("transposeChordName with a spelling", () => {
  it("uses the spelling for the root and the bass", () => {
    expect(transposeChordName("D/F#", 3, "flat")).toBe("F/A");
    expect(transposeChordName("Bb", 1, "sharp")).toBe("B");
    expect(transposeChordName("C#m", 1, "flat")).toBe("Dm");
    expect(transposeChordName("G", 6, "flat")).toBe("Db");
    expect(transposeChordName("G", 6, "sharp")).toBe("C#");
    expect(transposeChordName("Am/C", 2, "common")).toBe("Bm/D");
  });
});
