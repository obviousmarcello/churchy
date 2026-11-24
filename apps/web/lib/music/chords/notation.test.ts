import { describe, expect, it } from "vitest";

import { parseChordPro } from "@/lib/music/chordpro";
import {
  chartInNotation,
  chartNotation,
  chartToEnglish,
  detectNotation,
  fromEnglish,
  toEnglish,
} from "./notation";
import { songChords } from "./song-chords";

describe("chartNotation", () => {
  it("finds German note names from an H", () => {
    expect(detectNotation("[E]Hello [H7]world")).toBe("german");
    expect(detectNotation("[E/H]Hello")).toBe("german");
    expect(detectNotation("{key: Hm}\nHello")).toBe("german");
    expect(detectNotation("[F]Hello [B]world")).toBe("english");
  });

  it("uses the directive first", () => {
    expect(chartNotation("{x_notation: german}\n[F]Hello [B]world")).toBe("german");
    expect(chartNotation("{x_notation: English}\n[H7]Hello")).toBe("english");
    expect(chartNotation("{x_notation: other}\n[H7]Hello")).toBe("german");
  });
});

describe("toEnglish and fromEnglish", () => {
  it("reads German note names", () => {
    expect(toEnglish("H7", "german")).toBe("B7");
    expect(toEnglish("B", "german")).toBe("Bb");
    expect(toEnglish("Bm/F", "german")).toBe("Bbm/F");
    expect(toEnglish("G/H", "german")).toBe("G/B");
    expect(toEnglish("Bb", "german")).toBe("Bb");
    expect(toEnglish("F#m", "german")).toBe("F#m");
  });

  it("keeps English note names, but reads H as B", () => {
    expect(toEnglish("B7", "english")).toBe("B7");
    expect(toEnglish("Bb", "english")).toBe("Bb");
    expect(toEnglish("Hm", "english")).toBe("Bm");
    expect(toEnglish("N.C.", "german")).toBe("N.C.");
  });

  it("writes German note names", () => {
    expect(fromEnglish("B7", "german")).toBe("H7");
    expect(fromEnglish("Bb", "german")).toBe("B");
    expect(fromEnglish("Bbm/D", "german")).toBe("Bm/D");
    expect(fromEnglish("G/B", "german")).toBe("G/H");
    expect(fromEnglish("A#", "german")).toBe("A#");
    expect(fromEnglish("B7", "english")).toBe("B7");
  });
});

describe("chartToEnglish and chartInNotation", () => {
  it("converts the chords, the grids and the key", () => {
    const chart = parseChordPro(
      "{key: F}\n[F]Hello [B]world [C/H]\n{start_of_grid}\n| B . H . |\n{end_of_grid}",
    );
    const english = chartToEnglish(chart, "german");
    expect(songChords(english.parts)).toEqual(["F", "Bb", "C/B"]);
    expect(english.parts[1]!.lines).toEqual([{ kind: "verbatim", text: "| Bb . B . |" }]);

    const german = chartInNotation(english, "german");
    expect(songChords(german.parts)).toEqual(["F", "B", "C/H"]);
    expect(chartInNotation(english, "english")).toBe(english);
  });
});
