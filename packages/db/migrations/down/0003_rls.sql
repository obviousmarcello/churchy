-- Down of 0003_rls: drops the policies, un-forces RLS (RLS itself stays enabled, from 0001),
-- revokes every grant of churchy_app and drops the role and the app schema. The Supabase
-- anon/authenticated grants revoked by the up migration are NOT restored, on purpose.
--> statement-breakpoint
DROP POLICY IF EXISTS "catalog_read" ON "plan_templates";
--> statement-breakpoint
DROP POLICY IF EXISTS "catalog_read" ON "hymnals";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "teams";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "team_positions";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "team_members";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "staff_profiles";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "songs";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "song_hymnal_refs";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "service_rules";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "service_room_blocks";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "service_plans";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "service_occurrences";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "service_exceptions";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "schedule_periods";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "rooms";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "redirects";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "posts";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "plan_templates";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "plan_items";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "plan_comments";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "people";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "pastoral_requests";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "pages";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "org_links";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "org_delegations";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "notifications";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "memberships";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "media";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "locations";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "leave_entitlements";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "hymnals";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "hr_tickets";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "hr_ticket_messages";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "hr_categories";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "hr_approvals";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "form_definitions";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "events";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "domains";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "calendars";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "bookings";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "booking_series";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "booking_conflicts";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "availability_blocks";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "attachments";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "assignments";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "arrangements";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "announcements";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "absences";
--> statement-breakpoint
ALTER TABLE "workday_calendar" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tenants" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "teams" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "team_positions" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "team_members" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "subscriptions" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "staff_profiles" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "songs" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "song_hymnal_refs" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "service_rules" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "service_room_blocks" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "service_plans" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "service_occurrences" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "service_exceptions" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "schedule_periods" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "rooms" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "redirects" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "profiles" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "posts" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "plans" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "plan_templates" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "plan_items" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "plan_comments" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "people" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "payment_events" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "pastoral_requests" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "pages" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "organizations" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "org_memberships" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "org_links" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "org_delegations" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "notifications" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "notification_prefs" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "memberships" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "media" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "locations" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "leave_entitlements" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "invoices" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "hymnals" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "hr_tickets" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "hr_ticket_messages" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "hr_categories" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "hr_approvals" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "form_definitions" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "events" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "domains" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "deals" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "calendars" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "bookings" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "booking_series" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "booking_conflicts" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "billing_accounts" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "availability_blocks" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audit_log" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "attachments" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "assignments" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "arrangements" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "announcements" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "absences" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP FUNCTION IF EXISTS app.current_tenant_id();
--> statement-breakpoint
DROP SCHEMA IF EXISTS app;
--> statement-breakpoint
-- Roles are cluster-wide: DROP OWNED revokes what churchy_app holds in THIS database; the role
-- itself is kept if another database of the cluster still references it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'churchy_app') THEN
    DROP OWNED BY churchy_app;
    BEGIN
      DROP ROLE churchy_app;
    EXCEPTION WHEN dependent_objects_still_exist THEN
      RAISE NOTICE 'churchy_app is still referenced by another database; role kept';
    END;
  END IF;
END
$$;
