import { describe, expect, it } from "vitest";

import { meterOf, parseTimeSignature } from "./meter";

describe("parseTimeSignature", () => {
  it.each([
    ["4/4", 4, 4],
    ["3/4", 3, 4],
    [" 6 / 8 ", 6, 8],
    ["12/8", 12, 8],
    ["7/8", 7, 8],
    ["2/2", 2, 2],
    ["C", 4, 4],
    ["c", 4, 4],
    ["C|", 2, 2],
    ["¢", 2, 2],
  ])("reads %j", (text, numerator, denominator) => {
    expect(parseTimeSignature(text)).toEqual({ numerator, denominator });
  });

  it.each([null, undefined, "", "4", "4/3", "0/4", "4/0", "four/four", "4/4/4", "123/4"])(
    "rejects %j",
    (text) => {
      expect(parseTimeSignature(text)).toBeNull();
    },
  );
});

describe("meterOf", () => {
  it.each([
    ["4/4", 4, false, 1],
    ["3/4", 3, false, 1],
    ["2/2", 2, false, 2],
    ["3/8", 3, false, 0.5],
    ["7/8", 7, false, 0.5],
    ["6/8", 2, true, 1.5],
    ["9/8", 3, true, 1.5],
    ["12/8", 4, true, 1.5],
    ["6/16", 2, true, 0.75],
    ["6/4", 6, false, 1],
  ])(
    "counts %s in dotted quarter notes by default",
    (text, beatsPerBar, compound, quarterNotesPerBeat) => {
      expect(meterOf(text, "dotted")).toEqual({ beatsPerBar, compound, quarterNotesPerBeat });
    },
  );

  it("counts compound time in eighth notes with that setting", () => {
    expect(meterOf("6/8", "eighth")).toEqual({
      beatsPerBar: 6,
      compound: true,
      quarterNotesPerBeat: 0.5,
    });
    expect(meterOf("12/8", "eighth")).toEqual({
      beatsPerBar: 12,
      compound: true,
      quarterNotesPerBeat: 0.5,
    });
    expect(meterOf("4/4", "eighth")).toEqual({
      beatsPerBar: 4,
      compound: false,
      quarterNotesPerBeat: 1,
    });
  });

  it("is null without a time signature", () => {
    expect(meterOf(null, "dotted")).toBeNull();
    expect(meterOf("waltz", "dotted")).toBeNull();
  });
});
