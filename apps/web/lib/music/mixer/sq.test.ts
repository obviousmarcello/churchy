import { describe, expect, it } from "vitest";

import { softKeyNote, sqTapMessages, tapIntervalMs } from "./sq";

describe("the soft keys of the SQ", () => {
  it("presses soft key 1 with C3 and soft key 16 with D#4", () => {
    expect(softKeyNote(1)).toBe(0x30);
    expect(softKeyNote(16)).toBe(0x3f);
  });

  it("taps a quarter note apart, also when the beat is a dotted quarter", () => {
    expect(tapIntervalMs(120, 1)).toBe(500);
    expect(tapIntervalMs(60, 1.5)).toBe(667);
    expect(tapIntervalMs(10, 1)).toBe(3000);
  });

  it("presses and releases each key at each tap, on the MIDI channel of the desk", () => {
    const messages = sqTapMessages(1, [1, 3], 500, 2);
    expect(messages).toEqual([
      { data: [0x90, 0x30, 0x7f], at: 0 },
      { data: [0x90, 0x32, 0x7f], at: 0 },
      { data: [0x80, 0x30, 0x00], at: 30 },
      { data: [0x80, 0x32, 0x00], at: 30 },
      { data: [0x90, 0x30, 0x7f], at: 500 },
      { data: [0x90, 0x32, 0x7f], at: 500 },
      { data: [0x80, 0x30, 0x00], at: 530 },
      { data: [0x80, 0x32, 0x00], at: 530 },
    ]);
    // Channel 5: soft key 7 is 94 36 7F (the example of the protocol).
    expect(sqTapMessages(5, [7], 500, 1)[0]!.data).toEqual([0x94, 0x36, 0x7f]);
  });
});
