-- S1 platform role, narrowed (forward migration after 0025, already applied live): church signup no
-- longer creates a billing account or subscription (the plan lives in tenants.plan_key; billing rows
-- come with D-88 when a paid plan is chosen). Removes the INSERT grants/policies on billing_accounts
-- and subscriptions, and the then-unused SELECT on subscriptions.
DROP POLICY IF EXISTS "platform_insert" ON "subscriptions";
--> statement-breakpoint
DROP POLICY IF EXISTS "platform_read" ON "subscriptions";
--> statement-breakpoint
DROP POLICY IF EXISTS "platform_insert" ON "billing_accounts";
--> statement-breakpoint
REVOKE ALL ON TABLE "subscriptions", "billing_accounts" FROM churchy_platform;
