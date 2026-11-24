import { clampBeatsPerBar, clampBpm } from "@/lib/music/metronome/beat-clock";
import { DEFAULT_BEATS_PER_BAR, DEFAULT_BPM } from "@/lib/music/metronome/song-tempo";

// The shared metronome of a live session. The leader sends these few values;
// each device calculates the clicks from them itself, so no message goes out
// for each beat. The times are in ms of the shared clock (see `clock-sync.ts`).
//
// Beat `n` is at `startTime + n * 60000 / bpm`, and beat 0 is beat 1 of a bar.
// A change gets a new `startTime` on a bar line of the old grid, a short time
// in the future: each device gets the change before it starts, and the beats
// before it stay where they are.

/** The time from a change of the leader to its first beat, in ms. The message must arrive in this time. */
export const GRID_LEAD_MS = 400;

export type BeatGrid = {
  /** Increases with each change. A device ignores a grid with a lower epoch. */
  epoch: number;
  running: boolean;
  /** The shared-clock time of beat 1 of a bar, in ms. */
  startTime: number;
  /** Beats per minute. It can have a fraction. */
  bpm: number;
  beatsPerBar: number;
};

export type GridBeat = {
  /** The beat from `startTime`, from 0. */
  index: number;
  /** The shared-clock time, in ms. */
  time: number;
  /** The beat in the bar, from 0. */
  barBeat: number;
};

export const STOPPED_GRID: BeatGrid = {
  epoch: 0,
  running: false,
  startTime: 0,
  bpm: DEFAULT_BPM,
  beatsPerBar: DEFAULT_BEATS_PER_BAR,
};

export function beatLengthMs(bpm: number) {
  return 60000 / bpm;
}

/** The newer of two grids: the one with the higher epoch. */
export function newerGrid(current: BeatGrid | null, incoming: BeatGrid): BeatGrid {
  return current && current.epoch >= incoming.epoch ? current : incoming;
}

/** The first beat at `time` or after it. Before `startTime`, this is beat 0. */
export function beatAtOrAfter(grid: BeatGrid, time: number): GridBeat {
  const length = beatLengthMs(grid.bpm);
  let index = Math.max(0, Math.ceil((time - grid.startTime) / length));
  // A rounding error of the division can put the beat one too early.
  if (grid.startTime + index * length < time) index += 1;
  return { index, time: grid.startTime + index * length, barBeat: index % grid.beatsPerBar };
}

/** The first bar line (beat 1 of a bar) at `time` or after it. */
export function nextBarLine(grid: BeatGrid, time: number): number {
  const barLength = beatLengthMs(grid.bpm) * grid.beatsPerBar;
  let bars = Math.max(0, Math.ceil((time - grid.startTime) / barLength));
  if (grid.startTime + bars * barLength < time) bars += 1;
  return grid.startTime + bars * barLength;
}

/** Starts on beat 1 of a bar, `lead` ms after `now`. */
export function startGrid(grid: BeatGrid, now: number, lead = GRID_LEAD_MS): BeatGrid {
  if (grid.running) return grid;
  return { ...grid, epoch: grid.epoch + 1, running: true, startTime: now + lead };
}

/** Stops at once. */
export function stopGrid(grid: BeatGrid): BeatGrid {
  if (!grid.running) return grid;
  return { ...grid, epoch: grid.epoch + 1, running: false };
}

/**
 * A new tempo or new beats per bar. While the grid plays, the change starts
 * on the first bar line at least `lead` ms after `now`. The same object when
 * nothing changes.
 */
export function changeGrid(
  grid: BeatGrid,
  change: { bpm: number; beatsPerBar: number },
  now: number,
  lead = GRID_LEAD_MS,
): BeatGrid {
  // A zero or NaN value would put NaN or Infinity into the times of all devices.
  const bpm = Number.isFinite(change.bpm) ? clampBpm(change.bpm) : grid.bpm;
  const beatsPerBar = clampBeatsPerBar(change.beatsPerBar);
  if (bpm === grid.bpm && beatsPerBar === grid.beatsPerBar) return grid;
  const startTime = grid.running ? nextBarLine(grid, now + lead) : grid.startTime;
  return { ...grid, epoch: grid.epoch + 1, bpm, beatsPerBar, startTime };
}
