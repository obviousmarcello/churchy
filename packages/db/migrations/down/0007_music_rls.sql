-- Down of 0007_music_rls: policies, grants, FORCE, the hand-written constraints/indexes and the
-- role churchy_music. The tables themselves are dropped by down/0006_music_schema.sql.
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "annotations";
--> statement-breakpoint
REVOKE ALL ON TABLE "annotations" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "annotations" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "announcement_calendars";
--> statement-breakpoint
REVOKE ALL ON TABLE "announcement_calendars" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "announcement_calendars" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "announcement_settings";
--> statement-breakpoint
REVOKE ALL ON TABLE "announcement_settings" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "announcement_settings" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "app_config";
--> statement-breakpoint
REVOKE ALL ON TABLE "app_config" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "app_config" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "app_modules";
--> statement-breakpoint
REVOKE ALL ON TABLE "app_modules" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "app_modules" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "arrangements";
--> statement-breakpoint
REVOKE ALL ON TABLE "arrangements" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "arrangements" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "calendar_feeds";
--> statement-breakpoint
REVOKE ALL ON TABLE "calendar_feeds" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "calendar_feeds" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "course_images";
--> statement-breakpoint
REVOKE ALL ON TABLE "course_images" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "course_images" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "course_lessons";
--> statement-breakpoint
REVOKE ALL ON TABLE "course_lessons" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "course_lessons" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "courses";
--> statement-breakpoint
REVOKE ALL ON TABLE "courses" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "courses" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "email_templates";
--> statement-breakpoint
REVOKE ALL ON TABLE "email_templates" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "email_templates" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "mixer_settings";
--> statement-breakpoint
REVOKE ALL ON TABLE "mixer_settings" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "mixer_settings" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "notification_preferences";
--> statement-breakpoint
REVOKE ALL ON TABLE "notification_preferences" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "notification_preferences" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "projection_themes";
--> statement-breakpoint
REVOKE ALL ON TABLE "projection_themes" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "projection_themes" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "projection_video_uploads";
--> statement-breakpoint
REVOKE ALL ON TABLE "projection_video_uploads" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "projection_video_uploads" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "push_subscriptions";
--> statement-breakpoint
REVOKE ALL ON TABLE "push_subscriptions" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "push_subscriptions" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "catalog_read" ON "scripture_books";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "scripture_books";
--> statement-breakpoint
REVOKE ALL ON TABLE "scripture_books" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "scripture_books" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "catalog_read" ON "scripture_verse_cache";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "scripture_verse_cache";
--> statement-breakpoint
REVOKE ALL ON TABLE "scripture_verse_cache" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "scripture_verse_cache" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "setlist_item_durations";
--> statement-breakpoint
REVOKE ALL ON TABLE "setlist_item_durations" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "setlist_item_durations" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "setlist_item_themes";
--> statement-breakpoint
REVOKE ALL ON TABLE "setlist_item_themes" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "setlist_item_themes" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "setlist_items";
--> statement-breakpoint
REVOKE ALL ON TABLE "setlist_items" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "setlist_items" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "setlists";
--> statement-breakpoint
REVOKE ALL ON TABLE "setlists" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "setlists" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "sheet_marks";
--> statement-breakpoint
REVOKE ALL ON TABLE "sheet_marks" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "sheet_marks" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "song_image_arrangements";
--> statement-breakpoint
REVOKE ALL ON TABLE "song_image_arrangements" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "song_image_arrangements" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "song_image_pages";
--> statement-breakpoint
REVOKE ALL ON TABLE "song_image_pages" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "song_image_pages" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "song_image_stray_files";
--> statement-breakpoint
REVOKE ALL ON TABLE "song_image_stray_files" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "song_image_stray_files" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "song_images";
--> statement-breakpoint
REVOKE ALL ON TABLE "song_images" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "song_images" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "song_link_arrangements";
--> statement-breakpoint
REVOKE ALL ON TABLE "song_link_arrangements" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "song_link_arrangements" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "song_links";
--> statement-breakpoint
REVOKE ALL ON TABLE "song_links" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "song_links" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "song_pdf_arrangements";
--> statement-breakpoint
REVOKE ALL ON TABLE "song_pdf_arrangements" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "song_pdf_arrangements" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "song_pdf_uploads";
--> statement-breakpoint
REVOKE ALL ON TABLE "song_pdf_uploads" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "song_pdf_uploads" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "song_pdfs";
--> statement-breakpoint
REVOKE ALL ON TABLE "song_pdfs" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "song_pdfs" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "song_rights_proposals";
--> statement-breakpoint
REVOKE ALL ON TABLE "song_rights_proposals" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "song_rights_proposals" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "song_rights_research_settings";
--> statement-breakpoint
REVOKE ALL ON TABLE "song_rights_research_settings" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "song_rights_research_settings" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "song_scores";
--> statement-breakpoint
REVOKE ALL ON TABLE "song_scores" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "song_scores" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "song_sound_file_arrangements";
--> statement-breakpoint
REVOKE ALL ON TABLE "song_sound_file_arrangements" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "song_sound_file_arrangements" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "song_sound_file_uploads";
--> statement-breakpoint
REVOKE ALL ON TABLE "song_sound_file_uploads" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "song_sound_file_uploads" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "song_sound_files";
--> statement-breakpoint
REVOKE ALL ON TABLE "song_sound_files" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "song_sound_files" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "songs";
--> statement-breakpoint
REVOKE ALL ON TABLE "songs" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "songs" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "stray_files";
--> statement-breakpoint
REVOKE ALL ON TABLE "stray_files" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "stray_files" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "user_arrangement_views";
--> statement-breakpoint
REVOKE ALL ON TABLE "user_arrangement_views" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "user_arrangement_views" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "user_arrangements";
--> statement-breakpoint
REVOKE ALL ON TABLE "user_arrangements" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "user_arrangements" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "user_file_views";
--> statement-breakpoint
REVOKE ALL ON TABLE "user_file_views" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "user_file_views" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "announcement_calendars" DROP CONSTRAINT IF EXISTS "announcement_calendars_position_key";
--> statement-breakpoint
DROP INDEX IF EXISTS "course_lessons_removed_at_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "courses_removed_at_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "projection_themes_one_default_idx";
--> statement-breakpoint
ALTER TABLE "setlist_items" DROP CONSTRAINT IF EXISTS "setlist_items_setlist_id_position_key";
--> statement-breakpoint
DROP INDEX IF EXISTS "song_rights_proposals_answered_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "song_rights_proposals_song_id_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "song_rights_proposals_open_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "song_scores_song_id_name_idx";
--> statement-breakpoint
ALTER TABLE "song_image_pages" DROP CONSTRAINT IF EXISTS "song_image_pages_image_id_position_key";
--> statement-breakpoint
DROP INDEX IF EXISTS "arrangements_search_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "arrangements_one_default_per_song_idx";
--> statement-breakpoint
ALTER TABLE "arrangements" DROP CONSTRAINT IF EXISTS "arrangements_projection_theme_id_fkey";
--> statement-breakpoint
DROP INDEX IF EXISTS "songs_artist_trgm_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "songs_title_trgm_idx";
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'churchy_music') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM churchy_music;
    REVOKE ALL ON SCHEMA public, extensions, app FROM churchy_music;
    REVOKE ALL ON FUNCTION app.current_tenant_id() FROM churchy_music;
    DROP ROLE churchy_music;
  END IF;
END
$$;
