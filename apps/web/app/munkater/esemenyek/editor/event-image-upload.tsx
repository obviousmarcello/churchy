"use client";

import { useRef, useState } from "react";
import { ImagePlusIcon, LoaderCircleIcon } from "lucide-react";

import { useModule } from "@/components/music/app-config";
import { useFileDropTarget, type FileKind } from "@/components/music/file-drop";
import { invalidatePageCache } from "@/components/music/page-cache";
import type { TextRow } from "@/components/music/setlist-rows";
import { Button } from "@/components/music/ui/button";
import { useI18n } from "@/i18n/music/client";
import { EVENT_ITEM_TITLE_MAX_LENGTH } from "@/lib/music/event-items";
import { ImageDecodeError, resizeImage } from "@/lib/music/image-resize";
import { changedPages } from "@/lib/music/page-keys";
import { openPdfPages, PdfOpenError, type DocumentPages } from "@/lib/music/pdf-pages";
import { openPptxSlides } from "@/lib/music/pptx-slides";
import { EVENT_IMAGES_MAX, IMAGE_NAME_MAX_LENGTH } from "@/lib/music/projection/images";
import { toastError } from "@/lib/music/toast";
import { addEventImageAction, createImageSetAction } from "./image-actions-client";

// The upload of image items, for the items form of an event: image files,
// PDF files and PowerPoint files (.pptx). Each file becomes an image item at
// the end of the items, with its name as the title: an image, the pages of a
// PDF file or the slides of a PowerPoint file, in their order. The browser
// draws each page, and uploads it as an image (see `pdf-pages.ts` and
// `pptx-slides.ts`). The files come from the button next to the field that
// adds the items, or from a drop anywhere on the page (see `FileDropArea`).
//
// The item gets a new set of images first, then the images go into the set.
// The items form saves the item as any other change. A set whose item is
// never saved goes some hours later (`removeUnusedEventImageSets`).

/** The longest side of an image that the browser makes smaller before the upload: a 4K screen. */
const UPLOAD_MAX_SIDE_PX = 3840;
/** A Vercel Function accepts at most 4.5 MB in a request, with the other fields. */
const UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
const UPLOAD_QUALITIES = [0.85, 0.7, 0.55];
/** The types that the server reads. A smaller file of these goes as it is, so a PNG keeps its transparency. */
const SERVER_TYPES = ["image/png", "image/jpeg", "image/webp"];
const PPTX_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const ACCEPT = `image/*,application/pdf,.pdf,${PPTX_TYPE},.pptx`;
const DROP_KINDS: readonly FileKind[] = ["image", "pdf", "pptx"];

/** The upload now: the set of the item, and the images of the item done and in all. `total` 0: the file opens. */
export type UploadProgress = { setId: string | null; done: number; total: number };

/** An image to upload: an image file, or a page of a PDF or PowerPoint file. */
type UploadJob = {
  /** The name of the new image, e.g. "Sermon (3/12)". */
  name: string;
  /** The name of the file in the upload. */
  fileName: string;
  /** The image file to send, or the message why there is none. */
  prepare: () => Promise<Blob | string>;
};

export type ImageItemUpload = {
  /** Adds the files as image items. Nothing while an upload runs. */
  upload: (files: File[]) => void;
  progress: UploadProgress | null;
  /** The problems of the last upload, one message for each file or page. */
  errors: string[];
  /** No more items or images fit. */
  full: boolean;
};

/**
 * The upload of image items. `addRow` adds an item to the form, or to the
 * event (a promise: false or the reason of the failure stops the upload of the file). `canAdd`:
 * room for one more item. `imageCount`: the images of the event now.
 * `dropTarget`: the part of the page that the page scrolls to after a drop.
 */
