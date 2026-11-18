-- Minimal stand-in for the parts of Supabase Auth the Churchy schema depends on, for plain
-- Postgres only (unit/integration tests, CI). NEVER apply this to a Supabase project: there
-- `auth.users` is owned and managed by Supabase Auth. The CLI refuses to apply it when the
-- `auth` schema already exists or APP_ENV is staging/production.
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  email text,
  aud text,
  role text,
  created_at timestamptz NOT NULL DEFAULT now()
);
