-- Down of 0022_music_notifications.
DROP TRIGGER IF EXISTS events_reset_notification_deliveries ON public.events;
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.reset_notification_deliveries();
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.list_due_notifications(integer);
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "notification_deliveries";
--> statement-breakpoint
REVOKE ALL ON TABLE "notification_deliveries" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "notification_deliveries" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP TABLE IF EXISTS "notification_deliveries";
