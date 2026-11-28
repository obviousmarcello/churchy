import { BeatClock, type MetronomeConfig, type Tick } from "./beat-clock";
import { CLICK_LENGTH_S, clickSample, type ClickKind } from "./click";
import { GridClock } from "./grid-clock";

/** A volume change takes about this long, so it does not crackle. In seconds. */
const VOLUME_TIME_S = 0.005;

/**
 * The sound of the metronome, one block of samples at a time. The audio
 * worklet (`processor.ts`) uses it; it has no browser API, so the tests can
 * run it too.
 */
export class MetronomeCore {
  readonly clock: BeatClock;
  /** The shared grid of a live session. Only one of the two clocks runs. */
  readonly grid: GridClock;
  private voices: { onset: number; kind: ClickKind }[] = [];
  private gain: number;
  private targetGain: number;
  private readonly gainStep: number;
  private readonly clickFrames: number;

  constructor(
    readonly sampleRate: number,
    config: MetronomeConfig,
    gain = 1,
  ) {
    this.clock = new BeatClock(sampleRate, config);
    this.grid = new GridClock(sampleRate, config);
    this.gain = this.targetGain = gain;
    this.gainStep = 1 - Math.exp(-1 / (VOLUME_TIME_S * sampleRate));
    this.clickFrames = CLICK_LENGTH_S * sampleRate;
  }

  /** 0 to 1. */
  setGain(gain: number) {
    this.targetGain = Math.min(Math.max(gain, 0), 1);
  }

  /**
   * Writes the block that starts at frame `startFrame` into `output`, silence
   * included. Returns the clicks that start in the block. A click that plays
   * when the clock stops plays to its end.
   */
  render(startFrame: number, output: Float32Array): Tick[] {
    const end = startFrame + output.length;
    const ticks = [...this.clock.ticksIn(startFrame, end), ...this.grid.ticksIn(startFrame, end)];
    for (const tick of ticks) this.voices.push({ onset: tick.frame, kind: tick.kind });

    for (let index = 0; index < output.length; index++) {
      const frame = startFrame + index;
      let sum = 0;
      for (const voice of this.voices) {
        const offset = frame - voice.onset;
        if (offset > 0 && offset < this.clickFrames)
          sum += clickSample(voice.kind, offset / this.sampleRate);
      }
      this.gain += (this.targetGain - this.gain) * this.gainStep;
      output[index] = sum * this.gain;
    }

    this.voices = this.voices.filter((voice) => end - voice.onset < this.clickFrames);
    return ticks;
  }
}
