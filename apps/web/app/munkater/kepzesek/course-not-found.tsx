import Link from "next/link";
import { SearchXIcon } from "lucide-react";

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

/**
 * A course or a lesson that does not exist, is removed, or is not for the
 * user. The same text for all, so the page does not tell which courses exist.
 */
export async function CourseNotFound({ lesson = false }: { lesson?: boolean }) {
  const { m } = await getI18n();
  const t = lesson ? m.courses.lessonNotFound : m.courses.notFound;

  return (
    <>
      {/* In the detail pane of the courses, the header adds the back link to the list on small screens. */}
      <PageHeader title={m.courses.course.title} />
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchXIcon />
          </EmptyMedia>
          <EmptyTitle>{t.title}</EmptyTitle>
          <EmptyDescription>{t.description}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link href="/munkater/kepzesek" className={buttonVariants({ variant: "outline" })}>
            {m.courses.notFound.back}
          </Link>
        </EmptyContent>
      </Empty>
    </>
  );
}
