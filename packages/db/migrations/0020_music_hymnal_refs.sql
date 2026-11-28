-- Music merge phase 7b: the free-text songbook of a song ("Hit hangjai 324; HH 12") becomes rows of
-- `song_hymnal_refs` where the name or abbreviation matches a hymnal of the platform catalog or of the
-- church (PLAN O3). The text stays. SECURITY INVOKER: the tenant comes from `app.current_tenant_id()`
-- and RLS; a dry run changes nothing.
CREATE OR REPLACE FUNCTION public.merge_songbook_hymnal_refs(p_dry_run boolean DEFAULT false)
 RETURNS TABLE(song_id uuid, hymnal_id uuid, number text, inserted boolean)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_tenant uuid := app.current_tenant_id();
  r record;
  v_done boolean;
begin
  if v_tenant is null then
    raise exception 'no tenant' using errcode = '42501';
  end if;
  for r in
    select distinct on (s.id, h.id, m.parts[2])
      s.id as sid, h.id as hid, m.parts[2] as num
    from public.songs s
    cross join lateral regexp_split_to_table(s.songbook, '\s*;\s*') as entry
    cross join lateral (select regexp_match(btrim(entry), '^(.+?)\s+([0-9]+[a-z]?)$') as parts) m
    join public.hymnals h
      on (h.tenant_id is null or h.tenant_id = v_tenant)
     and (public.search_key(h.abbreviation) = public.search_key(m.parts[1])
          or public.search_key(h.name) = public.search_key(m.parts[1]))
    where s.tenant_id = v_tenant and s.songbook is not null and m.parts is not null
    order by s.id, h.id, m.parts[2], h.tenant_id nulls last
  loop
    v_done := false;
    if not p_dry_run then
      insert into public.song_hymnal_refs (tenant_id, song_id, hymnal_id, number)
      values (v_tenant, r.sid, r.hid, r.num)
      on conflict do nothing;
      get diagnostics v_done = row_count;
    else
      v_done := not exists (
        select 1 from public.song_hymnal_refs x
        where x.song_id = r.sid and x.hymnal_id = r.hid and x.number = r.num);
    end if;
    song_id := r.sid; hymnal_id := r.hid; number := r.num; inserted := v_done;
    return next;
  end loop;
end;
$function$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.merge_songbook_hymnal_refs(boolean) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.merge_songbook_hymnal_refs(boolean) TO churchy_app;
