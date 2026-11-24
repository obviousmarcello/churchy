import { clickSample, type ClickKind } from "../click";

// Measurements of a recorded metronome output, for the tests. Relative
// imports only: the Playwright tests use this file too.

/**
 * A simple onset detector that knows nothing about the click sound: the
 * first sample above `threshold` after at least `minGap` samples below it.
 */
export function detectOnsets(samples: Float32Array, threshold: number, minGap: number): number[] {
  const onsets: number[] = [];
  let quiet = minGap;
  for (let index = 0; index < samples.length; index++) {
    if (Math.abs(samples[index]!) >= threshold) {
      if (quiet >= minGap) onsets.push(index);
      quiet = 0;
    } else {
      quiet++;
    }
  }
  return onsets;
}

/**
 * The exact start of a click near the frame `guess`, with a fraction: the
 * shift of the click sound that fits the samples best (a matched filter). It
 * fits the volume too, so the volume has no effect on the result.
 */
export function measureOnset(
  samples: Float32Array,
  sampleRate: number,
  kind: ClickKind,
  guess: number,
  { radius = 2, windowSeconds = 0.01 } = {},
): number {
  const first = Math.max(0, Math.floor(guess - radius));
  const last = Math.min(samples.length, Math.ceil(guess + radius + windowSeconds * sampleRate));

  // The part of the signal that a click at `onset` explains (the least-squares fit).
  function fit(onset: number) {
    let dot = 0;
    let energy = 0;
    for (let frame = first; frame < last; frame++) {
      const value = clickSample(kind, (frame - onset) / sampleRate);
      dot += samples[frame]! * value;
      energy += value * value;
    }
    return energy > 0 ? (dot * dot) / energy : 0;
  }

  // Golden-section search for the best fit. Within a few samples of the true
  // onset (much less than half a period of the tone) the fit has one maximum.
  const ratio = (Math.sqrt(5) - 1) / 2;
  let low = guess - radius;
  let high = guess + radius;
  let a = high - ratio * (high - low);
  let b = low + ratio * (high - low);
  let fitA = fit(a);
  let fitB = fit(b);
  while (high - low > 1e-6) {
    if (fitA > fitB) {
      high = b;
      b = a;
      fitB = fitA;
      a = high - ratio * (high - low);
      fitA = fit(a);
    } else {
      low = a;
      a = b;
      fitA = fitB;
      b = low + ratio * (high - low);
      fitB = fit(b);
    }
  }
  return (low + high) / 2;
}

export function peak(samples: Float32Array, start = 0, end = samples.length) {
  let max = 0;
  for (let index = Math.max(0, start); index < Math.min(end, samples.length); index++) {
    max = Math.max(max, Math.abs(samples[index]!));
  }
  return max;
}
