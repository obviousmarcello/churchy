import "server-only";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import {
  COURSE_AREAS_MAX,
  COURSE_DESCRIPTION_MAX_LENGTH,
  COURSE_DRAFT_MAX_BYTES,
  COURSE_ICONS,
  COURSE_IMAGE_MAX_SIDE_PX,
  COURSE_LANGUAGES,
  COURSE_TITLE_MAX_LENGTH,
  LESSON_BODY_MAX_BYTES,
  LESSON_LINKS_MAX,
  LESSON_TITLE_MAX_LENGTH,
  LESSONS_MAX,
  LINK_LABEL_MAX_LENGTH,
  type CourseAreaDTO,
  type CourseDoc,
  type CourseDTO,
  type CourseEditorDTO,
  type CourseSummaryDTO,
  type LessonDoc,
  type LessonTitleDTO,
  type RemovedCourseDTO,
  type RemovedLessonDTO,
  isCourseIcon,
} from "@/lib/music/courses";
import { toLinkUrl } from "@/lib/music/links";
import {
  normalizeRichText,
  RICH_TEXT_MAX_LENGTH,
  richTextLength,
  type RichDoc,
} from "@/lib/music/rich-text";
import { parseYoutubeVideo, toYoutubeUrl } from "@/lib/music/youtube";
import {
  getLedGroupIds,
  requireCourseAdmin,
  requireUser,
  type CurrentUser,
} from "@/server/music/auth";
import { ConflictError, ForbiddenError, ValidationError } from "@/server/music/errors";
import { NOT_MODIFIED } from "@/server/music/private-file";
import { getMusicSupabase } from "@/server/music/db";
import { zodMessage } from "@/server/music/zod-i18n";
import {
  databaseError,
  idList,
  isId,
  lowerIdSchema,
  optionalText,
  parseInput,
  requiredText,
} from "./shared";
import { readImageSource, storedImage } from "./images";
import { listGroups, listServiceAreas } from "./groups";
import { removeUnusedFiles, startStrayFileUpload } from "./stray-files";

// Training courses: self-paced lessons for the team (see the migration
// `courses`). A course with groups is only for the members of these groups
// and of the groups below them (see the migration `groups`); a course without
// a group is for all users.
// Course admins and superadmins make the courses: they change a draft, and
// "Publish" puts it live. A leader of groups makes the courses of the groups
// that they lead (`can_edit_course()`), but does not change the order. Removed courses and lessons stay for 90 days.

const DUPLICATE_LESSON = zodMessage(({ m }) => m.server.courses.duplicateLesson);
const DUPLICATE_AREA = zodMessage(({ m }) => m.server.courses.duplicateArea);
const DUPLICATE_COURSE = zodMessage(({ m }) => m.server.courses.duplicateCourse);
const VIDEO_URL = zodMessage(({ m }) => m.server.courses.videoUrl);
const LINK_URL = zodMessage(({ m }) => m.server.courses.linkUrl);
const INVALID_TEXT = zodMessage(({ m }) => m.server.courses.invalidText);
const TEXT_TOO_LONG = zodMessage(({ m, format }) =>
  format(m.server.courses.textTooLong, { max: RICH_TEXT_MAX_LENGTH }),
);

const videoUrlSchema = z
  .string()
  .trim()
  .max(2000)
  .nullish()
  .transform((value, context) => {
    if (!value) return null;
    const url = toYoutubeUrl(value);
    if (!url || !parseYoutubeVideo(url)) {
      context.addIssue({ code: "custom", message: VIDEO_URL });
      return z.NEVER;
    }
    return url;
  });

/** The UTF-8 bytes of the JSON of `value`, as the size checks of the database count them (without the spaces of the JSON text of the database). */
function jsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

const bodySchema = z.unknown().transform((value, context): RichDoc => {
  const doc = normalizeRichText(value);
  if (!doc || jsonBytes(doc) > LESSON_BODY_MAX_BYTES) {
    context.addIssue({ code: "custom", message: INVALID_TEXT });
    return z.NEVER;
  }
  if (richTextLength(doc) > RICH_TEXT_MAX_LENGTH) {
    context.addIssue({ code: "custom", message: TEXT_TOO_LONG });
    return z.NEVER;
  }
  return doc;
});

