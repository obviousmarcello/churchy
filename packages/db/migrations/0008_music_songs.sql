CREATE TABLE "song_rights" (
	"tenant_id" uuid,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ccli_number" text,
	"title_key" text NOT NULL,
	"authors_key" text DEFAULT '' NOT NULL,
	"title" text COLLATE "hu-HU-x-icu" NOT NULL,
	"authors" text,
	"original_title" text,
	"translator" text,
	"songbook" text,
	"copyright" text,
	"updated_by_tenant" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "song_rights_ccli_number_check" CHECK ((ccli_number ~ '^[0-9]{1,10}$'::text)),
	CONSTRAINT "song_rights_title_check" CHECK (((char_length(title) >= 1) AND (char_length(title) <= 200))),
	CONSTRAINT "song_rights_authors_check" CHECK ((char_length(authors) <= 500)),
	CONSTRAINT "song_rights_original_title_check" CHECK ((char_length(original_title) <= 200)),
	CONSTRAINT "song_rights_translator_check" CHECK ((char_length(translator) <= 200)),
	CONSTRAINT "song_rights_songbook_check" CHECK ((char_length(songbook) <= 200)),
	CONSTRAINT "song_rights_copyright_check" CHECK ((char_length(copyright) <= 500))
);
--> statement-breakpoint
ALTER TABLE "song_rights" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "annotations" ALTER COLUMN "tenant_id" SET DEFAULT app.current_tenant_id();--> statement-breakpoint
ALTER TABLE "announcement_calendars" ALTER COLUMN "tenant_id" SET DEFAULT app.current_tenant_id();--> statement-breakpoint
ALTER TABLE "announcement_settings" ALTER COLUMN "tenant_id" SET DEFAULT app.current_tenant_id();--> statement-breakpoint
ALTER TABLE "app_config" ALTER COLUMN "tenant_id" SET DEFAULT app.current_tenant_id();--> statement-breakpoint
ALTER TABLE "app_modules" ALTER COLUMN "tenant_id" SET DEFAULT app.current_tenant_id();--> statement-breakpoint
ALTER TABLE "arrangements" ALTER COLUMN "tenant_id" SET DEFAULT app.current_tenant_id();--> statement-breakpoint
ALTER TABLE "calendar_feeds" ALTER COLUMN "tenant_id" SET DEFAULT app.current_tenant_id();--> statement-breakpoint
ALTER TABLE "course_images" ALTER COLUMN "tenant_id" SET DEFAULT app.current_tenant_id();--> statement-breakpoint
ALTER TABLE "course_lessons" ALTER COLUMN "tenant_id" SET DEFAULT app.current_tenant_id();--> statement-breakpoint
ALTER TABLE "courses" ALTER COLUMN "tenant_id" SET DEFAULT app.current_tenant_id();--> statement-breakpoint
ALTER TABLE "email_templates" ALTER COLUMN "tenant_id" SET DEFAULT app.current_tenant_id();--> statement-breakpoint
ALTER TABLE "mixer_settings" ALTER COLUMN "tenant_id" SET DEFAULT app.current_tenant_id();--> statement-breakpoint
ALTER TABLE "notification_preferences" ALTER COLUMN "tenant_id" SET DEFAULT app.current_tenant_id();--> statement-breakpoint
ALTER TABLE "projection_themes" ALTER COLUMN "tenant_id" SET DEFAULT app.current_tenant_id();--> statement-breakpoint
ALTER TABLE "projection_video_uploads" ALTER COLUMN "tenant_id" SET DEFAULT app.current_tenant_id();--> statement-breakpoint
ALTER TABLE "push_subscriptions" ALTER COLUMN "tenant_id" SET DEFAULT app.current_tenant_id();--> statement-breakpoint
ALTER TABLE "setlist_item_durations" ALTER COLUMN "tenant_id" SET DEFAULT app.current_tenant_id();--> statement-breakpoint
ALTER TABLE "setlist_item_themes" ALTER COLUMN "tenant_id" SET DEFAULT app.current_tenant_id();--> statement-breakpoint
ALTER TABLE "setlist_items" ALTER COLUMN "tenant_id" SET DEFAULT app.current_tenant_id();--> statement-breakpoint
ALTER TABLE "setlists" ALTER COLUMN "tenant_id" SET DEFAULT app.current_tenant_id();--> statement-breakpoint
ALTER TABLE "sheet_marks" ALTER COLUMN "tenant_id" SET DEFAULT app.current_tenant_id();--> statement-breakpoint
ALTER TABLE "song_image_arrangements" ALTER COLUMN "tenant_id" SET DEFAULT app.current_tenant_id();--> statement-breakpoint
ALTER TABLE "song_image_pages" ALTER COLUMN "tenant_id" SET DEFAULT app.current_tenant_id();--> statement-breakpoint
ALTER TABLE "song_image_stray_files" ALTER COLUMN "tenant_id" SET DEFAULT app.current_tenant_id();--> statement-breakpoint
ALTER TABLE "song_images" ALTER COLUMN "tenant_id" SET DEFAULT app.current_tenant_id();--> statement-breakpoint
ALTER TABLE "song_link_arrangements" ALTER COLUMN "tenant_id" SET DEFAULT app.current_tenant_id();--> statement-breakpoint
ALTER TABLE "song_links" ALTER COLUMN "tenant_id" SET DEFAULT app.current_tenant_id();--> statement-breakpoint
ALTER TABLE "song_pdf_arrangements" ALTER COLUMN "tenant_id" SET DEFAULT app.current_tenant_id();--> statement-breakpoint
ALTER TABLE "song_pdf_uploads" ALTER COLUMN "tenant_id" SET DEFAULT app.current_tenant_id();--> statement-breakpoint
ALTER TABLE "song_pdfs" ALTER COLUMN "tenant_id" SET DEFAULT app.current_tenant_id();--> statement-breakpoint
ALTER TABLE "song_rights_proposals" ALTER COLUMN "tenant_id" SET DEFAULT app.current_tenant_id();--> statement-breakpoint
ALTER TABLE "song_rights_research_settings" ALTER COLUMN "tenant_id" SET DEFAULT app.current_tenant_id();--> statement-breakpoint
ALTER TABLE "song_scores" ALTER COLUMN "tenant_id" SET DEFAULT app.current_tenant_id();--> statement-breakpoint
ALTER TABLE "song_sound_file_arrangements" ALTER COLUMN "tenant_id" SET DEFAULT app.current_tenant_id();--> statement-breakpoint
ALTER TABLE "song_sound_file_uploads" ALTER COLUMN "tenant_id" SET DEFAULT app.current_tenant_id();--> statement-breakpoint
ALTER TABLE "song_sound_files" ALTER COLUMN "tenant_id" SET DEFAULT app.current_tenant_id();--> statement-breakpoint
ALTER TABLE "songs" ALTER COLUMN "tenant_id" SET DEFAULT app.current_tenant_id();--> statement-breakpoint
ALTER TABLE "stray_files" ALTER COLUMN "tenant_id" SET DEFAULT app.current_tenant_id();--> statement-breakpoint
ALTER TABLE "user_arrangement_views" ALTER COLUMN "tenant_id" SET DEFAULT app.current_tenant_id();--> statement-breakpoint
ALTER TABLE "user_arrangements" ALTER COLUMN "tenant_id" SET DEFAULT app.current_tenant_id();--> statement-breakpoint
ALTER TABLE "user_file_views" ALTER COLUMN "tenant_id" SET DEFAULT app.current_tenant_id();--> statement-breakpoint
ALTER TABLE "song_rights" ADD CONSTRAINT "song_rights_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_rights" ADD CONSTRAINT "song_rights_updated_by_tenant_tenants_id_fk" FOREIGN KEY ("updated_by_tenant") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "song_rights_tenant_id_idx" ON "song_rights" USING btree ("tenant_id");--> statement-breakpoint
-- Music merge phase 2 (song catalog, rights): the music app's song functions, tenant-aware.
-- All SECURITY INVOKER with an empty search_path: they read and write through RLS as the calling
-- role (churchy_music / churchy_app), so `tenant_isolation` scopes every row, and new rows take
-- `tenant_id` from the column default `app.current_tenant_id()` (above). Bodies are the music
-- app's final versions (their 151 migrations) unless a comment says otherwise.
-- docs/music-merge/FUNCTIONS.md lists them; migrations/down/0008_music_songs.sql drops them.
CREATE OR REPLACE FUNCTION public.fold_text(p_text text)
 RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT SECURITY INVOKER SET search_path TO ''
