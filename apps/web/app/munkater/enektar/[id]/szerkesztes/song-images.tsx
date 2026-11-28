"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  ExternalLinkIcon,
  ImageIcon,
  ImagePlusIcon,
  LoaderCircleIcon,
  PencilIcon,
  Trash2Icon,
  TriangleAlertIcon,
  Undo2Icon,
  XIcon,
} from "lucide-react";

import { useAttachmentDetails } from "@/components/music/attachment-details";
import { AttachmentFields } from "@/components/music/attachment-fields";
import { DROP_SELECTED, useDropZone, useFileDropTarget } from "@/components/music/file-drop";
import { FieldMessage } from "@/components/music/form-field";
import {
  ImageChooserButtons,
  PAGES_BOX,
  useImageChooser,
  useObjectUrls,
} from "@/components/music/image-chooser";
import { ImagePreview } from "@/components/music/image-viewer";
import { ConfirmDialog, ConfirmDialogTrigger, FormSection } from "@/components/music/form-parts";
import { KeptPanel, SaveStatus, useKeptPanel, usePageSaveForm } from "@/components/music/page-save";
import { invalidatePageCache, invalidating } from "@/components/music/page-cache";
import {
  PreviewEmpty,
  PreviewLayout,
  PreviewPages,
  PreviewSection,
  previewButtonClass,
} from "@/components/music/preview-layout";
import { Button, buttonVariants } from "@/components/music/ui/button";
import { useI18n } from "@/i18n/music/client";
import { rich } from "@/i18n/music/rich";
import { ImageDecodeError, resizeImage } from "@/lib/music/image-resize";
import { imageHref } from "@/lib/music/next-path";
import { changedPages } from "@/lib/music/page-keys";
import { cn } from "@/lib/music/utils";
import { ModuleGate } from "@/components/music/app-config";
import { ReadChartDialog } from "../../read-chart-dialog";
import type { ChartHandle } from "../../song-form";
import type { FormState } from "@/server/music/form-state";
import type { SongImageDTO, SongImagePageDTO } from "@/server/music/models/images";
import {
  addImageAction,
  addImagePageAction,
  moveImagePagesAction,
  removeImageAction,
  removeImagePageAction,
  showImagePagesAction,
  updateImageAction,
} from "./file-actions-client";
import { useAttachmentForm } from "./use-attachment-form";

const initialState: FormState = { status: "idle", message: null, fieldErrors: {} };

type Arrangement = { id: string; name: string };

type Limits = {
  /** The most images of a song. */
  maxImages: number;
  /** The most pages of an image. */
  maxPages: number;
  /** The largest upload of one page, in bytes, after the browser made it smaller. */
  maxBytes: number;
  /** The longest side of a stored page, in pixels. The browser makes larger photos smaller. */
  maxSide: number;
  nameMaxLength: number;
};

/**
 * The images of a song: add them (from files, or on a phone with the camera),
 * edit them (name, arrangements, keys and pages) and remove them. Only for
 * song admins and superadmins.
 */
