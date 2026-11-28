-- Down of 0021_music_courses.
DROP TRIGGER IF EXISTS service_areas_courses_before_delete ON public.service_areas;
--> statement-breakpoint
DO $$
DECLARE f text;
BEGIN
  FOR f IN SELECT p.oid::regprocedure::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('course_lesson_document','course_document','course_document_with_area_order',
      'lock_course','check_course_lessons','check_course_image','save_course_draft','publish_course','discard_course_draft',
      'remove_course_lesson','restore_course_lesson','set_course_order','course_is_open_to','visible_course_ids',
      'can_see_course','course_summaries','visible_course_summaries','can_edit_course','editable_course_ids',
      'can_read_course_image','removed_courses','courses_before_area_delete','purge_removed_courses','remove_unused_course_images')
  LOOP
    EXECUTE format('DROP FUNCTION %s CASCADE', f);
  END LOOP;
END
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS course_images_claim_stray_file ON public.course_images;
--> statement-breakpoint
DROP TRIGGER IF EXISTS course_images_keep_stray_file ON public.course_images;
--> statement-breakpoint
DROP TRIGGER IF EXISTS course_lessons_set_updated_at ON public.course_lessons;
--> statement-breakpoint
DROP TRIGGER IF EXISTS courses_set_updated_at ON public.courses;
--> statement-breakpoint
ALTER TABLE "courses" ALTER COLUMN "position" DROP IDENTITY IF EXISTS;