AS $function$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, p_text));
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.search_key(p_text text)
 RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SECURITY INVOKER SET search_path TO ''
AS $function$
  select coalesce(
    regexp_replace(public.fold_text(p_text), '[\t\n\v\f\r  !-/:-@\[-`{-~‘’‚“”„–—…«»‹›¡¿·]+', '', 'g'),
    ''
  );
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.has_distinct_elements(p_values uuid[])
 RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SECURITY INVOKER SET search_path TO ''
AS $function$
  select cardinality(p_values) = (select count(distinct v) from unnest(p_values) as v);
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.chart_lyrics(p_chordpro text)
 RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SECURITY INVOKER SET search_path TO ''
AS $function$
  select btrim(
    regexp_replace(
      regexp_replace(regexp_replace(translate(p_chordpro, chr(2) || chr(3), ''), '\[[^]]*\]', '', 'g'), '\{[^}]*\}', ' ', 'g'),
      '\s*\n\s*',
      ' / ',
      'g'
    ),
    ' /'
  );
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;
--> statement-breakpoint
CREATE TRIGGER songs_set_updated_at BEFORE UPDATE ON public.songs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER arrangements_set_updated_at BEFORE UPDATE ON public.arrangements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.check_arrangement_attachment_links()
 RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $function$
begin
  -- Churchy: also when a delete cascades (a song or a whole church goes, pg_trigger_depth() > 1).
  if pg_catalog.pg_trigger_depth() > 1 or not exists (select 1 from public.songs where id = old.song_id) then
    return old;
  end if;
  if exists (
    select 1 from public.song_pdf_arrangements l
    where l.arrangement_id = old.id
      and not exists (select 1 from public.song_pdf_arrangements o where o.pdf_id = l.pdf_id and o.arrangement_id <> old.id)
  ) or exists (
    select 1 from public.song_image_arrangements l
    where l.arrangement_id = old.id
      and not exists (select 1 from public.song_image_arrangements o where o.image_id = l.image_id and o.arrangement_id <> old.id)
  ) or exists (
    select 1 from public.song_link_arrangements l
    where l.arrangement_id = old.id
      and not exists (select 1 from public.song_link_arrangements o where o.link_id = l.link_id and o.arrangement_id <> old.id)
  ) or exists (
    select 1 from public.song_sound_file_arrangements l
    where l.arrangement_id = old.id
      and not exists (select 1 from public.song_sound_file_arrangements o where o.sound_file_id = l.sound_file_id and o.arrangement_id <> old.id)
  ) then
    raise exception 'only arrangement of a file or a link' using errcode = 'P0001', hint = 'arrangement_attachments';
  end if;
  return old;
