import { describe, expect, it } from "vitest";

import { parseChordProSections } from "./chordpro";
import { convertPlainSections } from "./chordpro-import";

function convert(lines: string[]) {
  return convertPlainSections(lines.join("\n"));
}

const SAMPLE = `INTRO
[D]

VERSE 1
[D] Világosságom, és [G]segítségem
Te vagy, U[Bm]ram - kitől fél[E]nék?


CHORUS
[D] Csak egyetlen vágyam [A]van,
amíg csak élek [G]én.


VERSE 2
Felemelted fejem, s mikor hívtalak,
Te meghallgattál.
COLUMN_BREAK
CHORUS
[D] Csak egyetlen vágyam [A]van,
amíg csak élek [G]én, örök[A]ké.


BRIDGE
[Bm] Kezem kitárom Fe[G]léd,
tudom, Te mellettem [Bm]állsz!`;

describe("convertPlainSections", () => {
  it("converts a chart with plain headers", () => {
    const result = convertPlainSections(SAMPLE);

    expect(result.converted).toBe(true);
    expect(result.chordpro).toBe(`{start_of_intro: Intro}
[D]
{end_of_intro}

{start_of_verse: Verse 1}
[D] Világosságom, és [G]segítségem
Te vagy, U[Bm]ram - kitől fél[E]nék?
{end_of_verse}


{start_of_chorus: Chorus}
[D] Csak egyetlen vágyam [A]van,
amíg csak élek [G]én.
{end_of_chorus}


{start_of_verse: Verse 2}
Felemelted fejem, s mikor hívtalak,
Te meghallgattál.
{end_of_verse}
{column_break}
{start_of_chorus: Chorus 2}
[D] Csak egyetlen vágyam [A]van,
amíg csak élek [G]én, örök[A]ké.
{end_of_chorus}


{start_of_bridge: Bridge}
[Bm] Kezem kitárom Fe[G]léd,
tudom, Te mellettem [Bm]állsz!
{end_of_bridge}`);
    expect(parseChordProSections(result.chordpro).map((section) => section.label)).toEqual([
      "Intro",
      "Verse 1",
      "Chorus",
      "Verse 2",
      "Chorus 2",
      "Bridge",
    ]);
  });

  it("reads other header forms", () => {
    const result = convert([
      "[Verse 1]",
      "a",
      "Chorus:",
      "b",
      "(Pre-Chorus)",
      "c",
      "Verse A",
      "d",
      "1. VERSSZAK",
      "e",
      "Refrén",
      "f",
      "ELŐJÁTÉK",
      "g",
    ]);
    expect(parseChordProSections(result.chordpro)).toEqual([
      { type: "verse", label: "Verse 1" },
      { type: "chorus", label: "Chorus" },
      { type: "pre_chorus", label: "Pre-Chorus" },
      { type: "verse", label: "Verse A" },
      { type: "verse", label: "1. Versszak" },
      { type: "chorus", label: "Refrén" },
      { type: "intro", label: "Előjáték" },
    ]);
  });

  it("keeps chord lines, lyrics and the lines before the first header", () => {
    const result = convert(["Key of D", "VERSE", "[D]", "[C] Chorus of angels", "C", "Tag mich"]);
    expect(result.chordpro).toBe(
      [
        "Key of D",
        "{start_of_verse: Verse}",
        "[D]",
        "[C] Chorus of angels",
        "C",
        "Tag mich",
        "{end_of_verse}",
      ].join("\n"),
    );
  });

  it("leaves text without headers unchanged", () => {
    const text = "[D] Világosságom\n[G] segítségem";
    expect(convertPlainSections(text)).toEqual({ chordpro: text, converted: false });
  });

  it("converts the headers of a chart with directives and ChordPro sections", () => {
    const result = convert([
      "{tempo: 74}",
      "{key: D}",
      "INTRO",
      "[D]",
      "",
      "{start_of_verse: Verse 1}",
      "[D] a",
      "{end_of_verse}",
      "",
      "CHORUS",
      "[D] b",
      "",
      "VERSE 2",
      "c",
      "COLUMN_BREAK",
      "CHORUS",
      "[D] b, örök[A]ké",
    ]);
    expect(result).toEqual({
      chordpro: [
        "{tempo: 74}",
        "{key: D}",
        "{start_of_intro: Intro}",
        "[D]",
        "{end_of_intro}",
        "",
        "{start_of_verse: Verse 1}",
        "[D] a",
        "{end_of_verse}",
        "",
        "{start_of_chorus: Chorus}",
        "[D] b",
        "{end_of_chorus}",
        "",
        "{start_of_verse: Verse 2}",
        "c",
        "{end_of_verse}",
        "{column_break}",
        "{start_of_chorus: Chorus 2}",
        "[D] b, örök[A]ké",
        "{end_of_chorus}",
      ].join("\n"),
      converted: true,
    });
  });

  it("keeps header lines in ChordPro sections as lyrics", () => {
    const text = "{start_of_chorus}\nVerse 1\n{end_of_chorus}\n{sov}\nChorus\n{eov}";
    expect(convertPlainSections(text)).toEqual({ chordpro: text, converted: false });
  });

  it("numbers a plain section with the label of a ChordPro section", () => {
    const result = convert(["VERSE 1", "a", "{start_of_verse: Verse 1}", "b", "{end_of_verse}"]);
    expect(parseChordProSections(result.chordpro).map((section) => section.label)).toEqual([
      "Verse 1 2",
      "Verse 1",
    ]);
  });

  it("repeats a ChordPro chorus for an identical plain chorus", () => {
    const result = convert([
      "{start_of_chorus}",
      "[D] a",
      "{end_of_chorus}",
      "VERSE",
      "b",
      "CHORUS",
      "[D] a",
    ]);
    expect(result.chordpro).toBe(
      [
        "{start_of_chorus}",
        "[D] a",
        "{end_of_chorus}",
        "{start_of_verse: Verse}",
        "b",
        "{end_of_verse}",
        "{chorus: Chorus}",
      ].join("\n"),
    );
  });

  it("closes a plain section at a ChordPro break or section", () => {
    const result = convert([
      "VERSE",
      "a",
      "{column_break}",
      "b",
      "CHORUS",
      "c",
      "{soc: Refrain}",
      "d",
      "{eoc}",
    ]);
    expect(result.chordpro).toBe(
      [
        "{start_of_verse: Verse}",
        "a",
        "{end_of_verse}",
        "{column_break}",
        "b",
        "{start_of_chorus: Chorus}",
        "c",
        "{end_of_chorus}",
        "{soc: Refrain}",
        "d",
        "{eoc}",
      ].join("\n"),
    );
  });

  it("closes a plain section at a directive, but keeps comments in it", () => {
    const result = convert([
      "VERSE 1",
      "[D]a",
      "{comment: 2x}",
      "{chorus}",
      "VERSE 2",
      "b",
      "{key: G}",
    ]);
    expect(result.chordpro).toBe(
      [
        "{start_of_verse: Verse 1}",
        "[D]a",
        "{comment: 2x}",
        "{end_of_verse}",
        "{chorus}",
        "{start_of_verse: Verse 2}",
        "b",
        "{end_of_verse}",
        "{key: G}",
      ].join("\n"),
    );
  });

  it("leaves a converted chart unchanged", () => {
    const { chordpro } = convertPlainSections(SAMPLE);
    expect(convertPlainSections(chordpro)).toEqual({ chordpro, converted: false });
  });

  it("repeats the last chorus for an empty or identical chorus", () => {
    const result = convert([
      "CHORUS",
      "[D] a",
      "",
      "VERSE",
      "b",
      "",
      "CHORUS",
      "",
      "VERSE 2",
      "c",
      "CHORUS",
      "[D] a",
    ]);
    expect(result.chordpro).toBe(
      [
        "{start_of_chorus: Chorus}",
        "[D] a",
        "{end_of_chorus}",
        "",
        "{start_of_verse: Verse}",
        "b",
        "{end_of_verse}",
        "",
        "{chorus: Chorus}",
        "",
        "{start_of_verse: Verse 2}",
        "c",
        "{end_of_verse}",
        "{chorus: Chorus}",
      ].join("\n"),
    );
  });

  it("numbers repeated labels without taking the labels in use", () => {
    const result = convert(["VERSE", "a", "VERSE", "b", "VERSE 2", "c"]);
    expect(parseChordProSections(result.chordpro).map((section) => section.label)).toEqual([
      "Verse",
      "Verse 3",
      "Verse 2",
    ]);
  });

  it("shows an empty section other than a chorus as a comment", () => {
    expect(convert(["INTRO", "", "VERSE", "a"]).chordpro).toBe(
      ["{comment: Intro}", "", "{start_of_verse: Verse}", "a", "{end_of_verse}"].join("\n"),
    );
  });

  it("closes a ChordPro section at the next one, as the parser does", () => {
    const result = convert([
      "{start_of_verse}",
      "a",
      "{start_of_chorus}",
      "b",
      "{end_of_chorus}",
      "CHORUS",
      "c",
    ]);
    expect(result.chordpro).toBe(
      [
        "{start_of_verse}",
        "a",
        "{start_of_chorus}",
        "b",
        "{end_of_chorus}",
        "{start_of_chorus: Chorus 2}",
        "c",
        "{end_of_chorus}",
      ].join("\n"),
    );
  });

  it("converts break lines and closes the open section", () => {
    const result = convert(["VERSE", "a", "COLUMN BREAK", "b", "page_break"]);
    expect(result).toEqual({
      chordpro: [
        "{start_of_verse: Verse}",
        "a",
        "{end_of_verse}",
        "{column_break}",
        "b",
        "{new_page}",
      ].join("\n"),
      converted: true,
    });
  });
});
