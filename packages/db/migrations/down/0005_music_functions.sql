-- Down of 0005_music_functions.
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.valid_announcement_words(p_words text[]);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.church_time_zone();
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.setlist_song_count(p_items jsonb);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.canonical_key(p_key text, p_notation text);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.chart_key_names(p_chordpro text);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.chart_notation(p_chordpro text);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.chordpro_directive(p_chordpro text, p_name text);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.valid_song_tags(p_tags text[]);
--> statement-breakpoint
DROP TEXT SEARCH CONFIGURATION IF EXISTS public.simple_unaccent;
--> statement-breakpoint
DROP EXTENSION IF EXISTS pg_trgm;
