import { z } from "zod";
import type { Ctx } from "../ctx";
import {
  AddressSchema,
  EmailSchema,
  HexColorSchema,
  IdSchema,
  IsoDateTimeSchema,
  OpeningHoursSchema,
  PhoneSchema,
  SlugSchema,
  TextSchema,
  TimestampsShape,
} from "../primitives";

// ---------------------------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------------------------

/** Denomination preset keys (SDD §5.2). */
export const DenominationSchema = z.enum(["rk", "gk", "ref", "ev", "bapt", "unit", "general"]);
export type Denomination = z.infer<typeof DenominationSchema>;

/** Website modules (SDD §5.5). */
export const ModuleKeySchema = z.enum([
  "news",
  "announcements",
  "events",
  "schedule",
  "locations",
  "staff",
  "rites",
  "groups",
  "sermons",
  "livestream",
  "gallery",
  "documents",
  "giving",
  "onlineGiving",
  "massIntentions",
  "funeralNotices",
  "newsletter",
  "search",
  "liturgicalCalendar",
]);
export type ModuleKey = z.infer<typeof ModuleKeySchema>;

/** Workspace modules (SDD §20.1). */
export const WorkspaceModuleKeySchema = z.enum([
  "ws.calendar",
  "ws.rooms",
  "ws.worship",
  "ws.rota",
  "ws.hr",
  "ws.hr.leave",
  "ws.hr.confidential",
  "ws.docs",
  "ws.board",
]);
export type WorkspaceModuleKey = z.infer<typeof WorkspaceModuleKeySchema>;

/** Workspace tier (`tenants.ws_tier`, SDD §20.1). */
export const WsTierSchema = z.enum(["none", "s50", "m150", "l300"]);
export type WsTier = z.infer<typeof WsTierSchema>;

export const TenantStatusSchema = z.enum(["active", "suspended"]);
export type TenantStatus = z.infer<typeof TenantStatusSchema>;

// ---------------------------------------------------------------------------------------------
// SiteConfig (SDD §5.2) — tenants store only overrides on top of platform defaults + preset.
// ---------------------------------------------------------------------------------------------

/** Grammatical forms of a term (SDD §5.3). Term keys are defined by `packages/presets`. */
export const TermFormsSchema = z.object({
  nom: TextSchema,
  lower: TextSchema,
  slug: SlugSchema,
  plural: TextSchema.optional(),
  article: z.enum(["a", "az"]),
});
export type TermForms = z.infer<typeof TermFormsSchema>;

const NavLinkSchema = z.object({
  label: TextSchema,
  /** Internal path (`/hirek`) or absolute external URL. */
  href: z.string().min(1).max(500),
  external: z.boolean().default(false),
});

/** Navigation item, max depth 2 (FR-106). */
export const NavItemSchema = NavLinkSchema.extend({
  children: z.array(NavLinkSchema).max(20).default([]),
});
export type NavItem = z.infer<typeof NavItemSchema>;

export const HomeSectionTypeSchema = z.enum([
  "hero",
  "nextServices",
  "announcements",
  "news",
  "events",
  "livestream",
  "quote",
  "map",
  "cta",
  "customText",
]);

/** Home composer section (FR-107); `settings` are section-type specific. */
export const HomeSectionSchema = z.object({
  id: IdSchema,
  type: HomeSectionTypeSchema,
  settings: z.record(z.string(), z.unknown()).default({}),
});
export type HomeSection = z.infer<typeof HomeSectionSchema>;

export const SiteIdentitySchema = z.object({
  name: TextSchema,
  shortName: TextSchema,
  tagline: z.string().max(200).optional(),
  logoMediaId: IdSchema.optional(),
  faviconMediaId: IdSchema.optional(),
  heroMediaIds: z.array(IdSchema).optional(),
});

export const SiteThemeSchema = z.object({
  themeId: z.enum(["klasszikus", "letisztult", "kozossegi"]),
  colors: z.object({
    primary: HexColorSchema,
    secondary: HexColorSchema,
    accent: HexColorSchema.optional(),
  }),
  fontPairing: z.enum(["serif-classic", "humanist", "modern-sans"]),
  heroStyle: z.enum(["image-full", "image-split", "text-only"]),
  radius: z.enum(["none", "small", "large"]),
});

/** Legal data for the Impresszum and privacy-notice generators (C-01, C-02). */
export const LegalDataSchema = z.object({
  controllerName: TextSchema.optional(),
  controllerAddress: AddressSchema.optional(),
  representative: TextSchema.optional(),
  taxNumber: z.string().max(30).optional(),
  registrationNumber: z.string().max(60).optional(),
  dpoContact: z.string().max(200).optional(),
  privacyNoticeVersionHash: z.string().max(128).optional(),
});

