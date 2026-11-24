"use client";

import type { BeatGrid } from "../live/beat-grid";
import { contextTimeAt } from "./audio-clock";
import type { MetronomeConfig, Tick } from "./beat-clock";
import {
  METRONOME_PROCESSOR_NAME,
  METRONOME_PROCESSOR_URL,
  type MetronomeCommand,
  type MetronomeEvent,
  type MetronomeProcessorOptions,
} from "./protocol";

/** A click, with the time you hear it, on the clock of `performance.now()`. */
export type HeardTick = Tick & { time: number };

export type MetronomeState = {
  running: boolean;
  /**
   * `unsupported`: the browser cannot play the metronome. `loadFailed`: the
   * worklet did not load. The UI shows the text in `m.sheet.metronome.errors`.
   */
  error: "unsupported" | "loadFailed" | null;
};

/** After a stop, the audio pauses when the last click ends. It saves battery. In ms. */
const SUSPEND_DELAY_MS = 300;
/**
 * While the engine follows a shared grid, it sends the grid to the worklet
 * again in this interval. The audio clock drifts from `performance.now()`,
 * and the estimate of the shared clock changes. In ms.
 */
const RETIME_MS = 1000;

/** Changes a time of the shared clock of a live session into a `performance.now()` time (see `ServerClock`). */
export type SharedClock = { toLocal(sharedTime: number): number };

/** The `audioSession` of Safari. With "playback", the silent switch of an iPhone does not mute the clicks. */
type NavigatorWithAudioSession = Navigator & { audioSession?: { type: string } };

export function canPlayMetronome() {
  return typeof AudioContext !== "undefined" && typeof AudioWorkletNode !== "undefined";
}

/**
 * Plays the metronome in the browser. The audio worklet makes the clicks and
 * their timing; this class only starts, stops and sets it. Call `start` from
 * a click or a key press: browsers only start audio after the user does something.
 */
export class MetronomeEngine {
  private context: AudioContext | null = null;
  private node: Promise<AudioWorkletNode> | null = null;
  private suspendTimer: ReturnType<typeof setTimeout> | undefined;
  private shared: { grid: BeatGrid; clock: SharedClock } | null = null;
  private retimeTimer: ReturnType<typeof setInterval> | undefined;
  private latencyMs = 0;
  private state: MetronomeState = { running: false, error: null };
  private readonly listeners = new Set<() => void>();
  private readonly tickListeners = new Set<(tick: HeardTick) => void>();

  constructor(
    private config: MetronomeConfig,
    private gain = 1,
  ) {}

  getState = () => this.state;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Each click, when it starts. The `time` is in the future, by the latency of the audio output. */
  onTick(listener: (tick: HeardTick) => void) {
    this.tickListeners.add(listener);
    return () => {
      this.tickListeners.delete(listener);
    };
  }

  /** Plays the own tempo. Does nothing while the engine follows a shared grid (see `follow`). */
  async start() {
    if (this.state.running || this.shared) return;
    if (!canPlayMetronome()) {
      this.setState({ running: false, error: "unsupported" });
      return;
    }
    clearTimeout(this.suspendTimer);
    this.setState({ running: true, error: null });
    const node = await this.openAudio();
    if (node && this.state.running && !this.shared) this.send(node, { type: "start" });
  }

  /** Stops the own tempo. Does nothing while the engine follows a shared grid (see `leave`). */
  stop() {
    if (!this.state.running || this.shared) return;
    this.setState({ running: false, error: null });
    void this.node?.then((node) => this.send(node, { type: "stop" }));
    this.suspendLater();
  }

  /**
   * Plays the shared beat grid of a live session (see `src/lib/live/beat-grid.ts`)
   * instead of the own tempo. Call it again with each new grid; an older grid
   * does nothing. The subdivision, the accent and the volume stay the user's own.
   *
   * Call it the first time from a click or a key press, like `start`. Until
   * `leave`, the audio does not pause after a stop: the leader can start the
   * metronome again without a tap on this device.
   */
  follow(grid: BeatGrid, clock: SharedClock) {
    if (this.shared && grid.epoch < this.shared.grid.epoch) return;
    this.shared = { grid, clock };
    clearInterval(this.retimeTimer);
    clearTimeout(this.suspendTimer);
    this.setState({ running: grid.running && canPlayMetronome(), error: null });
    const opened = this.openAudio();
    if (!grid.running) {
      void opened.then((node) => node && this.send(node, { type: "stop" }));
      return;
    }
    void opened.then((node) => {
      if (!node || this.shared?.grid !== grid) return;
      this.sendGrid(node);
      // The same grid can come twice before the audio opens: one timer only.
      clearInterval(this.retimeTimer);
      this.retimeTimer = setInterval(() => this.sendGrid(node), RETIME_MS);
    });
  }