const linkSchema = z.strictObject({
  label: optionalText(LINK_LABEL_MAX_LENGTH),
  url: z
    .string()
    .max(2000)
    .transform((value, context) => {
      const url = toLinkUrl(value);
      if (!url) {
        context.addIssue({ code: "custom", message: LINK_URL });
        return z.NEVER;
      }
      return url;
    }),
});

const lessonSchema = z.strictObject({
  id: lowerIdSchema,
  title: requiredText(LESSON_TITLE_MAX_LENGTH),
  videoUrl: videoUrlSchema,
  body: bodySchema,
  links: z.array(linkSchema).max(LESSON_LINKS_MAX),
});

/** `<course id>/<random id>.webp`, as `uploadCourseImage` makes it. */
const IMAGE_PATH_PATTERN = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/;
const IMAGE_BUCKET = "course-images";

const courseDocSchema = z
  .strictObject({
    title: requiredText(COURSE_TITLE_MAX_LENGTH),
    language: z.enum(COURSE_LANGUAGES),
    description: optionalText(COURSE_DESCRIPTION_MAX_LENGTH),
    icon: z.enum(COURSE_ICONS).nullable(),
    imagePath: z.string().regex(IMAGE_PATH_PATTERN).nullable(),
    areaIds: z
      .array(lowerIdSchema)
      .max(COURSE_AREAS_MAX)
      .refine((ids) => new Set(ids).size === ids.length, { message: DUPLICATE_AREA }),
    lessons: z
      .array(lessonSchema)
      .max(LESSONS_MAX)
      .refine((lessons) => new Set(lessons.map((lesson) => lesson.id)).size === lessons.length, {
        message: DUPLICATE_LESSON,
      }),
  })
  // One cover: the editor clears the icon when an image comes, and the other way round.
  .transform((doc) => (doc.imagePath ? { ...doc, icon: null } : doc));

const newCourseSchema = z.strictObject({
  title: requiredText(COURSE_TITLE_MAX_LENGTH),
  language: z.enum(COURSE_LANGUAGES),
});

const revisionSchema = z.number().int().min(0);

/** The groups of a course that a leader saves: at least one, all led by them. */
const LEADER_AREAS = () =>
  new ValidationError([{ path: "areaIds", message: ({ m }) => m.server.courses.leaderAreas }]);
/** A published course has at least one group: the root group for all users. */
const AREAS_REQUIRED = () =>
  new ValidationError([{ path: "areaIds", message: ({ m }) => m.server.courses.areasRequired }]);

/** "all" for a course admin or a superadmin, the led groups for a leader, null for the others. */
async function courseRightsOf(user: CurrentUser): Promise<"all" | ReadonlySet<string> | null> {
  if (user.canEditCourses) return "all";
  if (!user.leadsCourseGroups) return null;
  return getLedGroupIds(user.id);
}

/** The user can change the course (`can_edit_course()`). */
async function canEditCourse(user: CurrentUser, id: string): Promise<boolean> {
  if (user.canEditCourses) return true;
  if (!user.leadsCourseGroups || !isId(id)) return false;
  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("can_edit_course", {
    p_course_id: id,
    p_user_id: user.id,
    p_is_admin: user.canEditCourses,
  });
  if (error) throw databaseError("check course editor", error);
  return data === true;
}

/** A course admin, or a leader who can change the course: their rights. Else a `ForbiddenError`. */
async function requireCourseEditorOf(
  id: string,
): Promise<{ user: CurrentUser; rights: "all" | ReadonlySet<string> }> {
  const user = await requireUser();
  const rights = await courseRightsOf(user);
  if (rights === null || !(await canEditCourse(user, id))) throw new ForbiddenError();
  return { user, rights };
}

/** The groups of a document that a leader saves: at least one, all led by them. */
function checkAreas(rights: "all" | ReadonlySet<string>, areaIds: readonly string[]) {
  if (rights !== "all" && (areaIds.length === 0 || areaIds.some((areaId) => !rights.has(areaId))))
    throw LEADER_AREAS();
}

// The errors of the RPCs (see the migration `courses`).
const CHANGED = () => new ConflictError(({ m }) => m.server.courses.changed);
const AREA_MISSING = () => new ConflictError(({ m }) => m.server.courses.areaMissing);
const TOO_MANY_LESSONS = () =>
  new ConflictError(({ m, format }) =>
    format(m.server.courses.tooManyLessons, { max: LESSONS_MAX }),
  );
