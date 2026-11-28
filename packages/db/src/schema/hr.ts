/**
 * HR request management (SDD §25): categories, tickets, messages, approvals, absences, staff
 * profiles, leave entitlements and the platform workday calendar.
 *
 * Every free-text or form field of a ticket is stored only as ciphertext (`*_enc`, per-tenant
 * envelope encryption — D-30, §8.3/§28). These tables (plus `absences`, `leave_entitlements`,
 * `staff_profiles`) are the only ones that get the diocesan RLS branch in D-03 (§4.2, §25.7).
 */
import type { ApprovalStep, FormField, LeaveEntitlement, StaffProfile } from "@churchy/contracts";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  real,
  text,
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
} from "./columns";
import {
  absenceStatus,
  employer,
  employmentType,
  hrDecision,
  hrTicketStatus,
  hrWhoCanSubmit,
  workdayKind,
} from "./enums";
import { people } from "./people";
import { tenantId } from "./platform";

export const hrCategories = pgTable(
  "hr_categories",
  {
    id: idColumn(),
    tenantId: tenantId(),
    key: text().notNull(),
    name: huText().notNull(),
    fields: jsonb().$type<FormField[]>().notNull().default([]),
    whoCanSubmit: hrWhoCanSubmit().notNull().default("all"),
    /** SDD `handler_scope` (contract deviation 6). */
    handlerPersonIds: uuid().array().notNull().default(emptyArray),
    approvalChain: jsonb().$type<ApprovalStep[]>().notNull().default([]),
    slaHours: integer(),
    confidential: boolean().notNull().default(false),
    allowAnonymous: boolean().notNull().default(false),
    createsAbsence: boolean().notNull().default(false),
    absenceType: text(),
    retentionDays: integer().notNull().default(1095),
    active: boolean().notNull().default(true),
    /** Diocesan template origin (`org_hr_templates` is D-86, P1 — no FK yet). */
    templateId: uuid(),
    templateVersion: integer(),
  },
  (t) => [
    ...tenantIndexes("hr_categories", t),
    unique("hr_categories_tenant_id_key_key").on(t.tenantId, t.key),
    check(
      "hr_categories_absence_check",
      sql`not ${t.createsAbsence} or ${t.absenceType} is not null`,
    ),
    check("hr_categories_retention_check", sql`${t.retentionDays} > 0`),
  ],
).enableRLS();

export const hrTickets = pgTable(
  "hr_tickets",
  {
    id: idColumn(),
    tenantId: tenantId(),
    /** e.g. `HR-2026-0012` — the only identifier that appears in emails (§25.5). */
    reference: text().notNull(),
    categoryId: uuid().notNull(),
    /** Denormalized for delegation matching in RLS (contract deviation 6). */
    categoryKey: text().notNull(),
    /** Null for anonymous tickets (§25.4). */
    requesterPersonId: uuid(),
    anonymous: boolean().notNull().default(false),
    subjectEnc: bytea().notNull(),
    dataEnc: bytea().notNull(),
    status: hrTicketStatus().notNull().default("uj"),
    currentStep: integer().notNull().default(0),
    assigneePersonId: uuid(),
    dueAt: timestamptz(),
    confidential: boolean().notNull().default(false),
    /** _Átadás_ record (recipient, date, summary) — sensitive, therefore encrypted. */
    handoverEnc: bytea(),
    closedAt: timestamptz(),
    purgeAfter: timestamptz(),
    ...timestamps(),
  },
  (t) => [
    ...tenantIndexes("hr_tickets", t),
    unique("hr_tickets_tenant_id_reference_key").on(t.tenantId, t.reference),
    index("hr_tickets_tenant_id_status_idx").on(t.tenantId, t.status),
    index("hr_tickets_category_id_idx").on(t.categoryId),
    index("hr_tickets_purge_after_idx").on(t.purgeAfter),
    sameTenantFk("hr_tickets_category_id_fkey", t.tenantId, t.categoryId, hrCategories),
    sameTenantFk("hr_tickets_requester_person_id_fkey", t.tenantId, t.requesterPersonId, people),
    sameTenantFk("hr_tickets_assignee_person_id_fkey", t.tenantId, t.assigneePersonId, people),
    check("hr_tickets_anonymous_check", sql`${t.anonymous} = (${t.requesterPersonId} is null)`),
  ],
).enableRLS();

