"use client";

import { Suspense, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  ChevronRightIcon,
  GraduationCapIcon,
  PlusIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react";

import { ListPaneHeader } from "@/components/music/list-detail";
import { LocalDateTime } from "@/components/music/local-date-time";
import { Button } from "@/components/music/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/music/ui/empty";
import { useAppPathname, useI18n } from "@/i18n/music/client";
import { daysUntilDelete, type CourseSummaryDTO, type RemovedCourseDTO } from "@/lib/music/courses";
import { toastError, toastSuccess } from "@/lib/music/toast";
import { cn } from "@/lib/music/utils";
import { restoreCourseAction, setCourseOrderAction } from "./actions-client";
import { useSetlistDrag } from "../vetites/setlist-drag";
import { CourseCoverView } from "./course-icons";
import { CourseLabels } from "./course-labels";
import { DragHandle } from "./drag-handle";
import { NewCourseDialog } from "./new-course-dialog";

type CourseListProps = {
  courses: CourseSummaryDTO[];
  /** Null for the users who change no course. */
  removed: RemovedCourseDTO[] | null;
  /** Course admins and leaders of groups. */
  canCreate: boolean;
  /** Only course admins set the order of the courses. */
  canOrder: boolean;
};

/**
 * The list of the courses, in the list pane of the courses (`(list)/layout.tsx`):
 * it stays while the user opens courses, and the open course is current.
 * Course admins also get "New course", the drag handles of the order, the
 * state of each course and the removed courses. A leader of groups gets
 * "New course", and the state of the courses that they can change and their
 * removed courses.
 */
export function CourseList(props: CourseListProps) {
  // `usePathname()` can suspend: the fallback is the same list without the open course.
  return (
    <Suspense fallback={<CoursePane {...props} openId={null} />}>
      <RoutedCoursePane {...props} />
    </Suspense>
  );
}

function RoutedCoursePane(props: CourseListProps) {
  const pathname = useAppPathname();
  const openId = pathname.startsWith("/munkater/kepzesek/")
    ? (pathname.split("/")[3] ?? null)
    : null;
  return <CoursePane {...props} openId={openId} />;
}

function CoursePane({
  courses,
  removed,
  canCreate,
  canOrder,
  openId,
}: CourseListProps & { openId: string | null }) {
  const { m, format } = useI18n();
  const t = m.courses.list;
  const [creating, setCreating] = useState(false);
  // The order while a drag or the save runs, so the list does not jump back.
  const [order, setOrder] = useState<string[] | null>(null);
  const [moving, startMove] = useTransition();
  const listRef = useRef<HTMLOListElement>(null);

  const byId = new Map(courses.map((course) => [course.id, course]));
  const shown =
    order && order.length === courses.length && order.every((id) => byId.has(id))
      ? order.map((id) => byId.get(id)!)
      : courses;

  const drag = useSetlistDrag({
    listRef,
    keys: shown.map((course) => course.id),
    onMove: setOrder,
    onDrop: (ids) => {
      if (!ids || ids.every((id, index) => id === courses[index]?.id)) return setOrder(null);
      startMove(async () => {
        const result = await setCourseOrderAction(ids);
        if (result.status === "error") toastError(result.message);
        setOrder(null);
      });
    },
  });

  const newButton = canCreate && (
    <Button type="button" onClick={() => setCreating(true)}>
      <PlusIcon />
      {t.newCourse}
    </Button>
  );

  return (
    // `data-list-detail-nav`: the list of the list-detail layout (see `src/components/list-detail.tsx`).
    <div data-list-detail-nav className="flex flex-1 flex-col">
      <ListPaneHeader
        title={m.courses.page.title}
        actions={
          // Large screens: next to the title. Small screens: the floating button.
          canCreate &&
          shown.length > 0 && (
            <Button
              type="button"
              size="icon"
              aria-label={t.newCourse}
              title={t.newCourse}
              className="hidden lg:inline-flex"
              onClick={() => setCreating(true)}
            >
              <PlusIcon />
            </Button>
          )
        }
      />
      {/* The space at the end: "New course" floats there on small screens. */}
      <div className="flex flex-col gap-6 px-4 pt-4 pb-24 sm:px-6 lg:px-1 lg:pt-0 lg:pb-2">
        {shown.length === 0 ? (
          <Empty data-list-empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <GraduationCapIcon />
              </EmptyMedia>
              <EmptyTitle>{canCreate ? t.emptyAdminTitle : t.emptyTitle}</EmptyTitle>
              <EmptyDescription>
                {canCreate ? t.emptyAdminDescription : t.emptyDescription}
              </EmptyDescription>
            </EmptyHeader>
            {newButton && <EmptyContent>{newButton}</EmptyContent>}
          </Empty>
        ) : (
          <ol
            ref={listRef}
            className={cn(
              "flex flex-col gap-1",
              drag.dragKey !== null && "cursor-grabbing select-none",
            )}
            aria-label={t.label}
          >
            {shown.map((course) => (
              <li
                key={course.id}
                className={cn(
                  "flex items-center gap-1",
                  drag.dragKey === course.id && "relative z-10 rounded-xl bg-card shadow-md",
                )}
              >
                {canOrder && (
                  <DragHandle
                    id={course.id}
                    label={format(t.dragCourse, { title: course.title })}
                    dragging={drag.dragKey !== null}
                    disabled={moving}
                    onStart={(event) => drag.start(course.id, event)}
                    onMove={(offset) => drag.move(course.id, offset)}
                  />
                )}
                <Link
                  href={
                    course.canEdit && !course.wasPublished
                      ? `/munkater/kepzesek/${course.id}/edit`
                      : `/munkater/kepzesek/${course.id}`
                  }
                  aria-current={course.id === openId ? "page" : undefined}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-2 transition-colors outline-none select-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:active:bg-muted lg:aria-[current=page]:bg-secondary lg:aria-[current=page]:text-secondary-foreground"
                >
                  <CourseCoverView cover={course} className="size-11" />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate text-sm font-semibold">{course.title}</span>
                    <CourseLabels course={course} admin={course.canEdit} />
                  </span>
                  <ChevronRightIcon aria-hidden className="size-4 shrink-0 text-muted lg:hidden" />
                </Link>
              </li>
            ))}
          </ol>
        )}

        {removed && <RemovedCourses removed={removed} />}
      </div>
      {canCreate && shown.length > 0 && (
        <div className="pointer-events-none fixed right-4 bottom-[calc(var(--tab-bar-height,0px)+1rem)] z-20 flex justify-end pr-[env(safe-area-inset-right)] lg:hidden">
          <Button
            type="button"
            size="lg"
            className="pointer-events-auto h-11 rounded-full pr-5 pl-4 shadow-lg pointer-coarse:h-12"
            onClick={() => setCreating(true)}
          >
            <PlusIcon />
            {t.newCourse}
          </Button>
        </div>
      )}
      {canCreate && <NewCourseDialog open={creating} onOpenChange={setCreating} />}
    </div>
  );
}

/** The removed courses, with "Restore". */
function RemovedCourses({ removed }: { removed: RemovedCourseDTO[] }) {
  const { m, plural } = useI18n();
  const t = m.courses.removed;
  const [now] = useState(() => Date.now());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startRestore] = useTransition();

  function restore(course: RemovedCourseDTO) {
    setPendingId(course.id);
    startRestore(async () => {
      const result = await restoreCourseAction(course.id);
      if (result.status === "success") toastSuccess(m.courses.actions.courseRestored);
      else toastError(result.message);
      setPendingId(null);
    });
  }

  return (
    <section className="flex flex-col gap-2" aria-labelledby="removed-courses">
      {/* The days left on each row show when a course is deleted. */}
      <h2 id="removed-courses" className="px-1 text-xs font-medium text-muted">
        {t.coursesTitle}
      </h2>
      {removed.length === 0 ? (
        <p className="flex items-center gap-2 rounded-xl border border-dashed px-3 py-3 text-sm text-muted">
          <Trash2Icon aria-hidden className="size-4 shrink-0" />
          {t.emptyCoursesTitle}
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {removed.map((course) => (
            <li key={course.id} className="flex flex-wrap items-center gap-3 rounded-xl px-2 py-2">
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-medium">{course.title}</span>
                <span className="text-xs text-muted">
                  <LocalDateTime date={course.removedAt} options={{ dateStyle: "medium" }} />
                  {m.common.separator}
                  {plural(t.daysLeft, daysUntilDelete(course.removedAt, now))}
                </span>
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pendingId !== null}
                onClick={() => restore(course)}
              >
                <RotateCcwIcon />
                {pendingId === course.id ? t.restoring : t.restore}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
