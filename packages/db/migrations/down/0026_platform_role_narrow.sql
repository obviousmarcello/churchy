-- Down of 0026_platform_role_narrow: restores the 0025 grants and policies on these two tables.
GRANT SELECT, INSERT ON TABLE "subscriptions" TO churchy_platform;
--> statement-breakpoint
CREATE POLICY "platform_read" ON "subscriptions" AS PERMISSIVE FOR SELECT TO churchy_platform
  USING (true);
--> statement-breakpoint
CREATE POLICY "platform_insert" ON "subscriptions" AS PERMISSIVE FOR INSERT TO churchy_platform
  WITH CHECK (plan_key = 'ingyenes' AND deal_id IS NULL AND EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = tenant_id AND t.launched_at IS NULL AND t.created_at >= now() - interval '10 minutes'));
--> statement-breakpoint
GRANT INSERT ON TABLE "billing_accounts" TO churchy_platform;
--> statement-breakpoint
CREATE POLICY "platform_insert" ON "billing_accounts" AS PERMISSIVE FOR INSERT TO churchy_platform
  WITH CHECK (owner_type = 'tenant' AND EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = owner_id AND t.launched_at IS NULL AND t.created_at >= now() - interval '10 minutes'));
