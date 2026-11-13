import { z } from "zod";
import type { Ctx } from "../ctx";
import {
  HexColorSchema,
  IdSchema,
  IsoDateSchema,
  IsoDateTimeSchema,
  RichTextSchema,
  SlugSchema,
  TextSchema,
  TimestampsShape,
} from "../primitives";
import { TenantRoleSchema, WorkspaceRoleSchema } from "../roles";

/** Event visibility (SDD ADR-9, §22.1): only `public` + `published` reaches the website. */
export const EventVisibilitySchema = z.enum(["private", "team", "staff", "public"]);
export type EventVisibility = z.infer<typeof EventVisibilitySchema>;

export const EventStatusSchema = z.enum(["draft", "published", "cancelled"]);
export type EventStatus = z.infer<typeof EventStatusSchema>;

/** `calendars` (SDD §22.1). */
export const CalendarSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  name: TextSchema,
  color: HexColorSchema,
  kind: z.enum(["shared", "team", "personal", "absence"]),
  ownerPersonId: IdSchema.nullable(),
  teamId: IdSchema.nullable(),
  defaultVisibility: EventVisibilitySchema,
  /** Who may edit events in this calendar, in addition to `can()` defaults. */
  editors: z.object({
    roles: z.array(z.union([TenantRoleSchema, WorkspaceRoleSchema])),
    teamIds: z.array(IdSchema),
  }),
});
export type Calendar = z.infer<typeof CalendarSchema>;

export const CalendarInputSchema = CalendarSchema.omit({ tenantId: true }).extend({
  id: IdSchema.optional(),
  ownerPersonId: IdSchema.nullable().default(null),
  teamId: IdSchema.nullable().default(null),
  defaultVisibility: EventVisibilitySchema.default("staff"),
  editors: CalendarSchema.shape.editors.default({ roles: [], teamIds: [] }),
});
export type CalendarInput = z.input<typeof CalendarInputSchema>;

/**
 * `events` (SDD §8.2, §10, §22) — one table for public and internal events.
 * All-day events carry local midnight instants (Europe/Budapest) in `startsAt`/`endsAt`.
 * Recurrence: RFC 5545 `rrule` + `exdates`; single-occurrence overrides are child events with
 * `parentEventId` + `recurrenceId` (the original occurrence start).
 */
export const EventSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  calendarId: IdSchema,
  visibility: EventVisibilitySchema,
  slug: SlugSchema,
  title: TextSchema,
  body: RichTextSchema.nullable(),
  startsAt: IsoDateTimeSchema,
  endsAt: IsoDateTimeSchema.nullable(),
  allDay: z.boolean(),
  rrule: z.string().min(1).max(500).nullable(),
  exdates: z.array(IsoDateSchema),
  parentEventId: IdSchema.nullable(),
  recurrenceId: IsoDateTimeSchema.nullable(),
  locationId: IdSchema.nullable(),
  groupId: IdSchema.nullable(),
  teamId: IdSchema.nullable(),
  category: z.string().max(60).nullable(),
  coverMediaId: IdSchema.nullable(),
  status: EventStatusSchema,
  createdBy: IdSchema.nullable(),
  /** Reserved for a later CalDAV/Graph sync (SDD §22.2). */
  externalRef: z.string().nullable(),
  ...TimestampsShape,
});
export type Event = z.infer<typeof EventSchema>;

export const EventInputSchema = z
  .object({
    id: IdSchema.optional(),
    calendarId: IdSchema,
    visibility: EventVisibilitySchema,
    slug: SlugSchema,
    title: TextSchema,
    body: RichTextSchema.nullable().default(null),
    startsAt: IsoDateTimeSchema,
    endsAt: IsoDateTimeSchema.nullable().default(null),
    allDay: z.boolean().default(false),
    rrule: z
      .string()
      .min(1)
      .max(500)
      .regex(/^(RRULE:)?FREQ=/, { message: "Expected an RFC 5545 RRULE" })
      .nullable()
      .default(null),
    exdates: z.array(IsoDateSchema).default([]),
    parentEventId: IdSchema.nullable().default(null),
    recurrenceId: IsoDateTimeSchema.nullable().default(null),
    locationId: IdSchema.nullable().default(null),
    groupId: IdSchema.nullable().default(null),
    teamId: IdSchema.nullable().default(null),
    category: z.string().max(60).nullable().default(null),
    coverMediaId: IdSchema.nullable().default(null),
  })
  .refine((e) => e.endsAt === null || Date.parse(e.endsAt) >= Date.parse(e.startsAt), {
    message: "endsAt must not be before startsAt",
    path: ["endsAt"],
  })
  .refine((e) => (e.parentEventId === null) === (e.recurrenceId === null), {
    message: "parentEventId and recurrenceId go together",
    path: ["recurrenceId"],
  });
export type EventInput = z.input<typeof EventInputSchema>;

/**
 * Window query. Returns non-recurring events overlapping [from, to] and recurring masters whose
 * series may intersect it (`startsAt` ≤ to); expansion (max 400 days) is done by the caller.
 */
export type EventWindow = { from: string; to: string };

/**
 * Module `events` — events and calendars. Anonymous ctx only ever sees events with
 * `visibility = "public"` AND `status = "published"` (negative-tested per visibility, D-57).
 * Fine-grained internal visibility (private/team/staff) is decided by `can()`.
 */
export interface EventRepo {
  /** @public Public, published events in the window, by `startsAt`. */
  listPublic(ctx: Ctx, window: EventWindow & { category?: string }): Promise<Event[]>;
  /** @public A public, published event by slug, or null. */
  getPublicBySlug(ctx: Ctx, slug: string): Promise<Event | null>;
  /** All events in the window, optionally by calendar (anonymous: public+published only). */
  list(ctx: Ctx, window: EventWindow & { calendarIds?: string[] }): Promise<Event[]>;
  /** One by id (anonymous: public+published only). */
  get(ctx: Ctx, id: string): Promise<Event | null>;
  /**
   * Tenant ctx: create/update (new events start as `draft`). CONFLICT on duplicate slug;
   * NOT_FOUND for a `calendarId`/`locationId` outside the tenant.
   */
  upsert(ctx: Ctx, input: EventInput): Promise<Event>;
  /** Tenant ctx: set the status (publish / cancel / back to draft). */
  setStatus(ctx: Ctx, id: string, status: EventStatus): Promise<void>;
  /** Tenant ctx: delete (with its overrides). */
  delete(ctx: Ctx, id: string): Promise<void>;

  /** Tenant ctx: calendars of the tenant (anonymous: none). */
  listCalendars(ctx: Ctx): Promise<Calendar[]>;
  /** Tenant ctx: create/update a calendar. */
  upsertCalendar(ctx: Ctx, input: CalendarInput): Promise<Calendar>;
  /** Tenant ctx: delete a calendar. CONFLICT while it still contains events. */
  deleteCalendar(ctx: Ctx, id: string): Promise<void>;
}
