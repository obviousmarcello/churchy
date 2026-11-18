/**
 * Room & resource booking (SDD §23). Double bookings are impossible by construction: the
 * exclusion constraint `bookings_no_overlap` on `(room_id, blocked_period)` for pending/approved
 * rows is created in SQL (migration 0002) because Drizzle cannot express `EXCLUDE` (NFR-15,
 * ADR-10).
 */
import type { Accessibility, ApprovalPolicy, BookingRules } from "@churchy/contracts";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import {
  emptyArray,
  huText,
  idColumn,
  sameTenantFk,
  tenantIndexes,
  timestamptz,
  tstzrange,
} from "./columns";
import { bookingSource, bookingStatus, roomKind } from "./enums";
import { events, people, teams } from "./people";
import { tenantId } from "./platform";
import { locations, serviceOccurrences } from "./website";

export const rooms = pgTable(
  "rooms",
  {
    id: idColumn(),
    tenantId: tenantId(),
    locationId: uuid().notNull(),
    name: huText().notNull(),
    kind: roomKind().notNull().default("room"),
    capacity: integer(),
    features: text().array().notNull().default(emptyArray),
    /** SDD `photos` */
    photoMediaIds: uuid().array().notNull().default(emptyArray),
    accessibility: jsonb().$type<Accessibility>().notNull(),
    managerPersonIds: uuid().array().notNull().default(emptyArray),
    approvalPolicy: jsonb().$type<ApprovalPolicy>().notNull(),
    rules: jsonb().$type<BookingRules>().notNull(),
    active: boolean().notNull().default(true),
  },
  (t) => [
    ...tenantIndexes("rooms", t),
    index("rooms_location_id_idx").on(t.locationId),
    sameTenantFk("rooms_location_id_fkey", t.tenantId, t.locationId, locations),
    check("rooms_capacity_check", sql`${t.capacity} is null or ${t.capacity} > 0`),
  ],
).enableRLS();

/** "(location, service_type) → rooms" config of §23.4, stored as rows (contract deviation 13). */
export const serviceRoomBlocks = pgTable(
  "service_room_blocks",
  {
    id: idColumn(),
    tenantId: tenantId(),
    locationId: uuid().notNull(),
    serviceType: text().notNull(),
    roomIds: uuid().array().notNull(),
    bufferBeforeMin: integer().notNull().default(0),
    bufferAfterMin: integer().notNull().default(0),
  },
  (t) => [
    ...tenantIndexes("service_room_blocks", t),
    sameTenantFk(
      "service_room_blocks_location_id_fkey",
      t.tenantId,
      t.locationId,
      locations,
      "cascade",
    ),
    check("service_room_blocks_rooms_check", sql`cardinality(${t.roomIds}) > 0`),
    check(
      "service_room_blocks_buffers_check",
      sql`${t.bufferBeforeMin} >= 0 and ${t.bufferAfterMin} >= 0`,
    ),
  ],
).enableRLS();

export const bookingSeries = pgTable(
  "booking_series",
  {
    id: idColumn(),
    tenantId: tenantId(),
    roomId: uuid().notNull(),
    rrule: text().notNull(),
    dtstart: timestamptz().notNull(),
    durationMin: integer().notNull(),
    title: huText().notNull(),
    purpose: text(),
    teamId: uuid(),
    requestedByPersonId: uuid(),
  },
  (t) => [
    ...tenantIndexes("booking_series", t),
    sameTenantFk("booking_series_room_id_fkey", t.tenantId, t.roomId, rooms, "cascade"),
    sameTenantFk("booking_series_team_id_fkey", t.tenantId, t.teamId, teams),
    sameTenantFk(
      "booking_series_requested_by_person_id_fkey",
      t.tenantId,
      t.requestedByPersonId,
      people,
    ),
    check("booking_series_duration_check", sql`${t.durationMin} > 0`),
  ],
).enableRLS();

/** SDD `period tstzrange` → `starts_at`/`ends_at` (half-open, contract deviation 1). */
export const bookings = pgTable(
  "bookings",
  {
    id: idColumn(),
    tenantId: tenantId(),
    roomId: uuid().notNull(),
    startsAt: timestamptz().notNull(),
    endsAt: timestamptz().notNull(),
    bufferBeforeMin: integer().notNull().default(0),
    bufferAfterMin: integer().notNull().default(0),
    /** `[starts_at - buffer_before, ends_at + buffer_after)` — what the exclusion constraint checks. */
    blockedPeriod: tstzrange()
      .notNull()
      .generatedAlwaysAs(
        sql`public.booking_blocked_period(starts_at, ends_at, buffer_before_min, buffer_after_min)`,
      ),
    status: bookingStatus().notNull().default("pending"),
    seriesId: uuid(),
    eventId: uuid(),
    serviceOccurrenceId: uuid(),
    teamId: uuid(),
    title: huText().notNull(),
    purpose: text(),
    attendees: integer(),
    setupNotes: text(),
    requestedByPersonId: uuid(),
    decidedByPersonId: uuid(),
    decidedAt: timestamptz(),
    holdExpiresAt: timestamptz(),
    source: bookingSource().notNull().default("user"),
    createdAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    ...tenantIndexes("bookings", t),
    index("bookings_room_id_starts_at_idx").on(t.roomId, t.startsAt),
    index("bookings_tenant_id_starts_at_idx").on(t.tenantId, t.startsAt),
    sameTenantFk("bookings_room_id_fkey", t.tenantId, t.roomId, rooms, "cascade"),
    sameTenantFk("bookings_series_id_fkey", t.tenantId, t.seriesId, bookingSeries),
    sameTenantFk("bookings_event_id_fkey", t.tenantId, t.eventId, events),
    sameTenantFk(
      "bookings_service_occurrence_id_fkey",
      t.tenantId,
      t.serviceOccurrenceId,
      serviceOccurrences,
    ),
    sameTenantFk("bookings_team_id_fkey", t.tenantId, t.teamId, teams),
    sameTenantFk("bookings_requested_by_person_id_fkey", t.tenantId, t.requestedByPersonId, people),
    sameTenantFk("bookings_decided_by_person_id_fkey", t.tenantId, t.decidedByPersonId, people),
    check("bookings_range_check", sql`${t.endsAt} > ${t.startsAt}`),
    check("bookings_buffers_check", sql`${t.bufferBeforeMin} >= 0 and ${t.bufferAfterMin} >= 0`),
    check("bookings_attendees_check", sql`${t.attendees} is null or ${t.attendees} > 0`),
  ],
).enableRLS();

/** Service blocks that clash with an existing user booking (§23.4). */
export const bookingConflicts = pgTable(
  "booking_conflicts",
  {
    tenantId: tenantId(),
    serviceOccurrenceId: uuid().notNull(),
    bookingId: uuid().notNull(),
    detectedAt: timestamptz().notNull().defaultNow(),
    resolvedAt: timestamptz(),
  },
  (t) => [
    primaryKey({ columns: [t.serviceOccurrenceId, t.bookingId] }),
    ...tenantIndexes("booking_conflicts", t),
    sameTenantFk(
      "booking_conflicts_service_occurrence_id_fkey",
      t.tenantId,
      t.serviceOccurrenceId,
      serviceOccurrences,
      "cascade",
    ),
    sameTenantFk("booking_conflicts_booking_id_fkey", t.tenantId, t.bookingId, bookings, "cascade"),
  ],
).enableRLS();
