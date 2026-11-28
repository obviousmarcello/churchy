-- Down of 0001_schema: drops every table and enum created by 0001.
-- Generated from the Drizzle schema; a DB test asserts that nothing of the schema survives.
DROP TABLE IF EXISTS "absences" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "announcements" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "arrangements" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "assignments" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "attachments" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "audit_log" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "availability_blocks" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "billing_accounts" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "booking_conflicts" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "booking_series" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "bookings" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "calendars" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "deals" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "domains" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "events" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "form_definitions" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "hr_approvals" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "hr_categories" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "hr_ticket_messages" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "hr_tickets" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "hymnals" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "invoices" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "leave_entitlements" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "locations" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "media" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "memberships" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "notification_prefs" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "notifications" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "org_delegations" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "org_links" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "org_memberships" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "organizations" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "pages" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "pastoral_requests" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "payment_events" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "people" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "plan_comments" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "plan_items" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "plan_templates" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "plans" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "posts" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "profiles" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "redirects" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "rooms" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "schedule_periods" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "service_exceptions" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "service_occurrences" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "service_plans" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "service_room_blocks" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "service_rules" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "song_hymnal_refs" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "songs" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "staff_profiles" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "subscriptions" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "team_members" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "team_positions" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "teams" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "tenants" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "workday_calendar" CASCADE;
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."absence_status";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."assignment_status";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."attachment_kind";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."attachment_owner_type";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."billing_owner_type";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."booking_source";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."booking_status";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."calendar_kind";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."contact_visibility";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."denomination";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."employer";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."employment_type";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."event_status";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."event_visibility";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."hr_decision";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."hr_ticket_status";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."hr_who_can_submit";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."invoice_status";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."location_kind";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."media_kind";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."media_visibility";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."notification_channel";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."notification_kind";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."occurrence_status";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."org_link_status";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."org_role";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."organization_kind";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."payment_method";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."plan_item_type";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."plan_key";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."plan_kind";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."plan_status";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."publish_status";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."request_status";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."room_kind";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."service_exception_kind";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."song_licence";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."staff_group";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."subscription_period";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."subscription_status";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."team_kind";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."tenant_role";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."tenant_status";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."tls_status";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."workday_kind";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."workspace_role";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."ws_tier";
