CREATE TABLE "live_sessions" (
	"tenant_id" uuid DEFAULT app.current_tenant_id() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid,
	"arrangement_ids" uuid[],
	"musical_keys" text[],
	"leader_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "live_sessions_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "live_sessions_event_or_rehearsal" CHECK (("live_sessions"."event_id" is null) <> ("live_sessions"."arrangement_ids" is null)),
	CONSTRAINT "live_sessions_arrangement_ids_check" CHECK (cardinality("live_sessions"."arrangement_ids") between 1 and 100)
);
--> statement-breakpoint
ALTER TABLE "live_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_event_id_fkey" FOREIGN KEY ("tenant_id","event_id") REFERENCES "public"."events"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_leader_id_fkey" FOREIGN KEY ("leader_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "live_sessions_tenant_id_idx" ON "live_sessions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "live_sessions_leader_id_idx" ON "live_sessions" USING btree ("leader_id");--> statement-breakpoint
CREATE UNIQUE INDEX "live_sessions_one_per_event_idx" ON "live_sessions" USING btree ("tenant_id","event_id") WHERE "live_sessions"."ended_at" is null;--> statement-breakpoint
ALTER TABLE "live_sessions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "live_sessions" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "live_sessions" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
-- Event sync (music merge phase 5b): after a change of an event or of one of its parts the database
-- sends a message `{"kind", "author"}` to the private topic `t:<tenant id>:event:<event id>`; the pages
-- load the event again. Realtime exists only on Supabase: without `realtime.send` (plain Postgres, the
-- in-process demo database) nothing is sent, and a failure never stops the change. SECURITY DEFINER
-- because the music role cannot reach the `realtime` schema; it reads only the tenant of the event.
create or replace function public.notify_event(p_event_id uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sent text := coalesce(current_setting('app.notified_events', true), '');
  v_key text := coalesce(p_event_id::text, '') || ':' || p_kind || ',';
  v_author text;
  v_tenant uuid;
begin
  if p_event_id is null or strpos(v_sent, v_key) > 0 then
    return;
  end if;
  if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is null then
    return;
  end if;
  perform set_config('app.notified_events', v_sent || v_key, true);

  select tenant_id into v_tenant from public.events where id = p_event_id;
  if v_tenant is null then
    return;
  end if;

  -- The header of the server (see `withAuthor` in `server/music/models/shared.ts`).
  begin
    v_author := nullif(current_setting('request.headers', true), '')::json ->> 'x-app-author';
  exception when others then
    v_author := null;
  end;
  if v_author !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_author := null;
  end if;

  begin
    execute 'select realtime.send($1, $2, $3, true)'
      using jsonb_build_object('kind', p_kind, 'author', v_author), 'changed',
        't:' || v_tenant::text || ':event:' || p_event_id::text;
  exception when others then
    raise warning 'event message failed: %', sqlerrm;
  end;
end;
$$;
--> statement-breakpoint
revoke all on function public.notify_event(uuid, text) from public;
--> statement-breakpoint
grant execute on function public.notify_event(uuid, text) to churchy_app, churchy_music;
--> statement-breakpoint
create or replace function public.notify_event_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.notify_event(old.id, 'deleted');
    return null;
  end if;
  if new.setlist_id is distinct from old.setlist_id then
    perform public.notify_event(new.id, 'items');
  end if;
  if (new.title, new.starts_at, new.ends_at, new.youtube_url, new.is_private)
    is distinct from (old.title, old.starts_at, old.ends_at, old.youtube_url, old.is_private)
  then
    perform public.notify_event(new.id, 'details');
  end if;
  if new.projection_theme_id is distinct from old.projection_theme_id then
    perform public.notify_event(new.id, 'themes');
  end if;
  return null;
end;
$$;
--> statement-breakpoint
create trigger events_notify
after update or delete on public.events
for each row execute function public.notify_event_change();
--> statement-breakpoint
-- The tables of the parts of an event. `TG_ARGV[0]`: the kind of the message.
create or replace function public.notify_event_part_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row jsonb;
  v_event_id uuid;
begin
  if tg_op = 'DELETE' then
    v_row := to_jsonb(old);
  else
    v_row := to_jsonb(new);
  end if;

  if tg_table_name = 'setlist_item_themes' or tg_table_name = 'setlist_item_volunteers' then
    -- Not for the rows of an old setlist that its event does not have anymore.
    select e.id into v_event_id
    from public.setlist_items si
    join public.events e on e.setlist_id = si.setlist_id
    where si.id = (v_row ->> 'setlist_item_id')::uuid;
  elsif tg_table_name = 'event_announcement_entries' then
    select a.event_id into v_event_id from public.event_announcements a where a.id = (v_row ->> 'announcement_id')::uuid;
  else
    v_event_id := (v_row ->> 'event_id')::uuid;
  end if;

  perform public.notify_event(v_event_id, tg_argv[0]);
  return null;
end;
$$;
--> statement-breakpoint
create trigger setlist_item_themes_notify after insert or update or delete on public.setlist_item_themes
for each row execute function public.notify_event_part_change('themes');
--> statement-breakpoint
create trigger setlist_item_volunteers_notify after insert or update or delete on public.setlist_item_volunteers
for each row execute function public.notify_event_part_change('items');
--> statement-breakpoint
create trigger event_volunteers_notify after insert or update or delete on public.event_volunteers
for each row execute function public.notify_event_part_change('volunteers');
--> statement-breakpoint
create trigger event_blocks_notify after insert or update or delete on public.event_blocks
for each row execute function public.notify_event_part_change('blocks');
--> statement-breakpoint
create trigger event_image_sets_notify after insert or delete on public.event_image_sets
for each row execute function public.notify_event_part_change('images');
--> statement-breakpoint
create trigger event_images_notify after insert or update or delete on public.event_images
for each row execute function public.notify_event_part_change('images');
--> statement-breakpoint
create trigger event_announcements_notify after insert or delete on public.event_announcements
for each row execute function public.notify_event_part_change('announcements');
--> statement-breakpoint
-- Not for the time and the status of a read of the calendars: only what the slides show.
create trigger event_announcements_update_notify after update on public.event_announcements
for each row
when (
  (to_jsonb(new) - array['refreshed_at', 'refresh_started_at', 'used_at', 'calendar_status', 'updated_at'])
    is distinct from (to_jsonb(old) - array['refreshed_at', 'refresh_started_at', 'used_at', 'calendar_status', 'updated_at'])
)
execute function public.notify_event_part_change('announcements');
--> statement-breakpoint
create trigger event_announcement_entries_notify after insert or update or delete on public.event_announcement_entries
for each row execute function public.notify_event_part_change('announcements');
--> statement-breakpoint
create trigger live_sessions_notify after insert or update or delete on public.live_sessions
for each row execute function public.notify_event_part_change('live');
--> statement-breakpoint
-- A change of a song or an arrangement: the events that have it and that did not end more than a day ago.
create or replace function public.notify_song_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_event_id uuid;
begin
  for v_event_id in
    select distinct e.id
    from public.arrangements a
    join public.setlist_items si on si.arrangement_id = a.id
    join public.events e on e.setlist_id = si.setlist_id
    where (case when tg_table_name = 'songs' then a.song_id else a.id end) = new.id
      and coalesce(e.ends_at, e.starts_at) > now() - interval '1 day'
  loop
    perform public.notify_event(v_event_id, 'songs');
  end loop;
  return null;
end;
$$;
--> statement-breakpoint
create trigger songs_notify_events after update on public.songs
for each row
when ((to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at'))
execute function public.notify_song_change();
--> statement-breakpoint
create trigger arrangements_notify_events after update on public.arrangements
for each row
when ((to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at'))
execute function public.notify_song_change();
