-- Music merge phase 3 (chord sheet): the one trigger function of the sheet's own tables, tenant-aware.
-- SECURITY INVOKER with an empty search_path: RLS (`tenant_isolation`) scopes the lookups to the
-- tenant of the annotation. The user's capo, key, layout, zoom and marks need no function: the
-- models read and write their tables directly. docs/music-merge/FUNCTIONS.md lists it;
-- down/0010_music_sheet.sql drops it.

-- A slot-only annotation must belong to the song in that slot. Forks keep the song, and setlist
-- updates never change a slot's song, so this stays true.
CREATE OR REPLACE FUNCTION public.check_annotation_setlist_item()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.setlist_item_id is not null and not exists (
    select 1
    from public.setlist_items si
    join public.arrangements a on a.id = si.arrangement_id
    where si.id = new.setlist_item_id and a.song_id = new.song_id
  ) then
    raise exception 'setlist item does not belong to this song' using errcode = 'P0001', hint = 'annotation_setlist_item';
  end if;
  return new;
end;
$$;
--> statement-breakpoint
CREATE TRIGGER annotations_check_setlist_item
BEFORE INSERT OR UPDATE OF song_id, setlist_item_id ON public.annotations
FOR EACH ROW EXECUTE FUNCTION public.check_annotation_setlist_item();
