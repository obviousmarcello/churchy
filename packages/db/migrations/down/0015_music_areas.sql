DO $$
DECLARE f text;
BEGIN
  FOR f IN SELECT p.oid::regprocedure::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('music_root_area_id','root_area_ids','check_service_area_children','check_service_area_cycle',
      'check_service_areas_limit','lock_service_area_tree','rebuild_service_area_paths','create_service_area','move_service_area',
      'place_service_area','delete_service_area','set_service_area_members','set_service_area_order','service_area_uses',
      'leads_service_area','member_area_ids','led_area_ids','area_member_ids','add_new_user_to_service_areas','check_area_members',
      'normalize_event_areas','events_before_area_delete','event_member_access','check_team_outsiders','set_event_teams',
      'set_event_area_team','set_event_area_teams','set_event_area_note','set_volunteer_reply','reset_volunteer_replies',
      'check_setlist_item_volunteer','create_volunteer_template','set_volunteer_template','set_volunteer_template_area',
      'check_volunteer_templates_limit','service_area_gives_roles','set_service_area_roles','check_service_area_role',
      'can_see_event','copy_event')
  LOOP
    EXECUTE format('DROP FUNCTION %s CASCADE', f);
  END LOOP;
END
$$;
--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_volunteer_template_id_fkey";
--> statement-breakpoint
DROP INDEX IF EXISTS "events_area_ids_idx";
--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN IF EXISTS "volunteer_template_id", DROP COLUMN IF EXISTS "area_ids";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "setlist_item_volunteers";
--> statement-breakpoint
REVOKE ALL ON TABLE "setlist_item_volunteers" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "setlist_item_volunteers" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP TABLE IF EXISTS "setlist_item_volunteers";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "event_team_notes";
--> statement-breakpoint
REVOKE ALL ON TABLE "event_team_notes" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "event_team_notes" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP TABLE IF EXISTS "event_team_notes";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "event_area_notes";
--> statement-breakpoint
REVOKE ALL ON TABLE "event_area_notes" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "event_area_notes" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP TABLE IF EXISTS "event_area_notes";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "event_volunteer_areas";
--> statement-breakpoint
REVOKE ALL ON TABLE "event_volunteer_areas" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "event_volunteer_areas" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP TABLE IF EXISTS "event_volunteer_areas";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "event_volunteers";
--> statement-breakpoint
REVOKE ALL ON TABLE "event_volunteers" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "event_volunteers" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP TABLE IF EXISTS "event_volunteers";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "volunteer_template_members";
--> statement-breakpoint
REVOKE ALL ON TABLE "volunteer_template_members" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "volunteer_template_members" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP TABLE IF EXISTS "volunteer_template_members";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "volunteer_template_areas";
--> statement-breakpoint
REVOKE ALL ON TABLE "volunteer_template_areas" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "volunteer_template_areas" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP TABLE IF EXISTS "volunteer_template_areas";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "volunteer_templates";
--> statement-breakpoint
REVOKE ALL ON TABLE "volunteer_templates" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "volunteer_templates" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP TABLE IF EXISTS "volunteer_templates";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "course_areas";
--> statement-breakpoint
REVOKE ALL ON TABLE "course_areas" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "course_areas" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP TABLE IF EXISTS "course_areas";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "service_area_roles";
--> statement-breakpoint
REVOKE ALL ON TABLE "service_area_roles" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "service_area_roles" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP TABLE IF EXISTS "service_area_roles";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "service_area_members";
--> statement-breakpoint
REVOKE ALL ON TABLE "service_area_members" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "service_area_members" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP TABLE IF EXISTS "service_area_members";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "service_area_paths";
--> statement-breakpoint
REVOKE ALL ON TABLE "service_area_paths" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "service_area_paths" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP TABLE IF EXISTS "service_area_paths";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "service_areas";
--> statement-breakpoint
REVOKE ALL ON TABLE "service_areas" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "service_areas" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP TABLE IF EXISTS "service_areas";