export function useImageItemUpload({
  eventId,
  imageCount,
  canAdd,
  addRow,
  dropTarget,
}: {
  eventId: string;
  imageCount: number;
  canAdd: () => boolean;
  addRow: (row: TextRow) => void | Promise<boolean | string>;
  dropTarget: React.RefObject<HTMLElement | null>;
}): ImageItemUpload {
  const i18n = useI18n();
  const { m, format, plural } = i18n;
  const t = m.events.images;
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const full = imageCount >= EVENT_IMAGES_MAX || !canAdd();
  // No drop of images while the module "projection.images" is off: the callers also hide the button.
  const imagesOn = useModule("projection.images");

  useFileDropTarget(
    !imagesOn || progress || full
      ? null
      : {
          id: "image-items",
          label: t.dropLabel,
          kinds: DROP_KINDS,
          primary: true,
          element: dropTarget,
          onFiles: upload,
        },
  );

  function upload(files: File[]) {
    if (progress || files.length === 0) return;
    void uploadFiles(files);
  }

  async function uploadFiles(files: File[]) {
    setErrors([]);
    setProgress({ setId: null, done: 0, total: 0 });
    invalidatePageCache(changedPages.event(eventId));
    const problems: string[] = [];
    let images = imageCount;
    try {
      for (const file of files) {
        if (!canAdd()) {
          problems.push(format(t.fileFailed, { name: file.name, message: t.itemsFull }));
          continue;
        }
        if (images >= EVENT_IMAGES_MAX) {
          problems.push(
            format(t.fileFailed, {
              name: file.name,
              message: format(t.tooMany, { max: EVENT_IMAGES_MAX }),
            }),
          );
          continue;
        }
        setProgress({ setId: null, done: 0, total: 0 });
        const added = await uploadFile(file, EVENT_IMAGES_MAX - images, problems);
        images += added;
      }
    } finally {
      setProgress(null);
      setErrors(problems);
      if (problems.length > 0) toastError(plural(t.uploadProblems, problems.length));
    }
  }

  const uploader = setUploader({ eventId, i18n, setProgress });

  /** Adds the file as an image item, with at most `room` images. Returns the images that were added. */
  function uploadFile(file: File, room: number, problems: string[]): Promise<number> {
    return uploader(file, room, problems, async (setId, name) => {
      const added = await addRow({
        kind: "text",
        key: crypto.randomUUID(),
        title:
          Array.from(name || file.name)
            .slice(0, EVENT_ITEM_TITLE_MAX_LENGTH)
            .join("")
            .trim() || t.untitled,
        notes: "",
        scripture: false,
        scriptureTranslation: null,
        imageSetId: setId,
        volunteerId: null,
      });
      return added ?? true;
    });
  }

  return { upload, progress, errors, full };
}

/**
 * What happens with the new set of a file, before its images: false, or the
 * reason of the failure, stops the upload. `name`: the name of the file without its extension.
 */
type OnSet = (setId: string, name: string) => Promise<boolean | string>;

/**
 * The upload of one file into a new set of images of the event: an image, or
 * the pages of a PDF or PowerPoint file. For the image items and for the
 * attachments of the announcements.
 */
