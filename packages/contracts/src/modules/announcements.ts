import { z } from "zod";
import type { ListPage, PageRequest } from "../common";
import { PublishFieldsShape } from "../common";
import type { Ctx } from "../ctx";
import {
  IdSchema,
  IsoDateSchema,
  RichTextSchema,
  TimestampsShape,
  isoWeekdayOf,
} from "../primitives";

/** A civil date that falls on a Sunday (announcements are tied to the week's Sunday, FR-005). */
export const SundaySchema = IsoDateSchema.refine((d) => isoWeekdayOf(d) === 7, {
  message: "Expected a Sunday",
});

/** `announcements` (SDD §8.2) — unique per `(tenantId, weekSunday)`. */
export const AnnouncementSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  weekSunday: IsoDateSchema,
  body: RichTextSchema.nullable(),
  pdfMediaId: IdSchema.nullable(),
  ...PublishFieldsShape,
  ...TimestampsShape,
});
export type Announcement = z.infer<typeof AnnouncementSchema>;

/** Create (no `id`) or update (with `id`); publishing is a separate call. */
export const AnnouncementInputSchema = z
  .object({
    id: IdSchema.optional(),
    weekSunday: SundaySchema,
    body: RichTextSchema.nullable().default(null),
    pdfMediaId: IdSchema.nullable().default(null),
  })
  .refine((a) => a.body !== null || a.pdfMediaId !== null, {
    message: "An announcement needs a text or a PDF",
    path: ["body"],
  });
export type AnnouncementInput = z.input<typeof AnnouncementInputSchema>;

/**
 * Module `announcements` — weekly announcements (*Hirdetések*, D-14). Public reads only return
 * publicly visible rows (`isPubliclyVisible`); anonymous ctx never sees drafts or scheduled rows.
 */
export interface AnnouncementRepo {
  /** @public The visible announcement with the latest `weekSunday`, or null. */
  latest(ctx: Ctx): Promise<Announcement | null>;
  /** @public The announcement of the week ending on `sunday`, or null. */
  byWeek(ctx: Ctx, sunday: string): Promise<Announcement | null>;
  /** @public Archive / admin list, newest week first (anonymous: visible rows only). */
  list(ctx: Ctx, page?: PageRequest): Promise<ListPage<Announcement>>;
  /** @public One by id (anonymous: only if visible). */
  get(ctx: Ctx, id: string): Promise<Announcement | null>;
  /**
   * Tenant ctx: create or update as draft content (status unchanged on update).
   * CONFLICT if another announcement already exists for `weekSunday`.
   */
  upsert(ctx: Ctx, input: AnnouncementInput): Promise<Announcement>;
  /** Tenant ctx: publish now or at `at` (scheduling, D-20). */
  publish(ctx: Ctx, id: string, at?: string): Promise<void>;
  /** Tenant ctx: back to draft. */
  unpublish(ctx: Ctx, id: string): Promise<void>;
  /** Tenant ctx: delete. NOT_FOUND if it is not the tenant's. */
  delete(ctx: Ctx, id: string): Promise<void>;
}
