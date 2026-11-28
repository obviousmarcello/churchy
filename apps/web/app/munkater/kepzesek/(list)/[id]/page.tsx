import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EyeOffIcon, FileTextIcon, PencilIcon, PlayIcon, SearchXIcon } from "lucide-react";

import { PageHeader } from "@/components/music/page-header";
import { buttonVariants } from "@/components/music/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/music/ui/empty";
import { getI18n } from "@/i18n/music/server";
import { requirePageUser } from "@/server/music/auth";
import { getCourse } from "@/server/music/models/courses";
import { CourseCoverView } from "../../course-icons";
import { CourseLabels } from "../../course-labels";
import { CourseNotFound } from "../../course-not-found";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return { title: m.courses.course.title };
}

// A published course: its description and the list of its lessons.
export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { m } = await getI18n();

  return (
    // The detail pane of the list-detail layout is the `main` (`../layout.tsx`).
    <div className="flex flex-1 flex-col">
      {/* Reads the session cookie and the URL, so it renders at request time. */}
      <Suspense
        fallback={
          <>
            <PageHeader title={m.courses.course.title} />
            <p className="px-4 py-6 text-sm text-muted sm:px-6">{m.courses.page.loading}</p>
          </>
        }
      >
        <Course params={params} />
      </Suspense>
    </div>
  );
}

async function Course({ params }: { params: Promise<{ id: string }> }) {
  // `requirePageUser()` sends a signed-out visitor to the sign-in pages.
  const [{ id }, , { m, plural }] = await Promise.all([params, requirePageUser(), getI18n()]);
  const course = await getCourse(id);
  const t = m.courses.course;

  if (course === null) return <CourseNotFound />;

  // A course that was never published reaches only its editors. Else the model says who can change it.
  const editLink = (course === "notPublished" || course.canEdit) && (
    <Link href={`/munkater/kepzesek/${id}/edit`} className={buttonVariants({ variant: "outline" })}>
      <PencilIcon />
      {t.edit}
    </Link>
  );

  if (course === "notPublished") {
    return (
      <>
        <PageHeader title={t.title} />
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchXIcon />
            </EmptyMedia>
            <EmptyTitle>{t.notPublishedTitle}</EmptyTitle>
            <EmptyDescription>{t.notPublishedDescription}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>{editLink}</EmptyContent>
        </Empty>
      </>
    );
  }

  const [first] = course.lessons;

  return (
    <>
      <PageHeader title={course.title} actions={editLink} />
      <div data-reveal="" className="flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6">
        {!course.isPublished && (
          <p className="flex items-start gap-2 rounded-card border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-warning">
            <EyeOffIcon className="mt-0.5 size-4 shrink-0" />
            {t.hiddenNotice}
          </p>
        )}
        <div className="flex items-start gap-4">
          <CourseCoverView cover={course} className="size-20 sm:size-24" />
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            {course.description && (
              <p className="whitespace-pre-line text-muted">{course.description}</p>
            )}
            <CourseLabels
              course={{ ...course, lessonCount: course.lessons.length }}
              admin={false}
            />
          </div>
        </div>

        {first ? (
          <>
            <Link
              href={`/munkater/kepzesek/${id}/lessons/${first.id}`}
              className={buttonVariants({ size: "lg", className: "self-start" })}
            >
              <PlayIcon />
              {t.start}
            </Link>
            <section className="flex flex-col gap-3" aria-labelledby="course-lessons">
              <h2 id="course-lessons" className="font-heading text-fs-5 font-bold tracking-tight">
                {plural(t.lessons, course.lessons.length)}
              </h2>
              <ol className="divide-y rounded-card border">
                {course.lessons.map((lesson, index) => (
                  <li key={lesson.id}>
                    <Link
                      href={`/munkater/kepzesek/${id}/lessons/${lesson.id}`}
                      className="flex items-center gap-3 px-4 py-3 transition-colors outline-none hover:bg-surface-sunken/60 focus-visible:bg-surface-sunken focus-visible:ring-3 focus-visible:ring-focus/50 focus-visible:ring-inset"
                    >
                      <span className="w-6 shrink-0 text-right text-sm text-muted tabular-nums">
                        {index + 1}.
                      </span>
                      <span className="min-w-0 flex-1 text-sm">{lesson.title}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          </>
        ) : (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileTextIcon />
              </EmptyMedia>
              <EmptyTitle>{t.noLessonsTitle}</EmptyTitle>
              <EmptyDescription>{t.noLessonsDescription}</EmptyDescription>
            </EmptyHeader>
            {editLink && <EmptyContent>{editLink}</EmptyContent>}
          </Empty>
        )}
      </div>
    </>
  );
}
