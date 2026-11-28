// Turns the text that the text recognition read from a photo of a chord sheet
// into a ChordPro chart: each chord line above a lyrics line goes into the
// lyrics, e.g. "G       C" above "Amazing grace" becomes "[G]Amazing [C]grace"
// (`chordsOverLyricsToChordPro`).
// Then the plain section headers become ChordPro sections
// (`convertPlainSections`). The user checks the result before saving it.

import { convertPlainSections } from "./chordpro-import";
import { chordsOverLyricsToChordPro } from "./chords-over-lyrics";
import type { OcrLine, OcrPage } from "./ocr/engine";

/** Lines closer than this part of a line height are one row, e.g. chords that the engine read as two lines. */
const SAME_ROW = 0.5;
/** A gap of more than this many line heights between rows is an empty line, e.g. between two sections. */
const PARAGRAPH_GAP = 1.6;

/** The chart of the pages, in order. */
export function ocrToChordPro(pages: OcrPage[]): string {
  const text = pages
    .map(ocrPageToText)
    .filter((page) => page.trim() !== "")
    .join("\n\n");
  return convertPlainSections(chordsOverLyricsToChordPro(text)).chordpro;
}

/**
 * The page as plain text in a fixed-width font: each word starts at the
 * column of its place on the image, so the chords stay above their syllables.
 */
export function ocrPageToText(page: OcrPage): string {
  const words = page.lines.flatMap((line) => line.words);
  if (words.length === 0) return "";

  // The width of one character: the middle value of all words, so a wide heading does not change it.
  const charWidth =
    median(words.map((word) => word.box.width / Math.max(1, [...word.text].length))) || 1;
  const lineHeight = median(page.lines.map((line) => line.box.height)) || 1;
  const left = Math.min(...words.map((word) => word.box.x));

  const out: string[] = [];
  let lastBottom: number | null = null;
  for (const row of rows(page.lines)) {
    const top = Math.min(...row.map((line) => line.box.y));
    if (lastBottom !== null && top - lastBottom > PARAGRAPH_GAP * lineHeight) out.push("");
    lastBottom = Math.max(...row.map((line) => line.box.y + line.box.height));

    let text = "";
    for (const word of row.flatMap((line) => line.words).toSorted((a, b) => a.box.x - b.box.x)) {
      const column = Math.round((word.box.x - left) / charWidth);
      // At least one space between two words.
      const start = Math.max(column, text.length === 0 ? 0 : text.length + 1);
      text = text.padEnd(start) + word.text;
    }
    out.push(text);
  }
  return out.join("\n");
}

/** The lines in rows from the top: lines at the same height are one row. */
function rows(lines: OcrLine[]): OcrLine[][] {
  const result: OcrLine[][] = [];
  for (const line of lines.toSorted((a, b) => center(a) - center(b))) {
    const row = result.at(-1);
    const height = Math.min(line.box.height, row?.[0]!.box.height ?? Infinity);
    if (row && Math.abs(center(line) - center(row[0]!)) < SAME_ROW * height) row.push(line);
    else result.push([line]);
  }
  return result;
}

function center(line: OcrLine): number {
  return line.box.y + line.box.height / 2;
}

function median(values: number[]): number {
  const sorted = values.filter(Number.isFinite).toSorted((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}
