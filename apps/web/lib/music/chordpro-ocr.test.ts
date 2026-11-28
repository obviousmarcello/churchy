import { describe, expect, it } from "vitest";

import { ocrPageToText, ocrToChordPro } from "./chordpro-ocr";
import type { OcrLine, OcrPage } from "./ocr/engine";

const CHAR = 10;
const ROW = 30;

/**
 * A page as an engine reads it from a sheet in a fixed-width font: each word
 * at its column and row, 10 pixels for each character and 30 for each row.
 * `top` moves the rows down, e.g. for a gap between two sections.
 */
function page(rows: string[], top = 0): OcrPage {
  const lines: OcrLine[] = [];
  rows.forEach((row, index) => {
    const words = [...row.matchAll(/\S+/g)].map((match) => ({
      text: match[0],
      box: {
        x: 40 + match.index * CHAR,
        y: top + index * ROW,
        width: match[0].length * CHAR,
        height: 20,
      },
    }));
    if (words.length === 0) return;
    const x = words[0]!.box.x;
    const right = words.at(-1)!.box.x + words.at(-1)!.box.width;
    lines.push({ words, box: { x, y: top + index * ROW, width: right - x, height: 20 } });
  });
  return { width: 1000, height: 1400, lines };
}

describe("ocrPageToText", () => {
  it("puts each word at the column of its place", () => {
    expect(ocrPageToText(page(["G       C", "Amazing grace"]))).toBe("G       C\nAmazing grace");
  });

  it("joins lines at the same height, and puts an empty line for a large gap", () => {
    const sheet: OcrPage = {
      width: 1000,
      height: 1400,
      lines: [
        ...page(["Amazing grace"], 30).lines,
        // The engine read the chords of one row as two lines, in the wrong order.
        {
          words: [{ text: "C", box: { x: 120, y: 2, width: 10, height: 20 } }],
          box: { x: 120, y: 2, width: 10, height: 20 },
        },
        {
          words: [{ text: "G", box: { x: 40, y: 0, width: 10, height: 20 } }],
          box: { x: 40, y: 0, width: 10, height: 20 },
        },
        ...page(["Was blind"], 200).lines,
      ],
    };
    expect(ocrPageToText(sheet)).toBe("G       C\nAmazing grace\n\nWas blind");
  });

  it("gives an empty text for a page without words", () => {
    expect(ocrPageToText({ width: 100, height: 100, lines: [] })).toBe("");
  });
});

describe("ocrToChordPro", () => {
  it("makes a chart with sections from the pages", () => {
    const first = page(["VERSE 1", "D                G", "Világosságom, és segítségem"]);
    const second = page(["CHORUS", "D                    A", "Csak egyetlen vágyam van"]);

    expect(ocrToChordPro([first, second])).toBe(
      [
        "{start_of_verse: Verse 1}",
        "[D]Világosságom, és [G]segítségem",
        "{end_of_verse}",
        "",
        "{start_of_chorus: Chorus}",
        "[D]Csak egyetlen vágyam [A]van",
        "{end_of_chorus}",
      ].join("\n"),
    );
  });
});
