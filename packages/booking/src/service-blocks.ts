import type { ServiceRoomBlock } from "@churchy/contracts";
import type { Occupancy } from "./conflicts";

/** The fields of a resolved service (`@churchy/schedule`) that blocking needs. */
export interface BlockableService {
  readonly id: string;
  readonly locationId: string;
  readonly serviceType: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly status: string;
  readonly title: string | null;
}

/**
 * Occupancies the schedule creates (SDD §23.4): every non-cancelled service blocks the rooms
 * mapped to its (location, service type), with the mapping's buffers. Computed straight from the
 * schedule engine, so a schedule change is reflected at once.
 */
export function serviceOccupancies(
  services: readonly BlockableService[],
  mappings: readonly ServiceRoomBlock[],
): Occupancy[] {
  const out: Occupancy[] = [];
  for (const s of services) {
    if (s.status === "cancelled") continue;
    for (const m of mappings) {
      if (m.locationId !== s.locationId || m.serviceType !== s.serviceType) continue;
      for (const roomId of m.roomIds) {
        out.push({
          id: `svc:${s.id}:${roomId}`,
          roomId,
          startsAt: s.startsAt,
          endsAt: s.endsAt,
          bufferBeforeMin: m.bufferBeforeMin,
          bufferAfterMin: m.bufferAfterMin,
          status: "approved",
          source: "service",
          title: s.title ?? s.serviceType,
        });
      }
    }
  }
  return out;
}

/**
 * Merges stored bookings with computed service blocks: a service block that is already stored
 * (same room, same start) is not added twice.
 */
export function mergeOccupancies(
  stored: readonly Occupancy[],
  computed: readonly Occupancy[],
): Occupancy[] {
  const known = new Set(
    stored
      .filter((o) => o.source === "service")
      .map((o) => `${o.roomId}|${Date.parse(o.startsAt)}`),
  );
  return [
    ...stored,
    ...computed.filter((o) => !known.has(`${o.roomId}|${Date.parse(o.startsAt)}`)),
  ];
}
