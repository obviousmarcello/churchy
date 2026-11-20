import { describe, expect, it } from "vitest";
import {
  KEYS_MAJOR,
  formatChord,
  interval,
  parseChordPro,
  transposeChord,
  transposeChordPro,
  transposeKey,
} from "./music";

describe("H/B notation", () => {
  it("shows B as H and Bb as B in Hungarian, with signs in English", () => {
    expect(formatChord("B", "hu")).toBe("H");
    expect(formatChord("Bb", "hu")).toBe("B");
    expect(formatChord("Bm", "hu")).toBe("Hm");
    expect(formatChord("Bbm7", "hu")).toBe("Bm7");
    expect(formatChord("F#m", "hu")).toBe("F♯m");
    expect(formatChord("B", "en")).toBe("B");
    expect(formatChord("Bb", "en")).toBe("B♭");
    expect(formatChord("D/F#", "hu")).toBe("D/F♯");
    expect(formatChord("G/B", "hu")).toBe("G/H");
  });
});

describe("transposition", () => {
  it("transposes chords with flats or sharps", () => {
    expect(transposeChord("C", 2, false)).toBe("D");
    expect(transposeChord("C", 10, true)).toBe("Bb");
    expect(transposeChord("F#m7", 1, false)).toBe("Gm7");
    expect(transposeChord("D/F#", 2, false)).toBe("E/G#");
    expect(transposeChord("N.C.", 3, false)).toBe("N.C.");
  });

  it("transposes a key to every other key", () => {
    for (const from of KEYS_MAJOR) {
      for (const to of KEYS_MAJOR) {
        const result = transposeKey(from, interval(from, to)!);
        expect(interval(result, to), `${from} -> ${to}: ${result}`).toBe(0);
      }
    }
    expect(transposeKey("Em", 3)).toBe("Gm");
    expect(transposeKey("Em", 10)).toBe("Dm");
    expect(transposeKey("G", 3)).toBe("Bb");
  });

  it("round-trips a ChordPro text through all 12 keys", () => {
    const text = "[G]Szent [D/F#]vagy, [Em]Uram, [C]szent [Bm7]vagy";
    for (const key of KEYS_MAJOR) {
      expect(transposeChordPro(transposeChordPro(text, "G", key), key, "G")).toBe(text);
    }
  });

  it("G to Bb, the key directive and the capo shapes", () => {
    expect(transposeChordPro("[G]a [C]b [D]c", "G", "Bb")).toBe("[Bb]a [Eb]b [F]c");
    expect(transposeChordPro("{key: G}", "G", "A")).toBe("{key: A}");
    // Sounding in Bb with capo 3 = shapes in G.
    expect(transposeChordPro("[G]a [C]b [D]c", "G", "Bb", 3)).toBe("[G]a [C]b [D]c");
    expect(transposeChordPro("[G]a", "G", "A", 2)).toBe("[G]a");
  });
});

describe("parseChordPro", () => {
  it("separates directives and attaches chords to syllables", () => {
    const lines = parseChordPro("{title: Cím}\n[G]Szent [D]vagy\nCsak szöveg");
    expect(lines[0]).toEqual({ kind: "directive", name: "title", value: "Cím" });
    expect(lines[1]).toEqual({
      kind: "text",
      parts: [
        { chord: "G", text: "Szent " },
        { chord: "D", text: "vagy" },
      ],
    });
    expect(lines[2]).toEqual({ kind: "text", parts: [{ chord: null, text: "Csak szöveg" }] });
  });
});
