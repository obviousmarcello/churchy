CREATE TABLE "event_blocks" (
	"tenant_id" uuid DEFAULT app.current_tenant_id() NOT NULL,
	"event_id" uuid NOT NULL,
	"key" uuid DEFAULT gen_random_uuid() NOT NULL,
	"name" text COLLATE "hu-HU-x-icu" NOT NULL,
	"countdown" text DEFAULT 'off' NOT NULL,
	"countdown_until" time,
	"started_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_blocks_pkey" PRIMARY KEY("tenant_id","event_id","key"),
	CONSTRAINT "event_blocks_name_check" CHECK (((name = btrim(name)) AND ((char_length(name) >= 1) AND (char_length(name) <= 80)))),
	CONSTRAINT "event_blocks_countdown_check" CHECK ((countdown = ANY (ARRAY['off'::text, 'remaining'::text, 'until'::text]))),
	CONSTRAINT "event_blocks_countdown_until_check" CHECK (((countdown = 'until'::text) = (countdown_until IS NOT NULL)))
);
--> statement-breakpoint
ALTER TABLE "event_blocks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "setlist_item_blocks" (
	"tenant_id" uuid DEFAULT app.current_tenant_id() NOT NULL,
	"setlist_item_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"block_key" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "setlist_item_blocks_pkey" PRIMARY KEY("tenant_id","setlist_item_id")
);
--> statement-breakpoint
ALTER TABLE "setlist_item_blocks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "event_blocks" ADD CONSTRAINT "event_blocks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_blocks" ADD CONSTRAINT "event_blocks_event_id_fkey" FOREIGN KEY ("tenant_id","event_id") REFERENCES "public"."events"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setlist_item_blocks" ADD CONSTRAINT "setlist_item_blocks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setlist_item_blocks" ADD CONSTRAINT "setlist_item_blocks_setlist_item_id_fkey" FOREIGN KEY ("tenant_id","setlist_item_id") REFERENCES "public"."setlist_items"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setlist_item_blocks" ADD CONSTRAINT "setlist_item_blocks_block_fkey" FOREIGN KEY ("tenant_id","event_id","block_key") REFERENCES "public"."event_blocks"("tenant_id","event_id","key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_blocks_tenant_id_idx" ON "event_blocks" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "setlist_item_blocks_tenant_id_idx" ON "setlist_item_blocks" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "setlist_item_blocks_event_id_block_key_idx" ON "setlist_item_blocks" USING btree ("event_id","block_key");
--> statement-breakpoint
-- Music merge phase 4a-2 (setlists on events): the event functions of Music Sheet DB, tenant-aware
-- (SECURITY INVOKER; RLS `tenant_isolation` + `music_scope` scope every statement to the tenant's
-- music events, inserts take `tenant_id` from app.current_tenant_id()). Parts that need tables of
-- later slices (event volunteers: 4b; image sets, announcements: projection phase) are left out of
-- `set_event_items()` and added there with `CREATE OR REPLACE`. docs/music-merge/FUNCTIONS.md.
--> statement-breakpoint
-- A block's own planned time (Music Sheet DB event_block_duration).
ALTER TABLE public.event_blocks ADD COLUMN duration_seconds integer
  CONSTRAINT event_blocks_duration_seconds_check CHECK (duration_seconds BETWEEN 1 AND 86400);
