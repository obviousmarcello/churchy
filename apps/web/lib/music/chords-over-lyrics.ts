// Converts a chart with the chords on their own line above the lyrics, as
// chord websites, Word documents and the text recognition of a photo write
// them, to ChordPro: "G       C" above "Amazing grace" becomes
// "[G]Amazing [C]grace". The song form runs it on paste and with a button, the
// models run it on save, and "Read from image" runs it on the text it reads.

import { convertPlainSections } from "./chordpro-import";
import { isChordName } from "./chords/chord-name";

/** Bar lines and repeat marks between chords, e.g. "| G | C |". */
const CHORD_LINE_MARK = /^(?:\|+|\/|-|%|:?\|\|?:?|\.{2,})$/;
/** ChordPro environments whose lines are not lyrics, e.g. a grid "| D . | G |". */
const RAW_START = /^\{\s*(?:start_of_(?:tab|grid|abc|ly|svg|textblock)|sot|sog)\s*(?::[^}]*)?\}$/i;
const RAW_END = /^\{\s*(?:end_of_(?:tab|grid|abc|ly|svg|textblock)|eot|eog)\s*\}$/i;

/**
 * The chart with each chord line above a lyrics line put into the lyrics as
 * ChordPro chords, at the same columns. A chord line without lyrics below it
 * becomes a line of ChordPro chords. Other lines, also the empty lines, stay
 * as they are. `converted` is false, and the text is unchanged, when the text
 * has no chord lines.
 */
export function convertChordLines(text: string): { chordpro: string; converted: boolean } {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let converted = false;
  let raw = false;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const trimmed = line!.trim();
    if (raw) {
      out.push(line!);
      if (RAW_END.test(trimmed)) raw = false;
      continue;
    }
    if (RAW_START.test(trimmed)) raw = true;

    const chords = chordColumns(line!);
    if (!chords) {
      out.push(line!);
      continue;
    }

    converted = true;
    const next = lines[index + 1];
    if (next !== undefined && isLyricsLine(next)) {
      out.push(withChords(next.trimEnd(), chords));
      index++;
    } else {
      out.push(chords.map(({ chord }) => `[${chord}]`).join(" "));
    }
  }

  return converted ? { chordpro: out.join("\n"), converted } : { chordpro: text, converted };
}

/**
 * The chart with its chord lines (`convertChordLines`) and its plain section
 * headers (`convertPlainSections`) converted to ChordPro. `converted` is false,
 * and the text is unchanged, when neither has anything to convert.
 */
export function convertPlainChart(text: string): { chordpro: string; converted: boolean } {
  const chords = convertChordLines(text);
  const sections = convertPlainSections(chords.chordpro);
  return { chordpro: sections.chordpro, converted: chords.converted || sections.converted };
}

/**
 * As `convertChordLines`, with at most one empty line in a row and none at the
 * start and the end, e.g. for the text that the text recognition read.
 */
export function chordsOverLyricsToChordPro(text: string): string {
  return convertChordLines(
    text
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n"),
  )
    .chordpro.replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The chords of a chord line with their columns, or null for another line. */
function chordColumns(line: string): { chord: string; column: number }[] | null {
  const tokens = [...line.matchAll(/\S+/g)].map((match) => ({
    text: match[0],
    column: match.index,
  }));
  const chords = tokens.filter((token) => !CHORD_LINE_MARK.test(token.text));
  if (chords.length === 0 || !chords.every((token) => isChord(token.text))) return null;
  return chords.map((token) => ({ chord: token.text, column: token.column }));
}

/** A chord name, also in German note names (H) and as an optional chord, e.g. "(Em)". */
function isChord(token: string): boolean {
  return isChordName(token.replace(/^H/, "B").replace(/\/H/, "/B"));
}

/** A line that a chord line can go into: not empty, not chords, not a section header, a directive or a comment. */
function isLyricsLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed === "" || trimmed.startsWith("{") || trimmed.startsWith("#") || chordColumns(line))
    return false;
  return !convertPlainSections(trimmed).converted;
}

/** The lyrics with each chord at its column. A chord after the end of the lyrics keeps its column too. */
function withChords(lyrics: string, chords: { chord: string; column: number }[]): string {
  let result = lyrics;
  // From the right, so the columns of the chords on the left stay true.
  for (const { chord, column } of chords.toSorted((a, b) => b.column - a.column)) {
    result = result.padEnd(column);
    result = result.slice(0, column) + `[${chord}]` + result.slice(column);
  }
  return result;
}
