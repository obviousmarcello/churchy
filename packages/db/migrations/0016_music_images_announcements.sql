CREATE TABLE "event_announcement_entries" (
	"tenant_id" uuid DEFAULT app.current_tenant_id() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"announcement_id" uuid NOT NULL,
	"calendar_id" uuid,
	"uid" text,
	"occurrence" text,
	"title" text COLLATE "hu-HU-x-icu",
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"start_date" date,
	"end_date" date,
	"location" text,
	"description" text,
	"position" integer,
	"highlighted" boolean DEFAULT false NOT NULL,
	"excluded" boolean DEFAULT false NOT NULL,
	"show_time" boolean,
	"show_location" boolean,
	"show_description" boolean,
	"attachment_set_id" uuid,
	"qr_text" text,
	"qr_caption" text,
	"text_first" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_announcement_entries_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "event_announcement_entries_attachment_set_id_key" UNIQUE("tenant_id","attachment_set_id"),
	CONSTRAINT "event_announcement_entries_kind_check" CHECK ((CASE WHEN (calendar_id IS NOT NULL) THEN ((uid IS NOT NULL) AND (occurrence IS NOT NULL) AND (title IS NULL) AND (starts_at IS NULL) AND (ends_at IS NULL) AND (start_date IS NULL) AND (end_date IS NULL) AND (location IS NULL) AND (description IS NULL) AND ("position" IS NULL)) ELSE ((uid IS NULL) AND (occurrence IS NULL) AND (title IS NOT NULL) AND ("position" IS NOT NULL)) END)),
	CONSTRAINT "event_announcement_entries_date_check" CHECK (((NOT ((starts_at IS NOT NULL) AND (start_date IS NOT NULL))) AND ((ends_at IS NULL) OR ((starts_at IS NOT NULL) AND (ends_at >= starts_at))) AND ((end_date IS NULL) OR ((start_date IS NOT NULL) AND (end_date >= start_date))))),
	CONSTRAINT "event_announcement_entries_undated_check" CHECK (((calendar_id IS NOT NULL) OR (starts_at IS NOT NULL) OR (start_date IS NOT NULL) OR highlighted)),
	CONSTRAINT "event_announcement_entries_qr_check" CHECK (((qr_caption IS NULL) OR (qr_text IS NOT NULL))),
	CONSTRAINT "event_announcement_entries_uid_check" CHECK (((char_length(uid) >= 1) AND (char_length(uid) <= 1000))),
	CONSTRAINT "event_announcement_entries_occurrence_check" CHECK (((char_length(occurrence) >= 1) AND (char_length(occurrence) <= 40))),
	CONSTRAINT "event_announcement_entries_title_check" CHECK (((title = btrim(title)) AND ((char_length(title) >= 1) AND (char_length(title) <= 200)))),
	CONSTRAINT "event_announcement_entries_location_check" CHECK (((location = btrim(location)) AND ((char_length(location) >= 1) AND (char_length(location) <= 500)))),
	CONSTRAINT "event_announcement_entries_description_check" CHECK (((char_length(description) >= 1) AND (char_length(description) <= 2000))),
	CONSTRAINT "event_announcement_entries_position_check" CHECK (("position" >= 0)),
	CONSTRAINT "event_announcement_entries_qr_text_check" CHECK (((qr_text = btrim(qr_text)) AND ((char_length(qr_text) >= 1) AND (char_length(qr_text) <= 500)))),
	CONSTRAINT "event_announcement_entries_qr_caption_check" CHECK (((qr_caption = btrim(qr_caption)) AND ((char_length(qr_caption) >= 1) AND (char_length(qr_caption) <= 200))))
);
--> statement-breakpoint
ALTER TABLE "event_announcement_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "event_announcements" (
	"tenant_id" uuid DEFAULT app.current_tenant_id() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"calendar_ids" uuid[],
	"show_time" boolean DEFAULT true NOT NULL,
	"show_location" boolean DEFAULT false NOT NULL,
	"show_description" boolean DEFAULT false NOT NULL,
	"title_next_week" text,
	"title_this_month" text,
	"title_next_month" text,
	"snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"calendar_status" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"refreshed_at" timestamp with time zone,
	"refresh_started_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"used_at" timestamp with time zone,
	CONSTRAINT "event_announcements_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "event_announcements_calendar_ids_check" CHECK ((cardinality(calendar_ids) <= 50)),
	CONSTRAINT "event_announcements_snapshot_check" CHECK ((jsonb_typeof(snapshot) = 'array'::text)),
	CONSTRAINT "event_announcements_calendar_status_check" CHECK ((jsonb_typeof(calendar_status) = 'object'::text)),
	CONSTRAINT "event_announcements_title_next_week_check" CHECK (((title_next_week = btrim(title_next_week)) AND ((char_length(title_next_week) >= 1) AND (char_length(title_next_week) <= 100)))),
	CONSTRAINT "event_announcements_title_this_month_check" CHECK (((title_this_month = btrim(title_this_month)) AND ((char_length(title_this_month) >= 1) AND (char_length(title_this_month) <= 100)))),
	CONSTRAINT "event_announcements_title_next_month_check" CHECK (((title_next_month = btrim(title_next_month)) AND ((char_length(title_next_month) >= 1) AND (char_length(title_next_month) <= 100))))
);
--> statement-breakpoint
ALTER TABLE "event_announcements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "event_image_sets" (
	"tenant_id" uuid DEFAULT app.current_tenant_id() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"used_at" timestamp with time zone,
	CONSTRAINT "event_image_sets_tenant_id_id_key" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "event_image_sets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "event_images" (
	"tenant_id" uuid DEFAULT app.current_tenant_id() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"set_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"name" text COLLATE "hu-HU-x-icu" NOT NULL,
	"path" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"size_bytes" integer NOT NULL,
	"fit" text DEFAULT 'contain' NOT NULL,
	"scale" smallint DEFAULT 100 NOT NULL,
	"offset_x" smallint DEFAULT 0 NOT NULL,
	"offset_y" smallint DEFAULT 0 NOT NULL,
	"rotation" smallint DEFAULT 0 NOT NULL,
	"background" text DEFAULT 'color' NOT NULL,
	"background_color" text DEFAULT '#000000' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_images_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "event_images_path_key" UNIQUE("tenant_id","path"),
	CONSTRAINT "event_images_set_id_position_key" UNIQUE("tenant_id","set_id","position"),
	CONSTRAINT "event_images_position_check" CHECK (("position" >= 1)),
	CONSTRAINT "event_images_name_check" CHECK (((name = btrim(name)) AND ((char_length(name) >= 1) AND (char_length(name) <= 100)))),
	CONSTRAINT "event_images_path_check" CHECK ((path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'::text)),
	CONSTRAINT "event_images_width_check" CHECK (((width >= 1) AND (width <= 10000))),
	CONSTRAINT "event_images_height_check" CHECK (((height >= 1) AND (height <= 10000))),
	CONSTRAINT "event_images_size_bytes_check" CHECK (((size_bytes >= 1) AND (size_bytes <= 5242880))),
	CONSTRAINT "event_images_fit_check" CHECK ((fit = ANY (ARRAY['contain'::text, 'cover'::text]))),
	CONSTRAINT "event_images_scale_check" CHECK (((scale >= 10) AND (scale <= 400))),
	CONSTRAINT "event_images_offset_x_check" CHECK (((offset_x >= '-50'::integer) AND (offset_x <= 50))),
	CONSTRAINT "event_images_offset_y_check" CHECK (((offset_y >= '-50'::integer) AND (offset_y <= 50))),
	CONSTRAINT "event_images_rotation_check" CHECK ((rotation = ANY (ARRAY[0, 90, 180, 270]))),
	CONSTRAINT "event_images_background_check" CHECK ((background = ANY (ARRAY['color'::text, 'theme'::text, 'blur'::text]))),
	CONSTRAINT "event_images_background_color_check" CHECK ((background_color ~ '^#[0-9a-f]{6}$'::text))
);
--> statement-breakpoint
ALTER TABLE "event_images" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "event_announcement_entries" ADD CONSTRAINT "event_announcement_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_announcement_entries" ADD CONSTRAINT "event_announcement_entries_announcement_id_fkey" FOREIGN KEY ("tenant_id","announcement_id") REFERENCES "public"."event_announcements"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_announcement_entries" ADD CONSTRAINT "event_announcement_entries_calendar_id_fkey" FOREIGN KEY ("tenant_id","calendar_id") REFERENCES "public"."announcement_calendars"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_announcements" ADD CONSTRAINT "event_announcements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_announcements" ADD CONSTRAINT "event_announcements_event_id_fkey" FOREIGN KEY ("tenant_id","event_id") REFERENCES "public"."events"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_image_sets" ADD CONSTRAINT "event_image_sets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_image_sets" ADD CONSTRAINT "event_image_sets_event_id_fkey" FOREIGN KEY ("tenant_id","event_id") REFERENCES "public"."events"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_images" ADD CONSTRAINT "event_images_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_images" ADD CONSTRAINT "event_images_event_id_fkey" FOREIGN KEY ("tenant_id","event_id") REFERENCES "public"."events"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_images" ADD CONSTRAINT "event_images_set_id_fkey" FOREIGN KEY ("tenant_id","set_id") REFERENCES "public"."event_image_sets"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_announcement_entries_tenant_id_idx" ON "event_announcement_entries" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "event_announcement_entries_announcement_idx" ON "event_announcement_entries" USING btree ("announcement_id");--> statement-breakpoint
CREATE INDEX "event_announcements_tenant_id_idx" ON "event_announcements" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "event_announcements_event_id_idx" ON "event_announcements" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "event_image_sets_tenant_id_idx" ON "event_image_sets" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "event_image_sets_event_id_idx" ON "event_image_sets" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "event_images_tenant_id_idx" ON "event_images" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "event_images_event_id_idx" ON "event_images" USING btree ("event_id");
--> statement-breakpoint
-- Constraints that Drizzle cannot express: deferrable uniques and the SET NULL attachment.
ALTER TABLE "event_images" DROP CONSTRAINT "event_images_set_id_position_key";
--> statement-breakpoint
ALTER TABLE "event_images" ADD CONSTRAINT "event_images_set_id_position_key" UNIQUE (tenant_id, "set_id", "position") DEFERRABLE INITIALLY IMMEDIATE;
--> statement-breakpoint
ALTER TABLE "event_announcement_entries" DROP CONSTRAINT "event_announcement_entries_attachment_set_id_key";
--> statement-breakpoint
ALTER TABLE "event_announcement_entries" ADD CONSTRAINT "event_announcement_entries_attachment_set_id_key" UNIQUE (tenant_id, "attachment_set_id") DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE "event_announcement_entries" ADD CONSTRAINT "event_announcement_entries_attachment_set_id_fkey" FOREIGN KEY (tenant_id, "attachment_set_id") REFERENCES "event_image_sets" (tenant_id, "id") ON DELETE SET NULL ("attachment_set_id") DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE "event_image_sets" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "event_image_sets" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "event_image_sets" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
ALTER TABLE "event_images" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "event_images" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "event_images" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
ALTER TABLE "event_announcements" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "event_announcements" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "event_announcements" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
ALTER TABLE "event_announcement_entries" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "event_announcement_entries" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "event_announcement_entries" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.church_day(p_at timestamptz)
returns date
language sql
stable
security invoker
set search_path = ''
as $$
  -- The church's time zone: Churchy is Hungarian, Europe/Budapest (the music app's `app_config`).
  select (p_at at time zone 'Europe/Budapest')::date;
