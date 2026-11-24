import {
  clampBeatsPerBar,
  clampBpm,
  normalizeConfig,
  type MetronomeConfig,
  type Tick,
} from "./beat-clock";
import type { ClickKind } from "./click";

// The timing of a shared beat grid (see `src/lib/live/beat-grid.ts`), in
// frames of the audio output. The page changes the shared times into frames
// of this device, and sends them again and again: the clocks drift, and the
// estimate of the server clock gets better.
//
// - A schedule with the same `id` corrects the current one. A small
//   correction moves the beats slowly, by at most 0.5 ms per beat, so
//   nobody hears it. A large one moves them at once.
// - A schedule with a new `id` starts at its anchor. The beats of the old one
//   play until half a beat before it.
// - A beat never plays less than half a beat after the last one: a late
//   change or a large correction does not give a double click.
//
// The tempo and the beats per bar come from the grid. The subdivision and the
// accent are the user's own settings.

/** The largest slow correction per beat, in seconds. */
const SLEW_PER_BEAT_S = 0.0005;
/** A larger difference moves the beats at once. In seconds. */
const MAX_SLEW_S = 0.02;

export type GridSchedule = {
  /** The grid's epoch. The same id corrects the schedule; a new id replaces it. */
  id: number;
  /** The frame of beat 1 of a bar. It can be in the past, also long ago. It can have a fraction. */
  anchorFrame: number;
  bpm: number;
  beatsPerBar: number;
};

type Segment = {
  id: number;
  anchor: number;
  /** The slow corrections move `anchor` to this frame. */
  target: number;
  bpm: number;
  framesPerBeat: number;
  beatsPerBar: number;
};

export class GridClock {
  private current: Segment | null = null;
  private next: Segment | null = null;
  /** The next click: beat `beatIndex` after the anchor, click `sub` in that beat. Null: find it again. */
  private beatIndex: number | null = null;
  private sub = 0;
  /** The subdivision of the current beat. A new one starts at the next beat. */
  private beatSubdivision = 1;
  private lastBeatFrame = -Infinity;
  private subdivision: number;
  private accent: boolean;
  private readonly maxSlewFrames: number;
  private readonly slewPerBeatFrames: number;

  constructor(
    readonly sampleRate: number,
    config: MetronomeConfig,
  ) {
    ({ subdivision: this.subdivision, accent: this.accent } = normalizeConfig(config));
    this.maxSlewFrames = MAX_SLEW_S * sampleRate;
    this.slewPerBeatFrames = SLEW_PER_BEAT_S * sampleRate;
  }

  get running() {
    return this.current !== null;
  }

  /** Uses the subdivision and the accent of the config. The grid sets the tempo and the beats. */
  setConfig(config: MetronomeConfig) {
    ({ subdivision: this.subdivision, accent: this.accent } = normalizeConfig(config));
  }

  follow(schedule: GridSchedule) {
    if (!Number.isFinite(schedule.anchorFrame)) return;
    const bpm = Number.isFinite(schedule.bpm) ? clampBpm(schedule.bpm) : null;
    if (bpm === null) return;
    const segment: Segment = {
      id: schedule.id,
      anchor: schedule.anchorFrame,
      target: schedule.anchorFrame,
      bpm,
      framesPerBeat: (this.sampleRate * 60) / bpm,
      beatsPerBar: clampBeatsPerBar(schedule.beatsPerBar),
    };

    const current = this.current;
    if (!current) {
      this.current = segment;
      this.beatIndex = null;
    } else if (segment.id === current.id) {
      const sameGrid =
        segment.framesPerBeat === current.framesPerBeat &&
        segment.beatsPerBar === current.beatsPerBar;
      if (sameGrid && Math.abs(segment.anchor - current.anchor) <= this.maxSlewFrames) {
        current.target = segment.anchor;
      } else {
        this.current = segment;
        this.beatIndex = null;
      }
    } else if (segment.id > current.id && (!this.next || segment.id >= this.next.id)) {
      this.next = segment;
    }
  }

  stop() {
    this.current = null;
    this.next = null;
    this.beatIndex = null;
    this.lastBeatFrame = -Infinity;
  }

  /**
   * The clicks whose first sample is in the frames `start` to `end - 1`, in
   * order. Call it with blocks that follow each other.
   */
  ticksIn(start: number, end: number): Tick[] {
    const ticks: Tick[] = [];
    while (this.current) {
      const segment = this.current;
      if (this.beatIndex === null) this.seek(segment, start);

      const step =
        this.sub === 0 ? segment.framesPerBeat : segment.framesPerBeat / this.beatSubdivision;
      const frame = this.frameOf(segment);
      // The next grid replaces the clicks from half a click before its anchor.
      if (this.next && frame >= this.next.anchor - step / 2) {
        this.current = this.next;
        this.next = null;
        this.beatIndex = null;
        continue;
      }
      if (Math.ceil(frame) >= end) break;

      const beatIndex = this.beatIndex!;
      if (this.sub === 0) {
        if (frame - this.lastBeatFrame < segment.framesPerBeat / 2) {
          // Too close to the last beat: skip this beat and its subdivisions.
          this.nextBeat(segment);
          continue;
        }
        this.beatSubdivision = this.subdivision;
        this.lastBeatFrame = frame;
      }
      const beat = beatIndex % segment.beatsPerBar;
      const kind: ClickKind =
        this.sub > 0 ? "subdivision" : beat === 0 && this.accent ? "accent" : "beat";
      if (Math.ceil(frame) >= start) {
        ticks.push({
          frame,
          beat,
          sub: this.sub,
          beatsPerBar: segment.beatsPerBar,
          bpm: segment.bpm,
          kind,
        });
      }
      this.sub += 1;
      if (this.sub >= this.beatSubdivision) this.nextBeat(segment);
    }
    return ticks;
  }

  private frameOf(segment: Segment) {
    return (
      segment.anchor + (this.beatIndex! + this.sub / this.beatSubdivision) * segment.framesPerBeat
    );
  }

  /** The first beat (from the anchor) whose first sample is at `start` or after it. */
  private seek(segment: Segment, start: number) {
    const frameOf = (index: number) => segment.anchor + index * segment.framesPerBeat;
    let index = Math.max(0, Math.ceil((start - segment.anchor) / segment.framesPerBeat));
    while (Math.ceil(frameOf(index)) < start) index++;
    while (index > 0 && Math.ceil(frameOf(index - 1)) >= start) index--;
    this.beatIndex = index;
    this.sub = 0;
  }

  /** Goes to the next beat, with one step of the slow correction. */
  private nextBeat(segment: Segment) {
    this.beatIndex! += 1;
    this.sub = 0;
    const difference = segment.target - segment.anchor;
    segment.anchor += Math.min(
      Math.max(difference, -this.slewPerBeatFrames),
      this.slewPerBeatFrames,
    );
  }
}
