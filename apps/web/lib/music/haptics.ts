// A short vibration as feedback for a tap or a result, like a native app.
// Android browsers vibrate. Safari on iPhone and iPad and the desktop browsers
// cannot: the call then does nothing. For the beats of the metronome, see
// `./metronome/haptics.ts`.

export const HAPTIC_MS = {
  /** A result that went well, e.g. a saved form. */
  success: 10,
  /** A result that failed: two short pulses. */
  error: [20, 60, 20],
} as const;

/** Vibrates when the device can. The browser ignores it before the first tap on the page. */
export function haptic(pattern: number | readonly number[] = HAPTIC_MS.success): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(typeof pattern === "number" ? pattern : [...pattern]);
  } catch {
    // Some browsers throw when the page has no permission to vibrate.
  }
}
