-- Music merge phase 1b (docs/music-merge/PLAN.md §4, §11, §11.1): Music Sheet DB's tables (state after
-- its 151 migrations) as tenant-scoped tables. Their `songs` / `arrangements` REPLACE Churchy's;
-- hymnal refs and plan items are re-pointed at the new tables.
ALTER TABLE "plan_items" DROP CONSTRAINT "plan_items_song_id_fkey";
--> statement-breakpoint
ALTER TABLE "plan_items" DROP CONSTRAINT "plan_items_arrangement_id_fkey";
--> statement-breakpoint
ALTER TABLE "song_hymnal_refs" DROP CONSTRAINT "song_hymnal_refs_song_id_fkey";
--> statement-breakpoint
DROP TABLE "arrangements" CASCADE;
--> statement-breakpoint
DROP TABLE "songs" CASCADE;
--> statement-breakpoint
CREATE TABLE "annotations" (
	"tenant_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"song_id" uuid NOT NULL,
	"setlist_item_id" uuid,
	"section_label" text,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "annotations_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "annotations_body_check" CHECK (((body = btrim(body)) AND ((char_length(body) >= 1) AND (char_length(body) <= 1000)))),
	CONSTRAINT "annotations_section_label_check" CHECK (((section_label = btrim(section_label)) AND ((char_length(section_label) >= 1) AND (char_length(section_label) <= 100))))
);
--> statement-breakpoint
ALTER TABLE "annotations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "announcement_calendars" (
	"tenant_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text COLLATE "hu-HU-x-icu" NOT NULL,
	"ics_url" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "announcement_calendars_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "announcement_calendars_ics_url_check" CHECK (((ics_url ~ '^https://[^\s]+$'::text) AND (char_length(ics_url) <= 2000))),
	CONSTRAINT "announcement_calendars_name_check" CHECK (((name = btrim(name)) AND ((char_length(name) >= 1) AND (char_length(name) <= 100)))),
	CONSTRAINT "announcement_calendars_position_check" CHECK (("position" >= 0))
);
--> statement-breakpoint
ALTER TABLE "announcement_calendars" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "announcement_settings" (
	"tenant_id" uuid NOT NULL,
	"exclude_words" text[] DEFAULT '{}'::text[] NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "announcement_settings_pkey" PRIMARY KEY("tenant_id"),
	CONSTRAINT "announcement_settings_exclude_words_check" CHECK (((cardinality(exclude_words) <= 50) AND valid_announcement_words(exclude_words)))
);
--> statement-breakpoint
ALTER TABLE "announcement_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app_config" (
	"tenant_id" uuid NOT NULL,
	"app_name" text NOT NULL,
	"short_name" text,
	"church_name" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"description" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"default_palette" text DEFAULT 'paper'::text NOT NULL,
	"brand_color" text DEFAULT '#885f36'::text NOT NULL,
	"icon_path" text,
	"time_zone" text DEFAULT 'Europe/Budapest'::text NOT NULL,
	"email_sender_name" text,
	"controller_kind" text,
	"controller_name" text,
	"controller_address" text,
	"contact_email" text,
	"authority" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"privacy_updated_at" timestamp with time zone,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"scripture_karoli" boolean DEFAULT true NOT NULL,
	"scripture_ruf" text DEFAULT 'pasted'::text NOT NULL,
	"theme" jsonb,
	CONSTRAINT "app_config_pkey" PRIMARY KEY("tenant_id"),
	CONSTRAINT "app_config_app_name_check" CHECK (((char_length(btrim(app_name)) >= 1) AND (char_length(btrim(app_name)) <= 40))),
	CONSTRAINT "app_config_authority_check" CHECK ((jsonb_typeof(authority) = 'object'::text)),
	CONSTRAINT "app_config_brand_color_check" CHECK ((brand_color ~ '^#[0-9a-f]{6}$'::text)),
	CONSTRAINT "app_config_church_name_check" CHECK ((jsonb_typeof(church_name) = 'object'::text)),
	CONSTRAINT "app_config_contact_email_check" CHECK (((char_length(contact_email) >= 3) AND (char_length(contact_email) <= 254))),
	CONSTRAINT "app_config_controller_address_check" CHECK (((char_length(btrim(controller_address)) >= 1) AND (char_length(btrim(controller_address)) <= 300))),
	CONSTRAINT "app_config_controller_kind_check" CHECK ((controller_kind = ANY (ARRAY['church'::text, 'person'::text, 'organization'::text]))),
	CONSTRAINT "app_config_controller_name_check" CHECK (((char_length(btrim(controller_name)) >= 1) AND (char_length(btrim(controller_name)) <= 200))),
	CONSTRAINT "app_config_controller_named" CHECK (((controller_kind IS NULL) OR (controller_kind = 'church'::text) OR (controller_name IS NOT NULL))),
	CONSTRAINT "app_config_default_palette_check" CHECK ((default_palette = ANY (ARRAY['paper'::text, 'neon'::text, 'acid'::text, 'sunset'::text, 'aurora'::text]))),
	CONSTRAINT "app_config_description_check" CHECK ((jsonb_typeof(description) = 'object'::text)),
	CONSTRAINT "app_config_email_sender_name_check" CHECK ((((char_length(btrim(email_sender_name)) >= 1) AND (char_length(btrim(email_sender_name)) <= 60)) AND (email_sender_name !~ '[<>"\\\r\n]'::text))),
	CONSTRAINT "app_config_icon_path_check" CHECK ((icon_path ~ '^[0-9a-f-]{36}\.png$'::text)),
	CONSTRAINT "app_config_scripture_ruf_check" CHECK ((scripture_ruf = ANY (ARRAY['pasted'::text, 'permit'::text, 'off'::text]))),
	CONSTRAINT "app_config_short_name_check" CHECK (((char_length(btrim(short_name)) >= 1) AND (char_length(btrim(short_name)) <= 12))),
	CONSTRAINT "app_config_theme_check" CHECK (((theme IS NULL) OR (jsonb_typeof(theme) = 'object'::text))),
	CONSTRAINT "app_config_time_zone_check" CHECK (((char_length(time_zone) >= 1) AND (char_length(time_zone) <= 64)))
);
--> statement-breakpoint
ALTER TABLE "app_config" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app_modules" (
	"tenant_id" uuid NOT NULL,
	"id" text NOT NULL,
	"enabled" boolean NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_modules_pkey" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "app_modules_id_check" CHECK ((id ~ '^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)?$'::text))
);
--> statement-breakpoint
ALTER TABLE "app_modules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "arrangements" (
	"tenant_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"song_id" uuid NOT NULL,
	"name" text COLLATE "hu-HU-x-icu" NOT NULL,
	"chordpro" text DEFAULT ''::text NOT NULL,
	"section_order" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"musical_key" text GENERATED ALWAYS AS ("substring"(chordpro, '(?n)^\s*\{\s*key\s*:\s*([^}]*?)\s*\}'::text)) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tempo_bpm" integer GENERATED ALWAYS AS (
CASE
    WHEN (chordpro_directive(chordpro, 'tempo'::text) ~ '^[0-9]{1,3}$'::text) THEN (chordpro_directive(chordpro, 'tempo'::text))::integer
    ELSE NULL::integer
