-- Music merge phase 2b (song files): the music app's file functions and triggers (PDFs, images,
-- MusicXML scores, sound files, links, upload tickets, stray-file bookkeeping), tenant-aware.
-- SECURITY INVOKER with an empty search_path: RLS (`tenant_isolation`) scopes every row and new
-- rows take `tenant_id` from its default (0008). Bodies are the music app's final versions; the
-- stray-file ON CONFLICT targets include tenant_id (the tenant-scoped primary keys).
-- docs/music-merge/FUNCTIONS.md lists them; down/0009_music_files.sql drops them.
CREATE OR REPLACE FUNCTION public.set_song_pdf_arrangements(p_pdf_id uuid, p_song_id uuid, p_arrangement_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ids uuid[] := array(select distinct unnest(coalesce(p_arrangement_ids, '{}')));
begin
  if exists (
    select 1
    from unnest(v_ids) as i (id)
    where not exists (select 1 from public.arrangements a where a.id = i.id and a.song_id = p_song_id)
  ) then
    raise exception 'arrangement of another song' using errcode = 'P0001', hint = 'pdf_arrangement';
  end if;
  delete from public.song_pdf_arrangements
  where pdf_id = p_pdf_id and arrangement_id <> all (v_ids);
  insert into public.song_pdf_arrangements (pdf_id, song_id, arrangement_id)
  select p_pdf_id, p_song_id, i.id from unnest(v_ids) as i (id)
  on conflict do nothing;
end;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.add_song_pdf(
  p_song_id uuid,
  p_name text,
  p_file_name text,
  p_path text,
  p_size_bytes integer,
  p_keys text[],
  p_arrangement_ids uuid[],
  p_max integer
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform 1 from public.songs where id = p_song_id for update;
  if not found then
    return null;
  end if;
  delete from public.song_pdf_uploads where path = p_path;
  if not found then
    raise exception 'unknown upload' using errcode = 'P0001', hint = 'pdf_upload_missing';
  end if;
  if (select count(*) from public.song_pdfs where song_id = p_song_id) >= p_max then
    raise exception 'too many pdfs' using errcode = 'P0001', hint = 'too_many_pdfs';
  end if;
  insert into public.song_pdfs (song_id, name, file_name, path, size_bytes, musical_keys)
  values (p_song_id, p_name, p_file_name, p_path, p_size_bytes, coalesce(p_keys, '{}'))
  returning id into v_id;
  perform public.set_song_pdf_arrangements(v_id, p_song_id, p_arrangement_ids);
  return v_id;
end;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.update_song_pdf(p_id uuid, p_name text, p_keys text[], p_arrangement_ids uuid[])
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_song_id uuid;
begin
  update public.song_pdfs
  set name = p_name, musical_keys = coalesce(p_keys, '{}')
  where id = p_id
  returning song_id into v_song_id;
  if not found then
    return false;
  end if;
  perform public.set_song_pdf_arrangements(p_id, v_song_id, p_arrangement_ids);
  return true;
end;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.set_song_image_arrangements(p_image_id uuid, p_song_id uuid, p_arrangement_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ids uuid[] := array(select distinct unnest(coalesce(p_arrangement_ids, '{}')));
begin
  if exists (
    select 1
    from unnest(v_ids) as i (id)
    where not exists (select 1 from public.arrangements a where a.id = i.id and a.song_id = p_song_id)
  ) then
    raise exception 'arrangement of another song' using errcode = 'P0001', hint = 'image_arrangement';
  end if;
  delete from public.song_image_arrangements
  where image_id = p_image_id and arrangement_id <> all (v_ids);
  insert into public.song_image_arrangements (image_id, song_id, arrangement_id)
  select p_image_id, p_song_id, i.id from unnest(v_ids) as i (id)
  on conflict do nothing;
end;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.add_song_image(
  p_song_id uuid,
  p_name text,
  p_keys text[],
  p_arrangement_ids uuid[],
  p_max integer
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform 1 from public.songs where id = p_song_id for update;
  if not found then
    return null;
  end if;
  if (select count(*) from public.song_images where song_id = p_song_id) >= p_max then
    raise exception 'too many images' using errcode = 'P0001', hint = 'too_many_images';
  end if;
  insert into public.song_images (song_id, name, musical_keys)
  values (p_song_id, p_name, coalesce(p_keys, '{}'))
  returning id into v_id;
  perform public.set_song_image_arrangements(v_id, p_song_id, p_arrangement_ids);
  return v_id;
end;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.update_song_image(p_id uuid, p_name text, p_keys text[], p_arrangement_ids uuid[])
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_song_id uuid;
begin
  update public.song_images
  set name = p_name, musical_keys = coalesce(p_keys, '{}')
  where id = p_id
  returning song_id into v_song_id;
  if not found then
    return false;
  end if;
  perform public.set_song_image_arrangements(p_id, v_song_id, p_arrangement_ids);
  return true;
end;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.add_song_image_page(
  p_image_id uuid,
  p_path text,
  p_width integer,
  p_height integer,
  p_size_bytes integer,
  p_max integer
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_song_id uuid;
  v_count integer;
  v_last integer;
  v_id uuid;
begin
  select song_id into v_song_id from public.song_images where id = p_image_id for update;
  if not found then
    return null;
  end if;
  if p_path not like v_song_id::text || '/' || p_image_id::text || '/%' then
    raise exception 'file of another image' using errcode = 'P0001', hint = 'image_page_path';
  end if;
  select count(*), coalesce(max(position), 0) into v_count, v_last
  from public.song_image_pages
  where image_id = p_image_id;
  if v_count >= p_max then
    raise exception 'too many pages' using errcode = 'P0001', hint = 'too_many_image_pages';
  end if;
  delete from public.song_image_stray_files where path = p_path;
  insert into public.song_image_pages (image_id, position, path, width, height, size_bytes)
  values (p_image_id, v_last + 1, p_path, p_width, p_height, p_size_bytes)
  returning id into v_id;
  update public.song_images set updated_at = now() where id = p_image_id;
  return v_id;
end;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.move_song_image_pages(p_image_id uuid, p_page_ids uuid[])
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform 1 from public.song_images where id = p_image_id for update;
  if not found then
    return false;
  end if;
  if cardinality(coalesce(p_page_ids, '{}')) <> (select count(distinct p) from unnest(p_page_ids) as u (p))
    or (select count(*) from public.song_image_pages where image_id = p_image_id) <> cardinality(coalesce(p_page_ids, '{}'))
    or exists (
      select 1 from unnest(p_page_ids) as u (p)
      where not exists (select 1 from public.song_image_pages pg where pg.id = u.p and pg.image_id = p_image_id)
    )
  then
    raise exception 'not the pages of the image' using errcode = 'P0001', hint = 'image_pages';
  end if;
  update public.song_image_pages pg
  set position = u.position
  from unnest(p_page_ids) with ordinality as u (id, position)
  where pg.id = u.id;
  update public.song_images set updated_at = now() where id = p_image_id;
  return true;
end;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.song_image_pages_keep_stray_file()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Churchy: the row's own tenant (a cascade from a deleted church has no request tenant); when
  -- the church itself is being deleted, there is nothing to keep.
  begin
    insert into public.song_image_stray_files (tenant_id, path)
    values (old.tenant_id, old.path)
    on conflict (tenant_id, path) do nothing;
  exception when foreign_key_violation then
    null;
  end;
  return old;
end;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.keep_stray_file()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_path text := to_jsonb(old) ->> tg_argv[1];
begin
  if v_path is not null then
    -- Churchy: the row's own tenant; nothing to keep when the church itself is being deleted.
    begin
      insert into public.stray_files (tenant_id, bucket, path)
      values (old.tenant_id, tg_argv[0], v_path)
      on conflict (tenant_id, bucket, path) do nothing;
    exception when foreign_key_violation then
      null;
    end;
  end if;
  return null;
end;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.claim_stray_file()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_path text := to_jsonb(new) ->> tg_argv[1];
begin
  if v_path is not null then
    delete from public.stray_files where bucket = tg_argv[0] and path = v_path;
  end if;
  return null;
end;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.set_song_link_arrangements(p_link_id uuid, p_song_id uuid, p_arrangement_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ids uuid[] := array(select distinct unnest(coalesce(p_arrangement_ids, '{}')));
begin
  if exists (
    select 1
    from unnest(v_ids) as i (id)
    where not exists (select 1 from public.arrangements a where a.id = i.id and a.song_id = p_song_id)
  ) then
    raise exception 'arrangement of another song' using errcode = 'P0001', hint = 'link_arrangement';
  end if;
  delete from public.song_link_arrangements
  where link_id = p_link_id and arrangement_id <> all (v_ids);
  insert into public.song_link_arrangements (link_id, song_id, arrangement_id)
  select p_link_id, p_song_id, i.id from unnest(v_ids) as i (id)
  on conflict do nothing;
end;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.add_song_link(
  p_song_id uuid,
  p_name text,
  p_url text,
  p_keys text[],
  p_arrangement_ids uuid[],
  p_max integer
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform 1 from public.songs where id = p_song_id for update;
  if not found then
    return null;
  end if;
  if (select count(*) from public.song_links where song_id = p_song_id) >= p_max then
    raise exception 'too many links' using errcode = 'P0001', hint = 'too_many_links';
  end if;
  insert into public.song_links (song_id, name, url, musical_keys)
  values (p_song_id, p_name, p_url, coalesce(p_keys, '{}'))
  returning id into v_id;
  perform public.set_song_link_arrangements(v_id, p_song_id, p_arrangement_ids);
  return v_id;
end;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.update_song_link(p_id uuid, p_name text, p_url text, p_keys text[], p_arrangement_ids uuid[])
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_song_id uuid;
begin
  update public.song_links
  set name = p_name, url = p_url, musical_keys = coalesce(p_keys, '{}')
  where id = p_id
  returning song_id into v_song_id;
  if not found then
    return false;
  end if;
  perform public.set_song_link_arrangements(p_id, v_song_id, p_arrangement_ids);
  return true;
end;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.set_song_sound_file_arrangements(p_sound_file_id uuid, p_song_id uuid, p_arrangement_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ids uuid[] := array(select distinct unnest(coalesce(p_arrangement_ids, '{}')));
begin
  if exists (
    select 1
    from unnest(v_ids) as i (id)
    where not exists (select 1 from public.arrangements a where a.id = i.id and a.song_id = p_song_id)
  ) then
    raise exception 'arrangement of another song' using errcode = 'P0001', hint = 'sound_file_arrangement';
  end if;
  delete from public.song_sound_file_arrangements
  where sound_file_id = p_sound_file_id and arrangement_id <> all (v_ids);
  insert into public.song_sound_file_arrangements (sound_file_id, song_id, arrangement_id)
  select p_sound_file_id, p_song_id, i.id from unnest(v_ids) as i (id)
  on conflict do nothing;
end;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.add_song_sound_file(
  p_song_id uuid,
  p_name text,
  p_file_name text,
  p_path text,
  p_size_bytes integer,
  p_content_type text,
  p_keys text[],
  p_arrangement_ids uuid[],
  p_max integer
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform 1 from public.songs where id = p_song_id for update;
  if not found then
    return null;
  end if;
  delete from public.song_sound_file_uploads where path = p_path;
  if not found then
    raise exception 'unknown upload' using errcode = 'P0001', hint = 'sound_file_upload_missing';
  end if;
  if (select count(*) from public.song_sound_files where song_id = p_song_id) >= p_max then
    raise exception 'too many sound files' using errcode = 'P0001', hint = 'too_many_sound_files';
  end if;
  insert into public.song_sound_files (song_id, name, file_name, path, size_bytes, content_type, musical_keys)
  values (p_song_id, p_name, p_file_name, p_path, p_size_bytes, p_content_type, coalesce(p_keys, '{}'))
  returning id into v_id;
  perform public.set_song_sound_file_arrangements(v_id, p_song_id, p_arrangement_ids);
  return v_id;
end;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.update_song_sound_file(p_id uuid, p_name text, p_keys text[], p_arrangement_ids uuid[])
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_song_id uuid;
begin
  update public.song_sound_files
  set name = p_name, musical_keys = coalesce(p_keys, '{}')
  where id = p_id
  returning song_id into v_song_id;
  if not found then
    return false;
  end if;
  perform public.set_song_sound_file_arrangements(p_id, v_song_id, p_arrangement_ids);
  return true;
end;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.start_song_pdf_upload(p_user_id uuid, p_path text, p_max integer)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('public.song_pdf_uploads'), hashtext(p_user_id::text));
  if (
    select count(*) from public.song_pdf_uploads
    where user_id = p_user_id and created_at > now() - interval '2 hours'
  ) >= p_max then
    raise exception 'too many pdf uploads' using errcode = 'P0001', hint = 'too_many_pdf_uploads';
  end if;
  insert into public.song_pdf_uploads (path, user_id) values (p_path, p_user_id);
end;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.start_song_sound_file_upload(p_user_id uuid, p_path text, p_max integer)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('public.song_sound_file_uploads'), hashtext(p_user_id::text));
  if (
    select count(*) from public.song_sound_file_uploads
    where user_id = p_user_id and created_at > now() - interval '2 hours'
  ) >= p_max then
    raise exception 'too many sound file uploads' using errcode = 'P0001', hint = 'too_many_sound_file_uploads';
  end if;
  insert into public.song_sound_file_uploads (path, user_id) values (p_path, p_user_id);
end;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.prevent_song_id_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'the song of a row cannot change' using errcode = 'P0001', hint = 'song_id_immutable';
end;
$$;
--> statement-breakpoint
CREATE TRIGGER song_scores_set_updated_at BEFORE UPDATE ON public.song_scores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER song_pdfs_set_updated_at BEFORE UPDATE ON public.song_pdfs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER song_images_set_updated_at BEFORE UPDATE ON public.song_images
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER song_links_set_updated_at BEFORE UPDATE ON public.song_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER song_sound_files_set_updated_at BEFORE UPDATE ON public.song_sound_files
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER arrangements_prevent_song_id_update BEFORE UPDATE OF song_id ON public.arrangements
  FOR EACH ROW WHEN (new.song_id IS DISTINCT FROM old.song_id)
  EXECUTE FUNCTION public.prevent_song_id_update();
--> statement-breakpoint
CREATE TRIGGER song_pdfs_prevent_song_id_update BEFORE UPDATE OF song_id ON public.song_pdfs
  FOR EACH ROW WHEN (new.song_id IS DISTINCT FROM old.song_id)
  EXECUTE FUNCTION public.prevent_song_id_update();
--> statement-breakpoint
CREATE TRIGGER song_images_prevent_song_id_update BEFORE UPDATE OF song_id ON public.song_images
  FOR EACH ROW WHEN (new.song_id IS DISTINCT FROM old.song_id)
  EXECUTE FUNCTION public.prevent_song_id_update();
--> statement-breakpoint
CREATE TRIGGER song_links_prevent_song_id_update BEFORE UPDATE OF song_id ON public.song_links
  FOR EACH ROW WHEN (new.song_id IS DISTINCT FROM old.song_id)
  EXECUTE FUNCTION public.prevent_song_id_update();
--> statement-breakpoint
CREATE TRIGGER song_scores_prevent_song_id_update BEFORE UPDATE OF song_id ON public.song_scores
  FOR EACH ROW WHEN (new.song_id IS DISTINCT FROM old.song_id)
  EXECUTE FUNCTION public.prevent_song_id_update();
--> statement-breakpoint
CREATE TRIGGER song_sound_files_prevent_song_id_update BEFORE UPDATE OF song_id ON public.song_sound_files
  FOR EACH ROW WHEN (new.song_id IS DISTINCT FROM old.song_id)
  EXECUTE FUNCTION public.prevent_song_id_update();
--> statement-breakpoint
CREATE TRIGGER song_image_pages_keep_stray_file AFTER DELETE ON public.song_image_pages
  FOR EACH ROW EXECUTE FUNCTION public.song_image_pages_keep_stray_file();
--> statement-breakpoint
CREATE TRIGGER song_pdfs_keep_stray_file AFTER DELETE ON public.song_pdfs
  FOR EACH ROW EXECUTE FUNCTION public.keep_stray_file('pdfs', 'path');
--> statement-breakpoint
CREATE TRIGGER song_scores_keep_stray_file AFTER DELETE ON public.song_scores
  FOR EACH ROW EXECUTE FUNCTION public.keep_stray_file('scores', 'path');
--> statement-breakpoint
CREATE TRIGGER song_scores_keep_replaced_stray_file AFTER UPDATE OF path ON public.song_scores
  FOR EACH ROW WHEN (old.path IS DISTINCT FROM new.path)
  EXECUTE FUNCTION public.keep_stray_file('scores', 'path');
--> statement-breakpoint
CREATE TRIGGER song_scores_claim_stray_file AFTER INSERT OR UPDATE OF path ON public.song_scores
  FOR EACH ROW EXECUTE FUNCTION public.claim_stray_file('scores', 'path');
--> statement-breakpoint
CREATE TRIGGER song_sound_files_keep_stray_file AFTER DELETE ON public.song_sound_files
  FOR EACH ROW EXECUTE FUNCTION public.keep_stray_file('sound-files', 'path');

--> statement-breakpoint
-- AI song-rights research (moved here from phase 8: platform key ANTHROPIC_API_KEY, per-plan cap).
CREATE OR REPLACE FUNCTION public.close_crashed_song_rights_research(p_song_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.song_rights_proposals
  set status = 'failed', error = 'The research did not finish.', error_kind = 'temporary'
  where status = 'running'
    and created_at <= now() - interval '1 hour'
    and (p_song_id is null or song_id = p_song_id);
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.claim_song_for_rights_research(p_song_id uuid, p_provider text, p_model text)
returns table (proposal_id uuid, song_id uuid, title text, artist text, copyright text, songbook text, chordpro text)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.close_crashed_song_rights_research(p_song_id);
  return query
  with claimed as (
    insert into public.song_rights_proposals (song_id, provider, model)
    select s.id, p_provider, p_model from public.songs s where s.id = p_song_id
    on conflict (tenant_id, song_id) where status in ('running', 'pending') do nothing
    returning song_rights_proposals.id, song_rights_proposals.song_id
  )
  select claimed.id, s.id, s.title, s.artist, s.copyright, s.songbook, coalesce(a.chordpro, '')
  from claimed
  join public.songs s on s.id = claimed.song_id
  left join public.arrangements a on a.song_id = s.id and a.is_default;
end;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.claim_songs_for_rights_research_now(p_count integer, p_provider text, p_model text)
returns table (proposal_id uuid, song_id uuid, title text, artist text, copyright text, songbook text, chordpro text)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform pg_advisory_xact_lock(hashtext('claim_songs_for_rights_research'));
  perform public.close_crashed_song_rights_research(null);
  return query
  with candidates as (
    select c.id from public.songs_for_rights_research() c
    limit greatest(0, p_count)
  ),
  claimed as (
    insert into public.song_rights_proposals (song_id, provider, model)
    select candidates.id, p_provider, p_model from candidates
    on conflict (tenant_id, song_id) where status in ('running', 'pending') do nothing
    returning song_rights_proposals.id, song_rights_proposals.song_id
  )
  select claimed.id, s.id, s.title, s.artist, s.copyright, s.songbook, a.chordpro
  from claimed
  join public.songs s on s.id = claimed.song_id
  join public.arrangements a on a.song_id = s.id and a.is_default;
end;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.count_song_rights_researches_this_month()
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  -- Churchy: the AI researches of the church this calendar month (Europe/Budapest), for the
  -- per-plan cap (`musicResearchPerMonth`); uploaded local findings do not count.
  select count(*)::integer from public.song_rights_proposals p
  where p.provider <> 'local'
    and p.created_at >= (date_trunc('month', now() at time zone 'Europe/Budapest') at time zone 'Europe/Budapest');
$$;
