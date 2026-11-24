import { describe, expect, it } from "vitest";

import {
  chordsOverLyricsToChordPro,
  convertChordLines,
  convertPlainChart,
} from "./chords-over-lyrics";

describe("chordsOverLyricsToChordPro", () => {
  it("puts each chord line into the lyrics line below it, at the same columns", () => {
    expect(
      chordsOverLyricsToChordPro(
        ["G             C        G", "Amazing grace, how sweet the sound"].join("\n"),
      ),
    ).toBe("[G]Amazing grace,[C] how swee[G]t the sound");
  });

  it("reads German note names and other chord qualities", () => {
    expect(
      chordsOverLyricsToChordPro(
        ["H7     Esus4     F#m7/C#", "Világosságom, és segítségem"].join("\n"),
      ),
    ).toBe("[H7]Világos[Esus4]ságom, és [F#m7/C#]segítségem");
  });

  it("keeps a chord line without lyrics as chords, and ignores bar lines", () => {
    expect(
      chordsOverLyricsToChordPro(
        ["| D  | G  | A  |", "", "D        A", "Csak egyetlen vágyam van"].join("\n"),
      ),
    ).toBe(["[D] [G] [A]", "", "[D]Csak egye[A]tlen vágyam van"].join("\n"));
  });

  it("keeps the columns of chords after the end of the lyrics", () => {
    // A chord takes no column in ChordPro, so each chord keeps the columns after it.
    expect(chordsOverLyricsToChordPro(["D     G      A", "Amen"].join("\n"))).toBe(
      "[D]Amen  [G]       [A]",
    );
  });

  it("does not put chords into a section header", () => {
    expect(
      chordsOverLyricsToChordPro(["G  C", "CHORUS", "G      C", "Hallelujah"].join("\n")),
    ).toBe(["[G] [C]", "CHORUS", "[G]Hallelu[C]jah"].join("\n"));
  });

  it("leaves lyrics without chords and text with words that look like chords", () => {
    const text = ["A szeretet türelmes", "Add me a cup"].join("\n");
    expect(chordsOverLyricsToChordPro(text)).toBe(text);
  });

  it("removes extra empty lines and the empty lines at the ends", () => {
    expect(chordsOverLyricsToChordPro(["", "G", "Amen", "", "", "", "Amen"].join("\n"))).toBe(
      "[G]Amen\n\nAmen",
    );
  });
});

describe("convertChordLines", () => {
  it("keeps the other lines and the empty lines as written", () => {
    const text = [
      "",
      "{start_of_verse: Verse 1}",
      "G       C",
      "Amazing grace",
      "",
      "",
      "{end_of_verse}  ",
      "",
    ].join("\n");
    expect(convertChordLines(text)).toEqual({
      chordpro: [
        "",
        "{start_of_verse: Verse 1}",
        "[G]Amazing [C]grace",
        "",
        "",
        "{end_of_verse}  ",
        "",
      ].join("\n"),
      converted: true,
    });
  });

  it("leaves a chart without chord lines unchanged", () => {
    const text = "[G]Amazing [C]grace\r\n[D] [G]\n# G C\n{key: G}\nLyrics only  ";
    expect(convertChordLines(text)).toEqual({ chordpro: text, converted: false });
  });

  it("gives the same chart when it converts a converted chart again", () => {
    const first = convertChordLines(["| D | G |", "D     A", "Csak egyetlen"].join("\n")).chordpro;
    expect(convertChordLines(first)).toEqual({ chordpro: first, converted: false });
  });

  it("does not change the lines of tab and grid sections", () => {
    const text = [
      "{start_of_grid: Intro}",
      "| D . | G . |",
      "{end_of_grid}",
      "{sot}",
      "E A",
      "e|---|",
      "{eot}",
    ].join("\n");
    expect(convertChordLines(text)).toEqual({ chordpro: text, converted: false });
  });

  it("converts the chord lines after a tab section", () => {
    const text = ["{start_of_tab}", "G", "e|---|", "{end_of_tab}", "G", "Amen"].join("\n");
    expect(convertChordLines(text).chordpro).toBe(
      ["{start_of_tab}", "G", "e|---|", "{end_of_tab}", "[G]Amen"].join("\n"),
    );
  });

  it("does not put chords into a directive or a comment line", () => {
    expect(convertChordLines(["G  C", "{comment: 2x}", "D", "# note"].join("\n")).chordpro).toBe(
      ["[G] [C]", "{comment: 2x}", "[D]", "# note"].join("\n"),
    );
  });
});

describe("convertPlainChart", () => {
  it("converts the chord lines and the plain section headers", () => {
    expect(
      convertPlainChart(
        ["VERSE 1", "G       C", "Amazing grace", "", "CHORUS", "D", "Amen"].join("\n"),
      ),
    ).toEqual({
      chordpro: [
        "{start_of_verse: Verse 1}",
        "[G]Amazing [C]grace",
        "{end_of_verse}",
        "",
        "{start_of_chorus: Chorus}",
        "[D]Amen",
        "{end_of_chorus}",
      ].join("\n"),
      converted: true,
    });
  });

  it("converts the chord lines of a chart without headers", () => {
    expect(convertPlainChart("G\nAmen")).toEqual({ chordpro: "[G]Amen", converted: true });
  });

  it("leaves a ChordPro chart unchanged", () => {
    const text = "{start_of_verse: Verse 1}\n[G]Amen\n{end_of_verse}";
    expect(convertPlainChart(text)).toEqual({ chordpro: text, converted: false });
  });
});
