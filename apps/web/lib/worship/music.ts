/**
 * Pure music helpers of the song library (D-64, L-11): key and chord transposition, ChordPro
 * parsing and Hungarian H/B note naming.
 *
 * Keys and chords are stored in English letter notation (`B` = H, `Bb` = B). The notation is
 * display-only: in the Hungarian setting *B* (English) is shown as *H* and *B♭* as *B*.
 */

export type Notation = "hu" | "en";

const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] as const;
const SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11, H: 11 };

/** The 12 keys offered for transposition (flats where common). */
export const KEYS_MAJOR = FLAT_NAMES;

/** Every key a song or plan item can use: the 12 major keys, then the 12 minor keys. */
export const ALL_KEYS: readonly string[] = [
  ...FLAT_NAMES,
  ...["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"].map((k) => `${k}m`),
];

/** Keys written with flats. */
const FLAT_KEYS = new Set([
  "F",
  "Bb",
  "Eb",
  "Ab",
  "Db",
  "Gb",
  "Dm",
  "Gm",
  "Cm",
  "Fm",
  "Bbm",
  "Ebm",
]);

const ROOT = /^([A-H])([#b]?)(.*)$/;

/** Semitone (0–11) of a note name such as `F#`, `Bb`; null when it is not a note. */
export function semitoneOf(note: string): number | null {
  const m = /^([A-H])([#b]?)$/.exec(note);
  if (!m) return null;
  const base = SEMITONE[m[1]!];
  if (base === undefined) return null;
  const shift = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
  return (((base + shift) % 12) + 12) % 12;
}

/** Whether chords in this key are spelled with flats. */
export function prefersFlats(key: string): boolean {
  return FLAT_KEYS.has(key);
}

function noteName(semitone: number, flats: boolean): string {
  const i = ((semitone % 12) + 12) % 12;
  return (flats ? FLAT_NAMES : SHARP_NAMES)[i]!;
}

/** Interval in semitones (0–11, upwards) between two keys; null for unknown notes. */
export function interval(fromKey: string, toKey: string): number | null {
  const a = semitoneOf(fromKey.replace(/m$/, ""));
  const b = semitoneOf(toKey.replace(/m$/, ""));
  return a === null || b === null ? null : (b - a + 12) % 12;
}

/** Transposes one chord symbol (`F#m7`, `D/F#`, `Bb`) by `semitones`; unknown text is kept. */
export function transposeChord(chord: string, semitones: number, flats: boolean): string {
  const [main = "", bass] = chord.split("/", 2);
  const m = ROOT.exec(main);
  if (!m) return chord;
  const root = semitoneOf(`${m[1]}${m[2]}`);
  if (root === null) return chord;
  const out = noteName(root + semitones, flats) + (m[3] ?? "");
  if (bass === undefined) return out;
  const b = semitoneOf(bass);
  return b === null ? chord : `${out}/${noteName(b + semitones, flats)}`;
}

/** Transposes a key name (`G`, `Em`, `Bb`) by `semitones`, spelled the usual way for the result. */
export function transposeKey(key: string, semitones: number): string {
  const minor = key.endsWith("m");
  const root = semitoneOf(minor ? key.slice(0, -1) : key);
  if (root === null) return key;
  const suffix = minor ? "m" : "";
  const flat = noteName(root + semitones, true) + suffix;
  return prefersFlats(flat) || !flat.includes("b")
    ? flat
    : noteName(root + semitones, false) + suffix;
}

/** Hungarian (`hu`) or English display of a key or chord: B → H, Bb → B, and ♯/♭ signs. */
export function formatChord(chord: string, notation: Notation): string {
  const one = (text: string): string => {
    const m = ROOT.exec(text);
    if (!m) return text;
    const letter = m[1]!;
    const acc = m[2]!;
    const rest = m[3] ?? "";
    if (notation === "hu" && (letter === "B" || letter === "H")) {
      return acc === "b" ? `B${rest}` : acc === "#" ? `H♯${rest}` : `H${rest}`;
    }
    const sign = acc === "#" ? "♯" : acc === "b" ? "♭" : "";
    return `${letter === "H" ? "B" : letter}${sign}${rest}`;
  };
  const [main = "", bass] = chord.split("/", 2);
  return bass === undefined ? one(main) : `${one(main)}/${one(bass)}`;
}

/** Chords of a ChordPro text, in order of appearance. */
export function chordsOf(chordpro: string): string[] {
  return [...chordpro.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]!);
}

/**
 * Transposes every `[chord]` of a ChordPro text from `fromKey` to `toKey`; `{key: …}` follows.
 * With `capo` the *shapes* are shown (what is played with the capo on that fret): every chord is
 * lowered by `capo` semitones.
 */
export function transposeChordPro(
  chordpro: string,
  fromKey: string,
  toKey: string,
  capo = 0,
): string {
  const up = interval(fromKey, toKey) ?? 0;
  const shapeKey = transposeKey(toKey, -capo);
  const flats = prefersFlats(shapeKey);
  return chordpro
    .replace(
      /\[([^\]]+)\]/g,
      (_all, chord: string) => `[${transposeChord(chord, up - capo, flats)}]`,
    )
    .replace(
      /\{key:\s*([^}]+)\}/g,
      (_all, key: string) => `{key: ${transposeKey(key.trim(), up)}}`,
    );
}

export type ChordProLine =
  | { kind: "directive"; name: string; value: string }
  | { kind: "text"; parts: { chord: string | null; text: string }[] };

/** Splits ChordPro into directives and lyric lines with chords attached to their syllables. */
export function parseChordPro(chordpro: string): ChordProLine[] {
  return chordpro.split("\n").flatMap((line): ChordProLine[] => {
    const d = /^\{\s*([a-z_]+)\s*:?\s*(.*?)\s*\}$/.exec(line.trim());
    if (d) return [{ kind: "directive", name: d[1]!, value: d[2] ?? "" }];
    if (line.trim() === "") return [];
    const parts: { chord: string | null; text: string }[] = [];
    let last = 0;
    let chord: string | null = null;
    for (const m of line.matchAll(/\[([^\]]+)\]/g)) {
      const text = line.slice(last, m.index);
      if (text !== "" || chord !== null) parts.push({ chord, text });
      chord = m[1]!;
      last = m.index + m[0].length;
    }
    parts.push({ chord, text: line.slice(last) });
    return [{ kind: "text", parts }];
  });
}
