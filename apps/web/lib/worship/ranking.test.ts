import { describe, expect, it } from "vitest";
import { rankCandidates, type RankInput } from "./ranking";

const base: RankInput = {
  positionId: "pos",
  startsAt: "2026-11-22T09:00:00Z",
  endsAt: "2026-11-22T10:15:00Z",
  date: "2026-11-22",
  members: [
    { id: "a", active: true, positionIds: ["pos"], maxPerMonth: null },
    { id: "b", active: true, positionIds: ["pos"], maxPerMonth: null },
    { id: "c", active: false, positionIds: ["pos"], maxPerMonth: null },
    { id: "d", active: true, positionIds: ["other"], maxPerMonth: null },
    { id: "e", active: true, positionIds: ["pos"], maxPerMonth: 1 },
  ],
  absences: [],
  assignments: [],
};

describe("rankCandidates", () => {
  it("drops inactive people and people without the position", () => {
    expect(rankCandidates(base).map((c) => c.personId)).toEqual(["a", "b", "e"]);
  });

  it("drops absent and overlapping people", () => {
    const out = rankCandidates({
      ...base,
      absences: [{ personId: "a", startDate: "2026-11-20", endDate: "2026-11-23" }],
      assignments: [
        { personId: "b", startsAt: "2026-11-22T09:30:00Z", endsAt: "2026-11-22T11:00:00Z" },
      ],
    });
    expect(out.map((c) => c.personId)).toEqual(["e"]);
  });

  it("prefers those who served less in the last 8 weeks, with reasons", () => {
    const out = rankCandidates({
      ...base,
      assignments: [
        { personId: "a", startsAt: "2026-11-15T09:00:00Z", endsAt: "2026-11-15T10:00:00Z" },
        { personId: "a", startsAt: "2026-11-08T09:00:00Z", endsAt: "2026-11-08T10:00:00Z" },
        { personId: "b", startsAt: "2026-11-01T09:00:00Z", endsAt: "2026-11-01T10:00:00Z" },
      ],
    });
    expect(out.map((c) => c.personId)).toEqual(["e", "b", "a"]);
    expect(out[0]!.reasons[0]).toEqual({ kind: "notServed", weeks: 8 });
    expect(out[2]!.reasons[0]).toEqual({ kind: "servedRecently", count: 2 });
  });

  it("puts people over their monthly maximum last", () => {
    const out = rankCandidates({
      ...base,
      assignments: [
        { personId: "e", startsAt: "2026-11-01T09:00:00Z", endsAt: "2026-11-01T10:00:00Z" },
        { personId: "a", startsAt: "2026-11-08T09:00:00Z", endsAt: "2026-11-08T10:00:00Z" },
      ],
    });
    expect(out.at(-1)).toMatchObject({ personId: "e" });
    expect(out.at(-1)!.reasons).toContainEqual({ kind: "overMonthlyMax" });
  });
});