$$;
--> statement-breakpoint
create or replace function public.add_event_image(
  p_set_id uuid,
  p_name text,
  p_path text,
  p_width integer,
  p_height integer,
  p_size_bytes integer,
  p_max integer,
  p_unused_before timestamptz default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_last integer;
  v_id uuid;
begin
  select event_id into v_event_id from public.event_image_sets where id = p_set_id;
  if not found then
    return null;
  end if;
  -- Additions to the same event wait for each other here, so the count and
  -- the positions stay true. `for no key update`: the new rows that refer to
  -- the event, e.g. a new volunteer, do not wait for this lock.
  perform 1 from public.events where id = v_event_id for no key update;

  if p_path not like v_event_id::text || '/%' then
    raise exception 'file of another event' using errcode = 'P0001', hint = 'event_image_path';
  end if;

  if public.count_event_images_for_limit(p_set_id, p_unused_before) >= p_max then
    raise exception 'too many images' using errcode = 'P0001', hint = 'too_many_event_images';
  end if;

  select coalesce(max(position), 0) into v_last from public.event_images where set_id = p_set_id;
  insert into public.event_images (event_id, set_id, position, name, path, width, height, size_bytes)
  values (v_event_id, p_set_id, v_last + 1, p_name, p_path, p_width, p_height, p_size_bytes)
  returning id into v_id;
  return v_id;
end;
$$;
--> statement-breakpoint
create or replace function public.copy_event_image_set(p_set_id uuid, p_event_id uuid, p_files jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from public.event_images i where i.set_id = p_set_id and p_files ? i.path) then
    return null;
  end if;

  if exists (
    select 1 from public.event_images i
    where i.set_id = p_set_id and p_files ? i.path and (p_files ->> i.path) not like p_event_id::text || '/%'
  ) then
    raise exception 'file of another event' using errcode = 'P0001', hint = 'event_image_path';
  end if;

  -- In use from the start: the copy is for an item or an entry.
  insert into public.event_image_sets (event_id, used_at)
  values (p_event_id, now())
  returning id into v_id;

  insert into public.event_images (
    event_id, set_id, position, name, path, width, height, size_bytes,
    fit, scale, offset_x, offset_y, rotation, background, background_color
  )
  select
    p_event_id, v_id, (row_number() over (order by i.position))::integer, i.name, p_files ->> i.path,
    i.width, i.height, i.size_bytes, i.fit, i.scale, i.offset_x, i.offset_y, i.rotation, i.background,
    i.background_color
  from public.event_images i
  where i.set_id = p_set_id and p_files ? i.path;

  return v_id;
end;
$$;
--> statement-breakpoint
create or replace function public.count_event_images_for_limit(p_set_id uuid, p_unused_before timestamptz)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select count(i.id)::integer
  from public.event_image_sets target
  join public.event_image_sets s on s.event_id = target.event_id
  join public.event_images i on i.set_id = s.id
  where target.id = p_set_id
    and (
      s.id = p_set_id
      or p_unused_before is null
      or exists (select 1 from public.setlist_items si where si.image_set_id = s.id)
      or (s.used_at is null and s.created_at >= p_unused_before)
      or exists (
        select 1
        from public.event_announcement_entries en
        join public.event_announcements a on a.id = en.announcement_id
        where en.attachment_set_id = s.id
          and (
            exists (select 1 from public.setlist_items si where si.announcement_id = a.id)
            or (a.used_at is null and a.created_at >= p_unused_before)
          )
      )
    );
$$;
--> statement-breakpoint
create or replace function public.delete_unused_event_image_sets(p_before timestamptz)
returns setof text
language sql
security invoker
set search_path = ''
as $$
  with unused as (
    select s.id
    from public.event_image_sets s
    where s.created_at < p_before
      and not exists (select 1 from public.setlist_items si where si.image_set_id = s.id)
      and not exists (select 1 from public.event_announcement_entries en where en.attachment_set_id = s.id)
    for update skip locked
  ),
  -- The snapshot of the statement: the images from before the delete.
  paths as (
    select i.path from public.event_images i join unused u on u.id = i.set_id
  ),
  deleted as (
    delete from public.event_image_sets s using unused u where s.id = u.id
  )
  select path from paths;
$$;
--> statement-breakpoint
create or replace function public.mark_event_image_set_used()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.event_image_sets set used_at = now() where id = new.image_set_id and used_at is null;
  return new;
end;
$$;
--> statement-breakpoint
create or replace function public.move_event_set_images(p_set_id uuid, p_image_ids uuid[])
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform 1 from public.event_image_sets where id = p_set_id for no key update;
  if not found then
    return false;
  end if;

  if cardinality(coalesce(p_image_ids, '{}')) <> (select count(distinct i) from unnest(p_image_ids) as u (i))
    or (select count(*) from public.event_images where set_id = p_set_id) <> cardinality(coalesce(p_image_ids, '{}'))
    or exists (
      select 1 from unnest(p_image_ids) as u (i)
      where not exists (select 1 from public.event_images ei where ei.id = u.i and ei.set_id = p_set_id)
    )
  then
    raise exception 'not the images of the set' using errcode = 'P0001', hint = 'event_images';
  end if;

  -- One statement: the unique positions are checked at its end.
  update public.event_images ei
  set position = u.position
  from unnest(p_image_ids) with ordinality as u (id, position)
  where ei.id = u.id and ei.position <> u.position;
  return true;
end;
$$;
--> statement-breakpoint
create or replace function public.claim_announcement_refresh(p_id uuid, p_force boolean)
returns table (calendar_ids uuid[], snapshot jsonb, calendar_status jsonb, starts_at timestamptz)
language sql
security invoker
set search_path = ''
as $$
  update public.event_announcements a
  set refresh_started_at = now()
  from public.events e
  where a.id = p_id
    and e.id = a.event_id
    and e.ends_at > now()
    and (a.refresh_started_at is null or a.refresh_started_at < now() - interval '1 minute')
    and (p_force or a.refreshed_at is null or a.refreshed_at < now() - interval '1 hour')
  returning a.calendar_ids, a.snapshot, a.calendar_status, e.starts_at;
$$;
--> statement-breakpoint
create or replace function public.copy_announcement_entries(p_source_id uuid, p_target_id uuid, p_files jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_day date;
  v_snapshot jsonb;
  v_set uuid;
  r record;
begin
  select a.event_id, public.church_day(e.starts_at) into v_event_id, v_day
  from public.event_announcements a
  join public.events e on e.id = a.event_id
  where a.id = p_target_id;

  select a.snapshot into v_snapshot from public.event_announcements a where a.id = p_source_id;

  delete from public.event_announcement_entries where announcement_id = p_target_id;

  for r in
    select en.*
    from public.event_announcement_entries en
    where en.announcement_id = p_source_id
      and case
        when en.calendar_id is null then
          -- Manual: without a date, or not ended before the day.
          coalesce(en.end_date, en.start_date, public.church_day(coalesce(en.ends_at, en.starts_at)), v_day) >= v_day
        else
          exists (
            select 1
            from jsonb_array_elements(v_snapshot) as s (value)
            where s.value ->> 'calendarId' = en.calendar_id::text
              and s.value ->> 'uid' = en.uid
              and s.value ->> 'occurrence' = en.occurrence
              and case
                when s.value -> 'allDay' = 'true'::jsonb
                  then coalesce(s.value ->> 'end', s.value ->> 'start')::date
                else public.church_day(coalesce(s.value ->> 'end', s.value ->> 'start')::timestamptz)
              end >= v_day
          )
      end
    order by en.created_at
  loop
    v_set := case
      when r.attachment_set_id is null then null
      else public.copy_event_image_set(r.attachment_set_id, v_event_id, p_files)
    end;

    insert into public.event_announcement_entries (
      announcement_id, calendar_id, uid, occurrence, title, starts_at, ends_at, start_date, end_date,
      location, description, position, highlighted, excluded, show_time, show_location, show_description,
      attachment_set_id, qr_text, qr_caption, text_first
    )
    values (
      p_target_id, r.calendar_id, r.uid, r.occurrence, r.title, r.starts_at, r.ends_at, r.start_date, r.end_date,
      r.location, r.description, r.position, r.highlighted, r.excluded, r.show_time, r.show_location,
      r.show_description, v_set, r.qr_text, r.qr_caption, r.text_first
    );
  end loop;
end;
$$;
--> statement-breakpoint
create or replace function public.copy_event_announcement(p_source_id uuid, p_target_id uuid, p_files jsonb)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_source public.event_announcements;
begin
  select * into v_source from public.event_announcements where id = p_source_id;
  if not found or p_source_id = p_target_id then
    return false;
  end if;

  -- Changes of the same announcement wait for each other here.
  update public.event_announcements t
  set calendar_ids = v_source.calendar_ids,
    show_time = v_source.show_time,
    show_location = v_source.show_location,
    show_description = v_source.show_description,
    title_next_week = v_source.title_next_week,
    title_this_month = v_source.title_this_month,
    title_next_month = v_source.title_next_month,
    refreshed_at = null
  where t.id = p_target_id;
  if not found then
    return false;
  end if;

  perform public.copy_announcement_entries(p_source_id, p_target_id, p_files);
  return true;
end;
$$;
--> statement-breakpoint
create or replace function public.delete_unused_event_announcements(p_before timestamptz)
returns integer
language sql
security invoker
set search_path = ''
as $$
  with unused as (
    select a.id
    from public.event_announcements a
    where a.created_at < p_before
      and not exists (select 1 from public.setlist_items si where si.announcement_id = a.id)
    for update skip locked
  ),
  deleted as (
    delete from public.event_announcements a using unused u where a.id = u.id
    returning a.id
  )
  select count(*)::integer from deleted;
$$;
--> statement-breakpoint
create or replace function public.mark_event_announcement_used()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.event_announcements set used_at = now() where id = new.announcement_id and used_at is null;
  return new;
end;
$$;
--> statement-breakpoint
create or replace function public.remove_calendar_entries_from_snapshots()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.event_announcements a
  set snapshot = coalesce(
    (
      select jsonb_agg(s.value order by s.ordinality)
      from jsonb_array_elements(a.snapshot) with ordinality as s (value, ordinality)
      where s.value ->> 'calendarId' is distinct from old.id::text
    ),
    '[]'::jsonb
  )
  where exists (
    select 1 from jsonb_array_elements(a.snapshot) as s (value) where s.value ->> 'calendarId' = old.id::text
  );
  return old;
end;
$$;
--> statement-breakpoint
create or replace function public.set_announcement_entry_attachment(p_entry_id uuid, p_set_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_event_id uuid;
begin
  select a.event_id into v_event_id
  from public.event_announcement_entries en
  join public.event_announcements a on a.id = en.announcement_id
  where en.id = p_entry_id
  for no key update of en;
  if not found then
    return false;
  end if;

  if p_set_id is not null then
    -- The set stays until the commit: `delete_unused_event_image_sets()` skips it.
    perform 1 from public.event_image_sets where id = p_set_id for key share;

    if not exists (select 1 from public.event_image_sets s where s.id = p_set_id and s.event_id = v_event_id)
      or exists (select 1 from public.setlist_items si where si.image_set_id = p_set_id)
      or exists (
        select 1 from public.event_announcement_entries en
        where en.attachment_set_id = p_set_id and en.id <> p_entry_id
      )
    then
      raise exception 'images of another event' using errcode = 'P0001', hint = 'event_image_set';
    end if;

    update public.event_image_sets set used_at = now() where id = p_set_id and used_at is null;
  end if;

  update public.event_announcement_entries set attachment_set_id = p_set_id where id = p_entry_id;
  return true;
end;
$$;
--> statement-breakpoint
create or replace function public.swap_announcement_calendars(p_id uuid, p_other_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  -- Locks both rows in one order, so two swaps cannot wait for each other.
  perform 1
  from public.announcement_calendars
  where id in (p_id, p_other_id)
  order by id
  for update;

  update public.announcement_calendars c
  set position = o.position
  from public.announcement_calendars o
  where (c.id = p_id and o.id = p_other_id)
     or (c.id = p_other_id and o.id = p_id);
  get diagnostics v_count = row_count;
  return v_count = 2;
end;
$$;
--> statement-breakpoint
create or replace function public.set_event_items(p_event_id uuid, p_items jsonb, p_base_setlist_id uuid, p_check_base boolean)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_items jsonb;
  v_old_id uuid;
  v_old_items jsonb;
  v_keys uuid[];
  v_old_keys uuid[];
  v_new_id uuid;
  v_setlist_id uuid;
begin
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'items must be an array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 100 then
    raise exception 'too many items' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_items) as e (value)
    where e.value ? 'key' and (e.value ->> 'key') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) then
    raise exception 'an item key is not a uuid' using errcode = '22023';
  end if;
  if (
    select count(e.value ->> 'key') <> count(distinct (e.value ->> 'key')::uuid)
    from jsonb_array_elements(p_items) as e (value)
  ) then
    raise exception 'two items have the same key' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_items) as e (value)
    where e.value ->> 'block_key' is not null
      and (e.value ->> 'block_key') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) then
    raise exception 'a block key is not a uuid' using errcode = '22023';
  end if;

  -- The same form as `setlists.items`, so equal lists compare equal. Null
  -- for an empty list. The keys, the volunteers, the themes and the durations
  -- are not part of it. A song without a key, a text item that is not a scripture reading
  -- or a text slide, and a scripture reading without a translation have the
  -- same form as before.
  select jsonb_agg(
    case
      when e.value ? 'arrangement_id' then jsonb_strip_nulls(jsonb_build_object(
        'arrangement_id', (e.value ->> 'arrangement_id')::uuid,
        'musical_key', e.value ->> 'musical_key'
      ))
      else jsonb_strip_nulls(jsonb_build_object(
        'title', e.value ->> 'title',
        'notes', e.value ->> 'notes',
        'scripture', case
          when e.value -> 'scripture' = 'true'::jsonb and not e.value ? 'image_set_id' and not e.value ? 'announcement_id'
          then true
        end,
        'translation', case
          when e.value -> 'scripture' = 'true'::jsonb and not e.value ? 'image_set_id' and not e.value ? 'announcement_id'
          then e.value ->> 'translation'
        end,
        'image_set_id', (e.value ->> 'image_set_id')::uuid,
        'announcement_id', (e.value ->> 'announcement_id')::uuid,
        'text_slide', case
          when e.value -> 'text_slide' = 'true'::jsonb and e.value -> 'scripture' is distinct from 'true'::jsonb
            and not e.value ? 'image_set_id' and not e.value ? 'announcement_id'
          then true
        end,
        'description', case
          when e.value -> 'text_slide' = 'true'::jsonb and e.value -> 'scripture' is distinct from 'true'::jsonb
            and not e.value ? 'image_set_id' and not e.value ? 'announcement_id'
          then e.value ->> 'description'
        end,
        'highlight', case
          when e.value -> 'text_slide' = 'true'::jsonb and e.value -> 'scripture' is distinct from 'true'::jsonb
            and not e.value ? 'image_set_id' and not e.value ? 'announcement_id'
          then e.value ->> 'highlight'
        end
      ))
    end
    order by e.ordinality
  )
  into v_items
  from jsonb_array_elements(p_items) with ordinality as e (value, ordinality);

  -- Changes of the same event wait for each other here.
  select e.setlist_id, s.items into v_old_id, v_old_items
  from public.events e
  left join public.setlists s on s.id = e.setlist_id
  where e.id = p_event_id
  for update of e;
  if not found then
    return null;
  end if;

  if p_check_base and v_old_id is distinct from p_base_setlist_id then
    return jsonb_build_object('status', 'changed', 'setlist_id', v_old_id);
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as e (value)
    where e.value ->> 'volunteer_id' is not null
      and not exists (
        select 1
        from public.event_volunteers v
        where v.event_id = p_event_id and v.user_id = (e.value ->> 'volunteer_id')::uuid
      )
  ) then
    raise exception 'user is not a volunteer of the event' using errcode = 'P0001', hint = 'not_event_volunteer';
  end if;

  -- The sets stay until the commit: `delete_unused_event_image_sets()` skips
  -- them. A set that it deleted first is missing below.
  perform 1
  from public.event_image_sets s
  where s.id in (
    select (e.value ->> 'image_set_id')::uuid from jsonb_array_elements(v_items) as e (value)
  )
  for key share;

  -- The images of an item must be of this event, each set in one item only,
  -- and not the set of an announcement entry.
  if exists (
    select 1
    from jsonb_array_elements(v_items) as e (value)
    where e.value ? 'image_set_id'
      and (
        not exists (
          select 1 from public.event_image_sets s
          where s.id = (e.value ->> 'image_set_id')::uuid and s.event_id = p_event_id
        )
        or exists (
          select 1 from public.event_announcement_entries en
          where en.attachment_set_id = (e.value ->> 'image_set_id')::uuid
        )
      )
  ) or (
    select count(e.value ->> 'image_set_id') <> count(distinct e.value ->> 'image_set_id')
    from jsonb_array_elements(v_items) as e (value)
  ) then
    raise exception 'images of another event' using errcode = 'P0001', hint = 'event_image_set';
  end if;

  -- The same for the announcements: they stay until the commit, as the sets.
  perform 1
  from public.event_announcements a
  where a.id in (
    select (e.value ->> 'announcement_id')::uuid from jsonb_array_elements(v_items) as e (value)
  )
  for key share;

  if exists (
    select 1
    from jsonb_array_elements(v_items) as e (value)
    where e.value ? 'announcement_id'
      and not exists (
        select 1 from public.event_announcements a
        where a.id = (e.value ->> 'announcement_id')::uuid and a.event_id = p_event_id
      )
  ) or (
    select count(e.value ->> 'announcement_id') <> count(distinct e.value ->> 'announcement_id')
    from jsonb_array_elements(v_items) as e (value)
  ) then
    raise exception 'announcements of another event' using errcode = 'P0001', hint = 'event_announcement';
  end if;

  -- The key of each item, in order: its own key, else the key of an old item
  -- that no other item has, of the same arrangement (a song) or the same text
  -- (a text item), else a new key. The first such new item gets the first
  -- such old item, and so on.
  with input as (
    select
      (e.ordinality - 1)::integer as position,
      (e.value ->> 'key')::uuid as key,
      case
        when n.value ? 'arrangement_id' then jsonb_build_object('arrangement_id', n.value -> 'arrangement_id')
        else n.value
      end as identity
    from jsonb_array_elements(p_items) with ordinality as e (value, ordinality)
    join jsonb_array_elements(v_items) with ordinality as n (value, ordinality) on n.ordinality = e.ordinality
  ),
  old_item as (
    select
      si.key,
      si.position,
      case
        when si.arrangement_id is not null then jsonb_build_object('arrangement_id', si.arrangement_id)
        else jsonb_strip_nulls(jsonb_build_object(
          'title', si.title,
          'notes', si.notes,
          'scripture', nullif(si.scripture, false),
          'translation', si.scripture_translation,
          'image_set_id', si.image_set_id,
          'announcement_id', si.announcement_id,
          'text_slide', nullif(si.text_slide, false),
          'description', si.description,
          'highlight', si.highlight
        ))
      end as identity
    from public.setlist_items si
    where si.setlist_id = v_old_id
      and not exists (select 1 from input i where i.key = si.key)
  ),
  matched as (
    select new_item.position, old_nth.key
    from (
      select i.position, i.identity, row_number() over (partition by i.identity order by i.position) as nth
      from input i
      where i.key is null
    ) new_item
    join (
      select o.key, o.identity, row_number() over (partition by o.identity order by o.position) as nth
      from old_item o
    ) old_nth on old_nth.identity = new_item.identity and old_nth.nth = new_item.nth
  )
  select array_agg(coalesce(i.key, m.key, gen_random_uuid()) order by i.position)
  into v_keys
  from input i
  left join matched m on m.position = i.position;

  select array_agg(si.key order by si.position) into v_old_keys
  from public.setlist_items si
  where si.setlist_id = v_old_id;

  if v_items is not distinct from v_old_items and v_keys is not distinct from v_old_keys then
    v_setlist_id := v_old_id;
  else
    if v_items is not null then
      insert into public.setlists (items)
      values (v_items)
      returning id into v_new_id;

      insert into public.setlist_items (
        setlist_id, position, key, arrangement_id, musical_key, title, notes, scripture, scripture_translation,
        image_set_id, announcement_id, text_slide, description, highlight
      )
      select
        v_new_id,
        (e.ordinality - 1)::integer,
        v_keys[e.ordinality],
        (e.value ->> 'arrangement_id')::uuid,
        e.value ->> 'musical_key',
        e.value ->> 'title',
        e.value ->> 'notes',
        coalesce((e.value ->> 'scripture')::boolean, false),
        e.value ->> 'translation',
        (e.value ->> 'image_set_id')::uuid,
        (e.value ->> 'announcement_id')::uuid,
        coalesce((e.value ->> 'text_slide')::boolean, false),
        e.value ->> 'description',
        e.value ->> 'highlight'
      from jsonb_array_elements(v_items) with ordinality as e (value, ordinality);

      -- The new setlist starts with the slot annotations, volunteers and
      -- themes of the previous one, by key. This must run before the update
      -- below: its trigger deletes the previous setlist, and the cascade
      -- deletes this data.
      if v_old_id is not null then
        insert into public.annotations (user_id, song_id, setlist_item_id, section_label, body, created_at)
        select a.user_id, a.song_id, new_item.id, a.section_label, a.body, a.created_at
        from public.annotations a
        join public.setlist_items old_item on old_item.id = a.setlist_item_id
        join public.setlist_items new_item on new_item.key = old_item.key
        where old_item.setlist_id = v_old_id and new_item.setlist_id = v_new_id;

        -- Only for the items without `volunteer_id`. The others get theirs below.
        insert into public.setlist_item_volunteers (setlist_item_id, event_id, user_id, created_at)
        select new_item.id, v.event_id, v.user_id, v.created_at
        from public.setlist_item_volunteers v
        join public.setlist_items old_item on old_item.id = v.setlist_item_id
        join public.setlist_items new_item on new_item.key = old_item.key
        join jsonb_array_elements(p_items) with ordinality as e (value, ordinality)
          on new_item.position = e.ordinality - 1
        where old_item.setlist_id = v_old_id and new_item.setlist_id = v_new_id and not e.value ? 'volunteer_id';

        -- Only for the items without `theme_id`, as the volunteers.
        insert into public.setlist_item_themes (setlist_item_id, theme_id, created_at)
        select new_item.id, t.theme_id, t.created_at
        from public.setlist_item_themes t
        join public.setlist_items old_item on old_item.id = t.setlist_item_id
        join public.setlist_items new_item on new_item.key = old_item.key
        join jsonb_array_elements(p_items) with ordinality as e (value, ordinality)
          on new_item.position = e.ordinality - 1
        where old_item.setlist_id = v_old_id and new_item.setlist_id = v_new_id and not e.value ? 'theme_id';

        -- Only for the items without `duration_seconds`, as the themes.
        insert into public.setlist_item_durations (setlist_item_id, seconds, created_at)
        select new_item.id, d.seconds, d.created_at
        from public.setlist_item_durations d
        join public.setlist_items old_item on old_item.id = d.setlist_item_id
        join public.setlist_items new_item on new_item.key = old_item.key
        join jsonb_array_elements(p_items) with ordinality as e (value, ordinality)
          on new_item.position = e.ordinality - 1
        where old_item.setlist_id = v_old_id and new_item.setlist_id = v_new_id and not e.value ? 'duration_seconds';

        -- Only for the items without `block_key`, as the durations.
        insert into public.setlist_item_blocks (setlist_item_id, event_id, block_key, created_at)
        select new_item.id, b.event_id, b.block_key, b.created_at
        from public.setlist_item_blocks b
        join public.setlist_items old_item on old_item.id = b.setlist_item_id
        join public.setlist_items new_item on new_item.key = old_item.key
        join jsonb_array_elements(p_items) with ordinality as e (value, ordinality)
          on new_item.position = e.ordinality - 1
        where old_item.setlist_id = v_old_id and new_item.setlist_id = v_new_id
          and b.event_id = p_event_id and not e.value ? 'block_key';
      end if;
    end if;

    update public.events set setlist_id = v_new_id where id = p_event_id;
    v_setlist_id := v_new_id;
  end if;

  -- The items with `volunteer_id` get that volunteer, or none for null.
  delete from public.setlist_item_volunteers v
  using public.setlist_items si, jsonb_array_elements(p_items) with ordinality as e (value, ordinality)
  where si.id = v.setlist_item_id
    and si.setlist_id = v_setlist_id
    and si.position = e.ordinality - 1
    and e.value ? 'volunteer_id';

  insert into public.setlist_item_volunteers (setlist_item_id, event_id, user_id)
  select si.id, p_event_id, (e.value ->> 'volunteer_id')::uuid
  from jsonb_array_elements(p_items) with ordinality as e (value, ordinality)
  join public.setlist_items si on si.setlist_id = v_setlist_id and si.position = e.ordinality - 1
  where e.value ->> 'volunteer_id' is not null;

  -- The items with `theme_id` get that theme, or none for null.
  delete from public.setlist_item_themes t
  using public.setlist_items si, jsonb_array_elements(p_items) with ordinality as e (value, ordinality)
  where si.id = t.setlist_item_id
    and si.setlist_id = v_setlist_id
    and si.position = e.ordinality - 1
    and e.value ? 'theme_id';

  insert into public.setlist_item_themes (setlist_item_id, theme_id)
  select si.id, (e.value ->> 'theme_id')::uuid
  from jsonb_array_elements(p_items) with ordinality as e (value, ordinality)
  join public.setlist_items si on si.setlist_id = v_setlist_id and si.position = e.ordinality - 1
  where e.value ->> 'theme_id' is not null;

  -- The items with `duration_seconds` get that time, or none for null.
  delete from public.setlist_item_durations d
  using public.setlist_items si, jsonb_array_elements(p_items) with ordinality as e (value, ordinality)
  where si.id = d.setlist_item_id
    and si.setlist_id = v_setlist_id
    and si.position = e.ordinality - 1
    and e.value ? 'duration_seconds';

  insert into public.setlist_item_durations (setlist_item_id, seconds)
  select si.id, (e.value ->> 'duration_seconds')::integer
  from jsonb_array_elements(p_items) with ordinality as e (value, ordinality)
  join public.setlist_items si on si.setlist_id = v_setlist_id and si.position = e.ordinality - 1
  where e.value ->> 'duration_seconds' is not null;

  -- The items with `block_key` get that block, or none for null. A block
  -- that the event does not have anymore (e.g. another user ungrouped it):
  -- none.
  delete from public.setlist_item_blocks b
  using public.setlist_items si, jsonb_array_elements(p_items) with ordinality as e (value, ordinality)
  where si.id = b.setlist_item_id
    and si.setlist_id = v_setlist_id
    and si.position = e.ordinality - 1
    and e.value ? 'block_key';

  insert into public.setlist_item_blocks (setlist_item_id, event_id, block_key)
  select si.id, p_event_id, eb.key
  from jsonb_array_elements(p_items) with ordinality as e (value, ordinality)
  join public.setlist_items si on si.setlist_id = v_setlist_id and si.position = e.ordinality - 1
  join public.event_blocks eb on eb.event_id = p_event_id and eb.key = (e.value ->> 'block_key')::uuid
  where e.value ->> 'block_key' is not null;

  perform public.normalize_event_blocks(p_event_id);

  return jsonb_build_object('status', 'saved', 'setlist_id', v_setlist_id);