export const SiteConfigSchema = z.object({
  identity: SiteIdentitySchema,
  denomination: DenominationSchema,
  terminology: z.record(z.string(), TermFormsSchema).default({}),
  theme: SiteThemeSchema,
  modules: z.partialRecord(ModuleKeySchema, z.boolean()).default({}),
  navigation: z.array(NavItemSchema).max(12).default([]),
  home: z.array(HomeSectionSchema).default([]),
  footer: z.object({
    showMap: z.boolean(),
    links: z.array(NavLinkSchema).default([]),
    dioceseLink: z.object({ label: TextSchema, url: z.url() }).optional(),
  }),
  contact: z.object({
    email: EmailSchema.optional(),
    phone: PhoneSchema.optional(),
    address: AddressSchema.optional(),
    officeHours: OpeningHoursSchema,
  }),
  legal: LegalDataSchema.default({}),
  giving: z.object({
    accountName: z.string().max(200).optional(),
    /** Hungarian GIRO account, 16 or 24 digits (formatted 8-8-8 by `packages/hu`). */
    accountNumber: z
      .string()
      .regex(/^\d{8}-?\d{8}(-?\d{8})?$/)
      .optional(),
    iban: z
      .string()
      .regex(/^HU\d{26}$/)
      .optional(),
    reference: z.string().max(140).optional(),
    szja1TechnicalNumber: z.string().max(10).optional(),
    foundationTaxNumber: z.string().max(20).optional(),
    showQr: z.boolean().default(false),
  }),
  integrations: z.object({
    youtubeChannelUrl: z.url().optional(),
    facebookUrl: z.url().optional(),
    instagramUrl: z.url().optional(),
    livestream: z
      .object({ provider: z.enum(["youtube", "facebook", "other"]), url: z.url() })
      .optional(),
  }),
});
export type SiteConfig = z.infer<typeof SiteConfigSchema>;

/**
 * What a tenant stores: overrides only (SDD §5.1). Each section is optional and shallow-partial;
 * `effectiveConfig = deepMerge(platformDefaults, preset, overrides)` lives in `packages/presets`.
 */
export const SiteConfigOverridesSchema = z.object({
  identity: SiteIdentitySchema.partial().optional(),
  denomination: DenominationSchema.optional(),
  terminology: z.record(z.string(), TermFormsSchema).optional(),
  theme: SiteThemeSchema.partial().optional(),
  modules: z.partialRecord(ModuleKeySchema, z.boolean()).optional(),
  workspaceModules: z.partialRecord(WorkspaceModuleKeySchema, z.boolean()).optional(),
  navigation: z.array(NavItemSchema).max(12).optional(),
  home: z.array(HomeSectionSchema).optional(),
  footer: SiteConfigSchema.shape.footer.partial().optional(),
  contact: SiteConfigSchema.shape.contact.partial().optional(),
  legal: LegalDataSchema.optional(),
  giving: SiteConfigSchema.shape.giving.partial().optional(),
  integrations: SiteConfigSchema.shape.integrations.partial().optional(),
});
export type SiteConfigOverrides = z.infer<typeof SiteConfigOverridesSchema>;
export type SiteConfigOverridesInput = z.input<typeof SiteConfigOverridesSchema>;

// ---------------------------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------------------------

/** `tenants` (SDD §8.2, §20.1). */
export const TenantSchema = z.object({
  id: IdSchema,
  slug: SlugSchema,
  name: TextSchema,
  denomination: DenominationSchema,
  status: TenantStatusSchema,
  siteConfig: SiteConfigOverridesSchema,
  /** Website plan key (`plans.key`); entitlements are computed by `entitlements(tenant)`. */
  planKey: z.string().min(1),
  wsTier: WsTierSchema,
  /** Organization whose deal provisioned/bills this tenant (SDD §19.3), if any. */
  organizationId: IdSchema.nullable(),
  /** Set when the owner presses *Oldal élesítése*; until then the site shows *Hamarosan*. */
  launchedAt: IsoDateTimeSchema.nullable(),
  ...TimestampsShape,
});
export type Tenant = z.infer<typeof TenantSchema>;

export const TenantCreateInputSchema = z.object({
  slug: SlugSchema,
  name: TextSchema,
  denomination: DenominationSchema,
  planKey: z.string().min(1).default("ingyenes"),
  organizationId: IdSchema.nullable().default(null),
  siteConfig: SiteConfigOverridesSchema.default({}),
});
export type TenantCreateInput = z.input<typeof TenantCreateInputSchema>;