const NO_LESSONS = () => new ConflictError(({ m }) => m.server.courses.noLessons);
const IMAGE_MISSING = () => new ConflictError(({ m }) => m.server.courses.imageMissing);
const TOO_LARGE = () => new ConflictError(({ m }) => m.server.courses.tooLarge);
const DRAFT_ERRORS = {
  "P0001:course_changed": CHANGED,
  "P0001:lesson_taken": CHANGED,
  "P0001:area_missing": AREA_MISSING,
  "P0001:too_many_lessons": TOO_MANY_LESSONS,
  "P0001:no_lessons": NO_LESSONS,
  "P0001:image_missing": IMAGE_MISSING,
  "23503": AREA_MISSING,
  // The checks of the sizes.
  "23514": TOO_LARGE,
};

// The stored URLs pass the same checks as the input again, so the page never
// gets a URL that the rules of today refuse (e.g. a row from an older
// version, or a change in the database). A value that fails is left out.
const storedVideoUrl = z
  .string()
  .nullable()
  .transform((value) => (value === null ? null : toYoutubeUrl(value)));
const storedLinks = z
  .array(z.object({ label: z.string().nullable(), url: z.string() }))
  .transform((links) =>
    links.flatMap((link) => {
      const url = toLinkUrl(link.url);
      return url ? [{ label: link.label, url }] : [];
    }),
  );

/** The document of a draft or of `course_document()`: the database checked it on the way in. */
const storedDocSchema = z.object({
  title: z.string(),
  language: z.enum(COURSE_LANGUAGES),
  description: z.string().nullable(),
  // A draft from before the covers has neither.
  icon: z
    .string()
    .nullish()
    .transform((value) => (isCourseIcon(value) ? value : null)),
  imagePath: z
    .string()
    .nullish()
    .transform((value) => value ?? null),
  areaIds: z.array(z.string()),
  lessons: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      videoUrl: storedVideoUrl,
      body: z
        .unknown()
        .transform((value) => normalizeRichText(value) ?? { type: "doc" as const, content: [] }),
      links: storedLinks,
    }),
  ),
});

const coverSchema = {
  icon: z
    .string()
    .nullable()
    .transform((value) => (isCourseIcon(value) ? value : null)),
  image_path: z.string().nullable(),
};

const courseRowSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  language: z.enum(COURSE_LANGUAGES),
  description: z.string().nullable(),
  ...coverSchema,
  is_published: z.boolean(),
  published_at: z.string().nullable(),
});

const lessonRowSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  video_url: storedVideoUrl,
  body: z.unknown(),
  links: storedLinks,
});

/** The checked document, or a `ValidationError`. Throws `TOO_LARGE` for a document over `COURSE_DRAFT_MAX_BYTES`. */
function parseDoc(input: unknown): CourseDoc {
  const doc = parseInput(courseDocSchema, input);
  if (jsonBytes(doc) > COURSE_DRAFT_MAX_BYTES) throw TOO_LARGE();
  return doc;
}

// Reading -------------------------------------------------------------------------

/** The names of the groups by id, with the root group: the group of a course for all users. */
async function areaNames(): Promise<Map<string, CourseAreaDTO>> {
  return new Map((await listServiceAreas({ withRoot: true })).map((area) => [area.id, area]));
}

/** The names of `ids` in the order of the areas. */
function namesOf(ids: readonly string[], areas: Map<string, CourseAreaDTO>): string[] {
  const set = new Set(ids);
  return [...areas.values()].filter((area) => set.has(area.id)).map((area) => area.name);
}

/**
 * The courses of the list, in their order. Course admins get all courses
 * that are not removed, with their state, and the removed courses. A leader
 * of groups gets the published courses that they can see and the courses
 * that they can change, with their state, and their removed courses. The
 * other users get the published courses that they can see.
 */