end;
$function$;
--> statement-breakpoint
CREATE TRIGGER arrangements_check_attachment_links BEFORE DELETE ON public.arrangements
  FOR EACH ROW EXECUTE FUNCTION public.check_arrangement_attachment_links();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.create_song(
  p_title text, p_artist text, p_tags text[], p_chordpro text, p_section_order text[],
  p_copyright text DEFAULT NULL, p_songbook text DEFAULT NULL, p_authors text DEFAULT NULL,
  p_original_title text DEFAULT NULL, p_translator text DEFAULT NULL, p_rights_status text DEFAULT NULL,
  p_rights_note text DEFAULT NULL)
 RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $function$
declare
  v_id uuid;
begin
  insert into public.songs (
    title, artist, tags, copyright, songbook, authors, original_title, translator, rights_status, rights_note
  )
  values (
    p_title, p_artist, coalesce(p_tags, '{}'), p_copyright, p_songbook, p_authors, p_original_title,
    p_translator, coalesce(p_rights_status, 'unknown'), p_rights_note
  )
  returning id into v_id;
  insert into public.arrangements (song_id, name, chordpro, section_order, is_default)
  values (v_id, 'Default', p_chordpro, p_section_order, true);
  return v_id;
end;
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.set_default_arrangement(p_id uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $function$
declare
  v_song_id uuid;
begin
  select song_id into v_song_id from public.arrangements where id = p_id for update;
  if not found then
    return false;
  end if;
  update public.arrangements set is_default = false
  where song_id = v_song_id and is_default and id <> p_id;
  update public.arrangements set is_default = true
  where id = p_id and not is_default;
  return true;
end;
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.clone_arrangement(p_id uuid, p_name text)
 RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $function$
declare
  v_id uuid;
begin
  insert into public.arrangements (song_id, name, chordpro, section_order, projection_theme_id)
  select song_id, coalesce(p_name, left(name, 193) || ' (copy)'), chordpro, section_order, projection_theme_id
  from public.arrangements
  where id = p_id
  returning id into v_id;
  return v_id;
end;
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.song_tags()
 RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $function$
  select coalesce(jsonb_agg(spelling.tag), '[]'::jsonb)
  from (
    select distinct on (lower(t.tag)) t.tag
    from public.songs s, unnest(s.tags) as t (tag)
    group by t.tag
    order by lower(t.tag), count(*) desc, t.tag
  ) spelling;
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.song_filter_options()
 RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'keys', coalesce(
      (select jsonb_agg(name order by name)
       from (select distinct k.name from public.arrangements a, unnest(a.key_names) as k (name)) k),
      '[]'::jsonb
    ),
    'timeSignatures', coalesce(
      (select jsonb_agg(time_signature order by time_signature)
       from (select distinct time_signature from public.arrangements where time_signature is not null) t),
      '[]'::jsonb
    ),
    'tags', public.song_tags()
  );
