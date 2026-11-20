import { describe, expect, it } from "vitest";
import { tenantActor } from "@churchy/policy";
import { contactVisible, visibleContact } from "./contacts";
import { buildEntries, groupByDay, parseCalendarParams, stepDate, windowFor } from "./calendar";
import { filterDirectory } from "./directory";
import {
  creatableCalendars,
  creatableVisibilities,
  eventVisibleTo,
  mayEditEvent,
} from "./event-access";
import { moduleEnabled, tierStatus } from "./plan-tier";

const T = "t-1";
const base = { tenantId: T, userId: "u-me", personId: "p-me" } as const;
const volunteer = tenantActor({
  ...base,
  workspaceRoles: ["volunteer"],
  memberTeamIds: ["team-a"],
});
const employee = tenantActor({ ...base, workspaceRoles: ["employee"], memberTeamIds: [] });
const leader = tenantActor({ ...base, workspaceRoles: ["leader", "employee"] });
const teamLeader = tenantActor({
  ...base,
  workspaceRoles: ["teamLeader", "volunteer"],
  leadTeamIds: ["team-a"],
  memberTeamIds: ["team-a"],
});
const person = (level: "public" | "workspace" | "team" | "private", minor = false) => ({
  id: "p-x",
  isMinor: minor,
  contactVisibility: { email: level, phone: level },
});

describe("contact visibility (4 levels)", () => {
  const v = (actor: typeof volunteer) => ({ actor, tenantId: T });
  it("public and workspace: every workspace user", () => {
    for (const level of ["public", "workspace"] as const) {
      expect(contactVisible(v(volunteer), person(level), "email", [])).toBe(true);
    }
  });
  it("team: only people sharing a team", () => {
    expect(contactVisible(v(volunteer), person("team"), "phone", ["team-a"])).toBe(true);
    expect(contactVisible(v(volunteer), person("team"), "phone", ["team-b"])).toBe(false);
    expect(contactVisible(v(employee), person("team"), "phone", ["team-a"])).toBe(false);
  });
  it("private: leaders and the person only", () => {
    expect(contactVisible(v(employee), person("private"), "email", [])).toBe(false);
    expect(contactVisible(v(leader), person("private"), "email", [])).toBe(true);
    expect(contactVisible(v(employee), { ...person("private"), id: "p-me" }, "email", [])).toBe(
      true,
    );
  });
  it("minors: hidden except for their team leaders and leaders", () => {
    expect(contactVisible(v(employee), person("public", true), "email", ["team-a"])).toBe(false);
    expect(contactVisible(v(teamLeader), person("public", true), "email", ["team-a"])).toBe(true);
    expect(contactVisible(v(leader), person("public", true), "email", [])).toBe(true);
  });
  it("other tenants and anonymous see nothing", () => {
    expect(
      contactVisible({ actor: { kind: "anonymous" }, tenantId: T }, person("public"), "email", []),
    ).toBe(false);
    expect(
      contactVisible({ actor: employee, tenantId: "t-2" }, person("public"), "email", []),
    ).toBe(false);
  });
  it("reports hidden fields", () => {
    const p = { ...person("private"), email: "a@pelda.hu", phone: null };
    expect(visibleContact(v(employee), p, [])).toEqual({
      email: null,
      phone: null,
      hasHidden: true,
    });
  });
});

describe("workspace plan tiers", () => {
  it("caps and levels per tier", () => {
    expect(tierStatus("none", 0).level).toBe("disabled");
    for (const [tier, cap] of [
      ["s50", 50],
      ["m150", 150],
      ["l300", 300],
    ] as const) {
      expect(tierStatus(tier, Math.ceil(cap * 0.9) - 1)).toMatchObject({
        level: "ok",
        canInvite: true,
      });
      expect(tierStatus(tier, Math.ceil(cap * 0.9))).toMatchObject({
        level: "warning",
        canInvite: true,
      });
      expect(tierStatus(tier, cap)).toMatchObject({ level: "full", canInvite: false });
    }
  });
  it("modules follow the tier and switches", () => {
    expect(moduleEnabled("none", undefined, "ws.calendar")).toBe(false);
    expect(moduleEnabled("s50", undefined, "ws.docs")).toBe(false);
    expect(moduleEnabled("m150", undefined, "ws.docs")).toBe(true);
    expect(moduleEnabled("m150", { "ws.docs": false }, "ws.docs")).toBe(false);
  });
});

