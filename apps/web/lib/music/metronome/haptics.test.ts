import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { HeardTick, MetronomeState } from "./engine";
import { vibrateOnBeats } from "./haptics";

function fakeEngine() {
  let state: MetronomeState = { running: true, error: null };
  const listeners = new Set<() => void>();
  const tickListeners = new Set<(tick: HeardTick) => void>();
  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    onTick(listener: (tick: HeardTick) => void) {
      tickListeners.add(listener);
      return () => void tickListeners.delete(listener);
    },
    /** A click that you hear `inMs` from now. */
    tick(kind: HeardTick["kind"], inMs: number) {
      const tick: HeardTick = {
        frame: 0,
        beat: kind === "accent" ? 0 : 1,
        sub: kind === "subdivision" ? 1 : 0,
        beatsPerBar: 4,
        bpm: 120,
        kind,
        time: performance.now() + inMs,
      };
      tickListeners.forEach((listener) => listener(tick));
    },
    stop() {
      state = { running: false, error: null };
      listeners.forEach((listener) => listener());
    },
  };
}

describe("vibrateOnBeats", () => {
  const vibrate = vi.fn(() => true);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("navigator", { vibrate });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vibrate.mockClear();
  });

  it("vibrates at the time you hear the beat, longer on an accent", () => {
    const engine = fakeEngine();
    vibrateOnBeats(engine);
    engine.tick("accent", 100);
    engine.tick("beat", 600);
    vi.advanceTimersByTime(99);
    expect(vibrate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(vibrate).toHaveBeenLastCalledWith(50);
    vi.advanceTimersByTime(500);
    expect(vibrate).toHaveBeenLastCalledWith(25);
    expect(vibrate).toHaveBeenCalledTimes(2);
  });

  it("does not vibrate on the clicks between the beats", () => {
    const engine = fakeEngine();
    vibrateOnBeats(engine);
    engine.tick("subdivision", 100);
    vi.advanceTimersByTime(1000);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("does not vibrate on the reported beats after a stop", () => {
    const engine = fakeEngine();
    vibrateOnBeats(engine);
    engine.tick("beat", 100);
    engine.stop();
    vi.advanceTimersByTime(1000);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("stops when you call the returned function", () => {
    const engine = fakeEngine();
    const stop = vibrateOnBeats(engine);
    engine.tick("beat", 100);
    stop();
    engine.tick("beat", 100);
    vi.advanceTimersByTime(1000);
    expect(vibrate).not.toHaveBeenCalled();
  });
});
