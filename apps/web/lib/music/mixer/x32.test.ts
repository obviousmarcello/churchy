import { describe, expect, it } from "vitest";

import { delayAddress, delayEffectOfType, delayMs, delaySysex, delayValue } from "./x32";

describe("delayMs", () => {
  it("gives the length of the note value at the tempo", () => {
    expect(delayMs(120, 1, "quarter")).toBe(500);
    expect(delayMs(120, 1, "dottedEighth")).toBe(375);
    expect(delayMs(120, 1, "eighth")).toBe(250);
    expect(delayMs(90, 1, "quarterTriplet")).toBe(444);
  });

  it("counts quarter notes, also when the beat is a dotted quarter", () => {
    // 6/8 with dotted beats: 60 beats a minute is 90 quarter notes a minute.
    expect(delayMs(60, 1.5, "quarter")).toBe(667);
  });

  it("stays in the range of the desk", () => {
    expect(delayMs(20, 1, "half")).toBe(3000);
  });
});

describe("X32 commands", () => {
  it("uses the time parameter of each delay effect", () => {
    expect(delayAddress(1, "stereoDelay")).toBe("/fx/1/par/02");
    expect(delayAddress(3, "fourTapDelay")).toBe("/fx/3/par/01");
    expect(delayEffectOfType(10)).toBe("stereoDelay");
    expect(delayEffectOfType(0)).toBeNull();
  });

  it("maps 1 to 3000 ms to 0 to 1", () => {
    expect(delayValue(1)).toBe(0);
    expect(delayValue(3000)).toBe(1);
    expect(delayValue(1500.5)).toBe(0.5);
  });

  it("sends the text with the ms value in SysEx", () => {
    const text = "/fx/1/par/02 375";
    expect(delaySysex(1, "stereoDelay", 375)).toEqual([
      0xf0,
      0x00,
      0x20,
      0x32,
      0x32,
      ...[...text].map((char) => char.charCodeAt(0)),
      0xf7,
    ]);
  });
});
