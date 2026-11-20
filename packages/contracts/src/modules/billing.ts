import { z } from "zod";
import type { Ctx } from "../ctx";
import { AddressSchema, EmailSchema, IdSchema, IsoDateTimeSchema, TextSchema } from "../primitives";
import { ModuleKeySchema, WorkspaceModuleKeySchema, WsTierSchema } from "./tenants";

/** Platform plan keys (SDD §19.1). */
export const PlanKeySchema = z.enum(["ingyenes", "teljes", "ws_s50", "ws_m150", "ws_l300"]);
export type PlanKey = z.infer<typeof PlanKeySchema>;

/** Feature limits of a plan (SDD §19.1). Only `entitlements(tenant)` interprets them. */
export const EntitlementsSchema = z.object({
  customDomain: z.boolean(),
  storageGb: z.number().nonnegative(),
  /** null = unlimited. */
  maxEditors: z.number().int().positive().nullable(),
  modules: z.array(ModuleKeySchema),
  footerCredit: z.boolean(),
  workspaceAllowed: z.boolean(),
  wsTier: WsTierSchema.default("none"),
  wsModules: z.array(WorkspaceModuleKeySchema).default([]),
  /** Active workspace user cap; null = not applicable. */
  maxWorkspaceUsers: z.number().int().positive().nullable().default(null),
});
export type Entitlements = z.infer<typeof EntitlementsSchema>;

/** `plans` (platform-defined, SDD §19.1). Prices in whole HUF. */
export const PlanSchema = z.object({
  key: PlanKeySchema,
  name: TextSchema,
  kind: z.enum(["website", "workspace"]),
  priceMonthly: z.number().int().nonnegative(),
  priceYearly: z.number().int().nonnegative(),
  entitlements: EntitlementsSchema,
});
export type Plan = z.infer<typeof PlanSchema>;

/** `billing_accounts` (SDD §19.2). The Barion token reference stays inside the DB adapter. */
export const BillingAccountSchema = z.object({
  id: IdSchema,
  ownerType: z.enum(["tenant", "organization"]),
  ownerId: IdSchema,
  name: TextSchema,
  taxNumber: z
    .string()
    .regex(/^\d{8}-\d-\d{2}$/, { message: "Expected a Hungarian tax number (12345678-1-42)" })
    .nullable(),
  address: AddressSchema,
  email: EmailSchema,
  paymentMethod: z.enum(["card", "transfer"]),
});
export type BillingAccount = z.infer<typeof BillingAccountSchema>;

export const BillingAccountInputSchema = BillingAccountSchema.omit({
  id: true,
  ownerType: true,
  ownerId: true,
}).extend({ taxNumber: BillingAccountSchema.shape.taxNumber.default(null) });
export type BillingAccountInput = z.input<typeof BillingAccountInputSchema>;

/** `subscriptions` (SDD §19.2). */
export const SubscriptionSchema = z.object({
  id: IdSchema,
  billingAccountId: IdSchema,
  planKey: PlanKeySchema,
  tenantId: IdSchema.nullable(),
  quantity: z.number().int().positive(),
  period: z.enum(["monthly", "yearly"]),
  status: z.enum(["trialing", "active", "past_due", "cancelled"]),
  currentPeriodEnd: IsoDateTimeSchema,
  dealId: IdSchema.nullable(),
});
export type Subscription = z.infer<typeof SubscriptionSchema>;

export const SubscriptionInputSchema = SubscriptionSchema.omit({
  id: true,
  billingAccountId: true,
}).extend({
  quantity: z.number().int().positive().default(1),
  dealId: IdSchema.nullable().default(null),
});
export type SubscriptionInput = z.input<typeof SubscriptionInputSchema>;

/** `invoices` (SDD §19.2). Amounts in whole HUF. */
export const InvoiceSchema = z.object({
  id: IdSchema,
  billingAccountId: IdSchema,
  providerInvoiceId: z.string().nullable(),
  number: z.string().min(1),
  amount: z.number().int().nonnegative(),
  currency: z.literal("HUF"),
  status: z.enum(["proforma", "issued", "paid", "void"]),
  issuedAt: IsoDateTimeSchema,
  paidAt: IsoDateTimeSchema.nullable(),
  pdfUrl: z.url().nullable(),
});
export type Invoice = z.infer<typeof InvoiceSchema>;

/** Inputs of `entitlements(tenant)`: active plans plus the deal that covers the tenant, if any. */
export type EntitlementSources = {
  websitePlan: Plan;
  workspacePlan: Plan | null;
  deal: { id: string; planKeys: PlanKey[]; validFrom: string; validTo: string | null } | null;
};

/**
 * Module `billing` — plans, entitlement sources, billing accounts, subscriptions, invoices.
 * Billing accounts belong to a tenant (tenant ctx) or an organization (org ctx).
 */
export interface BillingRepo {
  /** Any ctx: the platform plan catalog (public pricing data). */
  listPlans(ctx: Ctx): Promise<Plan[]>;
  /** Tenant ctx: the plan + deal data that `entitlements(tenant)` merges. */
  getEntitlementSources(ctx: Ctx): Promise<EntitlementSources>;
  /** Tenant or org ctx: the owner's billing account, or null (anonymous: null). */
  getBillingAccount(ctx: Ctx): Promise<BillingAccount | null>;
  /** Tenant or org ctx: create/update the owner's billing account. */
  upsertBillingAccount(ctx: Ctx, input: BillingAccountInput): Promise<BillingAccount>;
  /** Tenant or org ctx: subscriptions billed to the owner's account. */
  listSubscriptions(ctx: Ctx): Promise<Subscription[]>;
  /** Tenant or org ctx: add a subscription to the owner's account (NOT_FOUND without account). */
  createSubscription(ctx: Ctx, input: SubscriptionInput): Promise<Subscription>;
  /** Tenant or org ctx: change a subscription's status/period end (payment callbacks, dunning). */
  updateSubscription(
    ctx: Ctx,
    id: string,
    patch: Partial<Pick<Subscription, "status" | "currentPeriodEnd" | "planKey">>,
  ): Promise<Subscription>;
  /** Tenant or org ctx: invoices of the owner's account, newest first. */
  listInvoices(ctx: Ctx): Promise<Invoice[]>;
}
