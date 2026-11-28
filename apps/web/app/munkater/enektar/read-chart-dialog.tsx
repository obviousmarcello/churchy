"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { ImageIcon, ImagePlusIcon, ScanTextIcon, XIcon } from "lucide-react";

import {
  DIALOG_BACKDROP_CLASS,
  DIALOG_POPUP_CLASS,
  DialogActions,
  DialogBody,
  DialogFooter,
  DialogHeader,
} from "@/components/music/dialog-parts";
import { DROP_SELECTED, useDropZone, useFileDropTarget } from "@/components/music/file-drop";
import {
  ImageChooserButtons,
  PAGES_BOX,
  useImageChooser,
  useObjectUrls,
} from "@/components/music/image-chooser";
import { Button } from "@/components/music/ui/button";
import { Textarea } from "@/components/music/ui/textarea";
import { useI18n } from "@/i18n/music/client";
import { ImageDecodeError, resizeImage } from "@/lib/music/image-resize";
import { isAbortError, loadOcrEngine, type OcrEngine } from "@/lib/music/ocr";
import { readChart, type ReadChartProgress } from "@/lib/music/ocr/read-chart";
import { cn } from "@/lib/music/utils";
import type { SongImageDTO } from "@/server/music/models/images";

/** The longest side of an image for the text recognition. Enough for the small text of a full page, and faster on a phone. */
const OCR_MAX_SIDE = 2000;

type Page = { key: number; blob: Blob; url: string };

type Step =
  | { kind: "choose"; error: string | null }
  | { kind: "reading"; progress: ReadChartProgress | null }
  /** `chartIsEmpty`: the chart field was empty when the reading ended. */
  | { kind: "result"; chart: string; chartIsEmpty: boolean };

/**
 * A button that reads a chord sheet from photos, on this device, and gives
 * the ChordPro chart to `onInsert`. `replace` is false when the chart goes
 * after the chart that the field has. `images` are the images of the song,
 * which can also give the pages. With `source`, the dialog reads the pages of
 * that image at once, e.g. from the list of images.
 */
