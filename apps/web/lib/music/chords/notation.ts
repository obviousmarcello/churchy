import type { ChordProDocument } from "@/lib/music/chordpro";
import { mapChartChords } from "./transpose";

// Note names. English: B is the note B, Bb is B flat. German, as in Hungary:
// H is the note B, B is B flat. The app works in English inside: it converts
// a chart from its notation when it reads it, and shows the chords and keys
// in the notation that the user chooses.

export const NOTATIONS = ["english", "german"] as const;
export type Notation = (typeof NOTATIONS)[number];

/** The ChordPro directive of a chart's notation, `{x_notation: german}`. Keep it in sync with the migration `song_keys`. */
export const NOTATION_DIRECTIVE = "x_notation";

// Keep both patterns in sync with `public.chart_notation()` in the migration `song_keys`.
// As `public.chordpro_directive()`: `(?n)^\s*\{\s*name\s*:\s*([^}]*?)\s*\}`. Its
// `\s` also matches a line break, but its `[^}]` does not (`(?n)`), and `\s` is
// the ASCII white space (not a no-break space). Here the value is the text up
// to `}`, trimmed, with no line break in it: the same matches without
// overlapping quantifiers next to the value, which backtrack on a long line.
const DIRECTIVE_PATTERN = /^[ \t\v\f\r]*\{[ \t\n\v\f\r]*x_notation[ \t\n\v\f\r]*:([^}]*)\}/gm;
/** A chord with the root or the bass H, or the key H: only German note names have H. */
const GERMAN_HINT = /\[H|\/H|\{\s*key\s*:\s*H/;

export function isNotation(value: unknown): value is Notation {
  return value === "english" || value === "german";
}

/** The note names of the language: German for Hungarian. */
export function defaultNoteNames(locale: string): Notation {
  return locale === "hu" ? "german" : "english";
}

/** The notation of a chart from its chords, without the directive: German when it has an H. */
export function detectNotation(source: string): Notation {
  return GERMAN_HINT.test(source) ? "german" : "english";
}

/** The notation in the chart's `{x_notation}`, or null without one. */
export function explicitNotation(source: string): Notation | null {
  // The first directive with a value on one line, as the database finds it:
  // after a value with a line break, the search goes on from the next line.
  const pattern = new RegExp(DIRECTIVE_PATTERN);
  for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
    const value = trimAsciiSpace(match[1]!);
    if (value.includes("\n")) {
      pattern.lastIndex = match.index + 1;
      continue;
    }
    const directive = value.toLowerCase();
    return isNotation(directive) ? directive : null;
  }
  return null;
}

/** Without the ASCII white space at the start and the end. No regex: a long run of spaces would backtrack. */
function trimAsciiSpace(text: string): string {
  const isSpace = (char: string) => char === " " || (char >= "\t" && char <= "\r");
  let start = 0;
  let end = text.length;
  while (start < end && isSpace(text[start]!)) start++;
  while (end > start && isSpace(text[end - 1]!)) end--;
  return text.slice(start, end);
}

/**
 * The notation of a chart: its `{x_notation}`, else from its chords. A German
 * chart without H (e.g. a song in F with B for B flat) needs the directive.
 */
export function chartNotation(source: string): Notation {
  return explicitNotation(source) ?? detectNotation(source);
}

const NOTE_NAME = /^([A-H])([#b♯♭]?)(.*?)(?:\/([A-H])([#b♯♭]?))?$/;

/**
 * A chord or a key in English note names, e.g. "H7" is "B7" and German "B"
 * is "Bb". H is always the note B, also in an English chart. Other names stay.
 */
export function toEnglish(symbol: string, notation: Notation): string {
  return mapNotes(symbol, (letter, accidental) => {
    if (letter === "H") return `B${accidental}`;
    if (letter !== "B" || notation !== "german") return `${letter}${accidental}`;
    // German B is B flat. "Bb" also means B flat, and "B#" means H.
    return isSharp(accidental) ? "B" : "Bb";
  });
}

/** A chord or a key from English note names into `notation`, e.g. "Bb" is "B" and "B/F#" is "H/F#" in German. */
export function fromEnglish(symbol: string, notation: Notation): string {
  if (notation === "english") return symbol;
  return mapNotes(symbol, (letter, accidental) => {
    if (letter !== "B") return `${letter}${accidental}`;
    if (accidental === "") return "H";
    return isSharp(accidental) ? "H#" : "B";
  });
}

/** The chart with its chords and `{key}` in English note names. */
export function chartToEnglish(document: ChordProDocument, notation: Notation): ChordProDocument {
  return convertChart(document, (chord) => toEnglish(chord, notation));
}

/** The chart, in English note names, with its chords and `{key}` in `notation`. */
export function chartInNotation(document: ChordProDocument, notation: Notation): ChordProDocument {
  if (notation === "english") return document;
  return convertChart(document, (chord) => fromEnglish(chord, notation));
}

function convertChart(
  document: ChordProDocument,
  convert: (chord: string) => string,
): ChordProDocument {
  const converted = mapChartChords(document, convert);
  const key = document.meta.key;
  return key ? { ...converted, meta: { ...converted.meta, key: convert(key) } } : converted;
}

function mapNotes(symbol: string, note: (letter: string, accidental: string) => string): string {
  const match = NOTE_NAME.exec(symbol.trim());
  if (!match) return symbol;
  const [, letter, accidental, rest, bassLetter, bassAccidental] = match;
  return `${note(letter!, accidental!)}${rest}${bassLetter ? `/${note(bassLetter, bassAccidental!)}` : ""}`;
}

function isSharp(accidental: string) {
  return accidental === "#" || accidental === "♯";
}
