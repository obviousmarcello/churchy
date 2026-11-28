import type { HeardTick } from "./engine";

// The metronome sends its timing to a MIDI device (a drum machine, a looper,
// a synthesizer or a computer) through USB. MIDI has no message for the
// tempo: the device counts the clock messages, 24 for each quarter note, and
// finds the tempo from their distance. Start and Stop start and stop its
// sequence. The device starts on beat 1 of a bar, so its bars agree with the
// metronome.
//
// Each beat of the metronome sends the clock messages of that beat at once,
// with their times (`MIDIOutput.send` waits until each time). The count of
// messages for each beat is always the same, so the device stays on the beat
// also when a beat comes a little early or late.
//
// With `clickNotes`, each click also plays a note on channel 10 (the drums of
// General MIDI), so a drum module can play the clicks.

export const MIDI_TIMING_CLOCK = 0xf8;
export const MIDI_START = 0xfa;
export const MIDI_STOP = 0xfc;
export const MIDI_CLOCKS_PER_QUARTER_NOTE = 24;

/** Channel 10: General MIDI drums. */
const NOTE_ON = 0x99;
const NOTE_OFF = 0x89;
/** High wood block, for beat 1 of a bar with the accent. */
export const ACCENT_NOTE = 76;
/** Low wood block, for the other clicks. */
export const CLICK_NOTE = 77;
const VELOCITY = { accent: 127, beat: 100, subdivision: 60 } as const;
/** Shorter than the shortest time between two clicks: 400 BPM with 4 clicks per beat is 37.5 ms. */
const NOTE_MS = 30;

/** `MIDIOutput.send`. `time` is a `performance.now()` time; a time in the past sends at once. */
export type MidiSend = (data: number[], time: number) => void;

export type MidiClockOptions = {
  /** The length of the metronome's beat in quarter notes: 1 in 4/4, 1.5 in 6/8 with dotted beats. */
  quarterNotesPerBeat: number;
  /** Each click plays a note on channel 10. */
  clickNotes: boolean;
};

export class MidiClock {
  /** The time of the Start that the device got, or gets later. Null: the device is stopped. */
  private startTime: number | null = null;

  constructor(
    private readonly send: MidiSend,
    private options: MidiClockOptions,
  ) {}

  /** Starts at the next beat. */
  setOptions(options: MidiClockOptions) {
    this.options = options;
  }

  /** Each click of the metronome. `tick.time` is the time when the device must play it. */
  tick(tick: HeardTick) {
    if (this.options.clickNotes) {
      const note = tick.kind === "accent" ? ACCENT_NOTE : CLICK_NOTE;
      this.send([NOTE_ON, note, VELOCITY[tick.kind]], tick.time);
      this.send([NOTE_OFF, note, 0], tick.time + NOTE_MS);
    }
    if (tick.sub !== 0) return;

    const clocks = clocksPerBeat(this.options.quarterNotesPerBeat);
    const step = 60000 / tick.bpm / clocks;
    // The first clock after Start is beat 1 of the device's bar. Until beat 1
    // of a bar, the clocks only give the tempo.
    const start = this.startTime === null && tick.beat === 0;
    if (start) this.startTime = tick.time;
    for (let index = 0; index < clocks; index++) {
      // One message for both, so Start always arrives first.
      const data = start && index === 0 ? [MIDI_START, MIDI_TIMING_CLOCK] : [MIDI_TIMING_CLOCK];
      this.send(data, tick.time + index * step);
    }
  }

  /** The metronome stops. `now` is `performance.now()`. */
  stop(now: number) {
    if (this.startTime === null) return;
    // Not before a Start that waits for its time.
    this.send([MIDI_STOP], Math.max(now, this.startTime));
    this.startTime = null;
  }
}

/** A whole number, at least 1. 24 for a quarter note. */
export function clocksPerBeat(quarterNotesPerBeat: number) {
  const clocks = Math.round(MIDI_CLOCKS_PER_QUARTER_NOTE * quarterNotesPerBeat);
  return Number.isFinite(clocks) && clocks >= 1 ? clocks : MIDI_CLOCKS_PER_QUARTER_NOTE;
}
