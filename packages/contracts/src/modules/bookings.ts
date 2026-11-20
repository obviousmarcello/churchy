import { z } from "zod";
import type { Ctx } from "../ctx";
import { IdSchema, IsoDateTimeSchema, TextSchema } from "../primitives";

export const BookingStatusSchema = z.enum(["pending", "approved", "rejected", "cancelled"]);
export type BookingStatus = z.infer<typeof BookingStatusSchema>;

/** Statuses that occupy the room (the DB exclusion constraint's WHERE clause, SDD §23.1). */
export const BLOCKING_BOOKING_STATUSES: readonly BookingStatus[] = ["pending", "approved"];

/**
 * `bookings` (SDD §23.1). `tstzrange period` is modelled as `startsAt`/`endsAt` (half-open);
 * the blocked period is `[startsAt − bufferBeforeMin, endsAt + bufferAfterMin)`.
 */
export const BookingSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  roomId: IdSchema,
  startsAt: IsoDateTimeSchema,
  endsAt: IsoDateTimeSchema,
  bufferBeforeMin: z.number().int().nonnegative(),
  bufferAfterMin: z.number().int().nonnegative(),
  status: BookingStatusSchema,
  seriesId: IdSchema.nullable(),
  eventId: IdSchema.nullable(),
  serviceOccurrenceId: IdSchema.nullable(),
  teamId: IdSchema.nullable(),
  title: TextSchema,
  purpose: z.string().max(1000).nullable(),
  attendees: z.number().int().positive().nullable(),
  setupNotes: z.string().max(1000).nullable(),
  requestedByPersonId: IdSchema.nullable(),
  decidedByPersonId: IdSchema.nullable(),
  decidedAt: IsoDateTimeSchema.nullable(),
  holdExpiresAt: IsoDateTimeSchema.nullable(),
  source: z.enum(["user", "service", "external"]),
  createdAt: IsoDateTimeSchema,
});
export type Booking = z.infer<typeof BookingSchema>;

const BookingInputBase = z.object({
  roomId: IdSchema,
  startsAt: IsoDateTimeSchema,
  endsAt: IsoDateTimeSchema,
  bufferBeforeMin: z.number().int().nonnegative().default(0),
  bufferAfterMin: z.number().int().nonnegative().default(0),
  /** Decided by the caller from the room's approval policy (`packages/booking`). */
  status: z.enum(["pending", "approved"]).default("pending"),
  eventId: IdSchema.nullable().default(null),
  serviceOccurrenceId: IdSchema.nullable().default(null),
  teamId: IdSchema.nullable().default(null),
  title: TextSchema,
  purpose: z.string().max(1000).nullable().default(null),
  attendees: z.number().int().positive().nullable().default(null),
  setupNotes: z.string().max(1000).nullable().default(null),
  requestedByPersonId: IdSchema.nullable().default(null),
  holdExpiresAt: IsoDateTimeSchema.nullable().default(null),
  source: z.enum(["user", "service", "external"]).default("user"),
});

export const BookingInputSchema = BookingInputBase.refine(
  (b) => Date.parse(b.endsAt) > Date.parse(b.startsAt),
  { message: "endsAt must be after startsAt", path: ["endsAt"] },
);
export type BookingInput = z.input<typeof BookingInputSchema>;

/** `booking_series` (SDD §23.1). */
export const BookingSeriesSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  roomId: IdSchema,
  rrule: z.string().min(1).max(500),
  dtstart: IsoDateTimeSchema,
  durationMin: z.number().int().positive(),
  title: TextSchema,
  purpose: z.string().max(1000).nullable(),
  teamId: IdSchema.nullable(),
  requestedByPersonId: IdSchema.nullable(),
});
export type BookingSeries = z.infer<typeof BookingSeriesSchema>;

