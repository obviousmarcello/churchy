-- Down of 0008_music_songs: the phase-2 song functions and triggers, the song_rights catalog and
-- the tenant_id defaults of the music tables.
--> statement-breakpoint
DROP TRIGGER IF EXISTS songs_set_updated_at ON public.songs;
--> statement-breakpoint
DROP TRIGGER IF EXISTS arrangements_set_updated_at ON public.arrangements;
--> statement-breakpoint
DROP TRIGGER IF EXISTS arrangements_check_attachment_links ON public.arrangements;
--> statement-breakpoint
DROP TRIGGER IF EXISTS songs_share_rights ON public.songs;
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.fold_text(text);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.search_key(text);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.has_distinct_elements(uuid[]);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.chart_lyrics(text);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.set_updated_at();
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.check_arrangement_attachment_links();
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.create_song(text, text, text[], text, text[], text, text, text, text, text, text, text);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.set_default_arrangement(uuid);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.clone_arrangement(uuid, text);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.song_tags();
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.song_filter_options();
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.song_play_stats(uuid[], uuid);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.song_play_stats(uuid[]);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.filter_songs(text, text, text, integer, integer, text, text, integer, integer);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.songs_for_rights_research();
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.songs_for_local_rights_research();
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.count_songs_for_rights_research();
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.count_song_rights_proposals();
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.recent_closed_song_rights_proposals(integer);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.review_song_rights_proposal(uuid, uuid, boolean, jsonb);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.import_song_rights_findings(text, jsonb);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.song_rights_ccli(text);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.share_song_rights();
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.shared_song_rights(text, text, text);
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "song_rights";
--> statement-breakpoint
DROP POLICY IF EXISTS "catalog_read" ON "song_rights";
--> statement-breakpoint
REVOKE ALL ON TABLE "song_rights" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "song_rights" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP TABLE IF EXISTS "song_rights";
--> statement-breakpoint
ALTER TABLE "annotations" ALTER COLUMN "tenant_id" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "announcement_calendars" ALTER COLUMN "tenant_id" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "announcement_settings" ALTER COLUMN "tenant_id" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "app_config" ALTER COLUMN "tenant_id" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "app_modules" ALTER COLUMN "tenant_id" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "arrangements" ALTER COLUMN "tenant_id" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "calendar_feeds" ALTER COLUMN "tenant_id" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "course_images" ALTER COLUMN "tenant_id" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "course_lessons" ALTER COLUMN "tenant_id" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "courses" ALTER COLUMN "tenant_id" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "email_templates" ALTER COLUMN "tenant_id" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "mixer_settings" ALTER COLUMN "tenant_id" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "notification_preferences" ALTER COLUMN "tenant_id" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "projection_themes" ALTER COLUMN "tenant_id" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "projection_video_uploads" ALTER COLUMN "tenant_id" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "push_subscriptions" ALTER COLUMN "tenant_id" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "setlist_item_durations" ALTER COLUMN "tenant_id" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "setlist_item_themes" ALTER COLUMN "tenant_id" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "setlist_items" ALTER COLUMN "tenant_id" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "setlists" ALTER COLUMN "tenant_id" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "sheet_marks" ALTER COLUMN "tenant_id" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "song_image_arrangements" ALTER COLUMN "tenant_id" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "song_image_pages" ALTER COLUMN "tenant_id" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "song_image_stray_files" ALTER COLUMN "tenant_id" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "song_images" ALTER COLUMN "tenant_id" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "song_link_arrangements" ALTER COLUMN "tenant_id" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "song_links" ALTER COLUMN "tenant_id" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "song_pdf_arrangements" ALTER COLUMN "tenant_id" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "song_pdf_uploads" ALTER COLUMN "tenant_id" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "song_pdfs" ALTER COLUMN "tenant_id" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "song_rights_proposals" ALTER COLUMN "tenant_id" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "song_rights_research_settings" ALTER COLUMN "tenant_id" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "song_scores" ALTER COLUMN "tenant_id" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "song_sound_file_arrangements" ALTER COLUMN "tenant_id" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "song_sound_file_uploads" ALTER COLUMN "tenant_id" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "song_sound_files" ALTER COLUMN "tenant_id" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "songs" ALTER COLUMN "tenant_id" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "stray_files" ALTER COLUMN "tenant_id" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "user_arrangement_views" ALTER COLUMN "tenant_id" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "user_arrangements" ALTER COLUMN "tenant_id" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "user_file_views" ALTER COLUMN "tenant_id" DROP DEFAULT;
