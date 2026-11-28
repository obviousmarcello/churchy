/**
 * Music module tables (merged Music Sheet DB, docs/music-merge/PLAN.md §4, §11, §11.1).
 *
 * Extracted from the music app's final schema (its 151 migrations applied to a Postgres with
 * Supabase stubs, then read from the catalog by a one-off script) and made tenant-scoped:
 * `tenant_id` + index on every table, `(tenant_id, …)` primary/unique keys, composite
 * `(tenant_id, x_id)` foreign keys, `auth.users` references → `profiles.id`. Single-row tables
 * (`app_config`, `mixer_settings`, …) are keyed by `tenant_id`. Bible text (`scripture_*`) is a
 * catalog (platform rows: tenant_id null). What Drizzle cannot express (ON DELETE SET NULL (col),
 * DEFERRABLE / partial / expression keys) is in migration 0007_music_rls; the helper functions
 * of generated columns and CHECKs are in 0005_music_functions. Tables tied to events or volunteer
 * areas are not here yet (phase 4; see docs/music-merge/FUNCTIONS.md and PLAN §13).
 * From now on this file is edited by hand.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  time,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { huText, tenantIndexes, timestamptz, tsvector } from "./columns";
import { events } from "./people";
import { profiles, tenantId as platformTenantId, tenants } from "./platform";

/**
 * Tenant column of the music tables. Defaults to the request's tenant (`app.current_tenant_id()`:
 * `app.tenant_id` or the churchy JWT claim), so the music models and their SQL functions insert
 * without naming it, as in the music app; `tenant_isolation` checks it (music phase 2).
 */
const tenantId = () => platformTenantId().default(sql`app.current_tenant_id()`);

export const songs = pgTable(
  "songs",
  {
    tenantId: tenantId(),
    id: uuid().primaryKey().defaultRandom(),
    title: huText().notNull(),
    artist: text(),
    createdAt: timestamptz().notNull().defaultNow(),
    updatedAt: timestamptz().notNull().defaultNow(),
    tags: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    copyright: text(),
    songbook: text(),
    authors: text(),
    originalTitle: text(),
    translator: text(),
    rightsStatus: text()
      .notNull()
      .default(sql`'unknown'::text`),
    rightsNote: text(),
  },
  (t) => [
    ...tenantIndexes("songs", t),
    check(
      "songs_artist_check",
      sql`((artist = btrim(artist)) AND ((char_length(artist) >= 1) AND (char_length(artist) <= 200)))`,
    ),
    check(
      "songs_authors_check",
      sql`((authors = btrim(authors)) AND ((char_length(authors) >= 1) AND (char_length(authors) <= 500)))`,
    ),
    check(
      "songs_copyright_check",
      sql`((copyright = btrim(copyright, ' 	
'::text)) AND ((char_length(copyright) >= 1) AND (char_length(copyright) <= 500)))`,
    ),
    check(
      "songs_original_title_check",
      sql`((original_title = btrim(original_title)) AND ((char_length(original_title) >= 1) AND (char_length(original_title) <= 200)))`,
    ),
    check(
      "songs_rights_note_check",
      sql`((rights_note = btrim(rights_note, ' 	
'::text)) AND ((char_length(rights_note) >= 1) AND (char_length(rights_note) <= 500)))`,
    ),
    check(
      "songs_rights_status_check",
      sql`(rights_status = ANY (ARRAY['public_domain'::text, 'licensed'::text, 'permitted'::text, 'partial'::text, 'unknown'::text]))`,
    ),
    check(
      "songs_songbook_check",
      sql`((songbook = btrim(songbook)) AND ((char_length(songbook) >= 1) AND (char_length(songbook) <= 200)))`,
    ),
    check("songs_tags_check", sql`valid_song_tags(tags)`),
    check(
      "songs_title_check",
      sql`((title = btrim(title)) AND ((char_length(title) >= 1) AND (char_length(title) <= 200)))`,
    ),
    check(
      "songs_translator_check",
      sql`((translator = btrim(translator)) AND ((char_length(translator) >= 1) AND (char_length(translator) <= 200)))`,
    ),
    index("songs_title_id_idx").on(t.title, t.id),
  ],
).enableRLS();

export const arrangements = pgTable(
  "arrangements",
  {
    tenantId: tenantId(),
    id: uuid().primaryKey().defaultRandom(),
    songId: uuid().notNull(),
    name: huText().notNull(),
    chordpro: text()
      .notNull()
      .default(sql`''::text`),
    sectionOrder: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    isDefault: boolean()
      .notNull()
      .default(sql`false`),
    musicalKey: text().generatedAlwaysAs(
      sql`"substring"(chordpro, '(?n)^\\s*\\{\\s*key\\s*:\\s*([^}]*?)\\s*\\}'::text)`,
    ),
    createdAt: timestamptz().notNull().defaultNow(),
    updatedAt: timestamptz().notNull().defaultNow(),
    tempoBpm: integer().generatedAlwaysAs(sql`
CASE
    WHEN (chordpro_directive(chordpro, 'tempo'::text) ~ '^[0-9]{1,3}$'::text) THEN (chordpro_directive(chordpro, 'tempo'::text))::integer
    ELSE NULL::integer
END`),
    timeSignature: text().generatedAlwaysAs(sql`
CASE
    WHEN (chordpro_directive(chordpro, 'time'::text) ~ '^[0-9]{1,2}/[0-9]{1,2}$'::text) THEN chordpro_directive(chordpro, 'time'::text)
    ELSE NULL::text
END`),
    durationSeconds: integer().generatedAlwaysAs(sql`
CASE
    WHEN (chordpro_directive(chordpro, 'duration'::text) ~ '^[0-9]{1,5}$'::text) THEN (chordpro_directive(chordpro, 'duration'::text))::integer
    WHEN (chordpro_directive(chordpro, 'duration'::text) ~ '^[0-9]{1,3}:[0-5][0-9]$'::text) THEN (((split_part(chordpro_directive(chordpro, 'duration'::text), ':'::text, 1))::integer * 60) + (split_part(chordpro_directive(chordpro, 'duration'::text), ':'::text, 2))::integer)
    ELSE NULL::integer
END`),
    otherKeys: text()
      .array()
      .generatedAlwaysAs(
        sql`COALESCE(regexp_split_to_array(NULLIF(btrim(chordpro_directive(chordpro, 'x_other_keys'::text)), ''::text), '[\\s,;]+'::text), '{}'::text[])`,
      ),
    chordNotation: text().generatedAlwaysAs(sql`chart_notation(chordpro)`),
    keyNames: text()
      .array()
      .generatedAlwaysAs(sql`chart_key_names(chordpro)`),
    searchVector: tsvector().generatedAlwaysAs(
      sql`to_tsvector('simple_unaccent'::regconfig, ((name || ' '::text) || regexp_replace(regexp_replace(chordpro, '\\[[^]]*\\]'::text, ''::text, 'g'::text), '\\{[^}]*\\}'::text, ' '::text, 'g'::text)))`,
    ),
    projectionThemeId: uuid(),
  },
  (t) => [
    ...tenantIndexes("arrangements", t),
    check("arrangements_chordpro_check", sql`(char_length(chordpro) <= 50000)`),
    unique("arrangements_id_song_id_key").on(t.tenantId, t.id, t.songId),
    check(
      "arrangements_name_check",
      sql`((name = btrim(name)) AND ((char_length(name) >= 1) AND (char_length(name) <= 200)))`,
    ),
    check("arrangements_section_order_check", sql`(cardinality(section_order) <= 50)`),
    foreignKey({
      name: "arrangements_song_id_fkey",
      columns: [t.tenantId, t.songId],
      foreignColumns: [songs.tenantId, songs.id],
    }).onDelete("cascade"),
    index("arrangements_song_id_idx").on(t.songId),
    index("arrangements_projection_theme_id_idx").on(t.projectionThemeId),
  ],
).enableRLS();

export const songPdfs = pgTable(
  "song_pdfs",
  {
    tenantId: tenantId(),
    id: uuid().primaryKey().defaultRandom(),
    songId: uuid().notNull(),
    name: huText().notNull(),
    fileName: text().notNull(),
    path: text().notNull(),
    sizeBytes: integer().notNull(),
    musicalKeys: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    createdAt: timestamptz().notNull().defaultNow(),
    updatedAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    ...tenantIndexes("song_pdfs", t),
    check(
      "song_pdfs_file_name_check",
      sql`((char_length(file_name) >= 1) AND (char_length(file_name) <= 200))`,
    ),
    unique("song_pdfs_id_song_id_key").on(t.tenantId, t.id, t.songId),
    check(
      "song_pdfs_musical_keys_check",
      sql`((cardinality(musical_keys) <= 24) AND (array_position(musical_keys, NULL::text) IS NULL) AND (array_to_string(musical_keys, ','::text) ~ '^([A-G][#b]?m?(,[A-G][#b]?m?)*)?$'::text))`,
    ),
    check(
      "song_pdfs_name_check",
      sql`((name = btrim(name)) AND ((char_length(name) >= 1) AND (char_length(name) <= 100)))`,
    ),
    check("song_pdfs_path_check", sql`(path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\\.pdf$'::text)`),
    unique("song_pdfs_path_key").on(t.tenantId, t.path),
    check("song_pdfs_path_song_id_check", sql`(split_part(path, '/'::text, 1) = (song_id)::text)`),
    check("song_pdfs_size_bytes_check", sql`((size_bytes >= 1) AND (size_bytes <= 10485760))`),
    foreignKey({
      name: "song_pdfs_song_id_fkey",
      columns: [t.tenantId, t.songId],
      foreignColumns: [songs.tenantId, songs.id],
    }).onDelete("cascade"),
    index("song_pdfs_song_id_idx").on(t.songId),
  ],
).enableRLS();

export const songPdfArrangements = pgTable(
  "song_pdf_arrangements",
  {
    tenantId: tenantId(),
    pdfId: uuid().notNull(),
    arrangementId: uuid().notNull(),
    songId: uuid().notNull(),
  },
  (t) => [
    index("song_pdf_arrangements_tenant_id_idx").on(t.tenantId),
    primaryKey({
      name: "song_pdf_arrangements_pkey",
      columns: [t.tenantId, t.pdfId, t.arrangementId],
    }),
    foreignKey({
      name: "song_pdf_arrangements_arrangement_id_fkey",
      columns: [t.tenantId, t.arrangementId, t.songId],
      foreignColumns: [arrangements.tenantId, arrangements.id, arrangements.songId],
    }).onDelete("cascade"),
    foreignKey({
      name: "song_pdf_arrangements_pdf_id_fkey",
      columns: [t.tenantId, t.pdfId, t.songId],
      foreignColumns: [songPdfs.tenantId, songPdfs.id, songPdfs.songId],
    }).onDelete("cascade"),
    index("song_pdf_arrangements_arrangement_id_idx").on(t.arrangementId, t.songId),
  ],
).enableRLS();

export const songPdfUploads = pgTable(
  "song_pdf_uploads",
  {
    tenantId: tenantId(),
    path: text().notNull(),
    createdAt: timestamptz().notNull().defaultNow(),
    userId: uuid(),
  },
  (t) => [
    index("song_pdf_uploads_tenant_id_idx").on(t.tenantId),
    primaryKey({ name: "song_pdf_uploads_pkey", columns: [t.tenantId, t.path] }),
    check("song_pdf_uploads_path_check", sql`(path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\\.pdf$'::text)`),
    foreignKey({
      name: "song_pdf_uploads_user_id_fkey",
      columns: [t.userId],
      foreignColumns: [profiles.id],
    }).onDelete("set null"),
    index("song_pdf_uploads_created_at_idx").on(t.createdAt),
    index("song_pdf_uploads_user_id_created_at_idx").on(t.userId, t.createdAt),
  ],
).enableRLS();

export const songImages = pgTable(
  "song_images",
  {
    tenantId: tenantId(),
    id: uuid().primaryKey().defaultRandom(),
    songId: uuid().notNull(),
    name: huText().notNull(),
    musicalKeys: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    createdAt: timestamptz().notNull().defaultNow(),
    updatedAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    ...tenantIndexes("song_images", t),
    unique("song_images_id_song_id_key").on(t.tenantId, t.id, t.songId),
    check(
      "song_images_musical_keys_check",
      sql`((cardinality(musical_keys) <= 24) AND (array_position(musical_keys, NULL::text) IS NULL) AND (array_to_string(musical_keys, ','::text) ~ '^([A-G][#b]?m?(,[A-G][#b]?m?)*)?$'::text))`,
    ),
    check(
      "song_images_name_check",
      sql`((name = btrim(name)) AND ((char_length(name) >= 1) AND (char_length(name) <= 100)))`,
    ),
    foreignKey({
      name: "song_images_song_id_fkey",
      columns: [t.tenantId, t.songId],
      foreignColumns: [songs.tenantId, songs.id],
    }).onDelete("cascade"),
    index("song_images_song_id_idx").on(t.songId),
  ],
).enableRLS();