$function$;
--> statement-breakpoint
-- Play statistics read events/setlists, which merge into Churchy's events in phase 4: until then
-- no song has been played (`{}`), and the "recent"/"oldest" sorts of filter_songs fall back to
-- the title order.
CREATE OR REPLACE FUNCTION public.song_play_stats(p_song_ids uuid[], p_user_id uuid)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $function$
  select '{}'::jsonb;
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.song_play_stats(p_song_ids uuid[])
 RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $function$
  select public.song_play_stats(p_song_ids, null);
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.filter_songs(
  p_query text, p_key text, p_time_signature text, p_bpm_min integer, p_bpm_max integer,
  p_tag text, p_sort text, p_limit integer, p_offset integer)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $function$
  with q as (
    select
      public.search_key(p_query) as needle,
      (
        select to_tsquery('public.simple_unaccent'::regconfig, string_agg(word || ':*', ' & '))
        from regexp_split_to_table(public.fold_text(p_query), '[^[:alnum:]]+') as word
        where word <> ''
      ) as ts
  ),
  matches as (
    select
      s.id,
      s.title,
      q.needle <> '' and strpos(k.title, q.needle) > 0 as title_match,
      q.needle <> '' and right(k.songbook, length(q.needle)) = q.needle as songbook_end_match,
      q.needle <> '' and (
        strpos(k.title, q.needle) > 0
        or strpos(k.artist, q.needle) > 0
        or strpos(k.songbook, q.needle) > 0
      ) as field_match,
      -- Phase 4 (events): the last event that played the song.
      null::timestamptz as last_played_at
    from public.songs s
    cross join q
    cross join lateral (
      select
        public.search_key(s.title) as title,
        public.search_key(s.artist) as artist,
        public.search_key(s.songbook) as songbook
      offset 0
    ) k
    where (
        q.needle = ''
        or strpos(k.title, q.needle) > 0
        or strpos(k.artist, q.needle) > 0
        or strpos(k.songbook, q.needle) > 0
        or exists (
          select 1 from unnest(s.tags) as t (tag)
          where strpos(public.search_key(t.tag), q.needle) > 0
        )
        or exists (
          select 1 from public.arrangements a
          where a.song_id = s.id and a.search_vector @@ q.ts
        )
      )
      and (p_tag is null or exists (select 1 from unnest(s.tags) as t (tag) where lower(t.tag) = lower(p_tag)))
      and (
        (p_key is null and p_time_signature is null and p_bpm_min is null and p_bpm_max is null)
        or exists (
          select 1 from public.arrangements a
          where a.song_id = s.id
            and (p_key is null or p_key = any(a.key_names))
            and (p_time_signature is null or a.time_signature = p_time_signature)
            and (p_bpm_min is null or a.tempo_bpm >= p_bpm_min)
            and (p_bpm_max is null or a.tempo_bpm <= p_bpm_max)
        )
      )
  ),
  ranked as (
    select
      id,
      field_match,
      row_number() over (
        order by
          case when p_sort = 'recent' then last_played_at end desc nulls last,
          case when p_sort = 'oldest' then last_played_at end asc nulls last,
          title_match desc,
          songbook_end_match desc,
          title,
          id
      ) as rn
    from matches
  ),
  page as (
    select id, field_match, rn
    from ranked
    order by rn
    limit least(greatest(coalesce(p_limit, 25), 1), 100)
    offset greatest(coalesce(p_offset, 0), 0)
  ),
  snippets as (
    select page.id, best.name, best.is_default, best.lyrics
    from page
    cross join q
    cross join lateral (
      select a.name, a.is_default, h.lyrics
      from public.arrangements a
      cross join lateral (
        select ts_headline(
          'public.simple_unaccent'::regconfig,
          public.chart_lyrics(a.chordpro),
          q.ts,
          'MaxFragments=1, MaxWords=14, MinWords=5, StartSel=' || chr(2) || ', StopSel=' || chr(3)
        ) as lyrics
      ) h
      where a.song_id = page.id
        and a.search_vector @@ q.ts
        and strpos(h.lyrics, chr(2)) > 0
      order by a.is_default desc, a.name, a.id
      limit 1
    ) best
    where q.needle <> '' and not page.field_match
  )
  select jsonb_build_object(
    'total', (select count(*) from matches),
    'ids', coalesce((select jsonb_agg(id order by rn) from page), '[]'::jsonb),
    'snippets', coalesce(
      (
        select jsonb_object_agg(id, jsonb_build_object('arrangement', name, 'is_default', is_default, 'text', lyrics))
        from snippets
      ),
      '{}'::jsonb
    )
  );
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.songs_for_rights_research()
 RETURNS TABLE(id uuid) LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $function$
  select s.id
  from public.songs s
  join public.arrangements a on a.song_id = s.id and a.is_default
  where s.authors is null
    and s.original_title is null
    and s.translator is null
    and s.rights_note is null
    and s.rights_status = 'unknown'
    and btrim(
      regexp_replace(regexp_replace(regexp_replace(a.chordpro, '(?n)^\s*#.*$', '', 'g'), '\{[^}]*\}', '', 'g'), '\[[^]]*\]', '', 'g'),
      E' \t\r\n'
    ) <> ''
    and not exists (
      select 1 from public.song_rights_proposals p
      where p.song_id = s.id
        and not (p.status = 'failed' and p.error_kind is not distinct from 'no_lyrics' and p.created_at < a.updated_at)
        and not (p.status = 'failed' and p.error_kind is not distinct from 'temporary')
        and not (p.status = 'failed' and p.error_kind is not distinct from 'provider')
    )
    and (
      select count(*) from public.song_rights_proposals p
      where p.song_id = s.id
        and (
          p.error_kind = 'temporary'
          or (
            p.error_kind = 'provider'
            and exists (
              select 1 from public.song_rights_proposals later
              where later.provider = p.provider
                and later.model = p.model
                and later.song_id <> p.song_id
                and later.created_at >= p.created_at
                and later.created_at < coalesce(
                  (
                    select min(next.created_at) from public.song_rights_proposals next
                    where next.song_id = p.song_id and next.created_at > p.created_at
                  ),
                  'infinity'
                )
                and (later.status in ('pending', 'accepted', 'rejected') or (later.status = 'failed' and later.error_kind is null))
            )
          )
        )
    ) < 3
  order by (select max(p.created_at) from public.song_rights_proposals p where p.song_id = s.id) nulls first, s.created_at, s.id;
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.songs_for_local_rights_research()
 RETURNS TABLE(id uuid, title text, artist text, copyright text, songbook text, chordpro text)
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $function$
  select s.id, s.title, s.artist, s.copyright, s.songbook, a.chordpro
  from public.songs_for_rights_research() c
  join public.songs s on s.id = c.id
  join public.arrangements a on a.song_id = s.id and a.is_default
  order by s.created_at, s.id;
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.count_songs_for_rights_research()
 RETURNS integer LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $function$
  select count(*)::integer from public.songs_for_rights_research();
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.count_song_rights_proposals()
 RETURNS TABLE(status text, count integer) LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $function$
  select p.status, count(*)::integer from public.song_rights_proposals p group by p.status;
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.recent_closed_song_rights_proposals(p_limit integer)
 RETURNS TABLE(song_id uuid, title text, status text, error text, created_at timestamp with time zone)
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $function$
  select p.song_id, s.title, p.status, p.error, p.created_at
  from (
    select distinct on (p.song_id) p.song_id, p.status, p.error, p.created_at
    from public.song_rights_proposals p
    order by p.song_id, p.created_at desc, p.id desc
  ) p
  join public.songs s on s.id = p.song_id
  where p.status in ('rejected', 'failed')
    and p.song_id not in (select c.id from public.songs_for_rights_research() c)
  order by p.created_at desc
  limit greatest(0, p_limit);
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.review_song_rights_proposal(p_id uuid, p_user uuid, p_accept boolean, p_changes jsonb)
 RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $function$
