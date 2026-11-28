import { describe, expect, it } from "vitest";

import {
  canChangeEventArea,
  defaultEventAreaIds,
  eventGroupLabels,
  forbiddenEventAreaChanges,
  lockedEventAreas,
  sameEventAreas,
  toggleEventArea,
  type EventScopeOptions,
} from "./event-scopes";

const ROOT = "root";

const options: EventScopeOptions = {
  groups: [
    { id: ROOT, label: "Everyone", isRoot: true },
    { id: "music", label: "Music", isRoot: false },
    { id: "band", label: "Music › Band", isRoot: false },
    { id: "youth", label: "Youth", isRoot: false },
  ],
  editable: [ROOT, "music", "band"],
};

describe("defaultEventAreaIds", () => {
  it("gives the root group", () => {
    expect(defaultEventAreaIds(options)).toEqual([ROOT]);
    expect(defaultEventAreaIds({ groups: [], editable: "all" })).toEqual([]);
  });
});

describe("canChangeEventArea", () => {
  it("allows the groups of the user, or all groups for a superadmin", () => {
    expect(canChangeEventArea(options, "band")).toBe(true);
    expect(canChangeEventArea(options, "youth")).toBe(false);
    expect(canChangeEventArea({ ...options, editable: "all" }, "youth")).toBe(true);
  });
});

describe("toggleEventArea", () => {
  it("removes the root group when the user selects another group", () => {
    expect(toggleEventArea([ROOT], "band", true, options)).toEqual(["band"]);
    expect(toggleEventArea(["band"], "music", true, options)).toEqual(["band", "music"]);
  });

  it("removes all other groups when the user selects the root group, also the locked ones", () => {
    expect(toggleEventArea(["band", "youth"], ROOT, true, options)).toEqual([ROOT]);
  });

  it("removes an unchecked group", () => {
    expect(toggleEventArea(["band", "music"], "band", false, options)).toEqual(["music"]);
  });

  it("brings the locked groups back without the root group", () => {
    const locked = ["youth"];
    expect(toggleEventArea(["band", "youth"], ROOT, true, options, locked)).toEqual([ROOT]);
    expect(toggleEventArea([ROOT], ROOT, false, options, locked)).toEqual(["youth"]);
    expect(toggleEventArea([ROOT], "band", true, options, locked)).toEqual(["youth", "band"]);
    expect(toggleEventArea(["youth", "band"], "band", false, options, locked)).toEqual(["youth"]);
  });
});

describe("lockedEventAreas", () => {
  it("gives the groups of the event that the user cannot change", () => {
    expect(lockedEventAreas(["band", "youth"], options)).toEqual(["youth"]);
    expect(lockedEventAreas(["band", "youth"], { ...options, editable: "all" })).toEqual([]);
  });
});

describe("forbiddenEventAreaChanges", () => {
  const rights = new Set([ROOT, "music", "band"]);

  it("allows all changes to a superadmin", () => {
    expect(forbiddenEventAreaChanges(["youth"], [ROOT], "all", ROOT)).toEqual([]);
  });

  it("allows the groups of the user and keeps the other groups", () => {
    expect(forbiddenEventAreaChanges(["band"], [ROOT], rights, ROOT)).toEqual([]);
    expect(forbiddenEventAreaChanges(["youth", "band"], ["youth"], rights, ROOT)).toEqual([]);
  });

  it("refuses to add or remove a group of other users", () => {
    expect(forbiddenEventAreaChanges(["youth"], [ROOT], rights, ROOT)).toEqual(["youth"]);
    expect(forbiddenEventAreaChanges(["band"], ["youth", "band"], rights, ROOT)).toEqual(["youth"]);
  });

  it("allows an event for all users", () => {
    expect(forbiddenEventAreaChanges([ROOT], ["youth"], rights, ROOT)).toEqual([]);
  });
});

describe("sameEventAreas", () => {
  it("ignores the order", () => {
    expect(sameEventAreas(["a", "b"], ["b", "a"])).toBe(true);
    expect(sameEventAreas(["a"], ["a", "b"])).toBe(false);
  });
});

describe("eventGroupLabels", () => {
  it("gives the labels of the groups without the root group and the deleted groups", () => {
    const labels = { band: "Music › Band", youth: "Youth" };
    expect(eventGroupLabels(["band", "youth"], labels)).toEqual(["Music › Band", "Youth"]);
    expect(eventGroupLabels([ROOT], labels)).toEqual([]);
    expect(eventGroupLabels(["gone"], labels)).toEqual([]);
    expect(eventGroupLabels(undefined, labels)).toEqual([]);
  });
});
