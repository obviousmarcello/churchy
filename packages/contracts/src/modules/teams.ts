import { z } from "zod";
import type { Ctx } from "../ctx";
import { IdSchema, TextSchema } from "../primitives";

export const TeamKindSchema = z.enum(["music", "liturgy", "tech", "facility", "youth", "other"]);
export type TeamKind = z.infer<typeof TeamKindSchema>;

/** `teams` (SDD §21.1). */
export const TeamSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  name: TextSchema,
  kind: TeamKindSchema,
  description: z.string().max(2000).nullable(),
  calendarId: IdSchema.nullable(),
});
export type Team = z.infer<typeof TeamSchema>;

export const TeamInputSchema = TeamSchema.omit({ tenantId: true }).extend({
  id: IdSchema.optional(),
  description: z.string().max(2000).nullable().default(null),
  calendarId: IdSchema.nullable().default(null),
});
export type TeamInput = z.input<typeof TeamInputSchema>;

/** `team_positions` (SDD §21.1), e.g. *Ének, Gitár, Lektor 1. olvasmány*. */
export const TeamPositionSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  teamId: IdSchema,
  name: TextSchema,
  sort: z.number().int(),
  minCount: z.number().int().nonnegative(),
  maxCount: z.number().int().positive().nullable(),
});
export type TeamPosition = z.infer<typeof TeamPositionSchema>;

export const TeamPositionInputSchema = TeamPositionSchema.omit({ tenantId: true })
  .extend({
    id: IdSchema.optional(),
    sort: z.number().int().default(0),
    minCount: z.number().int().nonnegative().default(1),
    maxCount: z.number().int().positive().nullable().default(null),
  })
  .refine((p) => p.maxCount === null || p.maxCount >= p.minCount, {
    message: "maxCount must be ≥ minCount",
    path: ["maxCount"],
  });
export type TeamPositionInput = z.input<typeof TeamPositionInputSchema>;

/** `team_members` (SDD §21.1) — unique per `(teamId, personId)`. */
export const TeamMemberSchema = z.object({
  tenantId: IdSchema,
  teamId: IdSchema,
  personId: IdSchema,
  isLeader: z.boolean(),
  positionIds: z.array(IdSchema),
  maxAssignmentsPerMonth: z.number().int().positive().nullable(),
  notes: z.string().max(1000).nullable(),
});
export type TeamMember = z.infer<typeof TeamMemberSchema>;

export const TeamMemberInputSchema = TeamMemberSchema.omit({ tenantId: true }).extend({
  isLeader: z.boolean().default(false),
  positionIds: z.array(IdSchema).default([]),
  maxAssignmentsPerMonth: z.number().int().positive().nullable().default(null),
  notes: z.string().max(1000).nullable().default(null),
});
export type TeamMemberInput = z.input<typeof TeamMemberInputSchema>;

/**
 * Module `teams` — teams, positions and memberships (D-51). Internal data: anonymous ctx gets
 * empty results. A person can belong to several teams with several positions.
 */
export interface TeamRepo {
  /** Teams of the tenant, by name (Hungarian collation). */
  list(ctx: Ctx): Promise<Team[]>;
  /** One team, or null. */
  get(ctx: Ctx, id: string): Promise<Team | null>;
  /** Tenant ctx: create/update. */
  upsert(ctx: Ctx, input: TeamInput): Promise<Team>;
  /** Tenant ctx: delete with its positions and memberships. */
  delete(ctx: Ctx, id: string): Promise<void>;

  /** Positions of a team, by `sort`. */
  listPositions(ctx: Ctx, teamId: string): Promise<TeamPosition[]>;
  /** Tenant ctx: create/update a position. NOT_FOUND for a team outside the tenant. */
  upsertPosition(ctx: Ctx, input: TeamPositionInput): Promise<TeamPosition>;
  /** Tenant ctx: delete a position (removed from members' `positionIds`). */
  deletePosition(ctx: Ctx, id: string): Promise<void>;

  /** Memberships filtered by team and/or person. */
  listMembers(ctx: Ctx, filter: { teamId?: string; personId?: string }): Promise<TeamMember[]>;
  /**
   * Tenant ctx: add or update a membership. NOT_FOUND for team/person outside the tenant;
   * VALIDATION if a `positionId` does not belong to the team.
   */
  upsertMember(ctx: Ctx, input: TeamMemberInput): Promise<TeamMember>;
  /** Tenant ctx: remove a membership. */
  removeMember(ctx: Ctx, teamId: string, personId: string): Promise<void>;
}
