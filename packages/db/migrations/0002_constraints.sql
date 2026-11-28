-- D-02: constraints Drizzle cannot express. Hand-written (`drizzle-kit generate --custom`);
-- the down migration is migrations/down/0002_constraints.sql.

-- NFR-15 / ADR-10: no two pending/approved bookings of a room may overlap, including buffers.
-- The application maps SQLSTATE 23P01 to a structured conflict (SDD §23.1).
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_no_overlap"
  EXCLUDE USING gist ("room_id" WITH =, "blocked_period" WITH &&)
  WHERE ("status" IN ('pending', 'approved'));
--> statement-breakpoint
-- Supabase Auth owns `auth.users`; every app profile is keyed on an auth user id and disappears
-- with it. On a plain Postgres (tests, CI) `sql/supabase-auth-stub.sql` provides the table.
DO $$
BEGIN
  IF to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'auth.users is missing: run against Supabase, or apply packages/db/sql/supabase-auth-stub.sql first';
  END IF;
END
$$;
--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_auth_users_fkey"
  FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
