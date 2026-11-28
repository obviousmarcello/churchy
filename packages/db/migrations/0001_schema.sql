CREATE TYPE "public"."absence_status" AS ENUM('requested', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."assignment_status" AS ENUM('requested', 'accepted', 'declined', 'swap_requested', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."attachment_kind" AS ENUM('sheet_music', 'chord_chart', 'lyrics', 'audio', 'musicxml', 'image', 'link', 'other');--> statement-breakpoint
CREATE TYPE "public"."attachment_owner_type" AS ENUM('song', 'arrangement', 'plan', 'plan_item');--> statement-breakpoint
CREATE TYPE "public"."billing_owner_type" AS ENUM('tenant', 'organization');--> statement-breakpoint
CREATE TYPE "public"."booking_source" AS ENUM('user', 'service', 'external');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('pending', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."calendar_kind" AS ENUM('shared', 'team', 'personal', 'absence');--> statement-breakpoint
CREATE TYPE "public"."contact_visibility" AS ENUM('public', 'workspace', 'team', 'private');--> statement-breakpoint
CREATE TYPE "public"."denomination" AS ENUM('rk', 'gk', 'ref', 'ev', 'bapt', 'unit', 'general');--> statement-breakpoint
CREATE TYPE "public"."employer" AS ENUM('parish', 'org');--> statement-breakpoint
CREATE TYPE "public"."employment_type" AS ENUM('munkaviszony', 'egyhazi_szolgalati', 'megbizasi', 'onkentes');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('draft', 'published', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."event_visibility" AS ENUM('private', 'team', 'staff', 'public');--> statement-breakpoint
CREATE TYPE "public"."hr_decision" AS ENUM('approved', 'rejected', 'delegated');--> statement-breakpoint
CREATE TYPE "public"."hr_ticket_status" AS ENUM('uj', 'folyamatban', 'jovahagyasra_var', 'jovahagyva', 'elutasitva', 'lezart');--> statement-breakpoint
CREATE TYPE "public"."hr_who_can_submit" AS ENUM('employees', 'volunteers', 'all');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('proforma', 'issued', 'paid', 'void');--> statement-breakpoint
CREATE TYPE "public"."location_kind" AS ENUM('templom', 'kapolna', 'filia', 'egyeb');--> statement-breakpoint
CREATE TYPE "public"."media_kind" AS ENUM('image', 'pdf', 'audio', 'other');--> statement-breakpoint
CREATE TYPE "public"."media_visibility" AS ENUM('public', 'private');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('in_app', 'email', 'push');--> statement-breakpoint
CREATE TYPE "public"."notification_kind" AS ENUM('assignmentRequest', 'assignmentReminder', 'swapRequest', 'planReview', 'planApproved', 'planChanged', 'occurrenceMoved', 'mention', 'bookingRequested', 'bookingDecided', 'bookingConflict', 'hrTicketUpdate', 'eventInvitation', 'eventReminder', 'facilityDailyList');--> statement-breakpoint
CREATE TYPE "public"."occurrence_status" AS ENUM('scheduled', 'cancelled', 'moved');--> statement-breakpoint
CREATE TYPE "public"."org_link_status" AS ENUM('requested', 'active', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."org_role" AS ENUM('orgHrAdmin', 'orgHrHandler', 'orgConfidentialHandler');--> statement-breakpoint
CREATE TYPE "public"."organization_kind" AS ENUM('egyhazmegye', 'egyhazkerulet', 'egyeb');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('card', 'transfer');--> statement-breakpoint
CREATE TYPE "public"."plan_item_type" AS ENUM('song', 'liturgy', 'reading', 'prayer', 'sermon', 'announcement', 'other');--> statement-breakpoint
CREATE TYPE "public"."plan_key" AS ENUM('ingyenes', 'teljes', 'ws_s50', 'ws_m150', 'ws_l300');--> statement-breakpoint
CREATE TYPE "public"."plan_kind" AS ENUM('website', 'workspace');--> statement-breakpoint
CREATE TYPE "public"."plan_status" AS ENUM('draft', 'in_review', 'approved', 'locked');--> statement-breakpoint
CREATE TYPE "public"."publish_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('uj', 'folyamatban', 'lezart');--> statement-breakpoint
CREATE TYPE "public"."room_kind" AS ENUM('room', 'resource');--> statement-breakpoint
CREATE TYPE "public"."service_exception_kind" AS ENUM('cancel', 'modify', 'add');--> statement-breakpoint
CREATE TYPE "public"."song_licence" AS ENUM('public_domain', 'licensed', 'permission', 'own', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."staff_group" AS ENUM('clergy', 'staff', 'council', 'volunteer');--> statement-breakpoint
CREATE TYPE "public"."subscription_period" AS ENUM('monthly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('trialing', 'active', 'past_due', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."team_kind" AS ENUM('music', 'liturgy', 'tech', 'facility', 'youth', 'other');--> statement-breakpoint
CREATE TYPE "public"."tenant_role" AS ENUM('owner', 'admin', 'editor', 'office', 'groupLeader');--> statement-breakpoint
CREATE TYPE "public"."tenant_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."tls_status" AS ENUM('pending', 'issued', 'failed');--> statement-breakpoint
CREATE TYPE "public"."workday_kind" AS ENUM('holiday', 'swapped_workday', 'swapped_restday');--> statement-breakpoint
CREATE TYPE "public"."workspace_role" AS ENUM('leader', 'employee', 'volunteer', 'teamLeader', 'musicLeader', 'roomManager', 'hrHandler', 'confidentialHandler');--> statement-breakpoint
CREATE TYPE "public"."ws_tier" AS ENUM('none', 's50', 'm150', 'l300');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"actor_user_id" uuid,
	"actor_org_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"diff" jsonb,
	"ip_hash" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "billing_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_type" "billing_owner_type" NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text COLLATE "hu-HU-x-icu" NOT NULL,
	"tax_number" text,
	"address" jsonb NOT NULL,
	"email" text NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"barion_token_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"plan_keys" "plan_key"[] NOT NULL,
	"parish_limit" integer NOT NULL,
	"price_terms" jsonb NOT NULL,
	"valid_from" date NOT NULL,
	"valid_to" date,
	CONSTRAINT "deals_valid_range_check" CHECK ("deals"."valid_to" is null or "deals"."valid_to" >= "deals"."valid_from"),
	CONSTRAINT "deals_parish_limit_check" CHECK ("deals"."parish_limit" > 0)
);
--> statement-breakpoint
ALTER TABLE "deals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"hostname" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone,
	"tls_status" "tls_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "domains_tenant_id_id_key" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "domains" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"billing_account_id" uuid NOT NULL,
	"provider_invoice_id" text,
	"number" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'HUF' NOT NULL,
	"status" "invoice_status" NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"pdf_url" text,
	CONSTRAINT "invoices_number_unique" UNIQUE("number"),
	CONSTRAINT "invoices_currency_check" CHECK ("invoices"."currency" = 'HUF'),
	CONSTRAINT "invoices_amount_check" CHECK ("invoices"."amount" >= 0)
);
--> statement-breakpoint
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "memberships" (
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "tenant_role",
	"group_ids" uuid[] DEFAULT '{}' NOT NULL,
	"ws_roles" "workspace_role"[] DEFAULT '{}' NOT NULL,
	"team_ids" uuid[] DEFAULT '{}' NOT NULL,
	"room_ids" uuid[] DEFAULT '{}' NOT NULL,
	"hr_category_ids" uuid[] DEFAULT '{}' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"invited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_tenant_id_user_id_pk" PRIMARY KEY("tenant_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "org_delegations" (
	"org_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"hr_category_key" text NOT NULL,
	CONSTRAINT "org_delegations_org_id_tenant_id_hr_category_key_pk" PRIMARY KEY("org_id","tenant_id","hr_category_key")
);
--> statement-breakpoint
ALTER TABLE "org_delegations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "org_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"status" "org_link_status" DEFAULT 'requested' NOT NULL,
	"requested_by" uuid NOT NULL,
	"approved_by_parish" uuid,
	"approved_by_org" uuid,
	"linked_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "org_links_tenant_id_id_key" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "org_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "org_memberships" (
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"roles" "org_role"[] NOT NULL,
	"category_scopes" text[],
	"parish_scopes" uuid[],
	CONSTRAINT "org_memberships_org_id_user_id_pk" PRIMARY KEY("org_id","user_id"),
	CONSTRAINT "org_memberships_roles_check" CHECK (cardinality("org_memberships"."roles") > 0)
);
--> statement-breakpoint
ALTER TABLE "org_memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "organization_kind" NOT NULL,
	"name" text COLLATE "hu-HU-x-icu" NOT NULL,
	"slug" text NOT NULL,
	"denomination" "denomination" NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"kind" text NOT NULL,
	"payload_hash" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "plans" (
	"key" "plan_key" PRIMARY KEY NOT NULL,
	"name" text COLLATE "hu-HU-x-icu" NOT NULL,
	"kind" "plan_kind" NOT NULL,
	"price_monthly" integer NOT NULL,
	"price_yearly" integer NOT NULL,
	"entitlements" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text COLLATE "hu-HU-x-icu" NOT NULL,
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "redirects" (
	"tenant_id" uuid NOT NULL,
	"from_path" text NOT NULL,
	"to_path" text NOT NULL,
	"code" smallint DEFAULT 301 NOT NULL,
	CONSTRAINT "redirects_tenant_id_from_path_pk" PRIMARY KEY("tenant_id","from_path"),
	CONSTRAINT "redirects_code_check" CHECK ("redirects"."code" in (301, 302))
);
--> statement-breakpoint
ALTER TABLE "redirects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"billing_account_id" uuid NOT NULL,
	"plan_key" "plan_key" NOT NULL,
	"tenant_id" uuid,
	"quantity" integer DEFAULT 1 NOT NULL,
	"period" "subscription_period" NOT NULL,
	"status" "subscription_status" NOT NULL,
	"current_period_end" timestamp with time zone NOT NULL,
	"deal_id" uuid,
	CONSTRAINT "subscriptions_quantity_check" CHECK ("subscriptions"."quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text COLLATE "hu-HU-x-icu" NOT NULL,
	"denomination" "denomination" NOT NULL,
	"status" "tenant_status" DEFAULT 'active' NOT NULL,
	"site_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"plan_key" "plan_key" DEFAULT 'ingyenes' NOT NULL,
	"ws_tier" "ws_tier" DEFAULT 'none' NOT NULL,
	"organization_id" uuid,
	"launched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"week_sunday" date NOT NULL,
	"body" jsonb,
	"pdf_media_id" uuid,
	"status" "publish_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "announcements_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "announcements_tenant_id_week_sunday_key" UNIQUE("tenant_id","week_sunday"),
	CONSTRAINT "announcements_sunday_check" CHECK (extract(isodow from "announcements"."week_sunday") = 7),
	CONSTRAINT "announcements_content_check" CHECK ("announcements"."body" is not null or "announcements"."pdf_media_id" is not null)
);
--> statement-breakpoint
ALTER TABLE "announcements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "form_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"title" text COLLATE "hu-HU-x-icu" NOT NULL,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notify_emails" text[] DEFAULT '{}' NOT NULL,
	"confirmation_text" text DEFAULT '' NOT NULL,
	"retention_days" integer DEFAULT 365 NOT NULL,
	"reference_prefix" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "form_definitions_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "form_definitions_tenant_id_key_key" UNIQUE("tenant_id","key"),
	CONSTRAINT "form_definitions_retention_check" CHECK ("form_definitions"."retention_days" > 0)
);
--> statement-breakpoint
ALTER TABLE "form_definitions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text COLLATE "hu-HU-x-icu" NOT NULL,
	"slug" text NOT NULL,
	"kind" "location_kind" NOT NULL,
	"address" jsonb,
	"geo" "point",
	"opening_hours" jsonb DEFAULT '{"weekly":[],"exceptions":[]}'::jsonb NOT NULL,
	"accessibility" jsonb NOT NULL,
	"photo_media_id" uuid,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "locations_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "locations_tenant_id_slug_key" UNIQUE("tenant_id","slug")
);
--> statement-breakpoint
ALTER TABLE "locations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" "media_kind" NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"storage_key" text NOT NULL,
	"variants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"width" integer,
	"height" integer,
	"bytes" integer NOT NULL,
	"alt" text,
	"decorative" boolean DEFAULT false NOT NULL,
	"caption" text,
	"people_consent" boolean DEFAULT false NOT NULL,
	"visibility" "media_visibility" DEFAULT 'public' NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "media_bytes_check" CHECK ("media"."bytes" >= 0)
);
--> statement-breakpoint
ALTER TABLE "media" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text COLLATE "hu-HU-x-icu" NOT NULL,
	"blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"parent_id" uuid,
	"rite_key" text,
	"seo" jsonb DEFAULT '{"title":null,"description":null,"ogImageMediaId":null}'::jsonb NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"status" "publish_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pages_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "pages_tenant_id_slug_key" UNIQUE("tenant_id","slug")
);
--> statement-breakpoint
ALTER TABLE "pages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pastoral_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"form_id" uuid NOT NULL,
	"form_key" text NOT NULL,
	"reference" text NOT NULL,
	"data_enc" "bytea" NOT NULL,
	"status" "request_status" DEFAULT 'uj' NOT NULL,
	"assignee_user_id" uuid,
	"notes_enc" "bytea",
	"consent_at" timestamp with time zone NOT NULL,
	"consent_text_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"purge_after" timestamp with time zone,
	CONSTRAINT "pastoral_requests_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "pastoral_requests_tenant_id_reference_key" UNIQUE("tenant_id","reference")
);
--> statement-breakpoint
ALTER TABLE "pastoral_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text COLLATE "hu-HU-x-icu" NOT NULL,
	"lead" text DEFAULT '' NOT NULL,
	"body" jsonb NOT NULL,
	"cover_media_id" uuid,
	"categories" text[] DEFAULT '{}' NOT NULL,
	"status" "publish_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"search" "tsvector" GENERATED ALWAYS AS (setweight(public.hu_tsvector(title), 'A') || setweight(public.hu_tsvector(lead), 'B')) STORED NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "posts_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "posts_tenant_id_slug_key" UNIQUE("tenant_id","slug")
);
--> statement-breakpoint
ALTER TABLE "posts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "schedule_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text COLLATE "hu-HU-x-icu" NOT NULL,
	"valid_from" date,
	"valid_to" date,
	"yearly" boolean DEFAULT false NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "schedule_periods_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "schedule_periods_yearly_check" CHECK (not "schedule_periods"."yearly" or ("schedule_periods"."valid_from" is not null and "schedule_periods"."valid_to" is not null))
);
--> statement-breakpoint
ALTER TABLE "schedule_periods" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "service_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"location_id" uuid,
	"date" date NOT NULL,
	"kind" "service_exception_kind" NOT NULL,
	"rule_id" uuid,
	"time" time,
	"service_type" text,
	"note" text,
	"reason" text,
	CONSTRAINT "service_exceptions_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "service_exceptions_modify_check" CHECK ("service_exceptions"."kind" <> 'modify' or "service_exceptions"."rule_id" is not null),
	CONSTRAINT "service_exceptions_add_check" CHECK ("service_exceptions"."kind" <> 'add' or ("service_exceptions"."location_id" is not null and "service_exceptions"."time" is not null and "service_exceptions"."service_type" is not null))
);
--> statement-breakpoint
ALTER TABLE "service_exceptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "service_occurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"service_type" text NOT NULL,
	"rule_id" uuid,
	"exception_id" uuid,
	"status" "occurrence_status" DEFAULT 'scheduled' NOT NULL,
	"moved_to_id" uuid,
	CONSTRAINT "service_occurrences_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "service_occurrences_natural_key" UNIQUE("tenant_id","location_id","starts_at","service_type")
);
--> statement-breakpoint
ALTER TABLE "service_occurrences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "service_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"period_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"nth_week" smallint,
	"time" time NOT NULL,
	"duration_min" integer DEFAULT 60 NOT NULL,
	"service_type" text NOT NULL,
	"language" text DEFAULT 'hu' NOT NULL,
	"title" text COLLATE "hu-HU-x-icu",
	"note" text,
	"livestream" boolean DEFAULT false NOT NULL,
	CONSTRAINT "service_rules_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "service_rules_weekday_check" CHECK ("service_rules"."weekday" between 1 and 7),
	CONSTRAINT "service_rules_nth_week_check" CHECK ("service_rules"."nth_week" is null or "service_rules"."nth_week" in (1, 2, 3, 4, 5, -1)),
	CONSTRAINT "service_rules_duration_check" CHECK ("service_rules"."duration_min" between 1 and 1440)
);
--> statement-breakpoint
ALTER TABLE "service_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "availability_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"from_at" timestamp with time zone NOT NULL,
	"to_at" timestamp with time zone NOT NULL,
	"rrule" text,
	"note" text,
	CONSTRAINT "availability_blocks_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "availability_blocks_range_check" CHECK ("availability_blocks"."to_at" > "availability_blocks"."from_at")
);
--> statement-breakpoint
ALTER TABLE "availability_blocks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "calendars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text COLLATE "hu-HU-x-icu" NOT NULL,
	"color" text NOT NULL,
	"kind" "calendar_kind" NOT NULL,
	"owner_person_id" uuid,
	"team_id" uuid,
	"default_visibility" "event_visibility" DEFAULT 'staff' NOT NULL,
	"editors" jsonb DEFAULT '{"roles":[],"teamIds":[]}'::jsonb NOT NULL,
	CONSTRAINT "calendars_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "calendars_color_check" CHECK ("calendars"."color" ~ '^#[0-9a-fA-F]{6}$')
);
--> statement-breakpoint
ALTER TABLE "calendars" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"calendar_id" uuid NOT NULL,
	"visibility" "event_visibility" NOT NULL,
	"slug" text NOT NULL,
	"title" text COLLATE "hu-HU-x-icu" NOT NULL,
	"body" jsonb,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"all_day" boolean DEFAULT false NOT NULL,
	"rrule" text,
	"exdates" date[] DEFAULT '{}' NOT NULL,
	"parent_event_id" uuid,
	"recurrence_id" timestamp with time zone,
	"location_id" uuid,
	"group_id" uuid,
	"team_id" uuid,
	"category" text,
	"cover_media_id" uuid,
	"status" "event_status" DEFAULT 'draft' NOT NULL,
	"created_by" uuid,
	"external_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "events_tenant_id_slug_key" UNIQUE("tenant_id","slug"),
	CONSTRAINT "events_range_check" CHECK ("events"."ends_at" is null or "events"."ends_at" >= "events"."starts_at"),
	CONSTRAINT "events_override_check" CHECK (("events"."parent_event_id" is null) = ("events"."recurrence_id" is null))
);
--> statement-breakpoint
ALTER TABLE "events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid,
	"prefix" text,
	"family_name" text COLLATE "hu-HU-x-icu" NOT NULL,
	"given_name" text COLLATE "hu-HU-x-icu" NOT NULL,
	"suffix" text,
	"role_title" text,
	"staff_group" "staff_group" DEFAULT 'volunteer' NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"bio" text,
	"email" text,
	"phone" text,
	"contact_visibility" jsonb DEFAULT '{"email":"workspace","phone":"workspace"}'::jsonb NOT NULL,
	"skills" text[] DEFAULT '{}' NOT NULL,
	"photo_media_id" uuid,
	"is_minor" boolean DEFAULT false NOT NULL,
	"guardian_email" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "people_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "people_tenant_id_user_id_key" UNIQUE("tenant_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "people" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "team_members" (
	"tenant_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"is_leader" boolean DEFAULT false NOT NULL,
	"position_ids" uuid[] DEFAULT '{}' NOT NULL,
	"max_assignments_per_month" integer,
	"notes" text,
	CONSTRAINT "team_members_team_id_person_id_pk" PRIMARY KEY("team_id","person_id")
);
--> statement-breakpoint
ALTER TABLE "team_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "team_positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"name" text COLLATE "hu-HU-x-icu" NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"min_count" integer DEFAULT 1 NOT NULL,
	"max_count" integer,
	CONSTRAINT "team_positions_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "team_positions_count_check" CHECK ("team_positions"."min_count" >= 0 and ("team_positions"."max_count" is null or "team_positions"."max_count" >= "team_positions"."min_count"))
);
--> statement-breakpoint
ALTER TABLE "team_positions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text COLLATE "hu-HU-x-icu" NOT NULL,
	"kind" "team_kind" NOT NULL,
	"description" text,
	"calendar_id" uuid,
	CONSTRAINT "teams_tenant_id_id_key" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "teams" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "booking_conflicts" (
	"tenant_id" uuid NOT NULL,
	"service_occurrence_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "booking_conflicts_service_occurrence_id_booking_id_pk" PRIMARY KEY("service_occurrence_id","booking_id")
);
--> statement-breakpoint
ALTER TABLE "booking_conflicts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "booking_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"rrule" text NOT NULL,
	"dtstart" timestamp with time zone NOT NULL,
	"duration_min" integer NOT NULL,
	"title" text COLLATE "hu-HU-x-icu" NOT NULL,
	"purpose" text,
	"team_id" uuid,
	"requested_by_person_id" uuid,
	CONSTRAINT "booking_series_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "booking_series_duration_check" CHECK ("booking_series"."duration_min" > 0)
);
--> statement-breakpoint
ALTER TABLE "booking_series" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"buffer_before_min" integer DEFAULT 0 NOT NULL,
	"buffer_after_min" integer DEFAULT 0 NOT NULL,
	"blocked_period" "tstzrange" GENERATED ALWAYS AS (public.booking_blocked_period(starts_at, ends_at, buffer_before_min, buffer_after_min)) STORED NOT NULL,
	"status" "booking_status" DEFAULT 'pending' NOT NULL,
	"series_id" uuid,
	"event_id" uuid,
	"service_occurrence_id" uuid,
	"team_id" uuid,
	"title" text COLLATE "hu-HU-x-icu" NOT NULL,
	"purpose" text,
	"attendees" integer,
	"setup_notes" text,
	"requested_by_person_id" uuid,
	"decided_by_person_id" uuid,
	"decided_at" timestamp with time zone,
	"hold_expires_at" timestamp with time zone,
	"source" "booking_source" DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "bookings_range_check" CHECK ("bookings"."ends_at" > "bookings"."starts_at"),
	CONSTRAINT "bookings_buffers_check" CHECK ("bookings"."buffer_before_min" >= 0 and "bookings"."buffer_after_min" >= 0),
	CONSTRAINT "bookings_attendees_check" CHECK ("bookings"."attendees" is null or "bookings"."attendees" > 0)
);
--> statement-breakpoint
ALTER TABLE "bookings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"name" text COLLATE "hu-HU-x-icu" NOT NULL,
	"kind" "room_kind" DEFAULT 'room' NOT NULL,
	"capacity" integer,
	"features" text[] DEFAULT '{}' NOT NULL,
	"photo_media_ids" uuid[] DEFAULT '{}' NOT NULL,
	"accessibility" jsonb NOT NULL,
	"manager_person_ids" uuid[] DEFAULT '{}' NOT NULL,
	"approval_policy" jsonb NOT NULL,
	"rules" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "rooms_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "rooms_capacity_check" CHECK ("rooms"."capacity" is null or "rooms"."capacity" > 0)
);
--> statement-breakpoint
ALTER TABLE "rooms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "service_room_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"service_type" text NOT NULL,
	"room_ids" uuid[] NOT NULL,
	"buffer_before_min" integer DEFAULT 0 NOT NULL,
	"buffer_after_min" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "service_room_blocks_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "service_room_blocks_rooms_check" CHECK (cardinality("service_room_blocks"."room_ids") > 0),
	CONSTRAINT "service_room_blocks_buffers_check" CHECK ("service_room_blocks"."buffer_before_min" >= 0 and "service_room_blocks"."buffer_after_min" >= 0)
);
--> statement-breakpoint
ALTER TABLE "service_room_blocks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "arrangements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"song_id" uuid NOT NULL,
	"name" text COLLATE "hu-HU-x-icu" NOT NULL,
	"key" text NOT NULL,
	"tempo_bpm" integer,
	"structure" text DEFAULT '' NOT NULL,
	"chordpro" text,
	"notes" text,
	CONSTRAINT "arrangements_tenant_id_id_key" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "arrangements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"occurrence_id" uuid,
	"event_id" uuid,
	"plan_id" uuid,
	"team_id" uuid NOT NULL,
	"position_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" "assignment_status" DEFAULT 'requested' NOT NULL,
	"requested_by_person_id" uuid,
	"responded_at" timestamp with time zone,
	"decline_reason" text,
	"swap_with_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignments_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "assignments_target_check" CHECK (("assignments"."occurrence_id" is null) <> ("assignments"."event_id" is null)),
	CONSTRAINT "assignments_range_check" CHECK ("assignments"."ends_at" > "assignments"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_type" "attachment_owner_type" NOT NULL,
	"owner_id" uuid NOT NULL,
	"media_id" uuid,
	"url" text,
	"kind" "attachment_kind" NOT NULL,
	"label" text NOT NULL,
	"part" text,
	"key" text,
	"version" integer DEFAULT 1 NOT NULL,
	"supersedes_id" uuid,
	"rights_confirmed_by" uuid NOT NULL,
	"content_hash" text,
	"disabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attachments_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "attachments_source_check" CHECK (("attachments"."media_id" is null) <> ("attachments"."url" is null)),
	CONSTRAINT "attachments_version_check" CHECK ("attachments"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "attachments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "hymnals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"abbreviation" text NOT NULL,
	"name" text COLLATE "hu-HU-x-icu" NOT NULL,
	"denomination" "denomination"
);
--> statement-breakpoint
ALTER TABLE "hymnals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "plan_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"item_id" uuid,
	"author_person_id" uuid NOT NULL,
	"body" text NOT NULL,
	"mentions" uuid[] DEFAULT '{}' NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_comments_tenant_id_id_key" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "plan_comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "plan_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"type" "plan_item_type" NOT NULL,
	"title" text COLLATE "hu-HU-x-icu" NOT NULL,
	"song_id" uuid,
	"arrangement_id" uuid,
	"key_override" text,
	"verses" text,
	"duration_s" integer,
	"responsible_person_id" uuid,
	"notes" text,
	CONSTRAINT "plan_items_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "plan_items_position_check" CHECK ("plan_items"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "plan_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "plan_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"denomination" "denomination",
	"service_type" text NOT NULL,
	"name" text COLLATE "hu-HU-x-icu" NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plan_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "service_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"occurrence_id" uuid,
	"event_id" uuid,
	"title" text COLLATE "hu-HU-x-icu" NOT NULL,
	"status" "plan_status" DEFAULT 'draft' NOT NULL,
	"template_id" uuid,
	"leader_person_id" uuid NOT NULL,
	"approved_by_person_id" uuid,
	"approved_at" timestamp with time zone,
	"approved_snapshot" jsonb,
	"locked_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_plans_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "service_plans_target_check" CHECK (("service_plans"."occurrence_id" is null) <> ("service_plans"."event_id" is null))
);
--> statement-breakpoint
ALTER TABLE "service_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "song_hymnal_refs" (
	"tenant_id" uuid NOT NULL,
	"song_id" uuid NOT NULL,
	"hymnal_id" uuid NOT NULL,
	"number" text NOT NULL,
	"verses_note" text,
	CONSTRAINT "song_hymnal_refs_song_id_hymnal_id_number_pk" PRIMARY KEY("song_id","hymnal_id","number")
);
--> statement-breakpoint
ALTER TABLE "song_hymnal_refs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "songs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"title" text COLLATE "hu-HU-x-icu" NOT NULL,
	"alt_titles" text[] DEFAULT '{}' NOT NULL,
	"first_line" text,
	"lyrics" text,
	"language" text DEFAULT 'hu' NOT NULL,
	"authors" text[] DEFAULT '{}' NOT NULL,
	"composers" text[] DEFAULT '{}' NOT NULL,
	"translators" text[] DEFAULT '{}' NOT NULL,
	"copyright_holder" text,
	"licence" "song_licence" DEFAULT 'unknown' NOT NULL,
	"licence_ref" text,
	"themes" text[] DEFAULT '{}' NOT NULL,
	"seasons" text[] DEFAULT '{}' NOT NULL,
	"default_key" text,
	"tempo_bpm" integer,
	"time_signature" text,
	"notes" text,
	"search" "tsvector" GENERATED ALWAYS AS (setweight(public.hu_tsvector(title), 'A') || setweight(public.hu_tsvector(public.hu_join(alt_titles)), 'A') || setweight(public.hu_tsvector(first_line), 'B') || setweight(public.hu_tsvector(lyrics), 'C')) STORED NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "songs_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "songs_tempo_check" CHECK ("songs"."tempo_bpm" is null or "songs"."tempo_bpm" between 20 and 300)
);
--> statement-breakpoint
ALTER TABLE "songs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "absences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"half_day_start" boolean DEFAULT false NOT NULL,
	"half_day_end" boolean DEFAULT false NOT NULL,
	"type" text NOT NULL,
	"working_days" numeric(6, 1) NOT NULL,
	"ticket_id" uuid,
	"status" "absence_status" DEFAULT 'requested' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "absences_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "absences_range_check" CHECK ("absences"."end_date" >= "absences"."start_date"),
	CONSTRAINT "absences_working_days_check" CHECK ("absences"."working_days" >= 0 and "absences"."working_days" * 2 = trunc("absences"."working_days" * 2))
);
--> statement-breakpoint
ALTER TABLE "absences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "hr_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"ticket_id" uuid NOT NULL,
	"step" integer NOT NULL,
	"approver_person_id" uuid NOT NULL,
	"decision" "hr_decision" NOT NULL,
	"comment_enc" "bytea",
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hr_approvals_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "hr_approvals_step_check" CHECK ("hr_approvals"."step" >= 0)
);
--> statement-breakpoint
ALTER TABLE "hr_approvals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "hr_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text COLLATE "hu-HU-x-icu" NOT NULL,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"who_can_submit" "hr_who_can_submit" DEFAULT 'all' NOT NULL,
	"handler_person_ids" uuid[] DEFAULT '{}' NOT NULL,
	"approval_chain" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sla_hours" integer,
	"confidential" boolean DEFAULT false NOT NULL,
	"allow_anonymous" boolean DEFAULT false NOT NULL,
	"creates_absence" boolean DEFAULT false NOT NULL,
	"absence_type" text,
	"retention_days" integer DEFAULT 1095 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"template_id" uuid,
	"template_version" integer,
	CONSTRAINT "hr_categories_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "hr_categories_tenant_id_key_key" UNIQUE("tenant_id","key"),
	CONSTRAINT "hr_categories_absence_check" CHECK (not "hr_categories"."creates_absence" or "hr_categories"."absence_type" is not null),
	CONSTRAINT "hr_categories_retention_check" CHECK ("hr_categories"."retention_days" > 0)
);
--> statement-breakpoint
ALTER TABLE "hr_categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "hr_ticket_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"ticket_id" uuid NOT NULL,
	"author_person_id" uuid,
	"body_enc" "bytea" NOT NULL,
	"internal" boolean DEFAULT false NOT NULL,
	"attachment_media_ids" uuid[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hr_ticket_messages_tenant_id_id_key" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "hr_ticket_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "hr_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"category_id" uuid NOT NULL,
	"category_key" text NOT NULL,
	"requester_person_id" uuid,
	"anonymous" boolean DEFAULT false NOT NULL,
	"subject_enc" "bytea" NOT NULL,
	"data_enc" "bytea" NOT NULL,
	"status" "hr_ticket_status" DEFAULT 'uj' NOT NULL,
	"current_step" integer DEFAULT 0 NOT NULL,
	"assignee_person_id" uuid,
	"due_at" timestamp with time zone,
	"confidential" boolean DEFAULT false NOT NULL,
	"handover_enc" "bytea",
	"closed_at" timestamp with time zone,
	"purge_after" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hr_tickets_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "hr_tickets_tenant_id_reference_key" UNIQUE("tenant_id","reference"),
	CONSTRAINT "hr_tickets_anonymous_check" CHECK ("hr_tickets"."anonymous" = ("hr_tickets"."requester_person_id" is null))
);
--> statement-breakpoint
ALTER TABLE "hr_tickets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "leave_entitlements" (
	"tenant_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"days_total" numeric(6, 1) NOT NULL,
	"carried_over" numeric(6, 1) DEFAULT '0' NOT NULL,
	"adjustments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text,
	CONSTRAINT "leave_entitlements_person_id_year_pk" PRIMARY KEY("person_id","year"),
	CONSTRAINT "leave_entitlements_year_check" CHECK ("leave_entitlements"."year" between 2000 and 2100)
);
--> statement-breakpoint
ALTER TABLE "leave_entitlements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "staff_profiles" (
	"tenant_id" uuid NOT NULL,
	"person_id" uuid PRIMARY KEY NOT NULL,
	"position" text NOT NULL,
	"employment_type" "employment_type" NOT NULL,
	"employer" "employer" DEFAULT 'parish' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"manager_person_id" uuid,
	"weekly_hours" real NOT NULL,
	"work_pattern" jsonb DEFAULT '{"weekdays":[1,2,3,4,5]}'::jsonb NOT NULL,
	CONSTRAINT "staff_profiles_weekly_hours_check" CHECK ("staff_profiles"."weekly_hours" between 0 and 80)
);
--> statement-breakpoint
ALTER TABLE "staff_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workday_calendar" (
	"date" date PRIMARY KEY NOT NULL,
	"kind" "workday_kind" NOT NULL,
	"name" text COLLATE "hu-HU-x-icu" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workday_calendar" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notification_prefs" (
	"user_id" uuid NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"channels" "notification_channel"[] NOT NULL,
	"digest" boolean DEFAULT false NOT NULL,
	CONSTRAINT "notification_prefs_user_id_kind_pk" PRIMARY KEY("user_id","kind")
);
--> statement-breakpoint
ALTER TABLE "notification_prefs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"link" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "notifications_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "notifications_link_check" CHECK ("notifications"."link" ~ '^/\S*$')
);
--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_billing_account_id_billing_accounts_id_fk" FOREIGN KEY ("billing_account_id") REFERENCES "public"."billing_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_delegations" ADD CONSTRAINT "org_delegations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_delegations" ADD CONSTRAINT "org_delegations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_links" ADD CONSTRAINT "org_links_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_links" ADD CONSTRAINT "org_links_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_links" ADD CONSTRAINT "org_links_requested_by_profiles_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_links" ADD CONSTRAINT "org_links_approved_by_parish_profiles_id_fk" FOREIGN KEY ("approved_by_parish") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_links" ADD CONSTRAINT "org_links_approved_by_org_profiles_id_fk" FOREIGN KEY ("approved_by_org") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_memberships" ADD CONSTRAINT "org_memberships_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_memberships" ADD CONSTRAINT "org_memberships_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redirects" ADD CONSTRAINT "redirects_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_billing_account_id_billing_accounts_id_fk" FOREIGN KEY ("billing_account_id") REFERENCES "public"."billing_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_key_plans_key_fk" FOREIGN KEY ("plan_key") REFERENCES "public"."plans"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_plan_key_plans_key_fk" FOREIGN KEY ("plan_key") REFERENCES "public"."plans"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_pdf_media_id_fkey" FOREIGN KEY ("tenant_id","pdf_media_id") REFERENCES "public"."media"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_definitions" ADD CONSTRAINT "form_definitions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_photo_media_id_fkey" FOREIGN KEY ("tenant_id","photo_media_id") REFERENCES "public"."media"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_uploaded_by_profiles_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_parent_id_fkey" FOREIGN KEY ("tenant_id","parent_id") REFERENCES "public"."pages"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pastoral_requests" ADD CONSTRAINT "pastoral_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pastoral_requests" ADD CONSTRAINT "pastoral_requests_assignee_user_id_profiles_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pastoral_requests" ADD CONSTRAINT "pastoral_requests_form_id_fkey" FOREIGN KEY ("tenant_id","form_id") REFERENCES "public"."form_definitions"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_cover_media_id_fkey" FOREIGN KEY ("tenant_id","cover_media_id") REFERENCES "public"."media"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_periods" ADD CONSTRAINT "schedule_periods_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_exceptions" ADD CONSTRAINT "service_exceptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_exceptions" ADD CONSTRAINT "service_exceptions_location_id_fkey" FOREIGN KEY ("tenant_id","location_id") REFERENCES "public"."locations"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_exceptions" ADD CONSTRAINT "service_exceptions_rule_id_fkey" FOREIGN KEY ("tenant_id","rule_id") REFERENCES "public"."service_rules"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_occurrences" ADD CONSTRAINT "service_occurrences_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_occurrences" ADD CONSTRAINT "service_occurrences_location_id_fkey" FOREIGN KEY ("tenant_id","location_id") REFERENCES "public"."locations"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_occurrences" ADD CONSTRAINT "service_occurrences_rule_id_fkey" FOREIGN KEY ("tenant_id","rule_id") REFERENCES "public"."service_rules"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_occurrences" ADD CONSTRAINT "service_occurrences_exception_id_fkey" FOREIGN KEY ("tenant_id","exception_id") REFERENCES "public"."service_exceptions"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_occurrences" ADD CONSTRAINT "service_occurrences_moved_to_id_fkey" FOREIGN KEY ("tenant_id","moved_to_id") REFERENCES "public"."service_occurrences"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_rules" ADD CONSTRAINT "service_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_rules" ADD CONSTRAINT "service_rules_period_id_fkey" FOREIGN KEY ("tenant_id","period_id") REFERENCES "public"."schedule_periods"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_rules" ADD CONSTRAINT "service_rules_location_id_fkey" FOREIGN KEY ("tenant_id","location_id") REFERENCES "public"."locations"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_blocks" ADD CONSTRAINT "availability_blocks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_blocks" ADD CONSTRAINT "availability_blocks_person_id_fkey" FOREIGN KEY ("tenant_id","person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_owner_person_id_fkey" FOREIGN KEY ("tenant_id","owner_person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_team_id_fkey" FOREIGN KEY ("tenant_id","team_id") REFERENCES "public"."teams"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_calendar_id_fkey" FOREIGN KEY ("tenant_id","calendar_id") REFERENCES "public"."calendars"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_parent_event_id_fkey" FOREIGN KEY ("tenant_id","parent_event_id") REFERENCES "public"."events"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_location_id_fkey" FOREIGN KEY ("tenant_id","location_id") REFERENCES "public"."locations"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_team_id_fkey" FOREIGN KEY ("tenant_id","team_id") REFERENCES "public"."teams"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_cover_media_id_fkey" FOREIGN KEY ("tenant_id","cover_media_id") REFERENCES "public"."media"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_photo_media_id_fkey" FOREIGN KEY ("tenant_id","photo_media_id") REFERENCES "public"."media"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY ("tenant_id","team_id") REFERENCES "public"."teams"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_person_id_fkey" FOREIGN KEY ("tenant_id","person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_positions" ADD CONSTRAINT "team_positions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_positions" ADD CONSTRAINT "team_positions_team_id_fkey" FOREIGN KEY ("tenant_id","team_id") REFERENCES "public"."teams"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_calendar_id_fkey" FOREIGN KEY ("tenant_id","calendar_id") REFERENCES "public"."calendars"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_conflicts" ADD CONSTRAINT "booking_conflicts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_conflicts" ADD CONSTRAINT "booking_conflicts_service_occurrence_id_fkey" FOREIGN KEY ("tenant_id","service_occurrence_id") REFERENCES "public"."service_occurrences"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_conflicts" ADD CONSTRAINT "booking_conflicts_booking_id_fkey" FOREIGN KEY ("tenant_id","booking_id") REFERENCES "public"."bookings"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_series" ADD CONSTRAINT "booking_series_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_series" ADD CONSTRAINT "booking_series_room_id_fkey" FOREIGN KEY ("tenant_id","room_id") REFERENCES "public"."rooms"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_series" ADD CONSTRAINT "booking_series_team_id_fkey" FOREIGN KEY ("tenant_id","team_id") REFERENCES "public"."teams"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_series" ADD CONSTRAINT "booking_series_requested_by_person_id_fkey" FOREIGN KEY ("tenant_id","requested_by_person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_room_id_fkey" FOREIGN KEY ("tenant_id","room_id") REFERENCES "public"."rooms"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_series_id_fkey" FOREIGN KEY ("tenant_id","series_id") REFERENCES "public"."booking_series"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_event_id_fkey" FOREIGN KEY ("tenant_id","event_id") REFERENCES "public"."events"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_service_occurrence_id_fkey" FOREIGN KEY ("tenant_id","service_occurrence_id") REFERENCES "public"."service_occurrences"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_team_id_fkey" FOREIGN KEY ("tenant_id","team_id") REFERENCES "public"."teams"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_requested_by_person_id_fkey" FOREIGN KEY ("tenant_id","requested_by_person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_decided_by_person_id_fkey" FOREIGN KEY ("tenant_id","decided_by_person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_location_id_fkey" FOREIGN KEY ("tenant_id","location_id") REFERENCES "public"."locations"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_room_blocks" ADD CONSTRAINT "service_room_blocks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_room_blocks" ADD CONSTRAINT "service_room_blocks_location_id_fkey" FOREIGN KEY ("tenant_id","location_id") REFERENCES "public"."locations"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arrangements" ADD CONSTRAINT "arrangements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arrangements" ADD CONSTRAINT "arrangements_song_id_fkey" FOREIGN KEY ("tenant_id","song_id") REFERENCES "public"."songs"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_occurrence_id_fkey" FOREIGN KEY ("tenant_id","occurrence_id") REFERENCES "public"."service_occurrences"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_event_id_fkey" FOREIGN KEY ("tenant_id","event_id") REFERENCES "public"."events"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_plan_id_fkey" FOREIGN KEY ("tenant_id","plan_id") REFERENCES "public"."service_plans"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_team_id_fkey" FOREIGN KEY ("tenant_id","team_id") REFERENCES "public"."teams"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_position_id_fkey" FOREIGN KEY ("tenant_id","position_id") REFERENCES "public"."team_positions"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_person_id_fkey" FOREIGN KEY ("tenant_id","person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_requested_by_person_id_fkey" FOREIGN KEY ("tenant_id","requested_by_person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_swap_with_person_id_fkey" FOREIGN KEY ("tenant_id","swap_with_person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_media_id_fkey" FOREIGN KEY ("tenant_id","media_id") REFERENCES "public"."media"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_supersedes_id_fkey" FOREIGN KEY ("tenant_id","supersedes_id") REFERENCES "public"."attachments"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_rights_confirmed_by_fkey" FOREIGN KEY ("tenant_id","rights_confirmed_by") REFERENCES "public"."people"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hymnals" ADD CONSTRAINT "hymnals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_comments" ADD CONSTRAINT "plan_comments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_comments" ADD CONSTRAINT "plan_comments_plan_id_fkey" FOREIGN KEY ("tenant_id","plan_id") REFERENCES "public"."service_plans"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_comments" ADD CONSTRAINT "plan_comments_item_id_fkey" FOREIGN KEY ("tenant_id","item_id") REFERENCES "public"."plan_items"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_comments" ADD CONSTRAINT "plan_comments_author_person_id_fkey" FOREIGN KEY ("tenant_id","author_person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_plan_id_fkey" FOREIGN KEY ("tenant_id","plan_id") REFERENCES "public"."service_plans"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_song_id_fkey" FOREIGN KEY ("tenant_id","song_id") REFERENCES "public"."songs"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_arrangement_id_fkey" FOREIGN KEY ("tenant_id","arrangement_id") REFERENCES "public"."arrangements"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_responsible_person_id_fkey" FOREIGN KEY ("tenant_id","responsible_person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_templates" ADD CONSTRAINT "plan_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_plans" ADD CONSTRAINT "service_plans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_plans" ADD CONSTRAINT "service_plans_template_id_plan_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."plan_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_plans" ADD CONSTRAINT "service_plans_occurrence_id_fkey" FOREIGN KEY ("tenant_id","occurrence_id") REFERENCES "public"."service_occurrences"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_plans" ADD CONSTRAINT "service_plans_event_id_fkey" FOREIGN KEY ("tenant_id","event_id") REFERENCES "public"."events"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_plans" ADD CONSTRAINT "service_plans_leader_person_id_fkey" FOREIGN KEY ("tenant_id","leader_person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_plans" ADD CONSTRAINT "service_plans_approved_by_person_id_fkey" FOREIGN KEY ("tenant_id","approved_by_person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_hymnal_refs" ADD CONSTRAINT "song_hymnal_refs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_hymnal_refs" ADD CONSTRAINT "song_hymnal_refs_hymnal_id_hymnals_id_fk" FOREIGN KEY ("hymnal_id") REFERENCES "public"."hymnals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_hymnal_refs" ADD CONSTRAINT "song_hymnal_refs_song_id_fkey" FOREIGN KEY ("tenant_id","song_id") REFERENCES "public"."songs"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "songs" ADD CONSTRAINT "songs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "absences" ADD CONSTRAINT "absences_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "absences" ADD CONSTRAINT "absences_person_id_fkey" FOREIGN KEY ("tenant_id","person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "absences" ADD CONSTRAINT "absences_ticket_id_fkey" FOREIGN KEY ("tenant_id","ticket_id") REFERENCES "public"."hr_tickets"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_approvals" ADD CONSTRAINT "hr_approvals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_approvals" ADD CONSTRAINT "hr_approvals_ticket_id_fkey" FOREIGN KEY ("tenant_id","ticket_id") REFERENCES "public"."hr_tickets"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_approvals" ADD CONSTRAINT "hr_approvals_approver_person_id_fkey" FOREIGN KEY ("tenant_id","approver_person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_categories" ADD CONSTRAINT "hr_categories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_ticket_messages" ADD CONSTRAINT "hr_ticket_messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_ticket_messages" ADD CONSTRAINT "hr_ticket_messages_ticket_id_fkey" FOREIGN KEY ("tenant_id","ticket_id") REFERENCES "public"."hr_tickets"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_ticket_messages" ADD CONSTRAINT "hr_ticket_messages_author_person_id_fkey" FOREIGN KEY ("tenant_id","author_person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_tickets" ADD CONSTRAINT "hr_tickets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_tickets" ADD CONSTRAINT "hr_tickets_category_id_fkey" FOREIGN KEY ("tenant_id","category_id") REFERENCES "public"."hr_categories"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_tickets" ADD CONSTRAINT "hr_tickets_requester_person_id_fkey" FOREIGN KEY ("tenant_id","requester_person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_tickets" ADD CONSTRAINT "hr_tickets_assignee_person_id_fkey" FOREIGN KEY ("tenant_id","assignee_person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_entitlements" ADD CONSTRAINT "leave_entitlements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_entitlements" ADD CONSTRAINT "leave_entitlements_person_id_fkey" FOREIGN KEY ("tenant_id","person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_person_id_fkey" FOREIGN KEY ("tenant_id","person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_manager_person_id_fkey" FOREIGN KEY ("tenant_id","manager_person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_prefs" ADD CONSTRAINT "notification_prefs_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_tenant_id_at_idx" ON "audit_log" USING btree ("tenant_id","at");--> statement-breakpoint
CREATE INDEX "audit_log_actor_org_id_idx" ON "audit_log" USING btree ("actor_org_id");--> statement-breakpoint
CREATE INDEX "billing_accounts_owner_idx" ON "billing_accounts" USING btree ("owner_type","owner_id");--> statement-breakpoint
CREATE INDEX "deals_organization_id_idx" ON "deals" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "domains_tenant_id_idx" ON "domains" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "domains_hostname_key" ON "domains" USING btree (lower("hostname"));--> statement-breakpoint
CREATE UNIQUE INDEX "domains_one_primary_per_tenant" ON "domains" USING btree ("tenant_id") WHERE "domains"."is_primary";--> statement-breakpoint
CREATE INDEX "invoices_billing_account_id_idx" ON "invoices" USING btree ("billing_account_id");--> statement-breakpoint
CREATE INDEX "memberships_tenant_id_idx" ON "memberships" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "memberships_user_id_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "org_delegations_tenant_id_idx" ON "org_delegations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "org_links_tenant_id_idx" ON "org_links" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "org_links_org_id_idx" ON "org_links" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "org_links_open_link_key" ON "org_links" USING btree ("org_id","tenant_id") WHERE "org_links"."status" <> 'revoked';--> statement-breakpoint
CREATE INDEX "org_memberships_user_id_idx" ON "org_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_idempotency_key" ON "payment_events" USING btree ("provider","external_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_email_key" ON "profiles" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "redirects_tenant_id_idx" ON "redirects" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "subscriptions_billing_account_id_idx" ON "subscriptions" USING btree ("billing_account_id");--> statement-breakpoint
CREATE INDEX "subscriptions_tenant_id_idx" ON "subscriptions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "tenants_organization_id_idx" ON "tenants" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "announcements_tenant_id_idx" ON "announcements" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "form_definitions_tenant_id_idx" ON "form_definitions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "locations_tenant_id_idx" ON "locations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "media_tenant_id_idx" ON "media" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "pages_tenant_id_idx" ON "pages" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "pastoral_requests_tenant_id_idx" ON "pastoral_requests" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "pastoral_requests_tenant_id_status_idx" ON "pastoral_requests" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "pastoral_requests_purge_after_idx" ON "pastoral_requests" USING btree ("purge_after");--> statement-breakpoint
CREATE INDEX "posts_tenant_id_idx" ON "posts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "posts_tenant_id_published_at_idx" ON "posts" USING btree ("tenant_id","published_at");--> statement-breakpoint
CREATE INDEX "posts_search_idx" ON "posts" USING gin ("search");--> statement-breakpoint
CREATE INDEX "schedule_periods_tenant_id_idx" ON "schedule_periods" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "service_exceptions_tenant_id_idx" ON "service_exceptions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "service_exceptions_tenant_id_date_idx" ON "service_exceptions" USING btree ("tenant_id","date");--> statement-breakpoint
CREATE INDEX "service_occurrences_tenant_id_idx" ON "service_occurrences" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "service_rules_tenant_id_idx" ON "service_rules" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "service_rules_period_id_idx" ON "service_rules" USING btree ("period_id");--> statement-breakpoint
CREATE INDEX "service_rules_location_id_idx" ON "service_rules" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "availability_blocks_tenant_id_idx" ON "availability_blocks" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "availability_blocks_person_id_idx" ON "availability_blocks" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "calendars_tenant_id_idx" ON "calendars" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "events_tenant_id_idx" ON "events" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "events_tenant_id_starts_at_idx" ON "events" USING btree ("tenant_id","starts_at");--> statement-breakpoint
CREATE INDEX "events_calendar_id_idx" ON "events" USING btree ("calendar_id");--> statement-breakpoint
CREATE INDEX "events_public_idx" ON "events" USING btree ("tenant_id","starts_at") WHERE "events"."visibility" = 'public' and "events"."status" = 'published';--> statement-breakpoint
CREATE INDEX "people_tenant_id_idx" ON "people" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "people_tenant_id_name_idx" ON "people" USING btree ("tenant_id","family_name","given_name");--> statement-breakpoint
CREATE INDEX "team_members_tenant_id_idx" ON "team_members" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "team_members_person_id_idx" ON "team_members" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "team_positions_tenant_id_idx" ON "team_positions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "team_positions_team_id_idx" ON "team_positions" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "teams_tenant_id_idx" ON "teams" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "booking_conflicts_tenant_id_idx" ON "booking_conflicts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "booking_series_tenant_id_idx" ON "booking_series" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "bookings_tenant_id_idx" ON "bookings" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "bookings_room_id_starts_at_idx" ON "bookings" USING btree ("room_id","starts_at");--> statement-breakpoint
CREATE INDEX "bookings_tenant_id_starts_at_idx" ON "bookings" USING btree ("tenant_id","starts_at");--> statement-breakpoint
CREATE INDEX "rooms_tenant_id_idx" ON "rooms" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "rooms_location_id_idx" ON "rooms" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "service_room_blocks_tenant_id_idx" ON "service_room_blocks" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "arrangements_tenant_id_idx" ON "arrangements" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "arrangements_song_id_idx" ON "arrangements" USING btree ("song_id");--> statement-breakpoint
CREATE INDEX "assignments_tenant_id_idx" ON "assignments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "assignments_person_id_starts_at_idx" ON "assignments" USING btree ("person_id","starts_at");--> statement-breakpoint
CREATE INDEX "assignments_occurrence_id_idx" ON "assignments" USING btree ("occurrence_id");--> statement-breakpoint
CREATE INDEX "attachments_tenant_id_idx" ON "attachments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "attachments_owner_idx" ON "attachments" USING btree ("tenant_id","owner_type","owner_id");--> statement-breakpoint
CREATE INDEX "attachments_content_hash_idx" ON "attachments" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "hymnals_tenant_id_idx" ON "hymnals" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "plan_comments_tenant_id_idx" ON "plan_comments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "plan_comments_plan_id_idx" ON "plan_comments" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "plan_items_tenant_id_idx" ON "plan_items" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "plan_items_plan_id_position_idx" ON "plan_items" USING btree ("plan_id","position");--> statement-breakpoint
CREATE INDEX "plan_templates_tenant_id_idx" ON "plan_templates" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "service_plans_tenant_id_idx" ON "service_plans" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "service_plans_occurrence_id_idx" ON "service_plans" USING btree ("occurrence_id");--> statement-breakpoint
CREATE INDEX "service_plans_event_id_idx" ON "service_plans" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "song_hymnal_refs_tenant_id_idx" ON "song_hymnal_refs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "song_hymnal_refs_hymnal_id_idx" ON "song_hymnal_refs" USING btree ("hymnal_id");--> statement-breakpoint
CREATE INDEX "songs_tenant_id_idx" ON "songs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "songs_search_idx" ON "songs" USING gin ("search");--> statement-breakpoint
CREATE INDEX "absences_tenant_id_idx" ON "absences" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "absences_person_id_start_date_idx" ON "absences" USING btree ("person_id","start_date");--> statement-breakpoint
CREATE INDEX "hr_approvals_tenant_id_idx" ON "hr_approvals" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "hr_approvals_ticket_id_idx" ON "hr_approvals" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "hr_categories_tenant_id_idx" ON "hr_categories" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "hr_ticket_messages_tenant_id_idx" ON "hr_ticket_messages" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "hr_ticket_messages_ticket_id_idx" ON "hr_ticket_messages" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "hr_tickets_tenant_id_idx" ON "hr_tickets" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "hr_tickets_tenant_id_status_idx" ON "hr_tickets" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "hr_tickets_category_id_idx" ON "hr_tickets" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "hr_tickets_purge_after_idx" ON "hr_tickets" USING btree ("purge_after");--> statement-breakpoint
CREATE INDEX "leave_entitlements_tenant_id_idx" ON "leave_entitlements" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "staff_profiles_tenant_id_idx" ON "staff_profiles" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "notifications_tenant_id_idx" ON "notifications" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications" USING btree ("user_id","created_at");