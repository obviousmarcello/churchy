/** Mock repositories: rooms, bookings. */
import type {
  Booking,
  BookingRepo,
  BookingSeries,
  Room,
  RoomRepo,
  ServiceRoomBlock,
} from "@churchy/contracts";
import {
  BLOCKING_BOOKING_STATUSES,
  BookingInputSchema,
  BookingSeriesInputSchema,
  BookingSchema,
  ContractError,
  IsoDateTimeSchema,
  RoomInputSchema,
  ServiceRoomBlockInputSchema,
  bookingsOverlap,
  conflict,
  huCollator,
  parseInput,
  validationError,
} from "@churchy/contracts";
import type { MockStore } from "../store";
import type { RepoDeps } from "./helpers";
import { instant, own, ownRef, removeWhere, save, send, staffTenant, writeTenant } from "./helpers";

// ---------------------------------------------------------------------------------------------
// rooms
// ---------------------------------------------------------------------------------------------

export function mockRooms({ store }: RepoDeps): RoomRepo {
  const d = () => store.data;
  return {
    async list(ctx, filter = {}) {
      const tenantId = staffTenant(ctx);
      return d()
        .rooms.filter(
          (r) =>
            r.tenantId === tenantId &&
            (filter.locationId === undefined || r.locationId === filter.locationId) &&
            (!filter.activeOnly || r.active),
        )
        .sort((a, b) => huCollator.compare(a.name, b.name));
    },
    async get(ctx, id) {
      const tenantId = staffTenant(ctx);
      return d().rooms.find((r) => r.tenantId === tenantId && r.id === id) ?? null;
    },
    async upsert(ctx, input) {
      const tenantId = writeTenant(ctx);
      const { id, ...data } = parseInput(RoomInputSchema, input);
      const existing = id === undefined ? undefined : own(d().rooms, tenantId, id, "Room");
      own(d().locations, tenantId, data.locationId, "Location");
      for (const personId of data.managerPersonIds) own(d().people, tenantId, personId, "Person");
      for (const mediaId of data.photoMediaIds) own(d().media, tenantId, mediaId, "Media");
      const row: Room = { ...data, id: existing?.id ?? store.nextId("room"), tenantId };
      return save(d().rooms, row);
    },
    async delete(ctx, id) {
      const row = own(d().rooms, writeTenant(ctx), id, "Room");
      const now = store.now().getTime();
      const blocking = d().bookings.some(
        (b) =>
          b.roomId === row.id &&
          BLOCKING_BOOKING_STATUSES.includes(b.status) &&
          Date.parse(b.endsAt) > now,
      );
      if (blocking) throw conflict("The room has future bookings; deactivate it instead");
      d().serviceRoomBlocks = d()
        .serviceRoomBlocks.map((b) => ({ ...b, roomIds: b.roomIds.filter((r) => r !== row.id) }))
        .filter((b) => b.roomIds.length > 0);
      removeWhere(d().rooms, (r) => r.id === row.id);
    },
    async listServiceBlocks(ctx) {
      const tenantId = staffTenant(ctx);
      return d().serviceRoomBlocks.filter((b) => b.tenantId === tenantId);
    },
    async upsertServiceBlock(ctx, input) {
      const tenantId = writeTenant(ctx);
      const { id, ...data } = parseInput(ServiceRoomBlockInputSchema, input);
      const existing =
        id === undefined ? undefined : own(d().serviceRoomBlocks, tenantId, id, "ServiceRoomBlock");
      own(d().locations, tenantId, data.locationId, "Location");
      for (const roomId of data.roomIds) own(d().rooms, tenantId, roomId, "Room");
      const row: ServiceRoomBlock = { ...data, id: existing?.id ?? store.nextId("srb"), tenantId };
      return save(d().serviceRoomBlocks, row);
    },
    async deleteServiceBlock(ctx, id) {
      const row = own(d().serviceRoomBlocks, writeTenant(ctx), id, "ServiceRoomBlock");
      removeWhere(d().serviceRoomBlocks, (b) => b.id === row.id);
    },
  };
}

// ---------------------------------------------------------------------------------------------
// bookings
// ---------------------------------------------------------------------------------------------

type Slot = Parameters<typeof bookingsOverlap>[0];

/** The `bookingConflictOnNext` simulation switch (one-shot). */
function simulatedConflict(store: MockStore): void {
  if (store.takeBookingConflict()) {
    throw new ContractError("CONFLICT", "Simulated booking conflict", {
      details: { conflictingBookingId: "simulated", simulated: true },
    });
  }
}

