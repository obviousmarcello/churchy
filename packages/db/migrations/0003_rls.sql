-- D-03 [BE]: row-level security policies and the application role (SDD §4.2, §25.7).
-- Hand-written (`drizzle-kit generate --custom`); the down migration is migrations/down/0003_rls.sql.
-- Generated once from src/table-scopes.ts and committed as explicit per-table statements;
-- `rls.db.test.ts` / `isolation.db.test.ts` check the live catalog against the same classification.
--
-- Roles:
--   * the migration role (Supabase: `postgres`, CI: the superuser) owns every table;
--   * `churchy_app` is the role the app connects as (Drizzle). It is NOT the owner, has no
--     BYPASSRLS / SUPERUSER and only gets DML on tenant and catalog tables. Created NOLOGIN; the
--     operator enables login out-of-band (`ALTER ROLE churchy_app LOGIN PASSWORD …`, never in git).
--
-- Policies read the tenant from the transaction-local setting `app.tenant_id` through
-- `app.current_tenant_id()`, which returns NULL without a context (=> 0 rows, inserts rejected)
-- and raises if `app.tenant_id` and `app.org_id` are ever set together (SDD §25.7).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'churchy_app') THEN
    CREATE ROLE churchy_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  ELSE
    -- Roles are cluster-wide: re-assert the attributes if it survived an earlier down migration.
    ALTER ROLE churchy_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
END
$$;
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS app;
--> statement-breakpoint
REVOKE ALL ON SCHEMA app FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA app TO churchy_app;
--> statement-breakpoint
-- The tenant of the current transaction, or NULL. Never trusts a half-set context: a tenant
-- and an organization context together are rejected outright instead of being resolved.
CREATE OR REPLACE FUNCTION app.current_tenant_id() RETURNS uuid
  LANGUAGE plpgsql STABLE PARALLEL SAFE SET search_path = ''
  AS $$
DECLARE
  tenant text := nullif(pg_catalog.current_setting('app.tenant_id', true), '');
  org text := nullif(pg_catalog.current_setting('app.org_id', true), '');
BEGIN
  IF tenant IS NOT NULL AND org IS NOT NULL THEN
    RAISE EXCEPTION 'app.tenant_id and app.org_id must never be set together'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN tenant::uuid;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.current_tenant_id() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.current_tenant_id() TO churchy_app;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO churchy_app;
--> statement-breakpoint
-- The generated search columns (posts, songs) and hu_tsquery() call extensions.unaccent()
-- with the privileges of the writing role.
GRANT USAGE ON SCHEMA extensions TO churchy_app;
--> statement-breakpoint
-- Supabase exposes `public` through PostgREST to the `anon` and `authenticated` roles and
-- grants them ALL on new tables by default. Churchy never serves table data through PostgREST:
-- revoke the grants and the default privileges (RLS without a policy for them denies rows anyway).
-- The down migration deliberately does not restore them. No-op on a Postgres without these roles.
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
    END IF;
  END LOOP;
