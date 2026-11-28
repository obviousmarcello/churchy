// The tempo for the delay effects of an Allen & Heath SQ desk (SQ-5, SQ-6, SQ-7).
//
// The MIDI protocol of the SQ has no message for the parameters of an effect,
// and the SQ does not follow MIDI clock. But MIDI notes press its soft keys.
// On the desk, a soft key gets the function "Tap Tempo" of a delay effect, and
// the note value of the delay is set on the desk. The app taps that key a few
// times at the tempo, a quarter note apart, for each change of the tempo.
//
// Two ways to the desk, with the same notes:
// - The network: MIDI over TCP to port 51325 of the desk. Only the desktop
//   app can open a TCP connection (`electron/sq.ts`).
// - MIDI over USB: the USB-B port of the desk.
//
// See "SQ MIDI Protocol", Issue 5, by Allen & Heath: 3.2 Soft Keys.

export const SQ_MIDI_PORT = 51325;
/** The SQ-6 and the SQ-7 have 16 soft keys, the SQ-5 has 8. */
export const SQ_SOFT_KEYS = 16;
/** The taps for one tempo: 3 equal times between them. */
export const SQ_TAPS = 4;

/** A key press is a note on, and the release a note off. */
const PRESS_MS = 30;
/** The SQ counts the time between taps. Longer or shorter times are not a tempo. */
export const SQ_MIN_TAP_MS = 100;
export const SQ_MAX_TAP_MS = 3000;

/** Soft key 1 is the note C3 (0x30), soft key 2 is C#3, and so on. */
export function softKeyNote(key: number): number {
  return 0x2f + key;
}

/** The time between two taps: one quarter note, in whole ms. */
export function tapIntervalMs(bpm: number, quarterNotesPerBeat: number): number {
  const ms = Math.round(60000 / bpm / quarterNotesPerBeat);
  return Math.min(SQ_MAX_TAP_MS, Math.max(SQ_MIN_TAP_MS, ms));
}

/** A MIDI message and its time in ms after the first tap. */
export type TimedMidi = { data: number[]; at: number };

/** The presses and releases of `keys` on MIDI channel `channel` (1 to 16): `taps` taps, `intervalMs` apart. */
export function sqTapMessages(
  channel: number,
  keys: number[],
  intervalMs: number,
  taps = SQ_TAPS,
): TimedMidi[] {
  const messages: TimedMidi[] = [];
  for (let tap = 0; tap < taps; tap++) {
    const at = tap * intervalMs;
    for (const key of keys) {
      messages.push({ data: [0x90 | (channel - 1), softKeyNote(key), 0x7f], at });
      messages.push({ data: [0x80 | (channel - 1), softKeyNote(key), 0x00], at: at + PRESS_MS });
    }
  }
  return messages.sort((a, b) => a.at - b.at);
}

export function isMidiChannel(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 16;
}

export function isSoftKey(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= SQ_SOFT_KEYS;
}
