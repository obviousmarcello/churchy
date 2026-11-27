CREATE TABLE "scripture_translations" (
	"tenant_id" uuid DEFAULT app.current_tenant_id() NOT NULL,
	"id" text NOT NULL,
	"language" text DEFAULT 'hu'::text NOT NULL,
	"name" text COLLATE "hu-HU-x-icu" NOT NULL,
	"short_name" text COLLATE "hu-HU-x-icu" NOT NULL,
	"notice" text,
	"source" text NOT NULL,
	"deuterocanon" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"source_links" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scripture_translations_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "scripture_translations_id_check" CHECK (((id ~ '^[a-z0-9]{1,30}$'::text) AND (id <> 'karoli1908'::text))),
	CONSTRAINT "scripture_translations_language_check" CHECK ((language = 'hu'::text)),
	CONSTRAINT "scripture_translations_name_check" CHECK (((char_length(btrim(name)) BETWEEN 1 AND 120) AND (char_length(btrim(short_name)) BETWEEN 1 AND 20))),
	CONSTRAINT "scripture_translations_notice_check" CHECK (((notice IS NULL) OR (char_length(notice) BETWEEN 1 AND 500))),
	CONSTRAINT "scripture_translations_source_check" CHECK ((source = ANY (ARRAY['pasted'::text, 'database'::text]))),
	CONSTRAINT "scripture_translations_source_links_check" CHECK (((source_links IS NULL) OR (jsonb_typeof(source_links) = 'object'::text)))
);
--> statement-breakpoint
ALTER TABLE "scripture_translations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app_config" DROP CONSTRAINT "app_config_scripture_ruf_check";--> statement-breakpoint
ALTER TABLE "scripture_books" ALTER COLUMN "tenant_id" SET DEFAULT app.current_tenant_id();--> statement-breakpoint
ALTER TABLE "scripture_verse_cache" ALTER COLUMN "tenant_id" SET DEFAULT app.current_tenant_id();--> statement-breakpoint
ALTER TABLE "scripture_translations" ADD CONSTRAINT "scripture_translations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scripture_translations_tenant_id_idx" ON "scripture_translations" USING btree ("tenant_id");--> statement-breakpoint
ALTER TABLE "scripture_books" ADD CONSTRAINT "scripture_books_translation_fkey" FOREIGN KEY ("tenant_id","translation") REFERENCES "public"."scripture_translations"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scripture_verse_cache" ADD CONSTRAINT "scripture_verse_cache_translation_fkey" FOREIGN KEY ("tenant_id","translation") REFERENCES "public"."scripture_translations"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_config" DROP COLUMN "scripture_ruf";
--> statement-breakpoint
-- Music merge phase 6a: RLS and grants of `scripture_translations`, and the tenant-aware cache function.
-- `scripture_books` / `scripture_verse_cache` keep 0007 (`tenant_isolation` for own rows, `catalog_read` for
-- the platform rows with tenant_id null; the platform rows are written by the migration owner / the import script).
ALTER TABLE "scripture_translations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "scripture_translations" TO churchy_app, churchy_music;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "scripture_translations" AS PERMISSIVE FOR ALL TO churchy_app, churchy_music
  USING (tenant_id = (SELECT app.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT app.current_tenant_id()));
--> statement-breakpoint
-- Puts the verses of one book of a "pasted" translation of the current tenant in its cache, e.g.
-- `[{"chapter": 3, "verse": 16, "text": "...", "chapter_end": false}]`. A verse that the cache has gets the new
-- text and 24 new hours; a chapter-end mark stays. Then it removes the verses older than 24 hours of the tenant,
-- and the oldest ones above the limits: `p_book_limit` for the book (less than half of it, from the model) and 331
-- for the tenant. The new verses never go out. SECURITY INVOKER: RLS (`tenant_isolation`) scopes every statement.
CREATE OR REPLACE FUNCTION public.put_scripture_cache_verses(p_translation text, p_book text, p_verses jsonb, p_book_limit integer)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_tenant uuid := app.current_tenant_id();
  v_count int := jsonb_array_length(p_verses);
  v_now timestamptz;
begin
  if v_tenant is null then
    raise exception 'no tenant' using errcode = '42501';
  end if;
  if v_count < 1 or v_count > least(331, p_book_limit) then
    raise exception 'too many verses for the cache' using errcode = '22023';
  end if;

  -- One paste after the other per tenant, so two pastes do not both go over the limits.
  perform pg_advisory_xact_lock(hashtext('scripture_verse_cache'), hashtext(v_tenant::text));
  -- After the lock, not the start of the transaction (`now()`): the new verses never go out.
  v_now := clock_timestamp();

  insert into public.scripture_verse_cache as c (tenant_id, translation, book, chapter, verse, text, chapter_end, cached_at)
  select v_tenant, p_translation, p_book, v.chapter, v.verse, v.text, coalesce(v.chapter_end, false), v_now
  from jsonb_to_recordset(p_verses) as v (chapter int, verse int, text text, chapter_end boolean)
  on conflict (tenant_id, translation, book, chapter, verse) do update
    set text = excluded.text, chapter_end = c.chapter_end or excluded.chapter_end, cached_at = excluded.cached_at;

  delete from public.scripture_verse_cache where tenant_id = v_tenant and cached_at <= v_now - interval '24 hours';

  delete from public.scripture_verse_cache c
  using (
    select translation, book, chapter, verse
    from public.scripture_verse_cache
    where tenant_id = v_tenant and translation = p_translation and book = p_book
    order by cached_at desc, chapter desc, verse desc
    offset p_book_limit
  ) old
  where c.tenant_id = v_tenant and (c.translation, c.book, c.chapter, c.verse) = (old.translation, old.book, old.chapter, old.verse);

  delete from public.scripture_verse_cache c
  using (
    select translation, book, chapter, verse
    from public.scripture_verse_cache
    where tenant_id = v_tenant
    order by cached_at desc, translation, book, chapter desc, verse desc
    offset 331
  ) old
  where c.tenant_id = v_tenant and (c.translation, c.book, c.chapter, c.verse) = (old.translation, old.book, old.chapter, old.verse);
end;
$function$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.put_scripture_cache_verses(text, text, jsonb, integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.put_scripture_cache_verses(text, text, jsonb, integer) TO churchy_app, churchy_music;
