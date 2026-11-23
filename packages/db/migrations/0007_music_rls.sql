-- Custom SQL migration file, put your code below! --
-- Music merge phase 1b (PLAN §4, §11.1 "Music DB role"; SDD ADR-20): RLS for the music tables of
-- 0006 and the role `churchy_music` that the per-request music JWT switches PostgREST to.
--   * churchy_music: NOLOGIN, NOINHERIT, no SUPERUSER/BYPASSRLS; DML on the music tables ONLY
--     (src/table-scopes.ts MUSIC_TABLES); every other table stays denied (no grant). Granted to
--     Supabase's `authenticator` (when that role exists) so PostgREST can switch to it.
--   * Every music table: RLS forced, the canonical `tenant_isolation` policy for churchy_app AND
--     churchy_music (tenant from app.tenant_id or the churchy JWT claim, 0004), plus `catalog_read`
--     on the catalog tables (Bible text: platform rows with tenant_id null).
--   * Music Sheet DB's own auth.uid() policies and helpers are not carried over (PLAN §11.1).
--   * Constraints Drizzle cannot express: composite ON DELETE SET NULL (column) FKs, DEFERRABLE
--     per-tenant uniques, partial/expression indexes (partial uniques are per tenant).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'churchy_music') THEN
    CREATE ROLE churchy_music NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  ELSE
    ALTER ROLE churchy_music NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticator') THEN
    GRANT churchy_music TO authenticator;
  END IF;
END
$$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA app TO churchy_music;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.current_tenant_id() TO churchy_music;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO churchy_music;
--> statement-breakpoint
-- Trigram indexes and simple_unaccent (generated search_vector) use `extensions`.
GRANT USAGE ON SCHEMA extensions TO churchy_music;
--> statement-breakpoint
CREATE INDEX songs_title_trgm_idx ON public.songs USING gin (title extensions.gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX songs_artist_trgm_idx ON public.songs USING gin (artist extensions.gin_trgm_ops);
--> statement-breakpoint
ALTER TABLE "arrangements" ADD CONSTRAINT "arrangements_projection_theme_id_fkey" FOREIGN KEY (tenant_id, "projection_theme_id") REFERENCES "projection_themes" (tenant_id, "id") ON DELETE SET NULL ("projection_theme_id");
--> statement-breakpoint
CREATE UNIQUE INDEX arrangements_one_default_per_song_idx ON public.arrangements USING btree (tenant_id, song_id) WHERE is_default;
--> statement-breakpoint
CREATE INDEX arrangements_search_idx ON public.arrangements USING gin (search_vector);
--> statement-breakpoint
ALTER TABLE "song_image_pages" ADD CONSTRAINT "song_image_pages_image_id_position_key" UNIQUE (tenant_id, "image_id", "position") DEFERRABLE;
--> statement-breakpoint
CREATE UNIQUE INDEX song_scores_song_id_name_idx ON public.song_scores USING btree (tenant_id, song_id, lower(name));
--> statement-breakpoint
CREATE UNIQUE INDEX song_rights_proposals_open_idx ON public.song_rights_proposals USING btree (tenant_id, song_id) WHERE (status = ANY (ARRAY['running'::text, 'pending'::text]));
--> statement-breakpoint
CREATE INDEX song_rights_proposals_song_id_idx ON public.song_rights_proposals USING btree (song_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX song_rights_proposals_answered_idx ON public.song_rights_proposals USING btree (provider, model, created_at) WHERE ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text])) OR ((status = 'failed'::text) AND (error_kind IS NULL)));
--> statement-breakpoint
ALTER TABLE "setlist_items" ADD CONSTRAINT "setlist_items_setlist_id_position_key" UNIQUE (tenant_id, "setlist_id", "position") DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
CREATE UNIQUE INDEX projection_themes_one_default_idx ON public.projection_themes USING btree (tenant_id, is_default) WHERE is_default;
--> statement-breakpoint
CREATE INDEX courses_removed_at_idx ON public.courses USING btree (removed_at) WHERE (removed_at IS NOT NULL);
--> statement-breakpoint
CREATE INDEX course_lessons_removed_at_idx ON public.course_lessons USING btree (removed_at) WHERE (removed_at IS NOT NULL);
--> statement-breakpoint
ALTER TABLE "announcement_calendars" ADD CONSTRAINT "announcement_calendars_position_key" UNIQUE (tenant_id, "position") DEFERRABLE;
--> statement-breakpoint
ALTER TABLE "annotations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "annotations" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "annotations" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
ALTER TABLE "announcement_calendars" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "announcement_calendars" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "announcement_calendars" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
ALTER TABLE "announcement_settings" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "announcement_settings" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "announcement_settings" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
ALTER TABLE "app_config" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "app_config" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "app_config" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
ALTER TABLE "app_modules" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "app_modules" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "app_modules" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
ALTER TABLE "arrangements" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "arrangements" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "arrangements" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
ALTER TABLE "calendar_feeds" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "calendar_feeds" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "calendar_feeds" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
ALTER TABLE "course_images" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "course_images" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "course_images" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
ALTER TABLE "course_lessons" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "course_lessons" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "course_lessons" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
ALTER TABLE "courses" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "courses" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "courses" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
ALTER TABLE "email_templates" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "email_templates" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "email_templates" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
ALTER TABLE "mixer_settings" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "mixer_settings" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "mixer_settings" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
ALTER TABLE "notification_preferences" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "notification_preferences" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "notification_preferences" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
ALTER TABLE "projection_themes" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "projection_themes" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "projection_themes" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
ALTER TABLE "projection_video_uploads" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "projection_video_uploads" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "projection_video_uploads" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
ALTER TABLE "push_subscriptions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "push_subscriptions" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "push_subscriptions" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
ALTER TABLE "scripture_books" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "scripture_books" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "scripture_books" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
CREATE POLICY "catalog_read" ON "scripture_books" AS PERMISSIVE FOR SELECT TO churchy_app, churchy_music
  USING (tenant_id IS NULL AND (SELECT app.current_tenant_id()) IS NOT NULL);
