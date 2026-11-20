-- Down of 0000_extensions: drops the helper functions. The extensions themselves (unaccent,
-- btree_gist) and the `extensions` schema are left in place on purpose: on Supabase they are
-- platform-managed and may be used by other objects; `CREATE EXTENSION IF NOT EXISTS` makes the
-- next `up` idempotent.
DROP FUNCTION IF EXISTS public.booking_blocked_period(timestamptz, timestamptz, integer, integer);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.hu_join(text[]);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.hu_tsquery(text);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.hu_tsvector(text);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.hu_unaccent(text);
