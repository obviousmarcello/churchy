import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STOPPED_GRID, startGrid, stopGrid } from "../live/beat-grid";
import type { MetronomeCommand } from "./protocol";
import { MetronomeEngine, type SharedClock } from "./engine";

const CONFIG = { bpm: 120, beatsPerBar: 4, subdivision: 1, accent: true };
const CLOCK: SharedClock = { toLocal: (time) => time };

/** The commands that the page sends to the worklet. */
let sent: MetronomeCommand[] = [];

class FakeAudioContext {
  sampleRate = 48000;
  currentTime = 0;
  baseLatency = 0;
  outputLatency = 0;
  destination = {};
  audioWorklet = { addModule: async () => {} };
  resume = async () => {};
  suspend = async () => {};
  close = async () => {};
}

class FakeAudioWorkletNode {
  port = { onmessage: null, postMessage: (command: MetronomeCommand) => void sent.push(command) };
  connect() {}
}

beforeEach(() => {
  sent = [];
  vi.useFakeTimers();
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal("AudioWorkletNode", FakeAudioWorkletNode);
  vi.stubGlobal("navigator", {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("MetronomeEngine with a shared grid", () => {
  // The leader's click calls `follow`, and then the effect calls it again with the same grid.
  it("stops when the same grid came twice before the audio opened", async () => {
    const engine = new MetronomeEngine(CONFIG);
    const running = startGrid({ ...STOPPED_GRID, epoch: 1 }, 0);
    engine.follow(running, CLOCK);
    engine.follow(running, CLOCK);
    await vi.advanceTimersByTimeAsync(0);

    engine.follow(stopGrid(running), CLOCK);
    await vi.advanceTimersByTimeAsync(0);
    sent = [];
    await vi.advanceTimersByTimeAsync(5000);

    expect(engine.getState().running).toBe(false);
    expect(sent.filter((command) => command.type === "grid")).toEqual([]);
  });

  it("sends a running grid again while it plays", async () => {
    const engine = new MetronomeEngine(CONFIG);
    engine.follow(startGrid({ ...STOPPED_GRID, epoch: 1 }, 0), CLOCK);
    await vi.advanceTimersByTimeAsync(0);
    sent = [];
    await vi.advanceTimersByTimeAsync(3000);

    expect(sent.filter((command) => command.type === "grid")).toHaveLength(3);
  });

  it("sends no grid after leave", async () => {
    const engine = new MetronomeEngine(CONFIG);
    const running = startGrid({ ...STOPPED_GRID, epoch: 1 }, 0);
    engine.follow(running, CLOCK);
    engine.follow(running, CLOCK);
    await vi.advanceTimersByTimeAsync(0);

    engine.leave();
    await vi.advanceTimersByTimeAsync(0);
    sent = [];
    await vi.advanceTimersByTimeAsync(5000);

    expect(sent.filter((command) => command.type === "grid")).toEqual([]);
  });
});
