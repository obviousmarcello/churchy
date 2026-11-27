DROP TRIGGER IF EXISTS arrangements_notify_events ON public.arrangements;
--> statement-breakpoint
DROP TRIGGER IF EXISTS songs_notify_events ON public.songs;
--> statement-breakpoint
DROP TRIGGER IF EXISTS live_sessions_notify ON public.live_sessions;
--> statement-breakpoint
DROP TRIGGER IF EXISTS event_announcement_entries_notify ON public.event_announcement_entries;
--> statement-breakpoint
DROP TRIGGER IF EXISTS event_announcements_update_notify ON public.event_announcements;
--> statement-breakpoint
DROP TRIGGER IF EXISTS event_announcements_notify ON public.event_announcements;
--> statement-breakpoint
DROP TRIGGER IF EXISTS event_images_notify ON public.event_images;
--> statement-breakpoint
DROP TRIGGER IF EXISTS event_image_sets_notify ON public.event_image_sets;
--> statement-breakpoint
DROP TRIGGER IF EXISTS event_blocks_notify ON public.event_blocks;
--> statement-breakpoint
DROP TRIGGER IF EXISTS event_volunteers_notify ON public.event_volunteers;
--> statement-breakpoint
DROP TRIGGER IF EXISTS setlist_item_volunteers_notify ON public.setlist_item_volunteers;
--> statement-breakpoint
DROP TRIGGER IF EXISTS setlist_item_themes_notify ON public.setlist_item_themes;
--> statement-breakpoint
DROP TRIGGER IF EXISTS events_notify ON public.events;
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.notify_song_change() CASCADE;
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.notify_event_part_change() CASCADE;
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.notify_event_change() CASCADE;
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.notify_event(uuid, text) CASCADE;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "live_sessions";
--> statement-breakpoint
REVOKE ALL ON TABLE "live_sessions" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "live_sessions" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP TABLE IF EXISTS "live_sessions";