  /** Stops the shared grid. After it, `start` plays the own tempo again. */
  leave() {
    if (!this.shared) return;
    this.shared = null;
    clearInterval(this.retimeTimer);
    this.setState({ running: false, error: null });
    void this.node?.then((node) => this.send(node, { type: "stop" }));
    this.suspendLater();
  }

  /**
   * The latency of the audio output that the browser does not report, e.g. of
   * Bluetooth speakers. In ms. The shared grid plays earlier by this time, so
   * the clicks come out of the speakers at the same time as on other devices.
   */
  setLatency(ms: number) {
    this.latencyMs = Number.isFinite(ms) ? ms : 0;
    if (this.shared?.grid.running) void this.node?.then((node) => this.sendGrid(node));
  }

  toggle() {
    if (this.state.running) this.stop();
    else void this.start();
  }

  /** Starts at the next beat. */
  setConfig(config: MetronomeConfig) {
    this.config = config;
    void this.node?.then((node) => this.send(node, { type: "config", config }));
  }

  /** 0 to 1. */
  setGain(gain: number) {
    this.gain = gain;
    void this.node?.then((node) => this.send(node, { type: "gain", gain }));
  }

  /** Stops and releases the audio. A later `start` makes it again. */
  dispose() {
    clearTimeout(this.suspendTimer);
    clearInterval(this.retimeTimer);
    this.shared = null;
    this.setState({ running: false, error: null });
    void this.context?.close().catch(() => {});
    this.context = null;
    this.node = null;
  }

  /**
   * Makes the audio and resumes it. Null when it cannot play. The first time,
   * call it during a click or a key press: until then, the browser keeps the
   * audio paused, and the promise does not end.
   */
  private async openAudio(): Promise<AudioWorkletNode | null> {
    if (!canPlayMetronome()) {
      this.setState({ running: false, error: "unsupported" });
      return null;
    }
    const audioSession = (navigator as NavigatorWithAudioSession).audioSession;
    if (audioSession) audioSession.type = "playback";
    this.context ??= new AudioContext({ latencyHint: "interactive" });
    // Before the first `await`: Safari only resumes during the click or key press.
    const resumed = this.context.resume();
    try {
      const node = await (this.node ??= this.createNode(this.context));
      await resumed;
      return node;
    } catch {
      this.node = null;
      this.setState({ running: false, error: "loadFailed" });
      return null;
    }
  }

  private suspendLater() {
    clearTimeout(this.suspendTimer);
    this.suspendTimer = setTimeout(() => {
      if (!this.state.running && !this.shared) void this.context?.suspend();
    }, SUSPEND_DELAY_MS);
  }

  /** Sends the shared grid in frames of this device. */
  private sendGrid(node: AudioWorkletNode) {
    const context = this.context;
    // The worklet plays each grid that it gets: a stopped grid must not go to it.
    if (!context || !this.shared?.grid.running) return;
    const { grid, clock } = this.shared;
    const anchorFrame = this.frameHeardAt(context, clock.toLocal(grid.startTime) - this.latencyMs);
    this.send(node, {
      type: "grid",
      schedule: { id: grid.epoch, anchorFrame, bpm: grid.bpm, beatsPerBar: grid.beatsPerBar },
    });
  }

  private async createNode(context: AudioContext) {
    await context.audioWorklet.addModule(METRONOME_PROCESSOR_URL);
    const processorOptions: MetronomeProcessorOptions = { config: this.config, gain: this.gain };
    const node = new AudioWorkletNode(context, METRONOME_PROCESSOR_NAME, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions,
    });
    node.port.onmessage = (event: MessageEvent<MetronomeEvent>) => {
      const { tick } = event.data;
      const heard = { ...tick, time: this.heardAt(context, tick.frame) };
      this.tickListeners.forEach((listener) => listener(heard));
    };
    node.connect(context.destination);
    return node;
  }

  /** The `performance.now()` time when the sample `frame` comes out of the speakers. */
  private heardAt(context: AudioContext, frame: number) {
    const contextTime = frame / context.sampleRate;
    const stamp = context.getOutputTimestamp?.();
    if (stamp?.contextTime !== undefined && stamp.performanceTime) {
      return stamp.performanceTime + (contextTime - stamp.contextTime) * 1000;
    }
    const latency = context.baseLatency + (context.outputLatency || 0);
    return performance.now() + (contextTime - context.currentTime + latency) * 1000;
  }

  /** The sample that comes out of the speakers at the `performance.now()` time `time`. The opposite of `heardAt`. */
  private frameHeardAt(context: AudioContext, time: number) {
    return contextTimeAt(context, time) * context.sampleRate;
  }

  private send(node: AudioWorkletNode, command: MetronomeCommand) {
    node.port.postMessage(command);
  }

  private setState(state: MetronomeState) {
    if (state.running === this.state.running && state.error === this.state.error) return;
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
}