end;
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
CREATE TRIGGER event_images_set_updated_at BEFORE UPDATE ON public.event_images
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER event_images_keep_stray_file AFTER DELETE ON public.event_images
FOR EACH ROW EXECUTE FUNCTION public.keep_stray_file('event-images', 'path');
--> statement-breakpoint
CREATE TRIGGER event_images_claim_stray_file AFTER INSERT ON public.event_images
FOR EACH ROW EXECUTE FUNCTION public.claim_stray_file('event-images', 'path');
--> statement-breakpoint
CREATE TRIGGER setlist_items_mark_event_image_set_used AFTER INSERT ON public.setlist_items
FOR EACH ROW WHEN (new.image_set_id IS NOT NULL) EXECUTE FUNCTION public.mark_event_image_set_used();
--> statement-breakpoint
CREATE TRIGGER setlist_items_mark_event_announcement_used AFTER INSERT ON public.setlist_items
FOR EACH ROW WHEN (new.announcement_id IS NOT NULL) EXECUTE FUNCTION public.mark_event_announcement_used();
--> statement-breakpoint
CREATE TRIGGER event_announcement_entries_set_updated_at BEFORE UPDATE ON public.event_announcement_entries
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER announcement_calendars_set_updated_at BEFORE UPDATE ON public.announcement_calendars
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER announcement_settings_set_updated_at BEFORE UPDATE ON public.announcement_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER announcement_calendars_remove_entries AFTER DELETE ON public.announcement_calendars
FOR EACH ROW EXECUTE FUNCTION public.remove_calendar_entries_from_snapshots();
--> statement-breakpoint
DO $$
DECLARE f text;
BEGIN
  FOR f IN SELECT p.oid::regprocedure::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('add_event_image','copy_event_image_set','count_event_images_for_limit',
      'delete_unused_event_image_sets','mark_event_image_set_used','move_event_set_images','claim_announcement_refresh',
      'copy_announcement_entries','copy_event_announcement','delete_unused_event_announcements',
      'mark_event_announcement_used','remove_calendar_entries_from_snapshots','set_announcement_entry_attachment',
      'swap_announcement_calendars','set_event_items','copy_event','church_day')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO churchy_app, churchy_music', f);
  END LOOP;
END
$$;
