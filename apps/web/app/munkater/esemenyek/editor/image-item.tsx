"use client";

import { useActionState, useState, useTransition } from "react";
import { Dialog } from "@base-ui/react/dialog";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ImagesIcon,
  LoaderCircleIcon,
  SlidersHorizontalIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";

import {
  DIALOG_BACKDROP_CLASS,
  DIALOG_POPUP_CLASS,
  DialogBody,
  DialogHeader,
} from "@/components/music/dialog-parts";
import { ConfirmDialog, ConfirmDialogTrigger } from "@/components/music/form-parts";
import { invalidatePageCache } from "@/components/music/page-cache";
import { Button } from "@/components/music/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/music/ui/empty";
import { useI18n } from "@/i18n/music/client";
import { changedPages } from "@/lib/music/page-keys";
import type { EventImageDTO } from "@/lib/music/projection/images";
import type { ProjectionLook } from "@/lib/music/projection/themes";
import { cn } from "@/lib/music/utils";
import { ImageAdjustDialog } from "@/app/munkater/vetites/image-adjust-dialog";
import { projectionFontVariables } from "@/app/munkater/vetites/projection-fonts";
import { SlideView } from "@/app/munkater/vetites/slide-view";
import { moveEventImagesAction, removeEventImageAction } from "./image-actions-client";
import type { UploadProgress } from "./event-image-upload";

// The images of an image item of an event (see `event-images.ts`): small
// slides under the title of the item, in the look of the event. The event
// admins open all images of the item in a dialog, to adjust, move and remove
// them; each change saves at once.

/** The shape of the previews: the usual shape of a projector. */
const PREVIEW_ASPECT_RATIO = 16 / 9;
/** The most images in the row of an item. The dialog shows all. */
const STRIP_MAX = 6;

type RemoveState = { status: "idle" | "success" | "error"; message: string | null };

/** The first images of an item as small slides, and the number of the others. */
export function ImageStrip({
  images,
  look,
  className,
}: {
  images: EventImageDTO[];
  look: ProjectionLook;
  className?: string;
}) {
  const { m, plural, format } = useI18n();
  const t = m.events.images;
  if (images.length === 0)
    return <p className={cn("text-sm text-muted", className)}>{t.noImagesYet}</p>;
  const more = images.length - STRIP_MAX;

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", projectionFontVariables, className)}>
      <ul aria-label={plural(t.imageCount, images.length)} className="flex flex-wrap gap-1.5">
        {images.slice(0, STRIP_MAX).map((image) => (
          <li
            key={image.id}
            title={image.name}
            className="relative w-20 overflow-hidden rounded-sm border bg-black"
            style={{ aspectRatio: PREVIEW_ASPECT_RATIO }}
          >
            <SlideView slide={imageSlide(image)} look={look} />
            <span className="sr-only">{image.name}</span>
          </li>
        ))}
      </ul>
      {more > 0 && (
        <span className="text-xs text-muted">{format(t.moreImages, { count: more })}</span>
      )}
    </div>
  );
}