export const BookingSeriesInputSchema = BookingSeriesSchema.omit({
  id: true,
  tenantId: true,
}).extend({
  purpose: z.string().max(1000).nullable().default(null),
  teamId: IdSchema.nullable().default(null),
  requestedByPersonId: IdSchema.nullable().default(null),
  bufferBeforeMin: z.number().int().nonnegative().default(0),
  bufferAfterMin: z.number().int().nonnegative().default(0),
  status: z.enum(["pending", "approved"]).default("pending"),
});
export type BookingSeriesInput = z.input<typeof BookingSeriesInputSchema>;

/** `booking_conflicts` (SDD §23.4) — a service block clashing with a user booking. */
export const BookingConflictSchema = z.object({
  tenantId: IdSchema,
  serviceOccurrenceId: IdSchema,
  bookingId: IdSchema,
  detectedAt: IsoDateTimeSchema,
  resolvedAt: IsoDateTimeSchema.nullable(),
});
export type BookingConflict = z.infer<typeof BookingConflictSchema>;

/** Details carried by `ContractError("CONFLICT")` on an overlapping booking. */
export type BookingConflictDetails = { conflictingBookingId: string };

/** Blocked interval in epoch ms (helper shared by adapters and `packages/booking`). */
export function blockedInterval(b: {
  startsAt: string;
  endsAt: string;
  bufferBeforeMin: number;
  bufferAfterMin: number;
}): [number, number] {
  return [
    Date.parse(b.startsAt) - b.bufferBeforeMin * 60_000,
    Date.parse(b.endsAt) + b.bufferAfterMin * 60_000,
  ];
}

/** True when two bookings of the same room would violate the exclusion constraint. */
export function bookingsOverlap(
  a: Parameters<typeof blockedInterval>[0],
  b: Parameters<typeof blockedInterval>[0],
): boolean {
  const [a0, a1] = blockedInterval(a);
  const [b0, b1] = blockedInterval(b);
  return a0 < b1 && b0 < a1;
}

/**
 * Module `bookings` — conflict-free room bookings (NFR-15). Any create/move that overlaps a
 * `pending`/`approved` booking of the same room (buffers included) throws
 * `ContractError("CONFLICT", { details: { conflictingBookingId } })`. Internal data.
 */
export interface BookingRepo {
  /** Bookings overlapping [from, to], optionally by rooms/statuses, by `startsAt`. */
  list(
    ctx: Ctx,
    query: { from: string; to: string; roomIds?: string[]; statuses?: BookingStatus[] },
  ): Promise<Booking[]>;
  /** One booking, or null. */
  get(ctx: Ctx, id: string): Promise<Booking | null>;
  /** Tenant ctx: create. NOT_FOUND for a room outside the tenant; CONFLICT on overlap. */
  create(ctx: Ctx, input: BookingInput): Promise<Booking>;
  /** Tenant ctx: move/edit a booking (re-checks conflicts, ignoring itself). */
  update(
    ctx: Ctx,
    id: string,
    patch: Partial<Omit<BookingInput, "roomId" | "source">>,
  ): Promise<Booking>;
  /** Tenant ctx: approve or reject a pending booking; decider = ctx actor's person. */
  decide(ctx: Ctx, id: string, decision: "approved" | "rejected"): Promise<Booking>;
  /** Tenant ctx: cancel (frees the slot). */
  cancel(ctx: Ctx, id: string): Promise<Booking>;
  /**
   * Tenant ctx: create a series and its expanded occurrences (expansion by `packages/booking`).
   * Conflicting occurrences are skipped and reported when `skipConflicts`; otherwise nothing is
   * written and CONFLICT is thrown.
   */
  createSeries(
    ctx: Ctx,
    input: BookingSeriesInput,
    occurrences: { startsAt: string; endsAt: string }[],
    options: { skipConflicts: boolean },
  ): Promise<{
    series: BookingSeries;
    created: Booking[];
    conflicts: { startsAt: string; conflictingBookingId: string }[];
  }>;
  /** Tenant ctx: cancel pending bookings whose `holdExpiresAt` < now; returns the count. */
  expireHolds(ctx: Ctx, now: string): Promise<number>;
  /** Unresolved service-block clashes (SDD §23.4). */
  listServiceConflicts(ctx: Ctx): Promise<BookingConflict[]>;
}
