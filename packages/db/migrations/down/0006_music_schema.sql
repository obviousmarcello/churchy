-- Down of 0006_music_schema: drops the music tables and restores Churchy's own `songs` /
-- `arrangements` (DDL of 0001_schema, RLS of 0003_rls) and the hymnal-ref / plan-item FKs.
-- Song data written in the music shape is lost (disposable/dev databases only).
--> statement-breakpoint
DROP TABLE IF EXISTS "user_file_views" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "user_arrangements" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "user_arrangement_views" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "stray_files" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "songs" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "song_sound_files" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "song_sound_file_uploads" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "song_sound_file_arrangements" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "song_scores" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "song_rights_research_settings" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "song_rights_proposals" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "song_pdfs" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "song_pdf_uploads" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "song_pdf_arrangements" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "song_links" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "song_link_arrangements" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "song_images" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "song_image_stray_files" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "song_image_pages" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "song_image_arrangements" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "sheet_marks" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "setlists" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "setlist_items" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "setlist_item_themes" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "setlist_item_durations" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "scripture_verse_cache" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "scripture_books" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "push_subscriptions" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "projection_video_uploads" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "projection_themes" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "notification_preferences" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "mixer_settings" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "email_templates" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "courses" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "course_lessons" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "course_images" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "calendar_feeds" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "arrangements" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "app_modules" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "app_config" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "announcement_settings" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "announcement_calendars" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "annotations" CASCADE;
--> statement-breakpoint
-- References to music-shaped songs cannot point at the restored tables.
DELETE FROM "song_hymnal_refs";
--> statement-breakpoint
UPDATE "plan_items" SET "song_id" = NULL, "arrangement_id" = NULL WHERE "song_id" IS NOT NULL OR "arrangement_id" IS NOT NULL;
--> statement-breakpoint
CREATE TYPE "public"."song_licence" AS ENUM('public_domain', 'licensed', 'permission', 'own', 'unknown');
--> statement-breakpoint
CREATE TABLE "songs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text COLLATE "hu-HU-x-icu" NOT NULL,
	"alt_titles" text[] DEFAULT '{}' NOT NULL,
	"first_line" text,
	"lyrics" text,
	"language" text DEFAULT 'hu' NOT NULL,
	"authors" text[] DEFAULT '{}' NOT NULL,
	"composers" text[] DEFAULT '{}' NOT NULL,
	"translators" text[] DEFAULT '{}' NOT NULL,
	"copyright_holder" text,
	"licence" "song_licence" DEFAULT 'unknown' NOT NULL,
	"licence_ref" text,
	"themes" text[] DEFAULT '{}' NOT NULL,
	"seasons" text[] DEFAULT '{}' NOT NULL,
	"default_key" text,
	"tempo_bpm" integer,
	"time_signature" text,
	"notes" text,
	"search" "tsvector" GENERATED ALWAYS AS (setweight(public.hu_tsvector(title), 'A') || setweight(public.hu_tsvector(public.hu_join(alt_titles)), 'A') || setweight(public.hu_tsvector(first_line), 'B') || setweight(public.hu_tsvector(lyrics), 'C')) STORED NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "songs_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "songs_tempo_check" CHECK ("songs"."tempo_bpm" is null or "songs"."tempo_bpm" between 20 and 300)
);
--> statement-breakpoint
CREATE TABLE "arrangements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"song_id" uuid NOT NULL,
	"name" text COLLATE "hu-HU-x-icu" NOT NULL,
	"key" text NOT NULL,
	"tempo_bpm" integer,
	"structure" text DEFAULT '' NOT NULL,
	"chordpro" text,
	"notes" text,
	CONSTRAINT "arrangements_tenant_id_id_key" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "songs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "arrangements" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "arrangements" ADD CONSTRAINT "arrangements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "arrangements" ADD CONSTRAINT "arrangements_song_id_fkey" FOREIGN KEY ("tenant_id","song_id") REFERENCES "public"."songs"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "songs" ADD CONSTRAINT "songs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_song_id_fkey" FOREIGN KEY ("tenant_id","song_id") REFERENCES "public"."songs"("tenant_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_arrangement_id_fkey" FOREIGN KEY ("tenant_id","arrangement_id") REFERENCES "public"."arrangements"("tenant_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "song_hymnal_refs" ADD CONSTRAINT "song_hymnal_refs_song_id_fkey" FOREIGN KEY ("tenant_id","song_id") REFERENCES "public"."songs"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "arrangements_tenant_id_idx" ON "arrangements" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX "arrangements_song_id_idx" ON "arrangements" USING btree ("song_id");
--> statement-breakpoint
CREATE INDEX "songs_tenant_id_idx" ON "songs" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX "songs_search_idx" ON "songs" USING gin ("search");
--> statement-breakpoint
ALTER TABLE "songs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "arrangements" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "arrangements" TO churchy_app;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "arrangements" AS PERMISSIVE FOR ALL TO churchy_app
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "songs" TO churchy_app;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "songs" AS PERMISSIVE FOR ALL TO churchy_app
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
