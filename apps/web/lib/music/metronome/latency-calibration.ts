// The measurement of the output latency that the browser does not report,
// e.g. of Bluetooth speakers. The user taps with the clicks they hear. The
// engine knows when each click should come out of the speakers (`HeardTick.time`);
// the taps come later by the delay that the browser does not know.
//
// The difference is known only up to a whole beat: a tap can belong to
// any click. The measurement takes the last click before the tap (and up to
// `EARLY_TAP_MS` after it, because people often tap a little early). So it can
// measure a delay up to one beat minus `EARLY_TAP_MS`: use a slow tempo.

/** The taps that a measurement needs. */
export const CALIBRATION_TAPS = 8;
/** A tap can come this much before its click. In ms. */
export const EARLY_TAP_MS = 50;
/** With a larger spread of the taps, the result is not reliable. In ms. */
export const MAX_SPREAD_MS = 40;
/** The largest setting. In ms. */
export const MAX_LATENCY_MS = 500;

export type LatencyEstimate = {
  /** The delay to set, in whole ms, from 0 to `MAX_LATENCY_MS`. */
  latencyMs: number;
  /** The median distance of the taps from the result, in ms. */
  spreadMs: number;
  /** The spread is small enough. */
  reliable: boolean;
};

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** The delay of each tap after its click. A tap without a click before it has no delay. */
export function tapDelays(clickTimes: number[], tapTimes: number[]): number[] {
  const clicks = [...clickTimes].sort((a, b) => a - b);
  return tapTimes.flatMap((tap) => {
    const click = clicks.findLast((time) => time <= tap + EARLY_TAP_MS);
    return click === undefined ? [] : [tap - click];
  });
}

/** Null with fewer than `CALIBRATION_TAPS` taps that have a click. */
export function estimateLatency(clickTimes: number[], tapTimes: number[]): LatencyEstimate | null {
  const delays = tapDelays(clickTimes, tapTimes).slice(-CALIBRATION_TAPS);
  if (delays.length < CALIBRATION_TAPS) return null;
  const delay = median(delays);
  const spreadMs = Math.round(median(delays.map((value) => Math.abs(value - delay!)))!);
  return {
    latencyMs: Math.round(Math.min(Math.max(delay!, 0), MAX_LATENCY_MS)),
    spreadMs,
    reliable: spreadMs <= MAX_SPREAD_MS,
  };
}
