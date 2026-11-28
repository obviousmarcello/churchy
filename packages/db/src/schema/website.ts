/**
 * Public-website tables (SDD §8.2): locations, service schedule (+ materialized occurrences,
 * §24.1), announcements, news posts, pages, media, request forms and pastoral requests (§8.3).
 */
import type {
  Accessibility,
  Address,
  FormField,
  Media,
  OpeningHours,
  PageBlock,
  Page,
  RichText,
} from "@churchy/contracts";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  point,
  smallint,
  text,
  time,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import {
  bytea,
  emptyArray,
  huText,
  idColumn,
  sameTenantFk,
  tenantIndexes,
  timestamps,
  timestamptz,
  tsvector,
} from "./columns";
import {
  locationKind,
  mediaKind,
  mediaVisibility,
  occurrenceStatus,
  publishStatus,
  requestStatus,
  serviceExceptionKind,
} from "./enums";
import { profiles, tenantId } from "./platform";

// ---------------------------------------------------------------------------------------------
// Media (§8.2) — files live in Supabase Storage under `t/<tenant_id>/…`

export const media = pgTable(
  "media",
  {
    id: idColumn(),
    tenantId: tenantId(),
    kind: mediaKind().notNull(),
    filename: text().notNull(),
    mimeType: text().notNull(),
    /** Object key; not unique (the demo shares placeholder files between rows). */
    storageKey: text().notNull(),
    variants: jsonb().$type<Media["variants"]>().notNull().default([]),
    width: integer(),
    height: integer(),
    bytes: integer().notNull(),
    alt: text(),
    decorative: boolean().notNull().default(false),
    caption: text(),
    peopleConsent: boolean().notNull().default(false),
    visibility: mediaVisibility().notNull().default("public"),
    uploadedBy: uuid().references(() => profiles.id, { onDelete: "set null" }),
    createdAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [...tenantIndexes("media", t), check("media_bytes_check", sql`${t.bytes} >= 0`)],
).enableRLS();

// ---------------------------------------------------------------------------------------------
// Locations (§8.2)

export const locations = pgTable(
  "locations",
  {
    id: idColumn(),
    tenantId: tenantId(),
    name: huText().notNull(),
    slug: text().notNull(),
    kind: locationKind().notNull(),
    address: jsonb().$type<Address>(),
    /** x = longitude, y = latitude */
    geo: point({ mode: "xy" }),
    openingHours: jsonb().$type<OpeningHours>().notNull().default({ weekly: [], exceptions: [] }),
    accessibility: jsonb().$type<Accessibility>().notNull(),
    photoMediaId: uuid(),
    sort: integer().notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    ...tenantIndexes("locations", t),
    unique("locations_tenant_id_slug_key").on(t.tenantId, t.slug),
    sameTenantFk("locations_photo_media_id_fkey", t.tenantId, t.photoMediaId, media),
  ],
).enableRLS();

// ---------------------------------------------------------------------------------------------
// Service schedule (§8.2, §9)

export const schedulePeriods = pgTable(
  "schedule_periods",
  {
    id: idColumn(),
    tenantId: tenantId(),
    name: huText().notNull(),
    validFrom: date({ mode: "string" }),
    validTo: date({ mode: "string" }),
    /** SDD `recurrence(yearly bool)` */
    yearly: boolean().notNull().default(false),
    priority: integer().notNull().default(0),
  },
  (t) => [
    ...tenantIndexes("schedule_periods", t),
    check(
      "schedule_periods_yearly_check",
      sql`not ${t.yearly} or (${t.validFrom} is not null and ${t.validTo} is not null)`,
    ),
  ],
).enableRLS();

export const serviceRules = pgTable(
  "service_rules",
  {
    id: idColumn(),
    tenantId: tenantId(),
    periodId: uuid().notNull(),
    locationId: uuid().notNull(),
    /** ISO weekday 1 = Monday … 7 = Sunday */
    weekday: smallint().notNull(),
    /** 1–5 = n-th weekday of the month, -1 = last; null = every week */
    nthWeek: smallint(),
    time: time().notNull(),
    durationMin: integer().notNull().default(60),
    serviceType: text().notNull(),
    language: text().notNull().default("hu"),
    title: huText(),
    note: text(),
    livestream: boolean().notNull().default(false),
  },
  (t) => [
    ...tenantIndexes("service_rules", t),
    index("service_rules_period_id_idx").on(t.periodId),
    index("service_rules_location_id_idx").on(t.locationId),
    sameTenantFk(
      "service_rules_period_id_fkey",
      t.tenantId,
      t.periodId,
      schedulePeriods,
      "cascade",
    ),
    sameTenantFk("service_rules_location_id_fkey", t.tenantId, t.locationId, locations, "cascade"),
    check("service_rules_weekday_check", sql`${t.weekday} between 1 and 7`),
    check(
      "service_rules_nth_week_check",
      sql`${t.nthWeek} is null or ${t.nthWeek} in (1, 2, 3, 4, 5, -1)`,
    ),
    check("service_rules_duration_check", sql`${t.durationMin} between 1 and 1440`),
  ],
).enableRLS();

export const serviceExceptions = pgTable(
  "service_exceptions",
  {
    id: idColumn(),
    tenantId: tenantId(),
    locationId: uuid(),
    date: date({ mode: "string" }).notNull(),
    kind: serviceExceptionKind().notNull(),
    ruleId: uuid(),
    time: time(),
    serviceType: text(),
    note: text(),
    reason: text(),
  },
  (t) => [
    ...tenantIndexes("service_exceptions", t),
    index("service_exceptions_tenant_id_date_idx").on(t.tenantId, t.date),
    sameTenantFk("service_exceptions_location_id_fkey", t.tenantId, t.locationId, locations),
    sameTenantFk("service_exceptions_rule_id_fkey", t.tenantId, t.ruleId, serviceRules),
    check("service_exceptions_modify_check", sql`${t.kind} <> 'modify' or ${t.ruleId} is not null`),
    check(
      "service_exceptions_add_check",
      sql`${t.kind} <> 'add' or (${t.locationId} is not null and ${t.time} is not null and ${t.serviceType} is not null)`,
    ),
  ],
).enableRLS();

/** Lazily materialized services (§24.1, ADR-11). */
export const serviceOccurrences = pgTable(
  "service_occurrences",
  {
    id: idColumn(),
    tenantId: tenantId(),
    locationId: uuid().notNull(),
    startsAt: timestamptz().notNull(),
    serviceType: text().notNull(),
    ruleId: uuid(),
    exceptionId: uuid(),
    status: occurrenceStatus().notNull().default("scheduled"),
    movedToId: uuid(),
  },
  (t) => [
    ...tenantIndexes("service_occurrences", t),
    unique("service_occurrences_natural_key").on(
      t.tenantId,
      t.locationId,
      t.startsAt,
      t.serviceType,
    ),
    sameTenantFk("service_occurrences_location_id_fkey", t.tenantId, t.locationId, locations),
    sameTenantFk("service_occurrences_rule_id_fkey", t.tenantId, t.ruleId, serviceRules),
    sameTenantFk(
      "service_occurrences_exception_id_fkey",
      t.tenantId,
      t.exceptionId,
      serviceExceptions,
    ),
    sameTenantFk("service_occurrences_moved_to_id_fkey", t.tenantId, t.movedToId, {
      tenantId: t.tenantId,
      id: t.id,
    }),
  ],
).enableRLS();

// ---------------------------------------------------------------------------------------------
// Announcements & news (§8.2)

export const announcements = pgTable(
  "announcements",
  {
    id: idColumn(),
    tenantId: tenantId(),
    weekSunday: date({ mode: "string" }).notNull(),
    body: jsonb().$type<RichText>(),
    pdfMediaId: uuid(),
    status: publishStatus().notNull().default("draft"),
    publishedAt: timestamptz(),
    ...timestamps(),
  },
  (t) => [
    ...tenantIndexes("announcements", t),
    unique("announcements_tenant_id_week_sunday_key").on(t.tenantId, t.weekSunday),
    sameTenantFk("announcements_pdf_media_id_fkey", t.tenantId, t.pdfMediaId, media),
    check("announcements_sunday_check", sql`extract(isodow from ${t.weekSunday}) = 7`),
    check("announcements_content_check", sql`${t.body} is not null or ${t.pdfMediaId} is not null`),
  ],
).enableRLS();

export const posts = pgTable(
  "posts",
  {
    id: idColumn(),
    tenantId: tenantId(),
    slug: text().notNull(),
    title: huText().notNull(),
    lead: text().notNull().default(""),
    body: jsonb().$type<RichText>().notNull(),
    coverMediaId: uuid(),
    categories: text().array().notNull().default(emptyArray),
    status: publishStatus().notNull().default("draft"),
    /** SDD `publish_at` (contract deviation 4: scheduled = published with a future date). */
    publishedAt: timestamptz(),
    expiresAt: timestamptz(),
    /** Accent-insensitive Hungarian search over title (A) and lead (B), L-09. */
    search: tsvector()
      .notNull()
      .generatedAlwaysAs(
        sql`setweight(public.hu_tsvector(title), 'A') || setweight(public.hu_tsvector(lead), 'B')`,
      ),
    ...timestamps(),
  },
  (t) => [
    ...tenantIndexes("posts", t),
    unique("posts_tenant_id_slug_key").on(t.tenantId, t.slug),
    index("posts_tenant_id_published_at_idx").on(t.tenantId, t.publishedAt),
    index("posts_search_idx").using("gin", t.search),
    sameTenantFk("posts_cover_media_id_fkey", t.tenantId, t.coverMediaId, media),
  ],
).enableRLS();

// ---------------------------------------------------------------------------------------------
// Pages (§8.2)

export const pages = pgTable(
  "pages",
  {
    id: idColumn(),
    tenantId: tenantId(),
    slug: text().notNull(),
    title: huText().notNull(),
    blocks: jsonb().$type<PageBlock[]>().notNull().default([]),
    parentId: uuid(),
    riteKey: text(),
    seo: jsonb().$type<Page["seo"]>().notNull().default({
      title: null,
      description: null,
      ogImageMediaId: null,
    }),
    sort: integer().notNull().default(0),
    status: publishStatus().notNull().default("draft"),
    publishedAt: timestamptz(),
    ...timestamps(),
  },
  (t) => [
    ...tenantIndexes("pages", t),
    unique("pages_tenant_id_slug_key").on(t.tenantId, t.slug),
    sameTenantFk("pages_parent_id_fkey", t.tenantId, t.parentId, {
      tenantId: t.tenantId,
      id: t.id,
    }),
  ],
).enableRLS();

// ---------------------------------------------------------------------------------------------
// Request forms & pastoral requests (§8.2, §8.3, §12)

export const formDefinitions = pgTable(
  "form_definitions",
  {
    id: idColumn(),
    tenantId: tenantId(),
    key: text().notNull(),
    title: huText().notNull(),
    fields: jsonb().$type<FormField[]>().notNull().default([]),
    notifyEmails: text().array().notNull().default(emptyArray),
    confirmationText: text().notNull().default(""),
    retentionDays: integer().notNull().default(365),
    referencePrefix: text().notNull(),
    active: boolean().notNull().default(true),
    ...timestamps(),
  },
  (t) => [
    ...tenantIndexes("form_definitions", t),
    unique("form_definitions_tenant_id_key_key").on(t.tenantId, t.key),
    check("form_definitions_retention_check", sql`${t.retentionDays} > 0`),
  ],
).enableRLS();

/**
 * Special-category data (C-03): the submitted form data and the internal notes are stored only
 * as ciphertext (`*_enc`, AES-256-GCM envelope encryption — D-30). Search is limited to
 * status/date/form by design (§8.3).
 */
export const pastoralRequests = pgTable(
  "pastoral_requests",
  {
    id: idColumn(),
    tenantId: tenantId(),
    formId: uuid().notNull(),
    formKey: text().notNull(),
    reference: text().notNull(),
    dataEnc: bytea().notNull(),
    status: requestStatus().notNull().default("uj"),
    assigneeUserId: uuid().references(() => profiles.id, { onDelete: "set null" }),
    notesEnc: bytea(),
    consentAt: timestamptz().notNull(),
    consentTextHash: text().notNull(),
    createdAt: timestamptz().notNull().defaultNow(),
    closedAt: timestamptz(),
    purgeAfter: timestamptz(),
  },
  (t) => [
    ...tenantIndexes("pastoral_requests", t),
    unique("pastoral_requests_tenant_id_reference_key").on(t.tenantId, t.reference),
    index("pastoral_requests_tenant_id_status_idx").on(t.tenantId, t.status),
    index("pastoral_requests_purge_after_idx").on(t.purgeAfter),
    sameTenantFk("pastoral_requests_form_id_fkey", t.tenantId, t.formId, formDefinitions),
  ],
).enableRLS();