export async function listCourses(): Promise<{
  courses: CourseSummaryDTO[];
  removed: RemovedCourseDTO[] | null;
}> {
  const user = await requireUser();
  const supabase = await getMusicSupabase();
  const areas = await areaNames();

  if (user.canEditCourses || user.leadsCourseGroups) {
    const [summaries, removed, editable, visible] = await Promise.all([
      supabase.rpc("course_summaries"),
      supabase.rpc("removed_courses"),
      user.canEditCourses
        ? null
        : supabase.rpc("editable_course_ids", {
            p_user_id: user.id,
            p_is_admin: user.canEditCourses,
          }),
      user.canEditCourses ? null : visibleCourseIds(user),
    ]);
    if (summaries.error) throw databaseError("list course summaries", summaries.error);
    if (removed.error) throw databaseError("list removed courses", removed.error);
    if (editable?.error) throw databaseError("list editable courses", editable.error);
    // Null: a course admin, who can change all courses.
    const editableIds = editable
      ? new Set(
          z
            .array(z.object({ id: z.uuid() }))
            .parse(editable.data)
            .map((row) => row.id),
        )
      : null;
    const visibleIds = new Set(visible);
    const canEdit = (id: string) => editableIds === null || editableIds.has(id);

    const rows = z
      .array(
        z.object({
          id: z.uuid(),
          title: z.string(),
          language: z.enum(COURSE_LANGUAGES),
          description: z.string().nullable(),
          ...coverSchema,
          area_ids: z.array(z.string()),
          lesson_count: z.number(),
          is_published: z.boolean(),
          was_published: z.boolean(),
          has_changes: z.boolean(),
        }),
      )
      .parse(summaries.data);
    const removedRows = z
      .array(
        z.object({
          id: z.uuid(),
          title: z.string(),
          draft_title: z.string().nullable(),
          published_at: z.string().nullable(),
          removed_at: z.string(),
        }),
      )
      .parse(removed.data);

    return {
      courses: rows
        .filter((row) => canEdit(row.id) || visibleIds.has(row.id))
        .map((row) => ({
          id: row.id,
          title: row.title,
          language: row.language,
          description: row.description,
          icon: row.icon,
          imagePath: row.image_path,
          areas: namesOf(row.area_ids, areas),
          lessonCount: row.lesson_count,
          // A reader sees only the published course, also when a draft has changes.
          isPublished: canEdit(row.id) ? row.is_published : true,
          wasPublished: canEdit(row.id) ? row.was_published : true,
          hasChanges: canEdit(row.id) && row.has_changes,
          canEdit: canEdit(row.id),
        })),
      removed: removedRows
        .filter((row) => canEdit(row.id))
        .map((row) => ({
          id: row.id,
          title: (row.published_at === null ? row.draft_title : null) ?? row.title,
          removedAt: row.removed_at,
        })),
    };
  }

  const { data, error } = await supabase.rpc("visible_course_summaries", {
    p_user_id: user.id,
    p_is_admin: user.canEditCourses,
  });
  if (error) throw databaseError("list courses", error);
  const rows = z
    .array(
      z.object({
        id: z.uuid(),
        title: z.string(),
        language: z.enum(COURSE_LANGUAGES),
        description: z.string().nullable(),
        ...coverSchema,
        area_ids: z.array(z.string()),
        lesson_count: z.number(),
      }),
    )
    .parse(data);

  return {
    courses: rows.map((row) => ({
      id: row.id,
      title: row.title,
      language: row.language,
      description: row.description,
      icon: row.icon,
      imagePath: row.image_path,
      areas: namesOf(row.area_ids, areas),
      lessonCount: row.lesson_count,
      isPublished: true,
      wasPublished: true,
      hasChanges: false,
      canEdit: false,
    })),
    removed: null,
  };
}

/** The ids of the published courses that the user can read, in their order. */
async function visibleCourseIds(user: CurrentUser): Promise<string[]> {
  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("visible_course_ids", { p_user_id: user.id, p_is_admin: user.canEditCourses });
  if (error) throw databaseError("list visible courses", error);
  return z
    .array(z.object({ id: z.uuid() }))
    .parse(data)
    .map((row) => row.id);
}

/**
 * The published course for a reader, with the titles of its lessons. Course
 * admins also get a hidden course. `notPublished` for a course that was never
 * published: only course admins get it. Null when there is no such course or
 * the user cannot see it.
 */
