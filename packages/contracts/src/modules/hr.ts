import { z } from "zod";
import type { Ctx } from "../ctx";
import {
  IdSchema,
  IsoDateSchema,
  IsoDateTimeSchema,
  TextSchema,
  TimestampsShape,
} from "../primitives";
import { FormFieldSchema, FormValueSchema } from "./requests";

/** Approval chain step (SDD §25.2); role steps use English role keys. */
export const ApprovalStepSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("manager") }),
  z.object({ kind: z.literal("person"), personId: IdSchema }),
  z.object({
    kind: z.literal("role"),
    role: z.enum(["leader", "hrHandler"]),
    any: z.literal(true),
  }),
]);
export type ApprovalStep = z.infer<typeof ApprovalStepSchema>;

/** `hr_categories` (SDD §25.1, §25.7). */
export const HrCategorySchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  key: z.string().regex(/^[a-z0-9_-]{1,60}$/),
  name: TextSchema,
  fields: z.array(FormFieldSchema),
  whoCanSubmit: z.enum(["employees", "volunteers", "all"]),
  /** Person ids of handlers; empty = everyone with `hrHandler` scoped to this category. */
  handlerPersonIds: z.array(IdSchema),
  approvalChain: z.array(ApprovalStepSchema),
  slaHours: z.number().int().positive().nullable(),
  confidential: z.boolean(),
  /** Anonymous complaints allowed (no requester identity stored, SDD §25.4). */
  allowAnonymous: z.boolean(),
  createsAbsence: z.boolean(),
  absenceType: z.string().min(1).max(60).nullable(),
  retentionDays: z.number().int().positive(),
  active: z.boolean(),
  templateId: IdSchema.nullable(),
  templateVersion: z.number().int().positive().nullable(),
});
export type HrCategory = z.infer<typeof HrCategorySchema>;

export const HrCategoryInputSchema = HrCategorySchema.omit({ tenantId: true })
  .extend({
    id: IdSchema.optional(),
    fields: z.array(FormFieldSchema).default([]),
    whoCanSubmit: z.enum(["employees", "volunteers", "all"]).default("all"),
    handlerPersonIds: z.array(IdSchema).default([]),
    approvalChain: z.array(ApprovalStepSchema).default([]),
    slaHours: z.number().int().positive().nullable().default(null),
    confidential: z.boolean().default(false),
    allowAnonymous: z.boolean().default(false),
    createsAbsence: z.boolean().default(false),
    absenceType: z.string().min(1).max(60).nullable().default(null),
    retentionDays: z
      .number()
      .int()
      .positive()
      .default(3 * 365),
    active: z.boolean().default(true),
    templateId: IdSchema.nullable().default(null),
    templateVersion: z.number().int().positive().nullable().default(null),
  })
  .refine((c) => !c.createsAbsence || c.absenceType !== null, {
    message: "createsAbsence needs absenceType",
    path: ["absenceType"],
  });
export type HrCategoryInput = z.input<typeof HrCategoryInputSchema>;

export const HrTicketStatusSchema = z.enum([
  "uj",
  "folyamatban",
  "jovahagyasra_var",
  "jovahagyva",
  "elutasitva",
  "lezart",
]);
export type HrTicketStatus = z.infer<typeof HrTicketStatusSchema>;

/**
 * `hr_tickets` (SDD §25.1). `subject`/`data` are plaintext here; the DB adapter stores
 * `subject_enc`/`data_enc` with the parish's tenant data key.
 */
export const HrTicketSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  /** `HR-YYYY-NNNN`, sequential per tenant and year. */
  reference: z.string().regex(/^HR-\d{4}-\d{4,}$/),
  categoryId: IdSchema,
  /** Denormalized category key (delegation matching, SDD §25.7). */
  categoryKey: z.string(),
  /** Null for anonymous tickets. */
  requesterPersonId: IdSchema.nullable(),
  anonymous: z.boolean(),
  subject: TextSchema,
  data: z.record(z.string(), FormValueSchema),
  status: HrTicketStatusSchema,
  currentStep: z.number().int().nonnegative(),
  assigneePersonId: IdSchema.nullable(),
  dueAt: IsoDateTimeSchema.nullable(),
  confidential: z.boolean(),
  handover: z
    .object({ recipient: TextSchema, date: IsoDateSchema, summary: z.string().max(2000) })
    .nullable(),
  closedAt: IsoDateTimeSchema.nullable(),
  purgeAfter: IsoDateTimeSchema.nullable(),
  ...TimestampsShape,
});
export type HrTicket = z.infer<typeof HrTicketSchema>;

export const HrTicketInputSchema = z
  .object({
    categoryId: IdSchema,
    requesterPersonId: IdSchema.nullable(),
    anonymous: z.boolean().default(false),
    subject: TextSchema,
    data: z.record(z.string(), FormValueSchema).default({}),
  })
  .refine((t) => t.anonymous === (t.requesterPersonId === null), {
    message: "Anonymous tickets have no requester; others need one",
    path: ["requesterPersonId"],
  });
