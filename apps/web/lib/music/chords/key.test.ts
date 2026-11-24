import { describe, expect, it } from "vitest";

import { parseChordPro } from "@/lib/music/chordpro";
import { chartWithCapo } from "./capo";
import {
  canonicalKey,
  chartInKey,
  keyName,
  keyShift,
  keysLike,
  parseKey,
  playableOtherKeys,
  sameKey,
  splitKeys,
} from "./key";
import { songChords } from "./song-chords";

describe("parseKey", () => {
  it("reads the tonic and the mode", () => {
    expect(parseKey("G")).toEqual({ tonic: 7, minor: false });
    expect(parseKey(" F#m ")).toEqual({ tonic: 6, minor: true });
    expect(parseKey("Bbmin")).toEqual({ tonic: 10, minor: true });
    expect(parseKey("Cmaj7")).toEqual({ tonic: 0, minor: false });
  });

  it("gives null for a text that is not a key", () => {
    expect(parseKey("X")).toBeNull();
    expect(parseKey("G7")).toBeNull();
    expect(parseKey("")).toBeNull();
    expect(parseKey(null)).toBeNull();
  });
});

describe("keyName", () => {
  it("uses the usual spelling", () => {
    expect(keyName({ tonic: 10, minor: false })).toBe("Bb");
    expect(keyName({ tonic: 1, minor: true })).toBe("C#m");
    expect(keyName({ tonic: 6, minor: false })).toBe("F#");
  });
});

describe("sameKey and keyShift", () => {
  it("compares the notes, not the names", () => {
    expect(sameKey("F#", "Gb")).toBe(true);
    expect(sameKey("Am", "Amin")).toBe(true);
    expect(sameKey("A", "Am")).toBe(false);
    expect(sameKey(null, null)).toBe(false);
  });

  it("counts the semitones up, only between keys of the same mode", () => {
    expect(keyShift("G", "A")).toBe(2);
    expect(keyShift("G", "E")).toBe(9);
    expect(keyShift("Em", "Am")).toBe(5);
    expect(keyShift("G", "Em")).toBeNull();
    expect(keyShift(undefined, "E")).toBeNull();
  });
});

describe("keysLike", () => {
  it("lists the 12 keys of the same mode", () => {
    expect(keysLike("G")).toEqual([
      "C",
      "Db",
      "D",
      "Eb",
      "E",
      "F",
      "F#",
      "G",
      "Ab",
      "A",
      "Bb",
      "B",
    ]);
    expect(keysLike("Em")[1]).toBe("C#m");
    expect(keysLike("nothing")).toEqual([]);
  });
});

describe("playableOtherKeys", () => {
  it("keeps the valid keys of the same mode, without the written key and repeats", () => {
    expect(playableOtherKeys("G", ["E", "Gb", "F#", "G", "Am", "X", " A "])).toEqual([
      "E",
      "Gb",
      "A",
    ]);
  });

  it("is empty without a written key", () => {
    expect(playableOtherKeys(null, ["E"])).toEqual([]);
  });
});

describe("splitKeys", () => {
  it("splits at commas and spaces", () => {
    expect(splitKeys("E, A  Bb;C")).toEqual(["E", "A", "Bb", "C"]);
    expect(splitKeys("")).toEqual([]);
    expect(splitKeys(undefined)).toEqual([]);
  });
});

describe("chartInKey", () => {
  const chart = parseChordPro("{key: G}\n[G]Amazing [D/F#]grace, [Em]how [C]sweet");

  it("moves the chords to the key, with its sharps or flats", () => {
    const moved = chartInKey(chart, "E");
    expect(songChords(moved.parts)).toEqual(["E", "B/D#", "C#m", "A"]);
    expect(moved.meta.key).toBe("E");
    expect(songChords(chartInKey(chart, "Bb").parts)).toEqual(["Bb", "F/A", "Gm", "Eb"]);
    expect(songChords(chartInKey(chart, "Gb").parts)).toEqual(["Gb", "Db/F", "Ebm", "B"]);
  });

  it("gives the same chart when it cannot move or does not need to", () => {
    expect(chartInKey(chart, null)).toBe(chart);
    expect(chartInKey(chart, "G")).toBe(chart);
    expect(chartInKey(chart, "Em")).toBe(chart);
    const noKey = parseChordPro("[G]Hello");
    expect(chartInKey(noKey, "A")).toBe(noKey);
  });

  it("works with a capo on top", () => {
    // In A with capo 2: the shapes are those of G.
    expect(songChords(chartWithCapo(chartInKey(chart, "A"), 2).parts)).toEqual([
      "G",
      "D/F#",
      "Em",
      "C",
    ]);
  });
});

describe("keys in German note names", () => {
  it("reads H and B", () => {
    expect(parseKey("H", "german")).toEqual({ tonic: 11, minor: false });
    expect(parseKey("B", "german")).toEqual({ tonic: 10, minor: false });
    expect(parseKey("Hm")).toEqual({ tonic: 11, minor: true });
    expect(keyShift("F", "B", "german")).toBe(5);
    expect(playableOtherKeys("G", ["H", "B", "Bb"], "german")).toEqual(["H", "B"]);
  });

  it("gives the usual English name", () => {
    expect(canonicalKey("B", "german")).toBe("Bb");
    expect(canonicalKey("Hm", "german")).toBe("Bm");
    expect(canonicalKey("A#")).toBe("Bb");
    expect(canonicalKey("nothing")).toBeNull();
  });
});
