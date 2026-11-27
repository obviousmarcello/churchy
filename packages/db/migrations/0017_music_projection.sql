CREATE TABLE "event_projection_controllers" (
	"tenant_id" uuid DEFAULT app.current_tenant_id() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_projection_controllers_tenant_id_id_key" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "event_projection_controllers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "projection_theme_id" uuid;--> statement-breakpoint
ALTER TABLE "event_projection_controllers" ADD CONSTRAINT "event_projection_controllers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_projection_controllers" ADD CONSTRAINT "event_projection_controllers_event_id_fkey" FOREIGN KEY ("tenant_id","event_id") REFERENCES "public"."events"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_projection_controllers" ADD CONSTRAINT "event_projection_controllers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_projection_controllers_tenant_id_idx" ON "event_projection_controllers" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "event_projection_controllers_event_id_idx" ON "event_projection_controllers" USING btree ("event_id","seen_at");--> statement-breakpoint
CREATE INDEX "event_projection_controllers_user_id_idx" ON "event_projection_controllers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "event_projection_controllers_seen_at_idx" ON "event_projection_controllers" USING btree ("seen_at");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_projection_theme_id_fkey" FOREIGN KEY ("tenant_id","projection_theme_id") REFERENCES "public"."projection_themes"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Music merge phase 5 (projection). A deleted theme leaves the events that use it with the default.
ALTER TABLE "events" DROP CONSTRAINT "events_projection_theme_id_fkey";
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_projection_theme_id_fkey" FOREIGN KEY (tenant_id, "projection_theme_id") REFERENCES "projection_themes" (tenant_id, "id") ON DELETE SET NULL ("projection_theme_id");
--> statement-breakpoint
CREATE INDEX "events_projection_theme_id_idx" ON "events" USING btree ("projection_theme_id") WHERE "projection_theme_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "event_projection_controllers" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "event_projection_controllers" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "event_projection_controllers" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
CREATE TRIGGER projection_themes_set_updated_at BEFORE UPDATE ON public.projection_themes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
-- The files of a theme (image and video) go to `stray_files` when it drops them.
CREATE TRIGGER projection_themes_keep_stray_file AFTER DELETE ON public.projection_themes
  FOR EACH ROW EXECUTE FUNCTION public.keep_stray_file('projection-backgrounds', 'background_image_path');
--> statement-breakpoint
CREATE TRIGGER projection_themes_keep_replaced_stray_file AFTER UPDATE OF background_image_path ON public.projection_themes
  FOR EACH ROW WHEN (old.background_image_path IS DISTINCT FROM new.background_image_path)
  EXECUTE FUNCTION public.keep_stray_file('projection-backgrounds', 'background_image_path');
--> statement-breakpoint
CREATE TRIGGER projection_themes_claim_stray_file AFTER INSERT OR UPDATE OF background_image_path ON public.projection_themes
  FOR EACH ROW EXECUTE FUNCTION public.claim_stray_file('projection-backgrounds', 'background_image_path');
--> statement-breakpoint
CREATE TRIGGER projection_themes_keep_stray_video AFTER DELETE ON public.projection_themes
  FOR EACH ROW EXECUTE FUNCTION public.keep_stray_file('projection-videos', 'background_video_path');
--> statement-breakpoint
CREATE TRIGGER projection_themes_keep_replaced_stray_video AFTER UPDATE OF background_video_path ON public.projection_themes
  FOR EACH ROW WHEN (old.background_video_path IS DISTINCT FROM new.background_video_path)
  EXECUTE FUNCTION public.keep_stray_file('projection-videos', 'background_video_path');
--> statement-breakpoint
CREATE TRIGGER projection_themes_claim_stray_video AFTER INSERT OR UPDATE OF background_video_path ON public.projection_themes
  FOR EACH ROW EXECUTE FUNCTION public.claim_stray_file('projection-videos', 'background_video_path');
--> statement-breakpoint
-- The default theme cannot be deleted, and the mark cannot go away: move it with
-- `set_default_projection_theme()`. Per tenant: the rows of the tenant in the transaction's RLS view.
create or replace function public.keep_default_projection_theme()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Changes of the mark wait for each other here.
  perform pg_advisory_xact_lock(hashtext('public.projection_themes'), hashtext(old.tenant_id::text));
  -- A tenant that is being deleted takes its themes with it (the music role cannot read `tenants`).
  begin
    if not exists (select 1 from public.tenants where id = old.tenant_id) then
      return null;
    end if;
  exception when insufficient_privilege then
    null;
  end;
  if not exists (select 1 from public.projection_themes where tenant_id = old.tenant_id and is_default) then
    raise exception 'cannot remove the default projection theme' using errcode = 'P0001', hint = 'default_theme';
  end if;
  return null;
end;
$$;
--> statement-breakpoint
create constraint trigger projection_themes_keep_default
after delete or update of is_default on public.projection_themes
deferrable initially deferred
for each row
when (old.is_default)
execute function public.keep_default_projection_theme();
--> statement-breakpoint
-- Makes the theme `p_id` the default of its tenant. Returns false if there is no such theme.
create or replace function public.set_default_projection_theme(p_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('public.projection_themes'), hashtext(app.current_tenant_id()::text));
  if not exists (select 1 from public.projection_themes where id = p_id) then
    return false;
  end if;

  -- Two steps: the unique index allows one default at a time.
  update public.projection_themes set is_default = false where is_default and id <> p_id;
  update public.projection_themes set is_default = true where id = p_id and not is_default;
  return true;
end;
$$;
--> statement-breakpoint
-- The default theme of the tenant (the look from before the themes): gets or creates it.
create or replace function public.default_projection_theme_id()
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.projection_themes where is_default;
  if found then
    return v_id;
  end if;
  perform pg_advisory_xact_lock(hashtext('public.projection_themes'), hashtext(app.current_tenant_id()::text));
  select id into v_id from public.projection_themes where is_default;
  if found then
    return v_id;
  end if;
  insert into public.projection_themes (name, is_default, background_color, font, text_color)
  values ('Alapértelmezett', true, '#000000', 'inter', '#ffffff')
  on conflict (tenant_id, name) do update set is_default = true
  returning id into v_id;
  return v_id;
end;
$$;
--> statement-breakpoint
-- The theme of the item `p_item_id` of the event, or none for null: the item then uses the theme of
-- the event. Returns `no_event`, `no_item` (not in the items of the event now) or `saved`.
create or replace function public.set_event_item_theme(p_event_id uuid, p_item_id uuid, p_theme_id uuid)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_setlist_id uuid;
begin
  -- Changes of the same event wait for each other here, as in `set_event_items()`.
  select e.setlist_id into v_setlist_id
  from public.events e
  where e.id = p_event_id
  for update;
  if not found then
    return 'no_event';
  end if;

  if not exists (select 1 from public.setlist_items where id = p_item_id and setlist_id = v_setlist_id) then
    return 'no_item';
  end if;

  if p_theme_id is null then
    delete from public.setlist_item_themes where setlist_item_id = p_item_id;
  else
    insert into public.setlist_item_themes (setlist_item_id, theme_id)
    values (p_item_id, p_theme_id)
    on conflict (tenant_id, setlist_item_id) do update set theme_id = excluded.theme_id;
  end if;

  return 'saved';
end;
$$;
--> statement-breakpoint
create or replace function public.start_projection_video_upload(p_user_id uuid, p_path text, p_max integer)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('public.projection_video_uploads'), hashtext(p_user_id::text));

  if (
    select count(*) from public.projection_video_uploads
    where user_id = p_user_id and created_at > now() - interval '2 hours'
  ) >= p_max then
    raise exception 'too many video uploads' using errcode = 'P0001', hint = 'too_many_projection_video_uploads';
  end if;

  insert into public.projection_video_uploads (path, user_id) values (p_path, p_user_id);
