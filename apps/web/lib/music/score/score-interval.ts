import { mod12 } from "@/lib/music/chords/chord-name";
import { keyName, keyShift, parseKey, sameKey, type MusicalKey } from "@/lib/music/chords/key";
import { keyFromFifths } from "./score-key";

// The sheet shows a score in the key of the sheet: the key that the chords
// show. The score moves from its own key (the key of the file, or the key that
// a song admin set) to that key. A score without a key moves as the chords
// move.
//
// The score library takes the move as an interval, e.g. "+M2" (a major second
// up) or "-m3" (a minor third down). The letters of the two keys give the
// number of the interval, so the score uses the sharps or flats of its new
// key: C to F# is "+A4", C to Gb is "+d5".

const LETTERS = "CDEFGAB";
// The semitones of the perfect (1, 4, 5) or major (2, 3, 6, 7) interval of each number.
const BASE_SEMITONES = [0, 2, 4, 5, 7, 9, 11];
const PERFECT = new Set([1, 4, 5]);
const KEY_SIGNATURE_FIFTHS = Array.from({ length: 15 }, (_, index) => index - 7);

/**
 * The interval that moves a score in `scoreKey` to the key of the sheet,
 * `shownKey`, e.g. "-m2" from Ab to G. A minor score goes to the minor key
 * with the key signature of `shownKey`, and a major score to the major key: a
 * MusicXML file often has no mode, so a minor song reads as its major key.
 * Without `scoreKey`, the score moves as the chords move from `chartKey` to
 * `shownKey`. Null when nothing moves.
 */
export function scoreTranspose(
  scoreKey: string | null,
  chartKey: string,
  shownKey: string,
): string | null {
  const score = scoreKey ? parseKey(scoreKey) : null;
  if (!scoreKey || !score) {
    const shift = keyShift(chartKey, shownKey);
    const target = parseKey(shownKey);
    // Another name of the shown key when it gives no simple interval, e.g. Db (not C#) from Gb.
    return shift && target
      ? interval(chartKey, spelledKey(chartKey, shownKey, target, shift), shift)
      : null;
  }

  const shown = parseKey(shownKey);
  if (!shown) return null;
  const sameMode = shown.minor === score.minor;
  // The relative minor is 3 semitones below its major key.
  const target: MusicalKey = {
    tonic: mod12(shown.tonic + (sameMode ? 0 : score.minor ? -3 : 3)),
    minor: score.minor,
  };
  const shift = mod12(target.tonic - score.tonic);
  if (!shift) return null;
  return interval(
    scoreKey,
    spelledKey(scoreKey, sameMode ? shownKey : keyName(target), target, shift),
    shift,
  );
}

/** The key of a score on the sheet: the key of the sheet, or else the score's own key. */
export function shownScoreKey(scoreKey: string | null, shownKey: string | null): string | null {
  return shownKey ?? scoreKey;
}

/**
 * `preferred`, or another name of the key `target` when `preferred` gives no
 * simple interval from `from`, e.g. Gb (not F#) from Cb.
 */
function spelledKey(from: string, preferred: string, target: MusicalKey, shift: number): string {
  if (interval(from, preferred, shift) !== null) return preferred;
  const names = KEY_SIGNATURE_FIFTHS.flatMap((fifths) => keyFromFifths(fifths, target.minor) ?? []);
  return (
    names.find((name) => sameKey(name, keyName(target)) && interval(from, name, shift) !== null) ??
    preferred
  );
}

/** The smallest move from the key `from` to `to`, `shift` semitones up (1 to 11). */
function interval(from: string, to: string, shift: number): string | null {
  const stepsUp = mod7(LETTERS.indexOf(to[0]!) - LETTERS.indexOf(from[0]!));
  const up = shift <= 6;
  const steps = up ? stepsUp : mod7(-stepsUp);
  const semitones = up ? shift : 12 - shift;
  const number = steps + 1;
  const quality = intervalQuality(number, semitones);
  return quality ? `${up ? "+" : "-"}${quality}${number}` : null;
}

function intervalQuality(number: number, semitones: number): string | null {
  const difference = semitones - BASE_SEMITONES[number - 1]!;
  if (PERFECT.has(number)) return { [-1]: "d", 0: "P", 1: "A" }[difference] ?? null;
  return { [-2]: "d", [-1]: "m", 0: "M", 1: "A" }[difference] ?? null;
}

function mod7(value: number) {
  return ((value % 7) + 7) % 7;
}