export async function getCourse(id: string): Promise<CourseDTO | "notPublished" | null> {
  const user = await requireUser();
  if (!isId(id)) return null;
  const course = await readCourse(user, id);
  if (course === null || course === "notPublished") return course;

  const [lessons, courseAreas, areas] = await Promise.all([
    lessonTitles(id),
    (await getMusicSupabase()).from("course_areas").select("area_id").eq("course_id", id),
    areaNames(),
  ]);
  if (courseAreas.error) throw databaseError("list course areas", courseAreas.error);

  return {
    ...readerCourse(course, lessons),
    canEdit: await canEditCourse(user, id),
    areas: namesOf(
      z
        .array(z.object({ area_id: z.uuid() }))
        .parse(courseAreas.data)
        .map((row) => row.area_id),
      areas,
    ),
  };
}

/** The titles of the published lessons of a course, in their order. */
async function lessonTitles(courseId: string): Promise<LessonTitleDTO[]> {
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("course_lessons")
    .select("id, title")
    .eq("course_id", courseId)
    .is("removed_at", null)
    .order("position")
    .order("id");
  if (error) throw databaseError("list course lessons", error);
  return z.array(z.object({ id: z.uuid(), title: z.string() })).parse(data);
}

/** The course for a reader, without its areas. */
function readerCourse(
  course: z.output<typeof courseRowSchema>,
  lessons: LessonTitleDTO[],
): Omit<CourseDTO, "areas"> {
  return {
    id: course.id,
    title: course.title,
    language: course.language,
    description: course.description,
    icon: course.icon,
    imagePath: course.image_path,
    isPublished: course.is_published,
    lessons,
  };
}

/** The course row, after the check that the user can read it: a reader of the published course, or an editor. */
async function readCourse(
  user: CurrentUser,
  id: string,
): Promise<z.output<typeof courseRowSchema> | "notPublished" | null> {
  const supabase = await getMusicSupabase();
  if (!user.canEditCourses) {
    const { data, error } = await supabase.rpc("can_see_course", {
      p_course_id: id,
      p_user_id: user.id,
      p_is_admin: user.canEditCourses,
    });
    if (error) throw databaseError("check course access", error);
    if (data !== true && !(await canEditCourse(user, id))) return null;
  }

  const { data, error } = await supabase
    .from("courses")
    .select("id, title, language, description, icon, image_path, is_published, published_at")
    .eq("id", id)
    .is("removed_at", null)
    .maybeSingle();
  if (error) throw databaseError("read course", error);
  if (!data) return null;
  const row = courseRowSchema.parse(data);
  return row.published_at === null ? "notPublished" : row;
}

/** A lesson of a published course, with the course. Null when there is no such lesson or the user cannot see the course. */
export async function getCourseLesson(
  courseId: string,
  lessonId: string,
): Promise<{ course: Omit<CourseDTO, "areas">; lesson: LessonDoc } | null> {
  const user = await requireUser();
  if (!isId(courseId) || !isId(lessonId)) return null;
  const course = await readCourse(user, courseId);
  if (course === null || course === "notPublished") return null;

  const [lessons, { data, error }] = await Promise.all([
    lessonTitles(courseId),
    (await getMusicSupabase())
      .from("course_lessons")
      .select("id, title, video_url, body, links")
      .eq("id", lessonId)
      .eq("course_id", courseId)
      .is("removed_at", null)
      .maybeSingle(),
  ]);
  if (error) throw databaseError("read course lesson", error);
  if (!data) return null;
  const row = lessonRowSchema.parse(data);
  return {
    course: readerCourse(course, lessons),
    lesson: {
      id: row.id,
      title: row.title,
      videoUrl: row.video_url,
      body: normalizeRichText(row.body) ?? { type: "doc", content: [] },
      links: row.links,
    },
  };
}

/** The published courses and their lessons that the user can see, for the search. */
export async function listSearchCourses(): Promise<
  { id: string; title: string; lessons: LessonTitleDTO[] }[]