export const songImagePages = pgTable(
  "song_image_pages",
  {
    tenantId: tenantId(),
    id: uuid().primaryKey().defaultRandom(),
    imageId: uuid().notNull(),
    position: integer().notNull(),
    path: text().notNull(),
    width: integer().notNull(),
    height: integer().notNull(),
    sizeBytes: integer().notNull(),
    createdAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    ...tenantIndexes("song_image_pages", t),
    check("song_image_pages_height_check", sql`((height >= 1) AND (height <= 10000))`),
    foreignKey({
      name: "song_image_pages_image_id_fkey",
      columns: [t.tenantId, t.imageId],
      foreignColumns: [songImages.tenantId, songImages.id],
    }).onDelete("cascade"),
    check(
      "song_image_pages_path_check",
      sql`(path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\\.webp$'::text)`,
    ),
    check(
      "song_image_pages_path_image_id_check",
      sql`(split_part(path, '/'::text, 2) = (image_id)::text)`,
    ),
    unique("song_image_pages_path_key").on(t.tenantId, t.path),
    check("song_image_pages_position_check", sql`("position" >= 1)`),
    check(
      "song_image_pages_size_bytes_check",
      sql`((size_bytes >= 1) AND (size_bytes <= 5242880))`,
    ),
    check("song_image_pages_width_check", sql`((width >= 1) AND (width <= 10000))`),
  ],
).enableRLS();

export const songImageArrangements = pgTable(
  "song_image_arrangements",
  {
    tenantId: tenantId(),
    imageId: uuid().notNull(),
    arrangementId: uuid().notNull(),
    songId: uuid().notNull(),
  },
  (t) => [
    index("song_image_arrangements_tenant_id_idx").on(t.tenantId),
    primaryKey({
      name: "song_image_arrangements_pkey",
      columns: [t.tenantId, t.imageId, t.arrangementId],
    }),
    foreignKey({
      name: "song_image_arrangements_arrangement_id_fkey",
      columns: [t.tenantId, t.arrangementId, t.songId],
      foreignColumns: [arrangements.tenantId, arrangements.id, arrangements.songId],
    }).onDelete("cascade"),
    foreignKey({
      name: "song_image_arrangements_image_id_fkey",
      columns: [t.tenantId, t.imageId, t.songId],
      foreignColumns: [songImages.tenantId, songImages.id, songImages.songId],
    }).onDelete("cascade"),
    index("song_image_arrangements_arrangement_id_idx").on(t.arrangementId, t.songId),
  ],
).enableRLS();

export const songImageStrayFiles = pgTable(
  "song_image_stray_files",
  {
    tenantId: tenantId(),
    path: text().notNull(),
    createdAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    index("song_image_stray_files_tenant_id_idx").on(t.tenantId),
    primaryKey({ name: "song_image_stray_files_pkey", columns: [t.tenantId, t.path] }),
    check(
      "song_image_stray_files_path_check",
      sql`(path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\\.webp$'::text)`,
    ),
    index("song_image_stray_files_created_at_idx").on(t.createdAt),
  ],
).enableRLS();

export const strayFiles = pgTable(
  "stray_files",
  {
    tenantId: tenantId(),
    bucket: text().notNull(),
    path: text().notNull(),
    createdAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    index("stray_files_tenant_id_idx").on(t.tenantId),
    primaryKey({ name: "stray_files_pkey", columns: [t.tenantId, t.bucket, t.path] }),
    check(
      "stray_files_bucket_check",
      sql`(bucket = ANY (ARRAY['pdfs'::text, 'scores'::text, 'avatars'::text, 'sound-files'::text, 'projection-backgrounds'::text, 'event-images'::text, 'course-images'::text, 'projection-videos'::text, 'branding'::text]))`,
    ),
    check("stray_files_path_check", sql`((char_length(path) >= 1) AND (char_length(path) <= 200))`),
    index("stray_files_created_at_idx").on(t.createdAt),
  ],
).enableRLS();

export const songScores = pgTable(
  "song_scores",
  {
    tenantId: tenantId(),
    id: uuid().primaryKey().defaultRandom(),
    songId: uuid().notNull(),
    name: huText().notNull(),
    fileName: text().notNull(),
    path: text().notNull(),
    musicalKey: text(),
    createdAt: timestamptz().notNull().defaultNow(),
    updatedAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    ...tenantIndexes("song_scores", t),
    check(
      "song_scores_file_name_check",
      sql`((char_length(file_name) >= 1) AND (char_length(file_name) <= 200))`,
    ),
    check("song_scores_musical_key_check", sql`(musical_key ~ '^[A-G][#b]?m?$'::text)`),
    check(
      "song_scores_name_check",
      sql`((name = btrim(name)) AND ((char_length(name) >= 1) AND (char_length(name) <= 100)))`,
    ),
    check(
      "song_scores_path_check",
      sql`(path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\\.(mxl|musicxml)$'::text)`,
    ),
    unique("song_scores_path_key").on(t.tenantId, t.path),
    check(
      "song_scores_path_song_id_check",
      sql`(split_part(path, '/'::text, 1) = (song_id)::text)`,
    ),
    foreignKey({
      name: "song_scores_song_id_fkey",
      columns: [t.tenantId, t.songId],
      foreignColumns: [songs.tenantId, songs.id],
    }).onDelete("cascade"),
  ],
).enableRLS();

export const songSoundFiles = pgTable(
  "song_sound_files",
  {
    tenantId: tenantId(),
    id: uuid().primaryKey().defaultRandom(),
    songId: uuid().notNull(),
    name: huText().notNull(),
    fileName: text().notNull(),
    path: text().notNull(),
    sizeBytes: integer().notNull(),
    contentType: text().notNull(),
    musicalKeys: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    createdAt: timestamptz().notNull().defaultNow(),
    updatedAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    ...tenantIndexes("song_sound_files", t),
    check(
      "song_sound_files_content_type_check",
      sql`(content_type = ANY (ARRAY['audio/mpeg'::text, 'audio/aac'::text, 'audio/mp4'::text, 'audio/ogg'::text, 'audio/wav'::text, 'audio/flac'::text, 'audio/webm'::text]))`,
    ),
    check(
      "song_sound_files_file_name_check",
      sql`((char_length(file_name) >= 1) AND (char_length(file_name) <= 200))`,
    ),
    unique("song_sound_files_id_song_id_key").on(t.tenantId, t.id, t.songId),
    check(
      "song_sound_files_musical_keys_check",
      sql`((cardinality(musical_keys) <= 24) AND (array_position(musical_keys, NULL::text) IS NULL) AND (array_to_string(musical_keys, ','::text) ~ '^([A-G][#b]?m?(,[A-G][#b]?m?)*)?$'::text))`,
    ),
    check(
      "song_sound_files_name_check",
      sql`((name = btrim(name)) AND ((char_length(name) >= 1) AND (char_length(name) <= 100)))`,
    ),
    check("song_sound_files_path_check", sql`(path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}$'::text)`),
    unique("song_sound_files_path_key").on(t.tenantId, t.path),
    check(
      "song_sound_files_path_song_id_check",
      sql`(split_part(path, '/'::text, 1) = (song_id)::text)`,
    ),
    check(
      "song_sound_files_size_bytes_check",
      sql`((size_bytes >= 1) AND (size_bytes <= 20971520))`,
    ),
    foreignKey({
      name: "song_sound_files_song_id_fkey",
      columns: [t.tenantId, t.songId],
      foreignColumns: [songs.tenantId, songs.id],
    }).onDelete("cascade"),
    index("song_sound_files_song_id_idx").on(t.songId),
  ],
).enableRLS();

export const songSoundFileArrangements = pgTable(
  "song_sound_file_arrangements",
  {
    tenantId: tenantId(),
    soundFileId: uuid().notNull(),
    arrangementId: uuid().notNull(),
    songId: uuid().notNull(),
  },
  (t) => [
    index("song_sound_file_arrangements_tenant_id_idx").on(t.tenantId),
    primaryKey({
      name: "song_sound_file_arrangements_pkey",
      columns: [t.tenantId, t.soundFileId, t.arrangementId],
    }),
    foreignKey({
      name: "song_sound_file_arrangements_arrangement_id_fkey",
      columns: [t.tenantId, t.arrangementId, t.songId],
      foreignColumns: [arrangements.tenantId, arrangements.id, arrangements.songId],
    }).onDelete("cascade"),
    foreignKey({
      name: "song_sound_file_arrangements_sound_file_id_fkey",
      columns: [t.tenantId, t.soundFileId, t.songId],
      foreignColumns: [songSoundFiles.tenantId, songSoundFiles.id, songSoundFiles.songId],
    }).onDelete("cascade"),
    index("song_sound_file_arrangements_arrangement_id_idx").on(t.arrangementId, t.songId),
  ],
).enableRLS();

export const songSoundFileUploads = pgTable(
  "song_sound_file_uploads",
  {
    tenantId: tenantId(),
    path: text().notNull(),
    createdAt: timestamptz().notNull().defaultNow(),
    userId: uuid(),
  },
  (t) => [
    index("song_sound_file_uploads_tenant_id_idx").on(t.tenantId),
    primaryKey({ name: "song_sound_file_uploads_pkey", columns: [t.tenantId, t.path] }),
    check(
      "song_sound_file_uploads_path_check",
      sql`(path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}$'::text)`,
    ),
    foreignKey({
      name: "song_sound_file_uploads_user_id_fkey",
      columns: [t.userId],
      foreignColumns: [profiles.id],
    }).onDelete("set null"),
    index("song_sound_file_uploads_created_at_idx").on(t.createdAt),
    index("song_sound_file_uploads_user_id_created_at_idx").on(t.userId, t.createdAt),
  ],
).enableRLS();

export const songLinks = pgTable(
  "song_links",
  {
    tenantId: tenantId(),
    id: uuid().primaryKey().defaultRandom(),
    songId: uuid().notNull(),
    name: huText().notNull(),
    url: text().notNull(),
    musicalKeys: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    createdAt: timestamptz().notNull().defaultNow(),
    updatedAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    ...tenantIndexes("song_links", t),
    unique("song_links_id_song_id_key").on(t.tenantId, t.id, t.songId),
    check(
      "song_links_musical_keys_check",
      sql`((cardinality(musical_keys) <= 24) AND (array_position(musical_keys, NULL::text) IS NULL) AND (array_to_string(musical_keys, ','::text) ~ '^([A-G][#b]?m?(,[A-G][#b]?m?)*)?$'::text))`,
    ),
    check(
      "song_links_name_check",
      sql`((name = btrim(name)) AND ((char_length(name) >= 1) AND (char_length(name) <= 100)))`,
    ),
    foreignKey({
      name: "song_links_song_id_fkey",
      columns: [t.tenantId, t.songId],
      foreignColumns: [songs.tenantId, songs.id],
    }).onDelete("cascade"),
    check(
      "song_links_url_check",
      sql`((char_length(url) <= 2000) AND (url ~ '^https?://[^/?#]+'::text))`,
    ),
    index("song_links_song_id_idx").on(t.songId),
  ],
).enableRLS();

export const songLinkArrangements = pgTable(
  "song_link_arrangements",
  {
    tenantId: tenantId(),
    linkId: uuid().notNull(),
    arrangementId: uuid().notNull(),
    songId: uuid().notNull(),
  },
  (t) => [
    index("song_link_arrangements_tenant_id_idx").on(t.tenantId),
    primaryKey({
      name: "song_link_arrangements_pkey",
      columns: [t.tenantId, t.linkId, t.arrangementId],
    }),
    foreignKey({
      name: "song_link_arrangements_arrangement_id_fkey",
      columns: [t.tenantId, t.arrangementId, t.songId],
      foreignColumns: [arrangements.tenantId, arrangements.id, arrangements.songId],
    }).onDelete("cascade"),
    foreignKey({
      name: "song_link_arrangements_link_id_fkey",
      columns: [t.tenantId, t.linkId, t.songId],
      foreignColumns: [songLinks.tenantId, songLinks.id, songLinks.songId],
    }).onDelete("cascade"),
    index("song_link_arrangements_arrangement_id_idx").on(t.arrangementId, t.songId),
  ],
).enableRLS();

