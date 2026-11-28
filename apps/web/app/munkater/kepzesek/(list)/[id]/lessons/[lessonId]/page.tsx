import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeftIcon, ArrowRightIcon, EyeOffIcon } from "lucide-react";

import { PageHeader } from "@/components/music/page-header";
import { buttonVariants } from "@/components/music/ui/button";
import { getI18n } from "@/i18n/music/server";
import { requirePageUser } from "@/server/music/auth";
import { getCourseLesson } from "@/server/music/models/courses";
import { cn } from "@/lib/music/utils";
import { CourseNotFound } from "../../../../course-not-found";
import { LessonContent } from "../../../../lesson-content";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return { title: m.courses.lesson.title };
}

// One lesson of a published course: its video, text and links, the list of
// the lessons, and "Previous" and "Next".
export default async function LessonPage({
  params,
}: {
  params: Promise<{ id: string; lessonId: string }>;
}) {
  const { m } = await getI18n();

  return (
    // The detail pane of the list-detail layout is the `main` (`../../../layout.tsx`).
    <div className="flex flex-1 flex-col">
      {/* Reads the session cookie and the URL, so it renders at request time. */}
      <Suspense
        fallback={
          <>
            <PageHeader title={m.courses.lesson.title} />
            <p className="px-4 py-6 text-sm text-muted sm:px-6">{m.courses.page.loading}</p>
          </>
        }
      >
        <Lesson params={params} />
      </Suspense>
    </div>
  );
}

async function Lesson({ params }: { params: Promise<{ id: string; lessonId: string }> }) {
  const [{ id, lessonId }, { m, format }] = await Promise.all([
    params,
    getI18n(),
    requirePageUser(),
  ]);
  const found = await getCourseLesson(id, lessonId);
  if (!found) return <CourseNotFound lesson />;

  const { course, lesson } = found;
  const t = m.courses.lesson;
  const index = course.lessons.findIndex((item) => item.id === lesson.id);
  const previous = course.lessons[index - 1];
  const next = course.lessons[index + 1];

  return (
    <>
      <PageHeader
        title={lesson.title}
        details={format(t.position, {
          course: course.title,
          number: index + 1,
          count: course.lessons.length,
        })}
        back={{ href: `/munkater/kepzesek/${id}`, label: course.title }}
      />
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6 lg:flex-row lg:items-start">
        <article className="flex min-w-0 flex-1 flex-col gap-6" lang={course.language}>
          {!course.isPublished && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
              <EyeOffIcon className="mt-0.5 size-4 shrink-0" />
              {m.courses.course.hiddenNotice}
            </p>
          )}
          <LessonContent lesson={lesson} />

          <nav
            aria-label={t.navigation}
            className="flex flex-wrap justify-between gap-2 border-t pt-4"
          >
            {previous ? (
              <Link
                href={`/munkater/kepzesek/${id}/lessons/${previous.id}`}
                className={buttonVariants({ variant: "outline", className: "max-w-full" })}
              >
                <ArrowLeftIcon />
                <span className="truncate">{format(t.previous, { title: previous.title })}</span>
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link
                href={`/munkater/kepzesek/${id}/lessons/${next.id}`}
                className={buttonVariants({ className: "max-w-full" })}
              >
                <span className="truncate">{format(t.next, { title: next.title })}</span>
                <ArrowRightIcon />
              </Link>
            ) : (
              <Link
                href={`/munkater/kepzesek/${id}`}
                className={buttonVariants({ variant: "outline" })}
              >
                {t.finished}
              </Link>
            )}
          </nav>
        </article>

        <aside
          className="flex w-full shrink-0 flex-col gap-2 lg:sticky lg:top-24 lg:w-72"
          aria-labelledby="lesson-list"
        >
          <h2 id="lesson-list" className="font-heading text-sm font-semibold tracking-tight">
            {t.allLessons}
          </h2>
          <ol className="divide-y rounded-xl border">
            {course.lessons.map((item, itemIndex) => (
              <li key={item.id}>
                <Link
                  href={`/munkater/kepzesek/${id}/lessons/${item.id}`}
                  aria-current={item.id === lesson.id ? "page" : undefined}
                  className={cn(
                    "flex items-baseline gap-2 px-3 py-2 text-sm transition-colors outline-none hover:bg-muted/60 focus-visible:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset",
                    item.id === lesson.id && "bg-muted font-medium",
                  )}
                >
                  <span className="w-5 shrink-0 text-right text-xs text-muted tabular-nums">
                    {itemIndex + 1}.
                  </span>
                  <span className="min-w-0 flex-1">{item.title}</span>
                </Link>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </>
  );
}
