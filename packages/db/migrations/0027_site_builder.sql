-- Site builder (D-34, SDD ADR-21): drafts of the URL -> draft site agent and the platform role's
-- narrow write path for a FRESH church. The table DDL is `drizzle-kit generate`; the rest is hand-written.
--   * site_drafts: platform table, no tenant owner. churchy_platform may SELECT / INSERT / UPDATE /
--     DELETE it (nothing else may touch it; churchy_app has no grant). Holds public site content only.
--   * Fresh-tenant seeding: INSERT only (no SELECT/UPDATE/DELETE) on media, locations, schedule_periods,
--     service_rules, announcements, posts, pages, admitted only for a tenant with no launched_at that
--     was created within 10 minutes (the 0025 window). The platform role still cannot read church
--     content or add rows to an older church.
CREATE TABLE "site_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_by" uuid NOT NULL,
	"source_url" text NOT NULL,
	"status" text DEFAULT 'ready' NOT NULL,
	"target_tenant_id" uuid,
	"applied_tenant_id" uuid,
	"draft" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_drafts_status_check" CHECK ("site_drafts"."status" in ('ready', 'applied'))
);
--> statement-breakpoint
ALTER TABLE "site_drafts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "site_drafts" ADD CONSTRAINT "site_drafts_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_drafts" ADD CONSTRAINT "site_drafts_target_tenant_id_tenants_id_fk" FOREIGN KEY ("target_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_drafts" ADD CONSTRAINT "site_drafts_applied_tenant_id_tenants_id_fk" FOREIGN KEY ("applied_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_drafts_created_by_idx" ON "site_drafts" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "site_drafts_expires_at_idx" ON "site_drafts" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "site_drafts_target_tenant_id_idx" ON "site_drafts" USING btree ("target_tenant_id");
--> statement-breakpoint
-- posts.search is generated with public.hu_tsvector() (unaccent lives in schema extensions).
GRANT USAGE ON SCHEMA extensions TO churchy_platform;
--> statement-breakpoint
ALTER TABLE "site_drafts" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "site_drafts" TO churchy_platform;
--> statement-breakpoint
CREATE POLICY "platform_read" ON "site_drafts" AS PERMISSIVE FOR SELECT TO churchy_platform
  USING (true);
--> statement-breakpoint
CREATE POLICY "platform_insert" ON "site_drafts" AS PERMISSIVE FOR INSERT TO churchy_platform
  WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "platform_update" ON "site_drafts" AS PERMISSIVE FOR UPDATE TO churchy_platform
  USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "platform_delete" ON "site_drafts" AS PERMISSIVE FOR DELETE TO churchy_platform
  USING (true);
--> statement-breakpoint
GRANT INSERT ON TABLE "media" TO churchy_platform;
--> statement-breakpoint
CREATE POLICY "platform_insert" ON "media" AS PERMISSIVE FOR INSERT TO churchy_platform
  WITH CHECK (EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = tenant_id AND t.launched_at IS NULL AND t.created_at >= now() - interval '10 minutes'));
--> statement-breakpoint
GRANT INSERT ON TABLE "locations" TO churchy_platform;
--> statement-breakpoint
CREATE POLICY "platform_insert" ON "locations" AS PERMISSIVE FOR INSERT TO churchy_platform
  WITH CHECK (EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = tenant_id AND t.launched_at IS NULL AND t.created_at >= now() - interval '10 minutes'));
--> statement-breakpoint
GRANT INSERT ON TABLE "schedule_periods" TO churchy_platform;
--> statement-breakpoint
CREATE POLICY "platform_insert" ON "schedule_periods" AS PERMISSIVE FOR INSERT TO churchy_platform
  WITH CHECK (EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = tenant_id AND t.launched_at IS NULL AND t.created_at >= now() - interval '10 minutes'));
--> statement-breakpoint
GRANT INSERT ON TABLE "service_rules" TO churchy_platform;
--> statement-breakpoint
CREATE POLICY "platform_insert" ON "service_rules" AS PERMISSIVE FOR INSERT TO churchy_platform
  WITH CHECK (EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = tenant_id AND t.launched_at IS NULL AND t.created_at >= now() - interval '10 minutes'));
--> statement-breakpoint
GRANT INSERT ON TABLE "announcements" TO churchy_platform;
--> statement-breakpoint
CREATE POLICY "platform_insert" ON "announcements" AS PERMISSIVE FOR INSERT TO churchy_platform
  WITH CHECK (EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = tenant_id AND t.launched_at IS NULL AND t.created_at >= now() - interval '10 minutes'));
--> statement-breakpoint
GRANT INSERT ON TABLE "posts" TO churchy_platform;
--> statement-breakpoint
CREATE POLICY "platform_insert" ON "posts" AS PERMISSIVE FOR INSERT TO churchy_platform
  WITH CHECK (EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = tenant_id AND t.launched_at IS NULL AND t.created_at >= now() - interval '10 minutes'));
--> statement-breakpoint
GRANT INSERT ON TABLE "pages" TO churchy_platform;
--> statement-breakpoint
CREATE POLICY "platform_insert" ON "pages" AS PERMISSIVE FOR INSERT TO churchy_platform
  WITH CHECK (EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = tenant_id AND t.launched_at IS NULL AND t.created_at >= now() - interval '10 minutes'));
