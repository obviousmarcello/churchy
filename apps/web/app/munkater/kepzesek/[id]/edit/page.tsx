import type { Metadata } from "next";
import { Suspense } from "react";
import { LockIcon } from "lucide-react";

import { PageHeader } from "@/components/music/page-header";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/music/ui/empty";
import { getI18n } from "@/i18n/music/server";
import { requirePageUser } from "@/server/music/auth";
import { getCourseEditor } from "@/server/music/models/courses";
import { CourseEditor } from "../../course-editor";
import { CourseNotFound } from "../../course-not-found";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return { title: m.courses.editor.title };
}

// The editor of a course, for course admins and superadmins.
export default async function CourseEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { m } = await getI18n();

  return (
    <main className="flex flex-1 flex-col">
      {/* Reads the session cookie and the URL, so it renders at request time. */}
      <Suspense
        fallback={
          <>
            <PageHeader
              title={m.courses.editor.title}
              back={{ href: "/munkater/kepzesek", label: m.common.nav.courses }}
            />
            <p className="px-4 py-6 text-sm text-muted sm:px-6">{m.courses.page.loading}</p>
          </>
        }
      >
        <Editor params={params} />
      </Suspense>
    </main>
  );
}

// The gate only hides the page. The model functions check the rights again: a leader changes only the courses of their groups.
async function Editor({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user, { m }] = await Promise.all([params, requirePageUser(), getI18n()]);

  if (!user.canEditCourses && !user.leadsCourseGroups) {
    return (
      <>
        <PageHeader
          title={m.courses.editor.title}
          back={{ href: "/munkater/kepzesek", label: m.common.nav.courses }}
        />
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LockIcon />
            </EmptyMedia>
            <EmptyTitle>{m.courses.gate.title}</EmptyTitle>
            <EmptyDescription>{m.courses.gate.description}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </>
    );
  }

  const course = await getCourseEditor(id);
  if (!course) return <CourseNotFound />;
  return <CourseEditor course={course} />;
}