> {
  const user = await requireUser();
  const ids = await visibleCourseIds(user);
  if (ids.length === 0) return [];

  const supabase = await getMusicSupabase();
  const [courses, lessons] = await Promise.all([
    supabase.from("courses").select("id, title").in("id", ids),
    supabase
      .from("course_lessons")
      .select("id, course_id, title")
      .in("course_id", ids)
      .is("removed_at", null)
      .order("position")
      .order("id"),
  ]);
  if (courses.error) throw databaseError("list search courses", courses.error);
  if (lessons.error) throw databaseError("list search lessons", lessons.error);

  const titles = new Map(
    z
      .array(z.object({ id: z.uuid(), title: z.string() }))
      .parse(courses.data)
      .map((row) => [row.id, row.title]),
  );
  const byCourse = Map.groupBy(
    z.array(z.object({ id: z.uuid(), course_id: z.uuid(), title: z.string() })).parse(lessons.data),
    (row) => row.course_id,
  );
  return ids.flatMap((id) => {
    const title = titles.get(id);
    if (title === undefined) return [];
    return [
      {
        id,
        title,
        lessons: (byCourse.get(id) ?? []).map((lesson) => ({ id: lesson.id, title: lesson.title })),
      },
    ];
  });
}

/**
 * All that the editor of a course needs. Null when there is no such course,
 * it is removed, or a leader cannot change it.
 */
export async function getCourseEditor(id: string): Promise<CourseEditorDTO | null> {
  const user = await requireUser();
  if (!isId(id)) return null;
  const rights = await courseRightsOf(user);
  if (rights === null) throw new ForbiddenError();
  if (!(await canEditCourse(user, id))) return null;
  const supabase = await getMusicSupabase();

  const { data, error } = await supabase
    .from("courses")
    .select("id, revision, draft, is_published, published_at, areas_lost")
    .eq("id", id)
    .is("removed_at", null)
    .maybeSingle();
  if (error) throw databaseError("read course for editor", error);
  if (!data) return null;
  const row = z
    .object({
      id: z.uuid(),
      revision: z.number(),
      draft: z.unknown(),
      is_published: z.boolean(),
      published_at: z.string().nullable(),
      areas_lost: z.boolean(),
    })
    .parse(data);

  const [published, removed, areas, groups] = await Promise.all([
    row.published_at === null
      ? Promise.resolve(null)
      : supabase.rpc("course_document", { p_id: id }),
    supabase
      .from("course_lessons")
      .select("id, title, removed_at, is_published")
      .eq("course_id", id)
      .not("removed_at", "is", null)
      .order("removed_at", { ascending: false }),
    listServiceAreas({ withRoot: true }),
    listGroups(),
  ]);
  if (published?.error) throw databaseError("read published course", published.error);
  if (removed.error) throw databaseError("list removed lessons", removed.error);

  const publishedDoc: CourseDoc | null = published ? storedDocSchema.parse(published.data) : null;
  const doc: CourseDoc = row.draft === null ? publishedDoc! : storedDocSchema.parse(row.draft);

  return {
    id,
    revision: row.revision,
    doc,
    published: publishedDoc,
    isPublished: row.is_published,
    areasLost: row.areas_lost,
    removedLessons: z
      .array(
        z.object({
          id: z.uuid(),
          title: z.string(),
          removed_at: z.string(),
          is_published: z.boolean(),
        }),
      )
      .parse(removed.data)
      .map((lesson): RemovedLessonDTO => ({
        id: lesson.id,
        title: lesson.title,
        removedAt: lesson.removed_at,
        wasPublished: lesson.is_published,
      })),
    areas,
    rootAreaId: groups.find((group) => group.isRoot)?.id ?? null,
    editableAreaIds:
      rights === "all" ? "all" : areas.filter((area) => rights.has(area.id)).map((area) => area.id),
  };
}

// Changes -------------------------------------------------------------------------

/**
 * A new course that was never published: only a draft. Returns its id. A
 * course of a course admin is for all users (the root group); a course of a
 * leader is for the groups at the top of what they lead.
 */
export async function createCourse(input: unknown): Promise<string> {
  const user = await requireUser();
  const rights = await courseRightsOf(user);
  if (rights === null) throw new ForbiddenError();
  const { title, language } = parseInput(newCourseSchema, input);
  const groups = await listGroups();
  const areaIds =
    rights === "all"
      ? groups.filter((group) => group.isRoot).map((group) => group.id)
      : groups
          .filter(
            (group) =>
              rights.has(group.id) && (group.parentId === null || !rights.has(group.parentId)),
          )
          .map((group) => group.id);
  checkAreas(rights, areaIds);
  const draft: CourseDoc = {
    title,
    language,
    description: null,
    icon: null,
    imagePath: null,
    areaIds,
    lessons: [],
  };

  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("courses")
    .insert({ title, language, draft })
    .select("id")
    .single();
  if (error) throw databaseError("create course", error);
  return z.object({ id: z.uuid() }).parse(data).id;
}

