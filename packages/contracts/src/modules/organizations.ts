import { z } from "zod";
import type { Ctx } from "../ctx";
import {
  IdSchema,
  IsoDateSchema,
  IsoDateTimeSchema,
  SlugSchema,
  TextSchema,
  TimestampsShape,
} from "../primitives";
import { OrgRoleSchema } from "../roles";
import { PlanKeySchema } from "./billing";
import { DenominationSchema } from "./tenants";

/** `organizations` (SDD §25.7) — platform-level, not a tenant. */
export const OrganizationSchema = z.object({
  id: IdSchema,
  kind: z.enum(["egyhazmegye", "egyhazkerulet", "egyeb"]),
  name: TextSchema,
  slug: SlugSchema,
  denomination: DenominationSchema,
  settings: z.record(z.string(), z.unknown()),
  ...TimestampsShape,
});
export type Organization = z.infer<typeof OrganizationSchema>;

export const OrganizationInputSchema = OrganizationSchema.pick({
  kind: true,
  name: true,
  slug: true,
  denomination: true,
}).extend({ settings: z.record(z.string(), z.unknown()).default({}) });
export type OrganizationInput = z.input<typeof OrganizationInputSchema>;

/** `org_memberships` (SDD §25.7). Null scopes = all categories / all linked parishes. */
export const OrgMembershipSchema = z.object({
  orgId: IdSchema,
  userId: IdSchema,
  roles: z.array(OrgRoleSchema).min(1),
  categoryScopes: z.array(z.string()).nullable(),
  parishScopes: z.array(IdSchema).nullable(),
});
export type OrgMembership = z.infer<typeof OrgMembershipSchema>;

export const OrgMembershipInputSchema = OrgMembershipSchema.omit({ orgId: true }).extend({
  categoryScopes: z.array(z.string()).nullable().default(null),
  parishScopes: z.array(IdSchema).nullable().default(null),
});
export type OrgMembershipInput = z.input<typeof OrgMembershipInputSchema>;

/**
 * `org_links` (SDD §25.7). Becomes `active` only when approved by **both** the parish
 * (`approvedByParish`) and the organization (`approvedByOrg`); either side can revoke.
 */
export const OrgLinkSchema = z.object({
  id: IdSchema,
  orgId: IdSchema,
  tenantId: IdSchema,
  status: z.enum(["requested", "active", "revoked"]),
  requestedBy: IdSchema,
  approvedByParish: IdSchema.nullable(),
  approvedByOrg: IdSchema.nullable(),
  linkedAt: IsoDateTimeSchema.nullable(),
  revokedAt: IsoDateTimeSchema.nullable(),
});
export type OrgLink = z.infer<typeof OrgLinkSchema>;

/** `org_delegations` — which HR category keys a parish delegates (`*` = all). */
export const OrgDelegationSchema = z.object({
  orgId: IdSchema,
  tenantId: IdSchema,
  hrCategoryKey: z.string().min(1),
});
export type OrgDelegation = z.infer<typeof OrgDelegationSchema>;

/** `deals` (SDD §19.3). Prices in whole HUF. */
export const DealSchema = z.object({
  id: IdSchema,
  organizationId: IdSchema,
  planKeys: z.array(PlanKeySchema).min(1),
  parishLimit: z.number().int().positive(),
  priceTerms: z.object({
    monthlyPerParish: z.number().int().nonnegative().nullable(),
    yearlyPerParish: z.number().int().nonnegative().nullable(),
    note: z.string().max(1000).nullable(),
  }),
  validFrom: IsoDateSchema,
  validTo: IsoDateSchema.nullable(),
});
export type Deal = z.infer<typeof DealSchema>;

export const DealInputSchema = DealSchema.omit({ id: true, organizationId: true })
  .extend({ id: IdSchema.optional() })
  .refine((d) => d.validTo === null || d.validTo >= d.validFrom, {
    message: "validTo must not be before validFrom",
    path: ["validTo"],
  });
export type DealInput = z.input<typeof DealInputSchema>;

/** Status-only view of a parish for the diocesan onboarding overview (no content, D-89 AC3). */
export type ParishStatus = {
  tenantId: string;
  name: string;
  slug: string;
  launched: boolean;
  linkStatus: OrgLink["status"] | null;
};

/**
 * Module `organizations` — dioceses/districts, their members, parish links, HR delegations and
 * bulk deals. Organization ctx sees its own organization; tenant ctx sees links of its tenant.
 */
export interface OrganizationRepo {
  /** Org ctx: the organization of `ctx`. */
  current(ctx: Ctx): Promise<Organization | null>;
  /** Platform ctx: look an organization up by slug (for `<org-slug>.churchy.hu`). */
  findBySlug(ctx: Ctx, slug: string): Promise<Organization | null>;
  /** Platform ctx: create an organization. CONFLICT on slug clash. */
  create(ctx: Ctx, input: OrganizationInput): Promise<Organization>;

  /** Org ctx: members of the organization. */
  listMembers(ctx: Ctx): Promise<OrgMembership[]>;
  /** Org ctx: add or update a member's roles/scopes. */
  upsertMember(ctx: Ctx, input: OrgMembershipInput): Promise<OrgMembership>;

  /** Org ctx: links of the organization; tenant ctx: links of the tenant. */
  listLinks(ctx: Ctx): Promise<OrgLink[]>;
  /**
   * Request a link. Org ctx passes `tenantId`; tenant ctx passes `orgId`. The requesting side
   * counts as approved. CONFLICT if a non-revoked link already exists.
   */
  requestLink(ctx: Ctx, target: { tenantId?: string; orgId?: string }): Promise<OrgLink>;
  /** Approve the other side of a link; becomes `active` when both sides approved. */
  approveLink(ctx: Ctx, linkId: string): Promise<OrgLink>;
  /** Revoke a link from either side (immediately removes diocesan access). */
  revokeLink(ctx: Ctx, linkId: string): Promise<OrgLink>;

  /** Tenant ctx: own delegations; org ctx: delegations of all linked parishes. */
  listDelegations(ctx: Ctx): Promise<OrgDelegation[]>;
  /** Tenant ctx only (the parish decides): replace the delegated category keys for `orgId`. */
  setDelegations(ctx: Ctx, orgId: string, hrCategoryKeys: string[]): Promise<OrgDelegation[]>;

  /** Org ctx: deals of the organization. */
  listDeals(ctx: Ctx): Promise<Deal[]>;
  /** Platform ctx: create/update a deal for `organizationId`. */
  upsertDeal(ctx: Ctx, organizationId: string, input: DealInput): Promise<Deal>;
  /** Org ctx: status-only overview of provisioned and linked parishes. */
  listParishStatus(ctx: Ctx): Promise<ParishStatus[]>;
}
