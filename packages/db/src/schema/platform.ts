/**
 * Platform & tenancy tables: tenants, domains, redirects, user profiles, memberships, plans and
 * billing (SDD §8.2, §19.1–§19.3), diocesan organizations (§25.7), audit log (§8.2).
 */
import type { Address, Deal, Entitlements, SiteConfigOverrides } from "@churchy/contracts";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { emptyArray, huText, idColumn, tenantIndexes, timestamps, timestamptz } from "./columns";
import {
  billingOwnerType,
  denomination,
  invoiceStatus,
  orgLinkStatus,
  orgRole,
  organizationKind,
  paymentMethod,
  planKey,
  planKind,
  subscriptionPeriod,
  subscriptionStatus,
  tenantRole,
  tenantStatus,
  tlsStatus,
  workspaceRole,
  wsTier,
} from "./enums";

// ---------------------------------------------------------------------------------------------
// Plans (platform catalog, §19.1)

export const plans = pgTable("plans", {
  key: planKey().primaryKey(),
  name: huText().notNull(),
  kind: planKind().notNull(),
  priceMonthly: integer().notNull(),
  priceYearly: integer().notNull(),
  entitlements: jsonb().$type<Entitlements>().notNull(),
}).enableRLS();

// ---------------------------------------------------------------------------------------------
// Organizations (§25.7, §19.3) — platform-level, not tenants

export const organizations = pgTable("organizations", {
  id: idColumn(),
  kind: organizationKind().notNull(),
  name: huText().notNull(),
  slug: text().notNull().unique(),
  denomination: denomination().notNull(),
  settings: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  ...timestamps(),
}).enableRLS();

// ---------------------------------------------------------------------------------------------
// Tenants (§8.2) — the root of every tenant-owned row

export const tenants = pgTable(
  "tenants",
  {
    id: idColumn(),
    slug: text().notNull().unique(),
    name: huText().notNull(),
    denomination: denomination().notNull(),
    status: tenantStatus().notNull().default("active"),
    /** Tenant overrides on top of the denomination preset (SDD §5.1); the full config is computed. */
    siteConfig: jsonb().$type<SiteConfigOverrides>().notNull().default({}),
    planKey: planKey()
      .notNull()
      .default("ingyenes")
      .references(() => plans.key),
    wsTier: wsTier().notNull().default("none"),
    organizationId: uuid().references(() => organizations.id),
    launchedAt: timestamptz(),
    ...timestamps(),
  },
  (t) => [index("tenants_organization_id_idx").on(t.organizationId)],
).enableRLS();

/** `tenant_id uuid not null` referencing `tenants` (cascade: a deleted tenant takes its rows). */
export const tenantId = () =>
  uuid()
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" });

/**
 * Drafts of the site builder (SDD ADR-21, D-34): an operator-owned review document built from a
 * church's existing website. Platform scope (no tenant owner; `target_tenant_id` names the existing
 * church the owner may apply it to). Only the platform role touches it; it is purged after
 * `expires_at` unless applied. The JSON holds public site content only (personal data is stripped
 * before storing).
 */
export const siteDrafts = pgTable(
  "site_drafts",
  {
    id: idColumn(),
    createdBy: uuid()
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    sourceUrl: text().notNull(),
    status: text().notNull().default("ready"),
    targetTenantId: uuid().references(() => tenants.id, { onDelete: "cascade" }),
    appliedTenantId: uuid().references(() => tenants.id, { onDelete: "set null" }),
    draft: jsonb().$type<Record<string, unknown>>().notNull(),
    expiresAt: timestamptz().notNull(),
    ...timestamps(),
  },
  (t) => [
    index("site_drafts_created_by_idx").on(t.createdBy),
    index("site_drafts_expires_at_idx").on(t.expiresAt),
    index("site_drafts_target_tenant_id_idx").on(t.targetTenantId),
    check("site_drafts_status_check", sql`${t.status} in ('ready', 'applied')`),
  ],
).enableRLS();

