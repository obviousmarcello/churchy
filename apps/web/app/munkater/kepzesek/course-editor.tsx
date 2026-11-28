"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangleIcon,
  EyeIcon,
  EyeOffIcon,
  FileTextIcon,
  PencilIcon,
  PlusIcon,
  RotateCcwIcon,
  SendIcon,
  Trash2Icon,
  Undo2Icon,
} from "lucide-react";

import { Field, SectionHeading } from "@/components/music/form-field";
import { useUnsavedChangesWarning } from "@/components/music/form-parts";
import { GroupOption } from "@/components/music/group-option";
import { LocalDateTime } from "@/components/music/local-date-time";
import { PageHeader } from "@/components/music/page-header";
import { Button } from "@/components/music/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/music/ui/empty";
import { Input } from "@/components/music/ui/input";
import { NativeSelect } from "@/components/music/ui/native-select";
import { Textarea } from "@/components/music/ui/textarea";
import { useI18n } from "@/i18n/music/client";
import {
  COURSE_DESCRIPTION_MAX_LENGTH,
  COURSE_LANGUAGES,
  COURSE_TITLE_MAX_LENGTH,
  daysUntilDelete,
  LESSONS_MAX,
  newLesson,
  type CourseDoc,
  type CourseEditorDTO,
  type CourseLanguage,
  type LessonDoc,
  type RemovedLessonDTO,
} from "@/lib/music/courses";
import { toLinkUrl } from "@/lib/music/links";
import { toastError, toastSuccess } from "@/lib/music/toast";
import { cn } from "@/lib/music/utils";
import { toYoutubeUrl } from "@/lib/music/youtube";
import {
  discardDraftAction,
  publishAction,
  removeCourseAction,
  removeLessonAction,
  restoreLessonAction,
  saveDraftAction,
  unpublishAction,
  type CourseIssue,
} from "./actions-client";
import { useSetlistDrag } from "../vetites/setlist-drag";
import { ChoiceDialog, type Choice } from "./choice-dialog";
import { CourseCoverPicker } from "./course-cover-picker";
import { CourseCoverView } from "./course-icons";
import { DragHandle } from "./drag-handle";
import { CourseLabels } from "./course-labels";
import { LessonContent } from "./lesson-content";
import { LessonEditor } from "./lesson-editor";

type OpenDialog =
  | { kind: "removeLesson"; lesson: LessonDoc; stored: boolean; last: boolean }
  | { kind: "discard" }
  | { kind: "unpublish" }
  | { kind: "removeCourse" };

/**
 * The editor of a course: its fields, its areas and its lessons. The changes
 * go to the draft with "Save draft", and live with "Publish". A remove of a
 * lesson acts at once (it goes to "Removed lessons" for 90 days). A save
 * from an old page fails: the server checks `revision`.
 */
