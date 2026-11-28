"use client";

import { useId, useRef, useState, useTransition } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { ImagePlusIcon, LoaderCircleIcon, ShapesIcon, XIcon } from "lucide-react";

import {
  DIALOG_BACKDROP_CLASS,
  DIALOG_POPUP_CLASS,
  DialogBody,
  DialogHeader,
} from "@/components/music/dialog-parts";
import { Button } from "@/components/music/ui/button";
import { Input } from "@/components/music/ui/input";
import { useI18n } from "@/i18n/music/client";
import {
  COURSE_ICONS,
  COURSE_IMAGE_MAX_SIDE_PX,
  type CourseCover,
  type CourseIcon,
} from "@/lib/music/courses";
import { ImageDecodeError, resizeImage } from "@/lib/music/image-resize";
import { matchesSearch } from "@/lib/music/search-text";
import { cn } from "@/lib/music/utils";
import { uploadCourseImageAction } from "./actions-client";
import { COURSE_ICON_COMPONENTS, CourseCoverView } from "./course-icons";

/** A Vercel Function accepts at most 4.5 MB in a request, with the other fields. */
const UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
const UPLOAD_QUALITIES = [0.85, 0.7, 0.55];

/**
 * The cover of a course in the editor: an icon from a list, or an image. One
 * of them: an icon clears the image, an image clears the icon. The upload
 * stores the image at once; the draft gets it with "Save draft".
 */
export function CourseCoverPicker({
  courseId,
  cover,
  onChange,
}: {
  courseId: string;
  cover: CourseCover;
  onChange: (cover: CourseCover) => void;
}) {
  const { m } = useI18n();
  const t = m.courses.editor.cover;
  const hintId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [iconsOpen, setIconsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, startUpload] = useTransition();

  function upload(file: File) {
    setError(null);
    startUpload(async () => {
      let blob: Blob;
      try {
        blob = (
          await resizeImage(file, {
            maxSide: COURSE_IMAGE_MAX_SIDE_PX,
            qualities: UPLOAD_QUALITIES,
            maxBytes: UPLOAD_MAX_BYTES,
          })
        ).blob;
      } catch (cause) {
        setError(cause instanceof ImageDecodeError ? t.imageDecodeFailed : t.imageTooLarge);
        return;
      }
      if (blob.size > UPLOAD_MAX_BYTES) {
        setError(t.imageTooLarge);
        return;
      }
      const formData = new FormData();
      formData.set("id", courseId);
      formData.set("image", blob, "cover.jpg");
      try {
        const result = await uploadCourseImageAction(formData);
        if (result.status === "success") onChange({ icon: null, imagePath: result.path });
        else setError(result.message);
      } catch {
        // The request failed, e.g. without a connection.
        setError(m.courses.actions.imageFailed);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm leading-none font-medium">{t.label}</span>
      <div className="flex flex-wrap items-center gap-3">
        <CourseCoverView cover={cover} className="size-20" />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIconsOpen(true)}
            aria-describedby={hintId}
          >
            <ShapesIcon />
            {t.chooseIcon}
          </Button>
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) upload(file);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => input.current?.click()}
            aria-describedby={hintId}
          >
            {uploading ? <LoaderCircleIcon className="animate-spin" /> : <ImagePlusIcon />}
            {uploading ? t.uploading : cover.imagePath ? t.replaceImage : t.uploadImage}
          </Button>
          {(cover.icon || cover.imagePath) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={uploading}
              onClick={() => onChange({ icon: null, imagePath: null })}
            >
              <XIcon />
              {t.remove}
            </Button>
          )}
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : (
        <p id={hintId} className="text-sm text-muted">
          {t.hint}
        </p>
      )}
      <IconDialog
        open={iconsOpen}
        onOpenChange={setIconsOpen}
        value={cover.icon}
        onChoose={(icon) => {
          onChange({ icon, imagePath: null });
          setIconsOpen(false);
        }}
      />
    </div>
  );
}

/** The icons in a grid, with a search by their names. */
function IconDialog({
  open,
  onOpenChange,
  value,
  onChoose,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: CourseIcon | null;
  onChoose: (icon: CourseIcon) => void;
}) {
  const { m } = useI18n();
  const t = m.courses.editor.cover;
  const searchId = useId();
  const [query, setQuery] = useState("");
  const icons = COURSE_ICONS.filter(
    (icon) =>
      query.trim() === "" ||
      matchesSearch(m.courses.icons[icon], query) ||
      matchesSearch(icon, query),
  );

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setQuery("");
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className={DIALOG_BACKDROP_CLASS} />
        <Dialog.Popup className={cn(DIALOG_POPUP_CLASS, "w-lg")}>
          <DialogHeader className="gap-4">
            <div className="flex items-start gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Dialog.Title className="font-heading text-lg font-semibold tracking-tight">
                  {t.iconsTitle}
                </Dialog.Title>
                <Dialog.Description className="text-sm text-muted">
                  {t.iconsDescription}
                </Dialog.Description>
              </div>
              <Dialog.Close
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={m.common.actions.close}
                  />
                }
              >
                <XIcon />
              </Dialog.Close>
            </div>
            <label htmlFor={searchId} className="sr-only">
              {t.searchIcons}
            </label>
            <Input
              id={searchId}
              type="search"
              placeholder={t.searchIcons}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </DialogHeader>
          <DialogBody>
            {icons.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">{t.noIcons}</p>
            ) : (
              <ul className="grid grid-cols-5 gap-2 sm:grid-cols-7">
                {icons.map((icon) => {
                  const Icon = COURSE_ICON_COMPONENTS[icon];
                  const selected = icon === value;
                  return (
                    <li key={icon}>
                      <button
                        type="button"
                        onClick={() => onChoose(icon)}
                        aria-label={m.courses.icons[icon]}
                        aria-pressed={selected}
                        title={m.courses.icons[icon]}
                        className={cn(
                          "flex aspect-square w-full items-center justify-center rounded-lg border outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                          selected && "border-primary bg-primary/10 text-primary",
                        )}
                      >
                        <Icon className="size-6" aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </DialogBody>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