end;
$$;
--> statement-breakpoint
-- Sets the uploaded video `p_video_path` and its poster `p_poster_path` (a file of
-- `projection-backgrounds`) as the background of the theme. False if there is no such theme.
create or replace function public.set_projection_theme_video(p_theme_id uuid, p_video_path text, p_poster_path text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform 1 from public.projection_themes where id = p_theme_id for update;
  if not found then
    return false;
  end if;

  delete from public.projection_video_uploads where path = p_video_path;
  if not found then
    raise exception 'unknown upload' using errcode = 'P0001', hint = 'projection_video_upload_missing';
  end if;

  update public.projection_themes
  set background_video_path = p_video_path, background_image_path = p_poster_path
  where id = p_theme_id;
  return true;
end;
$$;
--> statement-breakpoint
-- A controller of `event_projection_controllers` is open for this time after its last sign.
create or replace function public.projection_open_since()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select now() - interval '2 minutes';
$$;
--> statement-breakpoint
-- The controller of the user is open: a new row, or a new time for the row. At most 5 rows per user
-- and event (a new tab removes the oldest). Removes the rows that closed more than a day ago. False
-- when there is no such event, or the row is of another user.
create or replace function public.touch_projection_controller(p_id uuid, p_event_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.event_projection_controllers where seen_at < now() - interval '1 day';

  if not exists (select 1 from public.events where id = p_event_id) then
    return false;
  end if;

  insert into public.event_projection_controllers (id, event_id, user_id)
  values (p_id, p_event_id, p_user_id)
  on conflict (id) do update set seen_at = now()
  where event_projection_controllers.user_id = excluded.user_id and event_projection_controllers.event_id = excluded.event_id;
  get diagnostics v_count = row_count;

  delete from public.event_projection_controllers c
  where c.id in (
    select o.id from public.event_projection_controllers o
    where o.event_id = p_event_id and o.user_id = p_user_id
    order by o.seen_at desc, o.id
    offset 5
  );

  return v_count > 0;
end;
$$;
--> statement-breakpoint
-- The user can control the projection of the event: a volunteer, or an event admin (`p_is_admin`,
-- decided by `can()` in the app) who can see the event.
create or replace function public.can_project_event(p_event_id uuid, p_user_id uuid, p_is_admin boolean default false)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (select 1 from public.event_volunteers where event_id = p_event_id and user_id = p_user_id)
    or (p_is_admin and public.can_see_event(p_event_id, p_user_id, true));
$$;
--> statement-breakpoint
-- While a controller of the event is open, the event cannot be deleted. With the header
-- `x-app-end-projections: true` (the server ends them), the open controllers do not block it.
create or replace function public.check_open_projection_before_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_end boolean;
begin
  begin
    v_end := nullif(current_setting('request.headers', true), '')::json ->> 'x-app-end-projections' = 'true';
  exception when others then
    v_end := false;
  end;

  -- No tenant context: a platform operation (deleting a tenant cascades over its events).
  if app.current_tenant_id() is null then
    return old;
  end if;

  if not coalesce(v_end, false) and exists (
    select 1 from public.event_projection_controllers c
    where c.event_id = old.id and c.seen_at > public.projection_open_since()
  ) then
    raise exception 'a projection of the event is open' using errcode = 'P0001', hint = 'projection_open';
  end if;
  return old;
end;
$$;
--> statement-breakpoint
create trigger events_check_open_projection
before delete on public.events
for each row execute function public.check_open_projection_before_delete();
--> statement-breakpoint
-- Realtime authorization (music merge phase 5, PLAN §19). The browsers talk on private Supabase
-- Realtime channels with a short-lived token that the server mints after `can()` and the models
-- decided who may use which channel (`mintRealtimeToken`): the claims `rt_topics` (channels the token may
-- receive on and track presence on) and `rt_send` (channels it may broadcast on). The topics are
-- namespaced per tenant (`t:<tenant id>:<channel>`). The policies below only compare the topic with
-- the claims of the token, so no table has to be readable by the Realtime role and no function needs
-- `security definer`.
create or replace function public.music_realtime_allowed(p_topic text, p_send boolean)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select p_topic is not null
    and coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) ->> 'iss' = 'churchy'
    and exists (
      select 1
      from (select nullif(current_setting('request.jwt.claims', true), '')::jsonb as c) j
      where j.c ->> 'tenant_id' is not null
        and p_topic like 't:' || (j.c ->> 'tenant_id') || ':%'
        and jsonb_typeof(j.c -> case when p_send then 'rt_send' else 'rt_topics' end) = 'array'
        and (j.c -> case when p_send then 'rt_send' else 'rt_topics' end) ? p_topic
    );
$$;
--> statement-breakpoint
-- Only where Supabase Realtime exists (not on plain Postgres or the in-process demo database).
DO $$
BEGIN
  IF to_regclass('realtime.messages') IS NOT NULL THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.music_realtime_allowed(text, boolean) TO authenticated';
    EXECUTE $p$CREATE POLICY "music participants can receive" ON realtime.messages FOR SELECT TO authenticated
      USING (realtime.messages.extension IN ('broadcast', 'presence') AND (SELECT public.music_realtime_allowed((SELECT realtime.topic()), false)))$p$;
    EXECUTE $p$CREATE POLICY "music participants can track presence" ON realtime.messages FOR INSERT TO authenticated
      WITH CHECK (realtime.messages.extension = 'presence' AND (SELECT public.music_realtime_allowed((SELECT realtime.topic()), false)))$p$;
    EXECUTE $p$CREATE POLICY "music participants can broadcast" ON realtime.messages FOR INSERT TO authenticated
      WITH CHECK (realtime.messages.extension = 'broadcast' AND (SELECT public.music_realtime_allowed((SELECT realtime.topic()), true)))$p$;
  END IF;
END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.copy_event(
  p_id uuid,
  p_source_id uuid,
  p_title text,
  p_starts_at timestamptz,
  p_duration_minutes integer,
  p_youtube_url text,
  p_copy_items boolean,
  p_copy_volunteers boolean,
  p_files jsonb,
  p_is_private boolean default null,
  p_created_by uuid default null,
  p_area_ids uuid[] default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_items jsonb := '[]'::jsonb;
  v_set uuid;
  v_announcement uuid;
  r record;
begin
  if not exists (select 1 from public.events where id = p_source_id) then
    return null;
  end if;

  insert into public.events (
    id, calendar_id, visibility, status, slug, title, starts_at, ends_at, youtube_url, is_private,
    created_by, area_ids, volunteer_template_id, projection_theme_id
  )
  select
    p_id, e.calendar_id, e.visibility, e.status, 'masolat-' || replace(p_id::text, '-', ''), p_title,
    p_starts_at, p_starts_at + make_interval(mins => p_duration_minutes), p_youtube_url,
    coalesce(p_is_private, e.is_private), coalesce(p_created_by, e.created_by),
    coalesce(p_area_ids, e.area_ids), e.volunteer_template_id, e.projection_theme_id
  from public.events e
  where e.id = p_source_id
  returning id into v_id;

  if p_copy_volunteers then
    insert into public.event_volunteers (event_id, user_id)
    select v_id, v.user_id from public.event_volunteers v where v.event_id = p_source_id;

    insert into public.event_volunteer_areas (event_id, area_id, user_id, position)
    select v_id, a.area_id, a.user_id, a.position
    from public.event_volunteer_areas a
    where a.event_id = p_source_id;
  end if;

  -- The blocks keep their keys, not started.
  if p_copy_items then
    insert into public.event_blocks (event_id, key, name, countdown, countdown_until, duration_seconds)
    select v_id, b.key, b.name, b.countdown, b.countdown_until, b.duration_seconds
    from public.event_blocks b
    where b.event_id = p_source_id;
  end if;

  -- The form of `set_event_items()`. The join with the new volunteers keeps only the volunteers
  -- that were copied; `p_files` maps the old image paths to the copies in Storage.
  for r in
    select si.*, nv.user_id as new_volunteer_id, sit.theme_id, sid.seconds as duration_seconds, sib.block_key
    from public.events e
    join public.setlist_items si on si.setlist_id = e.setlist_id
    left join public.setlist_item_volunteers siv on siv.setlist_item_id = si.id
    left join public.event_volunteers nv on nv.event_id = v_id and nv.user_id = siv.user_id
    left join public.setlist_item_themes sit on sit.setlist_item_id = si.id
    left join public.setlist_item_durations sid on sid.setlist_item_id = si.id
    left join public.setlist_item_blocks sib on sib.setlist_item_id = si.id
    where e.id = p_source_id and p_copy_items
    order by si.position
  loop
    v_set := null;
    v_announcement := null;

    if r.image_set_id is not null then
      v_set := public.copy_event_image_set(r.image_set_id, v_id, p_files);
      -- No copy of its files: the item stays in the source event.
      continue when v_set is null;
    end if;

    if r.announcement_id is not null then
      insert into public.event_announcements (
        event_id, calendar_ids, show_time, show_location, show_description,
        title_next_week, title_this_month, title_next_month, snapshot, calendar_status
      )
      select
        v_id, a.calendar_ids, a.show_time, a.show_location, a.show_description,
        a.title_next_week, a.title_this_month, a.title_next_month, a.snapshot, a.calendar_status
      from public.event_announcements a
      where a.id = r.announcement_id
      returning id into v_announcement;

      perform public.copy_announcement_entries(r.announcement_id, v_announcement, p_files);
    end if;

    v_items := v_items || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'arrangement_id', r.arrangement_id,
      'musical_key', r.musical_key,
      'title', r.title,
      'notes', r.notes,
      'scripture', nullif(r.scripture, false),
      'translation', r.scripture_translation,
      'image_set_id', v_set,
      'announcement_id', v_announcement,
      'text_slide', nullif(r.text_slide, false),
      'description', r.description,
      'highlight', r.highlight,
      'volunteer_id', r.new_volunteer_id,
      'theme_id', r.theme_id,
      'duration_seconds', r.duration_seconds,
      'block_key', r.block_key
    )));
  end loop;

  perform public.set_event_items(v_id, v_items, null, false);

  return v_id;
end;
$$;