import { type Chord } from "./chord-name";

// Piano voicings: the left hand plays the bass note, the right hand the chord
// in close position, in root position or in an inversion.

export type KeysVoicing = {
  /** MIDI notes. The bass note, between C3 (48) and B3 (59). */
  left: number[];
  /** MIDI notes, from low to high. */
  right: number[];
};

const BASS_OCTAVE = 48; // C3
const RIGHT_OCTAVE = 60; // C4
/** The right hand moves down an octave when its top note is higher than this (G5). */
const HIGHEST = 79;

/** Root position first, then each inversion. */
export function keysVoicings(chord: Chord): KeysVoicing[] {
  const left = [BASS_OCTAVE + chord.bass];
  const root = RIGHT_OCTAVE + chord.root;
  const notes = chord.intervals.map((interval) => root + interval);
  // Only the notes in the first octave turn over; a ninth stays on top.
  const inversions = chord.intervals.filter((interval) => interval < 12).length;

  return Array.from({ length: inversions }, (_, inversion) => {
    let right = notes
      .map((note, index) => (index < inversion ? note + 12 : note))
      .sort((a, b) => a - b);
    if (right[right.length - 1]! > HIGHEST) right = right.map((note) => note - 12);
    return { left, right };
  });
}
