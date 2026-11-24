import { describe, expect, it } from "vitest";

import { INITIAL_SONG_TEMPO, followSong, type TempoSong } from "./song-tempo";

const waltz: TempoSong = { id: "waltz", bpm: 90, timeSignature: "3/4" };
const ballad: TempoSong = { id: "ballad", bpm: 64, timeSignature: "6/8" };
const unknown: TempoSong = { id: "unknown", bpm: null, timeSignature: null };

describe("followSong", () => {
  it("takes the tempo and the beats of the first song", () => {
    expect(followSong(INITIAL_SONG_TEMPO, waltz, "dotted")).toMatchObject({
      bpm: 90,
      beatsPerBar: 3,
    });
  });

  it("uses the defaults when the first song has no tempo", () => {
    expect(followSong(INITIAL_SONG_TEMPO, unknown, "dotted")).toMatchObject({
      bpm: 100,
      beatsPerBar: 4,
    });
  });

  it("gives the same object when nothing changes", () => {
    const state = followSong(INITIAL_SONG_TEMPO, waltz, "dotted");
    expect(followSong(state, { ...waltz }, "dotted")).toBe(state);
  });

  it("keeps the user's tempo for the same song", () => {
    const state = { ...followSong(INITIAL_SONG_TEMPO, waltz, "dotted"), bpm: 100 };
    expect(followSong(state, waltz, "dotted")).toBe(state);
  });

  it("takes the values of the next song", () => {
    const state = { ...followSong(INITIAL_SONG_TEMPO, waltz, "dotted"), bpm: 100 };
    expect(followSong(state, ballad, "dotted")).toMatchObject({
      songId: "ballad",
      bpm: 64,
      beatsPerBar: 2,
    });
  });

  it("keeps the current values for a song without them", () => {
    const state = followSong(INITIAL_SONG_TEMPO, waltz, "dotted");
    expect(followSong(state, unknown, "dotted")).toMatchObject({
      songId: "unknown",
      bpm: 90,
      beatsPerBar: 3,
    });
    expect(followSong(state, null, "dotted")).toMatchObject({
      songId: null,
      bpm: 90,
      beatsPerBar: 3,
    });
  });

  it("forgets the user's change of the tempo at the next song", () => {
    const state = { ...followSong(INITIAL_SONG_TEMPO, waltz, "dotted"), bpm: 140, edited: true };
    const next = followSong(state, unknown, "dotted");
    expect(next).toMatchObject({ bpm: 140 });
    expect(next.edited).toBeFalsy();
  });

  it("keeps the speed of the user's tempo when the count of compound time changes", () => {
    const state = { ...followSong(INITIAL_SONG_TEMPO, ballad, "dotted"), bpm: 70, edited: true };
    const eighths = followSong(state, ballad, "eighth");
    expect(eighths).toMatchObject({ bpm: 210, beatsPerBar: 6, edited: true });
    expect(followSong(eighths, ballad, "dotted")).toMatchObject({ bpm: 70, beatsPerBar: 2 });
  });

  it("reads the chart's tempo of compound time as dotted beats", () => {
    expect(followSong(INITIAL_SONG_TEMPO, ballad, "eighth")).toMatchObject({
      bpm: 192,
      beatsPerBar: 6,
    });
    expect(followSong(INITIAL_SONG_TEMPO, waltz, "eighth")).toMatchObject({
      bpm: 90,
      beatsPerBar: 3,
    });
  });

  it("follows new data of the same song, unless the user edited the tempo", () => {
    const state = followSong(INITIAL_SONG_TEMPO, waltz, "dotted");
    expect(followSong(state, { ...waltz, bpm: 96 }, "dotted")).toMatchObject({
      songId: "waltz",
      bpm: 96,
      beatsPerBar: 3,
    });
    expect(followSong(state, { ...waltz, timeSignature: "4/4" }, "dotted")).toMatchObject({
      beatsPerBar: 4,
    });

    const edited = { ...state, bpm: 120, edited: true };
    expect(followSong(edited, { ...waltz, bpm: 96 }, "dotted")).toBe(edited);
  });

  it("keeps a song's tempo in the range of the metronome", () => {
    expect(
      followSong(INITIAL_SONG_TEMPO, { id: "slow", bpm: 5, timeSignature: null }, "dotted").bpm,
    ).toBe(20);
  });
});
