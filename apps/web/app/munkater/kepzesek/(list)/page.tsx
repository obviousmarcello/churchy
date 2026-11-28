import type { Metadata } from "next";
import { GraduationCapIcon } from "lucide-react";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/music/ui/empty";
import { getI18n } from "@/i18n/music/server";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return { title: m.courses.page.title };
}

// The root of the courses (`layout.tsx` has the list): small screens show
// only the list, large screens this place of the course until the user
// opens one.
export default async function CoursesPage() {
  const { m } = await getI18n();

  return (
    // `data-list-detail-choose`: hidden next to an empty list (see `globals.css`).
    <Empty data-list-detail-choose>
      {/* The list has the title of the page, but not as a heading (see `ListPaneHeader`). */}
      <h1 className="sr-only">{m.courses.page.title}</h1>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <GraduationCapIcon />
        </EmptyMedia>
        <EmptyTitle>{m.courses.list.choose.title}</EmptyTitle>
        <EmptyDescription>{m.courses.list.choose.description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
