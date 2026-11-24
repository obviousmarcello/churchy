import type { ChordProDocument, ChordProLine } from "@/lib/music/chordpro";
import { isChordName, transposeChordName, type Spelling } from "./chord-name";

/**
 * The chart with its chords moved by `semitones`. Remarks such as `[*Riff]`
 * and the lines of tabs stay as written. With `spelling`, all chord names use
 * it, e.g. the sharps or flats of a new key. Gives the same object for a move
 * of 0.
 */
export function transposeChart(
  document: ChordProDocument,
  semitones: number,
  spelling?: Spelling,
): ChordProDocument {
  if (semitones % 12 === 0) return document;
  return mapChartChords(document, (chord) => transposeChordName(chord, semitones, spelling));
}

/**
 * The chart with `map` applied to each chord: the chords over the lyrics, also
 * in a chorus reprise, and the chords of grids. Remarks such as `[*Riff]`, the
 * lines of tabs, and the bar lines and beats of grids stay as written.
 */
export function mapChartChords(
  document: ChordProDocument,
  map: (chord: string) => string,
): ChordProDocument {
  return {
    ...document,
    parts: document.parts.map((part) => {
      const mapLine = part.section?.type === "grid" ? mapGridLine : mapLyricsLine;
      return { ...part, lines: part.lines.map((line) => mapLine(line, map)) };
    }),
  };
}

function mapLyricsLine(line: ChordProLine, map: (chord: string) => string): ChordProLine {
  if (line.kind === "lyrics") {
    return {
      ...line,
      segments: line.segments.map((segment) =>
        segment.chord && !segment.annotation ? { ...segment, chord: map(segment.chord) } : segment,
      ),
    };
  }
  if (line.kind === "chorus" && line.lines) {
    return { ...line, lines: line.lines.map((reprise) => mapLyricsLine(reprise, map)) };
  }
  return line;
}

/** The chords of a grid line, e.g. `| A . . . | E . . . |`. Bar lines, beats and other marks stay. */
function mapGridLine(line: ChordProLine, map: (chord: string) => string): ChordProLine {
  if (line.kind !== "verbatim") return line;
  return {
    ...line,
    text: line.text.replace(/[^\s|]+/g, (token) => (isGridChord(token) ? map(token) : token)),
  };
}

/** A chord in English or German note names (H is the note B), also with an unusual quality such as "G2". */
function isGridChord(token: string) {
  return isChordName(token.replace(/^(\(?)H/, "$1B").replace(/\/H/, "/B"));
}
