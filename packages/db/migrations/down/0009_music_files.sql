-- Down of 0009_music_files: its triggers, then its functions.
--> statement-breakpoint
DROP TRIGGER IF EXISTS song_scores_set_updated_at ON public.song_scores;
--> statement-breakpoint
DROP TRIGGER IF EXISTS song_pdfs_set_updated_at ON public.song_pdfs;
--> statement-breakpoint
DROP TRIGGER IF EXISTS song_images_set_updated_at ON public.song_images;
--> statement-breakpoint
DROP TRIGGER IF EXISTS song_links_set_updated_at ON public.song_links;
--> statement-breakpoint
DROP TRIGGER IF EXISTS song_sound_files_set_updated_at ON public.song_sound_files;
--> statement-breakpoint
DROP TRIGGER IF EXISTS arrangements_prevent_song_id_update ON public.arrangements;
--> statement-breakpoint
DROP TRIGGER IF EXISTS song_pdfs_prevent_song_id_update ON public.song_pdfs;
--> statement-breakpoint
DROP TRIGGER IF EXISTS song_images_prevent_song_id_update ON public.song_images;
--> statement-breakpoint
DROP TRIGGER IF EXISTS song_links_prevent_song_id_update ON public.song_links;
--> statement-breakpoint
DROP TRIGGER IF EXISTS song_scores_prevent_song_id_update ON public.song_scores;
--> statement-breakpoint
DROP TRIGGER IF EXISTS song_sound_files_prevent_song_id_update ON public.song_sound_files;
--> statement-breakpoint
DROP TRIGGER IF EXISTS song_image_pages_keep_stray_file ON public.song_image_pages;
--> statement-breakpoint
DROP TRIGGER IF EXISTS song_pdfs_keep_stray_file ON public.song_pdfs;
--> statement-breakpoint
DROP TRIGGER IF EXISTS song_scores_keep_stray_file ON public.song_scores;
--> statement-breakpoint
DROP TRIGGER IF EXISTS song_scores_keep_replaced_stray_file ON public.song_scores;
--> statement-breakpoint
DROP TRIGGER IF EXISTS song_scores_claim_stray_file ON public.song_scores;
--> statement-breakpoint
DROP TRIGGER IF EXISTS song_sound_files_keep_stray_file ON public.song_sound_files;
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.set_song_pdf_arrangements(uuid, uuid, uuid[]);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.add_song_pdf(uuid, text, text, text, integer, text[], uuid[], integer);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.update_song_pdf(uuid, text, text[], uuid[]);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.set_song_image_arrangements(uuid, uuid, uuid[]);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.add_song_image(uuid, text, text[], uuid[], integer);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.update_song_image(uuid, text, text[], uuid[]);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.add_song_image_page(uuid, text, integer, integer, integer, integer);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.move_song_image_pages(uuid, uuid[]);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.song_image_pages_keep_stray_file();
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.keep_stray_file();
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.claim_stray_file();
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.set_song_link_arrangements(uuid, uuid, uuid[]);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.add_song_link(uuid, text, text, text[], uuid[], integer);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.update_song_link(uuid, text, text, text[], uuid[]);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.set_song_sound_file_arrangements(uuid, uuid, uuid[]);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.add_song_sound_file(uuid, text, text, text, integer, text, text[], uuid[], integer);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.update_song_sound_file(uuid, text, text[], uuid[]);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.start_song_pdf_upload(uuid, text, integer);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.start_song_sound_file_upload(uuid, text, integer);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.prevent_song_id_update();
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.close_crashed_song_rights_research(uuid);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.claim_song_for_rights_research(uuid, text, text);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.claim_songs_for_rights_research_now(integer, text, text);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.count_song_rights_researches_this_month();
