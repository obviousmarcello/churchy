DO $$
BEGIN
  IF to_regclass('realtime.messages') IS NOT NULL THEN
    DROP POLICY IF EXISTS "music participants can receive" ON realtime.messages;
    DROP POLICY IF EXISTS "music participants can track presence" ON realtime.messages;
    DROP POLICY IF EXISTS "music participants can broadcast" ON realtime.messages;
  END IF;
END
$$;
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.music_realtime_allowed(text, boolean) CASCADE;
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
    created_by, area_ids, volunteer_template_id
  )
  select
    p_id, e.calendar_id, e.visibility, e.status, 'masolat-' || replace(p_id::text, '-', ''), p_title,
    p_starts_at, p_starts_at + make_interval(mins => p_duration_minutes), p_youtube_url,
    coalesce(p_is_private, e.is_private), coalesce(p_created_by, e.created_by),
    coalesce(p_area_ids, e.area_ids), e.volunteer_template_id
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
--> statement-breakpoint
DROP TRIGGER IF EXISTS events_check_open_projection ON public.events;
--> statement-breakpoint
DROP TRIGGER IF EXISTS projection_themes_set_updated_at ON public.projection_themes;
--> statement-breakpoint
DROP TRIGGER IF EXISTS projection_themes_keep_stray_file ON public.projection_themes;
--> statement-breakpoint
DROP TRIGGER IF EXISTS projection_themes_keep_replaced_stray_file ON public.projection_themes;
--> statement-breakpoint
DROP TRIGGER IF EXISTS projection_themes_claim_stray_file ON public.projection_themes;
--> statement-breakpoint
DROP TRIGGER IF EXISTS projection_themes_keep_stray_video ON public.projection_themes;
--> statement-breakpoint
DROP TRIGGER IF EXISTS projection_themes_keep_replaced_stray_video ON public.projection_themes;
--> statement-breakpoint
DROP TRIGGER IF EXISTS projection_themes_claim_stray_video ON public.projection_themes;
--> statement-breakpoint
DROP TRIGGER IF EXISTS projection_themes_keep_default ON public.projection_themes;
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.check_open_projection_before_delete() CASCADE;
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.can_project_event(uuid, uuid, boolean) CASCADE;
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.touch_projection_controller(uuid, uuid, uuid) CASCADE;
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.projection_open_since() CASCADE;
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.set_projection_theme_video(uuid, text, text) CASCADE;
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.start_projection_video_upload(uuid, text, integer) CASCADE;
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.set_event_item_theme(uuid, uuid, uuid) CASCADE;
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.default_projection_theme_id() CASCADE;
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.set_default_projection_theme(uuid) CASCADE;
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.keep_default_projection_theme() CASCADE;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "event_projection_controllers";
--> statement-breakpoint
REVOKE ALL ON TABLE "event_projection_controllers" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "event_projection_controllers" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP TABLE IF EXISTS "event_projection_controllers";
--> statement-breakpoint
DROP INDEX IF EXISTS "events_projection_theme_id_idx";
--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_projection_theme_id_fkey";
--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN IF EXISTS "projection_theme_id";
