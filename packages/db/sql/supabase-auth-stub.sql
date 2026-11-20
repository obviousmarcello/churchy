-- Minimal stand-in for the parts of Supabase Auth the Churchy schema depends on, for plain
-- Postgres only (unit/integration tests, CI). NEVER apply this to a Supabase project: there
-- `auth.users` is owned and managed by Supabase Auth. The CLI refuses to apply it when the
-- `auth` schema already exists or APP_ENV is staging/production.
--
-- Idempotent: the DB tests re-apply it on every run. It also recreates Supabase's PostgREST
-- roles `anon` / `authenticated` with Supabase's default grants on `public` (ALL on new tables),
-- so the tests prove that migration 0003_rls revokes them. The default grants are set only when
-- the stub is applied to a database for the first time, so a re-run never undoes 0003's revoke.
DO $$
DECLARE
  fresh boolean := to_regclass('auth.users') IS NULL;
BEGIN
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE TABLE IF NOT EXISTS auth.users (
    id uuid PRIMARY KEY,
    email text,
    aud text,
    role text,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  -- Roles are cluster-wide; they may exist from another database of the same cluster.
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF fresh THEN
    GRANT USAGE ON SCHEMA public TO anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;
  END IF;
END
$$;