export const songRightsProposals = pgTable(
  "song_rights_proposals",
  {
    tenantId: tenantId(),
    id: uuid().primaryKey().defaultRandom(),
    songId: uuid().notNull(),
    status: text()
      .notNull()
      .default(sql`'running'::text`),
    provider: text().notNull(),
    model: text().notNull(),
    result: jsonb(),
    error: text(),
    createdAt: timestamptz().notNull().defaultNow(),
    reviewedBy: uuid(),
    reviewedAt: timestamptz(),
    errorKind: text(),
  },
  (t) => [
    ...tenantIndexes("song_rights_proposals", t),
    check(
      "song_rights_proposals_error_check",
      sql`((char_length(error) >= 1) AND (char_length(error) <= 1000))`,
    ),
    check(
      "song_rights_proposals_error_kind_check",
      sql`(error_kind = ANY (ARRAY['no_lyrics'::text, 'temporary'::text, 'provider'::text]))`,
    ),
    check(
      "song_rights_proposals_error_kind_status_check",
      sql`((error_kind IS NULL) OR (status = 'failed'::text))`,
    ),
    check(
      "song_rights_proposals_model_check",
      sql`((char_length(model) >= 1) AND (char_length(model) <= 100))`,
    ),
    check(
      "song_rights_proposals_provider_check",
      sql`(provider = ANY (ARRAY['anthropic'::text, 'openai'::text, 'google'::text, 'local'::text]))`,
    ),
    check(
      "song_rights_proposals_result_check",
      sql`((status = ANY (ARRAY['running'::text, 'failed'::text])) OR (result IS NOT NULL))`,
    ),
    foreignKey({
      name: "song_rights_proposals_reviewed_by_fkey",
      columns: [t.reviewedBy],
      foreignColumns: [profiles.id],
    }).onDelete("set null"),
    foreignKey({
      name: "song_rights_proposals_song_id_fkey",
      columns: [t.tenantId, t.songId],
      foreignColumns: [songs.tenantId, songs.id],
    }).onDelete("cascade"),
    check(
      "song_rights_proposals_status_check",
      sql`(status = ANY (ARRAY['running'::text, 'pending'::text, 'accepted'::text, 'rejected'::text, 'failed'::text]))`,
    ),
    index("song_rights_proposals_status_idx").on(t.status, t.createdAt),
    index("song_rights_proposals_reviewed_by_idx").on(t.reviewedBy),
  ],
).enableRLS();

export const songRightsResearchSettings = pgTable(
  "song_rights_research_settings",
  {
    tenantId: tenantId(),
    enabled: boolean()
      .notNull()
      .default(sql`false`),
    provider: text(),
    model: text(),
    nightlyLimit: integer()
      .notNull()
      .default(sql`20`),
    apiKeyHint: text(),
    updatedBy: uuid(),
    updatedAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "song_rights_research_settings_pkey", columns: [t.tenantId] }),
    check(
      "song_rights_research_settings_api_key_hint_check",
      sql`((char_length(api_key_hint) >= 1) AND (char_length(api_key_hint) <= 4))`,
    ),
    check(
      "song_rights_research_settings_enabled_check",
      sql`((NOT enabled) OR ((provider IS NOT NULL) AND (model IS NOT NULL) AND (api_key_hint IS NOT NULL)))`,
    ),
    check(
      "song_rights_research_settings_model_check",
      sql`((model = btrim(model)) AND ((char_length(model) >= 1) AND (char_length(model) <= 100)))`,
    ),
    check(
      "song_rights_research_settings_nightly_limit_check",
      sql`((nightly_limit >= 1) AND (nightly_limit <= 100))`,
    ),
    check(
      "song_rights_research_settings_provider_check",
      sql`(provider = ANY (ARRAY['anthropic'::text, 'openai'::text, 'google'::text]))`,
    ),
    foreignKey({
      name: "song_rights_research_settings_updated_by_fkey",
      columns: [t.updatedBy],
      foreignColumns: [profiles.id],
    }).onDelete("set null"),
    index("song_rights_research_settings_updated_by_idx").on(t.updatedBy),
  ],
).enableRLS();

export const userArrangements = pgTable(
  "user_arrangements",
  {
    tenantId: tenantId(),
    userId: uuid().notNull(),
    arrangementId: uuid().notNull(),
    capo: integer(),
    updatedAt: timestamptz().notNull().defaultNow(),
    musicalKey: text(),
  },
  (t) => [
    index("user_arrangements_tenant_id_idx").on(t.tenantId),
    primaryKey({
      name: "user_arrangements_pkey",
      columns: [t.tenantId, t.userId, t.arrangementId],
    }),
    foreignKey({
      name: "user_arrangements_arrangement_id_fkey",
      columns: [t.tenantId, t.arrangementId],
      foreignColumns: [arrangements.tenantId, arrangements.id],
    }).onDelete("cascade"),
    check("user_arrangements_capo_check", sql`((capo >= 0) AND (capo <= 11))`),
    check("user_arrangements_has_setting", sql`((capo IS NOT NULL) OR (musical_key IS NOT NULL))`),
    check("user_arrangements_musical_key_check", sql`(musical_key ~ '^[A-G][#b]?m?$'::text)`),
    foreignKey({
      name: "user_arrangements_user_id_fkey",
      columns: [t.userId],
      foreignColumns: [profiles.id],
    }).onDelete("cascade"),
    index("user_arrangements_arrangement_id_idx").on(t.arrangementId),
  ],
).enableRLS();

export const userArrangementViews = pgTable(
  "user_arrangement_views",
  {
    tenantId: tenantId(),
    userId: uuid().notNull(),
    arrangementId: uuid().notNull(),
    deviceType: text().notNull(),
    settings: jsonb().notNull(),
    updatedAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    index("user_arrangement_views_tenant_id_idx").on(t.tenantId),
    primaryKey({
      name: "user_arrangement_views_pkey",
      columns: [t.tenantId, t.userId, t.arrangementId, t.deviceType],
    }),
    foreignKey({
      name: "user_arrangement_views_arrangement_id_fkey",
      columns: [t.tenantId, t.arrangementId],
      foreignColumns: [arrangements.tenantId, arrangements.id],
    }).onDelete("cascade"),
    check(
      "user_arrangement_views_device_type_check",
      sql`(device_type = ANY (ARRAY['phone'::text, 'tablet'::text, 'desktop'::text]))`,
    ),
    check(
      "user_arrangement_views_settings_check",
      sql`((jsonb_typeof(settings) = 'object'::text) AND (settings <> '{}'::jsonb) AND (pg_column_size(settings) < 2000))`,
    ),
    foreignKey({
      name: "user_arrangement_views_user_id_fkey",
      columns: [t.userId],
      foreignColumns: [profiles.id],
    }).onDelete("cascade"),
    index("user_arrangement_views_arrangement_id_idx").on(t.arrangementId),
  ],
).enableRLS();

export const userFileViews = pgTable(
  "user_file_views",
  {
    tenantId: tenantId(),
    userId: uuid().notNull(),
    pdfId: uuid(),
    imageId: uuid(),
    zoom: real().notNull(),
    x: real().notNull(),
    y: real().notNull(),
    updatedAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    index("user_file_views_tenant_id_idx").on(t.tenantId),
    foreignKey({
      name: "user_file_views_image_id_fkey",
      columns: [t.tenantId, t.imageId],
      foreignColumns: [songImages.tenantId, songImages.id],
    }).onDelete("cascade"),
    unique("user_file_views_image_id_user_id_key").on(t.tenantId, t.imageId, t.userId),
    check("user_file_views_one_file", sql`(num_nonnulls(pdf_id, image_id) = 1)`),
    foreignKey({
      name: "user_file_views_pdf_id_fkey",
      columns: [t.tenantId, t.pdfId],
      foreignColumns: [songPdfs.tenantId, songPdfs.id],
    }).onDelete("cascade"),
    unique("user_file_views_pdf_id_user_id_key").on(t.tenantId, t.pdfId, t.userId),
    foreignKey({
      name: "user_file_views_user_id_fkey",
      columns: [t.userId],
      foreignColumns: [profiles.id],
    }).onDelete("cascade"),
    check(
      "user_file_views_x_check",
      sql`((x >= (0)::double precision) AND (x <= (1)::double precision))`,
    ),
    check(
      "user_file_views_y_check",
      sql`((y >= (0)::double precision) AND (y <= (1)::double precision))`,
    ),
    check(
      "user_file_views_zoom_check",
      sql`((zoom > (1)::double precision) AND (zoom <= (6)::double precision))`,
    ),
    index("user_file_views_user_id_idx").on(t.userId),
  ],
).enableRLS();

export const sheetMarks = pgTable(
  "sheet_marks",
  {
    tenantId: tenantId(),
    userId: uuid().notNull(),
    id: uuid().notNull(),
    arrangementId: uuid().notNull(),
    mark: jsonb().notNull(),
    createdAt: timestamptz().notNull().defaultNow(),
    updatedAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    index("sheet_marks_tenant_id_idx").on(t.tenantId),
    primaryKey({ name: "sheet_marks_pkey", columns: [t.tenantId, t.userId, t.id] }),
    foreignKey({
      name: "sheet_marks_arrangement_id_fkey",
      columns: [t.tenantId, t.arrangementId],
      foreignColumns: [arrangements.tenantId, arrangements.id],
    }).onDelete("cascade"),
    check(
      "sheet_marks_mark_check",
      sql`((jsonb_typeof(mark) = 'object'::text) AND (pg_column_size(mark) <= 65536))`,
    ),
    foreignKey({
      name: "sheet_marks_user_id_fkey",
      columns: [t.userId],
      foreignColumns: [profiles.id],
    }).onDelete("cascade"),
    index("sheet_marks_user_id_arrangement_id_idx").on(t.userId, t.arrangementId),
    index("sheet_marks_arrangement_id_idx").on(t.arrangementId),
  ],
).enableRLS();

