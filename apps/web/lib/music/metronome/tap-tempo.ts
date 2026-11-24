import { clampBpm } from "./beat-clock";

/** After a pause this long, a tap starts a new tempo. In milliseconds. */
export const TAP_RESET_MS = 2000;
/** The tempo comes from the most recent taps only, so it can change. */
export const TAP_MAX_TAPS = 8;

/**
 * The tempo of taps on a button. It uses the median of the intervals, so one
 * tap that is too early or too late does not change it much.
 */
export class TapTempo {
  private taps: number[] = [];

  /** `time` in milliseconds, for example `event.timeStamp`. Null after the first tap. */
  tap(time: number): number | null {
    const last = this.taps[this.taps.length - 1];
    if (last === undefined || time - last > TAP_RESET_MS || time <= last) this.taps = [];
    this.taps.push(time);
    if (this.taps.length > TAP_MAX_TAPS) this.taps.shift();
    if (this.taps.length < 2) return null;

    const intervals = this.taps.slice(1).map((tap, index) => tap - this.taps[index]!);
    intervals.sort((a, b) => a - b);
    const middle = Math.floor(intervals.length / 2);
    const median =
      intervals.length % 2 ? intervals[middle] : (intervals[middle - 1]! + intervals[middle]!) / 2;
    return Math.round(clampBpm(60000 / median!));
  }

  reset() {
    this.taps = [];
  }
}
