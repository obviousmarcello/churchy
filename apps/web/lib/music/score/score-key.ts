// The key of a MusicXML score. MusicXML writes a key as the number of sharps
// (positive) or flats (negative) in the key signature, `<fifths>`, and an
// optional `<mode>`.

/** The major keys of the key signatures, from 7 flats to 7 sharps. */
export const MAJOR_SCORE_KEYS = [
  "Cb",
  "Gb",
  "Db",
  "Ab",
  "Eb",
  "Bb",
  "F",
  "C",
  "G",
  "D",
  "A",
  "E",
  "B",
  "F#",
  "C#",
] as const;
/** The minor keys of the key signatures, from 7 flats to 7 sharps. */
export const MINOR_SCORE_KEYS = [
  "Abm",
  "Ebm",
  "Bbm",
  "Fm",
  "Cm",
  "Gm",
  "Dm",
  "Am",
  "Em",
  "Bm",
  "F#m",
  "C#m",
  "G#m",
  "D#m",
  "A#m",
] as const;
/** Every key that a score can be in, as its key signature writes it. */
export const SCORE_KEYS = [...MAJOR_SCORE_KEYS, ...MINOR_SCORE_KEYS] as const;

/**
 * The key with this key signature, as the score writes it: -6 is "Gb", not
 * "F#". Null for a number that is not from -7 to 7.
 */
export function keyFromFifths(fifths: number, minor: boolean): string | null {
  if (!Number.isInteger(fifths) || fifths < -7 || fifths > 7) return null;
  return (minor ? MINOR_SCORE_KEYS : MAJOR_SCORE_KEYS)[fifths + 7]!;
}

/**
 * The key that a MusicXML document sounds in, e.g. "Bb" or "F#m": its first
 * key, and for a transposing part, e.g. a Bb trumpet, the concert key, not
 * the written key. Null when it has none. It reads the text only, so the file
 * never goes through an XML parser.
 */
export function scoreKey(xml: string): string | null {
  // The first part. Not `<part-list>`.
  const part = /<part[\s>][\s\S]*?<\/part>/.exec(xml)?.[0] ?? xml;
  const key = /<key\b[^>]*>([\s\S]*?)<\/key>/.exec(part)?.[1];
  if (!key) return null;
  const fifths = /<fifths>\s*(-?\d+)\s*<\/fifths>/.exec(key)?.[1];
  if (fifths === undefined) return null;
  const mode = /<mode>\s*([a-z]+)\s*<\/mode>/.exec(key)?.[1];
  const written = Number(fifths);
  if (!Number.isInteger(written) || written < -7 || written > 7) return null;
  return keyFromFifths(concertFifths(written, part), mode === "minor");
}

/**
 * The key signature that the part sounds in. `<transpose>` is what goes to a
 * written note to give the sounding note: for a Bb trumpet, 1 step and 2
 * semitones down. A move of `chromatic` semitones and `diatonic` steps
 * changes the key signature by 7 × chromatic − 12 × diatonic fifths.
 */
function concertFifths(written: number, part: string): number {
  const transpose = /<transpose\b[^>]*>([\s\S]*?)<\/transpose>/.exec(part)?.[1];
  const chromatic = Number(/<chromatic>\s*(-?\d+)\s*<\/chromatic>/.exec(transpose ?? "")?.[1] ?? 0);
  if (!transpose || !Number.isInteger(chromatic) || chromatic === 0) return written;
  const diatonicText = /<diatonic>\s*(-?\d+)\s*<\/diatonic>/.exec(transpose)?.[1];
  // Without `<diatonic>`, the usual number of steps for the semitones.
  const diatonic =
    diatonicText === undefined ? Math.round((chromatic * 7) / 12) : Number(diatonicText);
  let fifths = written + 7 * chromatic - 12 * diatonic;
  // The same key with the other name, e.g. Gb for F#, when the key signature has too many sharps or flats.
  while (fifths > 7) fifths -= 12;
  while (fifths < -7) fifths += 12;
  return fifths;
}
