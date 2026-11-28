import { mod12, parseChordName, type Chord } from "./chord-name";

// Finds playable guitar shapes for a chord in any tuning. It tries each
// combination of muted, open and fretted strings in an area of the neck, keeps
// the ones a hand can play, and sorts them from the easiest. In the open
// position of standard tuning, the shapes that guitarists learn come first.

export type GuitarTuning = "standard" | "openD" | "openG";

/** The MIDI notes of the open strings, from the lowest string. */
export const GUITAR_TUNINGS: Record<GuitarTuning, readonly number[]> = {
  standard: [40, 45, 50, 55, 59, 64], // E A D G B E
  openD: [38, 45, 50, 54, 57, 62], // D A D F# A D
  openG: [38, 43, 50, 55, 59, 62], // D G D G B D
};

/** 0 is the open position. The others are the first fret of the area. */
export const GUITAR_POSITIONS = [0, 3, 5, 7, 9] as const;

/** The frets of an area of the neck: the first one and the four after it. */
const WINDOW = 4;
/** The fretted notes of a shape are at most this many frets apart: four frets. */
const REACH = 3;
const MAX_FINGERS = 4;

export type GuitarVoicing = {
  /** One per string, from the lowest string. Null is muted, 0 is open. */
  frets: (number | null)[];
  /** The index finger holds this fret on the strings `from` to `to`. */
  barre: { fret: number; from: number; to: number } | null;
  /** The fret of the first row of the diagram. 1 shows the nut. */
  baseFret: number;
};

type Scored = GuitarVoicing & { score: number };

type Rules = {
  minStrings: number;
  /** The lowest note can be any note of the chord, not only its bass. */
  anyBass: boolean;
};

/**
 * The shapes of `chord` around `position`, from the easiest. When the strict
 * rules find nothing (some chords in open tunings), it allows three strings,
 * and then another note of the chord in the bass. A chord with a slash bass
 * keeps its bass. Empty if it finds nothing.
 */
export function guitarVoicings(
  chord: Chord,
  tuning: readonly number[],
  position: number,
  limit = 6,
): GuitarVoicing[] {
  const ruleSets: Rules[] = [
    { minStrings: chord.intervals.length <= 2 ? 3 : 4, anyBass: false },
    { minStrings: 3, anyBass: false },
    ...(chord.bass === chord.root ? [{ minStrings: 3, anyBass: true }] : []),
  ];
  for (const rules of ruleSets) {
    const found = search(chord, tuning, position, rules);
    if (found.length === 0) continue;

    const common =
      position === 0 && tuning.join() === GUITAR_TUNINGS.standard.join()
        ? commonShape(chord)
        : null;
    const first = common ? check(common, chord, tuning, position, rules) : null;
    const sorted = found.sort((a, b) => a.score - b.score);
    const ordered = first
      ? [first, ...sorted.filter((voicing) => voicing.frets.join() !== first.frets.join())]
      : sorted;
    return ordered
      .slice(0, limit)
      .map(({ frets, barre, baseFret }) => ({ frets, barre, baseFret }));
  }
  return [];
}

function search(chord: Chord, tuning: readonly number[], position: number, rules: Rules): Scored[] {
  const first = position === 0 ? 1 : position;
  const chordPitches = new Set(chord.intervals.map((interval) => mod12(chord.root + interval)));
  // The open and fretted notes that belong to the chord, per string.
  const options = tuning.map((open) => {
    const frets: (number | null)[] = [null];
    for (const fret of [0, ...range(first, first + WINDOW)]) {
      if (chordPitches.has(mod12(open + fret))) frets.push(fret);
    }
    return frets;
  });

  const found: Scored[] = [];
  const frets: (number | null)[] = [];
  function walk(string: number) {
    if (string === tuning.length) {
      const voicing = check(frets, chord, tuning, position, rules);
      if (voicing) found.push(voicing);
      return;
    }
    for (const fret of options[string]!) {
      frets[string] = fret;
      walk(string + 1);
    }
  }
  walk(0);
  return found;
}