export type HrTicketInput = z.input<typeof HrTicketInputSchema>;

export const HrTicketUpdateSchema = z.object({
  status: HrTicketStatusSchema.optional(),
  currentStep: z.number().int().nonnegative().optional(),
  assigneePersonId: IdSchema.nullable().optional(),
  dueAt: IsoDateTimeSchema.nullable().optional(),
});
export type HrTicketUpdate = z.input<typeof HrTicketUpdateSchema>;

/** `hr_ticket_messages` (SDD §25.1). `internal` notes are never shown to the requester. */
export const HrTicketMessageSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  ticketId: IdSchema,
  authorPersonId: IdSchema.nullable(),
  body: z.string().min(1).max(10000),
  internal: z.boolean(),
  attachmentMediaIds: z.array(IdSchema),
  createdAt: IsoDateTimeSchema,
});
export type HrTicketMessage = z.infer<typeof HrTicketMessageSchema>;

export const HrTicketMessageInputSchema = z.object({
  body: z.string().trim().min(1).max(10000),
  internal: z.boolean().default(false),
  attachmentMediaIds: z.array(IdSchema).default([]),
});
export type HrTicketMessageInput = z.input<typeof HrTicketMessageInputSchema>;

/** `hr_approvals` (SDD §25.1). */
export const HrApprovalSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  ticketId: IdSchema,
  step: z.number().int().nonnegative(),
  approverPersonId: IdSchema,
  decision: z.enum(["approved", "rejected", "delegated"]),
  comment: z.string().max(2000).nullable(),
  decidedAt: IsoDateTimeSchema,
});
export type HrApproval = z.infer<typeof HrApprovalSchema>;

export const HrApprovalInputSchema = HrApprovalSchema.pick({
  step: true,
  approverPersonId: true,
  decision: true,
}).extend({ comment: z.string().max(2000).nullable().default(null) });
export type HrApprovalInput = z.input<typeof HrApprovalInputSchema>;

/**
 * Module `hr` — HR categories, tickets, messages and approvals (D-71 … D-74, D-84/85).
 *
 * Context rules (mirror the RLS branch of SDD §25.7):
 * - tenant ctx: rows of the tenant;
 * - org ctx: **read/handle only** tickets of parishes with an `active` org link whose delegation
 *   covers the ticket's `categoryKey` (or `*`); everything else is invisible (NOT_FOUND on writes);
 * - anonymous ctx: nothing.
 * Confidential/handler scoping and read reasons are enforced by `can()` + audit logging.
 */
export interface HrRepo {
  /** Tenant ctx: categories of the tenant. */
  listCategories(ctx: Ctx): Promise<HrCategory[]>;
  /** Tenant ctx: create/update. CONFLICT on duplicate key. */
  upsertCategory(ctx: Ctx, input: HrCategoryInput): Promise<HrCategory>;

  /** Tickets visible in ctx (see context rules), newest first. */
  listTickets(
    ctx: Ctx,
    filter?: {
      status?: HrTicketStatus;
      categoryId?: string;
      requesterPersonId?: string;
      tenantIds?: string[];
    },
  ): Promise<HrTicket[]>;
  /** One ticket visible in ctx, or null. */
  getTicket(ctx: Ctx, id: string): Promise<HrTicket | null>;
  /**
   * Tenant ctx: submit a ticket (status `uj`, reference assigned, `confidential` copied from the
   * category). NOT_FOUND for an unknown/inactive category; VALIDATION if `data` fails the
   * category fields or anonymous is used on a category that does not allow it.
   */
  createTicket(ctx: Ctx, input: HrTicketInput): Promise<HrTicket>;
  /** Tenant or org ctx: workflow fields. `lezart` sets `closedAt` and `purgeAfter`. */
  updateTicket(ctx: Ctx, id: string, patch: HrTicketUpdate): Promise<HrTicket>;
  /** Tenant or org ctx: hand over to an external body; the ticket becomes read-only (CONFLICT after). */
  handOver(
    ctx: Ctx,
    id: string,
    handover: { recipient: string; date: string; summary: string },
  ): Promise<HrTicket>;

  /** Messages of a ticket, oldest first; internal ones only with `includeInternal`. */
  listMessages(
    ctx: Ctx,
    ticketId: string,
    options?: { includeInternal?: boolean },
  ): Promise<HrTicketMessage[]>;
  /** Tenant or org ctx: add a message authored by the ctx actor's person. */
  addMessage(ctx: Ctx, ticketId: string, input: HrTicketMessageInput): Promise<HrTicketMessage>;

  /** Approval decisions of a ticket, by step. */
  listApprovals(ctx: Ctx, ticketId: string): Promise<HrApproval[]>;
  /** Tenant or org ctx: record one approval decision. */
  recordApproval(ctx: Ctx, ticketId: string, input: HrApprovalInput): Promise<HrApproval>;

  /** Tenant ctx: delete closed tickets with `purgeAfter < now`; returns the count only. */
  purgeExpired(ctx: Ctx, now: string): Promise<number>;
}
