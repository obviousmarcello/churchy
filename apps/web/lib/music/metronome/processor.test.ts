import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { MetronomeCommand, MetronomeEvent, MetronomeProcessorOptions } from "./protocol";

// Runs the worklet in Node with a copy of the globals of `AudioWorkletGlobalScope`.

type Processor = {
  port: FakePort;
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
};

class FakePort {
  sent: MetronomeEvent[] = [];
  onmessage: ((event: { data: MetronomeCommand }) => void) | null = null;
  postMessage(message: MetronomeEvent) {
    this.sent.push(message);
  }
  /** A message from the page. */
  receive(command: MetronomeCommand) {
    this.onmessage?.({ data: command });
  }
}

const registered = new Map<string, new (options: AudioWorkletNodeOptions) => Processor>();
const scope = globalThis as Record<string, unknown>;

beforeAll(async () => {
  scope.sampleRate = 48000;
  scope.currentFrame = 0;
  scope.AudioWorkletProcessor = class {
    port = new FakePort();
  };
  scope.registerProcessor = (
    name: string,
    processor: new (options: AudioWorkletNodeOptions) => Processor,
  ) => registered.set(name, processor);
  await import("./processor");
});

afterAll(() => {
  for (const name of ["sampleRate", "currentFrame", "AudioWorkletProcessor", "registerProcessor"])
    delete scope[name];
});

function create(options: Partial<MetronomeProcessorOptions> = {}) {
  const Processor = registered.get("metronome")!;
  const processorOptions: MetronomeProcessorOptions = {
    config: { bpm: 120, beatsPerBar: 4, subdivision: 1, accent: true },
    gain: 1,
    ...options,
  };
  return new Processor({ processorOptions });
}

/** Calls `process` like the browser: blocks of 128 frames, with `currentFrame` at the block. */
function play(processor: Processor, from: number, blocks: number, channels = 1) {
  const outputs = Array.from({ length: channels }, () => new Float32Array(128 * blocks));
  for (let block = 0; block < blocks; block++) {
    scope.currentFrame = from + block * 128;
    const output = outputs.map((channel) => channel.subarray(block * 128, (block + 1) * 128));
    expect(processor.process([], [output])).toBe(true);
  }
  return outputs;
}

describe("MetronomeProcessor", () => {
  it("registers as 'metronome'", () => {
    expect(registered.has("metronome")).toBe(true);
  });

  it("is silent until it gets a start command", () => {
    const processor = create();
    const [output] = play(processor, 0, 100);
    expect(output!.every((value) => value === 0)).toBe(true);
    expect(processor.port.sent).toEqual([]);
  });

  it("starts at the first frame of the next block, and reports each click", () => {
    const processor = create();
    play(processor, 0, 10);
    processor.port.receive({ type: "start" });
    play(processor, 1280, 400); // 51200 frames: beats at 1280, 25280 and 49280.
    expect(processor.port.sent.map(({ tick }) => [tick.frame, tick.beat, tick.kind])).toEqual([
      [1280, 0, "accent"],
      [25280, 1, "beat"],
      [49280, 2, "beat"],
    ]);
  });

  it("can start at the first frame", () => {
    const processor = create({ running: true });
    play(processor, 0, 200);
    expect(processor.port.sent[0]!.tick.frame).toBe(0);
  });

  it("uses a new config at the next beat, and stops on a stop command", () => {
    const processor = create({ running: true });
    play(processor, 0, 100); // To frame 12800; the next beat is at 24000.
    processor.port.receive({
      type: "config",
      config: { bpm: 60, beatsPerBar: 4, subdivision: 1, accent: true },
    });
    play(processor, 12800, 700); // To frame 102400.
    expect(processor.port.sent.map(({ tick }) => tick.frame)).toEqual([0, 24000, 72000]);
    processor.port.receive({ type: "stop" });
    play(processor, 102400, 1000);
    expect(processor.port.sent).toHaveLength(3);
  });

  it("plays the same sound on all channels", () => {
    const processor = create({ running: true });
    const [left, right] = play(processor, 0, 20, 2);
    expect(right).toEqual(left);
    expect(left!.some((value) => value !== 0)).toBe(true);
  });

  it("follows a gain command", () => {
    const processor = create({ running: true, gain: 0 });
    const [silent] = play(processor, 0, 20);
    expect(silent!.every((value) => value === 0)).toBe(true);
    processor.port.receive({ type: "gain", gain: 1 });
    const [loud] = play(processor, 2560, 400);
    expect(loud!.some((value) => Math.abs(value) > 0.1)).toBe(true);
  });

  it("follows a shared grid instead of its own tempo, with its own subdivision", () => {
    const processor = create({ running: true });
    play(processor, 0, 10);
    processor.port.receive({
      type: "config",
      config: { bpm: 120, beatsPerBar: 4, subdivision: 2, accent: true },
    });
    processor.port.receive({
      type: "grid",
      schedule: { id: 1, anchorFrame: 30000, bpm: 60, beatsPerBar: 3 },
    });
    processor.port.sent = [];
    play(processor, 1280, 1000); // To frame 129280.
    expect(
      processor.port.sent.map(({ tick }) => [tick.frame, tick.beat, tick.sub, tick.beatsPerBar]),
    ).toEqual([
      [30000, 0, 0, 3],
      [54000, 0, 1, 3],
      [78000, 1, 0, 3],
      [102000, 1, 1, 3],
      [126000, 2, 0, 3],
    ]);
  });

  it("stops the grid on a stop command, and leaves it on a start command", () => {
    const processor = create();
    processor.port.receive({
      type: "grid",
      schedule: { id: 1, anchorFrame: 0, bpm: 120, beatsPerBar: 4 },
    });
    play(processor, 0, 10);
    processor.port.receive({ type: "stop" });
    play(processor, 1280, 400);
    expect(processor.port.sent.map(({ tick }) => tick.frame)).toEqual([0]);

    processor.port.receive({
      type: "grid",
      schedule: { id: 2, anchorFrame: 60000, bpm: 120, beatsPerBar: 4 },
    });
    processor.port.receive({ type: "start" });
    play(processor, 52480, 100); // The own tempo starts at 52480. The grid does not play at 60000.
    expect(processor.port.sent.map(({ tick }) => tick.frame)).toEqual([0, 52480]);
  });
});
