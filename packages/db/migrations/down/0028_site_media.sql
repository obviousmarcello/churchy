-- Down of 0028_site_media: storage policies/grants (where the storage schema exists), the grants and the role.
-- The bucket and its objects are NOT deleted (data): empty and remove it in Storage if wanted.
DO $$
BEGIN
  IF pg_catalog.to_regclass('storage.objects') IS NOT NULL AND pg_catalog.to_regclass('storage.buckets') IS NOT NULL THEN
    DROP POLICY IF EXISTS site_media_buckets_read ON storage.buckets;
    DROP POLICY IF EXISTS site_media_delete ON storage.objects;
    DROP POLICY IF EXISTS site_media_insert ON storage.objects;
    DROP POLICY IF EXISTS site_media_select ON storage.objects;
    REVOKE ALL ON storage.buckets FROM churchy_site_media;
    REVOKE ALL ON storage.objects FROM churchy_site_media;
    REVOKE USAGE ON SCHEMA storage FROM churchy_site_media;
  END IF;
END
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION app.current_tenant_id() FROM churchy_site_media;
--> statement-breakpoint
REVOKE USAGE ON SCHEMA app FROM churchy_site_media;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticator') THEN
    REVOKE churchy_site_media FROM authenticator;
  END IF;
END
$$;
--> statement-breakpoint
DROP ROLE IF EXISTS churchy_site_media;
