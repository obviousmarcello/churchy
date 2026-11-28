-- Down of 0027_site_builder: policies, grants and the site_drafts table.
DROP POLICY IF EXISTS "platform_insert" ON "pages";
--> statement-breakpoint
REVOKE ALL ON TABLE "pages" FROM churchy_platform;
--> statement-breakpoint
DROP POLICY IF EXISTS "platform_insert" ON "posts";
--> statement-breakpoint
REVOKE ALL ON TABLE "posts" FROM churchy_platform;
--> statement-breakpoint
DROP POLICY IF EXISTS "platform_insert" ON "announcements";
--> statement-breakpoint
REVOKE ALL ON TABLE "announcements" FROM churchy_platform;
--> statement-breakpoint
DROP POLICY IF EXISTS "platform_insert" ON "service_rules";
--> statement-breakpoint
REVOKE ALL ON TABLE "service_rules" FROM churchy_platform;
--> statement-breakpoint
DROP POLICY IF EXISTS "platform_insert" ON "schedule_periods";
--> statement-breakpoint
REVOKE ALL ON TABLE "schedule_periods" FROM churchy_platform;
--> statement-breakpoint
DROP POLICY IF EXISTS "platform_insert" ON "locations";
--> statement-breakpoint
REVOKE ALL ON TABLE "locations" FROM churchy_platform;
--> statement-breakpoint
DROP POLICY IF EXISTS "platform_insert" ON "media";
--> statement-breakpoint
REVOKE ALL ON TABLE "media" FROM churchy_platform;
--> statement-breakpoint
REVOKE USAGE ON SCHEMA extensions FROM churchy_platform;
--> statement-breakpoint
ALTER TABLE "site_drafts" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP TABLE IF EXISTS "site_drafts";
