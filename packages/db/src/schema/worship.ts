/**
 * Worship & music planning (SDD §24): hymnal catalog, songs, arrangements, attachments, plan
 * templates, service plans, plan items, comments and assignments (also used for generic rotas).
 */
import type { PlanItem, PlanTemplate } from "@churchy/contracts";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import {
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
  assignmentStatus,
  attachmentKind,
  attachmentOwnerType,
  denomination,
  planItemType,
  planStatus,
  songLicence,
} from "./enums";
import { events, people, teamPositions, teams } from "./people";
import { tenantId, tenants } from "./platform";
import { media, serviceOccurrences } from "./website";

/**
 * Hymnal catalog (§24.2). `tenant_id` null = platform catalog (names/abbreviations only, no
 * songs); tenant rows are a church's own hymnals.
 */
export const hymnals = pgTable(
  "hymnals",
  {
    id: idColumn(),
    tenantId: uuid().references(() => tenants.id, { onDelete: "cascade" }),
    abbreviation: text().notNull(),
    name: huText().notNull(),
    denomination: denomination(),
  },
  (t) => [index("hymnals_tenant_id_idx").on(t.tenantId)],
).enableRLS();

export const songs = pgTable(
  "songs",
  {
    id: idColumn(),
    tenantId: tenantId(),
    title: huText().notNull(),
    altTitles: text().array().notNull().default(emptyArray),
    firstLine: text(),
    lyrics: text(),
    language: text().notNull().default("hu"),
    authors: text().array().notNull().default(emptyArray),
    composers: text().array().notNull().default(emptyArray),
    translators: text().array().notNull().default(emptyArray),
    copyrightHolder: text(),
    licence: songLicence().notNull().default("unknown"),
    licenceRef: text(),
    themes: text().array().notNull().default(emptyArray),
    seasons: text().array().notNull().default(emptyArray),
    defaultKey: text(),
    tempoBpm: integer(),
    timeSignature: text(),
    notes: text(),
    /** Accent-insensitive Hungarian search: titles (A), first line (B), lyrics (C). */
    search: tsvector()
      .notNull()
      .generatedAlwaysAs(
        sql`setweight(public.hu_tsvector(title), 'A') || setweight(public.hu_tsvector(public.hu_join(alt_titles)), 'A') || setweight(public.hu_tsvector(first_line), 'B') || setweight(public.hu_tsvector(lyrics), 'C')`,
      ),
    ...timestamps(),
  },
  (t) => [
    ...tenantIndexes("songs", t),
    index("songs_search_idx").using("gin", t.search),
    check("songs_tempo_check", sql`${t.tempoBpm} is null or ${t.tempoBpm} between 20 and 300`),
  ],
).enableRLS();

export const songHymnalRefs = pgTable(
  "song_hymnal_refs",
  {
    tenantId: tenantId(),
    songId: uuid().notNull(),
    hymnalId: uuid()
      .notNull()
      .references(() => hymnals.id),
    number: text().notNull(),
    versesNote: text(),
  },
  (t) => [
    primaryKey({ columns: [t.songId, t.hymnalId, t.number] }),
    ...tenantIndexes("song_hymnal_refs", t),
    index("song_hymnal_refs_hymnal_id_idx").on(t.hymnalId),
    sameTenantFk("song_hymnal_refs_song_id_fkey", t.tenantId, t.songId, songs, "cascade"),
  ],
).enableRLS();

export const arrangements = pgTable(
  "arrangements",
  {
    id: idColumn(),
    tenantId: tenantId(),
    songId: uuid().notNull(),
    name: huText().notNull(),
    key: text().notNull(),
    tempoBpm: integer(),
    structure: text().notNull().default(""),
    chordpro: text(),
    notes: text(),
  },
  (t) => [
    ...tenantIndexes("arrangements", t),
    index("arrangements_song_id_idx").on(t.songId),
    sameTenantFk("arrangements_song_id_fkey", t.tenantId, t.songId, songs, "cascade"),
  ],
).enableRLS();