export function SongImages({
  songId,
  images,
  arrangements,
  limits,
  chart,
}: {
  songId: string;
  images: SongImageDTO[];
  /** The arrangements of the song, that an image can be for. */
  arrangements: Arrangement[];
  limits: Limits;
  /** The chart field of the song form, where "Read text" puts the chart of an image. */
  chart: ChartHandle;
}) {
  const { m, format } = useI18n();
  const t = m.songs.images;
  // One image at a time shows its edit form.
  const [editing, setEditing] = useState<string | null>(null);
  // The image in the preview: the first one, until the user chooses one.
  const [previewId, setPreviewId] = useState<string | null>(null);
  const previewed = images.find((image) => image.id === previewId) ?? images[0] ?? null;
  // The image of the add form, while some of its pages are not uploaded yet.
  const [addingId, setAddingId] = useState<string | null>(null);
  // Without that image: the add form stays until its upload ends.
  const full = images.filter((image) => image.id !== addingId).length >= limits.maxImages;

  return (
    <PreviewLayout
      lazy
      preview={
        <PreviewSection title={m.songs.form.preview} hint={previewed?.name}>
          {previewed ? (
            <PreviewPages>
              <ImagePreview pages={previewed.pages} />
            </PreviewPages>
          ) : (
            <PreviewEmpty
              icon={<ImageIcon aria-hidden />}
              title={t.previewEmptyTitle}
              description={t.previewEmptyDescription}
            />
          )}
        </PreviewSection>
      }
    >
      <FormSection title={t.title} description={t.description}>
        {images.length === 0 ? (
          <div className="flex flex-col items-center gap-1 rounded-card border border-dashed px-4 py-6 text-center">
            <ImageIcon aria-hidden className="mb-1 size-5 text-muted" />
            <p className="text-sm font-medium">{t.emptyTitle}</p>
            <p className="text-sm text-muted">{t.emptyDescription}</p>
          </div>
        ) : (
          <ul aria-label={t.list} className="flex flex-col divide-y rounded-card border">
            {images.map((image) => (
              <ImageRow
                key={image.id}
                songId={songId}
                image={image}
                arrangements={arrangements}
                limits={limits}
                chart={chart}
                editing={editing === image.id}
                onEdit={(edit) => setEditing(edit ? image.id : null)}
                previewed={image.id === previewed?.id}
                onPreview={() => setPreviewId(image.id)}
              />
            ))}
          </ul>
        )}

        <section className="flex flex-col gap-4 border-t pt-4">
          <h3 className="text-sm font-medium">{t.add}</h3>
          {full ? (
            <p className="text-sm text-muted">
              {format(t.limitReached, { max: limits.maxImages })}
            </p>
          ) : (
            <AddImageForm
              songId={songId}
              arrangements={arrangements}
              limits={limits}
              imageId={addingId}
              onImageId={setAddingId}
            />
          )}
        </section>
      </FormSection>
    </PreviewLayout>
  );
}

function ImageRow({
  songId,
  image,
  arrangements,
  limits,
  chart,
  editing,
  onEdit,
  previewed,
  onPreview,
}: {
  songId: string;
  image: SongImageDTO;
  arrangements: Arrangement[];
  limits: Limits;
  chart: ChartHandle;
  editing: boolean;
  onEdit: (editing: boolean) => void;
  /** The preview shows this image. */
  previewed: boolean;
  onPreview: () => void;
}) {
  const { m, format, plural } = useI18n();
  const t = m.songs.images;
  const details = useAttachmentDetails();
  const cover = image.pages[0];
  // Its changes wait for the save button of the page, e.g. a removed page. "Cancel" discards them.
  const panel = useKeptPanel(editing);

  return (
    <li className={cn("flex flex-col gap-3 px-3 py-2", previewed && "bg-surface-sunken/60")}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={previewed}
          title={format(t.show, { name: image.name })}
          onClick={onPreview}
          className={cn(previewButtonClass, "basis-48 items-center gap-3")}
        >
          <span className="flex h-12 w-9 shrink-0 items-center justify-center overflow-hidden rounded-sm border bg-surface-sunken">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element -- a private file: the image optimizer cannot read it.
              <img src={cover.url} alt="" loading="lazy" className="size-full object-cover" />
            ) : (
              <ImageIcon aria-hidden className="size-4 text-muted" />
            )}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-sm font-medium">{image.name}</span>
            <span className="truncate text-sm text-muted">
              {plural(m.songs.browser.details.imagePages, image.pages.length)}
              {m.common.separator}
              {details(image, arrangements)}
            </span>
          </span>
        </button>
        {/* The name keeps some room: the buttons go under it, and wrap, on a narrow screen. */}
        <div className="ml-auto flex flex-wrap items-center justify-end gap-1">
          {image.pages.length > 0 && (
            <Link
              href={imageHref(image.id, `/munkater/enektar/${songId}/szerkesztes`)}
              title={format(t.openTitle, { name: image.name })}
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              <ExternalLinkIcon />
              {t.open}
            </Link>
          )}
          {image.pages.length > 0 && (
            <ModuleGate id="songs.ocr">
              <ReadChartDialog
                source={image}
                trigger={{
                  label: t.readText,
                  title: format(t.readTextTitle, { name: image.name }),
                }}
                isChartEmpty={chart.isEmpty}
                onInsert={chart.insert}
              />
            </ModuleGate>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            title={format(t.editTitle, { name: image.name })}
            aria-expanded={editing}
            onClick={() => onEdit(!editing)}
          >
            <PencilIcon />
            {t.edit}
          </Button>
          <RemoveImageButton image={image} />
        </div>
      </div>
      <KeptPanel
        panel={panel}
        open={editing}
        onOpen={() => onEdit(true)}
        className="flex flex-col gap-6 rounded-card bg-surface-sunken/50 p-3"
      >
        <EditImageForm
          image={image}
          arrangements={arrangements}
          limits={limits}
          onSaved={() => onEdit(false)}
          onCancel={() => {
            panel.discard();
            onEdit(false);
          }}
        />
        <ImagePages image={image} limits={limits} />
      </KeptPanel>
    </li>
  );
}

