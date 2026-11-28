"use client";

import { useId } from "react";
import { CheckCircle2Icon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";

import { Field } from "@/components/music/form-field";
import { Button } from "@/components/music/ui/button";
import { Input } from "@/components/music/ui/input";
import { useI18n } from "@/i18n/music/client";
import {
  LESSON_LINKS_MAX,
  LESSON_TITLE_MAX_LENGTH,
  LINK_LABEL_MAX_LENGTH,
  type LessonDoc,
} from "@/lib/music/courses";
import { parseYoutubeVideo } from "@/lib/music/youtube";
import { RichTextEditor } from "./rich-text-editor";

/**
 * The fields of one lesson: the title, the YouTube video, the text and the
 * links. `errors(field)` gives the messages of the server for a field, e.g.
 * `videoUrl` or `links.0.url`.
 */
export function LessonEditor({
  lesson,
  textKey,
  onChange,
  onRemove,
  errors,
  disabled,
}: {
  lesson: LessonDoc;
  /** A new key loads the text again, e.g. after "Discard changes". */
  textKey: string;
  onChange: (lesson: LessonDoc) => void;
  onRemove: () => void;
  errors: (field: string) => string[] | undefined;
  disabled: boolean;
}) {
  const { m, format } = useI18n();
  const t = m.courses.editor.lesson;
  const id = useId();
  const videoUrl = lesson.videoUrl ?? "";
  const video = videoUrl.trim() === "" ? null : parseYoutubeVideo(videoUrl);
  const videoErrors =
    errors("videoUrl") ??
    (videoUrl.trim() !== "" && !video ? [m.server.courses.videoUrl] : undefined);

  function setLink(index: number, link: Partial<LessonDoc["links"][number]>) {
    onChange({
      ...lesson,
      links: lesson.links.map((current, i) => (i === index ? { ...current, ...link } : current)),
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <Field name={`${id}-title`} label={t.title} errors={errors("title")}>
        <Input
          id={`${id}-title`}
          required
          maxLength={LESSON_TITLE_MAX_LENGTH}
          value={lesson.title}
          onChange={(event) => onChange({ ...lesson, title: event.target.value })}
          aria-invalid={errors("title") !== undefined || undefined}
          aria-describedby={`${id}-title-description`}
        />
      </Field>

      <div className="flex flex-col gap-2">
        <Field name={`${id}-video`} label={t.video} hint={t.videoHint} errors={videoErrors}>
          <Input
            id={`${id}-video`}
            type="url"
            inputMode="url"
            placeholder="https://www.youtube.com/watch?v=…"
            value={videoUrl}
            onChange={(event) =>
              onChange({
                ...lesson,
                videoUrl: event.target.value === "" ? null : event.target.value,
              })
            }
            aria-invalid={videoErrors !== undefined || undefined}
            aria-describedby={`${id}-video-description`}
          />
        </Field>
        {video && (
          <p className="flex items-center gap-1.5 text-sm text-muted">
            <CheckCircle2Icon className="size-4 text-primary" />
            {video.start > 0
              ? format(t.videoFoundAt, { time: clockTime(video.start) })
              : t.videoFound}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span id={`${id}-text-label`} className="text-sm leading-none font-medium select-none">
          {t.text}
        </span>
        <RichTextEditor
          key={textKey}
          value={lesson.body}
          onChange={(body) => onChange({ ...lesson, body })}
          labelId={`${id}-text-label`}
          describedBy={errors("body") ? `${id}-text-errors` : undefined}
          invalid={errors("body") !== undefined}
        />
        {errors("body") && (
          <p id={`${id}-text-errors`} className="text-sm text-destructive">
            {errors("body")!.join(" ")}
          </p>
        )}
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm leading-none font-medium">{t.links}</legend>
        {lesson.links.length === 0 ? (
          <p className="text-sm text-muted">{t.noLinks}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {lesson.links.map((link, index) => {
              const urlErrors = errors(`links.${index}.url`);
              const labelErrors = errors(`links.${index}.label`);
              return (
                <li
                  key={index}
                  className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-start"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <label htmlFor={`${id}-link-${index}-url`} className="sr-only">
                      {format(t.linkUrl, { number: index + 1 })}
                    </label>
                    <Input
                      id={`${id}-link-${index}-url`}
                      type="url"
                      inputMode="url"
                      placeholder="https://"
                      value={link.url}
                      onChange={(event) => setLink(index, { url: event.target.value })}
                      aria-invalid={urlErrors !== undefined || undefined}
                    />
                    {urlErrors && <p className="text-sm text-destructive">{urlErrors.join(" ")}</p>}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <label htmlFor={`${id}-link-${index}-label`} className="sr-only">
                      {format(t.linkLabel, { number: index + 1 })}
                    </label>
                    <Input
                      id={`${id}-link-${index}-label`}
                      maxLength={LINK_LABEL_MAX_LENGTH}
                      placeholder={t.linkLabelPlaceholder}
                      value={link.label ?? ""}
                      onChange={(event) =>
                        setLink(index, {
                          label: event.target.value === "" ? null : event.target.value,
                        })
                      }
                      aria-invalid={labelErrors !== undefined || undefined}
                    />
                    {labelErrors && (
                      <p className="text-sm text-destructive">{labelErrors.join(" ")}</p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="self-end sm:self-start"
                    aria-label={format(t.removeLink, { number: index + 1 })}
                    onClick={() =>
                      onChange({ ...lesson, links: lesson.links.filter((_, i) => i !== index) })
                    }
                  >
                    <XIcon />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          disabled={lesson.links.length >= LESSON_LINKS_MAX}
          onClick={() =>
            onChange({ ...lesson, links: [...lesson.links, { label: null, url: "" }] })
          }
        >
          <PlusIcon />
          {t.addLink}
        </Button>
        {errors("links") && (
          <p className="text-sm text-destructive">{errors("links")!.join(" ")}</p>
        )}
      </fieldset>

      <div className="border-t pt-4">
        <Button
          type="button"
          variant="ghost"
          className="text-destructive"
          onClick={onRemove}
          disabled={disabled}
        >
          <Trash2Icon />
          {t.remove}
        </Button>
      </div>
    </div>
  );
}

/** Seconds as "1:05" or "1:02:05". */
function clockTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const min = Math.floor((seconds % 3600) / 60);
  const sec = String(seconds % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(min).padStart(2, "0")}:${sec}` : `${min}:${sec}`;
}
