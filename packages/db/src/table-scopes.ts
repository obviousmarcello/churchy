/**
 * How every table is scoped (SDD §4.2). The automated schema check (`schema.test.ts`, and
 * `db.test.ts` against a real database) fails when a table is added without being classified
 * here, or when a tenant table lacks a non-null, indexed `tenant_id`. D-03 builds the RLS
 * policies from the same classification.
 *
 * - `tenant`: tenant-owned; `tenant_id uuid not null` + index. RLS keyed on `app.tenant_id`.
 * - `catalog`: platform rows (`tenant_id` null) shared with tenant rows (`tenant_id` set).
 * - `platform`: no tenant owner (platform catalogs, users, organizations, billing, audit).
 *   A `tenant_id` column here is an optional reference, never an owner.
 *
 * `hr` marks the tables that additionally get the diocesan `app.org_id` branch (§4.2, §25.7).
 */
export type TableScope = "tenant" | "catalog" | "platform";

export const TABLE_SCOPES = {
  // platform & tenancy
  plans: "platform",
  organizations: "platform",
  tenants: "platform",
  profiles: "platform",
  org_memberships: "platform",
  deals: "platform",
  billing_accounts: "platform",
  subscriptions: "platform",
  invoices: "platform",
  payment_events: "platform",
  audit_log: "platform",
  workday_calendar: "platform",
  notification_prefs: "platform",
  domains: "tenant",
  redirects: "tenant",
  memberships: "tenant",
  org_links: "tenant",
  org_delegations: "tenant",
  // website
  media: "tenant",
  locations: "tenant",
  schedule_periods: "tenant",
  service_rules: "tenant",
  service_exceptions: "tenant",
  service_occurrences: "tenant",
  announcements: "tenant",
  posts: "tenant",
  pages: "tenant",
  form_definitions: "tenant",
  pastoral_requests: "tenant",
  // people, calendars, rooms
  people: "tenant",
  availability_blocks: "tenant",
  teams: "tenant",
  team_positions: "tenant",
  team_members: "tenant",
  calendars: "tenant",
  events: "tenant",
  rooms: "tenant",
  service_room_blocks: "tenant",
  booking_series: "tenant",
  bookings: "tenant",
  booking_conflicts: "tenant",
  // worship
  hymnals: "catalog",
  songs: "tenant",
  song_hymnal_refs: "tenant",
  arrangements: "tenant",
  attachments: "tenant",
  plan_templates: "catalog",
  service_plans: "tenant",
  plan_items: "tenant",
  plan_comments: "tenant",
  assignments: "tenant",
  // HR
  hr_categories: "tenant",
  hr_tickets: "tenant",
  hr_ticket_messages: "tenant",
  hr_approvals: "tenant",
  absences: "tenant",
  staff_profiles: "tenant",
  leave_entitlements: "tenant",
  // notifications
  notifications: "tenant",
} as const satisfies Record<string, TableScope>;

export type TableName = keyof typeof TABLE_SCOPES;

/** Tables with the diocesan HR delegation branch (SDD §4.2: `hr_*`, absences, entitlements, staff profiles). */
export const HR_TABLES: readonly TableName[] = [
  "hr_categories",
  "hr_tickets",
  "hr_ticket_messages",
  "hr_approvals",
  "absences",
  "leave_entitlements",
  "staff_profiles",
];

export function tablesWithScope(scope: TableScope): TableName[] {
  return (Object.keys(TABLE_SCOPES) as TableName[]).filter((t) => TABLE_SCOPES[t] === scope);
}