END
$$;
--> statement-breakpoint
-- FORCE: the policies apply to the table owner too (unless it is a superuser / BYPASSRLS role,
-- as the migration role is). Every public table, whatever its scope.
--> statement-breakpoint
ALTER TABLE "absences" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "announcements" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "arrangements" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "assignments" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "attachments" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audit_log" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "availability_blocks" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "billing_accounts" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "booking_conflicts" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "booking_series" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "bookings" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "calendars" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "deals" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "domains" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "events" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "form_definitions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "hr_approvals" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "hr_categories" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "hr_ticket_messages" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "hr_tickets" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "hymnals" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "invoices" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "leave_entitlements" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "locations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "media" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "memberships" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "notification_prefs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "org_delegations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "org_links" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "org_memberships" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "organizations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "pages" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "pastoral_requests" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "payment_events" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "people" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "plan_comments" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "plan_items" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "plan_templates" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "plans" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "posts" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "profiles" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "redirects" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "rooms" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "schedule_periods" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "service_exceptions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "service_occurrences" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "service_plans" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "service_room_blocks" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "service_rules" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "song_hymnal_refs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "songs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "staff_profiles" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "subscriptions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "team_members" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "team_positions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "teams" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tenants" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "workday_calendar" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Platform tables (audit_log, billing_accounts, deals, invoices, notification_prefs, org_memberships, organizations, payment_events, plans, profiles, subscriptions, tenants, workday_calendar): no grant and no policy for
-- churchy_app — denied by default. They are reached by the platform role / their own slices.
--> statement-breakpoint
-- Tenant tables: one policy keyed on app.tenant_id for every command. HR tables
-- (hr_*, absences, leave_entitlements, staff_profiles) get the same policy; D-84 adds the diocesan
-- app.org_id branch as a SEPARATE permissive policy, so this one never needs restructuring.
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "absences" TO churchy_app;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "absences" AS PERMISSIVE FOR ALL TO churchy_app
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "announcements" TO churchy_app;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "announcements" AS PERMISSIVE FOR ALL TO churchy_app
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "arrangements" TO churchy_app;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "arrangements" AS PERMISSIVE FOR ALL TO churchy_app
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "assignments" TO churchy_app;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "assignments" AS PERMISSIVE FOR ALL TO churchy_app
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "attachments" TO churchy_app;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "attachments" AS PERMISSIVE FOR ALL TO churchy_app
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "availability_blocks" TO churchy_app;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "availability_blocks" AS PERMISSIVE FOR ALL TO churchy_app
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "booking_conflicts" TO churchy_app;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "booking_conflicts" AS PERMISSIVE FOR ALL TO churchy_app
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "booking_series" TO churchy_app;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "booking_series" AS PERMISSIVE FOR ALL TO churchy_app
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "bookings" TO churchy_app;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "bookings" AS PERMISSIVE FOR ALL TO churchy_app
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "calendars" TO churchy_app;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "calendars" AS PERMISSIVE FOR ALL TO churchy_app
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "domains" TO churchy_app;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "domains" AS PERMISSIVE FOR ALL TO churchy_app
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "events" TO churchy_app;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "events" AS PERMISSIVE FOR ALL TO churchy_app
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "form_definitions" TO churchy_app;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "form_definitions" AS PERMISSIVE FOR ALL TO churchy_app
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "hr_approvals" TO churchy_app;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "hr_approvals" AS PERMISSIVE FOR ALL TO churchy_app
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "hr_categories" TO churchy_app;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "hr_categories" AS PERMISSIVE FOR ALL TO churchy_app
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "hr_ticket_messages" TO churchy_app;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "hr_ticket_messages" AS PERMISSIVE FOR ALL TO churchy_app
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "hr_tickets" TO churchy_app;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "hr_tickets" AS PERMISSIVE FOR ALL TO churchy_app
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "leave_entitlements" TO churchy_app;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "leave_entitlements" AS PERMISSIVE FOR ALL TO churchy_app
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "locations" TO churchy_app;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "locations" AS PERMISSIVE FOR ALL TO churchy_app
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "media" TO churchy_app;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "media" AS PERMISSIVE FOR ALL TO churchy_app
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "memberships" TO churchy_app;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "memberships" AS PERMISSIVE FOR ALL TO churchy_app
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "notifications" TO churchy_app;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "notifications" AS PERMISSIVE FOR ALL TO churchy_app
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "org_delegations" TO churchy_app;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "org_delegations" AS PERMISSIVE FOR ALL TO churchy_app
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "org_links" TO churchy_app;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "org_links" AS PERMISSIVE FOR ALL TO churchy_app
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "pages" TO churchy_app;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "pages" AS PERMISSIVE FOR ALL TO churchy_app
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "pastoral_requests" TO churchy_app;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "pastoral_requests" AS PERMISSIVE FOR ALL TO churchy_app
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "people" TO churchy_app;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "people" AS PERMISSIVE FOR ALL TO churchy_app
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "plan_comments" TO churchy_app;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "plan_comments" AS PERMISSIVE FOR ALL TO churchy_app
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "plan_items" TO churchy_app;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "plan_items" AS PERMISSIVE FOR ALL TO churchy_app
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "posts" TO churchy_app;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "posts" AS PERMISSIVE FOR ALL TO churchy_app
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "redirects" TO churchy_app;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "redirects" AS PERMISSIVE FOR ALL TO churchy_app
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "rooms" TO churchy_app;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "rooms" AS PERMISSIVE FOR ALL TO churchy_app
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "schedule_periods" TO churchy_app;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "schedule_periods" AS PERMISSIVE FOR ALL TO churchy_app
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "service_exceptions" TO churchy_app;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "service_exceptions" AS PERMISSIVE FOR ALL TO churchy_app
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "service_occurrences" TO churchy_app;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "service_occurrences" AS PERMISSIVE FOR ALL TO churchy_app
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "service_plans" TO churchy_app;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "service_plans" AS PERMISSIVE FOR ALL TO churchy_app
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "service_room_blocks" TO churchy_app;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "service_room_blocks" AS PERMISSIVE FOR ALL TO churchy_app
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "service_rules" TO churchy_app;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "service_rules" AS PERMISSIVE FOR ALL TO churchy_app
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "song_hymnal_refs" TO churchy_app;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "song_hymnal_refs" AS PERMISSIVE FOR ALL TO churchy_app
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "songs" TO churchy_app;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "songs" AS PERMISSIVE FOR ALL TO churchy_app
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "staff_profiles" TO churchy_app;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "staff_profiles" AS PERMISSIVE FOR ALL TO churchy_app
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "team_members" TO churchy_app;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "team_members" AS PERMISSIVE FOR ALL TO churchy_app
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "team_positions" TO churchy_app;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "team_positions" AS PERMISSIVE FOR ALL TO churchy_app
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "teams" TO churchy_app;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "teams" AS PERMISSIVE FOR ALL TO churchy_app
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
-- Catalog tables: platform rows (tenant_id NULL) are readable inside a tenant context only;
-- writes are limited to the tenant's own rows.
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "hymnals" TO churchy_app;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "hymnals" AS PERMISSIVE FOR ALL TO churchy_app
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
CREATE POLICY "catalog_read" ON "hymnals" AS PERMISSIVE FOR SELECT TO churchy_app
  USING (tenant_id IS NULL AND (SELECT app.current_tenant_id()) IS NOT NULL);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "plan_templates" TO churchy_app;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "plan_templates" AS PERMISSIVE FOR ALL TO churchy_app
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
CREATE POLICY "catalog_read" ON "plan_templates" AS PERMISSIVE FOR SELECT TO churchy_app
  USING (tenant_id IS NULL AND (SELECT app.current_tenant_id()) IS NOT NULL);
