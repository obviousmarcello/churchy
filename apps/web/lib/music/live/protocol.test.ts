import { describe, expect, it } from "vitest";

import { STOPPED_GRID } from "./beat-grid";
import {
  newerState,
  parseLivePresence,
  parseLiveState,
  restoredLiveState,
  sectionAnchors,
  storedLiveState,
  type LiveState,
} from "./protocol";

const LEADER = "00000000-0000-4000-8000-000000000001";
const STATE: LiveState = {
  seq: 3,
  leaderId: LEADER,
  grid: { ...STOPPED_GRID, epoch: 2, running: true, startTime: 1_700_000_000_000 },
  position: { songId: "song-1", section: "chorus#2" },
  keys: { "song-1": "Bb" },
};

describe("parseLiveState", () => {
  it("accepts a valid state", () => {
    expect(parseLiveState(STATE)).toEqual(STATE);
    expect(parseLiveState({ ...STATE, position: null })).toEqual({ ...STATE, position: null });
  });

  it("accepts a state without keys, from an older browser", () => {
    expect(parseLiveState({ ...STATE, keys: undefined })).toEqual({ ...STATE, keys: {} });
  });

  it("refuses a key that is not a usual English name", () => {
    expect(parseLiveState({ ...STATE, keys: { "song-1": "H" } })).toBeNull();
    expect(parseLiveState({ ...STATE, keys: { "song-1": "G}" } })).toBeNull();
  });

  it("refuses a state that would break the metronome or the sheet", () => {
    expect(parseLiveState({ ...STATE, grid: { ...STATE.grid, bpm: 0 } })).toBeNull();
    expect(
      parseLiveState({ ...STATE, grid: { ...STATE.grid, startTime: Number.POSITIVE_INFINITY } }),
    ).toBeNull();
    expect(parseLiveState({ ...STATE, grid: { ...STATE.grid, beatsPerBar: 2.5 } })).toBeNull();
    expect(parseLiveState({ ...STATE, leaderId: "me" })).toBeNull();
    expect(parseLiveState({ ...STATE, seq: -1 })).toBeNull();
    expect(parseLiveState(null)).toBeNull();
  });
});

describe("parseLivePresence", () => {
  it("keeps one valid entry per user", () => {
    const entry = { userId: LEADER, name: "Anna", following: true, clockErrorMs: 3 };
    expect(parseLivePresence([entry, { ...entry, following: false }, { name: "broken" }])).toEqual([
      { ...entry, following: false },
    ]);
  });

  it("accepts a user without a display name", () => {
    const entry = { userId: LEADER, name: "", following: true, clockErrorMs: null };
    expect(parseLivePresence([entry])).toEqual([entry]);
  });
});

describe("newerState", () => {
  it("keeps the state with the higher number", () => {
    const newer = { ...STATE, seq: 4 };
    expect(newerState(null, STATE)).toBe(STATE);
    expect(newerState(STATE, newer)).toBe(newer);
    expect(newerState(newer, STATE)).toBe(newer);
  });
});

describe("restoredLiveState", () => {
  const SESSION = "00000000-0000-4000-8000-0000000000aa";

  it("gives the kept state of the leader that the server knows", () => {
    expect(restoredLiveState(storedLiveState(SESSION, STATE), SESSION, LEADER)).toEqual(STATE);
  });

  it("gives no state when another user leads now", () => {
    expect(
      restoredLiveState(
        storedLiveState(SESSION, STATE),
        SESSION,
        "00000000-0000-4000-8000-000000000002",
      ),
    ).toBeNull();
  });

  it("gives no state of another session", () => {
    expect(
      restoredLiveState(
        storedLiveState(SESSION, STATE),
        "00000000-0000-4000-8000-0000000000bb",
        LEADER,
      ),
    ).toBeNull();
  });

  it("gives no state for nothing kept or a broken value", () => {
    expect(restoredLiveState(null, SESSION, LEADER)).toBeNull();
    expect(restoredLiveState("{", SESSION, LEADER)).toBeNull();
    expect(restoredLiveState(JSON.stringify(STATE), SESSION, LEADER)).toBeNull();
    expect(
      restoredLiveState(storedLiveState(SESSION, { ...STATE, seq: -1 }), SESSION, LEADER),
    ).toBeNull();
  });
});

describe("sectionAnchors", () => {
  it("names each section by its label and the number of the time it comes", () => {
    expect(
      sectionAnchors([
        null,
        { label: "Verse 1" },
        { label: "Chorus" },
        null,
        { label: "chorus " },
        { label: "Verse 1" },
      ]),
    ).toEqual([null, "verse 1#1", "chorus#1", null, "chorus#2", "verse 1#2"]);
  });
});