export const TenantUpdateInputSchema = z.object({
  name: TextSchema.optional(),
  denomination: DenominationSchema.optional(),
  status: TenantStatusSchema.optional(),
  planKey: z.string().min(1).optional(),
  wsTier: WsTierSchema.optional(),
  launchedAt: IsoDateTimeSchema.nullable().optional(),
});
export type TenantUpdateInput = z.input<typeof TenantUpdateInputSchema>;

/** `domains` (SDD §8.2). */
export const DomainSchema = z.object({
  id: IdSchema,
  tenantId: IdSchema,
  hostname: z
    .string()
    .toLowerCase()
    .regex(/^(?=.{4,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/, { message: "Expected a host name" }),
  isPrimary: z.boolean(),
  verifiedAt: IsoDateTimeSchema.nullable(),
  tlsStatus: z.enum(["pending", "issued", "failed"]),
  createdAt: IsoDateTimeSchema,
});
export type Domain = z.infer<typeof DomainSchema>;

export const DomainInputSchema = DomainSchema.pick({ hostname: true });
export type DomainInput = z.input<typeof DomainInputSchema>;

/** `redirects` (SDD §8.2) — old term slugs return 301 (FR-102). */
export const RedirectSchema = z.object({
  tenantId: IdSchema,
  fromPath: z.string().regex(/^\/\S*$/),
  toPath: z.string().regex(/^\/\S*$/),
  code: z.union([z.literal(301), z.literal(302)]),
});
export type Redirect = z.infer<typeof RedirectSchema>;
export const RedirectInputSchema = RedirectSchema.omit({ tenantId: true }).extend({
  code: RedirectSchema.shape.code.default(301),
});
export type RedirectInput = z.input<typeof RedirectInputSchema>;

/** Result of a platform host lookup (SDD §4.1). */
export type HostResolution = { tenantId: string; slug: string; primaryHostname: string | null };

// ---------------------------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------------------------

/**
 * Module `tenants` — the church itself, its stored SiteConfig overrides, domains and redirects.
 */
export interface TenantRepo {
  /** @public The tenant of `ctx` (tenant ctx), or null. Safe for anonymous visitors. */
  current(ctx: Ctx): Promise<Tenant | null>;
  /** Platform ctx only: look a tenant up by slug (for `<slug>.<domain>` hosts). */
  findBySlug(ctx: Ctx, slug: string): Promise<HostResolution | null>;
  /** Platform ctx only: look a tenant up by a **verified** custom domain (`www.` stripped by caller). */
  findByHostname(ctx: Ctx, hostname: string): Promise<HostResolution | null>;
  /** Platform or organization ctx (bulk provisioning): create a tenant. CONFLICT on slug clash. */
  create(ctx: Ctx, input: TenantCreateInput): Promise<Tenant>;
  /** Tenant ctx: update tenant-level fields. */
  update(ctx: Ctx, input: TenantUpdateInput): Promise<Tenant>;
  /** Tenant ctx: replace the stored SiteConfig overrides (validated) and return the tenant. */
  updateSiteConfig(ctx: Ctx, overrides: SiteConfigOverridesInput): Promise<Tenant>;

  /** Tenant ctx: domains of the tenant. */
  listDomains(ctx: Ctx): Promise<Domain[]>;
  /** Tenant ctx: add an unverified custom domain. CONFLICT if any tenant already uses it. */
  addDomain(ctx: Ctx, input: DomainInput): Promise<Domain>;
  /** Tenant ctx: mark a domain verified / record TLS status. */
  updateDomain(
    ctx: Ctx,
    id: string,
    patch: { verifiedAt?: string | null; tlsStatus?: Domain["tlsStatus"] },
  ): Promise<Domain>;
  /** Tenant ctx: make one domain primary (all others become non-primary). */
  setPrimaryDomain(ctx: Ctx, id: string): Promise<void>;
  /** Tenant ctx: remove a domain. NOT_FOUND if it is not the tenant's. */
  removeDomain(ctx: Ctx, id: string): Promise<void>;

  /** @public Redirect for a request path of the ctx tenant, if any. */
  findRedirect(ctx: Ctx, fromPath: string): Promise<Redirect | null>;
  /** Tenant ctx: create or replace the redirect for `fromPath`. */
  upsertRedirect(ctx: Ctx, input: RedirectInput): Promise<Redirect>;
}
