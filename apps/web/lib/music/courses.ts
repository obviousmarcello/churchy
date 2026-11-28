import type { RichDoc } from "./rich-text";

// Training courses: self-paced lessons for the team (see
// `src/server/models/courses.ts` and the migration `courses`). Keep the
// limits in sync with the checks of the migration.

export const COURSE_TITLE_MAX_LENGTH = 200;
export const COURSE_DESCRIPTION_MAX_LENGTH = 1000;
export const LESSON_TITLE_MAX_LENGTH = 200;
export const LESSONS_MAX = 100;
export const LESSON_LINKS_MAX = 20;
export const LINK_LABEL_MAX_LENGTH = 200;
/** The most groups of a course: as many as there can be groups (`GROUPS_MAX`). */
export const COURSE_AREAS_MAX = 200;
/**
 * The most bytes of the JSON of a draft. Below the 5 MB check on
 * `courses.draft`: the database counts the spaces of its JSON text too. And
 * below the body limit of the Server Actions.
 */
export const COURSE_DRAFT_MAX_BYTES = 4_000_000;
/** The most bytes of the JSON of the text of a lesson. Below the 500 kB check on `course_lessons.body`. */
export const LESSON_BODY_MAX_BYTES = 400_000;
/** The days before pg_cron deletes a removed course or lesson. */
export const REMOVED_KEEP_DAYS = 90;

/**
 * The icons that a course admin can pick as the cover of a course: Lucide
 * icons in kebab case. Keep in sync with `COURSE_ICON_COMPONENTS` in
 * `src/app/[lang]/courses/course-icons.tsx` and the check on `courses.icon`.
 */
export const COURSE_ICONS = [
  "graduation-cap",
  "camera",
  "video",
  "clapperboard",
  "monitor",
  "tv",
  "projector",
  "presentation",
  "cast",
  "radio",
  "mic",
  "mic-vocal",
  "headphones",
  "speaker",
  "volume-2",
  "audio-lines",
  "sliders-horizontal",
  "cable",
  "plug",
  "laptop",
  "smartphone",
  "keyboard",
  "wifi",
  "lightbulb",
  "lamp-ceiling",
  "sun",
  "sparkles",
  "music",
  "music-2",
  "guitar",
  "piano",
  "drum",
  "list-music",
  "book-open",
  "book-heart",
  "church",
  "lectern",
  "cross",
  "heart",
  "hand-heart",
  "hand-helping",
  "users",
  "baby",
  "coffee",
  "utensils",
  "door-open",
  "car",
  "map-pin",
  "calendar",
  "clock",
  "shield-check",
  "briefcase-medical",
  "star",
  "flag",
  "megaphone",
  "message-circle",
  "pen-line",
  "palette",
  "image",
  "printer",
  "settings",
  "wrench",
] as const;
export type CourseIcon = (typeof COURSE_ICONS)[number];

export function isCourseIcon(value: unknown): value is CourseIcon {
  return typeof value === "string" && (COURSE_ICONS as readonly string[]).includes(value);
}

/** The longest side of a stored cover image, in pixels. */
export const COURSE_IMAGE_MAX_SIDE_PX = 1600;

/** The address of a cover image for the browser (`src/app/course-images/[...path]/route.ts`). */
export function courseImageUrl(path: string): string {
  return `/munkater/kepzesek/kep/${path}`;
}

/** The cover of a course: an icon, an image, or neither (the default icon shows). */
export type CourseCover = { icon: CourseIcon | null; imagePath: string | null };

export const COURSE_LANGUAGES = ["hu", "en"] as const;
export type CourseLanguage = (typeof COURSE_LANGUAGES)[number];

export type LessonLink = { label: string | null; url: string };

/** A lesson in the form of the draft. */
export type LessonDoc = {
  id: string;
  title: string;
  /** A YouTube link, or null. */
  videoUrl: string | null;
  body: RichDoc;
  links: LessonLink[];
};

/** All the content of a course: the draft, or the published course (`course_document()`). */
export type CourseDoc = CourseCover & {
  title: string;
  language: CourseLanguage;
  description: string | null;
  /**
   * The groups of the course, in the order of the groups. The root group: for
   * all users. Empty: only for the course admins (a draft, or a course that
   * lost its groups).
   */
  areaIds: string[];
  lessons: LessonDoc[];
};

export type CourseAreaDTO = { id: string; name: string };

/** A course in the list. */
export type CourseSummaryDTO = CourseCover & {
  id: string;
  title: string;
  language: CourseLanguage;
  description: string | null;
  /** The names of its groups, without the root group. Empty: for all users. */
  areas: string[];
  lessonCount: number;
  /** For course admins: false for a draft or a hidden course. Always true for the other users. */
  isPublished: boolean;
  /** For course admins: the course was published once. */
  wasPublished: boolean;
  /** For course admins: the draft has changes that are not published. */
  hasChanges: boolean;
  /** The user can change the course: a course admin, or a leader of all its groups. */
  canEdit: boolean;
};

export type RemovedCourseDTO = { id: string; title: string; removedAt: string };

export type LessonTitleDTO = { id: string; title: string };

/** A published course for a reader, with the titles of its lessons. */
export type CourseDTO = CourseCover & {
  id: string;
  title: string;
  language: CourseLanguage;
  description: string | null;
  areas: string[];
  isPublished: boolean;
  lessons: LessonTitleDTO[];
  /** The user can change the course. Optional: not in a lesson page. */
  canEdit?: boolean;
};

export type RemovedLessonDTO = {
  id: string;
  title: string;
  removedAt: string;
  wasPublished: boolean;
};

/** All that the editor of a course needs. */
export type CourseEditorDTO = {
  id: string;
  revision: number;
  /** The draft, or the published course when there are no changes. */
  doc: CourseDoc;
  /** The published course, or null when it was never published. */
  published: CourseDoc | null;
  isPublished: boolean;
  /** The course lost its last area by the delete of an area. */
  areasLost: boolean;
  removedLessons: RemovedLessonDTO[];
  /** All groups in the order of the tree, with the root group, each with its path as its name. */
  areas: CourseAreaDTO[];
  /** The group of all users, or null before the migration `root_group`. */
  rootAreaId: string | null;
  /** "all" for a course admin, else the groups of `areas` that the leader leads: only these can be selected. */
  editableAreaIds: "all" | string[];
};

/** The number of days until the permanent delete of an item removed at `removedAt`, at least 0. */
export function daysUntilDelete(removedAt: string, now: number): number {
  const end = Date.parse(removedAt) + REMOVED_KEEP_DAYS * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((end - now) / (24 * 60 * 60 * 1000)));
}

/** A new lesson with a new id. */
export function newLesson(title: string): LessonDoc {
  return {
    id: crypto.randomUUID(),
    title,
    videoUrl: null,
    body: { type: "doc", content: [] },
    links: [],
  };
}
