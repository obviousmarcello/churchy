-- S1 platform role (SDD §4.2 "Platform-console queries use a separate role and are audit-logged").
-- Hand-written (`drizzle-kit generate --custom`); the down migration is migrations/down/0025_platform_role.sql.
--   * churchy_platform: NOLOGIN, NOINHERIT, no SUPERUSER/BYPASSRLS. For everything that has no
--     tenant context yet: host -> tenant resolution, profile bootstrap, plan/entitlement lookups
--     and the writes that create a church (apps/web/server/platform-db). The owner creates the
--     login role separately: CREATE ROLE churchy_platform_login LOGIN INHERIT PASSWORD '...';
--     GRANT churchy_platform TO churchy_platform_login;  (password never in git)
--   * It reads platform tables (policy "platform_read") and, of the tenant tables, ONLY the
--     columns tenant_id/hostname/is_primary/verified_at/tls_status of `domains`.
--   * It writes by INSERT only: tenants (free plan), profiles, billing_accounts, subscriptions,
--     memberships (role owner), people, audit_log. The tenant-scoped inserts are admitted only for
--     a FRESH tenant (no launched_at, created within 10 minutes), so the role can seed a new church
--     but cannot add rows to an existing one. No SELECT/UPDATE/DELETE on any tenant table, no
--     SECURITY DEFINER function.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'churchy_platform') THEN
    CREATE ROLE churchy_platform NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  ELSE
    ALTER ROLE churchy_platform NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
END
$$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO churchy_platform;
--> statement-breakpoint
-- Reads (platform tables). RLS is forced, so each grant has a FOR SELECT policy TO churchy_platform.
--> statement-breakpoint
GRANT SELECT ON TABLE "plans" TO churchy_platform;
--> statement-breakpoint
CREATE POLICY "platform_read" ON "plans" AS PERMISSIVE FOR SELECT TO churchy_platform
  USING (true);
--> statement-breakpoint
GRANT SELECT ON TABLE "organizations" TO churchy_platform;
--> statement-breakpoint
CREATE POLICY "platform_read" ON "organizations" AS PERMISSIVE FOR SELECT TO churchy_platform
  USING (true);
--> statement-breakpoint
GRANT SELECT ON TABLE "tenants" TO churchy_platform;
--> statement-breakpoint
CREATE POLICY "platform_read" ON "tenants" AS PERMISSIVE FOR SELECT TO churchy_platform
  USING (true);
--> statement-breakpoint
GRANT SELECT ON TABLE "profiles" TO churchy_platform;
--> statement-breakpoint
CREATE POLICY "platform_read" ON "profiles" AS PERMISSIVE FOR SELECT TO churchy_platform
  USING (true);
--> statement-breakpoint
GRANT SELECT ON TABLE "org_memberships" TO churchy_platform;
--> statement-breakpoint
CREATE POLICY "platform_read" ON "org_memberships" AS PERMISSIVE FOR SELECT TO churchy_platform
  USING (true);
--> statement-breakpoint
GRANT SELECT ON TABLE "subscriptions" TO churchy_platform;
--> statement-breakpoint
CREATE POLICY "platform_read" ON "subscriptions" AS PERMISSIVE FOR SELECT TO churchy_platform
  USING (true);
--> statement-breakpoint
GRANT SELECT ON TABLE "deals" TO churchy_platform;
--> statement-breakpoint
CREATE POLICY "platform_read" ON "deals" AS PERMISSIVE FOR SELECT TO churchy_platform
  USING (true);
--> statement-breakpoint
-- Host lookup: `domains` is tenant-scoped, so the role gets a column-level grant (no `id`) and a
-- SELECT policy on this one table; no other tenant table is readable.
GRANT SELECT ("tenant_id", "hostname", "is_primary", "verified_at", "tls_status") ON TABLE "domains" TO churchy_platform;
--> statement-breakpoint
CREATE POLICY "platform_host_lookup" ON "domains" AS PERMISSIVE FOR SELECT TO churchy_platform
  USING (true);
--> statement-breakpoint
-- Writes: INSERT only, never SELECT/UPDATE/DELETE on tenant data.
--> statement-breakpoint
GRANT INSERT ON TABLE "tenants" TO churchy_platform;
--> statement-breakpoint
CREATE POLICY "platform_insert" ON "tenants" AS PERMISSIVE FOR INSERT TO churchy_platform
  WITH CHECK (plan_key = 'ingyenes' AND status = 'active' AND ws_tier = 'none' AND organization_id IS NULL AND launched_at IS NULL);
--> statement-breakpoint
GRANT INSERT ON TABLE "profiles" TO churchy_platform;
--> statement-breakpoint
CREATE POLICY "platform_insert" ON "profiles" AS PERMISSIVE FOR INSERT TO churchy_platform
  WITH CHECK (true);
--> statement-breakpoint
GRANT INSERT ON TABLE "billing_accounts" TO churchy_platform;
--> statement-breakpoint
CREATE POLICY "platform_insert" ON "billing_accounts" AS PERMISSIVE FOR INSERT TO churchy_platform
  WITH CHECK (owner_type = 'tenant' AND EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = owner_id AND t.launched_at IS NULL AND t.created_at >= now() - interval '10 minutes'));
--> statement-breakpoint
GRANT INSERT ON TABLE "subscriptions" TO churchy_platform;
--> statement-breakpoint
CREATE POLICY "platform_insert" ON "subscriptions" AS PERMISSIVE FOR INSERT TO churchy_platform
  WITH CHECK (plan_key = 'ingyenes' AND deal_id IS NULL AND EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = tenant_id AND t.launched_at IS NULL AND t.created_at >= now() - interval '10 minutes'));
--> statement-breakpoint
GRANT INSERT ON TABLE "memberships" TO churchy_platform;
--> statement-breakpoint
CREATE POLICY "platform_insert" ON "memberships" AS PERMISSIVE FOR INSERT TO churchy_platform
  WITH CHECK (role = 'owner' AND EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = tenant_id AND t.launched_at IS NULL AND t.created_at >= now() - interval '10 minutes'));
--> statement-breakpoint
GRANT INSERT ON TABLE "people" TO churchy_platform;
--> statement-breakpoint
CREATE POLICY "platform_insert" ON "people" AS PERMISSIVE FOR INSERT TO churchy_platform
  WITH CHECK (user_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = tenant_id AND t.launched_at IS NULL AND t.created_at >= now() - interval '10 minutes'));
--> statement-breakpoint
GRANT INSERT ON TABLE "audit_log" TO churchy_platform;
--> statement-breakpoint
CREATE POLICY "platform_insert" ON "audit_log" AS PERMISSIVE FOR INSERT TO churchy_platform
  WITH CHECK (true);