--> statement-breakpoint
-- A plan keeps its link when the setlist it points to is deleted (the event then has a newer one;
-- the app re-points the plan, see lib/music/plan-sync.ts). Composite SET NULL needs PG 15+.
ALTER TABLE "service_plans" DROP CONSTRAINT "service_plans_setlist_id_fkey";
--> statement-breakpoint
ALTER TABLE "service_plans" ADD CONSTRAINT "service_plans_setlist_id_fkey" FOREIGN KEY (tenant_id, "setlist_id") REFERENCES "setlists" (tenant_id, "id") ON DELETE SET NULL ("setlist_id");
--> statement-breakpoint
create function public.setlist_items_input(p_setlist_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_strip_nulls(jsonb_build_object(
        'key', si.key,
        'arrangement_id', si.arrangement_id,
        'musical_key', si.musical_key,
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
      order by si.position
    ),
    '[]'::jsonb
  )
  from public.setlist_items si
  where si.setlist_id = p_setlist_id;
$$;
--> statement-breakpoint
create function public.normalize_event_blocks(p_event_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_setlist_id uuid;
begin
  select e.setlist_id into v_setlist_id from public.events e where e.id = p_event_id;

  with member as (
    select
      b.setlist_item_id,
      b.block_key,
      si.position,
      -- The same number for the items of one run of the block.
      si.position - row_number() over (partition by b.block_key order by si.position) as run
    from public.setlist_item_blocks b
    join public.setlist_items si on si.id = b.setlist_item_id
    where b.event_id = p_event_id and si.setlist_id = v_setlist_id
  ),
  kept as (
    select distinct on (r.block_key) r.block_key, r.run
    from (
      select m.block_key, m.run, count(*) as size, min(m.position) as first
      from member m
      group by m.block_key, m.run
    ) r
    order by r.block_key, r.size desc, r.first
  )
  delete from public.setlist_item_blocks b
  using member m
  where b.setlist_item_id = m.setlist_item_id
    and not exists (select 1 from kept k where k.block_key = m.block_key and k.run = m.run);

  delete from public.event_blocks eb
  where eb.event_id = p_event_id
    and not exists (
      select 1
      from public.setlist_item_blocks b
      join public.setlist_items si on si.id = b.setlist_item_id
      where b.event_id = eb.event_id and b.block_key = eb.key and si.setlist_id = v_setlist_id
    );
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
      -- themes of the previous one (volunteers: slice 4b), by key. This must run before the update
      -- below: its trigger deletes the previous setlist, and the cascade
      -- deletes this data.
      if v_old_id is not null then
        insert into public.annotations (user_id, song_id, setlist_item_id, section_label, body, created_at)
        select a.user_id, a.song_id, new_item.id, a.section_label, a.body, a.created_at
        from public.annotations a
        join public.setlist_items old_item on old_item.id = a.setlist_item_id
        join public.setlist_items new_item on new_item.key = old_item.key
        where old_item.setlist_id = v_old_id and new_item.setlist_id = v_new_id;

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
create or replace function public.add_event_items(p_event_id uuid, p_items jsonb, p_after_key uuid)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_setlist_id uuid;
  v_items jsonb;
  v_index integer;
  v_block_key uuid;
begin
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'items must be an array' using errcode = '22023';
  end if;

  -- Changes of the same event wait for each other here, as in `set_event_items()`.
  select e.setlist_id into v_setlist_id
  from public.events e
  where e.id = p_event_id
  for update;
  if not found then
    return 'no_event';
  end if;

  v_items := public.setlist_items_input(v_setlist_id);
  if jsonb_array_length(v_items) + jsonb_array_length(p_items) > 100 then
    return 'too_many_items';
  end if;

  if p_after_key = '00000000-0000-0000-0000-000000000000'::uuid then
    v_index := 0;
  else
    select e.ordinality::integer into v_index
    from jsonb_array_elements(v_items) with ordinality as e (value, ordinality)
    where (e.value ->> 'key')::uuid = p_after_key;
  end if;

  if v_index is null then
    v_items := v_items || p_items;
  else
    -- The block of the item before and of the item after the new items, when
    -- it is the same block. `v_index` is the 1-based place of the item
    -- before, so the item after is at `v_index` (0-based position).
    select bb.block_key into v_block_key
    from public.setlist_items before_item
    join public.setlist_item_blocks bb on bb.setlist_item_id = before_item.id and bb.event_id = p_event_id
    join public.setlist_items after_item on after_item.setlist_id = v_setlist_id and after_item.position = v_index
    join public.setlist_item_blocks ab on ab.setlist_item_id = after_item.id and ab.event_id = p_event_id
    where before_item.setlist_id = v_setlist_id
      and before_item.position = v_index - 1
      and ab.block_key = bb.block_key;

    select coalesce(jsonb_agg(e.value order by e.ordinality) filter (where e.ordinality <= v_index), '[]'::jsonb)
      || (
        select coalesce(jsonb_agg(
          case
            when v_block_key is not null and not n.value ? 'block_key'
            then n.value || jsonb_build_object('block_key', v_block_key)
            else n.value
          end
          order by n.ordinality
        ), '[]'::jsonb)
        from jsonb_array_elements(p_items) with ordinality as n (value, ordinality)
      )
      || coalesce(jsonb_agg(e.value order by e.ordinality) filter (where e.ordinality > v_index), '[]'::jsonb)
    into v_items
    from jsonb_array_elements(v_items) with ordinality as e (value, ordinality);
  end if;

  perform public.set_event_items(p_event_id, v_items, null, false);
  return 'added';
end;
$$;
--> statement-breakpoint
create or replace function public.remove_event_item(p_event_id uuid, p_key uuid)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_setlist_id uuid;
  v_items jsonb;
begin
  select e.setlist_id into v_setlist_id
  from public.events e
  where e.id = p_event_id
  for update;
  if not found then
    return 'no_event';
  end if;

  if not exists (select 1 from public.setlist_items where setlist_id = v_setlist_id and key = p_key) then
    return 'no_item';
  end if;

  select coalesce(jsonb_agg(e.value order by e.ordinality), '[]'::jsonb) into v_items
  from jsonb_array_elements(public.setlist_items_input(v_setlist_id)) with ordinality as e (value, ordinality)
  where (e.value ->> 'key')::uuid <> p_key;

  perform public.set_event_items(p_event_id, v_items, null, false);
  return 'removed';
end;
$$;
--> statement-breakpoint
create or replace function public.create_event_block(p_event_id uuid, p_item_keys uuid[], p_name text, p_countdown text, p_until time)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_setlist_id uuid;
  v_count integer;
  v_first integer;
  v_last integer;
  v_key uuid;
begin
  if coalesce(cardinality(p_item_keys), 0) = 0 or cardinality(p_item_keys) > 100 then
    raise exception 'one to 100 items' using errcode = '22023';
  end if;

  -- Changes of the same event wait for each other here, as in `set_event_items()`.
  select e.setlist_id into v_setlist_id
  from public.events e
  where e.id = p_event_id
  for update;
  if not found then
    return null;
  end if;

  select count(*), min(si.position), max(si.position) into v_count, v_first, v_last
  from public.setlist_items si
  where si.setlist_id = v_setlist_id and si.key = any (p_item_keys);

  if v_count <> (select count(distinct k) from unnest(p_item_keys) as k) then
    return jsonb_build_object('status', 'no_item');
  end if;
  if exists (
    select 1
    from public.setlist_items si
    join public.setlist_item_blocks b on b.setlist_item_id = si.id
    where si.setlist_id = v_setlist_id and si.key = any (p_item_keys)
  ) then
    return jsonb_build_object('status', 'in_block');
  end if;
  if v_last - v_first + 1 <> v_count then
    return jsonb_build_object('status', 'apart');
  end if;

  insert into public.event_blocks (event_id, name, countdown, countdown_until)
  values (p_event_id, p_name, p_countdown, p_until)
  returning key into v_key;

  insert into public.setlist_item_blocks (setlist_item_id, event_id, block_key)
  select si.id, p_event_id, v_key
  from public.setlist_items si
  where si.setlist_id = v_setlist_id and si.key = any (p_item_keys);

  return jsonb_build_object('status', 'created', 'key', v_key);
end;
$$;
--> statement-breakpoint
create or replace function public.delete_event_block(p_event_id uuid, p_key uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- The cascade removes the block from the items of all setlists.
  delete from public.event_blocks where event_id = p_event_id and key = p_key;
  return found;
end;
$$;
--> statement-breakpoint
create or replace function public.update_event_block(
  p_event_id uuid,
  p_key uuid,
  p_name text,
  p_countdown text,
  p_until time,
  p_duration_seconds integer
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.event_blocks
  set
    name = p_name,
    countdown = p_countdown,
    countdown_until = p_until,
    duration_seconds = p_duration_seconds,
    started_at = case when countdown = p_countdown then started_at end
  where event_id = p_event_id and key = p_key;
  return found;
end;
$$;
--> statement-breakpoint
create or replace function public.start_event_block(p_event_id uuid, p_key uuid, p_restart boolean)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_block public.event_blocks;
  v_seconds integer;
begin
  select * into v_block
  from public.event_blocks
  where event_id = p_event_id and key = p_key
  for update;
  if not found then
    return null;
  end if;
  if v_block.countdown <> 'remaining' then
    return jsonb_build_object('started_at', null);
  end if;

  -- The planned time of the items of the block, as `plannedSeconds()` of the
  -- app: the time of the item, else the duration of the arrangement of a song.
  select coalesce(sum(coalesce(d.seconds, a.duration_seconds)), 0) into v_seconds
  from public.events e
  join public.setlist_items si on si.setlist_id = e.setlist_id
  join public.setlist_item_blocks b on b.setlist_item_id = si.id and b.block_key = p_key
  left join public.setlist_item_durations d on d.setlist_item_id = si.id
  left join public.arrangements a on a.id = si.arrangement_id
  where e.id = p_event_id;
  v_seconds := coalesce(v_block.duration_seconds, v_seconds);

  if p_restart
    or v_block.started_at is null
    or v_block.started_at + make_interval(secs => v_seconds) + interval '30 minutes' < now()
  then
    update public.event_blocks
    set started_at = now()
    where event_id = p_event_id and key = p_key
    returning started_at into v_block.started_at;
  end if;

  return jsonb_build_object('started_at', v_block.started_at);
end;
$$;
--> statement-breakpoint
create or replace function public.add_event_arrangement(p_event_id uuid, p_arrangement_id uuid, p_musical_key text)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ends_at timestamptz;
begin
  select e.ends_at into v_ends_at from public.events e where e.id = p_event_id;
  if not found then
    return 'no_event';
  end if;

  if v_ends_at <= now() then
    return 'ended';
  end if;

  if not exists (select 1 from public.arrangements a where a.id = p_arrangement_id) then
    return 'no_arrangement';
  end if;

  return public.add_event_items(
    p_event_id,
    jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'arrangement_id', p_arrangement_id,
      'musical_key', p_musical_key
    ))),
    null
  );
end;
$$;
--> statement-breakpoint
create or replace function public.delete_unused_setlist()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.setlist_id is not distinct from old.setlist_id then
    return null;
  end if;

  delete from public.setlists where id = old.setlist_id;

  return null;
end;
$$;
--> statement-breakpoint
create function public.prevent_setlist_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'setlists cannot change' using errcode = 'P0001', hint = 'setlist_immutable';
end;
$$;
--> statement-breakpoint
create or replace function public.check_setlist()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- The same transaction deleted the setlist again.
  if not exists (select 1 from public.setlists where id = new.id) then
    return null;
  end if;

  if not exists (select 1 from public.events where setlist_id = new.id) then
    raise exception 'setlist without event' using errcode = 'P0001', hint = 'setlist_without_event';
  end if;

  if new.items is distinct from (
    select jsonb_agg(
      case
        when si.arrangement_id is not null then jsonb_strip_nulls(jsonb_build_object(
          'arrangement_id', si.arrangement_id,
          'musical_key', si.musical_key
        ))
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
      end
      order by si.position
    )
    from public.setlist_items si
    where si.setlist_id = new.id
  ) then
    raise exception 'setlist items differ from the setlist' using errcode = 'P0001', hint = 'setlist_items_mismatch';
  end if;

  return null;
end;
$$;
--> statement-breakpoint
CREATE TRIGGER setlists_prevent_update BEFORE UPDATE ON public.setlists
FOR EACH ROW EXECUTE FUNCTION public.prevent_setlist_update();
--> statement-breakpoint
CREATE TRIGGER setlist_items_prevent_update BEFORE UPDATE ON public.setlist_items
FOR EACH ROW EXECUTE FUNCTION public.prevent_setlist_update();
--> statement-breakpoint
CREATE TRIGGER events_delete_unused_setlist AFTER UPDATE OF setlist_id OR DELETE ON public.events
FOR EACH ROW WHEN (old.setlist_id IS NOT NULL) EXECUTE FUNCTION public.delete_unused_setlist();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER setlists_check AFTER INSERT ON public.setlists
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_setlist();
--> statement-breakpoint
DO $$
DECLARE f text;
BEGIN
  FOR f IN SELECT p.oid::regprocedure::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('setlist_items_input','normalize_event_blocks','set_event_items',
      'add_event_items','remove_event_item','create_event_block','delete_event_block','update_event_block',
      'start_event_block','add_event_arrangement')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO churchy_app, churchy_music', f);
  END LOOP;
END
$$;
--> statement-breakpoint
ALTER TABLE "event_blocks" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "event_blocks" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "event_blocks" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
ALTER TABLE "setlist_item_blocks" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "setlist_item_blocks" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "setlist_item_blocks" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