export function mockBookings({ store }: RepoDeps): BookingRepo {
  const d = () => store.data;
  /** First blocking booking of `roomId` overlapping `slot` (buffers included), if any. */
  const clash = (
    roomId: string,
    slot: Slot,
    ignoreId?: string,
    extra: readonly Booking[] = [],
  ): Booking | undefined =>
    [...d().bookings, ...extra].find(
      (b) =>
        b.roomId === roomId &&
        b.id !== ignoreId &&
        BLOCKING_BOOKING_STATUSES.includes(b.status) &&
        bookingsOverlap(b, slot),
    );
  const assertFree = (roomId: string, slot: Slot, ignoreId?: string) => {
    const other = clash(roomId, slot, ignoreId);
    if (other) {
      throw conflict("The room is already booked", { conflictingBookingId: other.id });
    }
  };
  const checkRefs = (
    tenantId: string,
    refs: {
      eventId?: string | null;
      serviceOccurrenceId?: string | null;
      teamId?: string | null;
      requestedByPersonId?: string | null;
    },
  ) => {
    ownRef(d().events, tenantId, refs.eventId, "Event");
    ownRef(d().serviceOccurrences, tenantId, refs.serviceOccurrenceId, "ServiceOccurrence");
    ownRef(d().teams, tenantId, refs.teamId, "Team");
    ownRef(d().people, tenantId, refs.requestedByPersonId, "Person");
  };
  const notifyManagers = (room: Room, booking: Booking) => {
    const params = { bookingId: booking.id, link: `/munkater/termek/foglalasok/${booking.id}` };
    send(
      store,
      room.managerPersonIds.length > 0
        ? room.managerPersonIds.map((personId) => ({
            channel: "email" as const,
            template: "booking.requested" as const,
            recipient: { kind: "person" as const, personId },
            tenantId: booking.tenantId,
            params,
          }))
        : {
            channel: "email",
            template: "booking.requested",
            recipient: { kind: "persona", persona: "roomManagers" },
            tenantId: booking.tenantId,
            params,
          },
    );
  };

  return {
    async list(ctx, query) {
      const tenantId = staffTenant(ctx);
      const from = instant(query.from);
      const to = instant(query.to);
      return d()
        .bookings.filter(
          (b) =>
            b.tenantId === tenantId &&
            (query.roomIds === undefined || query.roomIds.includes(b.roomId)) &&
            (query.statuses === undefined || query.statuses.includes(b.status)) &&
            Date.parse(b.startsAt) <= to &&
            Date.parse(b.endsAt) > from,
        )
        .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
    },
    async get(ctx, id) {
      const tenantId = staffTenant(ctx);
      return d().bookings.find((b) => b.tenantId === tenantId && b.id === id) ?? null;
    },
    async create(ctx, input) {
      const tenantId = writeTenant(ctx);
      const data = parseInput(BookingInputSchema, input);
      const room = own(d().rooms, tenantId, data.roomId, "Room");
      checkRefs(tenantId, data);
      simulatedConflict(store);
      assertFree(room.id, data);
      const booking: Booking = {
        ...data,
        id: store.nextId("booking"),
        tenantId,
        seriesId: null,
        requestedByPersonId: data.requestedByPersonId ?? ctx.actor.personId,
        decidedByPersonId: null,
        decidedAt: null,
        createdAt: store.nowIso(),
      };
      d().bookings.push(booking);
      if (booking.status === "pending") notifyManagers(room, booking);
      return booking;
    },
    async update(ctx, id, patch) {
      const tenantId = writeTenant(ctx);
      const current = own(d().bookings, tenantId, id, "Booking");
      const { roomId: _roomId, source: _source, ...changes } = patch as Record<string, unknown>;
      const data = parseInput(BookingInputSchema, {
        ...current,
        ...Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined)),
        roomId: current.roomId,
        source: current.source,
        status: changes.status ?? (current.status === "approved" ? "approved" : "pending"),
      });
      checkRefs(tenantId, data);
      simulatedConflict(store);
      const next: Booking = {
        ...current,
        ...data,
        status: (changes.status as Booking["status"]) ?? current.status,
      };
      if (BLOCKING_BOOKING_STATUSES.includes(next.status)) assertFree(next.roomId, next, next.id);
      return save(d().bookings, next);
    },
    async decide(ctx, id, decision) {
      const row = own(d().bookings, writeTenant(ctx), id, "Booking");
      const status = parseInput(
        BookingSchema.shape.status.extract(["approved", "rejected"]),
        decision,
      );
      if (row.status !== "pending") throw conflict("Only pending bookings can be decided");
      const decided = save(d().bookings, {
        ...row,
        status,
        decidedByPersonId: ctx.actor.personId,
        decidedAt: store.nowIso(),
        holdExpiresAt: null,
      });
      const recipient = decided.requestedByPersonId
        ? ({ kind: "person", personId: decided.requestedByPersonId } as const)
        : ({ kind: "persona", persona: "requester" } as const);
      const params = {
        bookingId: decided.id,
        decision: status,
        link: `/munkater/termek/foglalasok/${decided.id}`,
      };
      send(store, [
        {
          channel: "email",
          template: "booking.decided",
          recipient,
          tenantId: decided.tenantId,
          params,
        },
        {
          channel: "push",
          template: "booking.decided",
          recipient,
          tenantId: decided.tenantId,
          params,
        },
      ]);
      return decided;
    },
    async cancel(ctx, id) {
      const row = own(d().bookings, writeTenant(ctx), id, "Booking");
      return save(d().bookings, { ...row, status: "cancelled" });
    },
    async createSeries(ctx, input, occurrences, options) {
      const tenantId = writeTenant(ctx);
      const data = parseInput(BookingSeriesInputSchema, input);
      const room = own(d().rooms, tenantId, data.roomId, "Room");
      checkRefs(tenantId, data);
      const slots = occurrences.map((o, index) => {
        const startsAt = parseInput(IsoDateTimeSchema, o.startsAt);
        const endsAt = parseInput(IsoDateTimeSchema, o.endsAt);
        if (Date.parse(endsAt) <= Date.parse(startsAt)) {
          throw validationError([
            { path: ["occurrences", index, "endsAt"], message: "endsAt must be after startsAt" },
          ]);
        }
        return { startsAt, endsAt };
      });
      simulatedConflict(store);
      const series: BookingSeries = {
        id: store.nextId("series"),
        tenantId,
        roomId: room.id,
        rrule: data.rrule,
        dtstart: data.dtstart,
        durationMin: data.durationMin,
        title: data.title,
        purpose: data.purpose,
        teamId: data.teamId,
        requestedByPersonId: data.requestedByPersonId ?? ctx.actor.personId,
      };
      const created: Booking[] = [];
      const conflicts: { startsAt: string; conflictingBookingId: string }[] = [];
      for (const slot of slots) {
        const candidate: Booking = {
          id: store.nextId("booking"),
          tenantId,
          roomId: room.id,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          bufferBeforeMin: data.bufferBeforeMin,
          bufferAfterMin: data.bufferAfterMin,
          status: data.status,
          seriesId: series.id,
          eventId: null,
          serviceOccurrenceId: null,
          teamId: data.teamId,
          title: data.title,
          purpose: data.purpose,
          attendees: null,
          setupNotes: null,
          requestedByPersonId: series.requestedByPersonId,
          decidedByPersonId: null,
          decidedAt: null,
          holdExpiresAt: null,
          source: "user",
          createdAt: store.nowIso(),
        };
        const other = clash(room.id, candidate, undefined, created);
        if (other) conflicts.push({ startsAt: slot.startsAt, conflictingBookingId: other.id });
        else created.push(candidate);
      }
      if (conflicts.length > 0 && !options.skipConflicts) {
        throw conflict("Some occurrences clash with existing bookings", {
          conflictingBookingId: conflicts[0]!.conflictingBookingId,
          conflicts: conflicts.length,
        });
      }
      d().bookingSeries.push(series);
      d().bookings.push(...created);
      const first = created[0];
      if (first && first.status === "pending") notifyManagers(room, first);
      return { series, created, conflicts };
    },
    async expireHolds(ctx, now) {
      const tenantId = writeTenant(ctx);
      const limit = instant(now);
      let count = 0;
      for (const [i, b] of d().bookings.entries()) {
        if (
          b.tenantId === tenantId &&
          b.status === "pending" &&
          b.holdExpiresAt !== null &&
          Date.parse(b.holdExpiresAt) < limit
        ) {
          d().bookings[i] = { ...b, status: "cancelled" };
          count += 1;
        }
      }
      return count;
    },
    async listServiceConflicts(ctx) {
      const tenantId = staffTenant(ctx);
      return d().bookingConflicts.filter((c) => c.tenantId === tenantId && c.resolvedAt === null);
    },
  };
}
