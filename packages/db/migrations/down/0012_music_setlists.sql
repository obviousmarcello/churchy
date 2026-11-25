DO $$
DECLARE f text;
BEGIN
  FOR f IN SELECT p.oid::regprocedure::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('setlist_items_input','normalize_event_blocks','set_event_items',
      'add_event_items','remove_event_item','create_event_block','delete_event_block','update_event_block',
      'start_event_block','add_event_arrangement','delete_unused_setlist','prevent_setlist_update','check_setlist')
  LOOP
    EXECUTE format('DROP FUNCTION %s CASCADE', f);
  END LOOP;
END
$$;
--> statement-breakpoint
ALTER TABLE "service_plans" DROP CONSTRAINT IF EXISTS "service_plans_setlist_id_fkey";
--> statement-breakpoint
ALTER TABLE "service_plans" ADD CONSTRAINT "service_plans_setlist_id_fkey" FOREIGN KEY ("tenant_id","setlist_id") REFERENCES "public"."setlists"("tenant_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "setlist_item_blocks";
--> statement-breakpoint
REVOKE ALL ON TABLE "setlist_item_blocks" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "setlist_item_blocks" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP TABLE IF EXISTS "setlist_item_blocks";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "event_blocks";
--> statement-breakpoint
REVOKE ALL ON TABLE "event_blocks" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "event_blocks" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP TABLE IF EXISTS "event_blocks";