/**
 * Internal-only attachments (§24.5). `owner_id` is polymorphic (`owner_type`), so it has no FK;
 * the adapter checks it belongs to the tenant.
 */
export const attachments = pgTable(
  "attachments",
  {
    id: idColumn(),
    tenantId: tenantId(),
    ownerType: attachmentOwnerType().notNull(),
    ownerId: uuid().notNull(),
    mediaId: uuid(),
    url: text(),
    kind: attachmentKind().notNull(),
    label: text().notNull(),
    part: text(),
    key: text(),
    version: integer().notNull().default(1),
    supersedesId: uuid(),
    rightsConfirmedBy: uuid().notNull(),
    contentHash: text(),
    disabled: boolean().notNull().default(false),
    createdAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    ...tenantIndexes("attachments", t),
    index("attachments_owner_idx").on(t.tenantId, t.ownerType, t.ownerId),
    index("attachments_content_hash_idx").on(t.contentHash),
    sameTenantFk("attachments_media_id_fkey", t.tenantId, t.mediaId, media),
    sameTenantFk("attachments_supersedes_id_fkey", t.tenantId, t.supersedesId, {
      tenantId: t.tenantId,
      id: t.id,
    }),
    sameTenantFk("attachments_rights_confirmed_by_fkey", t.tenantId, t.rightsConfirmedBy, people),
    check("attachments_source_check", sql`(${t.mediaId} is null) <> (${t.url} is null)`),
    check("attachments_version_check", sql`${t.version} > 0`),
  ],
).enableRLS();

/** `tenant_id` null = preset template (§24.2). */
export const planTemplates = pgTable(
  "plan_templates",
  {
    id: idColumn(),
    tenantId: uuid().references(() => tenants.id, { onDelete: "cascade" }),
    denomination: denomination(),
    serviceType: text().notNull(),
    name: huText().notNull(),
    items: jsonb().$type<PlanTemplate["items"]>().notNull().default([]),
  },
  (t) => [index("plan_templates_tenant_id_idx").on(t.tenantId)],
).enableRLS();

export const servicePlans = pgTable(
  "service_plans",
  {
    id: idColumn(),
    tenantId: tenantId(),
    occurrenceId: uuid(),
    eventId: uuid(),
    title: huText().notNull(),
    status: planStatus().notNull().default("draft"),
    templateId: uuid().references(() => planTemplates.id, { onDelete: "set null" }),
    leaderPersonId: uuid().notNull(),
    approvedByPersonId: uuid(),
    approvedAt: timestamptz(),
    approvedSnapshot: jsonb().$type<PlanItem[]>(),
    lockedAt: timestamptz(),
    notes: text(),
    ...timestamps(),
  },
  (t) => [
    ...tenantIndexes("service_plans", t),
    index("service_plans_occurrence_id_idx").on(t.occurrenceId),
    index("service_plans_event_id_idx").on(t.eventId),
    sameTenantFk(
      "service_plans_occurrence_id_fkey",
      t.tenantId,
      t.occurrenceId,
      serviceOccurrences,
    ),
    sameTenantFk("service_plans_event_id_fkey", t.tenantId, t.eventId, events),
    sameTenantFk("service_plans_leader_person_id_fkey", t.tenantId, t.leaderPersonId, people),
    sameTenantFk(
      "service_plans_approved_by_person_id_fkey",
      t.tenantId,
      t.approvedByPersonId,
      people,
    ),
    check("service_plans_target_check", sql`(${t.occurrenceId} is null) <> (${t.eventId} is null)`),
  ],
).enableRLS();

