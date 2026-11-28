import type { ChordProDocument } from "@/lib/music/chordpro";
import { transposeChart } from "./transpose";

// A chart's chords are the shapes to play with its `{capo}` on. A user can
// play the song with another capo: the song sounds the same, so the shapes
// move down by the frets that the capo moves up.

/** The highest capo a user can choose. Keep it in sync with the check in the migrations. */
export const CAPO_MAX = 11;

/** The chart's `{capo}`, or 0 when it has none. A word after the number is allowed, e.g. `{capo: 2nd fret}`. */
export function chartCapo(document: ChordProDocument): number {
  const match = /^(\d{1,2})(?!\d)/.exec(document.meta.capo?.trim() ?? "");
  return match ? Number.parseInt(match[1]!, 10) : 0;
}

/** The chart with the shapes for `capo`. Remarks such as `[*Riff]` and the lines of tabs stay as written. */
export function chartWithCapo(document: ChordProDocument, capo: number): ChordProDocument {
  return transposeChart(document, chartCapo(document) - capo);
}