function setUploader({
  eventId,
  i18n,
  setProgress,
}: {
  eventId: string;
  i18n: ReturnType<typeof useI18n>;
  setProgress: (progress: UploadProgress) => void;
}) {
  const { m, format } = i18n;
  const t = m.events.images;

  /** Uploads the file into a new set, with at most `room` images. Returns the images that were added. */
  async function uploadFile(
    file: File,
    room: number,
    problems: string[],
    onSet: OnSet,
  ): Promise<number> {
    const kind = documentKind(file);
    const name = imageName(file.name);
    let pages: DocumentPages | null = null;
    if (kind) {
      try {
        pages = kind === "pdf" ? await openPdfPages(file) : await openPptxSlides(file);
      } catch (cause) {
        const message =
          kind === "pptx"
            ? t.pptxFailed
            : cause instanceof PdfOpenError && cause.password
              ? t.pdfPassword
              : t.pdfFailed;
        problems.push(format(t.fileFailed, { name: file.name, message }));
        return 0;
      }
    }
    try {
      const jobs: UploadJob[] = pages
        ? Array.from({ length: pages.count }, (_, index) => {
            const page = index + 1;
            const file = pages!;
            return {
              name: file.count > 1 ? pageName(name, page, file.count) : name,
              fileName: `${name}-${page}.jpg`,
              prepare: () =>
                preparePage(file, page, kind === "pdf" ? t.pdfPageFailed : t.pptxSlideFailed),
            };
          })
        : [{ name, fileName: file.name, prepare: () => prepareImage(file) }];
      if (jobs.length === 0) {
        problems.push(format(t.fileFailed, { name: file.name, message: t.noPages }));
        return 0;
      }

      let setId: string;
      try {
        const result = await createImageSetAction(eventId);
        if (result.status === "error") {
          problems.push(format(t.fileFailed, { name: file.name, message: result.message }));
          return 0;
        }
        setId = result.setId;
      } catch {
        problems.push(format(t.fileFailed, { name: file.name, message: t.uploadFailed }));
        return 0;
      }
      const placed = await onSet(setId, name);
      if (placed !== true) {
        problems.push(
          format(t.fileFailed, {
            name: file.name,
            message: typeof placed === "string" ? placed : t.uploadFailed,
          }),
        );
        return 0;
      }

      const accepted = jobs.slice(0, Math.max(0, room));
      if (jobs.length > accepted.length)
        problems.push(format(t.tooManySkipped, { count: accepted.length, max: EVENT_IMAGES_MAX }));
      let added = 0;
      for (const [index, job] of accepted.entries()) {
        setProgress({ setId, done: index, total: accepted.length });
        const problem = await uploadJob(setId, job);
        if (problem) problems.push(format(t.fileFailed, { name: job.name, message: problem }));
        else added++;
      }
      return added;
    } finally {
      await pages?.close();
    }
  }

  /** E.g. "Sermon (3/12)". A long name is cut, so the number of the page or slide stays. */
  function pageName(name: string, page: number, pages: number): string {
    const space =
      IMAGE_NAME_MAX_LENGTH - Array.from(format(t.pdfPageName, { name: "", page, pages })).length;
    return format(t.pdfPageName, {
      name: Array.from(name).slice(0, space).join("").trim(),
      page,
      pages,
    }).trim();
  }

  /** The image file to send: the file itself, or a smaller copy. */
  async function prepareImage(file: File): Promise<Blob | string> {
    if (SERVER_TYPES.includes(file.type) && file.size <= UPLOAD_MAX_BYTES) return file;
    try {
      const { blob } = await resizeImage(file, {
        maxSide: UPLOAD_MAX_SIDE_PX,
        qualities: UPLOAD_QUALITIES,
        maxBytes: UPLOAD_MAX_BYTES,
      });
      return blob.size <= UPLOAD_MAX_BYTES ? blob : t.tooLarge;
    } catch (cause) {
      return cause instanceof ImageDecodeError ? t.decodeFailed : t.tooLarge;
    }
  }

  /** A page of a PDF file or a slide of a PowerPoint file as an image. `failed`: the message when it cannot be drawn. */
  async function preparePage(
    pages: DocumentPages,
    page: number,
    failed: string,
  ): Promise<Blob | string> {
    try {
      const blob = await pages.render(page, {
        maxSide: UPLOAD_MAX_SIDE_PX,
        qualities: UPLOAD_QUALITIES,
        maxBytes: UPLOAD_MAX_BYTES,
      });
      return blob.size <= UPLOAD_MAX_BYTES ? blob : t.tooLarge;
    } catch {
      return failed;
    }
  }

  /** Null after a success, else the message. */
  async function uploadJob(setId: string, job: UploadJob): Promise<string | null> {
    const blob = await job.prepare();
    if (typeof blob === "string") return blob;
    const formData = new FormData();
    formData.set("id", setId);
    formData.set("image", blob, job.fileName);
    formData.set("name", job.name);
    try {
      const result = await addEventImageAction(formData);
      return result.status === "error" ? result.message : null;
    } catch {
      // The request failed, e.g. without a connection.
      return t.uploadFailed;
    }
  }

  return uploadFile;
}

