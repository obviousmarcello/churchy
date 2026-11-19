import { describe, expect, it } from "vitest";
import type { ApprovalPolicy, BookingRules, Room, ServiceRoomBlock } from "@churchy/contracts";
import {
  checkRules,
  conflictSummary,
  decideApproval,
  expandWeekly,
  findAlternatives,
  findClash,
  localParts,
  localToInstant,
  mergeOccupancies,
  retime,
  scopeTargets,
  serviceOccupancies,
  seriesHorizon,
  weeklyRule,
  type Occupancy,
} from "./index";

// 2026-11-19 is a Thursday.
const NOW = new Date(localToInstant("2026-11-19", "09:00"));
const slot = (date: string, from: string, to: string) => ({
  startsAt: localToInstant(date, from),
  endsAt: localToInstant(date, to),
});
const rules = (r: Partial<BookingRules>): BookingRules => ({
  whoCanRequest: "all_workspace",
  ...r,
});

describe("time helpers", () => {
  it("round-trips Budapest wall-clock time across DST", () => {
    expect(localToInstant("2026-11-20", "18:00")).toBe("2026-11-20T17:00:00.000Z");
    expect(localToInstant("2026-07-20", "18:00")).toBe("2026-07-20T16:00:00.000Z");
    expect(localParts("2026-11-20T17:00:00.000Z")).toMatchObject({
      date: "2026-11-20",
      time: "18:00",
      weekday: 5,
    });
    expect(() => localToInstant("x", "18:00")).toThrow(RangeError);
  });
});

describe("checkRules — one test per rule", () => {
  it("allows a request that satisfies every rule", () => {
    const r = rules({
      bookableHours: [{ weekday: 5, from: "08:00", to: "21:00" }],
      minNoticeHours: 24,
      maxDurationMin: 180,
      horizonDays: 90,
    });
    expect(checkRules(r, slot("2026-11-27", "18:00", "20:00"), NOW)).toEqual([]);
  });

  it("bookableHours: outside the window, on another weekday, or past midnight", () => {
    const r = rules({ bookableHours: [{ weekday: 5, from: "08:00", to: "21:00" }] });
    const keys = (s: ReturnType<typeof slot>) => checkRules(r, s, NOW).map((v) => v.rule);
    expect(keys(slot("2026-11-27", "07:00", "09:00"))).toEqual(["bookableHours"]);
    expect(keys(slot("2026-11-27", "20:00", "22:00"))).toEqual(["bookableHours"]);
    expect(keys(slot("2026-11-28", "10:00", "11:00"))).toEqual(["bookableHours"]);
    expect(keys(slot("2026-11-27", "20:00", "21:00"))).toEqual([]);
  });

  it("bookableHours: a window ending at 00:00 runs to midnight; empty list means always", () => {
    const night = rules({ bookableHours: [{ weekday: 5, from: "08:00", to: "00:00" }] });
    expect(checkRules(night, slot("2026-11-27", "22:00", "23:30"), NOW)).toEqual([]);
    expect(
      checkRules(rules({ bookableHours: [] }), slot("2026-11-28", "03:00", "04:00"), NOW),
    ).toEqual([]);
  });

  it("minNotice", () => {
    const r = rules({ minNoticeHours: 48 });
    expect(checkRules(r, slot("2026-11-20", "10:00", "11:00"), NOW)).toEqual([
      { rule: "minNotice", detail: 48 },
    ]);
    expect(checkRules(r, slot("2026-11-23", "10:00", "11:00"), NOW)).toEqual([]);
  });

  it("maxDuration", () => {
    const r = rules({ maxDurationMin: 120 });
    expect(checkRules(r, slot("2026-11-27", "10:00", "13:00"), NOW)).toEqual([
      { rule: "maxDuration", detail: 120 },
    ]);
    expect(checkRules(r, slot("2026-11-27", "10:00", "12:00"), NOW)).toEqual([]);
  });

  it("horizon", () => {
    const r = rules({ horizonDays: 30 });
    expect(checkRules(r, slot("2027-03-01", "10:00", "11:00"), NOW)).toEqual([
      { rule: "horizon", detail: 30 },
    ]);
    expect(checkRules(r, slot("2026-12-10", "10:00", "11:00"), NOW)).toEqual([]);
  });

  it("blackout", () => {
    const r = rules({
      blackout: [
        {
          name: "Ünnepi zárás",
          from: localToInstant("2026-12-24", "00:00"),
          to: localToInstant("2026-12-27", "00:00"),
        },
      ],
    });
    expect(checkRules(r, slot("2026-12-25", "10:00", "11:00"), NOW)).toEqual([
      { rule: "blackout", detail: "Ünnepi zárás" },
    ]);
    expect(checkRules(r, slot("2026-12-27", "10:00", "11:00"), NOW)).toEqual([]);
  });
});

