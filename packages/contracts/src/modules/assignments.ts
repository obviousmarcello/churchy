import { z } from "zod";
import type { Ctx } from "../ctx";
import { IdSchema, IsoDateTimeSchema } from "../primitives";

export const AssignmentStatusSchema = z.enum([
  "requested",
  "accepted",
  "declined",
  "swap_requested",
  "cancelled",
]);
export type AssignmentStatus = z.infer<typeof AssignmentStatusSchema>;

/**
 * `assignments` (SDD §24.2) — also used for generic rotas without a plan (FR-812).
 * `startsAt`/`endsAt` are denormalized from the occurrence/event for range queries and
 * overlap checks (scheduling hard filters, absence conflicts).
 */
export const AssignmentSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  occurrenceId: IdSchema.nullable(),
  eventId: IdSchema.nullable(),
  planId: IdSchema.nullable(),
  teamId: IdSchema,
  positionId: IdSchema,
  personId: IdSchema,
  startsAt: IsoDateTimeSchema,
  endsAt: IsoDateTimeSchema,
  status: AssignmentStatusSchema,
  requestedByPersonId: IdSchema.nullable(),
  respondedAt: IsoDateTimeSchema.nullable(),
  declineReason: z.string().max(500).nullable(),
  swapWithPersonId: IdSchema.nullable(),
  createdAt: IsoDateTimeSchema,
});
export type Assignment = z.infer<typeof AssignmentSchema>;

export const AssignmentInputSchema = z
  .object({
    occurrenceId: IdSchema.nullable().default(null),
    eventId: IdSchema.nullable().default(null),
    planId: IdSchema.nullable().default(null),
    teamId: IdSchema,
    positionId: IdSchema,
    personId: IdSchema,
    startsAt: IsoDateTimeSchema,
    endsAt: IsoDateTimeSchema,
    requestedByPersonId: IdSchema.nullable().default(null),
  })
  .refine((a) => (a.occurrenceId === null) !== (a.eventId === null), {
    message: "An assignment belongs to exactly one occurrence or event",
    path: ["occurrenceId"],
  })
  .refine((a) => Date.parse(a.endsAt) > Date.parse(a.startsAt), {
    message: "endsAt must be after startsAt",
    path: ["endsAt"],
  });
export type AssignmentInput = z.input<typeof AssignmentInputSchema>;

/**
 * Module `assignments` — who serves when (D-67). Internal data. Swaps: the first eligible
 * acceptance wins; later ones get CONFLICT.
 */
export interface AssignmentRepo {
  /** Assignments filtered by person/team/occurrence/event/time window/status, by `startsAt`. */
  list(
    ctx: Ctx,
    filter: {
      personId?: string;
      teamId?: string;
      occurrenceId?: string;
      eventId?: string;
      from?: string;
      to?: string;
      statuses?: AssignmentStatus[];
    },
  ): Promise<Assignment[]>;
  /** One assignment, or null. */
  get(ctx: Ctx, id: string): Promise<Assignment | null>;
  /**
   * Tenant ctx: request people for positions (status `requested`). NOT_FOUND for team/position/
   * person outside the tenant; VALIDATION if the position does not belong to the team.
   */
  create(ctx: Ctx, inputs: AssignmentInput[]): Promise<Assignment[]>;
  /** Tenant ctx: accept or decline (one-tap link or app). CONFLICT unless `requested`. */
  respond(
    ctx: Ctx,
    id: string,
    response: { accept: boolean; declineReason?: string | null },
  ): Promise<Assignment>;
  /** Tenant ctx: the assignee asks for a swap (optionally with a named person). */
  requestSwap(ctx: Ctx, id: string, swapWithPersonId?: string | null): Promise<Assignment>;
  /**
   * Tenant ctx: `personId` takes over a `swap_requested` assignment — the original is cancelled
   * and a new `accepted` one returned. CONFLICT if it is no longer `swap_requested`.
   */
  acceptSwap(ctx: Ctx, id: string, personId: string): Promise<Assignment>;
  /** Tenant ctx: cancel. */
  cancel(ctx: Ctx, id: string): Promise<Assignment>;
}
