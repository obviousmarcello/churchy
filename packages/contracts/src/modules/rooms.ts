import { z } from "zod";
import type { Ctx } from "../ctx";
import { IdSchema, IsoDateTimeSchema, TextSchema, WeeklyHoursSchema } from "../primitives";
import { WorkspaceRoleSchema } from "../roles";
import { AccessibilitySchema } from "./locations";

/** Approval policy of a room (SDD §23.2). */
export const ApprovalPolicySchema = z.object({
  autoApprove: z.object({
    roles: z.array(WorkspaceRoleSchema).default([]),
    teamIds: z.array(IdSchema).default([]),
  }),
  approvers: z.union([
    z.literal("room_managers"),
    z.object({ personIds: z.array(IdSchema).min(1) }),
  ]),
  /** Pending requests expire (→ cancelled) after this many hours. */
  holdHours: z.number().int().positive(),
});
export type ApprovalPolicy = z.infer<typeof ApprovalPolicySchema>;

/** Booking rules of a room (SDD §23.2). */
export const BookingRulesSchema = z.object({
  bookableHours: WeeklyHoursSchema.optional(),
  minNoticeHours: z.number().int().nonnegative().optional(),
  maxDurationMin: z.number().int().positive().optional(),
  horizonDays: z.number().int().positive().optional(),
  blackout: z
    .array(z.object({ name: TextSchema, from: IsoDateTimeSchema, to: IsoDateTimeSchema }))
    .optional(),
  whoCanRequest: z
    .union([z.array(WorkspaceRoleSchema), z.literal("all_staff"), z.literal("all_workspace")])
    .default("all_workspace"),
});
export type BookingRules = z.infer<typeof BookingRulesSchema>;

/** `rooms` (SDD §23.1) — rooms and bookable resources. */
export const RoomSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  locationId: IdSchema,
  name: TextSchema,
  kind: z.enum(["room", "resource"]),
  capacity: z.number().int().positive().nullable(),
  features: z.array(z.string().min(1).max(60)),
  photoMediaIds: z.array(IdSchema),
  accessibility: AccessibilitySchema,
  managerPersonIds: z.array(IdSchema),
  approvalPolicy: ApprovalPolicySchema,
  rules: BookingRulesSchema,
  active: z.boolean(),
});
export type Room = z.infer<typeof RoomSchema>;

export const RoomInputSchema = RoomSchema.omit({ tenantId: true }).extend({
  id: IdSchema.optional(),
  kind: z.enum(["room", "resource"]).default("room"),
  capacity: z.number().int().positive().nullable().default(null),
  features: z.array(z.string().min(1).max(60)).default([]),
  photoMediaIds: z.array(IdSchema).default([]),
  accessibility: AccessibilitySchema.default({
    wheelchair: false,
    accessibleToilet: false,
    hearingLoop: false,
    parking: false,
    note: null,
  }),
  managerPersonIds: z.array(IdSchema).default([]),
  approvalPolicy: ApprovalPolicySchema.default({
    autoApprove: { roles: [], teamIds: [] },
    approvers: "room_managers",
    holdHours: 48,
  }),
  rules: BookingRulesSchema.default({ whoCanRequest: "all_workspace" }),
  active: z.boolean().default(true),
});
export type RoomInput = z.input<typeof RoomInputSchema>;

/**
 * Which rooms a service blocks, with buffers (SDD §23.4: *Szentmise in Templom blocks Templomtér
 * −30/+15 min*). Not a table in the SDD ("config"); modelled as rows here.
 */
export const ServiceRoomBlockSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  locationId: IdSchema,
  serviceType: z.string().min(1).max(60),
  roomIds: z.array(IdSchema).min(1),
  bufferBeforeMin: z.number().int().nonnegative(),
  bufferAfterMin: z.number().int().nonnegative(),
});
export type ServiceRoomBlock = z.infer<typeof ServiceRoomBlockSchema>;

export const ServiceRoomBlockInputSchema = ServiceRoomBlockSchema.omit({ tenantId: true }).extend({
  id: IdSchema.optional(),
  bufferBeforeMin: z.number().int().nonnegative().default(0),
  bufferAfterMin: z.number().int().nonnegative().default(0),
});
export type ServiceRoomBlockInput = z.input<typeof ServiceRoomBlockInputSchema>;

/** Module `rooms` — room/resource catalog and service auto-block mapping. Internal data. */
export interface RoomRepo {
  /** Rooms, optionally by location / active only; by name (Hungarian collation). */
  list(ctx: Ctx, filter?: { locationId?: string; activeOnly?: boolean }): Promise<Room[]>;
  /** One room, or null. */
  get(ctx: Ctx, id: string): Promise<Room | null>;
  /** Tenant ctx: create/update. NOT_FOUND for a location outside the tenant. */
  upsert(ctx: Ctx, input: RoomInput): Promise<Room>;
  /** Tenant ctx: delete. CONFLICT while pending/approved future bookings exist (deactivate instead). */
  delete(ctx: Ctx, id: string): Promise<void>;

  /** Service → room block mappings. */
  listServiceBlocks(ctx: Ctx): Promise<ServiceRoomBlock[]>;
  /** Tenant ctx: create/update a mapping. NOT_FOUND for rooms/location outside the tenant. */
  upsertServiceBlock(ctx: Ctx, input: ServiceRoomBlockInput): Promise<ServiceRoomBlock>;
  /** Tenant ctx: delete a mapping. */
  deleteServiceBlock(ctx: Ctx, id: string): Promise<void>;
}