export function CourseEditor({ course }: { course: CourseEditorDTO }) {
  const { m, format, plural } = useI18n();
  const t = m.courses.editor;
  const router = useRouter();
  const id = useId();

  const [doc, setDoc] = useState<CourseDoc>(course.doc);
  // The draft as the server has it: the base of "unsaved changes".
  const [saved, setSaved] = useState<CourseDoc>(course.doc);
  const [revision, setRevision] = useState(course.revision);
  const [selectedId, setSelectedId] = useState<string | null>(course.doc.lessons[0]?.id ?? null);
  const [preview, setPreview] = useState(false);
  const [issues, setIssues] = useState<CourseIssue[]>([]);
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  // A new value loads the texts of the lessons again, after a change from outside the editor.
  const [textVersion, setTextVersion] = useState(0);
  const [pending, startAction] = useTransition();

  // A newer revision from the server, e.g. another course admin saved, or an
  // event admin deleted an area: without unsaved changes, the editor takes it.
  const [seenRevision, setSeenRevision] = useState(course.revision);
  if (course.revision !== seenRevision) {
    setSeenRevision(course.revision);
    if (course.revision > revision && sameDoc(doc, saved, course)) {
      setDoc(course.doc);
      setSaved(course.doc);
      setRevision(course.revision);
      setTextVersion((version) => version + 1);
    }
  }

  // A leader selects only the groups that they lead. The root group (all users) comes first.
  const editable = course.editableAreaIds;
  const areaOptions =
    editable === "all" ? course.areas : course.areas.filter((area) => editable.includes(area.id));
  const rootName = course.areas.find((area) => area.id === course.rootAreaId)?.name ?? "";
  const unsaved = !sameDoc(doc, saved, course);
  const wasPublished = course.published !== null;
  const differsFromPublished = !wasPublished || !sameDoc(doc, course.published!, course);
  const canPublish = doc.lessons.length > 0 && (differsFromPublished || !course.isPublished);
  const selectedIndex = doc.lessons.findIndex((lesson) => lesson.id === selectedId);
  const selected = selectedIndex >= 0 ? doc.lessons[selectedIndex] : (doc.lessons[0] ?? null);
  const storedIds = new Set(saved.lessons.map((lesson) => lesson.id));

  // A warning before the tab closes with unsaved changes.
  useUnsavedChangesWarning(unsaved);

  function errors(path: string): string[] | undefined {
    const found = issues.filter((issue) => issue.path === path).map((issue) => issue.message);
    return found.length > 0 ? found : undefined;
  }

  function lessonHasErrors(index: number): boolean {
    return issues.some((issue) => issue.path.startsWith(`lessons.${index}.`));
  }

  function update(change: Partial<CourseDoc>) {
    setDoc((current) => ({ ...current, ...change }));
  }

  function updateLesson(lesson: LessonDoc) {
    setDoc((current) => ({
      ...current,
      lessons: current.lessons.map((item) => (item.id === lesson.id ? lesson : item)),
    }));
  }

  function addLesson() {
    const lesson = newLesson(format(t.newLessonTitle, { number: doc.lessons.length + 1 }));
    setDoc((current) => ({ ...current, lessons: [...current.lessons, lesson] }));
    setSelectedId(lesson.id);
    setPreview(false);
  }

  // The order of the lessons while a drag runs: by the handle, or by the arrow keys on it.
  const lessonList = useRef<HTMLOListElement>(null);
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  const lessonsById = new Map(doc.lessons.map((lesson) => [lesson.id, lesson]));
  const shownLessons =
    dragOrder &&
    dragOrder.length === doc.lessons.length &&
    dragOrder.every((lessonId) => lessonsById.has(lessonId))
      ? dragOrder.map((lessonId) => lessonsById.get(lessonId)!)
      : doc.lessons;
  const drag = useSetlistDrag({
    listRef: lessonList,
    keys: shownLessons.map((lesson) => lesson.id),
    onMove: setDragOrder,
    onDrop: (keys) => {
      if (keys) {
        setDoc((current) => {
          const byId = new Map(current.lessons.map((lesson) => [lesson.id, lesson]));
          const lessons = keys.flatMap((lessonId) => byId.get(lessonId) ?? []);
          return lessons.length === current.lessons.length ? { ...current, lessons } : current;
        });
      }
      setDragOrder(null);
    },
  });

  /** "Save draft" or "Publish". A published course needs a group: the root group for all users. */
  function submit(action: "save" | "publish") {
    const input = cleanDoc(doc, course);
    if (input.areaIds.length === 0 && (action === "publish" || course.editableAreaIds !== "all")) {
      setIssues([
        {
          path: "areaIds",
          message: course.editableAreaIds === "all" ? t.areasRequired : t.leaderAreasRequired,
        },
      ]);
      toastError(t.areasRequired);
      return;
    }

    startAction(async () => {
      const result =
        action === "save"
          ? await saveDraftAction(course.id, revision, input)
          : await publishAction(course.id, revision, input);
      if (result.status === "success") {
        setRevision(result.revision);
        setSaved(input);
        setIssues([]);
        toastSuccess(action === "save" ? m.courses.actions.saved : m.courses.actions.published);
      } else {
        setIssues(result.issues);
        toastError(result.message);
      }
    });
  }

  function askRemoveLesson(lesson: LessonDoc) {
    const publishedLessons = course.published?.lessons ?? [];
    setDialog({
      kind: "removeLesson",
      lesson,
      stored: storedIds.has(lesson.id) || publishedLessons.some((item) => item.id === lesson.id),
      last:
        course.isPublished &&
        publishedLessons.length === 1 &&
        publishedLessons[0]?.id === lesson.id,
    });
  }

  function dropLesson(lessonId: string) {
    const without = (current: CourseDoc) => ({
      ...current,
      lessons: current.lessons.filter((lesson) => lesson.id !== lessonId),
    });
    const index = doc.lessons.findIndex((lesson) => lesson.id === lessonId);
    const neighbor = doc.lessons[index + 1] ?? doc.lessons[index - 1] ?? null;
    setDoc(without);
    setSaved(without);
    if (selected?.id === lessonId) setSelectedId(neighbor?.id ?? null);
  }

  function removeLesson(lesson: LessonDoc, stored: boolean) {
    if (!stored) {
      // Never saved: nothing to restore.
      const index = doc.lessons.findIndex((item) => item.id === lesson.id);
      const neighbor = doc.lessons[index + 1] ?? doc.lessons[index - 1] ?? null;
      setDoc((current) => ({
        ...current,
        lessons: current.lessons.filter((item) => item.id !== lesson.id),
      }));
      if (selected?.id === lesson.id) setSelectedId(neighbor?.id ?? null);
      setDialog(null);
      return;
    }
    startAction(async () => {
      const result = await removeLessonAction(course.id, lesson.id, revision);
      if (result.status === "success") {
        setRevision(result.revision);
        dropLesson(lesson.id);
        setDialog(null);
        toastSuccess(
          result.unpublished
            ? m.courses.actions.lessonRemovedUnpublished
            : m.courses.actions.lessonRemoved,
        );
      } else {
        toastError(result.message);
      }
    });
  }

  function restoreLesson(lesson: RemovedLessonDTO) {
    startAction(async () => {
      const result = await restoreLessonAction(course.id, lesson.id, revision);
      if (result.status === "success") {
        setRevision(result.revision);
        const add = (current: CourseDoc) => ({
          ...current,
          lessons: [...current.lessons, result.lesson],
        });
        setDoc(add);
        setSaved(add);
        setSelectedId(result.lesson.id);
        toastSuccess(m.courses.actions.lessonRestored);
      } else {
        toastError(result.message);
      }
    });
  }

  function discard() {
    startAction(async () => {
      const result = await discardDraftAction(course.id, revision);
      if (result.status === "success" && course.published) {
        setRevision(result.revision);
        setDoc(course.published);
        setSaved(course.published);
        setIssues([]);
        setTextVersion((version) => version + 1);
        setDialog(null);
        toastSuccess(m.courses.actions.discarded);
      } else if (result.status === "error") {
        toastError(result.message);
      }
    });
  }

  function unpublish() {
    startAction(async () => {
      const result = await unpublishAction(course.id);
      if (result.status === "success") {
        setDialog(null);
        toastSuccess(m.courses.actions.unpublished);
      } else {
        toastError(result.message);
      }
    });
  }

  function removeCourse() {
    startAction(async () => {
      const result = await removeCourseAction(course.id);
      if (result.status === "success") {
        toastSuccess(m.courses.actions.courseRemoved);
        router.push("/munkater/kepzesek");
      } else {
        toastError(result.message);
      }
    });
  }

  const state = !wasPublished
    ? t.state.draft
    : course.isPublished
      ? t.state.published
      : t.state.hidden;
  const changes = unsaved
    ? t.state.unsaved
    : differsFromPublished && wasPublished
      ? t.state.notPublished
      : null;

  return (
    <>
      <PageHeader
        title={t.title}
        details={doc.title || saved.title}
        back={
          wasPublished
            ? { href: `/munkater/kepzesek/${course.id}`, label: saved.title }
            : { href: "/munkater/kepzesek", label: m.common.nav.courses }
        }
      />

      <div className="flex w-full max-w-6xl flex-col px-4 py-6 sm:px-6">
        {/* One card: the state and the actions of the course on top, the editor below. */}
        <div className="flex flex-col rounded-card border bg-surface-raised">
          <div className="flex flex-col gap-3 border-b p-4 sm:px-6">
            <p className="text-sm">
              <span className="font-medium">{state}</span>
              {changes && (
                <>
                  {m.common.separator}
                  <span className="text-muted">{changes}</span>
                </>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={pending || !unsaved}
                onClick={() => submit("save")}
              >
                {pending ? t.working : t.saveDraft}
              </Button>
              <Button
                type="button"
                disabled={pending || !canPublish}
                onClick={() => submit("publish")}
              >
                <SendIcon />
                {!wasPublished ? t.publish : course.isPublished ? t.publishChanges : t.publishAgain}
              </Button>
              <Button
                type="button"
                variant="outline"
                aria-pressed={preview}
                onClick={() => setPreview((value) => !value)}
              >
                {preview ? <PencilIcon /> : <EyeIcon />}
                {preview ? t.backToEdit : t.preview}
              </Button>
              {wasPublished && differsFromPublished && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => setDialog({ kind: "discard" })}
                >
                  <Undo2Icon />
                  {t.discard}
                </Button>
              )}
              {course.isPublished && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => setDialog({ kind: "unpublish" })}
                >
                  <EyeOffIcon />
                  {t.unpublish}
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                className="text-danger"
                disabled={pending}
                onClick={() => setDialog({ kind: "removeCourse" })}
              >
                <Trash2Icon />
                {t.removeCourse}
              </Button>
            </div>
            {doc.lessons.length === 0 && (
              <p className="text-sm text-muted">{t.publishNeedsLesson}</p>
            )}
          </div>

          <div className="flex flex-col gap-8 p-4 sm:p-6">
            {course.areasLost && doc.areaIds.length === 0 && (
              <p
                role="status"
                className="flex items-start gap-2 rounded-card border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-warning"
              >
                <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
                {t.areasLost}
              </p>
            )}

            {preview ? (
              <Preview
                doc={doc}
                areas={course.areas}
                selectedId={selected?.id ?? null}
                onSelect={setSelectedId}
              />
            ) : (
              <>
                <section className="flex flex-col gap-4">
                  <SectionHeading title={t.courseSection} />
                  <CourseCoverPicker
                    courseId={course.id}
                    cover={{ icon: doc.icon, imagePath: doc.imagePath }}
                    onChange={(cover) => update(cover)}
                  />
                  <div className="grid gap-4 md:grid-cols-[1fr_12rem]">
                    <Field name={`${id}-title`} label={t.courseTitle} errors={errors("title")}>
                      <Input
                        id={`${id}-title`}
                        required
                        maxLength={COURSE_TITLE_MAX_LENGTH}
                        value={doc.title}
                        onChange={(event) => update({ title: event.target.value })}
                        aria-invalid={errors("title") !== undefined || undefined}
                        aria-describedby={`${id}-title-description`}
                      />
                    </Field>
                    <Field name={`${id}-language`} label={t.language} errors={errors("language")}>
                      <NativeSelect
                        id={`${id}-language`}
                        value={doc.language}
                        onChange={(event) =>
                          update({ language: event.target.value as CourseLanguage })
                        }
                        aria-describedby={`${id}-language-description`}
                      >
                        {COURSE_LANGUAGES.map((code) => (
                          <option key={code} value={code}>
                            {m.courses.languages[code]}
                          </option>
                        ))}
                      </NativeSelect>
                    </Field>
                  </div>
                  <Field
                    name={`${id}-description`}
                    label={t.description}
                    hint={t.descriptionHint}
                    errors={errors("description")}
                  >
                    <Textarea
                      id={`${id}-description`}
                      rows={3}
                      maxLength={COURSE_DESCRIPTION_MAX_LENGTH}
                      value={doc.description ?? ""}
                      onChange={(event) =>
                        update({
                          description: event.target.value === "" ? null : event.target.value,
                        })
                      }
                      aria-invalid={errors("description") !== undefined || undefined}
                      aria-describedby={`${id}-description-description`}
                    />
                  </Field>

                  <fieldset className="flex flex-col gap-2">
                    <legend className="mb-1 text-sm leading-none font-medium">{t.areas}</legend>
                    <p className="text-sm text-muted">
                      {course.editableAreaIds === "all"
                        ? format(t.areasHint, { root: rootName })
                        : t.areasLeaderHint}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {areaOptions.map((area) => {
                        const checked = doc.areaIds.includes(area.id);
                        return (
                          <GroupOption
                            key={area.id}
                            label={area.name}
                            checked={checked}
                            onChange={() =>
                              update({
                                areaIds: checked
                                  ? doc.areaIds.filter((areaId) => areaId !== area.id)
                                  : [...doc.areaIds, area.id],
                              })
                            }
                          />
                        );
                      })}
                    </div>
                    {areaOptions.length === 0 && <p className="text-sm text-muted">{t.noAreas}</p>}
                    {errors("areaIds") && (
                      <p className="text-sm text-danger">{errors("areaIds")!.join(" ")}</p>
                    )}
                  </fieldset>
                </section>

                <section className="flex flex-col gap-4">
                  <SectionHeading
                    title={t.lessonsSection}
                    description={plural(t.lessonCount, doc.lessons.length)}
                  />
                  {errors("lessons") && (
                    <p className="text-sm text-danger">{errors("lessons")!.join(" ")}</p>
                  )}
                  {doc.lessons.length === 0 || !selected ? (
                    <Empty className="border">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <FileTextIcon />
                        </EmptyMedia>
                        <EmptyTitle>{t.noLessonsTitle}</EmptyTitle>
                        <EmptyDescription>{t.noLessonsDescription}</EmptyDescription>
                      </EmptyHeader>
                      <EmptyContent>
                        <Button type="button" onClick={addLesson}>
                          <PlusIcon />
                          {t.addLesson}
                        </Button>
                      </EmptyContent>
                    </Empty>
                  ) : (
                    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
                      <div className="flex w-full shrink-0 flex-col gap-2 lg:w-80">
                        <ol
                          ref={lessonList}
                          className={cn(
                            "divide-y rounded-card border",
                            drag.dragKey !== null && "cursor-grabbing select-none",
                          )}
                          aria-label={t.lessonsSection}
                        >
                          {shownLessons.map((lesson, index) => (
                            <li
                              key={lesson.id}
                              className={cn(
                                "flex items-center gap-1 pl-1",
                                lesson.id === selected.id && "bg-surface-sunken",
                                drag.dragKey === lesson.id &&
                                  "relative z-10 rounded-card bg-surface shadow-md",
                              )}
                            >
                              <DragHandle
                                id={lesson.id}
                                label={format(t.dragLesson, {
                                  title: lesson.title || t.untitledLesson,
                                })}
                                dragging={drag.dragKey !== null}
                                onStart={(event) => drag.start(lesson.id, event)}
                                onMove={(offset) => drag.move(lesson.id, offset)}
                              />
                              <button
                                type="button"
                                onClick={() => setSelectedId(lesson.id)}
                                aria-current={lesson.id === selected.id ? "true" : undefined}
                                className="flex min-w-0 flex-1 items-baseline gap-2 px-3 py-2 text-left text-sm outline-none focus-visible:ring-3 focus-visible:ring-focus/50 focus-visible:ring-inset"
                              >
                                <span className="w-5 shrink-0 text-right text-xs text-muted tabular-nums">
                                  {index + 1}.
                                </span>
                                <span
                                  className={cn(
                                    "min-w-0 flex-1 truncate",
                                    lesson.id === selected.id && "font-medium",
                                  )}
                                >
                                  {lesson.title || t.untitledLesson}
                                </span>
                                {lessonHasErrors(doc.lessons.indexOf(lesson)) && (
                                  <AlertTriangleIcon
                                    className="size-4 shrink-0 text-danger"
                                    aria-label={t.lessonHasErrors}
                                  />
                                )}
                                {!storedIds.has(lesson.id) && (
                                  <span className="shrink-0 text-xs text-muted">{t.newLabel}</span>
                                )}
                              </button>
                            </li>
                          ))}
                        </ol>
                        <Button
                          type="button"
                          variant="outline"
                          className="self-start"
                          disabled={doc.lessons.length >= LESSONS_MAX}
                          onClick={addLesson}
                        >
                          <PlusIcon />
                          {t.addLesson}
                        </Button>
                      </div>

                      <div className="min-w-0 flex-1 rounded-card border p-4">
                        <LessonEditor
                          key={selected.id}
                          lesson={selected}
                          textKey={`${selected.id}:${textVersion}`}
                          onChange={updateLesson}
                          onRemove={() => askRemoveLesson(selected)}
                          errors={(field) =>
                            errors(`lessons.${doc.lessons.indexOf(selected)}.${field}`)
                          }
                          disabled={pending}
                        />
                      </div>
                    </div>
                  )}
                </section>

                <RemovedLessons
                  lessons={course.removedLessons}
                  pending={pending}
                  onRestore={restoreLesson}
                />
              </>
            )}
          </div>
        </div>
      </div>

      {dialog && (
        <EditorDialog
          dialog={dialog}
          pending={pending}
          onClose={() => setDialog(null)}
          onRemoveLesson={removeLesson}
          onDiscard={discard}
          onUnpublish={unpublish}
          onRemoveCourse={removeCourse}
        />
      )}
    </>
  );
}

