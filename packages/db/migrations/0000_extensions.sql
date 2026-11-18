-- D-02: extensions, Hungarian collation/search helpers and immutable SQL helpers used by
-- generated columns. Hand-written (`drizzle-kit generate --custom`); the down migration is
-- migrations/down/0000_extensions.sql.
--
-- Supabase installs extensions into the `extensions` schema; a plain Postgres gets the same
-- layout so the SQL below is identical everywhere.
CREATE SCHEMA IF NOT EXISTS extensions;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
--> statement-breakpoint
-- Exclusion constraint on bookings (room_id WITH =, blocked_period WITH &&), SDD §23.1.
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
--> statement-breakpoint
DO $$
BEGIN
  -- L-03: text sort columns use the ICU collation "hu-HU-x-icu" (predefined on ICU builds,
  -- including Supabase Postgres 17).
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_collation WHERE collname = 'hu-HU-x-icu') THEN
    RAISE EXCEPTION 'ICU collation "hu-HU-x-icu" is missing: Postgres must be built with ICU';
  END IF;
  -- L-09: built-in snowball configuration for Hungarian.
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_ts_config WHERE cfgname = 'hungarian') THEN
    RAISE EXCEPTION 'Text search configuration "hungarian" is missing';
  END IF;
END
$$;
--> statement-breakpoint
-- `unaccent()` is only STABLE, so it cannot be used in generated columns or index expressions.
-- This wrapper pins the dictionary and is IMMUTABLE. It is created dynamically because the
-- extension may already live in another schema (e.g. `public`) on an existing database.
DO $do$
DECLARE
  ext_schema text;
BEGIN
  SELECT n.nspname INTO ext_schema
  FROM pg_catalog.pg_extension e JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'unaccent';
  EXECUTE format(
    $f$CREATE OR REPLACE FUNCTION public.hu_unaccent(input text) RETURNS text
       LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT SET search_path = ''
       AS $body$ SELECT %1$I.unaccent('%1$I.unaccent'::regdictionary, input) $body$$f$,
    ext_schema);
END
$do$;
--> statement-breakpoint
-- Accent-insensitive Hungarian search vector (SDD §8.2: to_tsvector('hungarian', unaccent(...))).
-- Null input yields an empty vector so concatenations in generated columns never become null.
CREATE OR REPLACE FUNCTION public.hu_tsvector(input text) RETURNS tsvector
  LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = ''
  AS $$ SELECT pg_catalog.to_tsvector('pg_catalog.hungarian'::regconfig, public.hu_unaccent(coalesce(input, ''))) $$;
--> statement-breakpoint
-- Matching query parser: `ujev` finds `újév`, `Újévi`, … (web-search syntax).
CREATE OR REPLACE FUNCTION public.hu_tsquery(input text) RETURNS tsquery
  LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = ''
  AS $$ SELECT pg_catalog.websearch_to_tsquery('pg_catalog.hungarian'::regconfig, public.hu_unaccent(coalesce(input, ''))) $$;
--> statement-breakpoint
-- array_to_string() is STABLE in general; for text[] it is immutable.
CREATE OR REPLACE FUNCTION public.hu_join(input text[]) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = ''
  AS $$ SELECT coalesce(pg_catalog.array_to_string(input, ' '), '') $$;
--> statement-breakpoint
-- Blocked time of a booking incl. set-up/clean-up buffers, half-open. Adding whole minutes to a
-- timestamptz does not depend on the session time zone, so IMMUTABLE is correct here.
CREATE OR REPLACE FUNCTION public.booking_blocked_period(
  starts_at timestamptz, ends_at timestamptz, buffer_before_min integer, buffer_after_min integer
) RETURNS tstzrange
  LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = ''
  AS $$ SELECT pg_catalog.tstzrange(
    starts_at - pg_catalog.make_interval(mins => buffer_before_min),
    ends_at + pg_catalog.make_interval(mins => buffer_after_min),
    '[)') $$;