declare
  v_song_id uuid;
begin
  select song_id into v_song_id
  from public.song_rights_proposals
  where id = p_id and status = 'pending'
  for update;
  if v_song_id is null then
    return false;
  end if;
  if p_accept and p_changes is not null and p_changes <> '{}'::jsonb then
    update public.songs set
      authors = case when p_changes ? 'authors' then p_changes ->> 'authors' else authors end,
      original_title = case when p_changes ? 'original_title' then p_changes ->> 'original_title' else original_title end,
      translator = case when p_changes ? 'translator' then p_changes ->> 'translator' else translator end,
      songbook = case when p_changes ? 'songbook' then p_changes ->> 'songbook' else songbook end,
      copyright = case when p_changes ? 'copyright' then p_changes ->> 'copyright' else copyright end,
      rights_status = case when p_changes ? 'rights_status' then p_changes ->> 'rights_status' else rights_status end
    where id = v_song_id;
  end if;
  update public.song_rights_proposals
  set status = case when p_accept then 'accepted' else 'rejected' end,
      reviewed_by = p_user,
      reviewed_at = now()
  where id = p_id;
  return true;
end;
$function$;
--> statement-breakpoint
-- Tenant-scoped: the open-proposal index is (tenant_id, song_id).
CREATE OR REPLACE FUNCTION public.import_song_rights_findings(p_model text, p_findings jsonb)
 RETURNS TABLE(song_id uuid) LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $function$