/** The dialogs of the editor: a question before an action. */
function EditorDialog({
  dialog,
  pending,
  onClose,
  onRemoveLesson,
  onDiscard,
  onUnpublish,
  onRemoveCourse,
}: {
  dialog: OpenDialog;
  pending: boolean;
  onClose: () => void;
  onRemoveLesson: (lesson: LessonDoc, stored: boolean) => void;
  onDiscard: () => void;
  onUnpublish: () => void;
  onRemoveCourse: () => void;
}) {
  const { m, format } = useI18n();
  const t = m.courses.editor.dialogs;

  let title: string;
  let description: React.ReactNode;
  let choices: Choice[];
  switch (dialog.kind) {
    case "removeLesson":
      title = format(t.removeLesson.title, { title: dialog.lesson.title });
      description = (
        <>
          {dialog.stored ? t.removeLesson.description : t.removeLesson.unsavedDescription}
          {dialog.last && (
            <>
              {" "}
              <strong className="font-medium text-text">{t.removeLesson.last}</strong>
            </>
          )}
        </>
      );
      choices = [
        {
          label: t.removeLesson.confirm,
          variant: "destructive",
          onChoose: () => onRemoveLesson(dialog.lesson, dialog.stored),
        },
      ];
      break;
    case "discard":
      title = t.discard.title;
      description = t.discard.description;
      choices = [{ label: t.discard.confirm, variant: "destructive", onChoose: onDiscard }];
      break;
    case "unpublish":
      title = t.unpublish.title;
      description = t.unpublish.description;
      choices = [{ label: t.unpublish.confirm, onChoose: onUnpublish }];
      break;
    case "removeCourse":
      title = t.removeCourse.title;
      description = t.removeCourse.description;
      choices = [
        { label: t.removeCourse.confirm, variant: "destructive", onChoose: onRemoveCourse },
      ];
      break;
  }

  return (
    <ChoiceDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={title}
      description={description}
      choices={choices}
      pending={pending}
    />
  );
}