export function ReadChartDialog({
  images = [],
  source,
  trigger,
  isChartEmpty,
  onInsert,
}: {
  images?: SongImageDTO[];
  source?: SongImageDTO;
  /** The text of the button. Without it: "Read from image", for the chart field. */
  trigger?: { label: string; title: string };
  isChartEmpty: () => boolean;
  onInsert: (chart: string, replace: boolean) => void;
}) {
  const { m, format } = useI18n();
  const t = m.songs.form.ocr;
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>({ kind: "choose", error: null });
  const [pages, setPages] = useState<Page[]>([]);
  const [loadingImage, setLoadingImage] = useState(false);
  const nextKey = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const engine = useRef<OcrEngine | null>(null);
  const chooser = useImageChooser(addPages);
  // The object URLs of the thumbnails.
  const urls = useObjectUrls();
  const usableImages = images.filter((image) => image.pages.length > 0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // The button of the chart field: images dropped on the page can be read too.
  const drop = useFileDropTarget(
    source
      ? null
      : {
          id: "chart",
          label: t.title,
          kinds: ["image"],
          element: triggerRef,
          onFiles: (files) => {
            addPages(files);
            setOpen(true);
          },
        },
  );
  // Images dropped on the dialog are pages, while it does not read.
  const zone = useDropZone({
    kinds: ["image"],
    disabled: step.kind !== "choose",
    onFiles: addPages,
  });

  // Stops the work and frees the engine when the page closes.
  useEffect(() => {
    return () => {
      controller.current?.abort();
      engine.current?.dispose();
    };
  }, []);

  function addPages(blobs: Blob[]) {
    const added = blobs.map((blob) => ({ key: nextKey.current++, blob, url: urls.create(blob) }));
    setPages((current) => [...current, ...added]);
    setStep({ kind: "choose", error: null });
  }

  function freePages(remove: Page[]) {
    for (const page of remove) urls.free(page.url);
  }

  function removePage(key: number) {
    freePages(pages.filter((candidate) => candidate.key === key));
    setPages((current) => current.filter((candidate) => candidate.key !== key));
  }

  /**
   * Adds the pages of an image of the song. Gives their files, or null when
   * one did not load or `signal` stopped the download.
   */
  async function addSongImage(image: SongImageDTO, signal?: AbortSignal): Promise<Blob[] | null> {
    setLoadingImage(true);
    try {
      const blobs = await Promise.all(
        image.pages.map(async (page) => {
          const response = await fetch(page.url, { signal });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.blob();
        }),
      );
      if (signal?.aborted) return null;
      addPages(blobs);
      return blobs;
    } catch {
      // The dialog closed: no error.
      if (!signal?.aborted) setStep({ kind: "choose", error: t.imageLoadFailed });
      return null;
    } finally {
      setLoadingImage(false);
    }
  }

  /** Reads the pages, in order, until `abort` stops it. */
  async function read(blobs: Blob[], abort = new AbortController()) {
    controller.current = abort;
    setStep({ kind: "reading", progress: null });
    try {
      let ocr = engine.current;
      if (!ocr) {
        ocr = await loadOcrEngine();
        // The dialog closed during the load: `close` cannot free this engine.
        if (abort.signal.aborted) {
          ocr.dispose();
          setStep({ kind: "choose", error: null });
          return;
        }
        engine.current = ocr;
      }
      // One after the other: a phone has little memory for large photos.
      const small: Blob[] = [];
      for (const blob of blobs)
        small.push((await resizeImage(blob, { maxSide: OCR_MAX_SIDE })).blob);
      const chart = await readChart(ocr, small, {
        signal: abort.signal,
        onProgress: (progress) => setStep({ kind: "reading", progress }),
      });
      setStep(
        chart.trim()
          ? { kind: "result", chart, chartIsEmpty: isChartEmpty() }
          : { kind: "choose", error: t.noText },
      );
    } catch (error) {
      if (isAbortError(error)) {
        setStep({ kind: "choose", error: null });
        return;
      }
      console.error("[ocr] Failed to read the chart:", error);
      setStep({
        kind: "choose",
        error: error instanceof ImageDecodeError ? t.decodeFailed : t.failed,
      });
    } finally {
      if (controller.current === abort) controller.current = null;
    }
  }

  function close(next: boolean) {
    setOpen(next);
    if (next) {
      // From the list of images: read that image at once, unless the dialog has its pages already.
      if (source && pages.length === 0) {
        // Closing the dialog stops the download, and then the reading.
        const abort = new AbortController();
        controller.current = abort;
        void addSongImage(source, abort.signal).then((blobs) => blobs && read(blobs, abort));
      }
      return;
    }
    controller.current?.abort();
    // The engine takes much memory: a next read starts it again, without a new download.
    engine.current?.dispose();
    engine.current = null;
    setStep({ kind: "choose", error: null });
  }

  function insert(replace: boolean) {
    if (step.kind !== "result") return;
    onInsert(step.chart, replace);
    freePages(pages);
    setPages([]);
    close(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={close}>
      <Dialog.Trigger
        ref={triggerRef}
        render={
          trigger ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={trigger.title}
              title={trigger.title}
            />
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(drop.selected && DROP_SELECTED)}
            />
          )
        }
      >
        <ScanTextIcon />
        {trigger?.label ?? t.button}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className={DIALOG_BACKDROP_CLASS} />
        <Dialog.Popup {...zone.props} className={cn(DIALOG_POPUP_CLASS, "w-lg")}>
          <DialogHeader className="flex-row items-start">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Dialog.Title className="font-heading text-lg font-semibold tracking-tight">
                {t.title}
              </Dialog.Title>
              <Dialog.Description className="text-sm text-muted">
                {t.description}
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

          {step.kind === "result" ? (
            <>
              <DialogBody className="gap-3">
                <label htmlFor="ocr-chart" className="text-sm font-medium">
                  {t.result}
                </label>
                <Textarea
                  id="ocr-chart"
                  value={step.chart}
                  onChange={(event) => setStep({ ...step, chart: event.target.value })}
                  spellCheck={false}
                  aria-describedby="ocr-chart-description"
                  className="min-h-64 font-mono"
                />
                <p id="ocr-chart-description" className="text-sm text-muted">
                  {t.resultHint}
                </p>
              </DialogBody>
              <DialogFooter>
                <DialogActions>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setStep({ kind: "choose", error: null })}
                  >
                    {t.back}
                  </Button>
                  {step.chartIsEmpty ? (
                    <Button type="button" onClick={() => insert(true)}>
                      {t.insert}
                    </Button>
                  ) : (
                    <>
                      <Button type="button" variant="outline" onClick={() => insert(false)}>
                        {t.append}
                      </Button>
                      <Button type="button" onClick={() => insert(true)}>
                        {t.replace}
                      </Button>
                    </>
                  )}
                </DialogActions>
              </DialogFooter>
            </>
          ) : step.kind === "reading" ? (
            <>
              <DialogBody>
                <div className="flex flex-col gap-3" role="status">
                  <p className="text-sm">{progressText(step.progress)}</p>
                  <progress
                    className="h-2 w-full overflow-hidden rounded-full accent-primary"
                    max={1}
                    value={step.progress?.ratio ?? undefined}
                  />
                  {step.progress?.stage === "download" && (
                    <p className="text-sm text-muted">{t.downloadHint}</p>
                  )}
                </div>
              </DialogBody>
              <DialogFooter>
                <DialogActions>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => controller.current?.abort()}
                  >
                    {t.stop}
                  </Button>
                </DialogActions>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogBody>
                <fieldset className="flex flex-col gap-3" aria-describedby="ocr-pages-description">
                  <legend className="mb-2 text-sm font-medium">{t.pages}</legend>
                  {chooser.inputs}
                  {pages.length === 0 ? (
                    // Opens the file picker, like the "Choose images" button.
                    <button
                      type="button"
                      className={cn(PAGES_BOX, zone.over && DROP_SELECTED)}
                      onClick={chooser.openFiles}
                    >
                      <ImagePlusIcon aria-hidden className="mb-1 size-5 text-muted" />
                      <span className="text-sm text-muted">{t.noPages}</span>
                    </button>
                  ) : (
                    <ol
                      className={cn(
                        "grid grid-cols-3 gap-2 sm:grid-cols-4",
                        zone.over && "rounded-lg outline-2 outline-offset-4 outline-focus",
                      )}
                    >
                      {pages.map((page, index) => (
                        <li
                          key={page.key}
                          className="relative aspect-[3/4] overflow-hidden rounded-md border bg-surface-sunken"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element -- a file on this device. */}
                          <img
                            src={page.url}
                            alt={format(t.page, { page: index + 1 })}
                            className="size-full object-cover"
                          />
                          <span className="absolute top-1 left-1 rounded bg-surface/90 px-1.5 text-xs font-medium tabular-nums">
                            {index + 1}
                          </span>
                          <Button
                            type="button"
                            variant="secondary"
                            size="icon-xs"
                            aria-label={format(t.removePage, { page: index + 1 })}
                            title={format(t.removePage, { page: index + 1 })}
                            className="absolute top-1 right-1"
                            onClick={() => removePage(page.key)}
                          >
                            <XIcon />
                          </Button>
                        </li>
                      ))}
                    </ol>
                  )}
                  <ImageChooserButtons chooser={chooser} labels={t} />
                  <p id="ocr-pages-description" className="text-sm text-muted">
                    {t.pagesHint}
                  </p>
                </fieldset>

                {usableImages.length > 0 && (
                  <section className="flex flex-col gap-2">
                    <h3 className="text-sm font-medium">{t.songImages}</h3>
                    <ul className="flex flex-wrap gap-1.5">
                      {usableImages.map((image) => (
                        // A long name is cut, so the button fits a phone.
                        <li key={image.id} className="max-w-full">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={loadingImage}
                            onClick={() => void addSongImage(image)}
                            className="max-w-full"
                          >
                            <ImageIcon />
                            <span className="truncate">
                              {format(t.useImage, { name: image.name })}
                            </span>
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </DialogBody>

              <DialogFooter>
                {step.error && (
                  <p role="alert" className="text-sm text-danger">
                    {step.error}
                  </p>
                )}
                <DialogActions>
                  <Button
                    type="button"
                    disabled={pages.length === 0 || loadingImage}
                    onClick={() => void read(pages.map((page) => page.blob))}
                  >
                    <ScanTextIcon />
                    {t.read}
                  </Button>
                </DialogActions>
              </DialogFooter>
            </>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );

  function progressText(progress: ReadChartProgress | null): string {
    const percent = Math.round((progress?.ratio ?? 0) * 100);
    if (!progress || progress.stage === "load") return t.starting;
    if (progress.stage === "download") return format(t.downloading, { percent });
    return format(t.reading, { page: progress.page, count: progress.count, percent });
  }
}
