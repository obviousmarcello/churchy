"use server";

import { refresh } from "next/cache";

import { createI18n, type Text } from "@/i18n/music/i18n";
import { getRequestI18n } from "@/i18n/music/server";
import type { LessonDoc } from "@/lib/music/courses";
import { LOG_MESSAGES, ModuleOffError, SafeError, ValidationError } from "@/server/music/errors";
import { file, text } from "@/server/music/form-state";
import {
  createCourse,
  discardCourseDraft,
  publishCourse,
  removeCourse,
  removeCourseLesson,
  restoreCourse,
  restoreCourseLesson,
  saveCourseDraft,
  setCourseOrder,
  unpublishCourse,
  uploadCourseImage,
} from "@/server/music/models/courses";
import { musicCourseManage, musicCourses } from "@/server/music/policy";
import { withPolicy, type PolicyScope } from "@/server/policy";
import type { CourseResult } from "./actions-client";

// The model checks the course admin role (or the leader of the groups of the course) and validates the
// input; `music.course.edit` lets every music user in, so the policy only checks the module and the
// church. These actions turn the errors of the model into results with a message.

const NOT_FOUND: Text = ({ m }) => m.courses.actions.notFound;

/** Runs `run`. Null from `run` is "not found". Refreshes the page after a success. */
async function runCourse<Data extends object>(
  failure: Text,
  run: () => Promise<Data | null>,
): Promise<CourseResult<Data>> {
  try {
    const data = await run();
    const i18n = await getRequestI18n();
    if (data === null) return { status: "error", message: NOT_FOUND(i18n), issues: [] };
    refresh();
    return { status: "success", ...data };
  } catch (error) {
    const i18n = await getRequestI18n();
    if (error instanceof ValidationError) {
      return {
        status: "error",
        message: i18n.m.common.form.correctFields,
        issues: error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message(i18n),
        })),
      };
    }
    // The module is off now: the page loads again and shows that it is off.
    if (error instanceof ModuleOffError) refresh();
    if (error instanceof SafeError)
      return { status: "error", message: error.text(i18n), issues: [] };
    console.error(`[courses] ${failure(createI18n(LOG_MESSAGES))}`, error);
    return { status: "error", message: failure(i18n), issues: [] };
  }
}

const found = (done: boolean) => (done ? {} : null);
const withRevision = (revision: number | null) => (revision === null ? null : { revision });

/** `fields`: `{ title, language }`. Returns the id of the new course. */
export const createCourseAction = withPolicy(
  "music.course.edit",
  musicCourses,
  async (_scope: PolicyScope, fields: unknown): Promise<CourseResult<{ id: string }>> =>
    runCourse(
      ({ m }) => m.courses.actions.createFailed,
      async () => ({ id: await createCourse(fields) }),
    ),
);

export const saveDraftAction = withPolicy(
  "music.course.edit",
  musicCourses,
  async (
    _scope: PolicyScope,
    id: string,
    revision: number,
    doc: unknown,
  ): Promise<CourseResult<{ revision: number }>> =>
    runCourse(
      ({ m }) => m.courses.actions.saveFailed,
      async () => withRevision(await saveCourseDraft(id, revision, doc)),
    ),
);

export const publishAction = withPolicy(
  "music.course.edit",
  musicCourses,
  async (
    _scope: PolicyScope,
    id: string,
    revision: number,
    doc: unknown,
  ): Promise<CourseResult<{ revision: number }>> =>
    runCourse(
      ({ m }) => m.courses.actions.publishFailed,
      async () => withRevision(await publishCourse(id, revision, doc)),
    ),
);

export const discardDraftAction = withPolicy(
  "music.course.edit",
  musicCourses,
  async (
    _scope: PolicyScope,
    id: string,
    revision: number,
  ): Promise<CourseResult<{ revision: number }>> =>
    runCourse(
      ({ m }) => m.courses.actions.discardFailed,
      async () => withRevision(await discardCourseDraft(id, revision)),
    ),
);

export const unpublishAction = withPolicy(
  "music.course.edit",
  musicCourses,
  async (_scope: PolicyScope, id: string): Promise<CourseResult> =>
    runCourse(
      ({ m }) => m.courses.actions.unpublishFailed,
      async () => found(await unpublishCourse(id)),
    ),
);

export const removeCourseAction = withPolicy(
  "music.course.edit",
  musicCourses,
  async (_scope: PolicyScope, id: string): Promise<CourseResult> =>
    runCourse(
      ({ m }) => m.courses.actions.removeFailed,
      async () => found(await removeCourse(id)),
    ),
);

export const restoreCourseAction = withPolicy(
  "music.course.edit",
  musicCourses,
  async (_scope: PolicyScope, id: string): Promise<CourseResult> =>
    runCourse(
      ({ m }) => m.courses.actions.restoreFailed,
      async () => found(await restoreCourse(id)),
    ),
);

export const removeLessonAction = withPolicy(
  "music.course.edit",
  musicCourses,
  async (
    _scope: PolicyScope,
    courseId: string,
    lessonId: string,
    revision: number,
  ): Promise<CourseResult<{ revision: number; unpublished: boolean }>> =>
    runCourse(
      ({ m }) => m.courses.actions.removeLessonFailed,
      () => removeCourseLesson(courseId, lessonId, revision),
    ),
);

export const restoreLessonAction = withPolicy(
  "music.course.edit",
  musicCourses,
  async (
    _scope: PolicyScope,
    courseId: string,
    lessonId: string,
    revision: number,
  ): Promise<CourseResult<{ revision: number; lesson: LessonDoc }>> =>
    runCourse(
      ({ m }) => m.courses.actions.restoreLessonFailed,
      () => restoreCourseLesson(courseId, lessonId, revision),
    ),
);

/**
 * The fields `id` (the course) and `image`. Returns the path of the stored image for the `imagePath`
 * of the draft. It does not refresh the page: the draft has the image only after a save.
 */
export const uploadCourseImageAction = withPolicy(
  "music.course.edit",
  musicCourses,
  async (_scope: PolicyScope, formData: FormData): Promise<CourseResult<{ path: string }>> => {
    try {
      const path = await uploadCourseImage(text(formData, "id"), file(formData, "image"));
      const i18n = await getRequestI18n();
      if (path === null) return { status: "error", message: NOT_FOUND(i18n), issues: [] };
      return { status: "success", path };
    } catch (error) {
      const i18n = await getRequestI18n();
      if (error instanceof ValidationError) {
        return {
          status: "error",
          message: error.issues[0]?.message(i18n) ?? i18n.m.courses.actions.imageFailed,
          issues: [],
        };
      }
      // The module is off now: the page loads again and shows that it is off.
      if (error instanceof ModuleOffError) refresh();
      if (error instanceof SafeError) {
        return { status: "error", message: error.text(i18n), issues: [] };
      }
      console.error("[courses] Failed to upload a course image", error);
      return { status: "error", message: i18n.m.courses.actions.imageFailed, issues: [] };
    }
  },
);

/** `ids`: the ids of all courses that are not removed, in the new order. */
export const setCourseOrderAction = withPolicy(
  "music.course.manage",
  musicCourseManage,
  async (_scope, ids: string[]): Promise<CourseResult> =>
    runCourse(
      ({ m }) => m.courses.actions.orderFailed,
      async () => {
        if (await setCourseOrder(ids)) return {};
        throw new SafeError(({ m }) => m.courses.actions.coursesChanged);
      },
    ),
);
