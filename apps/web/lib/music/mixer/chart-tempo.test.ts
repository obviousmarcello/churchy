import { describe, expect, it } from "vitest";

import { STOPPED_GRID } from "@/lib/music/live/beat-grid";
import { chartTempo, mixerTempoOf } from "./chart-tempo";

describe("chartTempo", () => {
  it("reads the tempo and the time signature of the chart", () => {
    expect(chartTempo("{title: A}\n{tempo: 120}\n{time: 4/4}\n[C]Text")).toEqual({
      bpm: 120,
      timeSignature: "4/4",
    });
  });

  it("has no tempo without a valid one", () => {
    expect(chartTempo("{title: A}").bpm).toBeNull();
    expect(chartTempo("{tempo: fast}").bpm).toBeNull();
    expect(chartTempo("{tempo: 0}").bpm).toBeNull();
  });

  it("reads only the time signatures that the arrangement reads", () => {
    expect(chartTempo("{time: 6/8}").timeSignature).toBe("6/8");
    expect(chartTempo("{time: common}").timeSignature).toBeNull();
    expect(chartTempo("{time: 4/4 swing}").timeSignature).toBeNull();
  });
});

describe("mixerTempoOf", () => {
  it("counts dotted beats of a chart in compound time", () => {
    expect(mixerTempoOf({ bpm: 60, timeSignature: "6/8" }, null)).toEqual({
      bpm: 60,
      quarterNotesPerBeat: 1.5,
    });
    expect(mixerTempoOf(null, null)).toEqual({ bpm: null, quarterNotesPerBeat: 1 });
  });

  it("follows the grid of the leader, with the beat from its beats per bar", () => {
    const chart = { bpm: 60, timeSignature: "6/8" };
    expect(mixerTempoOf(chart, { ...STOPPED_GRID, bpm: 70, beatsPerBar: 2 })).toEqual({
      bpm: 70,
      quarterNotesPerBeat: 1.5,
    });
    expect(mixerTempoOf(chart, { ...STOPPED_GRID, bpm: 180, beatsPerBar: 6 })).toEqual({
      bpm: 180,
      quarterNotesPerBeat: 0.5,
    });
    expect(mixerTempoOf(chart, { ...STOPPED_GRID, bpm: 90, beatsPerBar: 4 })).toEqual({
      bpm: 90,
      quarterNotesPerBeat: 1,
    });
  });
});
