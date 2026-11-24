import type { ChordProDocument } from "@/lib/music/chordpro";
import { COMMON_NAMES, MINOR_NAMES, chordSpelling, mod12 } from "./chord-name";
import { toEnglish, type Notation } from "./notation";
import { transposeChart } from "./transpose";

// The keys of a song. A chart is written in one key, its `{key}`. It can also
// list other keys to play it in, `{x_other_keys: E, A}`: the sheet moves the
// chords to the key that the user, the event or the leader chooses. The keys
// of a chart are in its notation (see `notation.ts`). The other functions
// take English note names, unless they have a `notation`.

/** The format of a key in English or German note names, e.g. "G", "Bb", "F#m", "H" or "Cmaj7". */
export const KEY_PATTERN = /^[A-H][#b]?(m|min|maj7?)?$/;

/** The most other keys of an arrangement: one for each other note. */
export const OTHER_KEYS_MAX = 11;

/** The ChordPro directive of the other keys of a chart. Keep it in sync with the migration `song_keys`. */
export const OTHER_KEYS_DIRECTIVE = "x_other_keys";

/** A key as notes. `tonic` counts semitones from C: C = 0, C# = 1, … B = 11. */
export type MusicalKey = { tonic: number; minor: boolean };

const NATURALS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Null for a text that is not a key. */
export function parseKey(
  text: string | null | undefined,
  notation: Notation = "english",
): MusicalKey | null {
  const match = /^([A-G])([#b]?)(m|min|maj7?)?$/.exec(toEnglish(text?.trim() ?? "", notation));
  if (!match) return null;
  const [, letter, accidental, quality] = match;
  const shift = accidental === "#" ? 1 : accidental === "b" ? -1 : 0;
  return { tonic: mod12(NATURALS[letter!]! + shift), minor: quality === "m" || quality === "min" };
}

/** The usual name of a key, e.g. "Bb" or "C#m". */
export function keyName({ tonic, minor }: MusicalKey): string {
  return minor ? `${MINOR_NAMES[mod12(tonic)]}m` : COMMON_NAMES[mod12(tonic)]!;
}

/** True for two names of the same key, e.g. "F#" and "Gb". */
export function sameKey(
  a: string | null | undefined,
  b: string | null | undefined,
  notation: Notation = "english",
): boolean {
  const first = parseKey(a, notation);
  const second = parseKey(b, notation);
  return (
    first !== null &&
    second !== null &&
    first.tonic === second.tonic &&
    first.minor === second.minor
  );
}

/** The semitones from `from` up to `to`, 0 to 11. Null when a key is not valid, or one is minor and the other major. */
export function keyShift(
  from: string | null | undefined,
  to: string | null | undefined,
  notation: Notation = "english",
): number | null {
  const first = parseKey(from, notation);
  const second = parseKey(to, notation);
  if (!first || !second || first.minor !== second.minor) return null;
  return mod12(second.tonic - first.tonic);
}

/** The 12 keys in the mode of `key` (minor or major), from C. Empty when `key` is not valid. */
export function keysLike(key: string | null | undefined): string[] {
  const parsed = parseKey(key);
  if (!parsed) return [];
  return COMMON_NAMES.map((_, tonic) => keyName({ tonic, minor: parsed.minor }));
}

/**
 * The other keys of a chart that the sheet can play: valid keys in the mode
 * of `written`, without `written` and without repeats. Empty without a
 * written key.
 */
export function playableOtherKeys(
  written: string | null | undefined,
  others: readonly string[],
  notation: Notation = "english",
): string[] {
  const keys: string[] = [];
  for (const other of others) {
    const key = other.trim();
    if (
      keyShift(written, key, notation) === null ||
      sameKey(written, key, notation) ||
      keys.some((k) => sameKey(k, key, notation))
    ) {
      continue;
    }
    keys.push(key);
  }
  return keys;
}

/** The other keys in a `{x_other_keys}` directive, e.g. "E, A" or "E A". */
export function splitKeys(text: string | null | undefined): string[] {
  return (text ?? "").split(/[\s,;]+/).filter(Boolean);
}

/** The usual English name of a key in `notation`, e.g. German "B" is "Bb". Null for a text that is not a key. */
export function canonicalKey(
  text: string | null | undefined,
  notation: Notation = "english",
): string | null {
  const key = parseKey(text, notation);
  return key ? keyName(key) : null;
}

/**
 * The chart, in English note names, moved to `key`, with the sharps or flats of that key. Gives the
 * same chart for null, for its own key, and when it cannot move: the chart has
 * no `{key}`, or one key is minor and the other major.
 */
export function chartInKey(document: ChordProDocument, key: string | null): ChordProDocument {
  const shift = key === null ? null : keyShift(document.meta.key, key);
  if (!key || !shift) return document;
  return {
    ...transposeChart(document, shift, chordSpelling(key)),
    meta: { ...document.meta, key },
  };
}
