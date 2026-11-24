# Music Sheet DB functions: conversion checklist

Music merge phase 1b (PLAN §11.1 "Security-definer functions: convert to SECURITY INVOKER per
feature phase"). One row per function of the music app's final schema (151 migrations; 196
functions in `public` and `private`). Only the functions the tenant-scoped schema itself needs
(generated columns, defaults, CHECKs) are in Churchy so far (migration `0005_music_functions`);
every other function is brought over, made tenant-aware (`app.current_tenant_id()`, no
`auth.uid()` policies/helpers) and converted to SECURITY INVOKER in the phase named here. Triggers
are functions too: each comes with its feature phase (phase 2 installed `set_updated_at` on songs
and arrangements, the arrangement attachment-link check and `share_song_rights`; stray-file
bookkeeping, `prevent_*`, `notify_*` … follow). The phase is a first assignment by name; correct it
when the phase starts. Phase 2 moved the review/import functions of the rights proposals here from
phase 8 (the song-rights pages came with it); the AI research functions stay in phase 8. The rows
marked 2b are the song files (second slice of phase 2). New tables of the music module have
`tenant_id DEFAULT app.current_tenant_id()` (0008), so the copied SQL and models insert without
naming the tenant.

| Function | Kind | Phase |
|---|---|---|
| `private.can_project_event(p_event_id uuid, p_user_id uuid)` | invoker | 4 (events, setlists, volunteers) |
| `private.check_area_members(p_areas jsonb)` | invoker | 4 (events, setlists, volunteers) |
| `private.check_course_image(p_id uuid, p_doc jsonb)` | invoker | 8 (courses) |
| `private.check_course_lessons(p_id uuid, p_doc jsonb)` | invoker | 8 (courses) |
| `private.check_moved_group_projections()` | invoker, trigger | 5 (projection) |
| `private.check_open_projection_before_delete()` | invoker, trigger | 5 (projection) |
| `private.check_projection_users()` | definer, trigger | 5 (projection) |
| `private.check_projection_users_of(p_user_ids uuid[])` | definer | 5 (projection) |
| `private.check_removed_member_projections()` | invoker, trigger | 5 (projection) |
| `private.check_service_area_children()` | invoker, trigger | 4 (events, setlists, volunteers) |
| `private.check_service_area_cycle()` | invoker, trigger | 4 (events, setlists, volunteers) |
| `private.check_service_area_role()` | invoker, trigger | 4 (events, setlists, volunteers) |
| `private.check_service_areas_limit()` | invoker, trigger | 4 (events, setlists, volunteers) |
| `private.check_team_outsiders(p_event_id uuid, p_teams jsonb)` | invoker | 4 (events, setlists, volunteers) |
| `private.check_volunteer_templates_limit()` | invoker, trigger | 4 (events, setlists, volunteers) |
| `private.course_document_with_area_order(p_doc jsonb)` | invoker | 8 (courses) |
| `private.course_is_open_to(p_course_id uuid, p_user_id uuid)` | invoker | 8 (courses) |
| `private.course_lesson_document(p_lesson course_lessons)` | invoker | 8 (courses) |
| `private.courses_before_area_delete()` | invoker, trigger | 8 (courses) |
| `private.event_topic_access(p_topic text)` | definer | 4 (events, setlists, volunteers) |
| `private.events_before_area_delete()` | invoker, trigger | 4 (events, setlists, volunteers) |
| `private.leads_service_area(p_area_id uuid, p_user_id uuid)` | invoker | 4 (events, setlists, volunteers) |
| `private.live_session_access(p_topic text)` | definer | dropped (Churchy login / user admin, PLAN §11) |
| `private.lock_course(p_id uuid, p_revision integer)` | invoker | 8 (courses) |
| `private.lock_service_area_tree()` | invoker, trigger | 4 (events, setlists, volunteers) |
| `private.normalize_event_areas()` | invoker, trigger | 4 (events, setlists, volunteers) |
| `private.normalize_event_blocks(p_event_id uuid)` | invoker | 4 (events, setlists, volunteers) |
| `private.notify_event(p_event_id uuid, p_kind text)` | definer | 8 (notifications) |
| `private.notify_event_change()` | definer, trigger | 8 (notifications) |
| `private.notify_event_part_change()` | definer, trigger | 8 (notifications) |
| `private.notify_song_change()` | definer, trigger | 8 (notifications) |
| `private.projection_access(p_topic text)` | definer | 5 (projection) |
| `private.projection_open_since()` | invoker | 5 (projection) |
| `private.rebuild_service_area_paths()` | invoker, trigger | 4 (events, setlists, volunteers) |
| `private.root_area_ids()` | invoker | 4 (events, setlists, volunteers) |
| `private.service_area_gives_roles(p_area_id uuid)` | invoker | 4 (events, setlists, volunteers) |
| `private.setlist_items_input(p_setlist_id uuid)` | invoker | 4 (events, setlists, volunteers) |
| `public.add_event_arrangement(p_event_id uuid, p_arrangement_id uuid, p_musical_key text)` | invoker | 4 (events, setlists, volunteers) |
| `public.add_event_image(p_set_id uuid, p_name text, p_path text, p_width integer, p_height integer, p_size_bytes integer, p_max integer, p_unused_before timestamp with time zone)` | invoker | 4 (events, setlists, volunteers) |
| `public.add_event_items(p_event_id uuid, p_items jsonb, p_after_key uuid)` | invoker | 4 (events, setlists, volunteers) |
| `public.add_new_user_to_service_areas(p_user_id uuid, p_area_ids uuid[])` | invoker | 4 (events, setlists, volunteers) |
| `public.add_song_image(p_song_id uuid, p_name text, p_keys text[], p_arrangement_ids uuid[], p_max integer)` | invoker | 2b — 0009_music_files (SECURITY INVOKER, tenant via RLS; stray-file rows name their own tenant) |
| `public.add_song_image_page(p_image_id uuid, p_path text, p_width integer, p_height integer, p_size_bytes integer, p_max integer)` | invoker | 2b — 0009_music_files (SECURITY INVOKER, tenant via RLS; stray-file rows name their own tenant) |
| `public.add_song_link(p_song_id uuid, p_name text, p_url text, p_keys text[], p_arrangement_ids uuid[], p_max integer)` | invoker | 2b — 0009_music_files (SECURITY INVOKER, tenant via RLS; stray-file rows name their own tenant) |
| `public.add_song_pdf(p_song_id uuid, p_name text, p_file_name text, p_path text, p_size_bytes integer, p_keys text[], p_arrangement_ids uuid[], p_max integer)` | invoker | 2b — 0009_music_files (SECURITY INVOKER, tenant via RLS; stray-file rows name their own tenant) |
| `public.add_song_sound_file(p_song_id uuid, p_name text, p_file_name text, p_path text, p_size_bytes integer, p_content_type text, p_keys text[], p_arrangement_ids uuid[], p_max integer)` | invoker | 2b — 0009_music_files (SECURITY INVOKER, tenant via RLS; stray-file rows name their own tenant) |
| `public.app_config_check_time_zone()` | invoker, trigger | 9 (modules, permissions) |
| `public.area_member_ids()` | invoker | 4 (events, setlists, volunteers) |
| `public.can_edit_course(p_course_id uuid, p_user_id uuid)` | invoker | 8 (courses) |
| `public.can_read_private_file(p_user_id uuid, p_session_id uuid, p_bucket text, p_path text)` | definer | 9 (modules, permissions) |
| `public.can_see_course(p_course_id uuid, p_user_id uuid)` | invoker | 8 (courses) |
| `public.can_see_event(p_event_id uuid, p_user_id uuid)` | invoker | 4 (events, setlists, volunteers) |
| `public.canonical_key(p_key text, p_notation text)` | invoker | 1b — copied to 0005_music_functions (SECURITY INVOKER; church_time_zone made tenant-scoped) |
| `public.chart_key_names(p_chordpro text)` | invoker | 1b — copied to 0005_music_functions (SECURITY INVOKER; church_time_zone made tenant-scoped) |
| `public.chart_lyrics(p_chordpro text)` | invoker | 2 — 0008_music_songs (SECURITY INVOKER, tenant via RLS) |
| `public.chart_notation(p_chordpro text)` | invoker | 1b — copied to 0005_music_functions (SECURITY INVOKER; church_time_zone made tenant-scoped) |
| `public.check_annotation_setlist_item()` | invoker, trigger | 3 — 0010_music_sheet (SECURITY INVOKER, tenant via RLS) |
| `public.check_arrangement_attachment_links()` | invoker, trigger | 2 — 0008_music_songs (SECURITY INVOKER; skips cascading deletes) |
| `public.check_live_session_arrangements()` | invoker, trigger | dropped (Churchy login / user admin, PLAN §11) |
| `public.check_setlist()` | invoker, trigger | 4 (events, setlists, volunteers) |
| `public.check_setlist_item_volunteer()` | invoker, trigger | 4 (events, setlists, volunteers) |
| `public.chordpro_directive(p_chordpro text, p_name text)` | invoker | 1b — copied to 0005_music_functions (SECURITY INVOKER; church_time_zone made tenant-scoped) |
| `public.church_day(p_at timestamp with time zone)` | invoker | 4 (events, setlists, volunteers) |
| `public.church_time_zone()` | invoker | 1b — copied to 0005_music_functions (SECURITY INVOKER; church_time_zone made tenant-scoped) |
| `public.claim_announcement_refresh(p_id uuid, p_force boolean)` | invoker | 4 (events, setlists, volunteers) |
| `public.claim_song_for_rights_research(p_song_id uuid, p_provider text, p_model text)` | invoker | 2b — 0009_music_files (AI research now, ON CONFLICT on the tenant-scoped open-proposal index; the nightly batch stays phase 8) |
| `public.claim_songs_for_rights_research(p_batch integer, p_provider text, p_model text)` | invoker | 8 (rights research) |
| `public.claim_songs_for_rights_research_now(p_count integer, p_provider text, p_model text)` | invoker | 2b — 0009_music_files (AI research now, ON CONFLICT on the tenant-scoped open-proposal index; the nightly batch stays phase 8) |
| `public.claim_stray_file()` | invoker, trigger | 2b — 0009_music_files (SECURITY INVOKER, tenant via RLS; stray-file rows name their own tenant) |
| `public.clamp_live_session_end()` | invoker, trigger | dropped (Churchy login / user admin, PLAN §11) |
| `public.clear_email_mfa_codes(p_user_id uuid)` | definer | dropped (Churchy login / user admin, PLAN §11) |
| `public.clone_arrangement(p_id uuid, p_name text)` | invoker | 2 — 0008_music_songs (SECURITY INVOKER, tenant via RLS) |
| `public.close_crashed_song_rights_research(p_song_id uuid)` | invoker | 2b — 0009_music_files (AI research now, ON CONFLICT on the tenant-scoped open-proposal index; the nightly batch stays phase 8) |
| `public.consume_cron_token(p_token text)` | definer | 8 (pg_cron → pg-boss) |
| `public.consume_rate_limit(p_key text, p_max integer, p_window_seconds integer)` | definer | dropped (Churchy login / user admin, PLAN §11) |
| `public.copy_announcement_entries(p_source_id uuid, p_target_id uuid, p_files jsonb)` | invoker | 4 (events, setlists, volunteers) |
| `public.copy_event(p_id uuid, p_source_id uuid, p_title text, p_starts_at timestamp with time zone, p_duration_minutes integer, p_youtube_url text, p_copy_items boolean, p_copy_volunteers boolean, p_files jsonb)` | invoker | 4 (events, setlists, volunteers) |
| `public.copy_event(p_id uuid, p_source_id uuid, p_title text, p_starts_at timestamp with time zone, p_duration_minutes integer, p_youtube_url text, p_copy_items boolean, p_copy_volunteers boolean, p_files jsonb, p_is_private boolean, p_created_by uuid)` | invoker | 4 (events, setlists, volunteers) |
| `public.copy_event(p_id uuid, p_source_id uuid, p_title text, p_starts_at timestamp with time zone, p_duration_minutes integer, p_youtube_url text, p_copy_items boolean, p_copy_volunteers boolean, p_files jsonb, p_is_private boolean, p_created_by uuid, p_area_ids uuid[])` | invoker | 4 (events, setlists, volunteers) |
| `public.copy_event(p_source_id uuid, p_title text, p_starts_at timestamp with time zone, p_duration_minutes integer, p_youtube_url text, p_copy_items boolean, p_copy_volunteers boolean)` | invoker | 4 (events, setlists, volunteers) |
| `public.copy_event_announcement(p_source_id uuid, p_target_id uuid, p_files jsonb)` | invoker | 4 (events, setlists, volunteers) |
| `public.copy_event_image_set(p_set_id uuid, p_event_id uuid, p_files jsonb)` | invoker | 4 (events, setlists, volunteers) |
| `public.count_event_images_for_limit(p_set_id uuid, p_unused_before timestamp with time zone)` | invoker | 4 (events, setlists, volunteers) |
| `public.count_song_rights_proposals()` | invoker | 2 — 0008_music_songs (SECURITY INVOKER, tenant via RLS) |
| `public.count_songs_for_rights_research()` | invoker | 2 — 0008_music_songs (SECURITY INVOKER, tenant via RLS) |
| `public.course_document(p_id uuid)` | invoker | 8 (courses) |
| `public.course_summaries()` | invoker | 8 (courses) |
| `public.create_email_mfa_code(p_user_id uuid, p_session_id uuid, p_code_hash text)` | definer | dropped (Churchy login / user admin, PLAN §11) |
| `public.create_event_block(p_event_id uuid, p_item_keys uuid[], p_name text, p_countdown text, p_until time without time zone)` | invoker | 4 (events, setlists, volunteers) |
| `public.create_event_with_items(p_title text, p_starts_at timestamp with time zone, p_duration_minutes integer, p_youtube_url text, p_items jsonb)` | invoker | 4 (events, setlists, volunteers) |
| `public.create_event_with_items(p_title text, p_starts_at timestamp with time zone, p_duration_minutes integer, p_youtube_url text, p_items jsonb, p_is_private boolean, p_created_by uuid)` | invoker | 4 (events, setlists, volunteers) |
| `public.create_event_with_items(p_title text, p_starts_at timestamp with time zone, p_duration_minutes integer, p_youtube_url text, p_items jsonb, p_is_private boolean, p_created_by uuid, p_area_ids uuid[])` | invoker | 4 (events, setlists, volunteers) |
| `public.create_service_area(p_parent_id uuid, p_name text)` | invoker | 4 (events, setlists, volunteers) |
| `public.create_song(p_title text, p_artist text, p_tags text[], p_chordpro text, p_section_order text[], p_copyright text, p_songbook text, p_authors text, p_original_title text, p_translator text, p_rights_status text, p_rights_note text)` | invoker | 2 — 0008_music_songs (SECURITY INVOKER, tenant via RLS) |
| `public.create_volunteer_template(p_name text, p_area_ids uuid[])` | invoker | 4 (events, setlists, volunteers) |
| `public.custom_access_token_hook(event jsonb)` | invoker | dropped (Churchy login / user admin, PLAN §11) |
| `public.delete_event_block(p_event_id uuid, p_key uuid)` | invoker | 4 (events, setlists, volunteers) |
| `public.delete_service_area(p_id uuid, p_grant_roles boolean, p_actor_id uuid)` | invoker | 4 (events, setlists, volunteers) |
| `public.delete_unused_event_announcements(p_before timestamp with time zone)` | invoker | 4 (events, setlists, volunteers) |
| `public.delete_unused_event_image_sets(p_before timestamp with time zone)` | invoker | 4 (events, setlists, volunteers) |
| `public.delete_unused_setlist()` | invoker, trigger | 4 (events, setlists, volunteers) |
| `public.discard_course_draft(p_id uuid, p_revision integer)` | invoker | 8 (courses) |
| `public.editable_course_ids(p_user_id uuid)` | invoker | 8 (courses) |
| `public.end_live_sessions()` | definer | dropped (Churchy login / user admin, PLAN §11) |
| `public.end_projections()` | definer | 5 (projection) |
| `public.event_ends_at(p_starts_at timestamp with time zone, p_duration_minutes integer)` | invoker | 4 (events, setlists, volunteers) |
| `public.event_member_access(p_user_id uuid)` | invoker | 4 (events, setlists, volunteers) |
| `public.filter_songs(p_query text, p_key text, p_time_signature text, p_bpm_min integer, p_bpm_max integer, p_tag text, p_sort text, p_limit integer, p_offset integer)` | invoker | 2 — 0008_music_songs (SECURITY INVOKER; `recent`/`oldest` sorts wait for events, phase 4) |
| `public.fold_text(p_text text)` | invoker | 2 — 0008_music_songs (SECURITY INVOKER, tenant via RLS) |
| `public.has_distinct_elements(p_values uuid[])` | invoker | 2 — 0008_music_songs (SECURITY INVOKER, tenant via RLS) |
| `public.hook_mfa_verification_attempt(event jsonb)` | invoker | dropped (Churchy login / user admin, PLAN §11) |
| `public.import_song_rights_findings(p_model text, p_findings jsonb)` | invoker | 2 — 0008_music_songs (SECURITY INVOKER; ON CONFLICT on the tenant-scoped open-proposal index) |
| `public.keep_default_projection_theme()` | invoker, trigger | 5 (projection) |
| `public.keep_one_superadmin()` | definer, trigger | dropped (Churchy login / user admin, PLAN §11) |
| `public.keep_session_after_totp_removal(p_user_id uuid, p_session_id uuid)` | definer | dropped (Churchy login / user admin, PLAN §11) |
| `public.keep_stray_file()` | invoker, trigger | 2b — 0009_music_files (SECURITY INVOKER, tenant via RLS; stray-file rows name their own tenant) |
| `public.led_area_ids(p_user_id uuid)` | invoker | 4 (events, setlists, volunteers) |
| `public.list_due_notifications(p_limit integer)` | invoker | 8 (notifications) |
| `public.mark_event_announcement_used()` | invoker, trigger | 4 (events, setlists, volunteers) |
| `public.mark_event_image_set_used()` | invoker, trigger | 4 (events, setlists, volunteers) |
| `public.member_area_ids(p_user_id uuid)` | invoker | 4 (events, setlists, volunteers) |
| `public.module_enabled(p_id text)` | definer | 9 (modules, permissions) |
| `public.move_event_set_images(p_set_id uuid, p_image_ids uuid[])` | invoker | 4 (events, setlists, volunteers) |
| `public.move_service_area(p_id uuid, p_parent_id uuid)` | invoker | 4 (events, setlists, volunteers) |
| `public.move_song_image_pages(p_image_id uuid, p_page_ids uuid[])` | invoker | 2b — 0009_music_files (SECURITY INVOKER, tenant via RLS; stray-file rows name their own tenant) |
| `public.place_service_area(p_id uuid, p_parent_id uuid, p_ids uuid[], p_grant_roles boolean, p_actor_id uuid)` | invoker | 4 (events, setlists, volunteers) |
| `public.prevent_setlist_update()` | invoker, trigger | 4 (events, setlists, volunteers) |
| `public.prevent_song_id_update()` | invoker, trigger | 2b — 0009_music_files (song files and arrangements) |
| `public.publish_course(p_id uuid, p_revision integer, p_doc jsonb)` | invoker | 8 (courses) |
| `public.put_scripture_cache_verses(p_translation text, p_book text, p_verses jsonb, p_book_limit integer)` | invoker | 6 (scripture) |
| `public.recent_closed_song_rights_proposals(p_limit integer)` | invoker | 2 — 0008_music_songs (SECURITY INVOKER, tenant via RLS) |
| `public.remove_calendar_entries_from_snapshots()` | invoker, trigger | 4 (events, setlists, volunteers) |
| `public.remove_course_lesson(p_course_id uuid, p_lesson_id uuid, p_revision integer)` | invoker | 8 (courses) |
| `public.remove_event_item(p_event_id uuid, p_key uuid)` | invoker | 4 (events, setlists, volunteers) |
| `public.reset_notification_deliveries()` | invoker, trigger | 8 (notifications) |
| `public.reset_volunteer_replies()` | invoker, trigger | 4 (events, setlists, volunteers) |
| `public.restore_course_lesson(p_course_id uuid, p_lesson_id uuid, p_revision integer)` | invoker | 8 (courses) |
| `public.review_song_rights_proposal(p_id uuid, p_user uuid, p_accept boolean, p_changes jsonb)` | invoker | 2 — 0008_music_songs (SECURITY INVOKER, tenant via RLS) |
| `public.revoke_user_sessions(p_user_id uuid)` | definer | dropped (Churchy login / user admin, PLAN §11) |
| `public.save_course_draft(p_id uuid, p_revision integer, p_doc jsonb)` | invoker | 8 (courses) |
| `public.search_key(p_text text)` | invoker | 2 — 0008_music_songs (SECURITY INVOKER, tenant via RLS) |
| `public.service_area_uses(p_id uuid)` | invoker | 4 (events, setlists, volunteers) |
| `public.set_announcement_entry_attachment(p_entry_id uuid, p_set_id uuid)` | invoker | 4 (events, setlists, volunteers) |
| `public.set_course_order(p_ids uuid[])` | invoker | 8 (courses) |
| `public.set_default_arrangement(p_id uuid)` | invoker | 2 — 0008_music_songs (SECURITY INVOKER, tenant via RLS) |
| `public.set_default_projection_theme(p_id uuid)` | invoker | 5 (projection) |
| `public.set_event_area_note(p_event_id uuid, p_area_id uuid, p_note text)` | invoker | 4 (events, setlists, volunteers) |
| `public.set_event_area_team(p_event_id uuid, p_area_id uuid, p_user_ids jsonb, p_any_user boolean)` | invoker | 4 (events, setlists, volunteers) |
| `public.set_event_area_teams(p_event_id uuid, p_teams jsonb, p_any_user boolean)` | invoker | 4 (events, setlists, volunteers) |
| `public.set_event_item_theme(p_event_id uuid, p_item_id uuid, p_theme_id uuid)` | invoker | 5 (projection) |
| `public.set_event_items(p_event_id uuid, p_items jsonb)` | invoker | 4 (events, setlists, volunteers) |
| `public.set_event_items(p_event_id uuid, p_items jsonb, p_base_setlist_id uuid, p_check_base boolean)` | invoker | 4 (events, setlists, volunteers) |
| `public.set_event_teams(p_event_id uuid, p_template_id uuid, p_teams jsonb)` | invoker | 4 (events, setlists, volunteers) |
| `public.set_projection_theme_video(p_theme_id uuid, p_video_path text, p_poster_path text)` | invoker | 5 (projection) |
| `public.set_service_area_members(p_area_id uuid, p_members jsonb, p_grant_roles boolean, p_actor_id uuid)` | invoker | 4 (events, setlists, volunteers) |
| `public.set_service_area_order(p_parent_id uuid, p_ids uuid[])` | invoker | 4 (events, setlists, volunteers) |
| `public.set_service_area_roles(p_area_id uuid, p_roles text[])` | invoker | 4 (events, setlists, volunteers) |
| `public.set_song_image_arrangements(p_image_id uuid, p_song_id uuid, p_arrangement_ids uuid[])` | invoker | 2b — 0009_music_files (SECURITY INVOKER, tenant via RLS; stray-file rows name their own tenant) |
| `public.set_song_link_arrangements(p_link_id uuid, p_song_id uuid, p_arrangement_ids uuid[])` | invoker | 2b — 0009_music_files (SECURITY INVOKER, tenant via RLS; stray-file rows name their own tenant) |
| `public.set_song_pdf_arrangements(p_pdf_id uuid, p_song_id uuid, p_arrangement_ids uuid[])` | invoker | 2b — 0009_music_files (SECURITY INVOKER, tenant via RLS; stray-file rows name their own tenant) |
| `public.set_song_rights_research_api_key(p_key text, p_user uuid)` | definer | 8 (rights research) |
| `public.set_song_sound_file_arrangements(p_sound_file_id uuid, p_song_id uuid, p_arrangement_ids uuid[])` | invoker | 2b — 0009_music_files (SECURITY INVOKER, tenant via RLS; stray-file rows name their own tenant) |
| `public.set_updated_at()` | invoker, trigger | 2 — 0008_music_songs (SECURITY INVOKER, tenant via RLS) |
| `public.set_user_roles(p_user_id uuid, p_roles text[])` | invoker | dropped (Churchy login / user admin, PLAN §11) |
| `public.set_volunteer_reply(p_event_id uuid, p_user_id uuid, p_reply text)` | invoker | 4 (events, setlists, volunteers) |
| `public.set_volunteer_template(p_id uuid, p_name text, p_area_ids uuid[])` | invoker | 4 (events, setlists, volunteers) |
| `public.set_volunteer_template_area(p_template_id uuid, p_area_id uuid, p_on boolean)` | invoker | 4 (events, setlists, volunteers) |
| `public.setlist_song_count(p_items jsonb)` | invoker | 1b — copied to 0005_music_functions (SECURITY INVOKER; church_time_zone made tenant-scoped) |
| `public.song_filter_options()` | invoker | 2 — 0008_music_songs (SECURITY INVOKER, tenant via RLS) |
| `public.song_image_pages_keep_stray_file()` | invoker, trigger | 2b — 0009_music_files (SECURITY INVOKER, tenant via RLS; stray-file rows name their own tenant) |
| `public.song_play_stats(p_song_ids uuid[])` | invoker | 2 — 0008_music_songs as a stub (`{}`): plays come from events, phase 4 |
| `public.song_play_stats(p_song_ids uuid[], p_user_id uuid)` | invoker | 2 — 0008_music_songs as a stub (`{}`): plays come from events, phase 4 |
| `public.song_rights_research_api_key()` | definer | 8 (rights research) |
| `public.song_tags()` | invoker | 2 — 0008_music_songs (SECURITY INVOKER, tenant via RLS) |
| `public.songs_for_local_rights_research()` | invoker | 2 — 0008_music_songs (SECURITY INVOKER, tenant via RLS) |
| `public.songs_for_rights_research()` | invoker | 2 — 0008_music_songs (SECURITY INVOKER, tenant via RLS) |
| `public.start_event_block(p_event_id uuid, p_key uuid, p_restart boolean)` | invoker | 4 (events, setlists, volunteers) |
| `public.start_projection_video_upload(p_user_id uuid, p_path text, p_max integer)` | invoker | 5 (projection) |
| `public.start_song_pdf_upload(p_user_id uuid, p_path text, p_max integer)` | invoker | 2b — 0009_music_files (SECURITY INVOKER, tenant via RLS; stray-file rows name their own tenant) |
| `public.start_song_sound_file_upload(p_user_id uuid, p_path text, p_max integer)` | invoker | 2b — 0009_music_files (SECURITY INVOKER, tenant via RLS; stray-file rows name their own tenant) |
| `public.swap_announcement_calendars(p_id uuid, p_other_id uuid)` | invoker | 4 (events, setlists, volunteers) |
| `public.touch_projection_controller(p_id uuid, p_event_id uuid, p_user_id uuid)` | invoker | 5 (projection) |
| `public.update_event_block(p_event_id uuid, p_key uuid, p_name text, p_countdown text, p_until time without time zone)` | invoker | 4 (events, setlists, volunteers) |
| `public.update_event_block(p_event_id uuid, p_key uuid, p_name text, p_countdown text, p_until time without time zone, p_duration_seconds integer)` | invoker | 4 (events, setlists, volunteers) |
| `public.update_profile(p_user_id uuid, p_changes jsonb)` | invoker | dropped (Churchy login / user admin, PLAN §11) |
| `public.update_song_image(p_id uuid, p_name text, p_keys text[], p_arrangement_ids uuid[])` | invoker | 2b — 0009_music_files (SECURITY INVOKER, tenant via RLS; stray-file rows name their own tenant) |
| `public.update_song_link(p_id uuid, p_name text, p_url text, p_keys text[], p_arrangement_ids uuid[])` | invoker | 2b — 0009_music_files (SECURITY INVOKER, tenant via RLS; stray-file rows name their own tenant) |
| `public.update_song_pdf(p_id uuid, p_name text, p_keys text[], p_arrangement_ids uuid[])` | invoker | 2b — 0009_music_files (SECURITY INVOKER, tenant via RLS; stray-file rows name their own tenant) |
| `public.update_song_sound_file(p_id uuid, p_name text, p_keys text[], p_arrangement_ids uuid[])` | invoker | 2b — 0009_music_files (SECURITY INVOKER, tenant via RLS; stray-file rows name their own tenant) |
| `public.user_access(p_user_id uuid)` | invoker | 9 (modules, permissions) |
| `public.user_role_lists()` | invoker | dropped (Churchy login / user admin, PLAN §11) |
| `public.valid_announcement_words(p_words text[])` | invoker | 1b — copied to 0005_music_functions (SECURITY INVOKER; church_time_zone made tenant-scoped) |
| `public.valid_song_tags(p_tags text[])` | invoker | 1b — copied to 0005_music_functions (SECURITY INVOKER; church_time_zone made tenant-scoped) |
| `public.verify_email_mfa_code(p_user_id uuid, p_session_id uuid, p_code_hash text)` | definer | dropped (Churchy login / user admin, PLAN §11) |
| `public.visible_course_ids(p_user_id uuid)` | invoker | 8 (courses) |
| `public.visible_course_summaries(p_user_id uuid)` | invoker | 8 (courses) |

## Churchy-only functions (music phase 2)

| Function | Kind | Migration |
|---|---|---|
| `public.song_rights_ccli(p_copyright text)` | invoker | 0008_music_songs — the CCLI song number in a copyright text |
| `public.share_song_rights()` | **definer**, trigger | 0008_music_songs — upserts the shared `song_rights` row after a song's rights facts change; the only write path to the shared rows (they stay read-only for `churchy_app` / `churchy_music`); no EXECUTE grant. Owner: the migration role, which must bypass RLS (Supabase `postgres`). Accepted (PLAN §11.4). |
| `public.count_song_rights_researches_this_month()` | invoker | 0009_music_files — the church's AI researches this calendar month (Europe/Budapest), for the per-plan cap |
| `public.shared_song_rights(p_title text, p_authors text, p_copyright text)` | invoker | 0008_music_songs — the shared facts for a song (CCLI number, else title + authors) |

