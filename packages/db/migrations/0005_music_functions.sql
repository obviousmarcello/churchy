CREATE TEXT SEARCH CONFIGURATION public.simple_unaccent (PARSER = pg_catalog."default");
--> statement-breakpoint
ALTER TEXT SEARCH CONFIGURATION public.simple_unaccent
  ADD MAPPING FOR asciiword, word, hword_part, hword_asciipart, asciihword, hword
  WITH extensions.unaccent, simple;
--> statement-breakpoint
ALTER TEXT SEARCH CONFIGURATION public.simple_unaccent
  ADD MAPPING FOR numword, email, url, host, sfloat, version, hword_numpart, numhword, url_path,
  file, "float", "int", uint WITH simple;
--> statement-breakpoint
-- Custom SQL migration file, put your code below! --
-- Music merge phase 1b: what the music tables (0006) need before they can be created: pg_trgm
-- (title/artist trigram indexes), the `simple_unaccent` text search configuration (generated
-- arrangements.search_vector) and the SECURITY INVOKER helper functions used by generated
-- columns, defaults and CHECK constraints. Copied verbatim from the music repo's final schema
-- (pg_get_functiondef), except church_time_zone(), which now reads the current tenant's app_config.
-- Every other music function is listed in docs/music-merge/FUNCTIONS.md with its phase.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.chordpro_directive(p_chordpro text, p_name text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO ''
AS $function$
  select substring(p_chordpro from '(?n)^\s*\{\s*' || p_name || '\s*:\s*([^}]*?)\s*\}');
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.canonical_key(p_key text, p_notation text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO ''
AS $function$
  select case
    when r.m is null then null
    when r.m[3] in ('m', 'min') then (array['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'])[r.pitch + 1] || 'm'
    else (array['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'])[r.pitch + 1]
  end
  from (
    select
      x.m,
      ((
        case x.m[1]
          when 'C' then 0 when 'D' then 2 when 'E' then 4 when 'F' then 5
          when 'G' then 7 when 'A' then 9 when 'H' then 11
          when 'B' then case when p_notation = 'german' then 10 else 11 end
        end
        + case
          when x.m[2] = '#' then 1
          -- German "Bb" also means B flat.
          when x.m[2] = 'b' and not (x.m[1] = 'B' and p_notation = 'german') then -1
          else 0
        end
      ) % 12 + 12) % 12 as pitch
    from (select regexp_match(btrim(p_key), '^([A-H])([#b]?)(m|min|maj7?)?$') as m) x
  ) r;
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.chart_notation(p_chordpro text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO ''
AS $function$
  select case
    when lower(public.chordpro_directive(p_chordpro, 'x_notation')) in ('english', 'german')
      then lower(public.chordpro_directive(p_chordpro, 'x_notation'))
    -- A chord with the root or the bass H, or the key H.
    when p_chordpro ~ '\[H|/H|\{\s*key\s*:\s*H' then 'german'
    else 'english'
  end;
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.chart_key_names(p_chordpro text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO ''
AS $function$
  with written as (
    select
      public.canonical_key(public.chordpro_directive(p_chordpro, 'key'), public.chart_notation(p_chordpro)) as name,
      public.chart_notation(p_chordpro) as notation
  )
  select case
    when written.name is null then '{}'::text[]
    else array(
      select distinct k.name
      from (
        select written.name
        union all
        select public.canonical_key(o.value, written.notation)
        from regexp_split_to_table(coalesce(public.chordpro_directive(p_chordpro, 'x_other_keys'), ''), '[\s,;]+') as o (value)
      ) k
      -- Only minor keys end with "m".
      where k.name is not null and (k.name like '%m') = (written.name like '%m')
      order by k.name
    )
  end
  from written;
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.valid_song_tags(p_tags text[])
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO ''
AS $function$
  select coalesce(array_ndims(p_tags), 1) = 1
    and cardinality(p_tags) <= 10
    and not exists (
      select 1 from unnest(p_tags) as t (tag)
      where t.tag is null or t.tag <> btrim(t.tag) or char_length(t.tag) not between 1 and 40
    )
    and (select count(distinct lower(t.tag)) from unnest(p_tags) as t (tag)) = cardinality(p_tags);
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.setlist_song_count(p_items jsonb)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO ''
AS $function$
  select count(*)::integer from jsonb_array_elements(p_items) as e (value) where e.value ? 'arrangement_id';
$function$;
--> statement-breakpoint
-- Tenant-scoped (was: the single app_config row). plpgsql: app_config is created in 0006.
CREATE OR REPLACE FUNCTION public.church_time_zone()
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
BEGIN
  RETURN coalesce(
    (SELECT c.time_zone FROM public.app_config c WHERE c.tenant_id = (SELECT app.current_tenant_id())),
    'Europe/Budapest');
END
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.valid_announcement_words(p_words text[])
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select coalesce(bool_and(w = btrim(w) and char_length(w) between 1 and 50), true)
  from unnest(p_words) as u (w);
$function$;
