import { describe, expect, it } from "vitest";
import { conflictingSlots, slotInPeriod, slotsOverlap, substituteCandidates } from "./conflicts";

const slot = (id: string, personId: string, startsAt: string, endsAt: string) => ({
  id,
  personId,
  startsAt,
  endsAt,
});
const sunday = slot("a1", "p1", "2026-11-22T08:00:00Z", "2026-11-22T09:30:00Z");

describe("absence conflicts", () => {
  it("finds a slot inside the absence period (Budapest dates)", () => {
    expect(slotInPeriod(sunday, { startDate: "2026-11-20", endDate: "2026-11-23" })).toBe(true);
    expect(slotInPeriod(sunday, { startDate: "2026-11-23", endDate: "2026-11-25" })).toBe(false);
    // 23:30 UTC on Saturday is already Sunday in Budapest.
    const late = slot("a2", "p1", "2026-11-21T23:30:00Z", "2026-11-22T00:30:00Z");
    expect(slotInPeriod(late, { startDate: "2026-11-22", endDate: "2026-11-22" })).toBe(true);
  });

  it("lists only the slots of the absent person", () => {
    const other = slot("a3", "p2", sunday.startsAt, sunday.endsAt);
    const absences = [{ personId: "p1", startDate: "2026-11-22", endDate: "2026-11-22" }];
    expect(conflictingSlots([sunday, other], absences).map((s) => s.id)).toEqual(["a1"]);
  });

  it("detects overlapping slots", () => {
    expect(
      slotsOverlap(sunday, slot("x", "p2", "2026-11-22T09:00:00Z", "2026-11-22T10:00:00Z")),
    ).toBe(true);
    expect(
      slotsOverlap(sunday, slot("x", "p2", "2026-11-22T09:30:00Z", "2026-11-22T10:00:00Z")),
    ).toBe(false);
  });

  it("suggests members who are free, present and not the absent person", () => {
    const absences = [
      { personId: "p1", startDate: "2026-11-22", endDate: "2026-11-22" },
      { personId: "p3", startDate: "2026-11-20", endDate: "2026-11-23" },
    ];
    const busy = slot("b", "p4", "2026-11-22T08:30:00Z", "2026-11-22T10:00:00Z");
    expect(substituteCandidates(sunday, ["p1", "p2", "p3", "p4", "p5"], absences, [busy])).toEqual([
      "p2",
      "p5",
    ]);
  });
});