function AddImageForm({
  songId,
  arrangements,
  limits,
  imageId,
  onImageId: setImageId,
}: {
  songId: string;
  arrangements: Arrangement[];
  limits: Limits;
  /** The image that this form added, while some of its pages are not uploaded yet. */
  imageId: string | null;
  onImageId: (id: string | null) => void;
}) {
  const { m, format } = useI18n();
  const t = m.songs.images;
  const local = useLocalPages();
  const [state, setState] = useState(initialState);
  const [pending, setPending] = useState(false);
  const upload = usePageUpload(limits);
  const formRef = useRef<HTMLFormElement>(null);
  // Images dropped on the page go here first, while the picker takes more pages.
  const drop = useFileDropTarget(
    pending || local.pages.length >= limits.maxPages
      ? null
      : {
          id: "images",
          label: t.add,
          kinds: ["image"],
          primary: true,
          element: formRef,
          onFiles: local.add,
        },
  );

  /** Adds the image (once), then uploads its pages. Gives true when all pages are uploaded. */
  async function save(form: HTMLFormElement): Promise<boolean> {
    const formData = new FormData(form);
    if (local.pages.length === 0) {
      setState({ status: "error", message: null, fieldErrors: { pages: [t.choosePages] } });
      return false;
    }
    if (local.pages.length > limits.maxPages) {
      setState({
        status: "error",
        message: null,
        fieldErrors: { pages: [format(t.tooManyPages, { max: limits.maxPages })] },
      });
      return false;
    }

    setPending(true);
    try {
      invalidatePageCache(changedPages.songs());
      let id = imageId;
      if (!id) {
        formData.set("songId", songId);
        let result: Awaited<ReturnType<typeof addImageAction>>;
        try {
          result = await addImageAction(formData);
        } catch {
          // The request failed, e.g. without a connection.
          setState({ status: "error", message: t.connectionFailed, fieldErrors: {} });
          return false;
        }
        if (!("id" in result)) {
          setState(result);
          return false;
        }
        id = result.id;
        setImageId(id);
      }

      if (await upload(id, local.pages, local.update)) {
        form.reset();
        local.clear();
        setImageId(null);
        setState(initialState);
        return true;
      }
      setState({ status: "error", message: t.uploadFailed, fieldErrors: {} });
      return false;
    } finally {
      setPending(false);
    }
  }

  const { onSubmit } = usePageSaveForm({
    formRef,
    save,
    changed: imageId !== null || local.pages.some((page) => page.status !== "done"),
  });

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-4">
      {/* The image is added: the remaining pages go to it, with these values. */}
      <fieldset disabled={imageId !== null || pending} className="flex min-w-0 flex-col gap-4">
        <AttachmentFields
          id="image"
          arrangements={arrangements}
          nameMaxLength={limits.nameMaxLength}
          errors={state.fieldErrors}
          texts={t}
        />
      </fieldset>
      <PagePicker
        id="image-pages"
        pages={local.pages}
        maxPages={limits.maxPages - local.uploaded}
        disabled={pending}
        selected={drop.selected}
        errors={state.fieldErrors.pages ?? state.fieldErrors.image}
        onAdd={local.add}
        onMove={local.move}
        onRemove={local.remove}
      />
      <SaveStatus
        state={state}
        pending={pending}
        pendingLabel={progressText(local.pages, t.pending, format)}
      />
    </form>
  );
}