END) STORED,
	"time_signature" text GENERATED ALWAYS AS (
CASE
    WHEN (chordpro_directive(chordpro, 'time'::text) ~ '^[0-9]{1,2}/[0-9]{1,2}$'::text) THEN chordpro_directive(chordpro, 'time'::text)
    ELSE NULL::text
END) STORED,
	"duration_seconds" integer GENERATED ALWAYS AS (
CASE
    WHEN (chordpro_directive(chordpro, 'duration'::text) ~ '^[0-9]{1,5}$'::text) THEN (chordpro_directive(chordpro, 'duration'::text))::integer
    WHEN (chordpro_directive(chordpro, 'duration'::text) ~ '^[0-9]{1,3}:[0-5][0-9]$'::text) THEN (((split_part(chordpro_directive(chordpro, 'duration'::text), ':'::text, 1))::integer * 60) + (split_part(chordpro_directive(chordpro, 'duration'::text), ':'::text, 2))::integer)
    ELSE NULL::integer
END) STORED,
	"other_keys" text[] GENERATED ALWAYS AS (COALESCE(regexp_split_to_array(NULLIF(btrim(chordpro_directive(chordpro, 'x_other_keys'::text)), ''::text), '[\s,;]+'::text), '{}'::text[])) STORED,
	"chord_notation" text GENERATED ALWAYS AS (chart_notation(chordpro)) STORED,
	"key_names" text[] GENERATED ALWAYS AS (chart_key_names(chordpro)) STORED,
	"search_vector" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple_unaccent'::regconfig, ((name || ' '::text) || regexp_replace(regexp_replace(chordpro, '\[[^]]*\]'::text, ''::text, 'g'::text), '\{[^}]*\}'::text, ' '::text, 'g'::text)))) STORED,
	"projection_theme_id" uuid,
	CONSTRAINT "arrangements_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "arrangements_id_song_id_key" UNIQUE("tenant_id","id","song_id"),
	CONSTRAINT "arrangements_chordpro_check" CHECK ((char_length(chordpro) <= 50000)),
	CONSTRAINT "arrangements_name_check" CHECK (((name = btrim(name)) AND ((char_length(name) >= 1) AND (char_length(name) <= 200)))),
	CONSTRAINT "arrangements_section_order_check" CHECK ((cardinality(section_order) <= 50))
);
--> statement-breakpoint
ALTER TABLE "arrangements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "calendar_feeds" (
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"consented_at" timestamp with time zone,
	"token_hash" text NOT NULL,
	CONSTRAINT "calendar_feeds_pkey" PRIMARY KEY("tenant_id","user_id"),
	CONSTRAINT "calendar_feeds_token_hash_key" UNIQUE("token_hash"),
	CONSTRAINT "calendar_feeds_token_hash_check" CHECK ((token_hash ~ '^[0-9a-f]{64}$'::text))
);
--> statement-breakpoint
ALTER TABLE "calendar_feeds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "course_images" (
	"tenant_id" uuid NOT NULL,
	"path" text NOT NULL,
	"course_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_images_pkey" PRIMARY KEY("tenant_id","path"),
	CONSTRAINT "course_images_path_check" CHECK ((char_length(path) <= 200))
);
--> statement-breakpoint
ALTER TABLE "course_images" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "course_lessons" (
	"tenant_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"course_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"title" text COLLATE "hu-HU-x-icu" NOT NULL,
	"video_url" text,
	"body" jsonb DEFAULT '{"type": "doc", "content": []}'::jsonb NOT NULL,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_published" boolean DEFAULT true NOT NULL,
	"draft" jsonb,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_lessons_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "course_lessons_body_check" CHECK (((jsonb_typeof(body) = 'object'::text) AND (octet_length((body)::text) <= 500000))),
	CONSTRAINT "course_lessons_check" CHECK ((is_published OR (removed_at IS NOT NULL))),
	CONSTRAINT "course_lessons_draft_check" CHECK (((draft IS NULL) OR (jsonb_typeof(draft) = 'object'::text))),
	CONSTRAINT "course_lessons_links_check" CHECK (((jsonb_typeof(links) = 'array'::text) AND (jsonb_array_length(links) <= 20))),
	CONSTRAINT "course_lessons_position_check" CHECK (("position" >= 0)),
	CONSTRAINT "course_lessons_title_check" CHECK (((title = btrim(title)) AND ((char_length(title) >= 1) AND (char_length(title) <= 200)))),
	CONSTRAINT "course_lessons_video_url_check" CHECK (((video_url IS NULL) OR ((char_length(video_url) >= 1) AND (char_length(video_url) <= 500))))
);
--> statement-breakpoint
ALTER TABLE "course_lessons" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "courses" (
	"tenant_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text COLLATE "hu-HU-x-icu" NOT NULL,
	"language" text NOT NULL,
	"description" text,
	"position" bigint NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"draft" jsonb,
	"areas_lost" boolean DEFAULT false NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"icon" text,
	"image_path" text,
	CONSTRAINT "courses_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "courses_check" CHECK (((NOT is_published) OR (published_at IS NOT NULL))),
	CONSTRAINT "courses_description_check" CHECK (((description IS NULL) OR ((description = btrim(description)) AND ((char_length(description) >= 1) AND (char_length(description) <= 1000))))),
	CONSTRAINT "courses_draft_check" CHECK (((draft IS NULL) OR ((jsonb_typeof(draft) = 'object'::text) AND (octet_length((draft)::text) <= 5000000)))),
	CONSTRAINT "courses_icon_check" CHECK (((icon IS NULL) OR (icon ~ '^[a-z0-9-]{1,40}$'::text))),
	CONSTRAINT "courses_image_path_check" CHECK (((image_path IS NULL) OR (char_length(image_path) <= 200))),
	CONSTRAINT "courses_language_check" CHECK ((language = ANY (ARRAY['hu'::text, 'en'::text]))),
	CONSTRAINT "courses_one_cover" CHECK (((icon IS NULL) OR (image_path IS NULL))),
	CONSTRAINT "courses_title_check" CHECK (((title = btrim(title)) AND ((char_length(title) >= 1) AND (char_length(title) <= 200))))
);
--> statement-breakpoint
ALTER TABLE "courses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "email_templates" (
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"locale" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_templates_pkey" PRIMARY KEY("tenant_id","kind","locale"),
	CONSTRAINT "email_templates_body_check" CHECK (((char_length(body) >= 1) AND (char_length(body) <= 5000))),
	CONSTRAINT "email_templates_kind_check" CHECK ((kind = ANY (ARRAY['event_added'::text, 'event_reminder'::text, 'setlist'::text, 'welcome'::text]))),
	CONSTRAINT "email_templates_locale_check" CHECK ((locale = ANY (ARRAY['en'::text, 'hu'::text]))),
	CONSTRAINT "email_templates_subject_check" CHECK (((subject = btrim(subject)) AND ((char_length(subject) >= 1) AND (char_length(subject) <= 200)) AND (subject !~ '[\r\n]'::text)))
);
--> statement-breakpoint
ALTER TABLE "email_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "mixer_settings" (
	"tenant_id" uuid NOT NULL,
	"kind" text DEFAULT 'off'::text NOT NULL,
	"host" text DEFAULT ''::text NOT NULL,
	"slots" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"midi_channel" smallint DEFAULT 1 NOT NULL,
	"tap_keys" smallint[] DEFAULT '{}'::smallint[] NOT NULL,
	CONSTRAINT "mixer_settings_pkey" PRIMARY KEY("tenant_id"),
	CONSTRAINT "mixer_settings_host_check" CHECK (((host = ''::text) OR (host ~ '^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])$'::text))),
	CONSTRAINT "mixer_settings_kind_check" CHECK ((kind = ANY (ARRAY['off'::text, 'x32-osc'::text, 'x32-midi'::text, 'sq-tcp'::text, 'sq-midi'::text]))),
	CONSTRAINT "mixer_settings_midi_channel_check" CHECK (((midi_channel >= 1) AND (midi_channel <= 16))),
	CONSTRAINT "mixer_settings_slots_check" CHECK (((jsonb_typeof(slots) = 'array'::text) AND (jsonb_array_length(slots) <= 8))),
	CONSTRAINT "mixer_settings_tap_keys_check" CHECK (((cardinality(tap_keys) <= 16) AND (array_position(tap_keys, NULL::smallint) IS NULL) AND (1 <= ALL (tap_keys)) AND (16 >= ALL (tap_keys))))
);
--> statement-breakpoint
ALTER TABLE "mixer_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"event_added" boolean DEFAULT true NOT NULL,
	"event_reminder" boolean DEFAULT true NOT NULL,
	"reminder_days" integer DEFAULT 5 NOT NULL,
	"setlist" boolean DEFAULT true NOT NULL,
	"setlist_hours" integer DEFAULT 2 NOT NULL,
	"time_zone" text DEFAULT church_time_zone() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"email" boolean DEFAULT true NOT NULL,
	"live_session" boolean DEFAULT true NOT NULL,
	CONSTRAINT "notification_preferences_pkey" PRIMARY KEY("tenant_id","user_id"),
	CONSTRAINT "notification_preferences_reminder_days_check" CHECK (((reminder_days >= 1) AND (reminder_days <= 30))),
	CONSTRAINT "notification_preferences_setlist_hours_check" CHECK (((setlist_hours >= 1) AND (setlist_hours <= 12))),
	CONSTRAINT "notification_preferences_time_zone_check" CHECK (((char_length(time_zone) >= 1) AND (char_length(time_zone) <= 64)))
);
--> statement-breakpoint
ALTER TABLE "notification_preferences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "projection_themes" (
	"tenant_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text COLLATE "hu-HU-x-icu" NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"background_color" text NOT NULL,
	"background_image_path" text,
	"background_dim" smallint DEFAULT 0 NOT NULL,
	"font" text NOT NULL,
	"text_color" text NOT NULL,
	"text_size" smallint DEFAULT 100 NOT NULL,
	"text_align" text DEFAULT 'center'::text NOT NULL,
	"vertical_align" text DEFAULT 'center'::text NOT NULL,
	"text_shadow" text DEFAULT 'none'::text NOT NULL,
	"margin" smallint DEFAULT 6 NOT NULL,
	"transition" text DEFAULT 'fade'::text NOT NULL,
	"transition_ms" smallint DEFAULT 150 NOT NULL,
	"dmx" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accent_color" text,
	"reference_size" smallint DEFAULT 100 NOT NULL,
	"roll_transition_ms" smallint DEFAULT 600 NOT NULL,
	"background_video_path" text,
	CONSTRAINT "projection_themes_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "projection_themes_background_image_path_key" UNIQUE("tenant_id","background_image_path"),
	CONSTRAINT "projection_themes_background_video_path_key" UNIQUE("tenant_id","background_video_path"),
	CONSTRAINT "projection_themes_name_key" UNIQUE("tenant_id","name"),
	CONSTRAINT "projection_themes_accent_color_check" CHECK ((accent_color ~ '^#[0-9a-f]{6}$'::text)),
	CONSTRAINT "projection_themes_background_color_check" CHECK ((background_color ~ '^#[0-9a-f]{6}$'::text)),
	CONSTRAINT "projection_themes_background_dim_check" CHECK (((background_dim >= 0) AND (background_dim <= 80))),
	CONSTRAINT "projection_themes_background_image_path_check" CHECK ((background_image_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'::text)),
	CONSTRAINT "projection_themes_background_video_path_check" CHECK ((background_video_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(mp4|webm)$'::text)),
	CONSTRAINT "projection_themes_dmx_check" CHECK ((jsonb_typeof(dmx) = 'object'::text)),
	CONSTRAINT "projection_themes_font_check" CHECK ((font ~ '^[a-z0-9-]{1,30}$'::text)),
	CONSTRAINT "projection_themes_margin_check" CHECK (((margin >= 0) AND (margin <= 15))),
	CONSTRAINT "projection_themes_name_check" CHECK (((name = btrim(name)) AND ((char_length(name) >= 1) AND (char_length(name) <= 100)))),
	CONSTRAINT "projection_themes_reference_size_check" CHECK (((reference_size >= 25) AND (reference_size <= 500))),
	CONSTRAINT "projection_themes_roll_transition_ms_check" CHECK (((roll_transition_ms >= 0) AND (roll_transition_ms <= 2000))),
	CONSTRAINT "projection_themes_text_align_check" CHECK ((text_align = ANY (ARRAY['left'::text, 'center'::text, 'right'::text]))),
	CONSTRAINT "projection_themes_text_color_check" CHECK ((text_color ~ '^#[0-9a-f]{6}$'::text)),
	CONSTRAINT "projection_themes_text_shadow_check" CHECK ((text_shadow = ANY (ARRAY['none'::text, 'light'::text, 'strong'::text]))),
	CONSTRAINT "projection_themes_text_size_check" CHECK (((text_size >= 50) AND (text_size <= 150))),
	CONSTRAINT "projection_themes_transition_check" CHECK ((transition = ANY (ARRAY['cut'::text, 'fade'::text]))),
	CONSTRAINT "projection_themes_transition_ms_check" CHECK (((transition_ms >= 0) AND (transition_ms <= 2000))),
	CONSTRAINT "projection_themes_vertical_align_check" CHECK ((vertical_align = ANY (ARRAY['top'::text, 'center'::text, 'bottom'::text]))),
	CONSTRAINT "projection_themes_video_poster" CHECK (((background_video_path IS NULL) OR (background_image_path IS NOT NULL)))
);
--> statement-breakpoint
ALTER TABLE "projection_themes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "projection_video_uploads" (
	"tenant_id" uuid NOT NULL,
	"path" text NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projection_video_uploads_pkey" PRIMARY KEY("tenant_id","path"),
	CONSTRAINT "projection_video_uploads_path_check" CHECK ((path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(mp4|webm)$'::text))
);
--> statement-breakpoint
ALTER TABLE "projection_video_uploads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"tenant_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"consented_at" timestamp with time zone,
	CONSTRAINT "push_subscriptions_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "push_subscriptions_endpoint_key" UNIQUE("endpoint"),
	CONSTRAINT "push_subscriptions_auth_check" CHECK ((auth ~ '^[A-Za-z0-9_-]{1,64}={0,2}$'::text)),
	CONSTRAINT "push_subscriptions_endpoint_check" CHECK (((endpoint ~ '^https://'::text) AND (char_length(endpoint) <= 2048))),
	CONSTRAINT "push_subscriptions_p256dh_check" CHECK ((p256dh ~ '^[A-Za-z0-9_-]{1,128}={0,2}$'::text))
);
--> statement-breakpoint
ALTER TABLE "push_subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scripture_books" (
	"tenant_id" uuid,
	"translation" text NOT NULL,
	"book" text NOT NULL,
	"chapters" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scripture_books_key" UNIQUE NULLS NOT DISTINCT("tenant_id","translation","book"),
	CONSTRAINT "scripture_books_book_check" CHECK ((book ~ '^[1-4]?[A-Za-z]{2,10}$'::text)),
	CONSTRAINT "scripture_books_chapters_check" CHECK ((jsonb_typeof(chapters) = 'array'::text)),
	CONSTRAINT "scripture_books_translation_check" CHECK ((translation ~ '^[a-z0-9]{1,30}$'::text))
);
--> statement-breakpoint
ALTER TABLE "scripture_books" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scripture_verse_cache" (
	"tenant_id" uuid,
	"translation" text NOT NULL,
	"book" text NOT NULL,
	"chapter" integer NOT NULL,
	"verse" integer NOT NULL,
	"text" text NOT NULL,
	"cached_at" timestamp with time zone DEFAULT now() NOT NULL,
	"chapter_end" boolean DEFAULT false NOT NULL,
	CONSTRAINT "scripture_verse_cache_key" UNIQUE NULLS NOT DISTINCT("tenant_id","translation","book","chapter","verse"),
	CONSTRAINT "scripture_verse_cache_book_check" CHECK ((book ~ '^[1-4]?[A-Za-z]{2,10}$'::text)),
	CONSTRAINT "scripture_verse_cache_chapter_check" CHECK (((chapter >= 1) AND (chapter <= 150))),
	CONSTRAINT "scripture_verse_cache_text_check" CHECK (((length(text) >= 1) AND (length(text) <= 2000))),
	CONSTRAINT "scripture_verse_cache_translation_check" CHECK ((translation ~ '^[a-z0-9]{1,30}$'::text)),
	CONSTRAINT "scripture_verse_cache_verse_check" CHECK (((verse >= 1) AND (verse <= 200)))
);
--> statement-breakpoint
ALTER TABLE "scripture_verse_cache" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "setlist_item_durations" (
	"tenant_id" uuid NOT NULL,
	"setlist_item_id" uuid NOT NULL,
	"seconds" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "setlist_item_durations_pkey" PRIMARY KEY("tenant_id","setlist_item_id"),
	CONSTRAINT "setlist_item_durations_seconds_check" CHECK (((seconds >= 1) AND (seconds <= 86400)))
);
--> statement-breakpoint
ALTER TABLE "setlist_item_durations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "setlist_item_themes" (
	"tenant_id" uuid NOT NULL,
	"setlist_item_id" uuid NOT NULL,
	"theme_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "setlist_item_themes_pkey" PRIMARY KEY("tenant_id","setlist_item_id")
);
--> statement-breakpoint
ALTER TABLE "setlist_item_themes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "setlist_items" (
	"tenant_id" uuid NOT NULL,
	"setlist_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"arrangement_id" uuid,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text COLLATE "hu-HU-x-icu",
	"notes" text,
	"musical_key" text,
	"scripture" boolean DEFAULT false NOT NULL,
	"scripture_translation" text,
	"image_set_id" uuid,
	"announcement_id" uuid,
	"text_slide" boolean DEFAULT false NOT NULL,
	"description" text,
	"highlight" text,
	"key" uuid DEFAULT gen_random_uuid() NOT NULL,
	CONSTRAINT "setlist_items_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "setlist_items_setlist_id_key_key" UNIQUE("tenant_id","setlist_id","key"),
	CONSTRAINT "setlist_items_announcement_check" CHECK (((announcement_id IS NULL) OR ((title IS NOT NULL) AND (NOT scripture) AND (image_set_id IS NULL)))),
	CONSTRAINT "setlist_items_description_check" CHECK (((char_length(description) >= 1) AND (char_length(description) <= 2000))),
	CONSTRAINT "setlist_items_highlight_check" CHECK (((char_length(highlight) >= 1) AND (char_length(highlight) <= 500))),
	CONSTRAINT "setlist_items_image_set_check" CHECK (((image_set_id IS NULL) OR ((title IS NOT NULL) AND (NOT scripture)))),
	CONSTRAINT "setlist_items_kind_check" CHECK ((((arrangement_id IS NULL) = (title IS NOT NULL)) AND ((notes IS NULL) OR (title IS NOT NULL)))),
	CONSTRAINT "setlist_items_musical_key_check" CHECK ((musical_key ~ '^[A-G][#b]?m?$'::text)),
	CONSTRAINT "setlist_items_notes_check" CHECK (((char_length(notes) >= 1) AND (char_length(notes) <= 2000))),
	CONSTRAINT "setlist_items_position_check" CHECK (("position" >= 0)),
	CONSTRAINT "setlist_items_scripture_check" CHECK (((NOT scripture) OR (title IS NOT NULL))),
	CONSTRAINT "setlist_items_scripture_translation_check" CHECK (((scripture_translation IS NULL) OR (scripture AND (scripture_translation ~ '^[a-z0-9]{1,30}$'::text)))),
	CONSTRAINT "setlist_items_text_slide_check" CHECK (((NOT text_slide) OR ((title IS NOT NULL) AND (NOT scripture) AND (image_set_id IS NULL) AND (announcement_id IS NULL)))),
	CONSTRAINT "setlist_items_text_slide_text_check" CHECK ((text_slide OR ((description IS NULL) AND (highlight IS NULL)))),
	CONSTRAINT "setlist_items_title_check" CHECK (((title = btrim(title)) AND ((char_length(title) >= 1) AND (char_length(title) <= 200))))
);
--> statement-breakpoint
ALTER TABLE "setlist_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "setlists" (
	"tenant_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"items" jsonb NOT NULL,
	"song_count" integer GENERATED ALWAYS AS (setlist_song_count(items)) STORED,
	"item_count" integer GENERATED ALWAYS AS (jsonb_array_length(items)) STORED,
	CONSTRAINT "setlists_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "setlists_items_check" CHECK (((jsonb_typeof(items) = 'array'::text) AND ((jsonb_array_length(items) >= 1) AND (jsonb_array_length(items) <= 100))))
);
--> statement-breakpoint
ALTER TABLE "setlists" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sheet_marks" (
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"id" uuid NOT NULL,
	"arrangement_id" uuid NOT NULL,
	"mark" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sheet_marks_pkey" PRIMARY KEY("tenant_id","user_id","id"),
	CONSTRAINT "sheet_marks_mark_check" CHECK (((jsonb_typeof(mark) = 'object'::text) AND (pg_column_size(mark) <= 65536)))
);
--> statement-breakpoint
ALTER TABLE "sheet_marks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "song_image_arrangements" (
	"tenant_id" uuid NOT NULL,
	"image_id" uuid NOT NULL,
	"arrangement_id" uuid NOT NULL,
	"song_id" uuid NOT NULL,
	CONSTRAINT "song_image_arrangements_pkey" PRIMARY KEY("tenant_id","image_id","arrangement_id")
);
--> statement-breakpoint
ALTER TABLE "song_image_arrangements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "song_image_pages" (
	"tenant_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"image_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"path" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "song_image_pages_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "song_image_pages_path_key" UNIQUE("tenant_id","path"),
	CONSTRAINT "song_image_pages_height_check" CHECK (((height >= 1) AND (height <= 10000))),
	CONSTRAINT "song_image_pages_path_check" CHECK ((path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'::text)),
	CONSTRAINT "song_image_pages_path_image_id_check" CHECK ((split_part(path, '/'::text, 2) = (image_id)::text)),
	CONSTRAINT "song_image_pages_position_check" CHECK (("position" >= 1)),
	CONSTRAINT "song_image_pages_size_bytes_check" CHECK (((size_bytes >= 1) AND (size_bytes <= 5242880))),
	CONSTRAINT "song_image_pages_width_check" CHECK (((width >= 1) AND (width <= 10000)))
);
--> statement-breakpoint
ALTER TABLE "song_image_pages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "song_image_stray_files" (
	"tenant_id" uuid NOT NULL,
	"path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "song_image_stray_files_pkey" PRIMARY KEY("tenant_id","path"),
	CONSTRAINT "song_image_stray_files_path_check" CHECK ((path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'::text))
);
--> statement-breakpoint
ALTER TABLE "song_image_stray_files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "song_images" (
	"tenant_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"song_id" uuid NOT NULL,
	"name" text COLLATE "hu-HU-x-icu" NOT NULL,
	"musical_keys" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "song_images_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "song_images_id_song_id_key" UNIQUE("tenant_id","id","song_id"),
	CONSTRAINT "song_images_musical_keys_check" CHECK (((cardinality(musical_keys) <= 24) AND (array_position(musical_keys, NULL::text) IS NULL) AND (array_to_string(musical_keys, ','::text) ~ '^([A-G][#b]?m?(,[A-G][#b]?m?)*)?$'::text))),
	CONSTRAINT "song_images_name_check" CHECK (((name = btrim(name)) AND ((char_length(name) >= 1) AND (char_length(name) <= 100))))
);
--> statement-breakpoint
ALTER TABLE "song_images" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "song_link_arrangements" (
	"tenant_id" uuid NOT NULL,
	"link_id" uuid NOT NULL,
	"arrangement_id" uuid NOT NULL,
	"song_id" uuid NOT NULL,
	CONSTRAINT "song_link_arrangements_pkey" PRIMARY KEY("tenant_id","link_id","arrangement_id")
);
--> statement-breakpoint
ALTER TABLE "song_link_arrangements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "song_links" (
	"tenant_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"song_id" uuid NOT NULL,
	"name" text COLLATE "hu-HU-x-icu" NOT NULL,
	"url" text NOT NULL,
	"musical_keys" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "song_links_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "song_links_id_song_id_key" UNIQUE("tenant_id","id","song_id"),
	CONSTRAINT "song_links_musical_keys_check" CHECK (((cardinality(musical_keys) <= 24) AND (array_position(musical_keys, NULL::text) IS NULL) AND (array_to_string(musical_keys, ','::text) ~ '^([A-G][#b]?m?(,[A-G][#b]?m?)*)?$'::text))),
	CONSTRAINT "song_links_name_check" CHECK (((name = btrim(name)) AND ((char_length(name) >= 1) AND (char_length(name) <= 100)))),
	CONSTRAINT "song_links_url_check" CHECK (((char_length(url) <= 2000) AND (url ~ '^https?://[^/?#]+'::text)))
);
--> statement-breakpoint
ALTER TABLE "song_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "song_pdf_arrangements" (
	"tenant_id" uuid NOT NULL,
	"pdf_id" uuid NOT NULL,
	"arrangement_id" uuid NOT NULL,
	"song_id" uuid NOT NULL,
	CONSTRAINT "song_pdf_arrangements_pkey" PRIMARY KEY("tenant_id","pdf_id","arrangement_id")
);
--> statement-breakpoint
ALTER TABLE "song_pdf_arrangements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "song_pdf_uploads" (
	"tenant_id" uuid NOT NULL,
	"path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid,
	CONSTRAINT "song_pdf_uploads_pkey" PRIMARY KEY("tenant_id","path"),
	CONSTRAINT "song_pdf_uploads_path_check" CHECK ((path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$'::text))
);
--> statement-breakpoint
ALTER TABLE "song_pdf_uploads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "song_pdfs" (
	"tenant_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"song_id" uuid NOT NULL,
	"name" text COLLATE "hu-HU-x-icu" NOT NULL,
	"file_name" text NOT NULL,
	"path" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"musical_keys" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "song_pdfs_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "song_pdfs_id_song_id_key" UNIQUE("tenant_id","id","song_id"),
	CONSTRAINT "song_pdfs_path_key" UNIQUE("tenant_id","path"),
	CONSTRAINT "song_pdfs_file_name_check" CHECK (((char_length(file_name) >= 1) AND (char_length(file_name) <= 200))),
	CONSTRAINT "song_pdfs_musical_keys_check" CHECK (((cardinality(musical_keys) <= 24) AND (array_position(musical_keys, NULL::text) IS NULL) AND (array_to_string(musical_keys, ','::text) ~ '^([A-G][#b]?m?(,[A-G][#b]?m?)*)?$'::text))),
	CONSTRAINT "song_pdfs_name_check" CHECK (((name = btrim(name)) AND ((char_length(name) >= 1) AND (char_length(name) <= 100)))),
	CONSTRAINT "song_pdfs_path_check" CHECK ((path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$'::text)),
	CONSTRAINT "song_pdfs_path_song_id_check" CHECK ((split_part(path, '/'::text, 1) = (song_id)::text)),
	CONSTRAINT "song_pdfs_size_bytes_check" CHECK (((size_bytes >= 1) AND (size_bytes <= 10485760)))
);
--> statement-breakpoint
ALTER TABLE "song_pdfs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "song_rights_proposals" (
	"tenant_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"song_id" uuid NOT NULL,
	"status" text DEFAULT 'running'::text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"result" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"error_kind" text,
	CONSTRAINT "song_rights_proposals_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "song_rights_proposals_error_check" CHECK (((char_length(error) >= 1) AND (char_length(error) <= 1000))),
	CONSTRAINT "song_rights_proposals_error_kind_check" CHECK ((error_kind = ANY (ARRAY['no_lyrics'::text, 'temporary'::text, 'provider'::text]))),
	CONSTRAINT "song_rights_proposals_error_kind_status_check" CHECK (((error_kind IS NULL) OR (status = 'failed'::text))),
	CONSTRAINT "song_rights_proposals_model_check" CHECK (((char_length(model) >= 1) AND (char_length(model) <= 100))),
	CONSTRAINT "song_rights_proposals_provider_check" CHECK ((provider = ANY (ARRAY['anthropic'::text, 'openai'::text, 'google'::text, 'local'::text]))),
	CONSTRAINT "song_rights_proposals_result_check" CHECK (((status = ANY (ARRAY['running'::text, 'failed'::text])) OR (result IS NOT NULL))),
	CONSTRAINT "song_rights_proposals_status_check" CHECK ((status = ANY (ARRAY['running'::text, 'pending'::text, 'accepted'::text, 'rejected'::text, 'failed'::text])))
);
--> statement-breakpoint
ALTER TABLE "song_rights_proposals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "song_rights_research_settings" (
	"tenant_id" uuid NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"provider" text,
	"model" text,
	"nightly_limit" integer DEFAULT 20 NOT NULL,
	"api_key_hint" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "song_rights_research_settings_pkey" PRIMARY KEY("tenant_id"),
	CONSTRAINT "song_rights_research_settings_api_key_hint_check" CHECK (((char_length(api_key_hint) >= 1) AND (char_length(api_key_hint) <= 4))),
	CONSTRAINT "song_rights_research_settings_enabled_check" CHECK (((NOT enabled) OR ((provider IS NOT NULL) AND (model IS NOT NULL) AND (api_key_hint IS NOT NULL)))),
	CONSTRAINT "song_rights_research_settings_model_check" CHECK (((model = btrim(model)) AND ((char_length(model) >= 1) AND (char_length(model) <= 100)))),
	CONSTRAINT "song_rights_research_settings_nightly_limit_check" CHECK (((nightly_limit >= 1) AND (nightly_limit <= 100))),
	CONSTRAINT "song_rights_research_settings_provider_check" CHECK ((provider = ANY (ARRAY['anthropic'::text, 'openai'::text, 'google'::text])))
);
--> statement-breakpoint
ALTER TABLE "song_rights_research_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "song_scores" (
	"tenant_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"song_id" uuid NOT NULL,
	"name" text COLLATE "hu-HU-x-icu" NOT NULL,
	"file_name" text NOT NULL,
	"path" text NOT NULL,
	"musical_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "song_scores_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "song_scores_path_key" UNIQUE("tenant_id","path"),
	CONSTRAINT "song_scores_file_name_check" CHECK (((char_length(file_name) >= 1) AND (char_length(file_name) <= 200))),
	CONSTRAINT "song_scores_musical_key_check" CHECK ((musical_key ~ '^[A-G][#b]?m?$'::text)),
	CONSTRAINT "song_scores_name_check" CHECK (((name = btrim(name)) AND ((char_length(name) >= 1) AND (char_length(name) <= 100)))),
	CONSTRAINT "song_scores_path_check" CHECK ((path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(mxl|musicxml)$'::text)),
	CONSTRAINT "song_scores_path_song_id_check" CHECK ((split_part(path, '/'::text, 1) = (song_id)::text))
);
--> statement-breakpoint
ALTER TABLE "song_scores" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "song_sound_file_arrangements" (
	"tenant_id" uuid NOT NULL,
	"sound_file_id" uuid NOT NULL,
	"arrangement_id" uuid NOT NULL,
	"song_id" uuid NOT NULL,
	CONSTRAINT "song_sound_file_arrangements_pkey" PRIMARY KEY("tenant_id","sound_file_id","arrangement_id")
);
--> statement-breakpoint
ALTER TABLE "song_sound_file_arrangements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "song_sound_file_uploads" (
	"tenant_id" uuid NOT NULL,
	"path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid,
	CONSTRAINT "song_sound_file_uploads_pkey" PRIMARY KEY("tenant_id","path"),
	CONSTRAINT "song_sound_file_uploads_path_check" CHECK ((path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}$'::text))
);
--> statement-breakpoint
ALTER TABLE "song_sound_file_uploads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "song_sound_files" (
	"tenant_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"song_id" uuid NOT NULL,
	"name" text COLLATE "hu-HU-x-icu" NOT NULL,
	"file_name" text NOT NULL,
	"path" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"content_type" text NOT NULL,
	"musical_keys" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "song_sound_files_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "song_sound_files_id_song_id_key" UNIQUE("tenant_id","id","song_id"),
	CONSTRAINT "song_sound_files_path_key" UNIQUE("tenant_id","path"),
	CONSTRAINT "song_sound_files_content_type_check" CHECK ((content_type = ANY (ARRAY['audio/mpeg'::text, 'audio/aac'::text, 'audio/mp4'::text, 'audio/ogg'::text, 'audio/wav'::text, 'audio/flac'::text, 'audio/webm'::text]))),
	CONSTRAINT "song_sound_files_file_name_check" CHECK (((char_length(file_name) >= 1) AND (char_length(file_name) <= 200))),
	CONSTRAINT "song_sound_files_musical_keys_check" CHECK (((cardinality(musical_keys) <= 24) AND (array_position(musical_keys, NULL::text) IS NULL) AND (array_to_string(musical_keys, ','::text) ~ '^([A-G][#b]?m?(,[A-G][#b]?m?)*)?$'::text))),
	CONSTRAINT "song_sound_files_name_check" CHECK (((name = btrim(name)) AND ((char_length(name) >= 1) AND (char_length(name) <= 100)))),
	CONSTRAINT "song_sound_files_path_check" CHECK ((path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}$'::text)),
	CONSTRAINT "song_sound_files_path_song_id_check" CHECK ((split_part(path, '/'::text, 1) = (song_id)::text)),
	CONSTRAINT "song_sound_files_size_bytes_check" CHECK (((size_bytes >= 1) AND (size_bytes <= 20971520)))
);
--> statement-breakpoint
ALTER TABLE "song_sound_files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "songs" (
	"tenant_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text COLLATE "hu-HU-x-icu" NOT NULL,
	"artist" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"copyright" text,
	"songbook" text,
	"authors" text,
	"original_title" text,
	"translator" text,
	"rights_status" text DEFAULT 'unknown'::text NOT NULL,
	"rights_note" text,
	CONSTRAINT "songs_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "songs_artist_check" CHECK (((artist = btrim(artist)) AND ((char_length(artist) >= 1) AND (char_length(artist) <= 200)))),
	CONSTRAINT "songs_authors_check" CHECK (((authors = btrim(authors)) AND ((char_length(authors) >= 1) AND (char_length(authors) <= 500)))),
	CONSTRAINT "songs_copyright_check" CHECK (((copyright = btrim(copyright, ' 	
'::text)) AND ((char_length(copyright) >= 1) AND (char_length(copyright) <= 500)))),
	CONSTRAINT "songs_original_title_check" CHECK (((original_title = btrim(original_title)) AND ((char_length(original_title) >= 1) AND (char_length(original_title) <= 200)))),
	CONSTRAINT "songs_rights_note_check" CHECK (((rights_note = btrim(rights_note, ' 	
'::text)) AND ((char_length(rights_note) >= 1) AND (char_length(rights_note) <= 500)))),
	CONSTRAINT "songs_rights_status_check" CHECK ((rights_status = ANY (ARRAY['public_domain'::text, 'licensed'::text, 'permitted'::text, 'partial'::text, 'unknown'::text]))),
	CONSTRAINT "songs_songbook_check" CHECK (((songbook = btrim(songbook)) AND ((char_length(songbook) >= 1) AND (char_length(songbook) <= 200)))),
	CONSTRAINT "songs_tags_check" CHECK (valid_song_tags(tags)),
	CONSTRAINT "songs_title_check" CHECK (((title = btrim(title)) AND ((char_length(title) >= 1) AND (char_length(title) <= 200)))),
	CONSTRAINT "songs_translator_check" CHECK (((translator = btrim(translator)) AND ((char_length(translator) >= 1) AND (char_length(translator) <= 200))))
);
--> statement-breakpoint
ALTER TABLE "songs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "stray_files" (
	"tenant_id" uuid NOT NULL,
	"bucket" text NOT NULL,
	"path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stray_files_pkey" PRIMARY KEY("tenant_id","bucket","path"),
	CONSTRAINT "stray_files_bucket_check" CHECK ((bucket = ANY (ARRAY['pdfs'::text, 'scores'::text, 'avatars'::text, 'sound-files'::text, 'projection-backgrounds'::text, 'event-images'::text, 'course-images'::text, 'projection-videos'::text, 'branding'::text]))),
	CONSTRAINT "stray_files_path_check" CHECK (((char_length(path) >= 1) AND (char_length(path) <= 200)))
);
--> statement-breakpoint
ALTER TABLE "stray_files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_arrangement_views" (
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"arrangement_id" uuid NOT NULL,
	"device_type" text NOT NULL,
	"settings" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_arrangement_views_pkey" PRIMARY KEY("tenant_id","user_id","arrangement_id","device_type"),
	CONSTRAINT "user_arrangement_views_device_type_check" CHECK ((device_type = ANY (ARRAY['phone'::text, 'tablet'::text, 'desktop'::text]))),
	CONSTRAINT "user_arrangement_views_settings_check" CHECK (((jsonb_typeof(settings) = 'object'::text) AND (settings <> '{}'::jsonb) AND (pg_column_size(settings) < 2000)))
);
--> statement-breakpoint
ALTER TABLE "user_arrangement_views" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_arrangements" (
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"arrangement_id" uuid NOT NULL,
	"capo" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"musical_key" text,
	CONSTRAINT "user_arrangements_pkey" PRIMARY KEY("tenant_id","user_id","arrangement_id"),
	CONSTRAINT "user_arrangements_capo_check" CHECK (((capo >= 0) AND (capo <= 11))),
	CONSTRAINT "user_arrangements_has_setting" CHECK (((capo IS NOT NULL) OR (musical_key IS NOT NULL))),
	CONSTRAINT "user_arrangements_musical_key_check" CHECK ((musical_key ~ '^[A-G][#b]?m?$'::text))
);
--> statement-breakpoint
ALTER TABLE "user_arrangements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_file_views" (
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"pdf_id" uuid,
	"image_id" uuid,
	"zoom" real NOT NULL,
	"x" real NOT NULL,
	"y" real NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_file_views_image_id_user_id_key" UNIQUE("tenant_id","image_id","user_id"),
	CONSTRAINT "user_file_views_pdf_id_user_id_key" UNIQUE("tenant_id","pdf_id","user_id"),
	CONSTRAINT "user_file_views_one_file" CHECK ((num_nonnulls(pdf_id, image_id) = 1)),
	CONSTRAINT "user_file_views_x_check" CHECK (((x >= (0)::double precision) AND (x <= (1)::double precision))),
	CONSTRAINT "user_file_views_y_check" CHECK (((y >= (0)::double precision) AND (y <= (1)::double precision))),
	CONSTRAINT "user_file_views_zoom_check" CHECK (((zoom > (1)::double precision) AND (zoom <= (6)::double precision)))
);
--> statement-breakpoint
ALTER TABLE "user_file_views" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_setlist_item_id_fkey" FOREIGN KEY ("tenant_id","setlist_item_id") REFERENCES "public"."setlist_items"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_song_id_fkey" FOREIGN KEY ("tenant_id","song_id") REFERENCES "public"."songs"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_calendars" ADD CONSTRAINT "announcement_calendars_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_settings" ADD CONSTRAINT "announcement_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_settings" ADD CONSTRAINT "announcement_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_config" ADD CONSTRAINT "app_config_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_config" ADD CONSTRAINT "app_config_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_modules" ADD CONSTRAINT "app_modules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_modules" ADD CONSTRAINT "app_modules_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arrangements" ADD CONSTRAINT "arrangements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arrangements" ADD CONSTRAINT "arrangements_song_id_fkey" FOREIGN KEY ("tenant_id","song_id") REFERENCES "public"."songs"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_feeds" ADD CONSTRAINT "calendar_feeds_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_feeds" ADD CONSTRAINT "calendar_feeds_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_images" ADD CONSTRAINT "course_images_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_images" ADD CONSTRAINT "course_images_course_id_fkey" FOREIGN KEY ("tenant_id","course_id") REFERENCES "public"."courses"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_lessons" ADD CONSTRAINT "course_lessons_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_lessons" ADD CONSTRAINT "course_lessons_course_id_fkey" FOREIGN KEY ("tenant_id","course_id") REFERENCES "public"."courses"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mixer_settings" ADD CONSTRAINT "mixer_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mixer_settings" ADD CONSTRAINT "mixer_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projection_themes" ADD CONSTRAINT "projection_themes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projection_video_uploads" ADD CONSTRAINT "projection_video_uploads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projection_video_uploads" ADD CONSTRAINT "projection_video_uploads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scripture_books" ADD CONSTRAINT "scripture_books_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scripture_verse_cache" ADD CONSTRAINT "scripture_verse_cache_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setlist_item_durations" ADD CONSTRAINT "setlist_item_durations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setlist_item_durations" ADD CONSTRAINT "setlist_item_durations_setlist_item_id_fkey" FOREIGN KEY ("tenant_id","setlist_item_id") REFERENCES "public"."setlist_items"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setlist_item_themes" ADD CONSTRAINT "setlist_item_themes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setlist_item_themes" ADD CONSTRAINT "setlist_item_themes_setlist_item_id_fkey" FOREIGN KEY ("tenant_id","setlist_item_id") REFERENCES "public"."setlist_items"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setlist_item_themes" ADD CONSTRAINT "setlist_item_themes_theme_id_fkey" FOREIGN KEY ("tenant_id","theme_id") REFERENCES "public"."projection_themes"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setlist_items" ADD CONSTRAINT "setlist_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setlist_items" ADD CONSTRAINT "setlist_items_arrangement_id_fkey" FOREIGN KEY ("tenant_id","arrangement_id") REFERENCES "public"."arrangements"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setlist_items" ADD CONSTRAINT "setlist_items_setlist_id_fkey" FOREIGN KEY ("tenant_id","setlist_id") REFERENCES "public"."setlists"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setlists" ADD CONSTRAINT "setlists_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sheet_marks" ADD CONSTRAINT "sheet_marks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sheet_marks" ADD CONSTRAINT "sheet_marks_arrangement_id_fkey" FOREIGN KEY ("tenant_id","arrangement_id") REFERENCES "public"."arrangements"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sheet_marks" ADD CONSTRAINT "sheet_marks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_image_arrangements" ADD CONSTRAINT "song_image_arrangements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_image_arrangements" ADD CONSTRAINT "song_image_arrangements_arrangement_id_fkey" FOREIGN KEY ("tenant_id","arrangement_id","song_id") REFERENCES "public"."arrangements"("tenant_id","id","song_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_image_arrangements" ADD CONSTRAINT "song_image_arrangements_image_id_fkey" FOREIGN KEY ("tenant_id","image_id","song_id") REFERENCES "public"."song_images"("tenant_id","id","song_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_image_pages" ADD CONSTRAINT "song_image_pages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_image_pages" ADD CONSTRAINT "song_image_pages_image_id_fkey" FOREIGN KEY ("tenant_id","image_id") REFERENCES "public"."song_images"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_image_stray_files" ADD CONSTRAINT "song_image_stray_files_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_images" ADD CONSTRAINT "song_images_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_images" ADD CONSTRAINT "song_images_song_id_fkey" FOREIGN KEY ("tenant_id","song_id") REFERENCES "public"."songs"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_link_arrangements" ADD CONSTRAINT "song_link_arrangements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_link_arrangements" ADD CONSTRAINT "song_link_arrangements_arrangement_id_fkey" FOREIGN KEY ("tenant_id","arrangement_id","song_id") REFERENCES "public"."arrangements"("tenant_id","id","song_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_link_arrangements" ADD CONSTRAINT "song_link_arrangements_link_id_fkey" FOREIGN KEY ("tenant_id","link_id","song_id") REFERENCES "public"."song_links"("tenant_id","id","song_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_links" ADD CONSTRAINT "song_links_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_links" ADD CONSTRAINT "song_links_song_id_fkey" FOREIGN KEY ("tenant_id","song_id") REFERENCES "public"."songs"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_pdf_arrangements" ADD CONSTRAINT "song_pdf_arrangements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_pdf_arrangements" ADD CONSTRAINT "song_pdf_arrangements_arrangement_id_fkey" FOREIGN KEY ("tenant_id","arrangement_id","song_id") REFERENCES "public"."arrangements"("tenant_id","id","song_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_pdf_arrangements" ADD CONSTRAINT "song_pdf_arrangements_pdf_id_fkey" FOREIGN KEY ("tenant_id","pdf_id","song_id") REFERENCES "public"."song_pdfs"("tenant_id","id","song_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_pdf_uploads" ADD CONSTRAINT "song_pdf_uploads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_pdf_uploads" ADD CONSTRAINT "song_pdf_uploads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_pdfs" ADD CONSTRAINT "song_pdfs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_pdfs" ADD CONSTRAINT "song_pdfs_song_id_fkey" FOREIGN KEY ("tenant_id","song_id") REFERENCES "public"."songs"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_rights_proposals" ADD CONSTRAINT "song_rights_proposals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_rights_proposals" ADD CONSTRAINT "song_rights_proposals_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_rights_proposals" ADD CONSTRAINT "song_rights_proposals_song_id_fkey" FOREIGN KEY ("tenant_id","song_id") REFERENCES "public"."songs"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_rights_research_settings" ADD CONSTRAINT "song_rights_research_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_rights_research_settings" ADD CONSTRAINT "song_rights_research_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_scores" ADD CONSTRAINT "song_scores_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_scores" ADD CONSTRAINT "song_scores_song_id_fkey" FOREIGN KEY ("tenant_id","song_id") REFERENCES "public"."songs"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_sound_file_arrangements" ADD CONSTRAINT "song_sound_file_arrangements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_sound_file_arrangements" ADD CONSTRAINT "song_sound_file_arrangements_arrangement_id_fkey" FOREIGN KEY ("tenant_id","arrangement_id","song_id") REFERENCES "public"."arrangements"("tenant_id","id","song_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_sound_file_arrangements" ADD CONSTRAINT "song_sound_file_arrangements_sound_file_id_fkey" FOREIGN KEY ("tenant_id","sound_file_id","song_id") REFERENCES "public"."song_sound_files"("tenant_id","id","song_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_sound_file_uploads" ADD CONSTRAINT "song_sound_file_uploads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_sound_file_uploads" ADD CONSTRAINT "song_sound_file_uploads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_sound_files" ADD CONSTRAINT "song_sound_files_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_sound_files" ADD CONSTRAINT "song_sound_files_song_id_fkey" FOREIGN KEY ("tenant_id","song_id") REFERENCES "public"."songs"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "songs" ADD CONSTRAINT "songs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stray_files" ADD CONSTRAINT "stray_files_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_arrangement_views" ADD CONSTRAINT "user_arrangement_views_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_arrangement_views" ADD CONSTRAINT "user_arrangement_views_arrangement_id_fkey" FOREIGN KEY ("tenant_id","arrangement_id") REFERENCES "public"."arrangements"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_arrangement_views" ADD CONSTRAINT "user_arrangement_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_arrangements" ADD CONSTRAINT "user_arrangements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_arrangements" ADD CONSTRAINT "user_arrangements_arrangement_id_fkey" FOREIGN KEY ("tenant_id","arrangement_id") REFERENCES "public"."arrangements"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_arrangements" ADD CONSTRAINT "user_arrangements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_file_views" ADD CONSTRAINT "user_file_views_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_file_views" ADD CONSTRAINT "user_file_views_image_id_fkey" FOREIGN KEY ("tenant_id","image_id") REFERENCES "public"."song_images"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_file_views" ADD CONSTRAINT "user_file_views_pdf_id_fkey" FOREIGN KEY ("tenant_id","pdf_id") REFERENCES "public"."song_pdfs"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_file_views" ADD CONSTRAINT "user_file_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "annotations_tenant_id_idx" ON "annotations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "annotations_user_id_song_id_idx" ON "annotations" USING btree ("user_id","song_id");--> statement-breakpoint
CREATE INDEX "annotations_setlist_item_id_idx" ON "annotations" USING btree ("setlist_item_id");--> statement-breakpoint
CREATE INDEX "annotations_song_id_idx" ON "annotations" USING btree ("song_id");--> statement-breakpoint
CREATE INDEX "announcement_calendars_tenant_id_idx" ON "announcement_calendars" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "announcement_settings_updated_by_idx" ON "announcement_settings" USING btree ("updated_by");--> statement-breakpoint
CREATE INDEX "app_config_updated_by_idx" ON "app_config" USING btree ("updated_by");--> statement-breakpoint
CREATE INDEX "app_modules_tenant_id_idx" ON "app_modules" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "app_modules_updated_by_idx" ON "app_modules" USING btree ("updated_by");--> statement-breakpoint
CREATE INDEX "arrangements_tenant_id_idx" ON "arrangements" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "arrangements_song_id_idx" ON "arrangements" USING btree ("song_id");--> statement-breakpoint
CREATE INDEX "arrangements_projection_theme_id_idx" ON "arrangements" USING btree ("projection_theme_id");--> statement-breakpoint
CREATE INDEX "calendar_feeds_tenant_id_idx" ON "calendar_feeds" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "course_images_tenant_id_idx" ON "course_images" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "course_images_course_id_idx" ON "course_images" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "course_lessons_tenant_id_idx" ON "course_lessons" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "course_lessons_course_id_idx" ON "course_lessons" USING btree ("course_id","position");--> statement-breakpoint
CREATE INDEX "courses_tenant_id_idx" ON "courses" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "email_templates_tenant_id_idx" ON "email_templates" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "email_templates_updated_by_idx" ON "email_templates" USING btree ("updated_by");--> statement-breakpoint
CREATE INDEX "mixer_settings_updated_by_idx" ON "mixer_settings" USING btree ("updated_by");--> statement-breakpoint
CREATE INDEX "notification_preferences_tenant_id_idx" ON "notification_preferences" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "projection_themes_tenant_id_idx" ON "projection_themes" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "projection_video_uploads_tenant_id_idx" ON "projection_video_uploads" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "projection_video_uploads_created_at_idx" ON "projection_video_uploads" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "projection_video_uploads_user_id_created_at_idx" ON "projection_video_uploads" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "push_subscriptions_tenant_id_idx" ON "push_subscriptions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "scripture_books_tenant_id_idx" ON "scripture_books" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "scripture_verse_cache_tenant_id_idx" ON "scripture_verse_cache" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "scripture_verse_cache_cached_at_idx" ON "scripture_verse_cache" USING btree ("cached_at");--> statement-breakpoint
CREATE INDEX "setlist_item_durations_tenant_id_idx" ON "setlist_item_durations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "setlist_item_themes_tenant_id_idx" ON "setlist_item_themes" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "setlist_item_themes_theme_id_idx" ON "setlist_item_themes" USING btree ("theme_id");--> statement-breakpoint
CREATE INDEX "setlist_items_tenant_id_idx" ON "setlist_items" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "setlist_items_arrangement_id_idx" ON "setlist_items" USING btree ("arrangement_id");--> statement-breakpoint
CREATE INDEX "setlist_items_image_set_id_idx" ON "setlist_items" USING btree ("image_set_id");--> statement-breakpoint
CREATE INDEX "setlist_items_announcement_id_idx" ON "setlist_items" USING btree ("announcement_id");--> statement-breakpoint
CREATE INDEX "setlists_tenant_id_idx" ON "setlists" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "sheet_marks_tenant_id_idx" ON "sheet_marks" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "sheet_marks_user_id_arrangement_id_idx" ON "sheet_marks" USING btree ("user_id","arrangement_id");--> statement-breakpoint
CREATE INDEX "sheet_marks_arrangement_id_idx" ON "sheet_marks" USING btree ("arrangement_id");--> statement-breakpoint
CREATE INDEX "song_image_arrangements_tenant_id_idx" ON "song_image_arrangements" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "song_image_arrangements_arrangement_id_idx" ON "song_image_arrangements" USING btree ("arrangement_id","song_id");--> statement-breakpoint
CREATE INDEX "song_image_pages_tenant_id_idx" ON "song_image_pages" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "song_image_stray_files_tenant_id_idx" ON "song_image_stray_files" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "song_image_stray_files_created_at_idx" ON "song_image_stray_files" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "song_images_tenant_id_idx" ON "song_images" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "song_images_song_id_idx" ON "song_images" USING btree ("song_id");--> statement-breakpoint
CREATE INDEX "song_link_arrangements_tenant_id_idx" ON "song_link_arrangements" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "song_link_arrangements_arrangement_id_idx" ON "song_link_arrangements" USING btree ("arrangement_id","song_id");--> statement-breakpoint
CREATE INDEX "song_links_tenant_id_idx" ON "song_links" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "song_links_song_id_idx" ON "song_links" USING btree ("song_id");--> statement-breakpoint
CREATE INDEX "song_pdf_arrangements_tenant_id_idx" ON "song_pdf_arrangements" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "song_pdf_arrangements_arrangement_id_idx" ON "song_pdf_arrangements" USING btree ("arrangement_id","song_id");--> statement-breakpoint
CREATE INDEX "song_pdf_uploads_tenant_id_idx" ON "song_pdf_uploads" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "song_pdf_uploads_created_at_idx" ON "song_pdf_uploads" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "song_pdf_uploads_user_id_created_at_idx" ON "song_pdf_uploads" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "song_pdfs_tenant_id_idx" ON "song_pdfs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "song_pdfs_song_id_idx" ON "song_pdfs" USING btree ("song_id");--> statement-breakpoint
CREATE INDEX "song_rights_proposals_tenant_id_idx" ON "song_rights_proposals" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "song_rights_proposals_status_idx" ON "song_rights_proposals" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "song_rights_proposals_reviewed_by_idx" ON "song_rights_proposals" USING btree ("reviewed_by");--> statement-breakpoint
CREATE INDEX "song_rights_research_settings_updated_by_idx" ON "song_rights_research_settings" USING btree ("updated_by");--> statement-breakpoint
CREATE INDEX "song_scores_tenant_id_idx" ON "song_scores" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "song_sound_file_arrangements_tenant_id_idx" ON "song_sound_file_arrangements" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "song_sound_file_arrangements_arrangement_id_idx" ON "song_sound_file_arrangements" USING btree ("arrangement_id","song_id");--> statement-breakpoint
CREATE INDEX "song_sound_file_uploads_tenant_id_idx" ON "song_sound_file_uploads" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "song_sound_file_uploads_created_at_idx" ON "song_sound_file_uploads" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "song_sound_file_uploads_user_id_created_at_idx" ON "song_sound_file_uploads" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "song_sound_files_tenant_id_idx" ON "song_sound_files" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "song_sound_files_song_id_idx" ON "song_sound_files" USING btree ("song_id");--> statement-breakpoint
CREATE INDEX "songs_tenant_id_idx" ON "songs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "songs_title_id_idx" ON "songs" USING btree ("title","id");--> statement-breakpoint
CREATE INDEX "stray_files_tenant_id_idx" ON "stray_files" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "stray_files_created_at_idx" ON "stray_files" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "user_arrangement_views_tenant_id_idx" ON "user_arrangement_views" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "user_arrangement_views_arrangement_id_idx" ON "user_arrangement_views" USING btree ("arrangement_id");--> statement-breakpoint
CREATE INDEX "user_arrangements_tenant_id_idx" ON "user_arrangements" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "user_arrangements_arrangement_id_idx" ON "user_arrangements" USING btree ("arrangement_id");--> statement-breakpoint
CREATE INDEX "user_file_views_tenant_id_idx" ON "user_file_views" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "user_file_views_user_id_idx" ON "user_file_views" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_song_id_fkey" FOREIGN KEY ("tenant_id","song_id") REFERENCES "public"."songs"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_arrangement_id_fkey" FOREIGN KEY ("tenant_id","arrangement_id") REFERENCES "public"."arrangements"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_hymnal_refs" ADD CONSTRAINT "song_hymnal_refs_song_id_fkey" FOREIGN KEY ("tenant_id","song_id") REFERENCES "public"."songs"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
DROP TYPE "public"."song_licence";
