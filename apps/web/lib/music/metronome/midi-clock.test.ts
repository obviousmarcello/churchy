import { describe, expect, it } from "vitest";

import type { HeardTick } from "./engine";
import {
  ACCENT_NOTE,
  CLICK_NOTE,
  MIDI_START,
  MIDI_STOP,
  MIDI_TIMING_CLOCK,
  MidiClock,
  clocksPerBeat,
  type MidiClockOptions,
} from "./midi-clock";

const OPTIONS: MidiClockOptions = { quarterNotesPerBeat: 1, clickNotes: false };

function setup(options: Partial<MidiClockOptions> = {}) {
  const sent: { data: number[]; time: number }[] = [];
  const clock = new MidiClock((data, time) => sent.push({ data, time }), {
    ...OPTIONS,
    ...options,
  });
  return { clock, sent };
}

function tick(time: number, beat: number, extra: Partial<HeardTick> = {}): HeardTick {
  return {
    time,
    beat,
    sub: 0,
    beatsPerBar: 4,
    bpm: 120,
    kind: beat === 0 ? "accent" : "beat",
    frame: 0,
    ...extra,
  };
}

const clocksOf = <T extends { data: number[] }>(sent: T[]) =>
  sent.filter(({ data }) => data.includes(MIDI_TIMING_CLOCK));

describe("MidiClock", () => {
  it("sends 24 clocks for each quarter-note beat, evenly in the beat", () => {
    const { clock, sent } = setup();
    clock.tick(tick(1000, 0));
    const clocks = clocksOf(sent);
    expect(clocks).toHaveLength(24);
    // 120 BPM: 500 ms for each beat.
    clocks.forEach(({ time }, index) => expect(time).toBeCloseTo(1000 + (index * 500) / 24));
  });

  it("sends Start with the first clock of beat 1, in one message", () => {
    const { clock, sent } = setup();
    clock.tick(tick(1000, 0));
    clock.tick(tick(1500, 1));
    expect(sent[0]).toEqual({ data: [MIDI_START, MIDI_TIMING_CLOCK], time: 1000 });
    expect(sent.filter(({ data }) => data.includes(MIDI_START))).toHaveLength(1);
  });

  it("waits for beat 1 of a bar to send Start, and sends the clocks before it", () => {
    const { clock, sent } = setup();
    clock.tick(tick(1000, 2));
    clock.tick(tick(1500, 3));
    expect(sent.some(({ data }) => data.includes(MIDI_START))).toBe(false);
    expect(clocksOf(sent)).toHaveLength(48);
    clock.tick(tick(2000, 0));
    expect(sent[48]).toEqual({ data: [MIDI_START, MIDI_TIMING_CLOCK], time: 2000 });
  });

  it("uses the tempo of each beat", () => {
    const { clock, sent } = setup();
    clock.tick(tick(0, 0, { bpm: 60 }));
    expect(clocksOf(sent)[1]!.time).toBeCloseTo(1000 / 24);
  });

  it("sends the clocks of the beat's length in quarter notes", () => {
    const dotted = setup({ quarterNotesPerBeat: 1.5 });
    dotted.clock.tick(tick(0, 0));
    expect(clocksOf(dotted.sent)).toHaveLength(36);

    const eighth = setup({ quarterNotesPerBeat: 0.5 });
    eighth.clock.tick(tick(0, 0));
    expect(clocksOf(eighth.sent)).toHaveLength(12);
  });

  it("sends Stop once, and Start again on the next beat 1", () => {
    const { clock, sent } = setup();
    clock.tick(tick(1000, 0));
    clock.stop(1200);
    clock.stop(1300);
    expect(sent.filter(({ data }) => data[0] === MIDI_STOP)).toEqual([
      { data: [MIDI_STOP], time: 1200 },
    ]);
    clock.tick(tick(5000, 0));
    expect(sent.filter(({ data }) => data.includes(MIDI_START))).toHaveLength(2);
  });

  it("does not send Stop before a Start that waits for its time", () => {
    const { clock, sent } = setup();
    clock.tick(tick(1000, 0));
    clock.stop(900);
    expect(sent.at(-1)).toEqual({ data: [MIDI_STOP], time: 1000 });
  });

  it("sends no Stop when the device never started", () => {
    const { clock, sent } = setup();
    clock.tick(tick(1000, 1));
    clock.stop(1200);
    expect(sent.some(({ data }) => data[0] === MIDI_STOP)).toBe(false);
  });

  it("sends no clocks for the subdivisions", () => {
    const { clock, sent } = setup();
    clock.tick(tick(1000, 0, { sub: 1, kind: "subdivision" }));
    expect(sent).toEqual([]);
  });

  it("plays each click as a short note on channel 10 with clickNotes", () => {
    const { clock, sent } = setup({ clickNotes: true });
    clock.tick(tick(1000, 0));
    clock.tick(tick(1250, 0, { sub: 1, kind: "subdivision" }));
    clock.tick(tick(1500, 1));
    const notes = sent.filter(
      ({ data }) => (data[0]! & 0xf0) === 0x90 || (data[0]! & 0xf0) === 0x80,
    );
    expect(notes).toEqual([
      { data: [0x99, ACCENT_NOTE, 127], time: 1000 },
      { data: [0x89, ACCENT_NOTE, 0], time: 1030 },
      { data: [0x99, CLICK_NOTE, 60], time: 1250 },
      { data: [0x89, CLICK_NOTE, 0], time: 1280 },
      { data: [0x99, CLICK_NOTE, 100], time: 1500 },
      { data: [0x89, CLICK_NOTE, 0], time: 1530 },
    ]);
  });
});

describe("clocksPerBeat", () => {
  it.each([
    [1, 24],
    [2, 48],
    [1.5, 36],
    [0.5, 12],
    [0.75, 18],
    [0.125, 3],
    [0, 24],
    [Number.NaN, 24],
  ])("gives %d quarter notes %d clocks", (quarterNotes, clocks) => {
    expect(clocksPerBeat(quarterNotes)).toBe(clocks);
  });
});
