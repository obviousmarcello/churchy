// Reads chord names such as "F#m7" or "G/B" into their notes. The diagrams of
// the rehearsal panel use them for guitar and keys.

/** A chord as notes. Pitch classes count semitones from C: C = 0, C# = 1, … B = 11. */
export type Chord = {
  /** As written in the chart, e.g. "Am7/G". */
  symbol: string;
  root: number;
  /** Semitones above the root, from low to high, starting with 0. A ninth is 14. */
  intervals: number[];
  /** The pitch classes that must sound. A four-note chord can leave out its fifth. */
  required: number[];
  /** The pitch class of the lowest note: the note after the slash, else the root. */
  bass: number;
};

const QUALITIES: Record<string, number[]> = {
  "": [0, 4, 7],
  maj: [0, 4, 7],
  M: [0, 4, 7],
  m: [0, 3, 7],
  min: [0, 3, 7],
  "-": [0, 3, 7],
  "5": [0, 7],
  "6": [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  "7": [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  ma7: [0, 4, 7, 11],
  M7: [0, 4, 7, 11],
  Δ: [0, 4, 7, 11],
  Δ7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  min7: [0, 3, 7, 10],
  "-7": [0, 3, 7, 10],
  m7b5: [0, 3, 6, 10],
  ø: [0, 3, 6, 10],
  ø7: [0, 3, 6, 10],
  dim: [0, 3, 6],
  "°": [0, 3, 6],
  dim7: [0, 3, 6, 9],
  "°7": [0, 3, 6, 9],
  aug: [0, 4, 8],
  "+": [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  sus: [0, 5, 7],
  "7sus4": [0, 5, 7, 10],
  "7sus": [0, 5, 7, 10],
  add9: [0, 4, 7, 14],
  add2: [0, 2, 4, 7],
  madd9: [0, 3, 7, 14],
  "9": [0, 4, 7, 10, 14],
  m9: [0, 3, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14],
};

const NATURALS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
/** The usual spelling when the chart gives no sharp or flat to follow. */
export const COMMON_NAMES = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

const CHORD_NAME = /^([A-G])([#b♯♭]?)(.*?)(?:\/([A-G])([#b♯♭]?))?$/;
/** The text after the root, e.g. "m7b5", "sus4", "add9", "13" or "6/9". Words such as "End" do not match. */
const QUALITY_TEXT = /^(?:maj|min|dim|aug|sus|add|alt|[mMΔø°+\-#b♯♭\d()^,/])*$/;
/** An optional chord, e.g. "(Em)". */
const OPTIONAL_CHORD = /^\((.+)\)$/;

function pitchClass(letter: string, accidental: string) {
  const shift =
    accidental === "#" || accidental === "♯"
      ? 1
      : accidental === "b" || accidental === "♭"
        ? -1
        : 0;
  return mod12(NATURALS[letter]! + shift);
}

export function mod12(value: number) {
  return ((value % 12) + 12) % 12;
}

/** The notes of a chord name, or null for a name it does not know (e.g. "N.C."). */
export function parseChordName(symbol: string): Chord | null {
  const match = CHORD_NAME.exec(symbol.trim());
  if (!match) return null;
  const [, letter, accidental, quality, bassLetter, bassAccidental] = match;
  const intervals = QUALITIES[quality!.replace(/[()\s]/g, "")];
  if (!intervals) return null;

  const root = pitchClass(letter!, accidental!);
  // The fifth is the note that a full chord can best do without.
  const required =
    intervals.length >= 4 ? intervals.filter((interval) => interval !== 7) : intervals;
  return {
    symbol,
    root,
    intervals,
    required: [...new Set(required.map((interval) => mod12(root + interval)))],
    bass: bassLetter ? pitchClass(bassLetter, bassAccidental!) : root,
  };
}

/**
 * A chord name, also with a quality that `parseChordName` does not know, e.g.
 * "G2", "C13", "E7#9" or the optional chord "(Em)". Words such as "End" are not.
 */
export function isChordName(symbol: string) {
  const trimmed = symbol.trim();
  const match = CHORD_NAME.exec(OPTIONAL_CHORD.exec(trimmed)?.[1] ?? trimmed);
  return match !== null && QUALITY_TEXT.test(match[3]!);
}

export type Spelling = "sharp" | "flat" | "common";

/** The name of a pitch class. `spelling` follows the sharps or flats of a chord name. */
export function noteName(pitch: number, spelling: Spelling = "common") {
  const names =
    spelling === "sharp" ? SHARP_NAMES : spelling === "flat" ? FLAT_NAMES : COMMON_NAMES;
  return names[mod12(pitch)];
}

/** How to name the notes of a chord: as its root is written, else as in its key (A: sharps, F: flats). */
export function chordSpelling(symbol: string): Spelling {
  const match = CHORD_NAME.exec(symbol.trim());
  if (!match) return "common";
  const [, letter, accidental, quality] = match;
  return accidental
    ? accidentalSpelling(accidental)
    : keySpelling(pitchClass(letter!, ""), isMinor(quality!))!;
}

/**
 * For example `transposeChordName("G/B", 2)` is "A/C#". Unknown names stay as
 * they are. Without `spelling`, the new name follows the sharps or flats of
 * the old one. With it, e.g. the spelling of the new key, all notes use it.
 * An optional chord keeps its parentheses: "(Em)" moved by 2 is "(F#m)".
 */
export function transposeChordName(symbol: string, semitones: number, spelling?: Spelling): string {
  const optional = OPTIONAL_CHORD.exec(symbol.trim());
  if (optional) return `(${transposeChordName(optional[1]!, semitones, spelling)})`;
  const match = CHORD_NAME.exec(symbol.trim());
  if (!match || mod12(semitones) === 0) return symbol;
  const [, letter, accidental, quality, bassLetter, bassAccidental] = match;
  const minor = isMinor(quality!);
  const rootPitch = mod12(pitchClass(letter!, accidental!) + semitones);
  const root =
    spelling && spelling !== "common"
      ? noteName(rootPitch, spelling)
      : accidental && !spelling
        ? noteName(rootPitch, accidentalSpelling(accidental))
        : (minor ? MINOR_NAMES : COMMON_NAMES)[rootPitch];
  // A bass without its own sharp or flat follows the new root, e.g. A/C#, Bb/D.
  const bassSpelling =
    spelling ??
    (bassAccidental
      ? accidentalSpelling(bassAccidental)
      : root!.length > 1
        ? accidentalSpelling(root![1]!)
        : keySpelling(rootPitch, minor));
  const bass = bassLetter
    ? `/${noteName(pitchClass(bassLetter, bassAccidental!) + semitones, bassSpelling)}`
    : "";
  return `${root}${quality}${bass}`;
}

/** The usual names of the roots of minor chords, e.g. C#m, not Dbm. */
export const MINOR_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];

/** Sharps or flats in the major key of each pitch class. */
const MAJOR_KEY_SPELLINGS: Spelling[] = [
  "common",
  "flat",
  "sharp",
  "flat",
  "sharp",
  "flat",
  "sharp",
  "sharp",
  "flat",
  "sharp",
  "flat",
  "sharp",
];

function isMinor(quality: string) {
  return /^(m(?!aj)|min|-)/.test(quality);
}

/** A minor key has the sharps or flats of the major key a minor third higher. */
export function keySpelling(root: number, minor: boolean) {
  return MAJOR_KEY_SPELLINGS[mod12(root + (minor ? 3 : 0))];
}

function accidentalSpelling(accidental: string): Spelling {
  return accidental === "#" || accidental === "♯" ? "sharp" : "flat";
}