export const hrTicketMessages = pgTable(
  "hr_ticket_messages",
  {
    id: idColumn(),
    tenantId: tenantId(),
    ticketId: uuid().notNull(),
    authorPersonId: uuid(),
    bodyEnc: bytea().notNull(),
    internal: boolean().notNull().default(false),
    /** HR attachments are encrypted before upload (§25.1). */
    attachmentMediaIds: uuid().array().notNull().default(emptyArray),
    createdAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    ...tenantIndexes("hr_ticket_messages", t),
    index("hr_ticket_messages_ticket_id_idx").on(t.ticketId),
    sameTenantFk("hr_ticket_messages_ticket_id_fkey", t.tenantId, t.ticketId, hrTickets, "cascade"),
    sameTenantFk("hr_ticket_messages_author_person_id_fkey", t.tenantId, t.authorPersonId, people),
  ],
).enableRLS();

export const hrApprovals = pgTable(
  "hr_approvals",
  {
    id: idColumn(),
    tenantId: tenantId(),
    ticketId: uuid().notNull(),
    step: integer().notNull(),
    approverPersonId: uuid().notNull(),
    decision: hrDecision().notNull(),
    commentEnc: bytea(),
    decidedAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    ...tenantIndexes("hr_approvals", t),
    index("hr_approvals_ticket_id_idx").on(t.ticketId),
    sameTenantFk("hr_approvals_ticket_id_fkey", t.tenantId, t.ticketId, hrTickets, "cascade"),
    sameTenantFk("hr_approvals_approver_person_id_fkey", t.tenantId, t.approverPersonId, people),
    check("hr_approvals_step_check", sql`${t.step} >= 0`),
  ],
).enableRLS();

/** SDD `period daterange` → inclusive `start_date`/`end_date` (contract deviation 1). */
export const absences = pgTable(
  "absences",
  {
    id: idColumn(),
    tenantId: tenantId(),
    personId: uuid().notNull(),
    startDate: date({ mode: "string" }).notNull(),
    endDate: date({ mode: "string" }).notNull(),
    halfDayStart: boolean().notNull().default(false),
    halfDayEnd: boolean().notNull().default(false),
    type: text().notNull(),
    workingDays: numeric({ precision: 6, scale: 1 }).notNull(),
    ticketId: uuid(),
    status: absenceStatus().notNull().default("requested"),
    createdAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    ...tenantIndexes("absences", t),
    index("absences_person_id_start_date_idx").on(t.personId, t.startDate),
    sameTenantFk("absences_person_id_fkey", t.tenantId, t.personId, people, "cascade"),
    sameTenantFk("absences_ticket_id_fkey", t.tenantId, t.ticketId, hrTickets),
    check("absences_range_check", sql`${t.endDate} >= ${t.startDate}`),
    check(
      "absences_working_days_check",
      sql`${t.workingDays} >= 0 and ${t.workingDays} * 2 = trunc(${t.workingDays} * 2)`,
    ),
  ],
).enableRLS();

export const staffProfiles = pgTable(
  "staff_profiles",
  {
    tenantId: tenantId(),
    personId: uuid().primaryKey(),
    position: text().notNull(),
    employmentType: employmentType().notNull(),
    /** `org` = employed by the diocese, serving in this parish (§25.7). */
    employer: employer().notNull().default("parish"),
    startDate: date({ mode: "string" }).notNull(),
    endDate: date({ mode: "string" }),
    managerPersonId: uuid(),
    weeklyHours: real().notNull(),
    workPattern: jsonb()
      .$type<StaffProfile["workPattern"]>()
      .notNull()
      .default({ weekdays: [1, 2, 3, 4, 5] }),
  },
  (t) => [
    ...tenantIndexes("staff_profiles", t),
    sameTenantFk("staff_profiles_person_id_fkey", t.tenantId, t.personId, people, "cascade"),
    sameTenantFk("staff_profiles_manager_person_id_fkey", t.tenantId, t.managerPersonId, people),
    check("staff_profiles_weekly_hours_check", sql`${t.weeklyHours} between 0 and 80`),
  ],
).enableRLS();

export const leaveEntitlements = pgTable(
  "leave_entitlements",
  {
    tenantId: tenantId(),
    personId: uuid().notNull(),
    year: integer().notNull(),
    daysTotal: numeric({ precision: 6, scale: 1 }).notNull(),
    carriedOver: numeric({ precision: 6, scale: 1 }).notNull().default("0"),
    adjustments: jsonb().$type<LeaveEntitlement["adjustments"]>().notNull().default([]),
    note: text(),
  },
  (t) => [
    primaryKey({ columns: [t.personId, t.year] }),
    ...tenantIndexes("leave_entitlements", t),
    sameTenantFk("leave_entitlements_person_id_fkey", t.tenantId, t.personId, people, "cascade"),
    check("leave_entitlements_year_check", sql`${t.year} between 2000 and 2100`),
  ],
).enableRLS();

/** Platform-maintained public holidays and swapped working days (L-12, §25.3). */
export const workdayCalendar = pgTable("workday_calendar", {
  date: date({ mode: "string" }).primaryKey(),
  kind: workdayKind().notNull(),
  name: huText().notNull(),
}).enableRLS();
