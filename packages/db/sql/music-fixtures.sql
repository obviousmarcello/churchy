-- Isolation-suite fixtures for the music tables (fictitious; src/isolation.db.test.ts).
-- One row per music table for the tenant ':tenant' (and the profile ':user'), using the demo seed's
-- first song and arrangement of that tenant. Placeholders are replaced by the test.
DO $fixtures$
DECLARE
  t uuid := ':tenant';
  u uuid := ':user';
  song uuid;
  arr uuid;
  theme uuid := gen_random_uuid();
  setlist uuid := gen_random_uuid();
  item uuid := gen_random_uuid();
  blk uuid := gen_random_uuid();
  evcal uuid;
  pdf uuid := gen_random_uuid();
  img uuid := gen_random_uuid();
  snd uuid := gen_random_uuid();
  lnk uuid := gen_random_uuid();
  course uuid := gen_random_uuid();
  cal uuid := gen_random_uuid();
BEGIN
  SELECT s.id INTO song FROM songs s WHERE s.tenant_id = t ORDER BY s.id LIMIT 1;
  IF song IS NULL THEN
    INSERT INTO songs (tenant_id, title) VALUES (t, 'Próbaének') RETURNING id INTO song;
  END IF;
  SELECT a.id INTO arr FROM arrangements a WHERE a.tenant_id = t AND a.song_id = song LIMIT 1;
  IF arr IS NULL THEN
    INSERT INTO arrangements (tenant_id, song_id, name, chordpro)
      VALUES (t, song, 'Próba', '{key: G}') RETURNING id INTO arr;
  END IF;
  INSERT INTO projection_themes (tenant_id, id, name, background_color, font, text_color)
    VALUES (t, theme, 'Alap', '#000000', 'sans', '#ffffff');
  INSERT INTO setlists (tenant_id, id, items)
    VALUES (t, setlist, jsonb_build_array(jsonb_build_object('arrangement_id', arr)));
  INSERT INTO setlist_items (tenant_id, id, setlist_id, position, arrangement_id)
    VALUES (t, item, setlist, 0, arr);
  SELECT id INTO evcal FROM calendars WHERE tenant_id = t LIMIT 1;
  INSERT INTO events (tenant_id, calendar_id, visibility, slug, title, starts_at, ends_at, status, setlist_id)
    VALUES (t, evcal, 'staff', 'fixture-' || setlist, 'Vasárnapi alkalom', now(), now() + interval '90 minutes',
            'published', setlist);
  INSERT INTO event_blocks (tenant_id, event_id, key, name)
    SELECT t, e.id, blk, 'Dicsőítés' FROM events e WHERE e.tenant_id = t AND e.setlist_id = setlist;
  INSERT INTO setlist_item_blocks (tenant_id, setlist_item_id, event_id, block_key)
    SELECT t, item, e.id, blk FROM events e WHERE e.tenant_id = t AND e.setlist_id = setlist;
  INSERT INTO setlist_item_durations (tenant_id, setlist_item_id, seconds) VALUES (t, item, 240);
  INSERT INTO setlist_item_themes (tenant_id, setlist_item_id, theme_id) VALUES (t, item, theme);
  INSERT INTO annotations (tenant_id, user_id, song_id, body) VALUES (t, u, song, 'Lassabban');
  INSERT INTO sheet_marks (tenant_id, user_id, id, arrangement_id, mark)
    VALUES (t, u, gen_random_uuid(), arr, '{}');
  INSERT INTO user_arrangements (tenant_id, user_id, arrangement_id, capo) VALUES (t, u, arr, 2);
  INSERT INTO user_arrangement_views (tenant_id, user_id, arrangement_id, device_type, settings)
    VALUES (t, u, arr, 'phone', '{"zoom": 1}');
  INSERT INTO song_pdfs (tenant_id, id, song_id, name, file_name, path, size_bytes)
    VALUES (t, pdf, song, 'Kotta', 'kotta.pdf', song || '/' || gen_random_uuid() || '.pdf', 1000);
  INSERT INTO song_pdf_arrangements (tenant_id, pdf_id, arrangement_id, song_id) VALUES (t, pdf, arr, song);
  INSERT INTO song_pdf_uploads (tenant_id, path) VALUES (t, song || '/' || gen_random_uuid() || '.pdf');
  INSERT INTO song_images (tenant_id, id, song_id, name) VALUES (t, img, song, 'Kép');
  INSERT INTO song_image_pages (tenant_id, image_id, position, path, width, height, size_bytes)
    VALUES (t, img, 1, song || '/' || img || '/' || gen_random_uuid() || '.webp', 10, 10, 100);
  INSERT INTO song_image_arrangements (tenant_id, image_id, arrangement_id, song_id) VALUES (t, img, arr, song);
  INSERT INTO song_image_stray_files (tenant_id, path)
    VALUES (t, song || '/' || img || '/' || gen_random_uuid() || '.webp');
  INSERT INTO user_file_views (tenant_id, user_id, pdf_id, zoom, x, y) VALUES (t, u, pdf, 2, 0.5, 0.5);
  INSERT INTO stray_files (tenant_id, bucket, path) VALUES (t, 'pdfs', gen_random_uuid()::text);
  INSERT INTO song_scores (tenant_id, song_id, name, file_name, path)
    VALUES (t, song, 'Partitúra', 'p.mxl', song || '/' || gen_random_uuid() || '.mxl');
  INSERT INTO song_sound_files (tenant_id, id, song_id, name, file_name, path, size_bytes, content_type)
    VALUES (t, snd, song, 'Hang', 'h.mp3', song || '/' || gen_random_uuid(), 1000, 'audio/mpeg');
  INSERT INTO song_sound_file_arrangements (tenant_id, sound_file_id, arrangement_id, song_id)
    VALUES (t, snd, arr, song);
  INSERT INTO song_sound_file_uploads (tenant_id, path) VALUES (t, song || '/' || gen_random_uuid());
  INSERT INTO song_links (tenant_id, id, song_id, name, url) VALUES (t, lnk, song, 'Link', 'https://example.org/');
  INSERT INTO song_link_arrangements (tenant_id, link_id, arrangement_id, song_id) VALUES (t, lnk, arr, song);
  INSERT INTO song_rights_proposals (tenant_id, song_id, provider, model) VALUES (t, song, 'local', 'teszt');
  INSERT INTO song_rights_research_settings (tenant_id) VALUES (t);
  INSERT INTO projection_video_uploads (tenant_id, path)
    VALUES (t, gen_random_uuid() || '/' || gen_random_uuid() || '.mp4');
  INSERT INTO mixer_settings (tenant_id) VALUES (t);
  INSERT INTO courses (tenant_id, id, title, language, position) VALUES (t, course, 'Kurzus', 'hu', 1);
  INSERT INTO course_lessons (tenant_id, id, course_id, position, title)
    VALUES (t, gen_random_uuid(), course, 0, 'Lecke');
  INSERT INTO course_images (tenant_id, path, course_id) VALUES (t, course || '/' || gen_random_uuid() || '.webp', course);
  INSERT INTO app_config (tenant_id, app_name) VALUES (t, 'Énektár');
  INSERT INTO app_modules (tenant_id, id, enabled) VALUES (t, 'songs.pdfs', false);
  INSERT INTO email_templates (tenant_id, kind, locale, subject, body) VALUES (t, 'welcome', 'hu', 'Szia', 'Üdv');
  INSERT INTO notification_preferences (tenant_id, user_id) VALUES (t, u);
  INSERT INTO push_subscriptions (tenant_id, user_id, endpoint, p256dh, auth)
    VALUES (t, u, 'https://push.example.org/' || gen_random_uuid(), 'abc', 'def');
  INSERT INTO calendar_feeds (tenant_id, user_id, token_hash)
    VALUES (t, u, md5(random()::text) || md5(random()::text));
  INSERT INTO announcement_calendars (tenant_id, id, name, ics_url, position)
    VALUES (t, cal, 'Hirdetések', 'https://example.org/cal.ics', 0);
  INSERT INTO announcement_settings (tenant_id) VALUES (t);
  INSERT INTO scripture_books (tenant_id, translation, book, chapters) VALUES (t, 'sajat', 'Gen', '[50]');
  INSERT INTO scripture_verse_cache (tenant_id, translation, book, chapter, verse, text)
    VALUES (t, 'sajat', 'Gen', 1, 1, 'Kezdetben');
  INSERT INTO song_rights (tenant_id, title_key, title) VALUES (t, 'sajatdal', 'Saját dal');
END
$fixtures$;