export const annotations = pgTable(
  "annotations",
  {
    tenantId: tenantId(),
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid().notNull(),
    songId: uuid().notNull(),
    setlistItemId: uuid(),
    sectionLabel: text(),
    body: text().notNull(),
    createdAt: timestamptz().notNull().defaultNow(),
    updatedAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    ...tenantIndexes("annotations", t),
    check(
      "annotations_body_check",
      sql`((body = btrim(body)) AND ((char_length(body) >= 1) AND (char_length(body) <= 1000)))`,
    ),
    check(
      "annotations_section_label_check",
      sql`((section_label = btrim(section_label)) AND ((char_length(section_label) >= 1) AND (char_length(section_label) <= 100)))`,
    ),
    foreignKey({
      name: "annotations_setlist_item_id_fkey",
      columns: [t.tenantId, t.setlistItemId],
      foreignColumns: [setlistItems.tenantId, setlistItems.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "annotations_song_id_fkey",
      columns: [t.tenantId, t.songId],
      foreignColumns: [songs.tenantId, songs.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "annotations_user_id_fkey",
      columns: [t.userId],
      foreignColumns: [profiles.id],
    }).onDelete("cascade"),
    index("annotations_user_id_song_id_idx").on(t.userId, t.songId),
    index("annotations_setlist_item_id_idx").on(t.setlistItemId),
    index("annotations_song_id_idx").on(t.songId),
  ],
).enableRLS();

export const setlists = pgTable(
  "setlists",
  {
    tenantId: tenantId(),
    id: uuid().primaryKey().defaultRandom(),
    createdAt: timestamptz().notNull().defaultNow(),
    items: jsonb().notNull(),
    songCount: integer().generatedAlwaysAs(sql`setlist_song_count(items)`),
    itemCount: integer().generatedAlwaysAs(sql`jsonb_array_length(items)`),
  },
  (t) => [
    ...tenantIndexes("setlists", t),
    check(
      "setlists_items_check",
      sql`((jsonb_typeof(items) = 'array'::text) AND ((jsonb_array_length(items) >= 1) AND (jsonb_array_length(items) <= 100)))`,
    ),
  ],
).enableRLS();

export const setlistItems = pgTable(
  "setlist_items",
  {
    tenantId: tenantId(),
    setlistId: uuid().notNull(),
    position: integer().notNull(),
    arrangementId: uuid(),
    id: uuid().primaryKey().defaultRandom(),
    title: huText(),
    notes: text(),
    musicalKey: text(),
    scripture: boolean()
      .notNull()
      .default(sql`false`),
    scriptureTranslation: text(),
    imageSetId: uuid(),
    announcementId: uuid(),
    textSlide: boolean()
      .notNull()
      .default(sql`false`),
    description: text(),
    highlight: text(),
    key: uuid().notNull().defaultRandom(),
  },
  (t) => [
    ...tenantIndexes("setlist_items", t),
    check(
      "setlist_items_announcement_check",
      sql`((announcement_id IS NULL) OR ((title IS NOT NULL) AND (NOT scripture) AND (image_set_id IS NULL)))`,
    ),
    foreignKey({
      name: "setlist_items_arrangement_id_fkey",
      columns: [t.tenantId, t.arrangementId],
      foreignColumns: [arrangements.tenantId, arrangements.id],
    }).onDelete("no action"),
    check(
      "setlist_items_description_check",
      sql`((char_length(description) >= 1) AND (char_length(description) <= 2000))`,
    ),
    check(
      "setlist_items_highlight_check",
      sql`((char_length(highlight) >= 1) AND (char_length(highlight) <= 500))`,
    ),
    check(
      "setlist_items_image_set_check",
      sql`((image_set_id IS NULL) OR ((title IS NOT NULL) AND (NOT scripture)))`,
    ),
    check(
      "setlist_items_kind_check",
      sql`(((arrangement_id IS NULL) = (title IS NOT NULL)) AND ((notes IS NULL) OR (title IS NOT NULL)))`,
    ),
    check("setlist_items_musical_key_check", sql`(musical_key ~ '^[A-G][#b]?m?$'::text)`),
    check(
      "setlist_items_notes_check",
      sql`((char_length(notes) >= 1) AND (char_length(notes) <= 2000))`,
    ),
    check("setlist_items_position_check", sql`("position" >= 0)`),
    check("setlist_items_scripture_check", sql`((NOT scripture) OR (title IS NOT NULL))`),
    check(
      "setlist_items_scripture_translation_check",
      sql`((scripture_translation IS NULL) OR (scripture AND (scripture_translation ~ '^[a-z0-9]{1,30}$'::text)))`,
    ),
    foreignKey({
      name: "setlist_items_setlist_id_fkey",
      columns: [t.tenantId, t.setlistId],
      foreignColumns: [setlists.tenantId, setlists.id],
    }).onDelete("cascade"),
    unique("setlist_items_setlist_id_key_key").on(t.tenantId, t.setlistId, t.key),
    check(
      "setlist_items_text_slide_check",
      sql`((NOT text_slide) OR ((title IS NOT NULL) AND (NOT scripture) AND (image_set_id IS NULL) AND (announcement_id IS NULL)))`,
    ),
    check(
      "setlist_items_text_slide_text_check",
      sql`(text_slide OR ((description IS NULL) AND (highlight IS NULL)))`,
    ),
    check(
      "setlist_items_title_check",
      sql`((title = btrim(title)) AND ((char_length(title) >= 1) AND (char_length(title) <= 200)))`,
    ),
    index("setlist_items_arrangement_id_idx").on(t.arrangementId),
    index("setlist_items_image_set_id_idx").on(t.imageSetId),
    index("setlist_items_announcement_id_idx").on(t.announcementId),
  ],
).enableRLS();

export const setlistItemDurations = pgTable(
  "setlist_item_durations",
  {
    tenantId: tenantId(),
    setlistItemId: uuid().notNull(),
    seconds: integer().notNull(),
    createdAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    index("setlist_item_durations_tenant_id_idx").on(t.tenantId),
    primaryKey({ name: "setlist_item_durations_pkey", columns: [t.tenantId, t.setlistItemId] }),
    check("setlist_item_durations_seconds_check", sql`((seconds >= 1) AND (seconds <= 86400))`),
    foreignKey({
      name: "setlist_item_durations_setlist_item_id_fkey",
      columns: [t.tenantId, t.setlistItemId],
      foreignColumns: [setlistItems.tenantId, setlistItems.id],
    }).onDelete("cascade"),
  ],
).enableRLS();

export const setlistItemThemes = pgTable(
  "setlist_item_themes",
  {
    tenantId: tenantId(),
    setlistItemId: uuid().notNull(),
    themeId: uuid().notNull(),
    createdAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    index("setlist_item_themes_tenant_id_idx").on(t.tenantId),
    primaryKey({ name: "setlist_item_themes_pkey", columns: [t.tenantId, t.setlistItemId] }),
    foreignKey({
      name: "setlist_item_themes_setlist_item_id_fkey",
      columns: [t.tenantId, t.setlistItemId],
      foreignColumns: [setlistItems.tenantId, setlistItems.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "setlist_item_themes_theme_id_fkey",
      columns: [t.tenantId, t.themeId],
      foreignColumns: [projectionThemes.tenantId, projectionThemes.id],
    }).onDelete("cascade"),
    index("setlist_item_themes_theme_id_idx").on(t.themeId),
  ],
).enableRLS();

export const projectionThemes = pgTable(
  "projection_themes",
  {
    tenantId: tenantId(),
    id: uuid().primaryKey().defaultRandom(),
    name: huText().notNull(),
    isDefault: boolean()
      .notNull()
      .default(sql`false`),
    backgroundColor: text().notNull(),
    backgroundImagePath: text(),
    backgroundDim: smallint()
      .notNull()
      .default(sql`0`),
    font: text().notNull(),
    textColor: text().notNull(),
    textSize: smallint()
      .notNull()
      .default(sql`100`),
    textAlign: text()
      .notNull()
      .default(sql`'center'::text`),
    verticalAlign: text()
      .notNull()
      .default(sql`'center'::text`),
    textShadow: text()
      .notNull()
      .default(sql`'none'::text`),
    margin: smallint()
      .notNull()
      .default(sql`6`),
    transition: text()
      .notNull()
      .default(sql`'fade'::text`),
    transitionMs: smallint()
      .notNull()
      .default(sql`150`),
    dmx: jsonb(),
    createdAt: timestamptz().notNull().defaultNow(),
    updatedAt: timestamptz().notNull().defaultNow(),
    accentColor: text(),
    referenceSize: smallint()
      .notNull()
      .default(sql`100`),
    rollTransitionMs: smallint()
      .notNull()
      .default(sql`600`),
    backgroundVideoPath: text(),
  },
  (t) => [
    ...tenantIndexes("projection_themes", t),
    check("projection_themes_accent_color_check", sql`(accent_color ~ '^#[0-9a-f]{6}$'::text)`),
    check(
      "projection_themes_background_color_check",
      sql`(background_color ~ '^#[0-9a-f]{6}$'::text)`,
    ),
    check(
      "projection_themes_background_dim_check",
      sql`((background_dim >= 0) AND (background_dim <= 80))`,
    ),
    check(
      "projection_themes_background_image_path_check",
      sql`(background_image_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\\.webp$'::text)`,
    ),
    unique("projection_themes_background_image_path_key").on(t.tenantId, t.backgroundImagePath),
    check(
      "projection_themes_background_video_path_check",
      sql`(background_video_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\\.(mp4|webm)$'::text)`,
    ),
    unique("projection_themes_background_video_path_key").on(t.tenantId, t.backgroundVideoPath),
    check("projection_themes_dmx_check", sql`(jsonb_typeof(dmx) = 'object'::text)`),
    check("projection_themes_font_check", sql`(font ~ '^[a-z0-9-]{1,30}$'::text)`),
    check("projection_themes_margin_check", sql`((margin >= 0) AND (margin <= 15))`),
    check(
      "projection_themes_name_check",
      sql`((name = btrim(name)) AND ((char_length(name) >= 1) AND (char_length(name) <= 100)))`,
    ),
    unique("projection_themes_name_key").on(t.tenantId, t.name),
    check(
      "projection_themes_reference_size_check",
      sql`((reference_size >= 25) AND (reference_size <= 500))`,
    ),
    check(
      "projection_themes_roll_transition_ms_check",
      sql`((roll_transition_ms >= 0) AND (roll_transition_ms <= 2000))`,
    ),
    check(
      "projection_themes_text_align_check",
      sql`(text_align = ANY (ARRAY['left'::text, 'center'::text, 'right'::text]))`,
    ),
    check("projection_themes_text_color_check", sql`(text_color ~ '^#[0-9a-f]{6}$'::text)`),
    check(
      "projection_themes_text_shadow_check",
      sql`(text_shadow = ANY (ARRAY['none'::text, 'light'::text, 'strong'::text]))`,
    ),
    check("projection_themes_text_size_check", sql`((text_size >= 50) AND (text_size <= 150))`),
    check(
      "projection_themes_transition_check",
      sql`(transition = ANY (ARRAY['cut'::text, 'fade'::text]))`,
    ),
    check(
      "projection_themes_transition_ms_check",
      sql`((transition_ms >= 0) AND (transition_ms <= 2000))`,
    ),
    check(
      "projection_themes_vertical_align_check",
      sql`(vertical_align = ANY (ARRAY['top'::text, 'center'::text, 'bottom'::text]))`,
    ),
    check(
      "projection_themes_video_poster",
      sql`((background_video_path IS NULL) OR (background_image_path IS NOT NULL))`,
    ),
  ],
).enableRLS();

export const projectionVideoUploads = pgTable(
  "projection_video_uploads",
  {
    tenantId: tenantId(),
    path: text().notNull(),
    userId: uuid(),
    createdAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    index("projection_video_uploads_tenant_id_idx").on(t.tenantId),
    primaryKey({ name: "projection_video_uploads_pkey", columns: [t.tenantId, t.path] }),
    check(
      "projection_video_uploads_path_check",
      sql`(path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\\.(mp4|webm)$'::text)`,
    ),
    foreignKey({
      name: "projection_video_uploads_user_id_fkey",
      columns: [t.userId],
      foreignColumns: [profiles.id],
    }).onDelete("set null"),
    index("projection_video_uploads_created_at_idx").on(t.createdAt),
    index("projection_video_uploads_user_id_created_at_idx").on(t.userId, t.createdAt),
  ],
).enableRLS();

export const mixerSettings = pgTable(
  "mixer_settings",
  {
    tenantId: tenantId(),
    kind: text()
      .notNull()
      .default(sql`'off'::text`),
    host: text()
      .notNull()
      .default(sql`''::text`),
    slots: jsonb()
      .notNull()
      .default(sql`'[]'::jsonb`),
    updatedBy: uuid(),
    updatedAt: timestamptz().notNull().defaultNow(),
    midiChannel: smallint()
      .notNull()
      .default(sql`1`),
    tapKeys: smallint()
      .array()
      .notNull()
      .default(sql`'{}'::smallint[]`),
  },
  (t) => [
    primaryKey({ name: "mixer_settings_pkey", columns: [t.tenantId] }),
    check(
      "mixer_settings_host_check",
      sql`((host = ''::text) OR (host ~ '^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])\\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])$'::text))`,
    ),
    check(
      "mixer_settings_kind_check",
      sql`(kind = ANY (ARRAY['off'::text, 'x32-osc'::text, 'x32-midi'::text, 'sq-tcp'::text, 'sq-midi'::text]))`,
    ),
    check("mixer_settings_midi_channel_check", sql`((midi_channel >= 1) AND (midi_channel <= 16))`),
    check(
      "mixer_settings_slots_check",
      sql`((jsonb_typeof(slots) = 'array'::text) AND (jsonb_array_length(slots) <= 8))`,
    ),
    check(
      "mixer_settings_tap_keys_check",
      sql`((cardinality(tap_keys) <= 16) AND (array_position(tap_keys, NULL::smallint) IS NULL) AND (1 <= ALL (tap_keys)) AND (16 >= ALL (tap_keys)))`,
    ),
    foreignKey({
      name: "mixer_settings_updated_by_fkey",
      columns: [t.updatedBy],
      foreignColumns: [profiles.id],
    }).onDelete("set null"),
    index("mixer_settings_updated_by_idx").on(t.updatedBy),
  ],
).enableRLS();

/**
 * The Bible translations of a church besides Károli 1908 (the platform catalog, static files, no row):
 * "pasted" = the verses of a reading are pasted into a per-tenant cache (limits in
 * `scripture_verse_cache`), "database" = the full text under the church's own licence in
 * `scripture_books`. Replaces the hard-coded RÚF 2014 of the music app (PLAN §24).
 */
export const scriptureTranslations = pgTable(
  "scripture_translations",
  {
    tenantId: tenantId(),
    id: text().notNull(),
    language: text()
      .notNull()
      .default(sql`'hu'::text`),
    name: huText().notNull(),
    shortName: huText().notNull(),
    notice: text(),
    source: text().notNull(),
    deuterocanon: boolean()
      .notNull()
      .default(sql`false`),
    enabled: boolean()
      .notNull()
      .default(sql`true`),
    sourceLinks: jsonb(),
    createdAt: timestamptz().notNull().defaultNow(),
    updatedAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "scripture_translations_pkey", columns: [t.tenantId, t.id] }),
    index("scripture_translations_tenant_id_idx").on(t.tenantId),
    check(
      "scripture_translations_id_check",
      sql`((id ~ '^[a-z0-9]{1,30}$'::text) AND (id <> 'karoli1908'::text))`,
    ),
    check("scripture_translations_language_check", sql`(language = 'hu'::text)`),
    check(
      "scripture_translations_name_check",
      sql`((char_length(btrim(name)) BETWEEN 1 AND 120) AND (char_length(btrim(short_name)) BETWEEN 1 AND 20))`,
    ),
    check(
      "scripture_translations_notice_check",
      sql`((notice IS NULL) OR (char_length(notice) BETWEEN 1 AND 500))`,
    ),
    check(
      "scripture_translations_source_check",
      sql`(source = ANY (ARRAY['pasted'::text, 'database'::text]))`,
    ),
    check(
      "scripture_translations_source_links_check",
      sql`((source_links IS NULL) OR (jsonb_typeof(source_links) = 'object'::text))`,
    ),
  ],
).enableRLS();

export const scriptureBooks = pgTable(
  "scripture_books",
  {
    tenantId: uuid()
      .default(sql`app.current_tenant_id()`)
      .references(() => tenants.id, { onDelete: "cascade" }),
    translation: text().notNull(),
    book: text().notNull(),
    chapters: jsonb().notNull(),
    updatedAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    index("scripture_books_tenant_id_idx").on(t.tenantId),
    foreignKey({
      name: "scripture_books_translation_fkey",
      columns: [t.tenantId, t.translation],
      foreignColumns: [scriptureTranslations.tenantId, scriptureTranslations.id],
    }).onDelete("cascade"),
    unique("scripture_books_key").on(t.tenantId, t.translation, t.book).nullsNotDistinct(),
    check("scripture_books_book_check", sql`(book ~ '^[1-4]?[A-Za-z]{2,10}$'::text)`),
    check("scripture_books_chapters_check", sql`(jsonb_typeof(chapters) = 'array'::text)`),
    check("scripture_books_translation_check", sql`(translation ~ '^[a-z0-9]{1,30}$'::text)`),
  ],
).enableRLS();

export const scriptureVerseCache = pgTable(
  "scripture_verse_cache",
  {
    tenantId: uuid()
      .default(sql`app.current_tenant_id()`)
      .references(() => tenants.id, { onDelete: "cascade" }),
    translation: text().notNull(),
    book: text().notNull(),
    chapter: integer().notNull(),
    verse: integer().notNull(),
    text: text().notNull(),
    cachedAt: timestamptz().notNull().defaultNow(),
    chapterEnd: boolean()
      .notNull()
      .default(sql`false`),
  },
  (t) => [
    index("scripture_verse_cache_tenant_id_idx").on(t.tenantId),
    foreignKey({
      name: "scripture_verse_cache_translation_fkey",
      columns: [t.tenantId, t.translation],
      foreignColumns: [scriptureTranslations.tenantId, scriptureTranslations.id],
    }).onDelete("cascade"),
    unique("scripture_verse_cache_key")
      .on(t.tenantId, t.translation, t.book, t.chapter, t.verse)
      .nullsNotDistinct(),
    check("scripture_verse_cache_book_check", sql`(book ~ '^[1-4]?[A-Za-z]{2,10}$'::text)`),
    check("scripture_verse_cache_chapter_check", sql`((chapter >= 1) AND (chapter <= 150))`),
    check(
      "scripture_verse_cache_text_check",
      sql`((length(text) >= 1) AND (length(text) <= 2000))`,
    ),
    check("scripture_verse_cache_translation_check", sql`(translation ~ '^[a-z0-9]{1,30}$'::text)`),
    check("scripture_verse_cache_verse_check", sql`((verse >= 1) AND (verse <= 200))`),
    index("scripture_verse_cache_cached_at_idx").on(t.cachedAt),
  ],
).enableRLS();

export const courses = pgTable(
  "courses",
  {
    tenantId: tenantId(),
    id: uuid().primaryKey().defaultRandom(),
    title: huText().notNull(),
    language: text().notNull(),
    description: text(),
    position: bigint({ mode: "number" }).notNull().generatedByDefaultAsIdentity(),
    isPublished: boolean()
      .notNull()
      .default(sql`false`),
    publishedAt: timestamptz(),
    draft: jsonb(),
    areasLost: boolean()
      .notNull()
      .default(sql`false`),
    revision: integer()
      .notNull()
      .default(sql`0`),
    removedAt: timestamptz(),
    createdAt: timestamptz().notNull().defaultNow(),
    updatedAt: timestamptz().notNull().defaultNow(),
    icon: text(),
    imagePath: text(),
  },
  (t) => [
    ...tenantIndexes("courses", t),
    check("courses_check", sql`((NOT is_published) OR (published_at IS NOT NULL))`),
    check(
      "courses_description_check",
      sql`((description IS NULL) OR ((description = btrim(description)) AND ((char_length(description) >= 1) AND (char_length(description) <= 1000))))`,
    ),
    check(
      "courses_draft_check",
      sql`((draft IS NULL) OR ((jsonb_typeof(draft) = 'object'::text) AND (octet_length((draft)::text) <= 5000000)))`,
    ),
    check("courses_icon_check", sql`((icon IS NULL) OR (icon ~ '^[a-z0-9-]{1,40}$'::text))`),
    check(
      "courses_image_path_check",
      sql`((image_path IS NULL) OR (char_length(image_path) <= 200))`,
    ),
    check("courses_language_check", sql`(language = ANY (ARRAY['hu'::text, 'en'::text]))`),
    check("courses_one_cover", sql`((icon IS NULL) OR (image_path IS NULL))`),
    check(
      "courses_title_check",
      sql`((title = btrim(title)) AND ((char_length(title) >= 1) AND (char_length(title) <= 200)))`,
    ),
  ],
).enableRLS();

export const courseLessons = pgTable(
  "course_lessons",
  {
    tenantId: tenantId(),
    id: uuid().primaryKey(),
    courseId: uuid().notNull(),
    position: integer().notNull(),
    title: huText().notNull(),
    videoUrl: text(),
    body: jsonb()
      .notNull()
      .default(sql`'{"type": "doc", "content": []}'::jsonb`),
    links: jsonb()
      .notNull()
      .default(sql`'[]'::jsonb`),
    isPublished: boolean()
      .notNull()
      .default(sql`true`),
    draft: jsonb(),
    removedAt: timestamptz(),
    createdAt: timestamptz().notNull().defaultNow(),
    updatedAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    ...tenantIndexes("course_lessons", t),
    check(
      "course_lessons_body_check",
      sql`((jsonb_typeof(body) = 'object'::text) AND (octet_length((body)::text) <= 500000))`,
    ),
    check("course_lessons_check", sql`(is_published OR (removed_at IS NOT NULL))`),
    foreignKey({
      name: "course_lessons_course_id_fkey",
      columns: [t.tenantId, t.courseId],
      foreignColumns: [courses.tenantId, courses.id],
    }).onDelete("cascade"),
    check(
      "course_lessons_draft_check",
      sql`((draft IS NULL) OR (jsonb_typeof(draft) = 'object'::text))`,
    ),
    check(
      "course_lessons_links_check",
      sql`((jsonb_typeof(links) = 'array'::text) AND (jsonb_array_length(links) <= 20))`,
    ),
    check("course_lessons_position_check", sql`("position" >= 0)`),
    check(
      "course_lessons_title_check",
      sql`((title = btrim(title)) AND ((char_length(title) >= 1) AND (char_length(title) <= 200)))`,
    ),
    check(
      "course_lessons_video_url_check",
      sql`((video_url IS NULL) OR ((char_length(video_url) >= 1) AND (char_length(video_url) <= 500)))`,
    ),
    index("course_lessons_course_id_idx").on(t.courseId, t.position),
  ],
).enableRLS();

export const courseImages = pgTable(
  "course_images",
  {
    tenantId: tenantId(),
    path: text().notNull(),
    courseId: uuid().notNull(),
    createdAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    index("course_images_tenant_id_idx").on(t.tenantId),
    primaryKey({ name: "course_images_pkey", columns: [t.tenantId, t.path] }),
    foreignKey({
      name: "course_images_course_id_fkey",
      columns: [t.tenantId, t.courseId],
      foreignColumns: [courses.tenantId, courses.id],
    }).onDelete("cascade"),
    check("course_images_path_check", sql`(char_length(path) <= 200)`),
    index("course_images_course_id_idx").on(t.courseId),
  ],
).enableRLS();

export const appConfig = pgTable(
  "app_config",
  {
    tenantId: tenantId(),
    appName: text().notNull(),
    shortName: text(),
    churchName: jsonb()
      .notNull()
      .default(sql`'{}'::jsonb`),
    description: jsonb()
      .notNull()
      .default(sql`'{}'::jsonb`),
    defaultPalette: text()
      .notNull()
      .default(sql`'paper'::text`),
    brandColor: text()
      .notNull()
      .default(sql`'#885f36'::text`),
    iconPath: text(),
    timeZone: text()
      .notNull()
      .default(sql`'Europe/Budapest'::text`),
    emailSenderName: text(),
    controllerKind: text(),
    controllerName: text(),
    controllerAddress: text(),
    contactEmail: text(),
    authority: jsonb()
      .notNull()
      .default(sql`'{}'::jsonb`),
    privacyUpdatedAt: timestamptz(),
    updatedBy: uuid(),
    updatedAt: timestamptz().notNull().defaultNow(),
    scriptureKaroli: boolean()
      .notNull()
      .default(sql`true`),
    theme: jsonb(),
  },
  (t) => [
    primaryKey({ name: "app_config_pkey", columns: [t.tenantId] }),
    check(
      "app_config_app_name_check",
      sql`((char_length(btrim(app_name)) >= 1) AND (char_length(btrim(app_name)) <= 40))`,
    ),
    check("app_config_authority_check", sql`(jsonb_typeof(authority) = 'object'::text)`),
    check("app_config_brand_color_check", sql`(brand_color ~ '^#[0-9a-f]{6}$'::text)`),
    check("app_config_church_name_check", sql`(jsonb_typeof(church_name) = 'object'::text)`),
    check(
      "app_config_contact_email_check",
      sql`((char_length(contact_email) >= 3) AND (char_length(contact_email) <= 254))`,
    ),
    check(
      "app_config_controller_address_check",
      sql`((char_length(btrim(controller_address)) >= 1) AND (char_length(btrim(controller_address)) <= 300))`,
    ),
    check(
      "app_config_controller_kind_check",
      sql`(controller_kind = ANY (ARRAY['church'::text, 'person'::text, 'organization'::text]))`,
    ),
    check(
      "app_config_controller_name_check",
      sql`((char_length(btrim(controller_name)) >= 1) AND (char_length(btrim(controller_name)) <= 200))`,
    ),
    check(
      "app_config_controller_named",
      sql`((controller_kind IS NULL) OR (controller_kind = 'church'::text) OR (controller_name IS NOT NULL))`,
    ),
    check(
      "app_config_default_palette_check",
      sql`(default_palette = ANY (ARRAY['paper'::text, 'neon'::text, 'acid'::text, 'sunset'::text, 'aurora'::text]))`,
    ),
    check("app_config_description_check", sql`(jsonb_typeof(description) = 'object'::text)`),
    check(
      "app_config_email_sender_name_check",
      sql`(((char_length(btrim(email_sender_name)) >= 1) AND (char_length(btrim(email_sender_name)) <= 60)) AND (email_sender_name !~ '[<>"\\\\\\r\\n]'::text))`,
    ),
    check("app_config_icon_path_check", sql`(icon_path ~ '^[0-9a-f-]{36}\\.png$'::text)`),
    check(
      "app_config_short_name_check",
      sql`((char_length(btrim(short_name)) >= 1) AND (char_length(btrim(short_name)) <= 12))`,
    ),
    check(
      "app_config_theme_check",
      sql`((theme IS NULL) OR (jsonb_typeof(theme) = 'object'::text))`,
    ),
    check(
      "app_config_time_zone_check",
      sql`((char_length(time_zone) >= 1) AND (char_length(time_zone) <= 64))`,
    ),
    foreignKey({
      name: "app_config_updated_by_fkey",
      columns: [t.updatedBy],
      foreignColumns: [profiles.id],
    }).onDelete("set null"),
    index("app_config_updated_by_idx").on(t.updatedBy),
  ],
).enableRLS();

export const appModules = pgTable(
  "app_modules",
  {
    tenantId: tenantId(),
    id: text().notNull(),
    enabled: boolean().notNull(),
    updatedBy: uuid(),
    updatedAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "app_modules_pkey", columns: [t.tenantId, t.id] }),
    index("app_modules_tenant_id_idx").on(t.tenantId),
    check("app_modules_id_check", sql`(id ~ '^[a-z][a-z0-9-]*(\\.[a-z][a-z0-9-]*)?$'::text)`),
    foreignKey({
      name: "app_modules_updated_by_fkey",
      columns: [t.updatedBy],
      foreignColumns: [profiles.id],
    }).onDelete("set null"),
    index("app_modules_updated_by_idx").on(t.updatedBy),
  ],
).enableRLS();