/** For the event admins: the images of an image item, and the dialog with all of them. */
export function ImageItemImages({
  eventId,
  setId,
  title,
  images,
  look,
  progress,
}: {
  eventId: string;
  /** The set of the images of the item. */
  setId: string;
  /** The title of the item. */
  title: string;
  images: EventImageDTO[];
  look: ProjectionLook;
  /** The upload of the images of this item, while it runs. */
  progress: UploadProgress | null;
}) {
  const { m, format } = useI18n();
  const t = m.events.images;
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2 pl-6">
      {images.length > 0 || !progress ? <ImageStrip images={images} look={look} /> : null}
      <div className="flex flex-wrap items-center gap-2">
        {progress && (
          <span role="status" className="flex items-center gap-1.5 text-sm text-muted">
            <LoaderCircleIcon aria-hidden className="size-4 animate-spin" />
            {progress.total === 0
              ? t.preparing
              : format(t.uploading, { done: progress.done + 1, total: progress.total })}
          </span>
        )}
        {images.length > 0 && (
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
            <ImagesIcon />
            {t.edit}
          </Button>
        )}
      </div>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className={DIALOG_BACKDROP_CLASS} />
          <Dialog.Popup className={cn(DIALOG_POPUP_CLASS, "w-4xl")}>
            <DialogHeader className="flex-row items-start">
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Dialog.Title className="font-heading text-lg font-semibold tracking-tight break-words">
                  {title}
                </Dialog.Title>
                <Dialog.Description className="text-sm text-muted">
                  {t.editDescription}
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
            </DialogHeader>
            <DialogBody>
              <ImageGrid eventId={eventId} setId={setId} images={images} look={look} />
            </DialogBody>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

/** All images of an item: adjust, move and remove each. */
function ImageGrid({
  eventId,
  setId,
  images,
  look,
}: {
  eventId: string;
  setId: string;
  images: EventImageDTO[];
  look: ProjectionLook;
}) {
  const { m, format } = useI18n();
  const t = m.events.images;
  const [error, setError] = useState<string | null>(null);
  const [moving, startMove] = useTransition();
  const [adjusting, setAdjusting] = useState<EventImageDTO | null>(null);

  function move(index: number, offset: -1 | 1) {
    const ids = images.map((image) => image.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + offset, 0, moved!);
    setError(null);
    startMove(async () => {
      invalidatePageCache(changedPages.event(eventId));
      try {
        const result = await moveEventImagesAction(setId, ids);
        if (result.status === "error") setError(result.message);
      } catch {
        setError(t.moveFailed);
      }
    });
  }

  if (images.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ImagesIcon />
          </EmptyMedia>
          <EmptyTitle>{t.emptyTitle}</EmptyTitle>
          <EmptyDescription>{t.emptyDescription}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <ol
        className={cn(
          "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3",
          projectionFontVariables,
        )}
      >
        {images.map((image, index) => (
          <li key={image.id} className="flex min-w-0 flex-col gap-2 rounded-lg border p-2">
            <div
              className="relative w-full overflow-hidden rounded-md bg-black"
              style={{ aspectRatio: PREVIEW_ASPECT_RATIO }}
            >
              <SlideView slide={imageSlide(image)} look={look} />
            </div>
            <div className="flex items-center gap-1">
              <span className="w-5 shrink-0 text-right text-xs text-muted tabular-nums">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium" title={image.name}>
                {image.name}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={moving || index === 0}
                onClick={() => move(index, -1)}
                aria-label={format(t.moveBack, { name: image.name })}
                title={format(t.moveBack, { name: image.name })}
              >
                <ArrowLeftIcon />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={moving || index === images.length - 1}
                onClick={() => move(index, 1)}
                aria-label={format(t.moveOn, { name: image.name })}
                title={format(t.moveOn, { name: image.name })}
              >
                <ArrowRightIcon />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={moving}
                onClick={() => setAdjusting(image)}
                aria-label={format(m.project.images.adjustOf, { name: image.name })}
                title={m.project.images.adjust}
              >
                <SlidersHorizontalIcon />
              </Button>
              <RemoveImageButton eventId={eventId} image={image} disabled={moving} />
            </div>
          </li>
        ))}
      </ol>
      {adjusting && (
        <ImageAdjustDialog
          image={adjusting}
          look={look}
          aspectRatio={null}
          open
          onOpenChange={(open) => !open && setAdjusting(null)}
          onSaved={() => invalidatePageCache(changedPages.event(eventId))}
        />
      )}
    </>
  );
}

function RemoveImageButton({
  eventId,
  image,
  disabled,
}: {
  eventId: string;
  image: EventImageDTO;
  disabled: boolean;
}) {
  const { m, format } = useI18n();
  const t = m.events.images;
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (_previous: RemoveState, formData: FormData): Promise<RemoveState> => {
      invalidatePageCache(changedPages.event(eventId));
      try {
        const result = await removeEventImageAction(String(formData.get("id")));
        if (result.status === "error") return { status: "error", message: result.message };
      } catch {
        return { status: "error", message: t.removeFailed };
      }
      setOpen(false);
      return { status: "success", message: null };
    },
    IDLE,
  );

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <ConfirmDialogTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={disabled}
              aria-label={format(t.remove, { name: image.name })}
              title={format(t.remove, { name: image.name })}
            />
          }
        >
          <Trash2Icon />
        </ConfirmDialogTrigger>
      }
      title={t.removeTitle}
      description={format(t.removeDescription, { name: image.name })}
      id={image.id}
      formAction={formAction}
      state={state}
      pending={pending}
      confirmLabel={t.removeConfirm}
      pendingLabel={t.removing}
    />
  );
}

const IDLE: RemoveState = { status: "idle", message: null };

function imageSlide(image: EventImageDTO) {
  return {
    kind: "image",
    url: image.url,
    width: image.width,
    height: image.height,
    adjust: image.adjust,
  } as const;
}
