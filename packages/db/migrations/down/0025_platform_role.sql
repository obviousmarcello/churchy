-- Down of 0025_platform_role: policies, grants and the role churchy_platform.
DROP POLICY IF EXISTS "platform_insert" ON "audit_log";
--> statement-breakpoint
DROP POLICY IF EXISTS "platform_insert" ON "people";
--> statement-breakpoint
DROP POLICY IF EXISTS "platform_insert" ON "memberships";
--> statement-breakpoint
DROP POLICY IF EXISTS "platform_insert" ON "subscriptions";
--> statement-breakpoint
DROP POLICY IF EXISTS "platform_insert" ON "billing_accounts";
--> statement-breakpoint
DROP POLICY IF EXISTS "platform_insert" ON "profiles";
--> statement-breakpoint
DROP POLICY IF EXISTS "platform_insert" ON "tenants";
--> statement-breakpoint
DROP POLICY IF EXISTS "platform_host_lookup" ON "domains";
--> statement-breakpoint
DROP POLICY IF EXISTS "platform_read" ON "deals";
--> statement-breakpoint
DROP POLICY IF EXISTS "platform_read" ON "subscriptions";
--> statement-breakpoint
DROP POLICY IF EXISTS "platform_read" ON "org_memberships";
--> statement-breakpoint
DROP POLICY IF EXISTS "platform_read" ON "profiles";
--> statement-breakpoint
DROP POLICY IF EXISTS "platform_read" ON "tenants";
--> statement-breakpoint
DROP POLICY IF EXISTS "platform_read" ON "organizations";
--> statement-breakpoint
DROP POLICY IF EXISTS "platform_read" ON "plans";
--> statement-breakpoint
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM churchy_platform;
--> statement-breakpoint
REVOKE ALL (tenant_id, hostname, is_primary, verified_at, tls_status) ON TABLE "domains" FROM churchy_platform;
--> statement-breakpoint
REVOKE USAGE ON SCHEMA public FROM churchy_platform;
--> statement-breakpoint
-- The role is cluster-wide: drop it only when nothing else depends on it (e.g. the login role).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'churchy_platform') THEN
    DROP ROLE churchy_platform;
  END IF;
EXCEPTION WHEN dependent_objects_still_exist THEN
  RAISE NOTICE 'churchy_platform is still referenced (e.g. by a login role); left in place';
END
$$;
