DROP FUNCTION IF EXISTS public.music_calendar_id();
--> statement-breakpoint
REVOKE ALL ON TABLE "events", "calendars" FROM churchy_music;
--> statement-breakpoint
DROP POLICY IF EXISTS "music_scope" ON "events";
--> statement-breakpoint
DROP POLICY IF EXISTS "music_scope" ON "calendars";
--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "events";
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "events" AS PERMISSIVE FOR ALL TO churchy_app
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "calendars";
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "calendars" AS PERMISSIVE FOR ALL TO churchy_app
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
DROP INDEX IF EXISTS "calendars_one_music_idx";
--> statement-breakpoint
ALTER TABLE "service_plans" DROP CONSTRAINT IF EXISTS "service_plans_tenant_id_setlist_id_key";
--> statement-breakpoint
ALTER TABLE "service_plans" DROP CONSTRAINT IF EXISTS "service_plans_setlist_id_fkey";
--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_youtube_url_check";
--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_tenant_id_setlist_id_key";
--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_setlist_id_fkey";
--> statement-breakpoint
ALTER TABLE "service_plans" DROP COLUMN IF EXISTS "setlist_id";
--> statement-breakpoint
ALTER TABLE "calendars" DROP COLUMN IF EXISTS "is_music";
--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN IF EXISTS "is_private", DROP COLUMN IF EXISTS "youtube_url", DROP COLUMN IF EXISTS "setlist_id";