export const planItems = pgTable(
  "plan_items",
  {
    id: idColumn(),
    tenantId: tenantId(),
    planId: uuid().notNull(),
    /** 0-based, contiguous per plan (kept by the adapter; no unique key so reordering is cheap). */
    position: integer().notNull(),
    type: planItemType().notNull(),
    title: huText().notNull(),
    songId: uuid(),
    arrangementId: uuid(),
    keyOverride: text(),
    verses: text(),
    durationS: integer(),
    responsiblePersonId: uuid(),
    notes: text(),
  },
  (t) => [
    ...tenantIndexes("plan_items", t),
    index("plan_items_plan_id_position_idx").on(t.planId, t.position),
    sameTenantFk("plan_items_plan_id_fkey", t.tenantId, t.planId, servicePlans, "cascade"),
    sameTenantFk("plan_items_song_id_fkey", t.tenantId, t.songId, songs),
    sameTenantFk("plan_items_arrangement_id_fkey", t.tenantId, t.arrangementId, arrangements),
    sameTenantFk(
      "plan_items_responsible_person_id_fkey",
      t.tenantId,
      t.responsiblePersonId,
      people,
    ),
    check("plan_items_position_check", sql`${t.position} >= 0`),
  ],
).enableRLS();

export const planComments = pgTable(
  "plan_comments",
  {
    id: idColumn(),
    tenantId: tenantId(),
    planId: uuid().notNull(),
    itemId: uuid(),
    authorPersonId: uuid().notNull(),
    body: text().notNull(),
    mentions: uuid().array().notNull().default(emptyArray),
    resolvedAt: timestamptz(),
    createdAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    ...tenantIndexes("plan_comments", t),
    index("plan_comments_plan_id_idx").on(t.planId),
    sameTenantFk("plan_comments_plan_id_fkey", t.tenantId, t.planId, servicePlans, "cascade"),
    sameTenantFk("plan_comments_item_id_fkey", t.tenantId, t.itemId, planItems, "cascade"),
    sameTenantFk("plan_comments_author_person_id_fkey", t.tenantId, t.authorPersonId, people),
  ],
).enableRLS();

/** Position assignments for an occurrence or event; also generic rotas without a plan (§24.4). */
export const assignments = pgTable(
  "assignments",
  {
    id: idColumn(),
    tenantId: tenantId(),
    occurrenceId: uuid(),
    eventId: uuid(),
    planId: uuid(),
    teamId: uuid().notNull(),
    positionId: uuid().notNull(),
    personId: uuid().notNull(),
    /** Denormalized time window (contract deviation 5) for overlap filters. */
    startsAt: timestamptz().notNull(),
    endsAt: timestamptz().notNull(),
    status: assignmentStatus().notNull().default("requested"),
    requestedByPersonId: uuid(),
    respondedAt: timestamptz(),
    declineReason: text(),
    swapWithPersonId: uuid(),
    createdAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    ...tenantIndexes("assignments", t),
    index("assignments_person_id_starts_at_idx").on(t.personId, t.startsAt),
    index("assignments_occurrence_id_idx").on(t.occurrenceId),
    sameTenantFk("assignments_occurrence_id_fkey", t.tenantId, t.occurrenceId, serviceOccurrences),
    sameTenantFk("assignments_event_id_fkey", t.tenantId, t.eventId, events),
    sameTenantFk("assignments_plan_id_fkey", t.tenantId, t.planId, servicePlans),
    sameTenantFk("assignments_team_id_fkey", t.tenantId, t.teamId, teams),
    sameTenantFk("assignments_position_id_fkey", t.tenantId, t.positionId, teamPositions),
    sameTenantFk("assignments_person_id_fkey", t.tenantId, t.personId, people),
    sameTenantFk(
      "assignments_requested_by_person_id_fkey",
      t.tenantId,
      t.requestedByPersonId,
      people,
    ),
    sameTenantFk("assignments_swap_with_person_id_fkey", t.tenantId, t.swapWithPersonId, people),
    check("assignments_target_check", sql`(${t.occurrenceId} is null) <> (${t.eventId} is null)`),
    check("assignments_range_check", sql`${t.endsAt} > ${t.startsAt}`),
  ],
).enableRLS();