--> statement-breakpoint
ALTER TABLE "scripture_verse_cache" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "scripture_verse_cache" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "scripture_verse_cache" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
CREATE POLICY "catalog_read" ON "scripture_verse_cache" AS PERMISSIVE FOR SELECT TO churchy_app, churchy_music
  USING (tenant_id IS NULL AND (SELECT app.current_tenant_id()) IS NOT NULL);
--> statement-breakpoint
ALTER TABLE "setlist_item_durations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "setlist_item_durations" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "setlist_item_durations" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
ALTER TABLE "setlist_item_themes" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "setlist_item_themes" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "setlist_item_themes" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
ALTER TABLE "setlist_items" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "setlist_items" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "setlist_items" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
ALTER TABLE "setlists" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "setlists" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "setlists" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
ALTER TABLE "sheet_marks" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "sheet_marks" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "sheet_marks" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
ALTER TABLE "song_image_arrangements" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "song_image_arrangements" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "song_image_arrangements" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
ALTER TABLE "song_image_pages" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "song_image_pages" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "song_image_pages" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
ALTER TABLE "song_image_stray_files" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "song_image_stray_files" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "song_image_stray_files" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
ALTER TABLE "song_images" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "song_images" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "song_images" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
ALTER TABLE "song_link_arrangements" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "song_link_arrangements" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "song_link_arrangements" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
ALTER TABLE "song_links" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "song_links" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "song_links" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
ALTER TABLE "song_pdf_arrangements" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "song_pdf_arrangements" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "song_pdf_arrangements" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
ALTER TABLE "song_pdf_uploads" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "song_pdf_uploads" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "song_pdf_uploads" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
ALTER TABLE "song_pdfs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "song_pdfs" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "song_pdfs" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
ALTER TABLE "song_rights_proposals" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "song_rights_proposals" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "song_rights_proposals" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
ALTER TABLE "song_rights_research_settings" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "song_rights_research_settings" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "song_rights_research_settings" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
ALTER TABLE "song_scores" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "song_scores" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "song_scores" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
ALTER TABLE "song_sound_file_arrangements" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "song_sound_file_arrangements" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "song_sound_file_arrangements" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
ALTER TABLE "song_sound_file_uploads" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "song_sound_file_uploads" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "song_sound_file_uploads" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
ALTER TABLE "song_sound_files" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "song_sound_files" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "song_sound_files" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
ALTER TABLE "songs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "songs" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "songs" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
ALTER TABLE "stray_files" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "stray_files" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "stray_files" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
ALTER TABLE "user_arrangement_views" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "user_arrangement_views" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "user_arrangement_views" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
ALTER TABLE "user_arrangements" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "user_arrangements" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "user_arrangements" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
ALTER TABLE "user_file_views" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "user_file_views" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "user_file_views" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
