import { describe, expect, it } from "vitest";

import {
  LAST_CONTROLLER_MS,
  parseLastController,
  parseRunningMessage,
  runningProjections,
  type LastController,
} from "./running";

const EVENT = "3f1c2b9e-8a4d-4c1e-9b2a-1d2e3f4a5b6c";
const OTHER = "7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d";

describe("parseRunningMessage", () => {
  it("accepts the messages", () => {
    const open = { type: "open", window: { id: "a", eventId: EVENT, title: "Sunday" } };
    expect(parseRunningMessage(open)).toEqual(open);
    expect(
      parseRunningMessage({ type: "open", window: { id: "a", eventId: EVENT, title: null } }),
    ).not.toBeNull();
    expect(parseRunningMessage({ type: "closed", id: "a" })).toEqual({ type: "closed", id: "a" });
    expect(parseRunningMessage({ type: "ask" })).toEqual({ type: "ask" });
  });

  it("refuses other data", () => {
    expect(parseRunningMessage(null)).toBeNull();
    expect(parseRunningMessage({ type: "other" })).toBeNull();
    expect(
      parseRunningMessage({ type: "open", window: { id: "a", eventId: "not-an-id", title: null } }),
    ).toBeNull();
    expect(parseRunningMessage({ type: "closed", id: "" })).toBeNull();
  });
});

describe("parseLastController", () => {
  const last: LastController = { eventId: EVENT, title: "Sunday", seenAt: 1000, screens: true };

  it("reads a stored controller", () => {
    expect(parseLastController(JSON.stringify(last), 2000)).toEqual(last);
  });

  it("forgets an old controller", () => {
    expect(parseLastController(JSON.stringify(last), 1000 + LAST_CONTROLLER_MS + 1)).toBeNull();
  });

  it("refuses a missing or bad value", () => {
    expect(parseLastController(null, 0)).toBeNull();
    expect(parseLastController(undefined, 0)).toBeNull();
    expect(parseLastController("{", 0)).toBeNull();
    expect(parseLastController(JSON.stringify({ ...last, screens: undefined }), 2000)).toBeNull();
  });
});

describe("runningProjections", () => {
  it("gives one projection per event, with the title of a controller", () => {
    const windows = [
      { id: "screen", eventId: EVENT, title: null },
      { id: "controller", eventId: EVENT, title: "Sunday" },
      { id: "other", eventId: OTHER, title: "Youth" },
    ];
    expect(runningProjections(windows, null)).toEqual([
      { eventId: EVENT, title: "Sunday" },
      { eventId: OTHER, title: "Youth" },
    ]);
  });

  it("takes the title of a screen-only event from the last controller", () => {
    const last: LastController = { eventId: EVENT, title: "Sunday", seenAt: 0, screens: true };
    expect(runningProjections([{ id: "screen", eventId: EVENT, title: null }], last)).toEqual([
      { eventId: EVENT, title: "Sunday" },
    ]);
    expect(runningProjections([{ id: "screen", eventId: OTHER, title: null }], last)).toEqual([
      { eventId: OTHER, title: null },
    ]);
  });

  it("is empty without windows", () => {
    expect(runningProjections([], null)).toEqual([]);
  });
});