/** Saves the draft. Returns the new revision, or null when there is no such course. */
export async function saveCourseDraft(
  id: string,
  revision: unknown,
  input: unknown,
): Promise<number | null> {
  if (!isId(id)) return null;
  const { rights } = await requireCourseEditorOf(id);
  const doc = parseDoc(input);
  checkAreas(rights, doc.areaIds);
  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("save_course_draft", {
    p_id: id,
    p_revision: parseInput(revisionSchema, revision),
    p_doc: doc,
  });
  if (error) throw databaseError("save course draft", error, DRAFT_ERRORS);
  return z.number().nullable().parse(data);
}

/** Publishes the document of the editor. Returns the new revision, or null when there is no such course. */
export async function publishCourse(
  id: string,
  revision: unknown,
  input: unknown,
): Promise<number | null> {
  if (!isId(id)) return null;
  const { rights } = await requireCourseEditorOf(id);
  const doc = parseDoc(input);
  if (doc.areaIds.length === 0) throw AREAS_REQUIRED();
  checkAreas(rights, doc.areaIds);
  if (doc.lessons.length === 0) throw NO_LESSONS();
  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("publish_course", {
    p_id: id,
    p_revision: parseInput(revisionSchema, revision),
    p_doc: doc,
  });
  if (error) throw databaseError("publish course", error, DRAFT_ERRORS);
  return z.number().nullable().parse(data);
}

/** Deletes the draft of a published course. Returns the new revision, or null when there is none. */
export async function discardCourseDraft(id: string, revision: unknown): Promise<number | null> {
  if (!isId(id)) return null;
  await requireCourseEditorOf(id);
  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("discard_course_draft", {
    p_id: id,
    p_revision: parseInput(revisionSchema, revision),
  });
  if (error) throw databaseError("discard course draft", error, DRAFT_ERRORS);
  return z.number().nullable().parse(data);
}

/** Hides a published course from the readers. The draft stays. Returns false if there is no such published course. */
export async function unpublishCourse(id: string): Promise<boolean> {
  if (!isId(id)) return false;
  await requireCourseEditorOf(id);
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("courses")
    .update({ is_published: false })
    .eq("id", id)
    .eq("is_published", true)
    .is("removed_at", null)
    .select("id");
  if (error) throw databaseError("unpublish course", error);
  return data.length > 0;
}

/** Removes a course for 90 days. Returns false if there is no such course. */
export async function removeCourse(id: string): Promise<boolean> {
  if (!isId(id)) return false;
  await requireCourseEditorOf(id);
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("courses")
    .update({ removed_at: new Date().toISOString() })
    .eq("id", id)
    .is("removed_at", null)
    .select("id");
  if (error) throw databaseError("remove course", error);
  return data.length > 0;
}

/** Brings back a removed course in its old state. Returns false if there is no such removed course. */
export async function restoreCourse(id: string): Promise<boolean> {
  if (!isId(id)) return false;
  await requireCourseEditorOf(id);
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("courses")
    .update({ removed_at: null })
    .eq("id", id)
    .not("removed_at", "is", null)
    .select("id");
  if (error) throw databaseError("restore course", error);
  return data.length > 0;
}

/**
 * Removes a lesson at once, from the published course and from the draft.
 * Returns the new revision, and whether the course became unpublished
 * because it has no lesson now. Null when there is no such lesson.
 */
export async function removeCourseLesson(
  courseId: string,
  lessonId: string,
  revision: unknown,
): Promise<{ revision: number; unpublished: boolean } | null> {
  if (!isId(courseId) || !isId(lessonId)) return null;
  await requireCourseEditorOf(courseId);
  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("remove_course_lesson", {
    p_course_id: courseId,
    p_lesson_id: lessonId,
    p_revision: parseInput(revisionSchema, revision),
  });
  if (error) throw databaseError("remove course lesson", error, DRAFT_ERRORS);
  return z.object({ revision: z.number(), unpublished: z.boolean() }).nullable().parse(data);
}

