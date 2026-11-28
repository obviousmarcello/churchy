import { Suspense } from "react";

import { EventRowsSkeleton } from "@/components/music/loading-skeletons";
import { ListDetail, ListPaneHeader } from "@/components/music/list-detail";
import { getI18n } from "@/i18n/music/server";
import { requirePageUser } from "@/server/music/auth";
import { listCourses } from "@/server/music/models/courses";
import { CourseList } from "../course-list";

// The training courses in the list-detail layout: the list of the courses
// and the open course or lesson. The list stays while the user opens courses
// and lessons. The course editor is a full page (`../[id]/edit`).
export default async function CoursesListLayout({ children }: { children: React.ReactNode }) {
  const { m } = await getI18n();

  return (
    <ListDetail
      title={m.courses.page.title}
      rootHref="/munkater/kepzesek"
      size="wide"
      header={false}
      nav={
        // Reads the session cookie, so it renders at request time.
        <Suspense
          fallback={
            // `data-list-detail-nav`: small screens show only the list or the course, also while the list loads.
            <div data-list-detail-nav className="contents">
              <ListPaneHeader title={m.courses.page.title} />
              <EventRowsSkeleton label={m.courses.page.loading} count={4} />
            </div>
          }
        >
          <Courses />
        </Suspense>
      }
    >
      {children}
    </ListDetail>
  );
}

// The published courses that the user can see. Course admins also see the
// drafts, the hidden courses and the removed courses; a leader of groups
// those of the courses of their groups (see `src/server/models/courses.ts`).
async function Courses() {
  const user = await requirePageUser();
  const { courses, removed } = await listCourses();
  return (
    <CourseList
      courses={courses}
      removed={removed}
      canCreate={user.canEditCourses || user.leadsCourseGroups}
      canOrder={user.canEditCourses}
    />
  );
}
