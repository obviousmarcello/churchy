import { describe, expect, it } from "vitest";

import { parseChordPro } from "@/lib/music/chordpro";
import { chartCapo, chartWithCapo } from "./capo";
import { songChords } from "./song-chords";

describe("chartCapo", () => {
  it("reads the capo directive", () => {
    expect(chartCapo(parseChordPro("{capo: 3}\n[G]Hello"))).toBe(3);
  });

  it("gives 0 without a capo or with a value in another format", () => {
    expect(chartCapo(parseChordPro("[G]Hello"))).toBe(0);
    expect(chartCapo(parseChordPro("{capo: two}\n[G]Hello"))).toBe(0);
  });

  it("reads the number before a word", () => {
    expect(chartCapo(parseChordPro("{capo: 2nd fret}\n[G]Hello"))).toBe(2);
  });
});

describe("chartWithCapo", () => {
  it("moves the shapes down when the capo goes up", () => {
    const chart = parseChordPro("[A]Amazing [E]grace, [F#m]how [D/F#]sweet");
    expect(songChords(chartWithCapo(chart, 2).parts)).toEqual(["G", "D", "Em", "C/E"]);
  });

  it("starts from the chart's capo", () => {
    const chart = parseChordPro("{capo: 2}\n[G]Amazing [D]grace");
    expect(songChords(chartWithCapo(chart, 0).parts)).toEqual(["A", "E"]);
    expect(songChords(chartWithCapo(chart, 5).parts)).toEqual(["E", "B"]);
  });

  it("gives the same chart for the chart's own capo", () => {
    const chart = parseChordPro("{capo: 4}\n[G]Hello");
    expect(chartWithCapo(chart, 4)).toBe(chart);
  });

  it("keeps remarks and the lines of tabs as written, and moves the chorus reprise", () => {
    const chart = parseChordPro(
      [
        "{start_of_chorus}",
        "[*C riff][C]Sing",
        "{end_of_chorus}",
        "{start_of_tab}",
        "e|--3--|",
        "{end_of_tab}",
        "{chorus}",
      ].join("\n"),
    );
    const moved = chartWithCapo(chart, 3);
    expect(songChords(moved.parts)).toEqual(["A"]);
    expect(moved.parts[0]!.lines[0]).toMatchObject({
      kind: "lyrics",
      segments: [{ chord: "C riff", annotation: true }, { chord: "A" }],
    });
    expect(moved.parts[1]!.lines).toEqual(chart.parts[1]!.lines);
    const reprise = moved.parts.at(-1)?.lines.find((line) => line.kind === "chorus");
    expect(reprise).toMatchObject({
      lines: [{ kind: "lyrics", segments: [{ annotation: true }, { chord: "A" }] }],
    });
  });

  it("moves the chords of a grid, but keeps its bar lines and beats", () => {
    const chart = parseChordPro(
      "{start_of_grid}\n|| A . . . | E/G# . . . | N.C. % ||\n{end_of_grid}",
    );
    expect(chartWithCapo(chart, 2).parts[0]!.lines).toEqual([
      { kind: "verbatim", text: "|| G . . . | D/F# . . . | N.C. % ||" },
    ]);
  });

  it("moves grid chords with unusual qualities, but keeps words", () => {
    const chart = parseChordPro(
      "{capo: 2}\n{start_of_grid}\n| G2 . C13 . | D/F# . (Em) . | End |\n{end_of_grid}",
    );
    expect(chartWithCapo(chart, 0).parts[0]!.lines).toEqual([
      { kind: "verbatim", text: "| A2 . D13 . | E/G# . (F#m) . | End |" },
    ]);
  });

  it("moves optional chords over the lyrics", () => {
    const chart = parseChordPro("[A]Hello [(E)]world");
    expect(chartWithCapo(chart, 2).parts[0]!.lines).toEqual([
      parseChordPro("[G]Hello [(D)]world").parts[0]!.lines[0],
    ]);
  });
});