#variable_conflict use_column
begin
  return query
  insert into public.song_rights_proposals (song_id, status, provider, model, result)
  select f.song_id, 'pending', 'local', p_model, f.result
  from jsonb_to_recordset(p_findings) as f (song_id uuid, result jsonb)
  where exists (select 1 from public.songs s where s.id = f.song_id)
    and not exists (select 1 from public.song_rights_proposals p where p.song_id = f.song_id and p.result = f.result)
  on conflict (tenant_id, song_id) where status in ('running', 'pending') do nothing
  returning song_rights_proposals.song_id;
end;
$function$;
--> statement-breakpoint
-- Shared song-rights catalog (PLAN §11.2): key = CCLI song number in the copyright text, else
-- the folded title + authors. `song_rights_ccli(copyright)` reads the number.
CREATE OR REPLACE FUNCTION public.song_rights_ccli(p_copyright text)
 RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SECURITY INVOKER SET search_path TO ''
AS $function$
  select (regexp_match(p_copyright, '(?i)ccli[^0-9]{0,12}([0-9]{1,10})'))[1];
$function$;
--> statement-breakpoint
CREATE UNIQUE INDEX song_rights_ccli_key ON public.song_rights USING btree (ccli_number)
  WHERE tenant_id IS NULL AND ccli_number IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX song_rights_title_key ON public.song_rights USING btree (title_key, authors_key)
  WHERE tenant_id IS NULL AND ccli_number IS NULL;
