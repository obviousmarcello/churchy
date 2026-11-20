import { describe, expect, it } from "vitest";
import type { Member } from "@churchy/contracts";
import {
  activeEditors,
  activeWorkspaceUsers,
  groupIdsOf,
  isLastActiveOwner,
  memberState,
  memberValues,
  parseUserForm,
  targetRolesOf,
} from "./users";

const member = (over: Partial<Member> = {}): Member => ({
  tenantId: "t",
  userId: "u1",
  role: "editor",
  groupIds: [],
  wsRoles: [],
  teamIds: [],
  roomIds: [],
  hrCategoryIds: [],
  active: true,
  invitedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  user: {
    id: "u1",
    email: "minta@pelda.hu",
    name: "Minta Mária",
    twoFactorEnabled: false,
    lastLoginAt: "2026-11-01T08:00:00.000Z",
  },
  ...over,
});

describe("memberState", () => {
  it("tells active, invited and inactive members apart", () => {
    expect(memberState(member())).toBe("active");
    expect(memberState(member({ user: { ...member().user, lastLoginAt: null } }))).toBe("invited");
    expect(memberState(member({ active: false }))).toBe("inactive");
  });
});

describe("counting", () => {
  const list = [
    member({ userId: "a", role: "owner", wsRoles: ["leader"] }),
    member({ userId: "b", role: null, wsRoles: ["volunteer"] }),
    member({ userId: "c", role: "editor", wsRoles: [], active: false }),
    member({ userId: "d", role: "editor", wsRoles: [] }),
  ];
  it("counts active workspace users without the deactivated", () => {
    expect(activeWorkspaceUsers(list)).toBe(2);
  });
  it("counts active website roles as editors", () => {
    expect(activeEditors(list)).toBe(2);
  });
});

describe("isLastActiveOwner", () => {
  it("is true only for the single active owner", () => {
    const one = [member({ userId: "a", role: "owner" }), member({ userId: "b" })];
    expect(isLastActiveOwner(one, "a")).toBe(true);
    expect(isLastActiveOwner(one, "b")).toBe(false);
    const two = [...one, member({ userId: "c", role: "owner" })];
    expect(isLastActiveOwner(two, "a")).toBe(false);
    const inactive = [
      member({ userId: "a", role: "owner" }),
      member({ userId: "c", role: "owner", active: false }),
    ];
    expect(isLastActiveOwner(inactive, "a")).toBe(true);
  });
});

describe("form parsing", () => {
  it("reads the role, workspace roles and group slugs", () => {
    const parsed = parseUserForm({
      role: "groupLeader",
      groups: "Ifjúság, Kórus,\nifjúság",
      ws_volunteer: "on",
      ws_leader: "",
    });
    expect(parsed).toEqual({
      role: "groupLeader",
      wsRoles: ["volunteer"],
      groupIds: ["ifjusag", "korus"],
    });
  });
  it("treats an empty role as none and rejects unknown roles", () => {
    expect(parseUserForm({ role: "" })?.role).toBeNull();
    expect(parseUserForm({ role: "root" })).toBeUndefined();
  });
  it("round-trips a member through the form values", () => {
    const values = memberValues(member({ role: "office", wsRoles: ["hrHandler"] }));
    expect(parseUserForm(values)).toMatchObject({ role: "office", wsRoles: ["hrHandler"] });
  });
  it("lists both the current and the new role as the policy target", () => {
    expect(targetRolesOf("owner", "admin")).toEqual(["owner", "admin"]);
    expect(targetRolesOf(null, "editor")).toEqual(["editor"]);
    expect(groupIdsOf("")).toEqual([]);
  });
});
