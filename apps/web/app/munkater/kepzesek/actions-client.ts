import type { LessonDoc } from "@/lib/music/courses";
import * as server from "./actions";

/** A problem of one field, e.g. `lessons.2.videoUrl`. */
export type CourseIssue = { path: string; message: string };

export type CourseResult<Data extends object = object> =
  ({ status: "success" } & Data) | { status: "error"; message: string; issues: CourseIssue[] };

// The server actions are wrapped by `withPolicy` and answer `{ ok, value }`; the callers want the result.
// A refusal (no access, module off) is an error without a message: the page shows its own text.
const denied = (): { status: "error"; message: string; issues: CourseIssue[] } => ({
  status: "error",
  message: "",
  issues: [],
});

export async function createCourseAction(fields: unknown): Promise<CourseResult<{ id: string }>> {
  const outcome = await server.createCourseAction(fields);
  return outcome.ok ? outcome.value : denied();
}

export async function saveDraftAction(
  id: string,
  revision: number,
  doc: unknown,
): Promise<CourseResult<{ revision: number }>> {
  const outcome = await server.saveDraftAction(id, revision, doc);
  return outcome.ok ? outcome.value : denied();
}

export async function publishAction(
  id: string,
  revision: number,
  doc: unknown,
): Promise<CourseResult<{ revision: number }>> {
  const outcome = await server.publishAction(id, revision, doc);
  return outcome.ok ? outcome.value : denied();
}

export async function discardDraftAction(
  id: string,
  revision: number,
): Promise<CourseResult<{ revision: number }>> {
  const outcome = await server.discardDraftAction(id, revision);
  return outcome.ok ? outcome.value : denied();
}

export async function unpublishAction(id: string): Promise<CourseResult> {
  const outcome = await server.unpublishAction(id);
  return outcome.ok ? outcome.value : denied();
}

export async function removeCourseAction(id: string): Promise<CourseResult> {
  const outcome = await server.removeCourseAction(id);
  return outcome.ok ? outcome.value : denied();
}

export async function restoreCourseAction(id: string): Promise<CourseResult> {
  const outcome = await server.restoreCourseAction(id);
  return outcome.ok ? outcome.value : denied();
}

export async function removeLessonAction(
  courseId: string,
  lessonId: string,
  revision: number,
): Promise<CourseResult<{ revision: number; unpublished: boolean }>> {
  const outcome = await server.removeLessonAction(courseId, lessonId, revision);
  return outcome.ok ? outcome.value : denied();
}

export async function restoreLessonAction(
  courseId: string,
  lessonId: string,
  revision: number,
): Promise<CourseResult<{ revision: number; lesson: LessonDoc }>> {
  const outcome = await server.restoreLessonAction(courseId, lessonId, revision);
  return outcome.ok ? outcome.value : denied();
}

export async function uploadCourseImageAction(
  formData: FormData,
): Promise<CourseResult<{ path: string }>> {
  const outcome = await server.uploadCourseImageAction(formData);
  return outcome.ok ? outcome.value : denied();
}

export async function setCourseOrderAction(ids: string[]): Promise<CourseResult> {
  const outcome = await server.setCourseOrderAction(ids);
  return outcome.ok ? outcome.value : denied();
}
