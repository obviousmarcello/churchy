/**
 * Shared tables both streams depend on, in their final shape (ADR-16): `people` (public staff page
 * and workspace directory, §8.2/§21.1), `teams`, `team_positions`, `team_members`, `calendars` and
 * the single `events` table with `calendar_id` + `visibility` (§22.1). Plus `availability_blocks`.
 */
import { setlists, volunteerTemplates } from "./music";
import type { Calendar, ContactVisibility, RichText } from "@churchy/contracts";
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
  text,
  unique,
  uniqueIndex,
  uuid,
  type PgTableExtraConfigValue,
} from "drizzle-orm/pg-core";
import {
  emptyArray,
  huText,
  idColumn,
  sameTenantFk,
  tenantIndexes,
  timestamps,
  timestamptz,
} from "./columns";
import { calendarKind, eventStatus, eventVisibility, staffGroup, teamKind } from "./enums";
import { profiles, tenantId } from "./platform";
import { locations, media } from "./website";

export const people = pgTable(
  "people",
  {
    id: idColumn(),
    tenantId: tenantId(),
    /** Login link (`profiles.id` = Supabase auth user id); null for people without a login. */
    userId: uuid().references(() => profiles.id, { onDelete: "set null" }),
    prefix: text(),
    familyName: huText().notNull(),
    givenName: huText().notNull(),
    suffix: text(),
    roleTitle: text(),
    /** SDD `group` (contract deviation 2). */
    staffGroup: staffGroup().notNull().default("volunteer"),
    isPublic: boolean().notNull().default(false),
    bio: text(),
    email: text(),
    phone: text(),
    contactVisibility: jsonb()
      .$type<{ email: ContactVisibility; phone: ContactVisibility }>()
      .notNull()
      .default({ email: "workspace", phone: "workspace" }),
    skills: text().array().notNull().default(emptyArray),
    photoMediaId: uuid(),
    isMinor: boolean().notNull().default(false),
    guardianEmail: text(),
    active: boolean().notNull().default(true),
    sort: integer().notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    ...tenantIndexes("people", t),
    unique("people_tenant_id_user_id_key").on(t.tenantId, t.userId),
    index("people_tenant_id_name_idx").on(t.tenantId, t.familyName, t.givenName),
    sameTenantFk("people_photo_media_id_fkey", t.tenantId, t.photoMediaId, media),
  ],
).enableRLS();

/** Self-declared unavailability (§21.1); SDD `period tstzrange` → `from_at`/`to_at`. */
export const availabilityBlocks = pgTable(
  "availability_blocks",
  {
    id: idColumn(),
    tenantId: tenantId(),
    personId: uuid().notNull(),
    fromAt: timestamptz().notNull(),
    toAt: timestamptz().notNull(),
    rrule: text(),
    note: text(),
  },
  (t) => [
    ...tenantIndexes("availability_blocks", t),
    index("availability_blocks_person_id_idx").on(t.personId),
    sameTenantFk("availability_blocks_person_id_fkey", t.tenantId, t.personId, people, "cascade"),
    check("availability_blocks_range_check", sql`${t.toAt} > ${t.fromAt}`),
  ],
).enableRLS();

export const teams = pgTable(
  "teams",
  {
    id: idColumn(),
    tenantId: tenantId(),
    name: huText().notNull(),
    kind: teamKind().notNull(),
    description: text(),
    calendarId: uuid(),
  },
  (t): PgTableExtraConfigValue[] => [
    ...tenantIndexes("teams", t),
    sameTenantFk("teams_calendar_id_fkey", t.tenantId, t.calendarId, calendars),
  ],
).enableRLS();

export const teamPositions = pgTable(
  "team_positions",
  {
    id: idColumn(),
    tenantId: tenantId(),
    teamId: uuid().notNull(),
    name: huText().notNull(),
    sort: integer().notNull().default(0),
    minCount: integer().notNull().default(1),
    maxCount: integer(),
  },
  (t) => [
    ...tenantIndexes("team_positions", t),
    index("team_positions_team_id_idx").on(t.teamId),
    sameTenantFk("team_positions_team_id_fkey", t.tenantId, t.teamId, teams, "cascade"),
    check(
      "team_positions_count_check",
      sql`${t.minCount} >= 0 and (${t.maxCount} is null or ${t.maxCount} >= ${t.minCount})`,
    ),
  ],
).enableRLS();

export const teamMembers = pgTable(
  "team_members",
  {
    tenantId: tenantId(),
    teamId: uuid().notNull(),
    personId: uuid().notNull(),
    isLeader: boolean().notNull().default(false),
    /** SDD `positions uuid[]` */
    positionIds: uuid().array().notNull().default(emptyArray),
    maxAssignmentsPerMonth: integer(),
    notes: text(),
  },
  (t) => [
    primaryKey({ columns: [t.teamId, t.personId] }),
    ...tenantIndexes("team_members", t),
    index("team_members_person_id_idx").on(t.personId),
    sameTenantFk("team_members_team_id_fkey", t.tenantId, t.teamId, teams, "cascade"),
    sameTenantFk("team_members_person_id_fkey", t.tenantId, t.personId, people, "cascade"),
  ],
).enableRLS();