function EditImageForm({
  image,
  arrangements,
  limits,
  onSaved,
  onCancel,
}: {
  image: SongImageDTO;
  arrangements: Arrangement[];
  limits: Limits;
  onSaved: () => void;
  /** Discards the changes of the image, also of its pages. */
  onCancel: () => void;
}) {
  const { m } = useI18n();
  const t = m.songs.images;
  const formRef = useRef<HTMLFormElement>(null);
  const { state, pending, onSubmit } = useAttachmentForm(
    formRef,
    (formData) => updateImageAction(initialState, formData),
    { connectionFailed: t.connectionFailed, onSuccess: onSaved },
  );

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={image.id} />
      <AttachmentFields
        id={`edit-${image.id}`}
        values={image}
        arrangements={arrangements}
        nameMaxLength={limits.nameMaxLength}
        errors={state.fieldErrors}
        texts={t}
      />
      <SaveStatus state={state} pending={pending} pendingLabel={t.editPending} />
      <div>
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={onCancel}>
          {m.common.actions.cancel}
        </Button>
      </div>
    </form>
  );
}

/**
 * The stored pages of an image: change their order, remove them and add more.
 * The changes wait for the save button of the page, as the other forms do. A
 * removed page stays in the list until the save, with a button to restore it.
 * The owner chose this: no confirmation dialog, because "Cancel" and the leave
 * guard can discard the removal before the save. The removal of a whole image
 * or file stays at once, with its confirmation dialog.
 */