export const emailTemplates = pgTable(
  "email_templates",
  {
    tenantId: tenantId(),
    kind: text().notNull(),
    locale: text().notNull(),
    subject: text().notNull(),
    body: text().notNull(),
    updatedBy: uuid(),
    updatedAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    index("email_templates_tenant_id_idx").on(t.tenantId),
    primaryKey({ name: "email_templates_pkey", columns: [t.tenantId, t.kind, t.locale] }),
    check(
      "email_templates_body_check",
      sql`((char_length(body) >= 1) AND (char_length(body) <= 5000))`,
    ),
    check(
      "email_templates_kind_check",
      sql`(kind = ANY (ARRAY['event_added'::text, 'event_reminder'::text, 'setlist'::text, 'welcome'::text]))`,
    ),
    check("email_templates_locale_check", sql`(locale = ANY (ARRAY['en'::text, 'hu'::text]))`),
    check(
      "email_templates_subject_check",
      sql`((subject = btrim(subject)) AND ((char_length(subject) >= 1) AND (char_length(subject) <= 200)) AND (subject !~ '[\\r\\n]'::text))`,
    ),
    foreignKey({
      name: "email_templates_updated_by_fkey",
      columns: [t.updatedBy],
      foreignColumns: [profiles.id],
    }).onDelete("set null"),
    index("email_templates_updated_by_idx").on(t.updatedBy),
  ],
).enableRLS();

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    tenantId: tenantId(),
    userId: uuid().notNull(),
    eventAdded: boolean()
      .notNull()
      .default(sql`true`),
    eventReminder: boolean()
      .notNull()
      .default(sql`true`),
    reminderDays: integer()
      .notNull()
      .default(sql`5`),
    setlist: boolean()
      .notNull()
      .default(sql`true`),
    setlistHours: integer()
      .notNull()
      .default(sql`2`),
    timeZone: text()
      .notNull()
      .default(sql`church_time_zone()`),
    updatedAt: timestamptz().notNull().defaultNow(),
    email: boolean()
      .notNull()
      .default(sql`true`),
    liveSession: boolean()
      .notNull()
      .default(sql`true`),
  },
  (t) => [
    index("notification_preferences_tenant_id_idx").on(t.tenantId),
    primaryKey({ name: "notification_preferences_pkey", columns: [t.tenantId, t.userId] }),
    check(
      "notification_preferences_reminder_days_check",
      sql`((reminder_days >= 1) AND (reminder_days <= 30))`,
    ),
    check(
      "notification_preferences_setlist_hours_check",
      sql`((setlist_hours >= 1) AND (setlist_hours <= 12))`,
    ),
    check(
      "notification_preferences_time_zone_check",
      sql`((char_length(time_zone) >= 1) AND (char_length(time_zone) <= 64))`,
    ),
    foreignKey({
      name: "notification_preferences_user_id_fkey",
      columns: [t.userId],
      foreignColumns: [profiles.id],
    }).onDelete("cascade"),
  ],
).enableRLS();

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    tenantId: tenantId(),
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid().notNull(),
    endpoint: text().notNull(),
    p256dh: text().notNull(),
    auth: text().notNull(),
    createdAt: timestamptz().notNull().defaultNow(),
    updatedAt: timestamptz().notNull().defaultNow(),
    consentedAt: timestamptz(),
  },
  (t) => [
    ...tenantIndexes("push_subscriptions", t),
    check("push_subscriptions_auth_check", sql`(auth ~ '^[A-Za-z0-9_-]{1,64}={0,2}$'::text)`),
    check(
      "push_subscriptions_endpoint_check",
      sql`((endpoint ~ '^https://'::text) AND (char_length(endpoint) <= 2048))`,
    ),
    unique("push_subscriptions_endpoint_key").on(t.endpoint),
    check("push_subscriptions_p256dh_check", sql`(p256dh ~ '^[A-Za-z0-9_-]{1,128}={0,2}$'::text)`),
    foreignKey({
      name: "push_subscriptions_user_id_fkey",
      columns: [t.userId],
      foreignColumns: [profiles.id],
    }).onDelete("cascade"),
    index("push_subscriptions_user_id_idx").on(t.userId),
  ],
).enableRLS();

