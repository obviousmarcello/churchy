"use client";

import { useI18n } from "@/i18n/music/client";
import type { CourseLanguage } from "@/lib/music/courses";
import { cn } from "@/lib/music/utils";

/**
 * The small labels of a course: its language, its groups (or "Course admins only"), the
 * number of lessons and, for course admins, its state.
 */
export function CourseLabels({
  course,
  admin,
}: {
  course: {
    language: CourseLanguage;
    areas: string[];
    lessonCount?: number;
    isPublished: boolean;
    wasPublished?: boolean;
    hasChanges?: boolean;
  };
  admin: boolean;
}) {
  const { m, plural } = useI18n();
  const t = m.courses.labels;

  return (
    <span className="flex flex-wrap gap-1.5">
      {admin && course.wasPublished === false && <Label tone="warning">{t.draft}</Label>}
      {admin && course.wasPublished !== false && !course.isPublished && (
        <Label tone="warning">{t.hidden}</Label>
      )}
      {admin && course.hasChanges && <Label tone="info">{t.hasChanges}</Label>}
      <Label>{m.courses.languages[course.language]}</Label>
      {course.areas.length === 0 ? (
        <Label>{t.noGroup}</Label>
      ) : (
        course.areas.map((area) => <Label key={area}>{area}</Label>)
      )}
      {course.lessonCount !== undefined && (
        <Label>{plural(t.lessonCount, course.lessonCount)}</Label>
      )}
    </span>
  );
}

function Label({ tone, children }: { tone?: "warning" | "info"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "rounded-md border px-1.5 py-0.5 text-xs text-muted",
        tone === "warning" &&
          "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300",
        tone === "info" && "border-primary/30 bg-primary/10 text-primary",
      )}
    >
      {children}
    </span>
  );
}
