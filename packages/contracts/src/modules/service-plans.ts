import { z } from "zod";
import type { Ctx } from "../ctx";
import { IdSchema, IsoDateTimeSchema, MusicalKeySchema, TextSchema } from "../primitives";
import { DenominationSchema } from "./tenants";

export const PlanStatusSchema = z.enum(["draft", "in_review", "approved", "locked"]);
export type PlanStatus = z.infer<typeof PlanStatusSchema>;

export const PlanItemTypeSchema = z.enum([
  "song",
  "liturgy",
  "reading",
  "prayer",
  "sermon",
  "announcement",
  "other",
]);

const PlanItemFields = {
  type: PlanItemTypeSchema,
  title: TextSchema,
  songId: IdSchema.nullable().default(null),
  arrangementId: IdSchema.nullable().default(null),
  keyOverride: MusicalKeySchema.nullable().default(null),
  verses: z.string().max(100).nullable().default(null),
  durationS: z.number().int().nonnegative().nullable().default(null),
  responsiblePersonId: IdSchema.nullable().default(null),
  notes: z.string().max(2000).nullable().default(null),
};

/** Item of a plan (input/template shape, no ids). */
export const PlanItemInputSchema = z.object({ id: IdSchema.optional(), ...PlanItemFields });
export type PlanItemInput = z.input<typeof PlanItemInputSchema>;

/** `plan_items` (SDD §24.2). `position` is 0-based and contiguous. */
export const PlanItemSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  planId: IdSchema,
  position: z.number().int().nonnegative(),
  ...PlanItemFields,
});
export type PlanItem = z.infer<typeof PlanItemSchema>;

/** `plan_templates` (SDD §24.2). `tenantId = null` = preset template (all tenants). */
export const PlanTemplateSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema.nullable(),
  denomination: DenominationSchema.nullable(),
  serviceType: z.string().min(1).max(60),
  name: TextSchema,
  items: z.array(PlanItemInputSchema.omit({ id: true })),
});
export type PlanTemplate = z.infer<typeof PlanTemplateSchema>;

export const PlanTemplateInputSchema = PlanTemplateSchema.omit({ tenantId: true }).extend({
  id: IdSchema.optional(),
  denomination: DenominationSchema.nullable().default(null),
});
export type PlanTemplateInput = z.input<typeof PlanTemplateInputSchema>;

/** `service_plans` (SDD §24.2) — attached to exactly one occurrence or event. */
export const ServicePlanSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  occurrenceId: IdSchema.nullable(),
  eventId: IdSchema.nullable(),
  title: TextSchema,
  status: PlanStatusSchema,
  templateId: IdSchema.nullable(),
  leaderPersonId: IdSchema,
  approvedByPersonId: IdSchema.nullable(),
  approvedAt: IsoDateTimeSchema.nullable(),
  /** Items as approved; later edits are diffed against it (SDD §24.3). */
  approvedSnapshot: z.array(PlanItemSchema).nullable(),
  lockedAt: IsoDateTimeSchema.nullable(),
  notes: z.string().max(4000).nullable(),
  updatedAt: IsoDateTimeSchema,
});
export type ServicePlan = z.infer<typeof ServicePlanSchema>;

export const ServicePlanInputSchema = z
  .object({
    id: IdSchema.optional(),
    occurrenceId: IdSchema.nullable().default(null),
    eventId: IdSchema.nullable().default(null),
    title: TextSchema,
    templateId: IdSchema.nullable().default(null),
    leaderPersonId: IdSchema,
    notes: z.string().max(4000).nullable().default(null),
  })
  .refine((p) => (p.occurrenceId === null) !== (p.eventId === null), {
    message: "A plan belongs to exactly one occurrence or event",
    path: ["occurrenceId"],
  });
export type ServicePlanInput = z.input<typeof ServicePlanInputSchema>;

/** `plan_comments` (SDD §24.2). */
export const PlanCommentSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  planId: IdSchema,
  itemId: IdSchema.nullable(),
  authorPersonId: IdSchema,
  body: z.string().min(1).max(4000),
  mentions: z.array(IdSchema),
  resolvedAt: IsoDateTimeSchema.nullable(),
  createdAt: IsoDateTimeSchema,
});
export type PlanComment = z.infer<typeof PlanCommentSchema>;

export const PlanCommentInputSchema = z.object({
  planId: IdSchema,
  itemId: IdSchema.nullable().default(null),
  body: z.string().trim().min(1).max(4000),
  mentions: z.array(IdSchema).default([]),
});
export type PlanCommentInput = z.input<typeof PlanCommentInputSchema>;

export type PlanWithItems = { plan: ServicePlan; items: PlanItem[] };

/**
 * Module `servicePlans` — worship plans, items, templates and comments (D-66, D-68). Internal.
 * Transition rules (who may move draft → in_review → approved) live in `packages/worship`; the
 * repository persists them and enforces: a `locked` plan is read-only (CONFLICT on any write).
 */
export interface ServicePlanRepo {
  /** Plans, optionally filtered. */
  list(
    ctx: Ctx,
    filter?: { status?: PlanStatus; occurrenceIds?: string[]; eventIds?: string[] },
  ): Promise<ServicePlan[]>;
  /** A plan with its ordered items, or null. */
  get(ctx: Ctx, id: string): Promise<PlanWithItems | null>;
  /** Tenant ctx: create (status `draft`) or update plan fields. */
  upsert(ctx: Ctx, input: ServicePlanInput): Promise<ServicePlan>;
  /** Tenant ctx: create a plan pre-filled from a template (one action, D-66). */
  createFromTemplate(
    ctx: Ctx,
    templateId: string,
    input: Omit<ServicePlanInput, "id" | "templateId">,
  ): Promise<PlanWithItems>;
  /** Tenant ctx: replace the ordered item list (positions renumbered 0…n-1). */
  setItems(ctx: Ctx, planId: string, items: PlanItemInput[]): Promise<PlanItem[]>;
  /**
   * Tenant ctx: persist a status change. `approved` stores `approvedSnapshot`, approver = ctx
   * actor's person; `locked` sets `lockedAt`.
   */
  setStatus(ctx: Ctx, id: string, status: PlanStatus): Promise<ServicePlan>;
  /** Tenant ctx: delete a non-locked plan. */
  delete(ctx: Ctx, id: string): Promise<void>;

  /** Preset + tenant templates, optionally for one service type. */
  listTemplates(ctx: Ctx, serviceType?: string): Promise<PlanTemplate[]>;
  /** Tenant ctx: create/update a tenant template. */
  upsertTemplate(ctx: Ctx, input: PlanTemplateInput): Promise<PlanTemplate>;

  /** Comments of a plan, oldest first. */
  listComments(ctx: Ctx, planId: string): Promise<PlanComment[]>;
  /** Tenant ctx: add a comment authored by the ctx actor's person. */
  addComment(ctx: Ctx, input: PlanCommentInput): Promise<PlanComment>;
  /** Tenant ctx: resolve / unresolve a comment. */
  setCommentResolved(ctx: Ctx, id: string, resolved: boolean): Promise<PlanComment>;
}