export const domains = pgTable(
  "domains",
  {
    id: idColumn(),
    tenantId: tenantId(),
    hostname: text().notNull(),
    isPrimary: boolean().notNull().default(false),
    verifiedAt: timestamptz(),
    tlsStatus: tlsStatus().notNull().default("pending"),
    createdAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    ...tenantIndexes("domains", t),
    uniqueIndex("domains_hostname_key").on(sql`lower(${t.hostname})`),
    uniqueIndex("domains_one_primary_per_tenant")
      .on(t.tenantId)
      .where(sql`${t.isPrimary}`),
  ],
).enableRLS();

export const redirects = pgTable(
  "redirects",
  {
    tenantId: tenantId(),
    fromPath: text().notNull(),
    toPath: text().notNull(),
    code: smallint().notNull().default(301),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.fromPath] }),
    ...tenantIndexes("redirects", t),
    check("redirects_code_check", sql`${t.code} in (301, 302)`),
  ],
).enableRLS();

// ---------------------------------------------------------------------------------------------
// Users (§8.2) — Supabase Auth owns `auth.users` (credentials, MFA, sessions). The app keeps a
// profile row keyed on the auth user id; the FK to `auth.users(id)` is added in SQL (migration
// 0002) because `auth` is not part of the Drizzle schema.

export const profiles = pgTable(
  "profiles",
  {
    /** = `auth.users.id` */
    id: uuid().primaryKey(),
    email: text().notNull(),
    name: huText().notNull(),
    /** Mirror of the Supabase Auth MFA state, maintained by the auth layer (D-04). */
    twoFactorEnabled: boolean().notNull().default(false),
    lastLoginAt: timestamptz(),
    ...timestamps(),
  },
  (t) => [uniqueIndex("profiles_email_key").on(sql`lower(${t.email})`)],
).enableRLS();

export const memberships = pgTable(
  "memberships",
  {
    tenantId: tenantId(),
    userId: uuid()
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    role: tenantRole(),
    groupIds: uuid().array().notNull().default(emptyArray),
    wsRoles: workspaceRole().array().notNull().default(emptyArray),
    teamIds: uuid().array().notNull().default(emptyArray),
    roomIds: uuid().array().notNull().default(emptyArray),
    hrCategoryIds: uuid().array().notNull().default(emptyArray),
    active: boolean().notNull().default(true),
    invitedAt: timestamptz(),
    createdAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.userId] }),
    ...tenantIndexes("memberships", t),
    index("memberships_user_id_idx").on(t.userId),
  ],
).enableRLS();

// ---------------------------------------------------------------------------------------------
// Diocesan HR delegation (§25.7)

export const orgMemberships = pgTable(
  "org_memberships",
  {
    orgId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    roles: orgRole().array().notNull(),
    categoryScopes: text().array(),
    parishScopes: uuid().array(),
  },
  (t) => [
    primaryKey({ columns: [t.orgId, t.userId] }),
    index("org_memberships_user_id_idx").on(t.userId),
    check("org_memberships_roles_check", sql`cardinality(${t.roles}) > 0`),
  ],
).enableRLS();

export const orgLinks = pgTable(
  "org_links",
  {
    id: idColumn(),
    orgId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    tenantId: tenantId(),
    status: orgLinkStatus().notNull().default("requested"),
    requestedBy: uuid()
      .notNull()
      .references(() => profiles.id),
    approvedByParish: uuid().references(() => profiles.id),
    approvedByOrg: uuid().references(() => profiles.id),
    linkedAt: timestamptz(),
    revokedAt: timestamptz(),
  },
  (t) => [
    ...tenantIndexes("org_links", t),
    index("org_links_org_id_idx").on(t.orgId),
    uniqueIndex("org_links_open_link_key")
      .on(t.orgId, t.tenantId)
      .where(sql`${t.status} <> 'revoked'`),
  ],
).enableRLS();

export const orgDelegations = pgTable(
  "org_delegations",
  {
    orgId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    tenantId: tenantId(),
    /** HR category key, or `*` for every category. */
    hrCategoryKey: text().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.orgId, t.tenantId, t.hrCategoryKey] }),
    ...tenantIndexes("org_delegations", t),
  ],
).enableRLS();

