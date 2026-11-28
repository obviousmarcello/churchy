-- Supabase grants EXECUTE on new public functions to anon/authenticated/service_role through default
-- privileges (REVOKE ... FROM PUBLIC does not remove those). Churchy uses no PostgREST for these:
-- share_song_rights() is a trigger function, notify_event() is called by churchy_app / churchy_music.
-- No-op on plain Postgres (the roles may not exist there).
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION public.share_song_rights() FROM %I', r);
      EXECUTE format('REVOKE ALL ON FUNCTION public.notify_event(uuid, text) FROM %I', r);
    END IF;
  END LOOP;
END $$;
