import type { Booking, Location, Room } from "@churchy/contracts";
import { mergeOccupancies, serviceOccupancies, type Occupancy } from "@churchy/booking";
import { formatPersonName } from "@churchy/hu";
import { can } from "@churchy/policy";
import { resolve } from "@churchy/schedule";
import { scheduleInput } from "@/lib/service-schedule/view";
import type { WorkspaceEnv } from "@/server/workspace";

/**
 * Server helpers of room booking (D-60, D-61). Everything is read through the repository
 * interfaces with the request's tenant ctx; what the actor may do is decided by `can()` with the
 * room's own booking policy, never by role checks.
 */

export interface RoomView {
  readonly room: Room;
  readonly locationName: string;
  readonly managers: readonly string[];
  /** `can("room.book")` with the room's `whoCanRequest`. */
  readonly canBook: boolean;
  /** `can("booking.approve")` for this room. */
  readonly canApprove: boolean;
}

/** `can("room.book")` resource of a room. */
export function bookResource(tenantId: string, room: Room) {
  return { tenantId, roomId: room.id, whoCanRequest: room.rules.whoCanRequest };
}

/** The active rooms with the actor's capabilities, by Hungarian collation of the name. */
export async function loadRoomViews(
  env: WorkspaceEnv,
  options: { includeInactive?: boolean } = {},
): Promise<RoomView[]> {
  const { repos, ctx, actor, tenantId } = env;
  const [rooms, locations, people] = await Promise.all([
    repos.rooms.list(ctx, options.includeInactive ? {} : { activeOnly: true }),
    repos.locations.list(ctx),
    repos.people.list(ctx),
  ]);
  const locationNames = new Map(locations.map((l: Location) => [l.id, l.name]));
  const personNames = new Map(
    people.map((p) => [
      p.id,
      formatPersonName({ familyName: p.familyName, givenName: p.givenName }),
    ]),
  );
  return rooms.map((room) => ({
    room,
    locationName: locationNames.get(room.locationId) ?? "",
    managers: room.managerPersonIds.map((id) => personNames.get(id) ?? "").filter((n) => n !== ""),
    canBook: can(actor, "room.book", bookResource(tenantId, room)),
    canApprove: can(actor, "booking.approve", { tenantId, roomId: room.id }),
  }));
}

/**
 * Everything that occupies rooms between the Budapest dates `from` and `to` (inclusive): stored
 * pending/approved bookings plus the service blocks the schedule engine produces for the window
 * (SDD §23.4), so a schedule change shows up at once and blocks new bookings.
 */
export async function loadOccupancy(
  env: WorkspaceEnv,
  from: string,
  to: string,
): Promise<{ occupancies: Occupancy[]; bookings: Booking[] }> {
  const { repos, ctx } = env;
  const window = { from: `${from}T00:00:00+01:00`, to: `${to}T23:59:59+01:00` };
  // Widen by a day so zone offsets never cut a booking off.
  const wide = {
    from: new Date(Date.parse(window.from) - 86_400_000).toISOString(),
    to: new Date(Date.parse(window.to) + 86_400_000).toISOString(),
  };
  const [bookings, mappings, locations, data] = await Promise.all([
    repos.bookings.list(ctx, { ...wide, statuses: ["pending", "approved"] }),
    repos.rooms.listServiceBlocks(ctx),
    repos.locations.list(ctx),
    repos.schedule.getScheduleData(ctx),
  ]);
  const services = resolve(scheduleInput({ locations, data }), from, to);
  const computed = serviceOccupancies(services, mappings);
  return { bookings, occupancies: mergeOccupancies(bookings, computed) };
}
