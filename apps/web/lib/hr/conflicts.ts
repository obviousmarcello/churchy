import { toIsoDateString } from "@churchy/hu";

/** An absence period (inclusive civil dates). */
export interface Period {
  readonly startDate: string;
  readonly endDate: string;
}

/** An assignment as far as conflicts go. */
export interface Slot {
  readonly id: string;
  readonly personId: string;
  readonly startsAt: string;
  readonly endsAt: string;
}

/** Whether the slot happens (in Europe/Budapest) on a day of the absence. */
export function slotInPeriod(slot: Pick<Slot, "startsAt" | "endsAt">, period: Period): boolean {
  const day = toIsoDateString(slot.startsAt);
  const lastDay = toIsoDateString(slot.endsAt);
  return day <= period.endDate && lastDay >= period.startDate;
}

/** Whether two slots overlap in time. */
export const slotsOverlap = (a: Slot, b: Slot): boolean =>
  Date.parse(a.startsAt) < Date.parse(b.endsAt) && Date.parse(b.startsAt) < Date.parse(a.endsAt);

/** Slots of people who are absent on the slot's day. */
export function conflictingSlots<T extends Slot>(
  slots: readonly T[],
  absences: readonly (Period & { personId: string })[],
): T[] {
  return slots.filter((s) => absences.some((a) => a.personId === s.personId && slotInPeriod(s, a)));
}

/**
 * Substitute candidates for `slot`: team members who are not the absent person, not absent on
 * that day and not assigned at an overlapping time. Order is kept.
 */
export function substituteCandidates(
  slot: Slot,
  memberIds: readonly string[],
  absences: readonly (Period & { personId: string })[],
  otherSlots: readonly Slot[],
): string[] {
  return memberIds.filter(
    (id) =>
      id !== slot.personId &&
      !absences.some((a) => a.personId === id && slotInPeriod(slot, a)) &&
      !otherSlots.some((o) => o.personId === id && slotsOverlap(o, slot)),
  );
}
