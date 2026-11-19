import type { PlanItem, PlanStatus } from "@churchy/contracts";
import { describe, expect, it } from "vitest";
import {
  autoLockDue,
  diffPlan,
  findTransition,
  moveItem,
  totalMinutes,
  transitionsFrom,
} from "./plan-flow";

const STATUSES: PlanStatus[] = ["draft", "in_review", "approved", "locked"];
const ALLOWED = [
  "draft>in_review",
  "in_review>draft",
  "in_review>approved",
  "draft>approved",
  "approved>locked",
];

const item = (id: string, position: number, keyOverride: string | null = null): PlanItem => ({
  id,
  tenantId: "t",
  planId: "p",
  position,
  type: "song",
  title: id,
  songId: null,
  arrangementId: null,
  keyOverride,
  verses: null,
  durationS: 60,
  responsiblePersonId: null,
  notes: null,
});

describe("plan workflow", () => {
  it.each(STATUSES.flatMap((a) => STATUSES.map((b) => [a, b] as const)))("%s -> %s", (a, b) => {
    expect(findTransition(a, b) !== undefined).toBe(ALLOWED.includes(`${a}>${b}`));
  });

  it("offers people no automatic and no locked transitions", () => {
    expect(transitionsFrom("locked")).toEqual([]);
    expect(transitionsFrom("approved")).toEqual([]);
    expect(transitionsFrom("in_review").map((t) => t.to)).toEqual(["draft", "approved"]);
  });

  it("locks 6 hours after the service", () => {
    const end = "2026-11-22T10:00:00Z";
    expect(autoLockDue("approved", end, new Date("2026-11-22T15:59:00Z"))).toBe(false);
    expect(autoLockDue("approved", end, new Date("2026-11-22T16:00:00Z"))).toBe(true);
    expect(autoLockDue("draft", end, new Date("2026-11-23T16:00:00Z"))).toBe(false);
  });

  it("totals minutes", () => {
    expect(totalMinutes([{ durationS: 200 }, { durationS: null }, { durationS: 400 }])).toBe(10);
  });
});

describe("diffPlan", () => {
  const base = [item("a", 0), item("b", 1), item("c", 2)];
  it("is empty without changes", () => {
    expect(diffPlan(base, base).empty).toBe(true);
  });
  it("lists added, removed, reordered items and key changes", () => {
    const now = [item("c", 0), item("a", 1, "D"), item("n", 2)];
    const d = diffPlan(base, now);
    expect(d.added.map((i) => i.id)).toEqual(["n"]);
    expect(d.removed.map((i) => i.id)).toEqual(["b"]);
    expect(d.moved.map((m) => m.item.id)).toEqual(["c", "a"]);
    expect(d.keyChanges.map((k) => [k.item.id, k.from, k.to])).toEqual([["a", null, "D"]]);
  });
  it("an insert does not count as moving the rest", () => {
    expect(diffPlan(base, [item("n", 0), ...base]).moved).toEqual([]);
  });
});

describe("moveItem", () => {
  it("moves and clamps", () => {
    expect(moveItem([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
    expect(moveItem([1, 2, 3], 2, -4)).toEqual([3, 1, 2]);
    expect(moveItem([1, 2, 3], 5, 0)).toEqual([1, 2, 3]);
  });
});