function ImagePages({ image, limits }: { image: SongImageDTO; limits: Limits }) {
  const { m, format } = useI18n();
  const t = m.songs.images;
  // The order of the user, or null for the stored order. New stored pages go at the end.
  const [order, setOrder] = useState<string[] | null>(null);
  const [removed, setRemoved] = useState<ReadonlySet<string>>(() => new Set());
  const [state, setState] = useState(initialState);
  const [pending, setPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const pages = order === null ? image.pages : inOrder(image.pages, order);
  const stored = new Set(image.pages.map((page) => page.id));
  const removedNow = [...removed].filter((id) => stored.has(id));
  const kept = pages.filter((page) => !removed.has(page.id));
  const moved = kept.some(
    (page, index) => page.id !== image.pages.filter((stored) => !removed.has(stored.id))[index]?.id,
  );

  /** Swaps the kept page at `index` of `kept` with its kept neighbor. Removed pages keep their places. */
  function move(index: number, delta: number) {
    const ids = pages.map((page) => page.id);
    const slots = pages.flatMap((page, slot) => (removed.has(page.id) ? [] : [slot]));
    const from = slots[index];
    const to = slots[index + delta];
    if (from === undefined || to === undefined) return;
    [ids[from], ids[to]] = [ids[to]!, ids[from]!];
    setOrder(ids);
  }

  function setRemovedPage(id: string, remove: boolean) {
    setRemoved((current) => {
      const next = new Set(current);
      if (remove) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  /** Removes the removed pages, then saves the order of the other pages. Gives true after a success. */
  async function save(): Promise<boolean> {
    setPending(true);
    invalidatePageCache(changedPages.songs());
    try {
      for (const id of removedNow) {
        const formData = new FormData();
        formData.set("id", id);
        const result = await removeImagePageAction(initialState, formData);
        if (result.status !== "success") {
          setState(result);
          return false;
        }
        // A second try does not remove it again.
        setRemovedPage(id, false);
      }
      if (moved) {
        const formData = new FormData();
        formData.set("imageId", image.id);
        for (const page of kept) formData.append("pageIds", page.id);
        const result = await moveImagePagesAction(initialState, formData);
        if (result.status !== "success") {
          setState(result);
          return false;
        }
      }
      setOrder(null);
      setRemoved(new Set());
      setState(initialState);
      return true;
    } catch {
      // The request failed, e.g. without a connection.
      setState({ status: "error", message: t.connectionFailed, fieldErrors: {} });
      return false;
    } finally {
      setPending(false);
    }
  }

  const { onSubmit } = usePageSaveForm({ formRef, save, changed: removedNow.length > 0 || moved });

  return (
    <section className="flex flex-col gap-3">
      <h4 className="text-sm font-medium">{t.pages}</h4>
      <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-3">
        {pages.length === 0 ? (
          <p className="text-sm text-muted">{t.noPages}</p>
        ) : (
          <ol aria-label={format(t.pagesOf, { name: image.name })} className={PAGE_GRID}>
            {pages.map((page) => {
              const isRemoved = removed.has(page.id);
              // The numbers count only the pages that stay, as after the save.
              const index = kept.indexOf(page);
              const label = isRemoved ? t.pageRemoved : format(t.page, { page: index + 1 });
              // A removed page has no new number: its restore button names its stored number.
              const storedNumber = image.pages.indexOf(page) + 1;
              return (
                <li key={page.id} className="flex flex-col gap-1">
                  <div className={cn("relative", isRemoved && "opacity-50")}>
                    <PageThumbnail
                      url={page.url}
                      number={isRemoved ? undefined : index + 1}
                      label={label}
                    />
                    {isRemoved && (
                      <span className="absolute inset-x-0 bottom-0 rounded-b-control bg-surface/90 px-1.5 py-1 text-xs">
                        {t.pageRemoved}
                      </span>
                    )}
                  </div>
                  {isRemoved ? (
                    <div className="flex items-center justify-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={format(t.restorePage, { page: storedNumber })}
                        title={format(t.restorePage, { page: storedNumber })}
                        disabled={pending}
                        onClick={() => setRemovedPage(page.id, false)}
                      >
                        <Undo2Icon />
                      </Button>
                    </div>
                  ) : (
                    <PageButtons
                      number={index + 1}
                      first={index === 0}
                      last={index === kept.length - 1}
                      disabled={pending}
                      onMove={(delta) => move(index, delta)}
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={format(t.removePage, { page: index + 1 })}
                        title={format(t.removePage, { page: index + 1 })}
                        disabled={pending}
                        onClick={() => setRemovedPage(page.id, true)}
                      >
                        <XIcon />
                      </Button>
                    </PageButtons>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        <SaveStatus state={state} pending={pending} pendingLabel={t.editPending} />
      </form>

      {image.pages.length >= limits.maxPages ? (
        <p className="text-sm text-muted">{format(t.pagesFull, { max: limits.maxPages })}</p>
      ) : (
        <AddPagesForm image={image} limits={limits} />
      )}
    </section>
  );
}

/** The pages in the order of `ids`. Pages that are not in `ids`, e.g. new pages, go at the end. */
function inOrder(pages: SongImagePageDTO[], ids: string[]): SongImagePageDTO[] {
  const position = new Map(ids.map((id, index) => [id, index]));
  return pages.toSorted(
    (a, b) => (position.get(a.id) ?? ids.length) - (position.get(b.id) ?? ids.length),
  );
}

function AddPagesForm({ image, limits }: { image: SongImageDTO; limits: Limits }) {
  const { m, format } = useI18n();
  const t = m.songs.images;
  const local = useLocalPages();
  const [state, setState] = useState(initialState);
  const [pending, setPending] = useState(false);
  const upload = usePageUpload(limits);
  const formRef = useRef<HTMLFormElement>(null);
  // The stored pages before the first upload of the chosen pages. The stored
  // pages then include the uploaded pages of this form (see `usePageUpload`),
  // but `image.pages` does not show them while the page could not show them
  // again, e.g. without a connection.
  const [before, setBefore] = useState<number | null>(null);
  const stored = Math.max(image.pages.length, (before ?? 0) + local.uploaded);
  const room = limits.maxPages - stored;

  /** Uploads the chosen pages. Gives true when all are uploaded. */
  async function save(): Promise<boolean> {
    if (local.pages.length - local.uploaded > room) {
      setState({
        status: "error",
        message: null,
        fieldErrors: { pages: [format(t.tooManyPages, { max: limits.maxPages })] },
      });
      return false;
    }

    setPending(true);
    try {
      invalidatePageCache(changedPages.songs());
      if (local.uploaded === 0) setBefore(image.pages.length);
      if (await upload(image.id, local.pages, local.update)) {
        local.clear();
        setBefore(null);
        setState(initialState);
        return true;
      }
      setState({ status: "error", message: t.uploadFailed, fieldErrors: {} });
      return false;
    } finally {
      setPending(false);
    }
  }

  const { onSubmit } = usePageSaveForm({
    formRef,
    save,
    changed: local.pages.some((page) => page.status !== "done"),
  });

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-3 border-t pt-3">
      <PagePicker
        id={`pages-${image.id}`}
        label={t.addPages}
        pages={local.pages}
        maxPages={room}
        disabled={pending}
        errors={state.fieldErrors.pages ?? state.fieldErrors.image}
        onAdd={local.add}
        onMove={local.move}
        onRemove={local.remove}
      />
      <SaveStatus
        state={state}
        pending={pending}
        pendingLabel={progressText(local.pages, t.pending, format)}
      />
    </form>
  );
}

/** A page on this device, before and during its upload. */
type LocalPage = {
  key: number;
  file: File;
  /** An object URL of the file, for the thumbnail. */
  url: string;
  status: "waiting" | "uploading" | "done" | "failed";
  error: string | null;
};

/** The pages that the user chose on this device, in order. The thumbnails' object URLs are freed with the pages. */
function useLocalPages() {
  const [pages, setPages] = useState<LocalPage[]>([]);
  const nextKey = useRef(0);
  const urls = useObjectUrls();

  return {
    pages,
    /** The number of pages that are uploaded already. */
    uploaded: pages.filter((page) => page.status === "done").length,
    add(files: File[]) {
      const added = files.map((file): LocalPage => ({
        key: nextKey.current++,
        file,
        url: urls.create(file),
        status: "waiting",
        error: null,
      }));
      setPages((current) => [...current, ...added]);
    },
    move(key: number, delta: number) {
      setPages((current) => {
        const index = current.findIndex((page) => page.key === key);
        const target = index + delta;
        if (index < 0 || target < 0 || target >= current.length) return current;
        const next = [...current];
        [next[index], next[target]] = [next[target]!, next[index]!];
        return next;
      });
    },
    remove(key: number) {
      const page = pages.find((candidate) => candidate.key === key);
      if (page) urls.free(page.url);
      setPages((current) => current.filter((candidate) => candidate.key !== key));
    },
    update(key: number, change: Pick<LocalPage, "status" | "error">) {
      setPages((current) =>
        current.map((page) => (page.key === key ? { ...page, ...change } : page)),
      );
    },
    clear() {
      for (const page of pages) urls.free(page.url);
      setPages([]);
    },
  };
}

/**
 * Uploads the pages that are not uploaded yet, in order, as the last pages of
 * the image. Each page first becomes smaller in the browser. It stops at the
 * first failed page, so that the next try keeps the order. Then the page
 * shows the new pages once, also after a failed page. Gives true when all
 * pages are uploaded.
 */
function usePageUpload(limits: Limits) {
  const { m } = useI18n();
  const t = m.songs.images;

  return async (
    imageId: string,
    pages: LocalPage[],
    update: (key: number, change: Pick<LocalPage, "status" | "error">) => void,
  ): Promise<boolean> => {
    let uploaded = true;
    for (const page of pages) {
      if (page.status === "done") continue;
      update(page.key, { status: "uploading", error: null });
      const error = await uploadPage(imageId, page.file);
      update(
        page.key,
        error === null ? { status: "done", error: null } : { status: "failed", error },
      );
      if (error !== null) {
        uploaded = false;
        break;
      }
    }
    try {
      await showImagePagesAction();
    } catch {
      // Without a connection: the next upload shows them.
    }
    return uploaded;
  };

  /** The error of the page, or null after the upload. */
  async function uploadPage(imageId: string, file: File): Promise<string | null> {
    let blob: Blob;
    try {
      // A lower quality for a page with much detail, so that the request is not too large.
      blob = (
        await resizeImage(file, {
          maxSide: limits.maxSide,
          qualities: UPLOAD_QUALITIES,
          maxBytes: limits.maxBytes,
        })
      ).blob;
    } catch (error) {
      return error instanceof ImageDecodeError ? t.decodeFailed : t.tooLarge;
    }
    if (blob.size > limits.maxBytes) return t.tooLarge;

    const formData = new FormData();
    formData.set("imageId", imageId);
    formData.set("image", blob, "page.jpg");
    try {
      const result = await addImagePageAction(initialState, formData);
      if (result.status === "success") return null;
      return result.fieldErrors.image?.join(" ") || result.message || t.failed;
    } catch {
      // The request failed, e.g. without a connection.
      return t.connectionFailed;
    }
  }
}

/**
 * Chooses pages on this device: from files, or on a phone with the camera.
 * Each photo adds one page, so the user can take the pages one after the
 * other. The pages show as thumbnails in order, with buttons to change the
 * order and to remove them.
 */
function PagePicker({
  id,
  label,
  pages,
  maxPages,
  disabled,
  selected = false,
  errors,
  onAdd,
  onMove,
  onRemove,
}: {
  id: string;
  label?: string;
  pages: LocalPage[];
  /** The most pages that the user can add, without the uploaded pages of `pages`. */
  maxPages: number;
  disabled: boolean;
  /** The files dragged over the page go to this picker (see `useFileDropTarget`). */
  selected?: boolean;
  errors?: string[];
  onAdd: (files: File[]) => void;
  onMove: (key: number, delta: number) => void;
  onRemove: (key: number) => void;
}) {
  const { m, format } = useI18n();
  const t = m.songs.images;
  const chooser = useImageChooser(onAdd);
  const full = pages.filter((page) => page.status !== "done").length >= maxPages;
  // Images dropped on the picker go here.
  const zone = useDropZone({ kinds: ["image"], disabled: disabled || full, onFiles: onAdd });
  const highlight = selected || zone.over;

  return (
    // `min-w-0`: a fieldset is at least as wide as its content, and would make the page scroll sideways.
    <fieldset
      className="flex min-w-0 flex-col gap-3"
      aria-describedby={`${id}-description`}
      {...zone.props}
    >
      <legend className="mb-2 text-sm font-medium">{label ?? t.pages}</legend>
      {/* Not in the form data: the pages upload one by one. */}
      {chooser.inputs}

      {pages.length === 0 ? (
        // Opens the file picker, like the "Choose images" button.
        <button
          type="button"
          className={cn(PAGES_BOX, highlight && DROP_SELECTED)}
          disabled={disabled || full}
          onClick={chooser.openFiles}
        >
          <ImagePlusIcon aria-hidden className="mb-1 size-5 text-muted" />
          <span className="text-sm text-muted">{t.noPagesChosen}</span>
        </button>
      ) : (
        <ol
          className={cn(
            PAGE_GRID,
            highlight && "rounded-card outline-2 outline-offset-4 outline-focus",
          )}
        >
          {pages.map((page, index) => (
            <li key={page.key} className="flex flex-col gap-1">
              <PageThumbnail
                url={page.url}
                number={index + 1}
                label={format(t.page, { page: index + 1 })}
                status={page.status}
              />
              {page.status !== "done" && (
                <PageButtons
                  number={index + 1}
                  first={index === 0}
                  last={index === pages.length - 1}
                  disabled={disabled}
                  onMove={(delta) => onMove(page.key, delta)}
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={format(t.removeChosen, { page: index + 1 })}
                    title={format(t.removeChosen, { page: index + 1 })}
                    disabled={disabled}
                    onClick={() => onRemove(page.key)}
                  >
                    <XIcon />
                  </Button>
                </PageButtons>
              )}
              {page.error && <p className="text-xs text-danger">{page.error}</p>}
            </li>
          ))}
        </ol>
      )}

      <ImageChooserButtons chooser={chooser} labels={t} disabled={disabled || full} />
      <FieldMessage
        id={`${id}-description`}
        hint={format(t.pagesHint, { max: maxPages })}
        errors={errors}
      />
    </fieldset>
  );
}

// As many columns as the box has room for: each page needs room for its three buttons.
const PAGE_GRID = "grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-2";

/** The JPEG qualities of an upload, from the best. */
const UPLOAD_QUALITIES = [0.85, 0.7, 0.55];

function PageThumbnail({
  url,
  number,
  label,
  status,
}: {
  url: string;
  /** Without it, no number shows, e.g. on a removed page. */
  number?: number;
  label: string;
  status?: LocalPage["status"];
}) {
  const { m } = useI18n();
  const t = m.songs.images;
  const statusText =
    status &&
    { waiting: t.waiting, uploading: t.uploading, done: t.uploaded, failed: t.failed }[status];

  return (
    <div className="relative aspect-[3/4] overflow-hidden rounded-control border bg-surface-sunken">
      {/* eslint-disable-next-line @next/next/no-img-element -- a private file or a file on this device. */}
      <img src={url} alt={label} loading="lazy" className="size-full object-cover" />
      {number !== undefined && (
        <span className="absolute top-1 left-1 rounded bg-surface/90 px-1.5 text-xs font-medium tabular-nums">
          {number}
        </span>
      )}
      {status && status !== "waiting" && (
        <span
          className={cn(
            "absolute inset-x-0 bottom-0 flex items-center gap-1 px-1.5 py-1 text-xs",
            status === "failed" ? "bg-danger text-white" : "bg-surface/90",
          )}
        >
          {status === "uploading" && (
            <LoaderCircleIcon aria-hidden className="size-3 animate-spin" />
          )}
          {status === "done" && <CheckIcon aria-hidden className="size-3" />}
          {status === "failed" && <TriangleAlertIcon aria-hidden className="size-3" />}
          {statusText}
        </span>
      )}
    </div>
  );
}

/** Moves a page to the front or to the back, then the other buttons of the page. */
function PageButtons({
  number,
  first,
  last,
  disabled,
  onMove,
  children,
}: {
  number: number;
  first: boolean;
  last: boolean;
  disabled: boolean;
  onMove: (delta: number) => void;
  children: React.ReactNode;
}) {
  const { m, format } = useI18n();
  const t = m.songs.images;

  return (
    <div className="flex items-center justify-center gap-0.5">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={format(t.moveEarlier, { page: number })}
        title={format(t.moveEarlier, { page: number })}
        disabled={disabled || first}
        onClick={() => onMove(-1)}
      >
        <ArrowLeftIcon />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={format(t.moveLater, { page: number })}
        title={format(t.moveLater, { page: number })}
        disabled={disabled || last}
        onClick={() => onMove(1)}
      >
        <ArrowRightIcon />
      </Button>
      {children}
    </div>
  );
}

/** For example "Uploading page 2 of 3…", while the pages upload one by one. */
function progressText(
  pages: LocalPage[],
  text: string,
  format: (message: string, values: Record<string, string | number>) => string,
): string {
  const index = pages.findIndex((page) => page.status === "uploading");
  return format(text, { page: Math.max(index, 0) + 1, count: pages.length });
}

function RemoveImageButton({ image }: { image: SongImageDTO }) {
  const [state, formAction, pending] = useActionState(
    invalidating(changedPages.songs(), removeImageAction),
    initialState,
  );
  const [open, setOpen] = useState(false);
  const { m, format } = useI18n();
  const t = m.songs.images;

  // Close the dialog after the removal.
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state.status === "success") setOpen(false);
  }

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
              size="sm"
              title={format(t.removeTitle, { name: image.name })}
              className="text-danger hover:text-danger"
            />
          }
        >
          <Trash2Icon />
          {t.remove}
        </ConfirmDialogTrigger>
      }
      title={t.confirmTitle}
      description={rich(t.confirmDescription, {
        // The name goes in after the markup is read, so a name with "<…>" stays text.
        strong: (chunk) => (
          <strong className="text-text">{format(chunk, { name: image.name })}</strong>
        ),
      })}
      id={image.id}
      formAction={formAction}
      state={state}
      pending={pending}
      confirmLabel={t.remove}
      pendingLabel={t.removePending}
    />
  );
}