export type AttachmentUpload = {
  /** Uploads the file into a new set; `onSet` gives the set to its entry. Nothing while an upload runs. */
  upload: (file: File, onSet: OnSet) => void;
  progress: UploadProgress | null;
  /** The problems of the last upload, one message for each page. */
  errors: string[];
};

/**
 * The upload of the attachment of an announcement: an image, or the pages of
 * a PDF or PowerPoint file, into a new set of the event. `imageCount`: the
 * images of the event now.
 */
export function useAttachmentUpload(eventId: string, imageCount: number): AttachmentUpload {
  const i18n = useI18n();
  const { m, format, plural } = i18n;
  const t = m.events.images;
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const uploader = setUploader({ eventId, i18n, setProgress });

  function upload(file: File, onSet: OnSet) {
    if (progress) return;
    void (async () => {
      setErrors([]);
      setProgress({ setId: null, done: 0, total: 0 });
      invalidatePageCache(changedPages.event(eventId));
      const problems: string[] = [];
      try {
        if (imageCount >= EVENT_IMAGES_MAX) {
          problems.push(
            format(t.fileFailed, {
              name: file.name,
              message: format(t.tooMany, { max: EVENT_IMAGES_MAX }),
            }),
          );
        } else {
          await uploader(file, EVENT_IMAGES_MAX - imageCount, problems, onSet);
        }
      } finally {
        setProgress(null);
        setErrors(problems);
        if (problems.length > 0) toastError(plural(t.uploadProblems, problems.length));
      }
    })();
  }

  return { upload, progress, errors };
}

/** A button that chooses one file for an attachment: an image, a PDF file or a PowerPoint file. */
export function AttachmentUploadButton({
  label,
  upload,
  onFile,
}: {
  label: string;
  upload: AttachmentUpload;
  onFile: (file: File) => void;
}) {
  const { m, format } = useI18n();
  const t = m.events.images;
  const input = useRef<HTMLInputElement>(null);
  const { progress } = upload;
  const busy = progress
    ? progress.total === 0
      ? t.preparing
      : format(t.uploading, { done: progress.done + 1, total: progress.total })
    : null;

  return (
    <>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onFile(file);
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={progress !== null}
        onClick={() => input.current?.click()}
      >
        {progress ? <LoaderCircleIcon aria-hidden className="animate-spin" /> : <ImagePlusIcon />}
        {busy ?? label}
      </Button>
    </>
  );
}

/** The button that chooses files to add as image items, next to the field that adds the items. */
export function ImageUploadButton({ upload }: { upload: ImageItemUpload }) {
  const { m, format } = useI18n();
  const t = m.events.images;
  const input = useRef<HTMLInputElement>(null);
  const { progress } = upload;
  const label = progress
    ? progress.total === 0
      ? t.preparing
      : format(t.uploading, { done: progress.done + 1, total: progress.total })
    : upload.full
      ? t.full
      : t.add;

  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          upload.upload(files);
        }}
      />
      <Button
        type="button"
        variant="outline"
        disabled={progress !== null || upload.full}
        onClick={() => input.current?.click()}
        aria-label={label}
        title={label}
        className="shrink-0"
      >
        {progress ? <LoaderCircleIcon aria-hidden className="animate-spin" /> : <ImagePlusIcon />}
        {progress && progress.total > 0 && (
          <span className="tabular-nums">
            {progress.done + 1}/{progress.total}
          </span>
        )}
      </Button>
    </>
  );
}

/** The name of the file without its extension, e.g. "Announcements" for "Announcements.png", at most `IMAGE_NAME_MAX_LENGTH`. */
function imageName(fileName: string): string {
  const name = fileName.replace(/\.[a-z0-9]{1,5}$/i, "").trim();
  return Array.from(name).slice(0, IMAGE_NAME_MAX_LENGTH).join("").trim();
}

/** A file with pages: a PDF file or a PowerPoint file. Null for an image. */
function documentKind(file: File): "pdf" | "pptx" | null {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) return "pdf";
  if (file.type === PPTX_TYPE || /\.pptx$/i.test(file.name)) return "pptx";
  return null;
}
