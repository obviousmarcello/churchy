import { z } from "zod";
import type { Ctx } from "../ctx";
import { IdSchema, IsoDateTimeSchema } from "../primitives";

/** Notification kinds (SDD §26.1). */
export const NotificationKindSchema = z.enum([
  "assignmentRequest",
  "assignmentReminder",
  "swapRequest",
  "planReview",
  "planApproved",
  "planChanged",
  "occurrenceMoved",
  "mention",
  "bookingRequested",
  "bookingDecided",
  "bookingConflict",
  "hrTicketUpdate",
  "eventInvitation",
  "eventReminder",
  "facilityDailyList",
]);
export type NotificationKind = z.infer<typeof NotificationKindSchema>;

export const NotificationChannelSchema = z.enum(["in_app", "email", "push"]);

/**
 * Payload values are scalars only and must never contain HR/pastoral content (D-54 AC4);
 * long free text is rejected to make accidental content leaks harder.
 */
export const NotificationPayloadSchema = z.record(
  z.string(),
  z.union([z.string().max(200), z.number(), z.boolean(), z.null()]),
);

/** `notifications` (SDD §26.1). */
export const NotificationSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  userId: IdSchema,
  kind: NotificationKindSchema,
  payload: NotificationPayloadSchema,
  /** App-relative link, e.g. `/munkater/szolgalatok/…`. */
  link: z.string().regex(/^\/\S*$/),
  createdAt: IsoDateTimeSchema,
  readAt: IsoDateTimeSchema.nullable(),
});
export type Notification = z.infer<typeof NotificationSchema>;

export const NotificationInputSchema = NotificationSchema.pick({
  userId: true,
  kind: true,
  link: true,
}).extend({ payload: NotificationPayloadSchema.default({}) });
export type NotificationInput = z.input<typeof NotificationInputSchema>;

/** `notification_prefs` (SDD §26.1). */
export const NotificationPrefSchema = z.object({
  userId: IdSchema,
  kind: NotificationKindSchema,
  channels: z.array(NotificationChannelSchema),
  digest: z.boolean(),
});
export type NotificationPref = z.infer<typeof NotificationPrefSchema>;

export const NotificationPrefInputSchema = NotificationPrefSchema.omit({ userId: true });
export type NotificationPrefInput = z.input<typeof NotificationPrefInputSchema>;

/**
 * Module `notifications` — in-app notification center and preferences (D-54). Reads and
 * read-marks are scoped to the **ctx actor** (`ctx.actor.userId`); another user's notification
 * is NOT_FOUND. Fan-out/delivery is `packages/notify`.
 */
export interface NotificationRepo {
  /** The actor's notifications in the tenant, newest first (anonymous: empty). */
  list(ctx: Ctx, options?: { unreadOnly?: boolean; limit?: number }): Promise<Notification[]>;
  /** The actor's unread count (anonymous: 0). */
  unreadCount(ctx: Ctx): Promise<number>;
  /** Tenant ctx: create a notification for `userId` (system fan-out). */
  create(ctx: Ctx, input: NotificationInput): Promise<Notification>;
  /** Tenant ctx: mark one of the actor's notifications read. NOT_FOUND for others'. */
  markRead(ctx: Ctx, id: string): Promise<void>;
  /** Tenant ctx: mark all of the actor's notifications read; returns how many changed. */
  markAllRead(ctx: Ctx): Promise<number>;
  /** The actor's stored preferences (defaults are applied by `packages/notify`). */
  getPrefs(ctx: Ctx): Promise<NotificationPref[]>;
  /** Tenant ctx: set the actor's preference for one kind. */
  setPref(ctx: Ctx, input: NotificationPrefInput): Promise<NotificationPref>;
}
