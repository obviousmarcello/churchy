import { bookingsOverlap, type BookingStatus, type Room } from "@churchy/contracts";
import { addDays } from "@churchy/hu";
import { localParts, localToInstant } from "./time";

/** Anything that occupies a room: a booking row or a computed service block. */
export interface Occupancy {
  readonly id: string;
  readonly roomId: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly bufferBeforeMin: number;
  readonly bufferAfterMin: number;
  readonly status: BookingStatus;
  readonly source: "user" | "service" | "external";
  readonly title: string;
}

export interface Slot {
  readonly startsAt: string;
  readonly endsAt: string;
  readonly bufferBeforeMin?: number;
  readonly bufferAfterMin?: number;
}

const blocking = (o: Occupancy): boolean => o.status === "pending" || o.status === "approved";

const withBuffers = (s: Slot) => ({
  startsAt: s.startsAt,
  endsAt: s.endsAt,
  bufferBeforeMin: s.bufferBeforeMin ?? 0,
  bufferAfterMin: s.bufferAfterMin ?? 0,
});

/** The first occupancy of `roomId` that clashes with `slot` (buffers included), or undefined. */
export function findClash(
  occupancies: readonly Occupancy[],
  roomId: string,
  slot: Slot,
  ignoreId?: string,
): Occupancy | undefined {
  const wanted = withBuffers(slot);
  return occupancies.find(
    (o) => o.roomId === roomId && o.id !== ignoreId && blocking(o) && bookingsOverlap(o, wanted),
  );
}

export interface FreeSlot {
  readonly roomId: string;
  readonly startsAt: string;
  readonly endsAt: string;
}

export interface Alternatives {
  /** Rooms of the same place that are free in the requested slot. */
  readonly rooms: readonly Room[];
  /** Nearest free slots of the requested room (±3 hours, then the next 3 days). */
  readonly slots: readonly FreeSlot[];
}

export interface AlternativesInput {
  readonly rooms: readonly Room[];
  readonly occupancies: readonly Occupancy[];
  readonly roomId: string;
  readonly slot: Slot;
  readonly attendees?: number | null;
  /** Features the requested room must offer; other rooms must offer them too. */
  readonly features?: readonly string[];
  /** Further filter, e.g. the room rules (bookable hours, notice …) of the candidate. */
  readonly accept?: (room: Room, slot: { startsAt: string; endsAt: string }) => boolean;
  readonly limit?: number;
}

const STEP_MIN = 30;

/**
 * Alternatives to a clashing request (SDD §23.1): other active rooms in the same location with
 * enough capacity and the needed features that are free in that slot, and the same room's nearest
 * free slots — shifted by up to ±3 hours, then the same time on the next 3 days.
 */
export function findAlternatives(input: AlternativesInput): Alternatives {
  const { rooms, occupancies, roomId, slot, accept } = input;
  const limit = input.limit ?? 3;
  const room = rooms.find((r) => r.id === roomId);
  if (!room) return { rooms: [], slots: [] };
  const features = input.features ?? [];
  const times = { startsAt: slot.startsAt, endsAt: slot.endsAt };

  const otherRooms = rooms
    .filter(
      (r) =>
        r.id !== roomId &&
        r.active &&
        r.locationId === room.locationId &&
        (input.attendees == null || r.capacity === null || r.capacity >= input.attendees) &&
        features.every((f) => r.features.includes(f)) &&
        findClash(occupancies, r.id, slot) === undefined &&
        (accept?.(r, times) ?? true),
    )
    .slice(0, limit);

  const duration = Date.parse(slot.endsAt) - Date.parse(slot.startsAt);
  const start = Date.parse(slot.startsAt);
  const candidates: { startsAt: string; endsAt: string }[] = [];
  for (let shift = STEP_MIN; shift <= 180; shift += STEP_MIN) {
    for (const sign of [-1, 1]) {
      const s = start + sign * shift * 60_000;
      candidates.push({
        startsAt: new Date(s).toISOString(),
        endsAt: new Date(s + duration).toISOString(),
      });
    }
  }
  const first = localParts(start);
  for (let d = 1; d <= 3; d += 1) {
    const s = Date.parse(localToInstant(addDays(first.date, d), first.time));
    candidates.push({
      startsAt: new Date(s).toISOString(),
      endsAt: new Date(s + duration).toISOString(),
    });
  }
  const slots: FreeSlot[] = [];
  for (const c of candidates) {
    if (slots.length >= limit) break;
    const candidate = {
      ...c,
      bufferBeforeMin: slot.bufferBeforeMin,
      bufferAfterMin: slot.bufferAfterMin,
    };
    if (findClash(occupancies, roomId, candidate) !== undefined) continue;
    if (accept && !accept(room, c)) continue;
    slots.push({ roomId, ...c });
  }
  return { rooms: otherRooms, slots };
}
