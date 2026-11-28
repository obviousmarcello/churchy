ALTER TABLE "song_rights_research_settings" DROP CONSTRAINT "song_rights_research_settings_enabled_check";--> statement-breakpoint
ALTER TABLE "song_rights_research_settings" ADD CONSTRAINT "song_rights_research_settings_enabled_check" CHECK (((NOT enabled) OR ((provider IS NOT NULL) AND (model IS NOT NULL))));
--> statement-breakpoint
-- With the platform key (phase 8c) the research needs no saved API key: switching it on needs a provider and a model.
-- Music merge phase 8c (nightly song-rights research). `claim_songs_for_rights_research` of Music Sheet DB:
-- marks at most `p_batch` songs `running` and returns them with the chart of their default arrangement.
-- Fewer when the nightly limit of the church (`song_rights_research_settings.nightly_limit`) is near. Two calls
-- at the same time never get the same song (the advisory lock, as in `claim_songs_for_rights_research_now`, and
-- the unique index on the open proposals). SECURITY INVOKER: the tenant comes from RLS; the job runs it per church.
CREATE OR REPLACE FUNCTION public.claim_songs_for_rights_research(p_batch integer, p_provider text, p_model text)
returns table (proposal_id uuid, song_id uuid, title text, artist text, copyright text, songbook text, chordpro text)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_limit integer;
  v_done integer;
begin
  perform pg_advisory_xact_lock(hashtext('claim_songs_for_rights_research'));
  -- A run that crashed: its songs can go again.
  perform public.close_crashed_song_rights_research(null);

  select nightly_limit into v_limit from public.song_rights_research_settings;
  select count(*) into v_done
  from public.song_rights_proposals
  where created_at > now() - interval '20 hours' and provider <> 'local';

  return query
  with candidates as (
    select c.id from public.songs_for_rights_research() c
    limit greatest(0, least(p_batch, coalesce(v_limit, 0) - v_done))
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
REVOKE ALL ON FUNCTION public.claim_songs_for_rights_research(integer, text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.claim_songs_for_rights_research(integer, text, text) TO churchy_app, churchy_music;
