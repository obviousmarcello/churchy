import type { ClickKind } from "./click";

// The timing of the metronome, in samples ("frames") of the audio output.
//
// A beat is at `anchor + index * framesPerBeat`: the clock calculates each
// beat from the anchor, it does not add up intervals, so rounding errors do
// not grow. The frames are not rounded either: a beat can fall between two
// samples, and the click sound starts there exactly (see `click.ts`).
//
// A change of the settings starts at the next beat, which becomes the new
// anchor. The count of the bar continues: after beat 2 comes beat 3, also
// with a new tempo.

export const METRONOME_MIN_BPM = 20;
export const METRONOME_MAX_BPM = 400;
export const METRONOME_MAX_BEATS_PER_BAR = 16;
export const METRONOME_MAX_SUBDIVISION = 4;

export type MetronomeConfig = {
  /** Beats per minute. It can have a fraction. */
  bpm: number;
  beatsPerBar: number;
  /** Clicks per beat: 1 for beats only, 2 for eighths, 3 for triplets, 4 for sixteenths. */
  subdivision: number;
  /** The first beat of the bar has a higher, louder click. */
  accent: boolean;
};

export type Tick = {
  /** The exact frame of the start of the click. It can have a fraction. */
  frame: number;
  /** The beat in the bar, from 0. */
  beat: number;
  /** The click in the beat, from 0. 0 is the beat itself. */
  sub: number;
  beatsPerBar: number;
  /** The tempo of the beat of this click. */
  bpm: number;
  kind: ClickKind;
};

export function clampBpm(bpm: number) {
  return Math.min(Math.max(bpm, METRONOME_MIN_BPM), METRONOME_MAX_BPM);
}

/** A whole number from 1 to `max`. NaN gives 1. */
function clampWhole(value: number, max: number) {
  return Math.min(Math.max(Math.round(value) || 1, 1), max);
}

export function clampBeatsPerBar(beatsPerBar: number) {
  return clampWhole(beatsPerBar, METRONOME_MAX_BEATS_PER_BAR);
}

/** Makes a config safe to use: no zero, negative or huge values. */
export function normalizeConfig(config: MetronomeConfig): MetronomeConfig {
  return {
    bpm: clampBpm(Number.isFinite(config.bpm) ? config.bpm : METRONOME_MIN_BPM),
    beatsPerBar: clampBeatsPerBar(config.beatsPerBar),
    subdivision: clampWhole(config.subdivision, METRONOME_MAX_SUBDIVISION),
    accent: Boolean(config.accent),
  };
}

export class BeatClock {
  private config: MetronomeConfig;
  private pending: MetronomeConfig | null = null;
  private framesPerBeat: number;
  private isRunning = false;
  /** The frame of beat 0 of the current tempo. */
  private anchor = 0;
  /** The next click: beat `beatIndex` after the anchor, click `sub` in that beat. */
  private beatIndex = 0;
  private sub = 0;
  /** The beat in the bar of the last beat. -1 before the first beat. */
  private lastBarBeat = -1;

  constructor(
    readonly sampleRate: number,
    config: MetronomeConfig,
  ) {
    this.config = normalizeConfig(config);
    this.framesPerBeat = this.beatLength(this.config);
  }

  get running() {
    return this.isRunning;
  }

  /** The config of the next click. */
  get currentConfig() {
    return this.pending ?? this.config;
  }

  /** Starts at the next beat. When the clock is stopped, at once. */
  setConfig(config: MetronomeConfig) {
    const next = normalizeConfig(config);
    if (this.isRunning) {
      this.pending = next;
    } else {
      this.config = next;
      this.framesPerBeat = this.beatLength(next);
    }
  }

  /** The first beat (beat 1 of a bar) is at `frame`. */
  start(frame: number) {
    if (this.pending) this.applyPending();
    this.isRunning = true;
    this.anchor = frame;
    this.beatIndex = 0;
    this.sub = 0;
    this.lastBarBeat = -1;
  }

  stop() {
    this.isRunning = false;
    if (this.pending) this.applyPending();
  }

  /**
   * The clicks whose first sample is in the frames `start` to `end - 1`, in
   * order. The first sample of a click at frame 100.25 is frame 101. Call it
   * with blocks that follow each other: the result does not depend on the
   * size of the blocks.
   */
  ticksIn(start: number, end: number): Tick[] {
    const ticks: Tick[] = [];
    while (this.isRunning) {
      let frame = this.frameOf(this.beatIndex, this.sub);
      if (Math.ceil(frame) >= end) break;
      if (this.sub === 0 && this.pending) {
        // The beat stays where the old tempo puts it. The new tempo starts there.
        this.anchor = frame;
        this.beatIndex = 0;
        this.applyPending();
        frame = this.anchor;
      }
      const { bpm, beatsPerBar, subdivision, accent } = this.config;
      if (this.sub === 0) this.lastBarBeat = (this.lastBarBeat + 1) % beatsPerBar;
      const beat = this.lastBarBeat;
      const kind: ClickKind =
        this.sub > 0 ? "subdivision" : beat === 0 && accent ? "accent" : "beat";
      if (Math.ceil(frame) >= start)
        ticks.push({ frame, beat, sub: this.sub, beatsPerBar, bpm, kind });
      this.sub += 1;
      if (this.sub >= subdivision) {
        this.sub = 0;
        this.beatIndex += 1;
      }
    }
    return ticks;
  }

  private frameOf(beatIndex: number, sub: number) {
    return (
      this.anchor +
      beatIndex * this.framesPerBeat +
      (sub * this.framesPerBeat) / this.config.subdivision
    );
  }

  private applyPending() {
    this.config = this.pending!;
    this.pending = null;
    this.framesPerBeat = this.beatLength(this.config);
  }

  private beatLength(config: MetronomeConfig) {
    return (this.sampleRate * 60) / config.bpm;
  }
}