export const deals = pgTable(
  "deals",
  {
    id: idColumn(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    planKeys: planKey().array().notNull(),
    parishLimit: integer().notNull(),
    priceTerms: jsonb().$type<Deal["priceTerms"]>().notNull(),
    validFrom: date({ mode: "string" }).notNull(),
    validTo: date({ mode: "string" }),
  },
  (t) => [
    index("deals_organization_id_idx").on(t.organizationId),
    check("deals_valid_range_check", sql`${t.validTo} is null or ${t.validTo} >= ${t.validFrom}`),
    check("deals_parish_limit_check", sql`${t.parishLimit} > 0`),
  ],
).enableRLS();

// ---------------------------------------------------------------------------------------------
// Billing (§19.2) — card data is never stored (D-88 AC5)

export const billingAccounts = pgTable(
  "billing_accounts",
  {
    id: idColumn(),
    ownerType: billingOwnerType().notNull(),
    /** tenant id or organization id, depending on `owner_type`. */
    ownerId: uuid().notNull(),
    name: huText().notNull(),
    taxNumber: text(),
    address: jsonb().$type<Address>().notNull(),
    email: text().notNull(),
    paymentMethod: paymentMethod().notNull(),
    /** Reference to the Barion recurring token (never the card itself); DB-internal. */
    barionTokenRef: text(),
    ...timestamps(),
  },
  (t) => [index("billing_accounts_owner_idx").on(t.ownerType, t.ownerId)],
).enableRLS();

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: idColumn(),
    billingAccountId: uuid()
      .notNull()
      .references(() => billingAccounts.id, { onDelete: "cascade" }),
    planKey: planKey()
      .notNull()
      .references(() => plans.key),
    /** The tenant the subscription is for; null for organization-level (deal) subscriptions. */
    tenantId: uuid().references(() => tenants.id, { onDelete: "cascade" }),
    quantity: integer().notNull().default(1),
    period: subscriptionPeriod().notNull(),
    status: subscriptionStatus().notNull(),
    currentPeriodEnd: timestamptz().notNull(),
    dealId: uuid().references(() => deals.id),
  },
  (t) => [
    index("subscriptions_billing_account_id_idx").on(t.billingAccountId),
    index("subscriptions_tenant_id_idx").on(t.tenantId),
    check("subscriptions_quantity_check", sql`${t.quantity} > 0`),
  ],
).enableRLS();

export const invoices = pgTable(
  "invoices",
  {
    id: idColumn(),
    billingAccountId: uuid()
      .notNull()
      .references(() => billingAccounts.id, { onDelete: "cascade" }),
    providerInvoiceId: text(),
    number: text().notNull().unique(),
    amount: integer().notNull(),
    currency: text().notNull().default("HUF"),
    status: invoiceStatus().notNull(),
    issuedAt: timestamptz().notNull(),
    paidAt: timestamptz(),
    pdfUrl: text(),
  },
  (t) => [
    index("invoices_billing_account_id_idx").on(t.billingAccountId),
    check("invoices_currency_check", sql`${t.currency} = 'HUF'`),
    check("invoices_amount_check", sql`${t.amount} >= 0`),
  ],
).enableRLS();

/** Idempotency for payment-provider callbacks (§19.2): only a hash of the payload is kept. */
export const paymentEvents = pgTable(
  "payment_events",
  {
    id: idColumn(),
    provider: text().notNull(),
    externalId: text().notNull(),
    kind: text().notNull(),
    payloadHash: text().notNull(),
    receivedAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [uniqueIndex("payment_events_idempotency_key").on(t.provider, t.externalId, t.kind)],
).enableRLS();

// ---------------------------------------------------------------------------------------------
// Audit log (§8.2, §25.4, §25.7) — written by the server/policy layer. `tenant_id` is null for
// platform events; diocesan reads carry `actor_org_id` and the parish's `tenant_id`. No foreign
// keys on purpose: entries outlive the rows they describe. IPs only as salted hash (D-40).

export const auditLog = pgTable(
  "audit_log",
  {
    id: idColumn(),
    tenantId: uuid(),
    actorUserId: uuid(),
    actorOrgId: uuid(),
    action: text().notNull(),
    entity: text().notNull(),
    entityId: text(),
    diff: jsonb().$type<Record<string, unknown>>(),
    ipHash: text(),
    at: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_tenant_id_at_idx").on(t.tenantId, t.at),
    index("audit_log_actor_org_id_idx").on(t.actorOrgId),
  ],
).enableRLS();
