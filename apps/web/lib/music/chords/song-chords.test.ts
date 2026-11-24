import { describe, expect, it } from "vitest";

import { parseChordPro } from "@/lib/music/chordpro";
import { songChords } from "./song-chords";

describe("songChords", () => {
  it("gives each chord once, in the order the song plays them", () => {
    const chart = parseChordPro(
      [
        "{start_of_verse}",
        "[G]Amazing [D]grace, how [G]sweet",
        "[C]the sound [G]that",
        "{end_of_verse}",
      ].join("\n"),
    );
    expect(songChords(chart.parts)).toEqual(["G", "D", "C"]);
  });

  it("leaves out remarks and tab lines", () => {
    const chart = parseChordPro(
      ["[*Riff][Am]Hello", "{start_of_tab}", "e|--[X]--|", "{end_of_tab}", "[F]there"].join("\n"),
    );
    expect(songChords(chart.parts)).toEqual(["Am", "F"]);
  });

  it("reads a recalled chorus", () => {
    const chart = parseChordPro(
      ["{start_of_chorus}", "[Em]Sing", "{end_of_chorus}", "{chorus}"].join("\n"),
    );
    // Only the recall, as in a section order that plays the chorus once.
    const recall = chart.parts.filter((part) => part.section === null);
    expect(songChords(recall)).toEqual(["Em"]);
  });

  it("gives no chords for a chart without chords", () => {
    expect(songChords(parseChordPro("Just words").parts)).toEqual([]);
  });
});
