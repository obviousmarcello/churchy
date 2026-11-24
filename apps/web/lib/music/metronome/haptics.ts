import type { ClickKind } from "./click";
import type { MetronomeEngine } from "./engine";

// The device vibrates on each beat of the metronome, at the time you hear the
// click. You can feel the beat when you cannot hear it, e.g. with a loud band.
// Only the beats vibrate: the motor of a phone cannot follow the clicks between them.
//
// Browsers without `navigator.vibrate` (Safari on iPhone and iPad, desktop
// browsers) cannot vibrate; the setting does not show there.

/** The length of the vibration of each kind of click, in ms. 0: no vibration. */
export const VIBRATION_MS: Record<ClickKind, number> = {
  accent: 50,
  beat: 25,
  subdivision: 0,
};

export function canVibrate() {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

/** Vibrates on each beat of `engine` until the returned function stops it. */
export function vibrateOnBeats(engine: Pick<MetronomeEngine, "onTick" | "subscribe" | "getState">) {
  const timers = new Set<ReturnType<typeof setTimeout>>();

  function clear() {
    timers.forEach(clearTimeout);
    timers.clear();
  }

  const stopTicks = engine.onTick((tick) => {
    const ms = VIBRATION_MS[tick.kind];
    if (ms === 0) return;
    const timer = setTimeout(
      () => {
        timers.delete(timer);
        navigator.vibrate(ms);
      },
      Math.max(0, tick.time - performance.now()),
    );
    timers.add(timer);
  });
  // After a stop, the beats that the worklet already reported do not vibrate.
  const stopState = engine.subscribe(() => {
    if (!engine.getState().running) clear();
  });

  return () => {
    stopTicks();
    stopState();
    clear();
  };
}
