ALTER TABLE "calendars" ADD COLUMN "is_music" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "setlist_id" uuid;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "youtube_url" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "is_private" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "service_plans" ADD COLUMN "setlist_id" uuid;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_setlist_id_fkey" FOREIGN KEY ("tenant_id","setlist_id") REFERENCES "public"."setlists"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_plans" ADD CONSTRAINT "service_plans_setlist_id_fkey" FOREIGN KEY ("tenant_id","setlist_id") REFERENCES "public"."setlists"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "calendars_one_music_idx" ON "calendars" USING btree ("tenant_id") WHERE "calendars"."is_music";--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_tenant_id_setlist_id_key" UNIQUE("tenant_id","setlist_id");--> statement-breakpoint
ALTER TABLE "service_plans" ADD CONSTRAINT "service_plans_tenant_id_setlist_id_key" UNIQUE("tenant_id","setlist_id");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_youtube_url_check" CHECK ("events"."youtube_url" is null or (char_length("events"."youtube_url") <= 500 and "events"."youtube_url" ~ '^https://(((www|m|music)\.)?youtube\.com|youtu\.be)/'));
--> statement-breakpoint
-- Music merge phase 4 (events, PLAN §11 "one events table"): the music role works on Churchy's
-- `events` and `calendars`, but only on the tenant's music calendar (`calendars.is_music`) and its
-- events. A RESTRICTIVE `music_scope` policy (churchy_music only) enforces that, so the music JWT
-- can neither read nor change a public or other internal event/calendar.
DROP POLICY "tenant_isolation" ON "events";
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "events" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "calendars";
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "calendars" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
CREATE POLICY "music_scope" ON "calendars" AS RESTRICTIVE FOR ALL TO churchy_music
  USING (is_music) WITH CHECK (is_music);
--> statement-breakpoint
CREATE POLICY "music_scope" ON "events" AS RESTRICTIVE FOR ALL TO churchy_music
  USING (EXISTS (SELECT 1 FROM public.calendars c WHERE c.tenant_id = events.tenant_id AND c.id = events.calendar_id AND c.is_music))
  WITH CHECK (EXISTS (SELECT 1 FROM public.calendars c WHERE c.tenant_id = events.tenant_id AND c.id = events.calendar_id AND c.is_music));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "events" TO churchy_app, churchy_music;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "calendars" TO churchy_app, churchy_music;
--> statement-breakpoint
-- The tenant's music calendar: created on first use. SECURITY INVOKER, tenant from RLS.
CREATE OR REPLACE FUNCTION public.music_calendar_id()
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.calendars where is_music;
  if v_id is null then
    insert into public.calendars (tenant_id, name, color, kind, default_visibility, is_music)
    values (app.current_tenant_id(), 'Zenei események', '#5b6b8c', 'shared', 'staff', true)
    on conflict (tenant_id) where is_music do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from public.calendars where is_music;
    end if;
  end if;
  return v_id;
end;
$$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.music_calendar_id() TO churchy_app, churchy_music;