/** The removed lessons of the course, with "Restore". */
function RemovedLessons({
  lessons,
  pending,
  onRestore,
}: {
  lessons: RemovedLessonDTO[];
  pending: boolean;
  onRestore: (lesson: RemovedLessonDTO) => void;
}) {
  const { m, plural } = useI18n();
  const t = m.courses.removed;
  const [now] = useState(() => Date.now());

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading title={t.lessonsTitle} description={t.lessonsDescription} />
      {lessons.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Trash2Icon />
            </EmptyMedia>
            <EmptyTitle>{t.emptyLessonsTitle}</EmptyTitle>
            <EmptyDescription>{t.emptyLessonsDescription}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="divide-y rounded-card border">
          {lessons.map((lesson) => (
            <li key={lesson.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-medium">{lesson.title}</span>
                <span className="text-xs text-muted">
                  <LocalDateTime date={lesson.removedAt} options={{ dateStyle: "medium" }} />
                  {m.common.separator}
                  {plural(t.daysLeft, daysUntilDelete(lesson.removedAt, now))}
                  {!lesson.wasPublished && (
                    <>
                      {m.common.separator}
                      {t.draftOnly}
                    </>
                  )}
                </span>
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => onRestore(lesson)}
              >
                <RotateCcwIcon />
                {t.restore}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The draft as a reader sees it: the course, and the selected lesson. */
function Preview({
  doc,
  areas,
  selectedId,
  onSelect,
}: {
  doc: CourseDoc;
  areas: CourseEditorDTO["areas"];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { m } = useI18n();
  const t = m.courses.editor;
  const lesson = doc.lessons.find((item) => item.id === selectedId) ?? doc.lessons[0] ?? null;
  const areaNames = areas.filter((area) => doc.areaIds.includes(area.id)).map((area) => area.name);

  return (
    <section className="flex flex-col gap-6" aria-label={t.preview} lang={doc.language}>
      <p className="rounded-card border border-dashed px-3 py-2 text-sm text-muted">
        {t.previewNotice}
      </p>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-4">
          <CourseCoverView cover={doc} className="size-16" />
          <h2 className="font-heading text-2xl font-semibold tracking-tight">
            {doc.title || t.untitledCourse}
          </h2>
        </div>
        {doc.description && <p className="whitespace-pre-line text-muted">{doc.description}</p>}
        <CourseLabels
          course={{
            language: doc.language,
            areas: areaNames,
            lessonCount: doc.lessons.length,
            isPublished: true,
          }}
          admin={false}
        />
      </div>
      {lesson ? (
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <article className="flex min-w-0 flex-1 flex-col gap-4">
            <h3 className="font-heading text-xl font-semibold tracking-tight">
              {lesson.title || t.untitledLesson}
            </h3>
            <LessonContent lesson={lesson} />
          </article>
          <ol className="w-full shrink-0 divide-y rounded-card border lg:w-72">
            {doc.lessons.map((item, index) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  aria-current={item.id === lesson.id ? "true" : undefined}
                  className={cn(
                    "flex w-full items-baseline gap-2 px-3 py-2 text-left text-sm outline-none hover:bg-surface-sunken/60 focus-visible:ring-3 focus-visible:ring-focus/50 focus-visible:ring-inset",
                    item.id === lesson.id && "bg-surface-sunken font-medium",
                  )}
                >
                  <span className="w-5 shrink-0 text-right text-xs text-muted tabular-nums">
                    {index + 1}.
                  </span>
                  <span className="min-w-0 flex-1">{item.title || t.untitledLesson}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileTextIcon />
            </EmptyMedia>
            <EmptyTitle>{t.noLessonsTitle}</EmptyTitle>
            <EmptyDescription>{t.noLessonsDescription}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </section>
  );
}

/**
 * The document as the server keeps it: trimmed texts, null for an empty
 * text, the areas in their order. The base of "unsaved changes" too.
 */
function cleanDoc(doc: CourseDoc, course: CourseEditorDTO): CourseDoc {
  const order = new Map(course.areas.map((area, index) => [area.id, index]));
  const blank = (value: string | null) => {
    const trimmed = value?.trim() ?? "";
    return trimmed === "" ? null : trimmed;
  };
  return {
    title: doc.title.trim(),
    language: doc.language,
    description: blank(doc.description),
    icon: doc.imagePath ? null : doc.icon,
    imagePath: doc.imagePath,
    areaIds: [...doc.areaIds].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0)),
    lessons: doc.lessons.map((lesson) => ({
      id: lesson.id,
      title: lesson.title.trim(),
      // As the server keeps the links, so a published link is not a change.
      videoUrl: withDefault(blank(lesson.videoUrl), toYoutubeUrl),
      body: lesson.body,
      links: lesson.links.map((link) => ({
        label: blank(link.label),
        url: withDefault(link.url.trim(), toLinkUrl) ?? "",
      })),
    })),
  };
}

/** `normalize(value)`, or `value` when it is not valid: the server then shows the error. */
function withDefault(
  value: string | null,
  normalize: (value: string) => string | null,
): string | null {
  return value === null ? null : (normalize(value) ?? value);
}

function sameDoc(a: CourseDoc, b: CourseDoc, course: CourseEditorDTO): boolean {
  return JSON.stringify(cleanDoc(a, course)) === JSON.stringify(cleanDoc(b, course));
}
