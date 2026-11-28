DROP FUNCTION IF EXISTS public.filter_songs(text, text, text, integer, integer, text, text, integer, integer, uuid);
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
CREATE OR REPLACE FUNCTION public.song_play_stats(p_song_ids uuid[], p_user_id uuid)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $function$
  select '{}'::jsonb;
$function$;
