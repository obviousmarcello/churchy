-- Down of 0002_constraints.
ALTER TABLE "profiles" DROP CONSTRAINT IF EXISTS "profiles_id_auth_users_fkey";
--> statement-breakpoint
ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "bookings_no_overlap";