export const calendarFeeds = pgTable(
  "calendar_feeds",
  {
    tenantId: tenantId(),
    userId: uuid().notNull(),
    createdAt: timestamptz().notNull().defaultNow(),
    consentedAt: timestamptz(),
    tokenHash: text().notNull(),
  },
  (t) => [
    index("calendar_feeds_tenant_id_idx").on(t.tenantId),
    primaryKey({ name: "calendar_feeds_pkey", columns: [t.tenantId, t.userId] }),
    check("calendar_feeds_token_hash_check", sql`(token_hash ~ '^[0-9a-f]{64}$'::text)`),
    unique("calendar_feeds_token_hash_key").on(t.tokenHash),
    foreignKey({
      name: "calendar_feeds_user_id_fkey",
      columns: [t.userId],
      foreignColumns: [profiles.id],
    }).onDelete("cascade"),
  ],
).enableRLS();

export const announcementCalendars = pgTable(
  "announcement_calendars",
  {
    tenantId: tenantId(),
    id: uuid().primaryKey().defaultRandom(),
    name: huText().notNull(),
    icsUrl: text().notNull(),
    enabled: boolean()
      .notNull()
      .default(sql`true`),
    position: integer().notNull(),
    createdAt: timestamptz().notNull().defaultNow(),
    updatedAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    ...tenantIndexes("announcement_calendars", t),
    check(
      "announcement_calendars_ics_url_check",
      sql`((ics_url ~ '^https://[^\\s]+$'::text) AND (char_length(ics_url) <= 2000))`,
    ),
    check(
      "announcement_calendars_name_check",
      sql`((name = btrim(name)) AND ((char_length(name) >= 1) AND (char_length(name) <= 100)))`,
    ),
    check("announcement_calendars_position_check", sql`("position" >= 0)`),
  ],
).enableRLS();

export const announcementSettings = pgTable(
  "announcement_settings",
  {
    tenantId: tenantId(),
    excludeWords: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    updatedBy: uuid(),
    updatedAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "announcement_settings_pkey", columns: [t.tenantId] }),
    check(
      "announcement_settings_exclude_words_check",
      sql`((cardinality(exclude_words) <= 50) AND valid_announcement_words(exclude_words))`,
    ),
    foreignKey({
      name: "announcement_settings_updated_by_fkey",
      columns: [t.updatedBy],
      foreignColumns: [profiles.id],
    }).onDelete("set null"),
    index("announcement_settings_updated_by_idx").on(t.updatedBy),
  ],
).enableRLS();

/**
 * Shared song-rights catalog (music phase 2, PLAN §11 "Song rights data", §11.2): rights facts of
 * a song shared by every church. Platform rows only (`tenant_id` null); key = the CCLI song number
 * from the copyright text, otherwise the folded title + authors. Fed by the songs trigger
 * `share_song_rights()` (song saves and accepted research proposals); a church's licence status
 * and permission note stay on its own `songs` row.
 */
export const songRights = pgTable(
  "song_rights",
  {
    tenantId: uuid().references(() => tenants.id, { onDelete: "cascade" }),
    id: uuid().primaryKey().defaultRandom(),
    ccliNumber: text(),
    titleKey: text().notNull(),
    authorsKey: text().notNull().default(""),
    title: huText().notNull(),
    authors: text(),
    originalTitle: text(),
    translator: text(),
    songbook: text(),
    copyright: text(),
    updatedByTenant: uuid().references(() => tenants.id, { onDelete: "set null" }),
    updatedAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    index("song_rights_tenant_id_idx").on(t.tenantId),
    check("song_rights_ccli_number_check", sql`(ccli_number ~ '^[0-9]{1,10}$'::text)`),
    check(
      "song_rights_title_check",
      sql`((char_length(title) >= 1) AND (char_length(title) <= 200))`,
    ),
    check("song_rights_authors_check", sql`(char_length(authors) <= 500)`),
    check("song_rights_original_title_check", sql`(char_length(original_title) <= 200)`),
    check("song_rights_translator_check", sql`(char_length(translator) <= 200)`),
    check("song_rights_songbook_check", sql`(char_length(songbook) <= 200)`),
    check("song_rights_copyright_check", sql`(char_length(copyright) <= 500)`),
  ],
).enableRLS();

/**
 * A block of an event's run sheet (a named run of consecutive setlist items with an optional
 * countdown). Music merge phase 4a-2; the event is Churchy's `events` row.
 */
export const eventBlocks = pgTable(
  "event_blocks",
  {
    tenantId: tenantId(),
    eventId: uuid().notNull(),
    key: uuid().notNull().defaultRandom(),
    name: huText().notNull(),
    countdown: text().notNull().default("off"),
    /** Only for the countdown "until": the clock time on the day of the event. */
    countdownUntil: time(),
    /** Only for the countdown "remaining": when the block started. */
    startedAt: timestamptz(),
    createdAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "event_blocks_pkey", columns: [t.tenantId, t.eventId, t.key] }),
    index("event_blocks_tenant_id_idx").on(t.tenantId),
    check(
      "event_blocks_name_check",
      sql`((name = btrim(name)) AND ((char_length(name) >= 1) AND (char_length(name) <= 80)))`,
    ),
    check(
      "event_blocks_countdown_check",
      sql`(countdown = ANY (ARRAY['off'::text, 'remaining'::text, 'until'::text]))`,
    ),
    check(
      "event_blocks_countdown_until_check",
      sql`((countdown = 'until'::text) = (countdown_until IS NOT NULL))`,
    ),
    foreignKey({
      name: "event_blocks_event_id_fkey",
      columns: [t.tenantId, t.eventId],
      foreignColumns: [events.tenantId, events.id],
    }).onDelete("cascade"),
  ],
).enableRLS();

export const setlistItemBlocks = pgTable(
  "setlist_item_blocks",
  {
    tenantId: tenantId(),
    setlistItemId: uuid().notNull(),
    eventId: uuid().notNull(),
    blockKey: uuid().notNull(),
    createdAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "setlist_item_blocks_pkey", columns: [t.tenantId, t.setlistItemId] }),
    index("setlist_item_blocks_tenant_id_idx").on(t.tenantId),
    index("setlist_item_blocks_event_id_block_key_idx").on(t.eventId, t.blockKey),
    foreignKey({
      name: "setlist_item_blocks_setlist_item_id_fkey",
      columns: [t.tenantId, t.setlistItemId],
      foreignColumns: [setlistItems.tenantId, setlistItems.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "setlist_item_blocks_block_fkey",
      columns: [t.tenantId, t.eventId, t.blockKey],
      foreignColumns: [eventBlocks.tenantId, eventBlocks.eventId, eventBlocks.key],
    }).onDelete("cascade"),
  ],
).enableRLS();

// ---------------------------------------------------------------------------------------------
// Music merge phase 4b-1: the music area tree ("service areas", PLAN §17), volunteers of events,
// volunteer templates. A tree of its own, linked to nothing of Churchy's teams (owner decision).
// Their `user_id`s are Churchy profile ids. Roles of an area (`service_area_roles`) are stored as in
// the music app; they are not connected to `can()` yet.
// ---------------------------------------------------------------------------------------------

