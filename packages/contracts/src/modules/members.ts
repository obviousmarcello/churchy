import { z } from "zod";
import type { Ctx } from "../ctx";
import { EmailSchema, IdSchema, IsoDateTimeSchema, TextSchema } from "../primitives";
import { TenantRoleSchema, WorkspaceRoleSchema } from "../roles";

/**
 * `users` (SDD §8.2) — login identity. Secrets (`password_hash`, `totp_secret_enc`) are never
 * part of the contract; they live behind the auth layer (D-04).
 */
export const UserSchema = z.object({
  id: IdSchema,
  email: EmailSchema,
  name: TextSchema,
  twoFactorEnabled: z.boolean(),
  lastLoginAt: IsoDateTimeSchema.nullable(),
});
export type User = z.infer<typeof UserSchema>;

/**
 * `memberships` (SDD §8.2 + §21.2): website role, additive workspace roles and their scopes.
 * `role` is null for workspace-only members (e.g. volunteers).
 */
export const MembershipSchema = z.object({
  tenantId: IdSchema,
  userId: IdSchema,
  role: TenantRoleSchema.nullable(),
  /** Group scope for `groupLeader` (groups module is P1; ids kept for forward compatibility). */
  groupIds: z.array(IdSchema),
  wsRoles: z.array(WorkspaceRoleSchema),
  teamIds: z.array(IdSchema),
  roomIds: z.array(IdSchema),
  hrCategoryIds: z.array(IdSchema),
  active: z.boolean(),
  invitedAt: IsoDateTimeSchema.nullable(),
  createdAt: IsoDateTimeSchema,
});
export type Membership = z.infer<typeof MembershipSchema>;

export type Member = Membership & { user: User };

const ScopesShape = {
  role: TenantRoleSchema.nullable().default(null),
  groupIds: z.array(IdSchema).default([]),
  wsRoles: z.array(WorkspaceRoleSchema).default([]),
  teamIds: z.array(IdSchema).default([]),
  roomIds: z.array(IdSchema).default([]),
  hrCategoryIds: z.array(IdSchema).default([]),
};

export const InviteMemberInputSchema = z
  .object({ email: EmailSchema, name: TextSchema, ...ScopesShape })
  .refine((m) => m.role !== null || m.wsRoles.length > 0, {
    message: "A member needs a website role or at least one workspace role",
    path: ["role"],
  });
export type InviteMemberInput = z.input<typeof InviteMemberInputSchema>;

export const UpdateMembershipInputSchema = z.object({
  role: TenantRoleSchema.nullable().optional(),
  groupIds: z.array(IdSchema).optional(),
  wsRoles: z.array(WorkspaceRoleSchema).optional(),
  teamIds: z.array(IdSchema).optional(),
  roomIds: z.array(IdSchema).optional(),
  hrCategoryIds: z.array(IdSchema).optional(),
  active: z.boolean().optional(),
});
export type UpdateMembershipInput = z.input<typeof UpdateMembershipInputSchema>;

/**
 * Module `members` — users of a tenant and their roles (D-26, D-52).
 *
 * Invariant: a tenant always keeps at least one **active owner** — demoting or deactivating the
 * last one throws `CONFLICT`.
 */
export interface MembershipRepo {
  /** Tenant ctx: all members (active and inactive) with their user record. */
  list(ctx: Ctx): Promise<Member[]>;
  /** Tenant ctx: one member, or null. */
  get(ctx: Ctx, userId: string): Promise<Member | null>;
  /**
   * Tenant ctx: invite by email — creates the user if unknown, then the membership.
   * CONFLICT if the user is already a member of this tenant.
   */
  invite(ctx: Ctx, input: InviteMemberInput): Promise<Member>;
  /** Tenant ctx: change roles/scopes/active flag. CONFLICT when removing the last active owner. */
  update(ctx: Ctx, userId: string, patch: UpdateMembershipInput): Promise<Member>;
  /**
   * Any ctx: memberships of the ctx actor across tenants (for the *Egyházmegye ↔ Plébánia*
   * context switch). Returns only the actor's own memberships.
   */
  listOwnMemberships(ctx: Ctx): Promise<Membership[]>;
}
