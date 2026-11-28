// The tempo for the delay effects of a Behringer X32 or Midas M32 desk.
//
// The X32 does not follow MIDI clock. The app sets the time of a delay effect
// in ms instead: 60000 / BPM for a quarter note, times the note value of the
// effect. It sends one command for each change of the tempo, not a stream.
//
// Two ways to the desk, with the same command:
// - The network: OSC over UDP, port 10023 (as X32-Edit). The value is a float
//   from 0 to 1. Only the desktop app can send UDP (`electron/x32.ts`).
// - MIDI: the OSC command as text in a SysEx message. The value is in ms, as
//   the desk shows it. The desk needs "OSC over MIDI SysEx" in Setup > Remote,
//   and a MIDI input: the MIDI socket, the USB card (Card MIDI) or the
//   network (RTP MIDI).
//
// The parameters come from "Unofficial X32/M32 OSC Remote Protocol" by
// Patrick-Gilles Maillot, and from his tools (`fxparse1.c`, `X32Tap.c`).

export const X32_OSC_PORT = 10023;
/** The X32 has 8 effect slots. */
export const X32_FX_SLOTS = 8;

/** The time of all these effects goes from 1 to 3000 ms, on a linear scale. */
export const X32_DELAY_MIN_MS = 1;
export const X32_DELAY_MAX_MS = 3000;

/**
 * The effects with a delay time: the number of the type (`/fx/<slot>/type`),
 * the parameter of the time (`/fx/<slot>/par/<nn>`), and the name on the desk.
 */
export const X32_DELAY_EFFECTS = {
  stereoDelay: { type: 10, param: 2, name: "Stereo Delay" },
  threeTapDelay: { type: 11, param: 1, name: "3-Tap Delay" },
  fourTapDelay: { type: 12, param: 1, name: "Rhythm Delay (4-Tap)" },
  delayChamber: { type: 21, param: 1, name: "Delay + Chamber" },
  delayChorus: { type: 24, param: 1, name: "Delay + Chorus" },
  delayFlanger: { type: 25, param: 1, name: "Delay + Flanger" },
  modulationDelay: { type: 26, param: 1, name: "Modulation Delay" },
} as const;

export type X32DelayEffect = keyof typeof X32_DELAY_EFFECTS;
export const X32_DELAY_EFFECT_KEYS = Object.keys(X32_DELAY_EFFECTS) as X32DelayEffect[];

/** The delay effect of an X32 type number. Null for an effect without a delay time. */
export function delayEffectOfType(type: number): X32DelayEffect | null {
  return X32_DELAY_EFFECT_KEYS.find((key) => X32_DELAY_EFFECTS[key].type === type) ?? null;
}

/** The note values of a delay, in quarter notes. */
export const SUBDIVISIONS = {
  half: 2,
  quarter: 1,
  dottedEighth: 0.75,
  quarterTriplet: 2 / 3,
  eighth: 0.5,
  eighthTriplet: 1 / 3,
  sixteenth: 0.25,
} as const;

export type Subdivision = keyof typeof SUBDIVISIONS;
export const SUBDIVISION_KEYS = Object.keys(SUBDIVISIONS) as Subdivision[];

/**
 * The delay time in whole ms, in the range of the desk. `bpm` counts the beats
 * of the metronome; a beat is `quarterNotesPerBeat` quarter notes (1.5 in 6/8
 * with dotted beats, see `Meter`).
 */
export function delayMs(
  bpm: number,
  quarterNotesPerBeat: number,
  subdivision: Subdivision,
): number {
  const quarterMs = 60000 / bpm / quarterNotesPerBeat;
  const ms = Math.round(quarterMs * SUBDIVISIONS[subdivision]);
  return Math.min(X32_DELAY_MAX_MS, Math.max(X32_DELAY_MIN_MS, ms));
}

/** The OSC address of the delay time of `effect` in `slot` (1 to 8). */
export function delayAddress(slot: number, effect: X32DelayEffect): string {
  return `/fx/${slot}/par/${String(X32_DELAY_EFFECTS[effect].param).padStart(2, "0")}`;
}

/** The OSC value of a delay time: 0 is 1 ms, 1 is 3000 ms. */
export function delayValue(ms: number): number {
  const value = (ms - X32_DELAY_MIN_MS) / (X32_DELAY_MAX_MS - X32_DELAY_MIN_MS);
  return Math.min(1, Math.max(0, value));
}

/** The SysEx header of an OSC command for the X32: Behringer's manufacturer ID (00 20 32), then 32. */
const SYSEX_HEADER = [0xf0, 0x00, 0x20, 0x32, 0x32];
const SYSEX_END = 0xf7;

/** An OSC command as text in a SysEx message, e.g. "/fx/1/par/02 375". ASCII only. */
export function oscSysex(text: string): number[] {
  return [...SYSEX_HEADER, ...[...text].map((char) => char.charCodeAt(0) & 0x7f), SYSEX_END];
}

/** The SysEx message that sets the delay time. The text has the value in ms, as the desk shows it. */
export function delaySysex(slot: number, effect: X32DelayEffect, ms: number): number[] {
  return oscSysex(`${delayAddress(slot, effect)} ${ms}`);
}
