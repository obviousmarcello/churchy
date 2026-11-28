DROP FUNCTION IF EXISTS public.put_scripture_cache_verses(text, text, jsonb, integer);
--> statement-breakpoint
ALTER TABLE "scripture_verse_cache" DROP CONSTRAINT IF EXISTS "scripture_verse_cache_translation_fkey";
--> statement-breakpoint
ALTER TABLE "scripture_books" DROP CONSTRAINT IF EXISTS "scripture_books_translation_fkey";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation" ON "scripture_translations";
--> statement-breakpoint
REVOKE ALL ON TABLE "scripture_translations" FROM churchy_app, churchy_music;
--> statement-breakpoint
ALTER TABLE "scripture_translations" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP TABLE IF EXISTS "scripture_translations";
--> statement-breakpoint
ALTER TABLE "app_config" ADD COLUMN "scripture_ruf" text DEFAULT 'pasted'::text NOT NULL;
--> statement-breakpoint
ALTER TABLE "app_config" ADD CONSTRAINT "app_config_scripture_ruf_check" CHECK ((scripture_ruf = ANY (ARRAY['pasted'::text, 'permit'::text, 'off'::text])));
--> statement-breakpoint
ALTER TABLE "scripture_verse_cache" ALTER COLUMN "tenant_id" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "scripture_books" ALTER COLUMN "tenant_id" DROP DEFAULT;
