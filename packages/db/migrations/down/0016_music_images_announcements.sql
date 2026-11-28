DO $$
DECLARE f text;
BEGIN
  FOR f IN SELECT p.oid::regprocedure::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('add_event_image','copy_event_image_set','count_event_images_for_limit',
      'delete_unused_event_image_sets','mark_event_image_set_used','move_event_set_images','claim_announcement_refresh',
      'copy_announcement_entries','copy_event_announcement','delete_unused_event_announcements',
      'mark_event_announcement_used','remove_calendar_entries_from_snapshots','set_announcement_entry_attachment',
      'swap_announcement_calendars','church_day')
  LOOP
    EXECUTE format('DROP FUNCTION %s CASCADE', f);
  END LOOP;
END
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS announcement_calendars_set_updated_at ON public.announcement_calendars;
--> statement-breakpoint
DROP TRIGGER IF EXISTS announcement_settings_set_updated_at ON public.announcement_settings;
--> statement-breakpoint
DROP TRIGGER IF EXISTS setlist_items_mark_event_image_set_used ON public.setlist_items;
--> statement-breakpoint
DROP TRIGGER IF EXISTS setlist_items_mark_event_announcement_used ON public.setlist_items;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "event_announcement_entries";
--> statement-breakpoint
REVOKE ALL ON TABLE "event_announcement_entries" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "event_announcement_entries" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP TABLE IF EXISTS "event_announcement_entries";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "event_announcements";
--> statement-breakpoint
REVOKE ALL ON TABLE "event_announcements" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "event_announcements" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP TABLE IF EXISTS "event_announcements";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "event_images";
--> statement-breakpoint
REVOKE ALL ON TABLE "event_images" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "event_images" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP TABLE IF EXISTS "event_images";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "event_image_sets";
--> statement-breakpoint
REVOKE ALL ON TABLE "event_image_sets" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "event_image_sets" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP TABLE IF EXISTS "event_image_sets";
-- set_event_items and copy_event without images and announcements come back with the down of 0015.
