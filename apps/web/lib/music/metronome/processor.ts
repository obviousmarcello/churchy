// The audio worklet of the metronome. It runs on the audio thread, not on the
// page, so a busy page or a hidden tab does not delay a click.
// `scripts/build-worklet.mjs` bundles it to `public/metronome-processor.js`.

import { MetronomeCore } from "./metronome-core";
import {
  METRONOME_PROCESSOR_NAME,
  type MetronomeCommand,
  type MetronomeEvent,
  type MetronomeProcessorOptions,
} from "./protocol";

// The globals of `AudioWorkletGlobalScope`. TypeScript has no types for them.
declare const sampleRate: number;
declare const currentFrame: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: AudioWorkletNodeOptions);
}
declare function registerProcessor(
  name: string,
  processor: new (options: AudioWorkletNodeOptions) => AudioWorkletProcessor,
): void;

export class MetronomeProcessor extends AudioWorkletProcessor {
  private readonly core: MetronomeCore;
  private startPending: boolean;

  constructor(options: AudioWorkletNodeOptions) {
    super(options);
    const { config, gain, running } = options.processorOptions as MetronomeProcessorOptions;
    this.core = new MetronomeCore(sampleRate, config, gain);
    this.startPending = Boolean(running);
    this.port.onmessage = (event: MessageEvent<MetronomeCommand>) => this.receive(event.data);
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]) {
    const channels = outputs[0];
    if (!channels?.[0]) return true;
    if (this.startPending) {
      this.startPending = false;
      this.core.clock.start(currentFrame);
    }
    const ticks = this.core.render(currentFrame, channels[0]);
    for (let index = 1; index < channels.length; index++) channels[index]!.set(channels[0]);
    for (const tick of ticks)
      this.port.postMessage({ type: "tick", tick } satisfies MetronomeEvent);
    // Stays alive while the node exists, also when it is silent.
    return true;
  }

  private receive(command: MetronomeCommand) {
    switch (command.type) {
      case "config":
        this.core.clock.setConfig(command.config);
        this.core.grid.setConfig(command.config);
        break;
      case "gain":
        this.core.setGain(command.gain);
        break;
      case "start":
        this.core.grid.stop();
        if (!this.core.clock.running) this.startPending = true;
        break;
      case "stop":
        this.startPending = false;
        this.core.clock.stop();
        this.core.grid.stop();
        break;
      case "grid":
        this.startPending = false;
        this.core.clock.stop();
        this.core.grid.follow(command.schedule);
        break;
    }
  }
}

registerProcessor(METRONOME_PROCESSOR_NAME, MetronomeProcessor);