describe("decideApproval", () => {
  const policy: ApprovalPolicy = {
    autoApprove: { roles: ["leader"], teamIds: ["t1"] },
    approvers: "room_managers",
    holdHours: 24,
  };
  const none = { roles: [], teamIds: [], mayApprove: false };
  it("approves approvers, auto-approve roles and own auto-approve teams", () => {
    expect(decideApproval(policy, { ...none, mayApprove: true }, null, NOW).status).toBe(
      "approved",
    );
    expect(decideApproval(policy, { ...none, roles: ["leader"] }, null, NOW).status).toBe(
      "approved",
    );
    expect(decideApproval(policy, { ...none, teamIds: ["t1"] }, "t1", NOW).status).toBe("approved");
  });
  it("holds everyone else for holdHours", () => {
    const r = decideApproval(policy, { ...none, teamIds: ["t1"] }, "t2", NOW);
    expect(r.status).toBe("pending");
    expect(r.holdExpiresAt).toBe(new Date(NOW.getTime() + 24 * 3_600_000).toISOString());
    expect(decideApproval(policy, { ...none, teamIds: ["t1"] }, null, NOW).status).toBe("pending");
  });
});

const occ = (
  id: string,
  roomId: string,
  date: string,
  from: string,
  to: string,
  extra = {},
): Occupancy => ({
  id,
  roomId,
  ...slot(date, from, to),
  bufferBeforeMin: 0,
  bufferAfterMin: 0,
  status: "approved",
  source: "user",
  title: id,
  ...extra,
});

const room = (id: string, extra: Partial<Room> = {}): Room =>
  ({
    id,
    tenantId: "t",
    locationId: "loc",
    name: id,
    kind: "room",
    capacity: 30,
    features: [],
    photoMediaIds: [],
    accessibility: {
      wheelchair: true,
      accessibleToilet: false,
      hearingLoop: false,
      parking: false,
      note: null,
    },
    managerPersonIds: [],
    approvalPolicy: {
      autoApprove: { roles: [], teamIds: [] },
      approvers: "room_managers",
      holdHours: 48,
    },
    rules: { whoCanRequest: "all_workspace" },
    active: true,
    ...extra,
  }) as Room;

describe("findClash", () => {
  const list = [
    occ("a", "r1", "2026-11-27", "10:00", "12:00", { bufferAfterMin: 30 }),
    occ("c", "r1", "2026-11-27", "14:00", "15:00", { status: "cancelled" }),
  ];
  it("counts buffers and ignores cancelled / other rooms / itself", () => {
    expect(findClash(list, "r1", slot("2026-11-27", "12:00", "13:00"))?.id).toBe("a");
    expect(findClash(list, "r1", slot("2026-11-27", "12:30", "13:00"))).toBeUndefined();
    expect(findClash(list, "r1", slot("2026-11-27", "14:00", "15:00"))).toBeUndefined();
    expect(findClash(list, "r2", slot("2026-11-27", "10:00", "11:00"))).toBeUndefined();
    expect(findClash(list, "r1", slot("2026-11-27", "10:00", "11:00"), "a")).toBeUndefined();
  });
});

describe("findAlternatives", () => {
  const rooms = [
    room("r1", { features: ["projektor"] }),
    room("r2", { features: ["projektor", "hangosítás"], capacity: 40 }),
    room("r3", { capacity: 8 }),
    room("r4", { locationId: "other" }),
    room("r5", { active: false }),
    room("r6", { features: ["projektor"], capacity: null }),
  ];
  const busy = [
    occ("a", "r1", "2026-11-27", "18:00", "20:00"),
    occ("b", "r6", "2026-11-27", "18:00", "20:00"),
  ];

  it("offers free rooms of the same place with capacity and features", () => {
    const alt = findAlternatives({
      rooms,
      occupancies: busy,
      roomId: "r1",
      slot: slot("2026-11-27", "18:00", "20:00"),
      attendees: 20,
      features: ["projektor"],
    });
    expect(alt.rooms.map((r) => r.id)).toEqual(["r2"]);
  });

  it("offers the nearest free slots of the same room (shift first, then next days)", () => {
    const alt = findAlternatives({
      rooms,
      occupancies: busy,
      roomId: "r1",
      slot: slot("2026-11-27", "18:00", "20:00"),
    });
    expect(alt.slots.map((s) => localParts(s.startsAt).time)).toEqual(["16:00", "20:00", "15:30"]);
    expect(alt.slots).toHaveLength(3);
    expect(alt.slots.every((s) => s.roomId === "r1")).toBe(true);
    expect(findClash(busy, "r1", alt.slots[0]!)).toBeUndefined();
  });

  it("falls back to later days when the whole afternoon is taken, and honours `accept`", () => {
    const day = [
      occ("x", "r1", "2026-11-27", "08:00", "23:00"),
      occ("y", "r1", "2026-11-28", "08:00", "23:00"),
    ];
    const alt = findAlternatives({
      rooms: [room("r1")],
      occupancies: day,
      roomId: "r1",
      slot: slot("2026-11-27", "18:00", "20:00"),
      accept: (_r, s) => localParts(s.startsAt).weekday !== 7,
    });
    expect(alt.slots.map((s) => localParts(s.startsAt).date)).toEqual(["2026-11-30"]);
  });

  it("returns nothing for an unknown room", () => {
    expect(
      findAlternatives({
        rooms,
        occupancies: [],
        roomId: "nope",
        slot: slot("2026-11-27", "18:00", "19:00"),
      }),
    ).toEqual({ rooms: [], slots: [] });
  });
});

