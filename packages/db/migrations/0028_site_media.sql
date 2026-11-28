-- Site builder media sink (D-34 follow-up, SDD ADR-21): images of an applied draft are uploaded to
-- the private Storage bucket `site-media` with a server-minted, tenant-scoped JWT whose role claim
-- is `churchy_site_media` (like the music tenant token, apps/web/server/music/tenant-token.ts).
-- Hand-written (`drizzle-kit generate --custom`); the down migration is migrations/down/0028_site_media.sql.
--   * churchy_site_media: NOLOGIN, NOINHERIT, no SUPERUSER/BYPASSRLS, NO grant on any public table.
--     Granted to Supabase's `authenticator` (when it exists) so Storage can switch to it.
--   * storage.objects: SELECT/INSERT/DELETE (no UPDATE: an object is never overwritten) only for
--     bucket `site-media`, key `t/<claim tenant>/media/<uuid>.webp`. storage.buckets: SELECT on that bucket.
--   * The storage part runs only where the `storage` schema exists (Supabase); plain Postgres (CI,
--     the local music database) gets the role and nothing else. The bucket is created here too
--     (private, 10 MB, image/webp only) and is idempotent.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'churchy_site_media') THEN
    CREATE ROLE churchy_site_media NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  ELSE
    ALTER ROLE churchy_site_media NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticator') THEN
    GRANT churchy_site_media TO authenticator;
  END IF;
END
$$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA app TO churchy_site_media;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.current_tenant_id() TO churchy_site_media;
--> statement-breakpoint
DO $$
BEGIN
  IF pg_catalog.to_regclass('storage.objects') IS NOT NULL AND pg_catalog.to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      VALUES ('site-media', 'site-media', false, 10485760, ARRAY['image/webp'])
      ON CONFLICT (id) DO NOTHING;
    GRANT USAGE ON SCHEMA storage TO churchy_site_media;
    GRANT SELECT, INSERT, DELETE ON storage.objects TO churchy_site_media;
    GRANT SELECT ON storage.buckets TO churchy_site_media;
    CREATE POLICY site_media_select ON storage.objects AS PERMISSIVE FOR SELECT TO churchy_site_media
      USING (bucket_id = 'site-media'
        AND (storage.foldername(name))[1] = 't'
        AND (storage.foldername(name))[2] = (SELECT app.current_tenant_id())::text
        AND (storage.foldername(name))[3] = 'media'
        AND name ~ '^t/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/media/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$');
    CREATE POLICY site_media_insert ON storage.objects AS PERMISSIVE FOR INSERT TO churchy_site_media
      WITH CHECK (bucket_id = 'site-media'
        AND (storage.foldername(name))[1] = 't'
        AND (storage.foldername(name))[2] = (SELECT app.current_tenant_id())::text
        AND (storage.foldername(name))[3] = 'media'
        AND name ~ '^t/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/media/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$');
    CREATE POLICY site_media_delete ON storage.objects AS PERMISSIVE FOR DELETE TO churchy_site_media
      USING (bucket_id = 'site-media'
        AND (storage.foldername(name))[1] = 't'
        AND (storage.foldername(name))[2] = (SELECT app.current_tenant_id())::text
        AND (storage.foldername(name))[3] = 'media'
        AND name ~ '^t/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/media/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$');
    CREATE POLICY site_media_buckets_read ON storage.buckets AS PERMISSIVE FOR SELECT TO churchy_site_media
      USING (id = 'site-media');
  END IF;
END
$$;
