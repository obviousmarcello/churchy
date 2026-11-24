import type { MetronomeConfig, Tick } from "./beat-clock";
import type { GridSchedule } from "./grid-clock";

// The messages between the page and the audio worklet (`processor.ts`).

export const METRONOME_PROCESSOR_NAME = "metronome";
/** `scripts/build-worklet.mjs` builds `processor.ts` to this file in `public`. */
export const METRONOME_PROCESSOR_URL = "/metronome-processor.js";

export type MetronomeProcessorOptions = {
  config: MetronomeConfig;
  /** 0 to 1. */
  gain: number;
  /** Starts at the first frame. */
  running?: boolean;
};

/** From the page to the worklet. */
export type MetronomeCommand =
  | { type: "config"; config: MetronomeConfig }
  | { type: "gain"; gain: number }
  /** Starts at the first frame of the next block. */
  | { type: "start" }
  /** Stops the own tempo and the shared grid. */
  | { type: "stop" }
  /** Follows the shared grid of a live session, instead of the own tempo (see `grid-clock.ts`). */
  | { type: "grid"; schedule: GridSchedule };

/** From the worklet to the page: a click starts. */
export type MetronomeEvent = { type: "tick"; tick: Tick };
