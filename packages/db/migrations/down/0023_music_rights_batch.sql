-- Down of 0023_music_rights_batch.
DROP FUNCTION IF EXISTS public.claim_songs_for_rights_research(integer, text, text);
--> statement-breakpoint
UPDATE "song_rights_research_settings" SET "enabled" = false WHERE "api_key_hint" IS NULL;
--> statement-breakpoint
ALTER TABLE "song_rights_research_settings" DROP CONSTRAINT "song_rights_research_settings_enabled_check";
--> statement-breakpoint
ALTER TABLE "song_rights_research_settings" ADD CONSTRAINT "song_rights_research_settings_enabled_check" CHECK (((NOT enabled) OR ((provider IS NOT NULL) AND (model IS NOT NULL) AND (api_key_hint IS NOT NULL))));