function check(
  frets: (number | null)[],
  chord: Chord,
  tuning: readonly number[],
  position: number,
  rules: Rules,
): Scored | null {
  const sounding = frets.flatMap((fret, string) => (fret === null ? [] : [{ string, fret }]));
  if (sounding.length < Math.min(rules.minStrings, tuning.length)) return null;

  const notes = sounding.map(({ string, fret }) => tuning[string]! + fret);
  const pitches = new Set(notes.map(mod12));
  if (!chord.required.every((pitch) => pitches.has(pitch))) return null;
  // The lowest note is the bass of the chord. Open strings high on the neck
  // can sound lower than the strings under them.
  const bassIsRight = mod12(Math.min(...notes)) === chord.bass;
  if (!bassIsRight && !rules.anyBass) return null;

  // Muted strings under the bass are easy. Above it, the hand must damp them.
  let innerMutes = 0;
  let topMutes = 0;
  const lowest = sounding[0]!.string;
  const highest = sounding[sounding.length - 1]!.string;
  for (let string = lowest + 1; string < frets.length; string++) {
    if (frets[string] !== null) continue;
    if (string > highest) topMutes++;
    else innerMutes++;
  }
  if (innerMutes > 1) return null;

  const fretted = sounding.filter(({ fret }) => fret > 0);
  if (position > 0 && fretted.length === 0) return null;
  const fretValues = fretted.map(({ fret }) => fret);
  const minFret = fretted.length > 0 ? Math.min(...fretValues) : 0;
  const maxFret = fretted.length > 0 ? Math.max(...fretValues) : 0;
  const span = maxFret - minFret;
  if (span > REACH) return null;

  // Without a barre, one finger per fretted string.
  let fingers = fretted.length;
  let barre: GuitarVoicing["barre"] = null;
  if (fingers > MAX_FINGERS) {
    const atMin = fretted.filter(({ fret }) => fret === minFret).map(({ string }) => string);
    const from = atMin[0];
    const to = atMin[atMin.length - 1];
    // The index finger lies across the strings, so they cannot be open or muted.
    const canBarre =
      atMin.length >= 2 &&
      frets.slice(from, to! + 1).every((fret) => fret !== null && fret >= minFret);
    if (!canBarre) return null;
    fingers = 1 + fretted.filter(({ fret }) => fret > minFret).length;
    if (fingers > MAX_FINGERS) return null;
    barre = { fret: minFret, from: from!, to: to! };
  }

  const open = sounding.length - fretted.length;
  let score =
    fingers * 2 +
    span * 1.5 +
    (tuning.length - sounding.length) * 2 +
    innerMutes * 4 +
    topMutes * 3 +
    (barre ? (position === 0 ? 3 : 2) : 0) +
    (bassIsRight ? 0 : 6);
  if (position === 0) score -= open * 0.5;
  else score += open * 3 + (minFret - position) * 0.5;

  const baseFret = position === 0 && maxFret <= WINDOW + 1 ? 1 : minFret;
  return { frets: [...frets], barre, baseFret, score };
}

/**
 * The open-position shapes of standard tuning that guitarists learn. The
 * search finds most of them too, but it can prefer an odd shape with more
 * open strings, e.g. for Bm.
 */
const COMMON_SHAPES = [
  ["C", "x32010"],
  ["D", "xx0232"],
  ["E", "022100"],
  ["F", "133211"],
  ["F#", "244322"],
  ["G", "320003"],
  ["A", "x02220"],
  ["Bb", "x13331"],
  ["B", "x24442"],
  ["Eb", "xx1343"],
  ["Cm", "x35543"],
  ["Dm", "xx0231"],
  ["Em", "022000"],
  ["Fm", "133111"],
  ["F#m", "244222"],
  ["Am", "x02210"],
  ["Bbm", "x13321"],
  ["Bm", "x24432"],
  ["Ebm", "xx1342"],
  ["C7", "x32310"],
  ["D7", "xx0212"],
  ["E7", "020100"],
  ["F7", "131211"],
  ["F#7", "242322"],
  ["G7", "320001"],
  ["A7", "x02020"],
  ["B7", "x21202"],
  ["Dm7", "xx0211"],
  ["Em7", "022030"],
  ["F#m7", "242222"],
  ["Am7", "x02010"],
  ["Bm7", "x20202"],
  ["Cmaj7", "x32000"],
  ["Dmaj7", "xx0222"],
  ["Emaj7", "021100"],
  ["Fmaj7", "xx3210"],
  ["Gmaj7", "320002"],
  ["Amaj7", "x02120"],
  ["Dsus2", "xx0230"],
  ["Asus2", "x02200"],
  ["Dsus4", "xx0233"],
  ["Esus4", "022200"],
  ["Asus4", "x02230"],
  ["Cadd9", "x32030"],
  ["D/F#", "200232"],
  ["G/B", "x20003"],
  ["C/G", "332010"],
  ["C/E", "032010"],
] as const;

let commonShapes: Map<string, (number | null)[]> | null = null;

function chordKey(chord: Chord) {
  return `${chord.root}:${chord.intervals.join(",")}:${chord.bass}`;
}

function commonShape(chord: Chord) {
  commonShapes ??= new Map(
    COMMON_SHAPES.map(([symbol, shape]) => [
      chordKey(parseChordName(symbol)!),
      [...shape].map((fret) => (fret === "x" ? null : Number(fret))),
    ]),
  );
  return commonShapes.get(chordKey(chord)) ?? null;
}

function range(from: number, to: number) {
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}
