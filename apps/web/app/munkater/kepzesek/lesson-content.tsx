"use client";

import { ExternalLinkIcon, FileTextIcon } from "lucide-react";

import { RichTextView } from "@/components/music/rich-text-view";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/music/ui/empty";
import { useI18n } from "@/i18n/music/client";
import type { LessonDoc } from "@/lib/music/courses";
import { defaultLinkName } from "@/lib/music/links";
import { isRichTextEmpty } from "@/lib/music/rich-text";
import { VideoPlayer } from "./video-player";

/** The video, the text and the links of a lesson: on the lesson page and in the preview of the editor. */
export function LessonContent({ lesson }: { lesson: LessonDoc }) {
  const { m } = useI18n();
  const t = m.courses.lesson;
  const hasText = !isRichTextEmpty(lesson.body);

  if (!lesson.videoUrl && !hasText && lesson.links.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileTextIcon />
          </EmptyMedia>
          <EmptyTitle>{t.emptyTitle}</EmptyTitle>
          <EmptyDescription>{t.emptyDescription}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {lesson.videoUrl && <VideoPlayer url={lesson.videoUrl} title={lesson.title} />}
      {hasText && <RichTextView doc={lesson.body} />}
      {lesson.links.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-base font-semibold tracking-tight">{t.links}</h2>
          <ul className="flex flex-col gap-1">
            {lesson.links.map((link, index) => (
              <li key={index}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-primary underline underline-offset-4"
                >
                  <ExternalLinkIcon className="size-4 shrink-0" />
                  {link.label ?? defaultLinkName(link.url)}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
