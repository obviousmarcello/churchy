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
 * `MUSIC_TABLES` are the music module's tables (Music Sheet DB, PLAN §4): the only tables the
 * role `churchy_music` (per-request music JWT through PostgREST, ADR-20) may access.
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
  song_hymnal_refs: "tenant",
  attachments: "tenant",
  plan_templates: "catalog",
  service_plans: "tenant",
  plan_items: "tenant",
  plan_comments: "tenant",
  assignments: "tenant",
  // music module (docs/music-merge/PLAN.md §4, MUSIC_TABLES); songs/arrangements replace Churchy's
  annotations: "tenant",
  announcement_calendars: "tenant",
  announcement_settings: "tenant",
  app_config: "tenant",
  app_modules: "tenant",
  arrangements: "tenant",
  calendar_feeds: "tenant",
  course_images: "tenant",
  course_lessons: "tenant",
  courses: "tenant",
  email_templates: "tenant",
  mixer_settings: "tenant",
  notification_preferences: "tenant",
  projection_themes: "tenant",
  projection_video_uploads: "tenant",
  push_subscriptions: "tenant",
  scripture_books: "catalog",
  song_rights: "catalog",
  scripture_verse_cache: "catalog",
  setlist_item_durations: "tenant",
  setlist_item_themes: "tenant",
  setlist_items: "tenant",
  setlists: "tenant",
  sheet_marks: "tenant",
  song_image_arrangements: "tenant",
  song_image_pages: "tenant",
  song_image_stray_files: "tenant",
  song_images: "tenant",
  song_link_arrangements: "tenant",
  song_links: "tenant",
  song_pdf_arrangements: "tenant",
  song_pdf_uploads: "tenant",
  song_pdfs: "tenant",
  song_rights_proposals: "tenant",
  song_rights_research_settings: "tenant",
  song_scores: "tenant",
  song_sound_file_arrangements: "tenant",
  song_sound_file_uploads: "tenant",
  song_sound_files: "tenant",
  songs: "tenant",
  stray_files: "tenant",
  user_arrangement_views: "tenant",
  user_arrangements: "tenant",
  user_file_views: "tenant",
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

/**
 * Churchy tables the music role shares (phase 4): besides `tenant_isolation` they carry the
 * RESTRICTIVE `music_scope` policy that limits `churchy_music` to the music calendar and its events.
 */
export const MUSIC_SHARED_TABLES: readonly TableName[] = ["calendars", "events"];

/** Music module tables: also granted to `churchy_music`; no other table is (0007_music_rls). */
export const MUSIC_TABLES: readonly TableName[] = [
  "calendars",
  "events",
  "annotations",
  "announcement_calendars",
  "announcement_settings",
  "app_config",
  "app_modules",
  "arrangements",
  "calendar_feeds",
  "course_images",
  "course_lessons",
  "courses",
  "email_templates",
  "mixer_settings",
  "notification_preferences",
  "projection_themes",
  "projection_video_uploads",
  "push_subscriptions",
  "scripture_books",
  "song_rights",
  "scripture_verse_cache",
  "setlist_item_durations",
  "setlist_item_themes",
  "setlist_items",
  "setlists",
  "sheet_marks",
  "song_image_arrangements",
  "song_image_pages",
  "song_image_stray_files",
  "song_images",
  "song_link_arrangements",
  "song_links",
  "song_pdf_arrangements",
  "song_pdf_uploads",
  "song_pdfs",
  "song_rights_proposals",
  "song_rights_research_settings",
  "song_scores",
  "song_sound_file_arrangements",
  "song_sound_file_uploads",
  "song_sound_files",
  "songs",
  "stray_files",
  "user_arrangement_views",
  "user_arrangements",
  "user_file_views",
];

export function tablesWithScope(scope: TableScope): TableName[] {
  return (Object.keys(TABLE_SCOPES) as TableName[]).filter((t) => TABLE_SCOPES[t] === scope);
}