export const serviceAreas = pgTable(
  "service_areas",
  {
    tenantId: tenantId(),
    id: uuid().primaryKey().defaultRandom(),
    name: huText().notNull(),
    position: bigint({ mode: "number" }).notNull().generatedByDefaultAsIdentity(),
    parentId: uuid(),
    isRoot: boolean().notNull().default(false),
    createdAt: timestamptz().notNull().defaultNow(),
    updatedAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    ...tenantIndexes("service_areas", t),
    unique("service_areas_parent_id_name_key")
      .on(t.tenantId, t.parentId, t.name)
      .nullsNotDistinct(),
    index("service_areas_parent_id_idx").on(t.parentId),
    uniqueIndex("service_areas_one_root_idx")
      .on(t.tenantId)
      .where(sql`${t.isRoot}`),
    check(
      "service_areas_name_check",
      sql`((name = btrim(name)) AND ((char_length(name) >= 1) AND (char_length(name) <= 60)))`,
    ),
    check("service_areas_root_check", sql`((parent_id IS NULL) = is_root)`),
    foreignKey({
      name: "service_areas_parent_id_fkey",
      columns: [t.tenantId, t.parentId],
      foreignColumns: [t.tenantId, t.id],
    }),
  ],
).enableRLS();

export const serviceAreaPaths = pgTable(
  "service_area_paths",
  {
    tenantId: tenantId(),
    ancestorId: uuid().notNull(),
    descendantId: uuid().notNull(),
    depth: integer().notNull(),
  },
  (t) => [
    primaryKey({
      name: "service_area_paths_pkey",
      columns: [t.tenantId, t.ancestorId, t.descendantId],
    }),
    index("service_area_paths_descendant_idx").on(t.tenantId, t.descendantId),
    check("service_area_paths_depth_check", sql`(depth >= 0)`),
    foreignKey({
      name: "service_area_paths_ancestor_id_fkey",
      columns: [t.tenantId, t.ancestorId],
      foreignColumns: [serviceAreas.tenantId, serviceAreas.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "service_area_paths_descendant_id_fkey",
      columns: [t.tenantId, t.descendantId],
      foreignColumns: [serviceAreas.tenantId, serviceAreas.id],
    }).onDelete("cascade"),
  ],
).enableRLS();

export const serviceAreaMembers = pgTable(
  "service_area_members",
  {
    tenantId: tenantId(),
    areaId: uuid().notNull(),
    userId: uuid().notNull(),
    isLeader: boolean().notNull().default(false),
    createdAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "service_area_members_pkey", columns: [t.tenantId, t.areaId, t.userId] }),
    index("service_area_members_user_id_idx").on(t.userId),
    foreignKey({
      name: "service_area_members_area_id_fkey",
      columns: [t.tenantId, t.areaId],
      foreignColumns: [serviceAreas.tenantId, serviceAreas.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "service_area_members_user_id_fkey",
      columns: [t.userId],
      foreignColumns: [profiles.id],
    }).onDelete("cascade"),
  ],
).enableRLS();

export const serviceAreaRoles = pgTable(
  "service_area_roles",
  {
    tenantId: tenantId(),
    areaId: uuid().notNull(),
    role: text().notNull(),
    createdAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "service_area_roles_pkey", columns: [t.tenantId, t.areaId, t.role] }),
    check(
      "service_area_roles_role_check",
      sql`(role = ANY (ARRAY['song_admin'::text, 'event_admin'::text, 'music_leader'::text, 'course_admin'::text]))`,
    ),
    foreignKey({
      name: "service_area_roles_area_id_fkey",
      columns: [t.tenantId, t.areaId],
      foreignColumns: [serviceAreas.tenantId, serviceAreas.id],
    }).onDelete("cascade"),
  ],
).enableRLS();

export const volunteerTemplates = pgTable(
  "volunteer_templates",
  {
    tenantId: tenantId(),
    id: uuid().primaryKey().defaultRandom(),
    name: huText().notNull(),
    createdAt: timestamptz().notNull().defaultNow(),
    updatedAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    ...tenantIndexes("volunteer_templates", t),
    unique("volunteer_templates_name_key").on(t.tenantId, t.name),
    check(
      "volunteer_templates_name_check",
      sql`((name = btrim(name)) AND ((char_length(name) >= 1) AND (char_length(name) <= 100)))`,
    ),
  ],
).enableRLS();

export const volunteerTemplateAreas = pgTable(
  "volunteer_template_areas",
  {
    tenantId: tenantId(),
    templateId: uuid().notNull(),
    areaId: uuid().notNull(),
    createdAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    primaryKey({
      name: "volunteer_template_areas_pkey",
      columns: [t.tenantId, t.templateId, t.areaId],
    }),
    foreignKey({
      name: "volunteer_template_areas_template_id_fkey",
      columns: [t.tenantId, t.templateId],
      foreignColumns: [volunteerTemplates.tenantId, volunteerTemplates.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "volunteer_template_areas_area_id_fkey",
      columns: [t.tenantId, t.areaId],
      foreignColumns: [serviceAreas.tenantId, serviceAreas.id],
    }).onDelete("cascade"),
  ],
).enableRLS();

export const volunteerTemplateMembers = pgTable(
  "volunteer_template_members",
  {
    tenantId: tenantId(),
    templateId: uuid().notNull(),
    areaId: uuid().notNull(),
    userId: uuid().notNull(),
    position: smallint().notNull(),
    createdAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    primaryKey({
      name: "volunteer_template_members_pkey",
      columns: [t.tenantId, t.templateId, t.areaId, t.userId],
    }),
    check("volunteer_template_members_position_check", sql`("position" >= 0)`),
    foreignKey({
      name: "volunteer_template_members_template_id_fkey",
      columns: [t.tenantId, t.templateId],
      foreignColumns: [volunteerTemplates.tenantId, volunteerTemplates.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "volunteer_template_members_area_id_fkey",
      columns: [t.tenantId, t.areaId],
      foreignColumns: [serviceAreas.tenantId, serviceAreas.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "volunteer_template_members_user_id_fkey",
      columns: [t.userId],
      foreignColumns: [profiles.id],
    }).onDelete("cascade"),
  ],
).enableRLS();

export const eventVolunteers = pgTable(
  "event_volunteers",
  {
    tenantId: tenantId(),
    eventId: uuid().notNull(),
    userId: uuid().notNull(),
    createdAt: timestamptz().notNull().defaultNow(),
    /** `yes`, `maybe` or `no`; null: no reply yet. */
    reply: text(),
    repliedAt: timestamptz(),
  },
  (t) => [
    primaryKey({ name: "event_volunteers_pkey", columns: [t.tenantId, t.eventId, t.userId] }),
    index("event_volunteers_user_id_idx").on(t.userId),
    check(
      "event_volunteers_reply_check",
      sql`(reply = ANY (ARRAY['yes'::text, 'maybe'::text, 'no'::text]))`,
    ),
    check("event_volunteers_reply_time", sql`((reply IS NULL) = (replied_at IS NULL))`),
    foreignKey({
      name: "event_volunteers_event_id_fkey",
      columns: [t.tenantId, t.eventId],
      foreignColumns: [events.tenantId, events.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "event_volunteers_user_id_fkey",
      columns: [t.userId],
      foreignColumns: [profiles.id],
    }).onDelete("cascade"),
  ],
).enableRLS();

export const eventVolunteerAreas = pgTable(
  "event_volunteer_areas",
  {
    tenantId: tenantId(),
    eventId: uuid().notNull(),
    areaId: uuid().notNull(),
    userId: uuid().notNull(),
    position: smallint().notNull(),
    createdAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    primaryKey({
      name: "event_volunteer_areas_pkey",
      columns: [t.tenantId, t.eventId, t.areaId, t.userId],
    }),
    check("event_volunteer_areas_position_check", sql`("position" >= 0)`),
    foreignKey({
      name: "event_volunteer_areas_volunteer_fkey",
      columns: [t.tenantId, t.eventId, t.userId],
      foreignColumns: [eventVolunteers.tenantId, eventVolunteers.eventId, eventVolunteers.userId],
    }).onDelete("cascade"),
    foreignKey({
      name: "event_volunteer_areas_area_id_fkey",
      columns: [t.tenantId, t.areaId],
      foreignColumns: [serviceAreas.tenantId, serviceAreas.id],
    }).onDelete("cascade"),
  ],
).enableRLS();

export const eventAreaNotes = pgTable(
  "event_area_notes",
  {
    tenantId: tenantId(),
    eventId: uuid().notNull(),
    areaId: uuid().notNull(),
    note: text().notNull(),
    createdAt: timestamptz().notNull().defaultNow(),
    updatedAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "event_area_notes_pkey", columns: [t.tenantId, t.eventId, t.areaId] }),
    check(
      "event_area_notes_note_check",
      sql`((note = btrim(note)) AND ((char_length(note) >= 1) AND (char_length(note) <= 200)))`,
    ),
    foreignKey({
      name: "event_area_notes_event_id_fkey",
      columns: [t.tenantId, t.eventId],
      foreignColumns: [events.tenantId, events.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "event_area_notes_area_id_fkey",
      columns: [t.tenantId, t.areaId],
      foreignColumns: [serviceAreas.tenantId, serviceAreas.id],
    }).onDelete("cascade"),
  ],
).enableRLS();

export const eventTeamNotes = pgTable(
  "event_team_notes",
  {
    tenantId: tenantId(),
    eventId: uuid().notNull(),
    note: text().notNull(),
    createdAt: timestamptz().notNull().defaultNow(),
    updatedAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "event_team_notes_pkey", columns: [t.tenantId, t.eventId] }),
    check(
      "event_team_notes_note_check",
      sql`((note = btrim(note)) AND ((char_length(note) >= 1) AND (char_length(note) <= 500)))`,
    ),
    foreignKey({
      name: "event_team_notes_event_id_fkey",
      columns: [t.tenantId, t.eventId],
      foreignColumns: [events.tenantId, events.id],
    }).onDelete("cascade"),
  ],
).enableRLS();

export const setlistItemVolunteers = pgTable(
  "setlist_item_volunteers",
  {
    tenantId: tenantId(),
    setlistItemId: uuid().notNull(),
    eventId: uuid().notNull(),
    userId: uuid().notNull(),
    createdAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "setlist_item_volunteers_pkey", columns: [t.tenantId, t.setlistItemId] }),
    index("setlist_item_volunteers_event_user_idx").on(t.eventId, t.userId),
    foreignKey({
      name: "setlist_item_volunteers_setlist_item_id_fkey",
      columns: [t.tenantId, t.setlistItemId],
      foreignColumns: [setlistItems.tenantId, setlistItems.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "setlist_item_volunteers_volunteer_fkey",
      columns: [t.tenantId, t.eventId, t.userId],
      foreignColumns: [eventVolunteers.tenantId, eventVolunteers.eventId, eventVolunteers.userId],
    }).onDelete("cascade"),
  ],
).enableRLS();