describe("service blocks", () => {
  const mapping: ServiceRoomBlock[] = [
    {
      id: "m1",
      tenantId: "t",
      locationId: "loc",
      serviceType: "szentmise",
      roomIds: ["r1", "r2"],
      bufferBeforeMin: 30,
      bufferAfterMin: 15,
    },
  ];
  const svc = (id: string, status = "scheduled", serviceType = "szentmise") => ({
    id,
    locationId: "loc",
    serviceType,
    ...slot("2026-11-22", "10:00", "11:00"),
    status,
    title: null,
  });

  it("blocks the mapped rooms with the buffers; skips cancelled and unmapped services", () => {
    const out = serviceOccupancies(
      [svc("a"), svc("b", "cancelled"), svc("c", "scheduled", "igeliturgia")],
      mapping,
    );
    expect(out.map((o) => o.roomId)).toEqual(["r1", "r2"]);
    expect(out[0]).toMatchObject({
      bufferBeforeMin: 30,
      bufferAfterMin: 15,
      source: "service",
      title: "szentmise",
    });
    // The buffer makes a 09:45 user booking clash.
    expect(findClash(out, "r1", slot("2026-11-22", "09:00", "09:45"))?.id).toBe("svc:a:r1");
    expect(findClash(out, "r1", slot("2026-11-22", "09:00", "09:30"))).toBeUndefined();
  });

  it("does not add a service block that is already stored", () => {
    const computed = serviceOccupancies([svc("a")], mapping);
    const stored = [{ ...computed[0]!, id: "bk-1" }];
    expect(mergeOccupancies(stored, computed).map((o) => o.id)).toEqual(["bk-1", "svc:a:r2"]);
  });
});

describe("series", () => {
  it("expands a weekly series with the wall-clock time kept across DST", () => {
    const occs = expandWeekly({
      from: "2026-10-20",
      until: "2026-11-10",
      weekdays: [2],
      startTime: "18:00",
      endTime: "19:30",
      today: "2026-10-19",
    });
    expect(occs.map((o) => localParts(o.startsAt).date)).toEqual([
      "2026-10-20",
      "2026-10-27",
      "2026-11-03",
      "2026-11-10",
    ]);
    expect(occs.every((o) => localParts(o.startsAt).time === "18:00")).toBe(true);
    expect(occs[0]!.startsAt).toBe("2026-10-20T16:00:00.000Z");
    expect(occs[3]!.startsAt).toBe("2026-11-10T17:00:00.000Z");
  });

  it("expands 12 months ahead and never further", () => {
    const occs = expandWeekly({
      from: "2026-11-24",
      until: "2030-01-01",
      weekdays: [2],
      startTime: "18:00",
      endTime: "19:00",
      today: "2026-11-19",
    });
    expect(occs).toHaveLength(52);
    expect(localParts(occs.at(-1)!.startsAt).date <= seriesHorizon("2026-11-19")).toBe(true);
  });

  it("builds the rule and the conflict summary", () => {
    expect(weeklyRule([3, 1, 3], "2027-11-19")).toBe("FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20271119");
    expect(conflictSummary(52, 3)).toEqual({ total: 52, conflicting: 3, free: 49 });
  });

  const members = [
    { id: "a", seriesId: "s", startsAt: "2026-11-03T17:00:00Z" },
    { id: "b", seriesId: "s", startsAt: "2026-11-10T17:00:00Z" },
    { id: "c", seriesId: "s", startsAt: "2026-11-17T17:00:00Z" },
    { id: "d", seriesId: "other", startsAt: "2026-11-10T17:00:00Z" },
    { id: "e", seriesId: null, startsAt: "2026-11-10T17:00:00Z" },
  ];
  it("selects this / this and following / all", () => {
    const b = members[1]!;
    expect(scopeTargets(members, b, "this").map((x) => x.id)).toEqual(["b"]);
    expect(scopeTargets(members, b, "following").map((x) => x.id)).toEqual(["b", "c"]);
    expect(scopeTargets(members, b, "all").map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(scopeTargets(members, members[4]!, "all").map((x) => x.id)).toEqual(["e"]);
  });

  it("retimes keeping or shifting the date", () => {
    const moved = retime(
      { startsAt: "2026-11-10T17:00:00Z" },
      { deltaDays: 1, startTime: "17:00", endTime: "18:30" },
    );
    expect(localParts(moved.startsAt)).toMatchObject({ date: "2026-11-11", time: "17:00" });
    expect(localParts(moved.endsAt).time).toBe("18:30");
  });
});