--> statement-breakpoint
-- After a song's rights facts change (song form, accepted research proposal): upsert the shared
-- row. Facts only: the church's licence status and permission note never leave its own row. Empty
-- values never overwrite known ones. SECURITY DEFINER (owner: the migration role, which bypasses
-- RLS): the shared rows stay read-only for churchy_app / churchy_music (catalog rule, rls.ts), and
-- this trigger on a church's own song row is their only write path. No EXECUTE for anyone.
CREATE OR REPLACE FUNCTION public.share_song_rights()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare
  v_ccli text := public.song_rights_ccli(new.copyright);
begin
  if new.authors is null and new.original_title is null and new.translator is null
     and new.songbook is null and new.copyright is null then
    return null;
  end if;
  if v_ccli is not null then
    insert into public.song_rights as r (ccli_number, title_key, authors_key, title, authors, original_title,
      translator, songbook, copyright, updated_by_tenant)
    values (v_ccli, public.search_key(new.title), public.search_key(new.authors), new.title, new.authors,
      new.original_title, new.translator, new.songbook, new.copyright, app.current_tenant_id())
    on conflict (ccli_number) where tenant_id is null and ccli_number is not null do update set
      authors = coalesce(excluded.authors, r.authors),
      original_title = coalesce(excluded.original_title, r.original_title),
      translator = coalesce(excluded.translator, r.translator),
      songbook = coalesce(excluded.songbook, r.songbook),
      copyright = coalesce(excluded.copyright, r.copyright),
      updated_by_tenant = excluded.updated_by_tenant,
      updated_at = now();
  else
    insert into public.song_rights as r (title_key, authors_key, title, authors, original_title, translator,
      songbook, copyright, updated_by_tenant)
    values (public.search_key(new.title), public.search_key(new.authors), new.title, new.authors,
      new.original_title, new.translator, new.songbook, new.copyright, app.current_tenant_id())
    on conflict (title_key, authors_key) where tenant_id is null and ccli_number is null do update set
      original_title = coalesce(excluded.original_title, r.original_title),
      translator = coalesce(excluded.translator, r.translator),
      songbook = coalesce(excluded.songbook, r.songbook),
      copyright = coalesce(excluded.copyright, r.copyright),
      updated_by_tenant = excluded.updated_by_tenant,
      updated_at = now();
  end if;
  return null;
end;
$function$;
--> statement-breakpoint
CREATE TRIGGER songs_share_rights AFTER INSERT OR UPDATE OF title, authors, original_title, translator, songbook, copyright
  ON public.songs FOR EACH ROW EXECUTE FUNCTION public.share_song_rights();
--> statement-breakpoint
-- The shared facts for a song of the current church: by CCLI number, else by title + authors,
-- else by title alone when exactly one shared row has that title.
CREATE OR REPLACE FUNCTION public.shared_song_rights(p_title text, p_authors text, p_copyright text)
 RETURNS SETOF public.song_rights LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $function$
  (select r.* from public.song_rights r
    where r.tenant_id is null and r.ccli_number = public.song_rights_ccli(p_copyright))
  union all
  (select r.* from public.song_rights r
    where r.tenant_id is null and public.song_rights_ccli(p_copyright) is null and r.ccli_number is null
      and r.title_key = public.search_key(p_title) and r.authors_key = public.search_key(p_authors))
  union all
  (select r.* from public.song_rights r
    where r.tenant_id is null and public.song_rights_ccli(p_copyright) is null and p_authors is null
      and r.title_key = public.search_key(p_title)
      and (select count(*) from public.song_rights x where x.tenant_id is null and x.title_key = public.search_key(p_title)) = 1)
  limit 1;
$function$;
--> statement-breakpoint
ALTER TABLE "song_rights" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "song_rights" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "song_rights" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
CREATE POLICY "catalog_read" ON "song_rights" AS PERMISSIVE FOR SELECT TO churchy_app, churchy_music
  USING (tenant_id IS NULL AND (SELECT app.current_tenant_id()) IS NOT NULL);
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.share_song_rights() FROM PUBLIC;