/** The areas of a published course (courses phase 8 uses it; `service_area_uses` counts it). */
export const courseAreas = pgTable(
  "course_areas",
  {
    tenantId: tenantId(),
    courseId: uuid().notNull(),
    areaId: uuid().notNull(),
  },
  (t) => [
    primaryKey({ name: "course_areas_pkey", columns: [t.tenantId, t.courseId, t.areaId] }),
    index("course_areas_area_id_idx").on(t.areaId),
    foreignKey({
      name: "course_areas_course_id_fkey",
      columns: [t.tenantId, t.courseId],
      foreignColumns: [courses.tenantId, courses.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "course_areas_area_id_fkey",
      columns: [t.tenantId, t.areaId],
      foreignColumns: [serviceAreas.tenantId, serviceAreas.id],
    }).onDelete("cascade"),
  ],
).enableRLS();

// ---------------------------------------------------------------------------------------------
// Music merge phase 4c: event images (sets of projected images) and announcement items.
// ---------------------------------------------------------------------------------------------

export const eventImageSets = pgTable(
  "event_image_sets",
  {
    tenantId: tenantId(),
    id: uuid().primaryKey().defaultRandom(),
    eventId: uuid().notNull(),
    createdAt: timestamptz().notNull().defaultNow(),
    usedAt: timestamptz(),
  },
  (t) => [
    ...tenantIndexes("event_image_sets", t),
    index("event_image_sets_event_id_idx").on(t.eventId),
    foreignKey({
      name: "event_image_sets_event_id_fkey",
      columns: [t.tenantId, t.eventId],
      foreignColumns: [events.tenantId, events.id],
    }).onDelete("cascade"),
  ],
).enableRLS();

export const eventImages = pgTable(
  "event_images",
  {
    tenantId: tenantId(),
    id: uuid().primaryKey().defaultRandom(),
    eventId: uuid().notNull(),
    setId: uuid().notNull(),
    position: integer().notNull(),
    name: huText().notNull(),
    path: text().notNull(),
    width: integer().notNull(),
    height: integer().notNull(),
    sizeBytes: integer().notNull(),
    fit: text().notNull().default("contain"),
    scale: smallint().notNull().default(100),
    offsetX: smallint().notNull().default(0),
    offsetY: smallint().notNull().default(0),
    rotation: smallint().notNull().default(0),
    background: text().notNull().default("color"),
    backgroundColor: text().notNull().default("#000000"),
    createdAt: timestamptz().notNull().defaultNow(),
    updatedAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    ...tenantIndexes("event_images", t),
    unique("event_images_path_key").on(t.tenantId, t.path),
    unique("event_images_set_id_position_key").on(t.tenantId, t.setId, t.position),
    index("event_images_event_id_idx").on(t.eventId),
    check("event_images_position_check", sql`("position" >= 1)`),
    check(
      "event_images_name_check",
      sql`((name = btrim(name)) AND ((char_length(name) >= 1) AND (char_length(name) <= 100)))`,
    ),
    check("event_images_path_check", sql`(path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\\.webp$'::text)`),
    check("event_images_width_check", sql`((width >= 1) AND (width <= 10000))`),
    check("event_images_height_check", sql`((height >= 1) AND (height <= 10000))`),
    check("event_images_size_bytes_check", sql`((size_bytes >= 1) AND (size_bytes <= 5242880))`),
    check("event_images_fit_check", sql`(fit = ANY (ARRAY['contain'::text, 'cover'::text]))`),
    check("event_images_scale_check", sql`((scale >= 10) AND (scale <= 400))`),
    check("event_images_offset_x_check", sql`((offset_x >= '-50'::integer) AND (offset_x <= 50))`),
    check("event_images_offset_y_check", sql`((offset_y >= '-50'::integer) AND (offset_y <= 50))`),
    check("event_images_rotation_check", sql`(rotation = ANY (ARRAY[0, 90, 180, 270]))`),
    check(
      "event_images_background_check",
      sql`(background = ANY (ARRAY['color'::text, 'theme'::text, 'blur'::text]))`,
    ),
    check("event_images_background_color_check", sql`(background_color ~ '^#[0-9a-f]{6}$'::text)`),
    foreignKey({
      name: "event_images_event_id_fkey",
      columns: [t.tenantId, t.eventId],
      foreignColumns: [events.tenantId, events.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "event_images_set_id_fkey",
      columns: [t.tenantId, t.setId],
      foreignColumns: [eventImageSets.tenantId, eventImageSets.id],
    }).onDelete("cascade"),
  ],
).enableRLS();

export const eventAnnouncements = pgTable(
  "event_announcements",
  {
    tenantId: tenantId(),
    id: uuid().primaryKey().defaultRandom(),
    eventId: uuid().notNull(),
    calendarIds: uuid().array(),
    showTime: boolean()
      .notNull()
      .default(sql`true`),
    showLocation: boolean().notNull().default(false),
    showDescription: boolean().notNull().default(false),
    titleNextWeek: text(),
    titleThisMonth: text(),
    titleNextMonth: text(),
    snapshot: jsonb()
      .notNull()
      .default(sql`'[]'::jsonb`),
    calendarStatus: jsonb()
      .notNull()
      .default(sql`'{}'::jsonb`),
    refreshedAt: timestamptz(),
    refreshStartedAt: timestamptz(),
    createdAt: timestamptz().notNull().defaultNow(),
    usedAt: timestamptz(),
  },
  (t) => [
    ...tenantIndexes("event_announcements", t),
    index("event_announcements_event_id_idx").on(t.eventId),
    check("event_announcements_calendar_ids_check", sql`(cardinality(calendar_ids) <= 50)`),
    check("event_announcements_snapshot_check", sql`(jsonb_typeof(snapshot) = 'array'::text)`),
    check(
      "event_announcements_calendar_status_check",
      sql`(jsonb_typeof(calendar_status) = 'object'::text)`,
    ),
    check(
      "event_announcements_title_next_week_check",
      sql`((title_next_week = btrim(title_next_week)) AND ((char_length(title_next_week) >= 1) AND (char_length(title_next_week) <= 100)))`,
    ),
    check(
      "event_announcements_title_this_month_check",
      sql`((title_this_month = btrim(title_this_month)) AND ((char_length(title_this_month) >= 1) AND (char_length(title_this_month) <= 100)))`,
    ),
    check(
      "event_announcements_title_next_month_check",
      sql`((title_next_month = btrim(title_next_month)) AND ((char_length(title_next_month) >= 1) AND (char_length(title_next_month) <= 100)))`,
    ),
    foreignKey({
      name: "event_announcements_event_id_fkey",
      columns: [t.tenantId, t.eventId],
      foreignColumns: [events.tenantId, events.id],
    }).onDelete("cascade"),
  ],
).enableRLS();

export const eventAnnouncementEntries = pgTable(
  "event_announcement_entries",
  {
    tenantId: tenantId(),
    id: uuid().primaryKey().defaultRandom(),
    announcementId: uuid().notNull(),
    calendarId: uuid(),
    uid: text(),
    occurrence: text(),
    title: huText(),
    startsAt: timestamptz(),
    endsAt: timestamptz(),
    startDate: date({ mode: "string" }),
    endDate: date({ mode: "string" }),
    location: text(),
    description: text(),
    position: integer(),
    highlighted: boolean().notNull().default(false),
    excluded: boolean().notNull().default(false),
    showTime: boolean(),
    showLocation: boolean(),
    showDescription: boolean(),
    attachmentSetId: uuid(),
    qrText: text(),
    qrCaption: text(),
    textFirst: boolean().notNull().default(false),
    createdAt: timestamptz().notNull().defaultNow(),
    updatedAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    ...tenantIndexes("event_announcement_entries", t),
    index("event_announcement_entries_announcement_idx").on(t.announcementId),
    unique("event_announcement_entries_attachment_set_id_key").on(t.tenantId, t.attachmentSetId),
    check(
      "event_announcement_entries_kind_check",
      sql`(CASE WHEN (calendar_id IS NOT NULL) THEN ((uid IS NOT NULL) AND (occurrence IS NOT NULL) AND (title IS NULL) AND (starts_at IS NULL) AND (ends_at IS NULL) AND (start_date IS NULL) AND (end_date IS NULL) AND (location IS NULL) AND (description IS NULL) AND ("position" IS NULL)) ELSE ((uid IS NULL) AND (occurrence IS NULL) AND (title IS NOT NULL) AND ("position" IS NOT NULL)) END)`,
    ),
    check(
      "event_announcement_entries_date_check",
      sql`((NOT ((starts_at IS NOT NULL) AND (start_date IS NOT NULL))) AND ((ends_at IS NULL) OR ((starts_at IS NOT NULL) AND (ends_at >= starts_at))) AND ((end_date IS NULL) OR ((start_date IS NOT NULL) AND (end_date >= start_date))))`,
    ),
    check(
      "event_announcement_entries_undated_check",
      sql`((calendar_id IS NOT NULL) OR (starts_at IS NOT NULL) OR (start_date IS NOT NULL) OR highlighted)`,
    ),
    check(
      "event_announcement_entries_qr_check",
      sql`((qr_caption IS NULL) OR (qr_text IS NOT NULL))`,
    ),
    check(
      "event_announcement_entries_uid_check",
      sql`((char_length(uid) >= 1) AND (char_length(uid) <= 1000))`,
    ),
    check(
      "event_announcement_entries_occurrence_check",
      sql`((char_length(occurrence) >= 1) AND (char_length(occurrence) <= 40))`,
    ),
    check(
      "event_announcement_entries_title_check",
      sql`((title = btrim(title)) AND ((char_length(title) >= 1) AND (char_length(title) <= 200)))`,
    ),
    check(
      "event_announcement_entries_location_check",
      sql`((location = btrim(location)) AND ((char_length(location) >= 1) AND (char_length(location) <= 500)))`,
    ),
    check(
      "event_announcement_entries_description_check",
      sql`((char_length(description) >= 1) AND (char_length(description) <= 2000))`,
    ),
    check("event_announcement_entries_position_check", sql`("position" >= 0)`),
    check(
      "event_announcement_entries_qr_text_check",
      sql`((qr_text = btrim(qr_text)) AND ((char_length(qr_text) >= 1) AND (char_length(qr_text) <= 500)))`,
    ),
    check(
      "event_announcement_entries_qr_caption_check",
      sql`((qr_caption = btrim(qr_caption)) AND ((char_length(qr_caption) >= 1) AND (char_length(qr_caption) <= 200)))`,
    ),
    foreignKey({
      name: "event_announcement_entries_announcement_id_fkey",
      columns: [t.tenantId, t.announcementId],
      foreignColumns: [eventAnnouncements.tenantId, eventAnnouncements.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "event_announcement_entries_calendar_id_fkey",
      columns: [t.tenantId, t.calendarId],
      foreignColumns: [announcementCalendars.tenantId, announcementCalendars.id],
    }).onDelete("cascade"),
  ],
).enableRLS();

// ---------------------------------------------------------------------------------------------
// Projection (phase 5): the controllers open on an event, so that an event with an open
// projection is not deleted by accident and a user does not lose it.
// ---------------------------------------------------------------------------------------------

export const eventProjectionControllers = pgTable(
  "event_projection_controllers",
  {
    tenantId: tenantId(),
    id: uuid().primaryKey().defaultRandom(),
    eventId: uuid().notNull(),
    userId: uuid().notNull(),
    seenAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    ...tenantIndexes("event_projection_controllers", t),
    index("event_projection_controllers_event_id_idx").on(t.eventId, t.seenAt),
    index("event_projection_controllers_user_id_idx").on(t.userId),
    index("event_projection_controllers_seen_at_idx").on(t.seenAt),
    foreignKey({
      name: "event_projection_controllers_event_id_fkey",
      columns: [t.tenantId, t.eventId],
      foreignColumns: [events.tenantId, events.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "event_projection_controllers_user_id_fkey",
      columns: [t.userId],
      foreignColumns: [profiles.id],
    }).onDelete("cascade"),
  ],
).enableRLS();

// ---------------------------------------------------------------------------------------------
// Live sessions (phase 5b): many users follow one leader on the chord sheet of an event or of a
// rehearsal list. The leader sends the song, the place and the shared metronome grid on a
// realtime channel (`live:<id>`); this table only holds who leads and whether it runs.
// ---------------------------------------------------------------------------------------------

export const liveSessions = pgTable(
  "live_sessions",
  {
    tenantId: tenantId(),
    id: uuid().primaryKey().defaultRandom(),
    /** An event session. Null for a rehearsal session. */
    eventId: uuid(),
    /** A rehearsal session: the arrangements in playing order. Null for an event session. */
    arrangementIds: uuid().array(),
    /** The key of each arrangement of a rehearsal session (null: the key of the chart). */
    musicalKeys: text().array(),
    leaderId: uuid().notNull(),
    createdAt: timestamptz().notNull().defaultNow(),
    endedAt: timestamptz(),
  },
  (t) => [
    ...tenantIndexes("live_sessions", t),
    index("live_sessions_leader_id_idx").on(t.leaderId),
    // One running session per event; it also covers the lookup of the session of an event.
    uniqueIndex("live_sessions_one_per_event_idx")
      .on(t.tenantId, t.eventId)
      .where(sql`${t.endedAt} is null`),
    check(
      "live_sessions_event_or_rehearsal",
      sql`(${t.eventId} is null) <> (${t.arrangementIds} is null)`,
    ),
    check(
      "live_sessions_arrangement_ids_check",
      sql`cardinality(${t.arrangementIds}) between 1 and 100`,
    ),
    foreignKey({
      name: "live_sessions_event_id_fkey",
      columns: [t.tenantId, t.eventId],
      foreignColumns: [events.tenantId, events.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "live_sessions_leader_id_fkey",
      columns: [t.leaderId],
      foreignColumns: [profiles.id],
    }).onDelete("cascade"),
  ],
).enableRLS();