export const calendars = pgTable(
  "calendars",
  {
    id: idColumn(),
    tenantId: tenantId(),
    name: huText().notNull(),
    color: text().notNull(),
    kind: calendarKind().notNull(),
    ownerPersonId: uuid(),
    teamId: uuid(),
    defaultVisibility: eventVisibility().notNull().default("staff"),
    editors: jsonb().$type<Calendar["editors"]>().notNull().default({ roles: [], teamIds: [] }),
    /** Music merge (phase 4): the tenant's one calendar of music events (the music role sees only it). */
    isMusic: boolean().notNull().default(false),
  },
  (t): PgTableExtraConfigValue[] => [
    ...tenantIndexes("calendars", t),
    uniqueIndex("calendars_one_music_idx")
      .on(t.tenantId)
      .where(sql`${t.isMusic}`),
    sameTenantFk("calendars_owner_person_id_fkey", t.tenantId, t.ownerPersonId, people),
    sameTenantFk("calendars_team_id_fkey", t.tenantId, t.teamId, teams),
    check("calendars_color_check", sql`${t.color} ~ '^#[0-9a-fA-F]{6}$'`),
  ],
).enableRLS();

/**
 * One table for public and internal events (§22.1, ADR-9). The public website reads only
 * `visibility = 'public' and status = 'published'`.
 */
export const events = pgTable(
  "events",
  {
    id: idColumn(),
    // The default lets the music role (supabase-js, tenant JWT) insert without naming the tenant.
    tenantId: tenantId().default(sql`app.current_tenant_id()`),
    calendarId: uuid().notNull(),
    visibility: eventVisibility().notNull(),
    slug: text().notNull(),
    title: huText().notNull(),
    body: jsonb().$type<RichText>(),
    startsAt: timestamptz().notNull(),
    endsAt: timestamptz(),
    allDay: boolean().notNull().default(false),
    rrule: text(),
    exdates: date({ mode: "string" }).array().notNull().default(emptyArray),
    /** Single-occurrence override of a recurring event (contract deviation 3). */
    parentEventId: uuid(),
    recurrenceId: timestamptz(),
    locationId: uuid(),
    /** Groups module is P1 (FR-011); the FK is added together with the `groups` table. */
    groupId: uuid(),
    teamId: uuid(),
    category: text(),
    coverMediaId: uuid(),
    status: eventStatus().notNull().default("draft"),
    createdBy: uuid().references(() => profiles.id, { onDelete: "set null" }),
    /** Reserved for a later CalDAV/Graph sync adapter (§22.2). */
    externalRef: text(),
    /** Music merge (phase 4): the event's own setlist (one per event), a live-stream link, and a
     * private flag (only creator and music admins see it). */
    setlistId: uuid(),
    youtubeUrl: text(),
    isPrivate: boolean().notNull().default(false),
    /** The music areas that see the event; empty: everyone (the root area). */
    areaIds: uuid().array().notNull().default(emptyArray),
    /** The volunteer template the event's team started from (music module). */
    volunteerTemplateId: uuid(),
    ...timestamps(),
  },
  (t) => [
    ...tenantIndexes("events", t),
    unique("events_tenant_id_setlist_id_key").on(t.tenantId, t.setlistId),
    sameTenantFk("events_setlist_id_fkey", t.tenantId, t.setlistId, setlists),
    sameTenantFk(
      "events_volunteer_template_id_fkey",
      t.tenantId,
      t.volunteerTemplateId,
      volunteerTemplates,
    ),
    index("events_area_ids_idx").using("gin", t.areaIds),
    check(
      "events_youtube_url_check",
      sql`${t.youtubeUrl} is null or (char_length(${t.youtubeUrl}) <= 500 and ${t.youtubeUrl} ~ '^https://(((www|m|music)\\.)?youtube\\.com|youtu\\.be)/')`,
    ),
    unique("events_tenant_id_slug_key").on(t.tenantId, t.slug),
    index("events_tenant_id_starts_at_idx").on(t.tenantId, t.startsAt),
    index("events_calendar_id_idx").on(t.calendarId),
    index("events_public_idx")
      .on(t.tenantId, t.startsAt)
      .where(sql`${t.visibility} = 'public' and ${t.status} = 'published'`),
    sameTenantFk("events_calendar_id_fkey", t.tenantId, t.calendarId, calendars),
    sameTenantFk(
      "events_parent_event_id_fkey",
      t.tenantId,
      t.parentEventId,
      { tenantId: t.tenantId, id: t.id },
      "cascade",
    ),
    sameTenantFk("events_location_id_fkey", t.tenantId, t.locationId, locations),
    sameTenantFk("events_team_id_fkey", t.tenantId, t.teamId, teams),
    sameTenantFk("events_cover_media_id_fkey", t.tenantId, t.coverMediaId, media),
    check("events_range_check", sql`${t.endsAt} is null or ${t.endsAt} >= ${t.startsAt}`),
    check("events_override_check", sql`(${t.parentEventId} is null) = (${t.recurrenceId} is null)`),
  ],
).enableRLS();
