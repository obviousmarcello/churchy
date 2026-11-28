import type { PlanItem, PlanStatus } from "@churchy/contracts";

/**
 * Plan workflow (SDD §24.3, D-68): which status changes exist and who may make them, the diff
 * between the approved snapshot and the current items, the duration total and the auto-lock.
 * Pure; who the actor is stays with `can()` (the `who` below names the action to check).
 */

export type PlanTransition = {
  readonly from: PlanStatus;
  readonly to: PlanStatus;
  /** The policy action the actor needs; `system` = automatic, never offered to people. */
  readonly who: "servicePlan.edit" | "servicePlan.approve" | "system";
};

export const PLAN_TRANSITIONS: readonly PlanTransition[] = [
  { from: "draft", to: "in_review", who: "servicePlan.edit" },
  { from: "in_review", to: "draft", who: "servicePlan.approve" },
  { from: "in_review", to: "approved", who: "servicePlan.approve" },
  // Churches without a review step approve straight from the draft.
  { from: "draft", to: "approved", who: "servicePlan.approve" },
  { from: "approved", to: "locked", who: "system" },
];

export function findTransition(from: PlanStatus, to: PlanStatus): PlanTransition | undefined {
  return PLAN_TRANSITIONS.find((t) => t.from === from && t.to === to);
}

/** The transitions people may start from `status` (without the automatic ones). */
export function transitionsFrom(status: PlanStatus): PlanTransition[] {
  return PLAN_TRANSITIONS.filter((t) => t.from === status && t.who !== "system");
}

/** Auto-lock: 6 hours after the end of the service (SDD §24.3). */
export const AUTO_LOCK_HOURS = 6;

export function autoLockDue(status: PlanStatus, serviceEndsAt: string, now: Date): boolean {
  return (
    status === "approved" &&
    now.getTime() >= Date.parse(serviceEndsAt) + AUTO_LOCK_HOURS * 3_600_000
  );
}

/** Sum of the item durations in whole minutes (rounded up per total, not per item). */
export function totalMinutes(items: readonly { durationS: number | null }[]): number {
  const seconds = items.reduce((sum, i) => sum + (i.durationS ?? 0), 0);
  return Math.round(seconds / 60);
}

export interface PlanDiff {
  added: PlanItem[];
  removed: PlanItem[];
  /** Items that stayed but whose position changed. */
  moved: { item: PlanItem; from: number; to: number }[];
  /** Song items whose key override changed. */
  keyChanges: { item: PlanItem; from: string | null; to: string | null }[];
  empty: boolean;
}

/** Added / removed / reordered items and key changes against the approved snapshot (D-68 AC3). */
export function diffPlan(snapshot: readonly PlanItem[], current: readonly PlanItem[]): PlanDiff {
  const before = new Map(snapshot.map((i) => [i.id, i]));
  const after = new Map(current.map((i) => [i.id, i]));
  const added = current.filter((i) => !before.has(i.id));
  const removed = snapshot.filter((i) => !after.has(i.id));
  // Positions among the items that exist in both lists, so an insert does not move everything.
  const keptBefore = snapshot.filter((i) => after.has(i.id)).map((i) => i.id);
  const keptAfter = current.filter((i) => before.has(i.id)).map((i) => i.id);
  const moved = keptAfter.flatMap((id, to) => {
    const from = keptBefore.indexOf(id);
    return from === to ? [] : [{ item: after.get(id)!, from, to }];
  });
  const keyChanges = current.flatMap((item) => {
    const old = before.get(item.id);
    return old && old.keyOverride !== item.keyOverride
      ? [{ item, from: old.keyOverride, to: item.keyOverride }]
      : [];
  });
  return {
    added,
    removed,
    moved,
    keyChanges,
    empty: !added.length && !removed.length && !moved.length && !keyChanges.length,
  };
}

/** Moves `from` to index `to` (clamped); returns a new array. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (from < 0 || from >= next.length) return next;
  const target = Math.max(0, Math.min(next.length - 1, to));
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item!);
  return next;
}