/** Restores a removed lesson at the end. Returns the new revision and the lesson in the draft, or null when there is no such lesson. */
export async function restoreCourseLesson(
  courseId: string,
  lessonId: string,
  revision: unknown,
): Promise<{ revision: number; lesson: LessonDoc } | null> {
  if (!isId(courseId) || !isId(lessonId)) return null;
  await requireCourseEditorOf(courseId);
  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("restore_course_lesson", {
    p_course_id: courseId,
    p_lesson_id: lessonId,
    p_revision: parseInput(revisionSchema, revision),
  });
  if (error) throw databaseError("restore course lesson", error, DRAFT_ERRORS);
  return z
    .object({ revision: z.number(), lesson: storedDocSchema.shape.lessons.element })
    .nullable()
    .parse(data);
}

/** Sets the order of the courses: `ids` has the ids of all courses that are not removed. Returns false when they changed meanwhile. */
export async function setCourseOrder(ids: unknown): Promise<boolean> {
  await requireCourseAdmin();
  const order = parseInput(idList(1000, DUPLICATE_COURSE), ids);
  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("set_course_order", { p_ids: order });
  if (error) throw databaseError("set course order", error);
  return z.boolean().parse(data);
}

/**
 * Uploads a cover image for the draft of a course: a PNG, JPEG or WebP image.
 * The stored image is at most `COURSE_IMAGE_MAX_SIDE_PX` on its longest
 * side, as WebP, without metadata. Returns its path, for the `imagePath` of
 * the draft, or null when there is no such course. An image that no draft
 * and no published course uses goes after a day (see the migration
 * `course_covers`).
 */
export async function uploadCourseImage(
  courseId: string,
  file: File | undefined,
): Promise<string | null> {
  if (!isId(courseId)) return null;
  await requireCourseEditorOf(courseId);
  const source = await readImageSource(file);

  // Before the conversion: it costs much more than this query.
  const { data: course, error: courseError } = await (
    await getMusicSupabase()
  )
    .from("courses")
    .select("id")
    .eq("id", courseId)
    .is("removed_at", null)
    .maybeSingle();
  if (courseError) throw databaseError("read course for image", courseError);
  if (!course) return null;

  const image = await storedImage(source, COURSE_IMAGE_MAX_SIDE_PX);
  const path = `${courseId}/${randomUUID()}.webp`;
  // First the row, so that the cleanup knows the file even if this request stops after the upload.
  await startStrayFileUpload(IMAGE_BUCKET, path);
  const { error: uploadError } = await (
    await getMusicSupabase()
  ).storage
    .from(IMAGE_BUCKET)
    .upload(path, image.bytes, {
      contentType: "image/webp",
      cacheControl: "31536000",
      upsert: false,
    });
  if (uploadError) {
    console.error("[courses] Failed to upload a cover image:", uploadError.message);
    throw new Error("Failed to upload a course image");
  }

  const { error } = await (
    await getMusicSupabase()
  )
    .from("course_images")
    .insert({ path, course_id: courseId });
  if (error) {
    // A course removed meanwhile: do not leave a file that no row uses.
    if (error.code === "23503") {
      await removeUnusedFiles(IMAGE_BUCKET, [path]);
      return null;
    }
    throw databaseError("add course image", error);
  }
  return path;
}

/**
 * The file of a cover image for a signed-in user who can see it, or null.
 * `path` is the part of the URL after `/course-images/`.
 */
export async function getCourseImageFile(
  path: string,
  { cached = false }: { cached?: boolean } = {},
): Promise<Blob | typeof NOT_MODIFIED | null> {
  if (!IMAGE_PATH_PATTERN.test(path)) return null;
  const user = await requireUser();
  const { data: allowed, error: accessError } = await (
    await getMusicSupabase()
  ).rpc("can_read_course_image", {
    p_path: path,
    p_user_id: user.id,
    p_is_admin: user.canEditCourses,
  });
  if (accessError) throw databaseError("check course image access", accessError);
  if (allowed !== true) return null;
  // The browser has the file (`If-None-Match`): after the check of the access, no download.
  if (cached) return NOT_MODIFIED;

  const { data, error } = await (
    await getMusicSupabase()
  ).storage
    .from(IMAGE_BUCKET)
    .download(path);
  if (error) return null;
  return data;
}