describe("event access", () => {
  const ev = (visibility: "private" | "team" | "staff" | "public", extra = {}) => ({
    tenantId: T,
    visibility,
    teamId: null,
    createdBy: "u-other",
    status: "published" as const,
    ...extra,
  });
  it("private only for the calendar owner or creator", () => {
    expect(eventVisibleTo(leader, ev("private"), { ownerPersonId: "p-other" })).toBe(false);
    expect(eventVisibleTo(leader, ev("private"), { ownerPersonId: "p-me" })).toBe(true);
    expect(eventVisibleTo(leader, ev("private", { createdBy: "u-me" }), undefined)).toBe(true);
  });
  it("team events for team members; staff events not for volunteers", () => {
    expect(eventVisibleTo(volunteer, ev("team", { teamId: "team-a" }), undefined)).toBe(true);
    expect(eventVisibleTo(volunteer, ev("team", { teamId: "team-b" }), undefined)).toBe(false);
    expect(eventVisibleTo(volunteer, ev("staff"), undefined)).toBe(false);
    expect(eventVisibleTo(employee, ev("staff"), undefined)).toBe(true);
    expect(eventVisibleTo(volunteer, ev("public"), undefined)).toBe(true);
  });
  it("creation follows can(): only leaders publish, team leaders create team events", () => {
    expect(creatableVisibilities(volunteer, T, null)).toEqual(["private"]);
    expect(creatableVisibilities(employee, T, null)).toEqual(["private", "staff"]);
    expect(creatableVisibilities(leader, T, null)).toContain("public");
    expect(creatableVisibilities(teamLeader, T, "team-a")).toContain("team");
    expect(creatableVisibilities(teamLeader, T, "team-b")).not.toContain("team");
  });
  it("editing: creator, owner, team leader, leader", () => {
    const cal = { ownerPersonId: null, teamId: null, editors: { roles: [], teamIds: [] } };
    const e = { tenantId: T, teamId: "team-a", createdBy: "u-other" };
    expect(mayEditEvent(volunteer, e, cal)).toBe(false);
    expect(mayEditEvent(teamLeader, e, cal)).toBe(true);
    expect(mayEditEvent(leader, e, cal)).toBe(true);
    expect(mayEditEvent(volunteer, { ...e, createdBy: "u-me" }, cal)).toBe(true);
  });
  it("calendars to add to", () => {
    const cals = [
      { kind: "shared", ownerPersonId: null, teamId: null },
      { kind: "personal", ownerPersonId: "p-other", teamId: null },
      { kind: "personal", ownerPersonId: "p-me", teamId: null },
      { kind: "team", ownerPersonId: null, teamId: "team-b" },
      { kind: "absence", ownerPersonId: null, teamId: null },
    ] as never[];
    expect(creatableCalendars(volunteer, cals)).toHaveLength(2);
  });
});

describe("calendar view model", () => {
  it("parses params and falls back to defaults", () => {
    const p = parseCalendarParams({ nezet: "xx", datum: "2026-02-30" }, "2026-11-18");
    expect(p).toMatchObject({ view: "auto", date: "2026-11-18" });
    expect(p.layers).toHaveLength(6);
    const f = parseCalendarParams(
      { szurt: "1", reteg: ["events", "bad"], nezet: "het" },
      "2026-11-18",
    );
    expect(f.layers).toEqual(["events"]);
    expect(f.view).toBe("het");
  });
  it("weeks start on Monday; month grid and stepping", () => {
    const w = windowFor("het", "2026-11-18");
    expect(w.from).toBe("2026-11-16");
    expect(w.to).toBe("2026-11-22");
    expect(windowFor("honap", "2026-11-18").month?.weeks[0]?.[6]).toBe("2026-11-01");
    expect(stepDate("honap", "2026-12-15", 1)).toBe("2027-01-01");
    expect(stepDate("het", "2026-11-18", -1)).toBe("2026-11-11");
  });
  it("merges layers, shows absences as Távol only and holidays", () => {
    const src = {
      from: "2026-11-01",
      to: "2026-11-02",
      family: "catholic" as const,
      events: [],
      calendars: [],
      locationNames: new Map<string, string>(),
      services: [],
      bookings: [
        {
          id: "b",
          roomName: "Terem",
          title: "Próba",
          startsAt: "2026-11-02T17:00:00+01:00",
          endsAt: "2026-11-02T18:00:00+01:00",
          status: "approved" as const,
          mine: false,
        },
      ],
      assignments: [],
      absences: [
        { id: "a", person: "", startDate: "2026-10-30", endDate: "2026-11-02", detail: null },
      ],
    };
    const all = buildEntries(src, ["bookings", "absences", "holidays"], []);
    const byDay = groupByDay(all, "2026-11-01", "2026-11-02");
    expect(byDay.get("2026-11-01")?.map((e) => e.layer)).toEqual(["holidays", "absences"]);
    expect(byDay.get("2026-11-02")?.map((e) => e.layer)).toEqual([
      "holidays",
      "absences",
      "bookings",
    ]);
    expect(all.find((e) => e.layer === "absences")?.title).toBeNull();
    expect(buildEntries(src, ["events"], [])).toEqual([]);
  });
});

describe("directory filter", () => {
  const entries = [
    {
      person: { familyName: "Árpád", givenName: "Éva", roleTitle: null, skills: ["gitár"] },
      teams: [{ team: { id: "t1" }, positions: [{ name: "Ének" }] }],
    },
    {
      person: { familyName: "Bodor", givenName: "Zoltán", roleTitle: "Kántor", skills: [] },
      teams: [],
    },
  ];
  const none = { q: "", teamId: "", position: "", skill: "" };
  it("searches accent-insensitively and filters", () => {
    expect(filterDirectory(entries, { ...none, q: "arpad" })).toHaveLength(1);
    expect(filterDirectory(entries, { ...none, q: "kantor" })).toHaveLength(1);
    expect(filterDirectory(entries, { ...none, teamId: "t1" })).toHaveLength(1);
    expect(filterDirectory(entries, { ...none, position: "Ének" })).toHaveLength(1);
    expect(filterDirectory(entries, { ...none, skill: "gitár" })).toHaveLength(1);
    expect(filterDirectory(entries, none)).toHaveLength(2);
  });
});
