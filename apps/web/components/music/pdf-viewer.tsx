"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  DownloadIcon,
  FileWarningIcon,
  LockIcon,
  MoveHorizontalIcon,
  RotateCwIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

import { PageHeader } from "@/components/music/page-header";
import { Button, buttonVariants } from "@/components/music/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/music/ui/empty";
import { useI18n } from "@/i18n/music/client";
import { usePinchZoom, zoomStep } from "@/lib/music/pinch-zoom";
import { FIT_VIEW, sameView, viewTransform, type FileView } from "@/lib/music/file-view";
import { loadPdfjs, MAX_CANVAS_PIXELS, PDFJS_DOCUMENT_OPTIONS } from "@/lib/music/pdfjs";

// Shows a PDF file with pdf.js: each page is a canvas, as wide as the viewer
// at the zoom of 100%. Only the pages near the screen are drawn, so a long
// file does not use too much memory.
// pdf.js loads with `loadPdfjs` (see `src/lib/pdfjs.ts`).

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
/** A new zoom draws the page again when it does not change for this time, e.g. at the end of a pinch. */
const ZOOM_DRAW_DELAY_MS = 150;

export type PageSize = { width: number; height: number };

type ViewerState =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "password" }
  | { status: "ready"; doc: PDFDocumentProxy; sizes: PageSize[] };

/**
 * The page of a PDF file: the header with the zoom and the download, then the
 * pages. `url` serves the file. `downloadUrl` saves it, e.g. when the viewer
 * cannot show it.
 */
export function PdfViewer({
  url,
  downloadUrl,
  header,
}: {
  url: string;
  downloadUrl: string;
  header: Omit<React.ComponentProps<typeof PageHeader>, "actions">;
}) {
  const { m, plural, format } = useI18n();
  const t = m.songs.pdfView;
  // A new attempt loads the file again.
  const [attempt, setAttempt] = useState(0);
  const state = usePdfDocument(url, attempt);
  const [zoom, setZoom] = useState(1);
  // A state, not a ref: the element is new after a failed load.
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const width = useWidth(container);
  usePinchZoom(container, {
    zoom,
    min: ZOOM_STEPS[0]!,
    max: ZOOM_STEPS[ZOOM_STEPS.length - 1]!,
    onZoom: setZoom,
  });

  if (state.status === "failed" || state.status === "password") {
    const text = state.status === "password" ? t.passwordProtected : t.loadFailed;
    return (
      <>
        <PageHeader {...header} />
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              {state.status === "password" ? <LockIcon /> : <FileWarningIcon />}
            </EmptyMedia>
            <EmptyTitle>{text.title}</EmptyTitle>
            <EmptyDescription>{text.description}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="flex-row justify-center">
            {state.status === "failed" && (
              <Button variant="outline" onClick={() => setAttempt(attempt + 1)}>
                <RotateCwIcon />
                {t.tryAgain}
              </Button>
            )}
            <a href={downloadUrl} className={buttonVariants({ variant: "outline" })}>
              <DownloadIcon />
              {t.download}
            </a>
          </EmptyContent>
        </Empty>
      </>
    );
  }

  const pageCount = state.status === "ready" ? state.sizes.length : 0;
  const zoomOut = zoomStep(ZOOM_STEPS, zoom, -1);
  const zoomIn = zoomStep(ZOOM_STEPS, zoom, 1);
  const controls = (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t.zoomOut}
        title={t.zoomOut}
        disabled={zoomOut === undefined}
        onClick={() => zoomOut && setZoom(zoomOut)}
      >
        <ZoomOutIcon />
      </Button>
      <span className="min-w-12 text-center text-sm tabular-nums max-sm:sr-only" aria-live="polite">
        {format(t.zoom, { percent: Math.round(zoom * 100) })}
      </span>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t.zoomIn}
        title={t.zoomIn}
        disabled={zoomIn === undefined}
        onClick={() => zoomIn && setZoom(zoomIn)}
      >
        <ZoomInIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t.fitWidth}
        title={t.fitWidth}
        disabled={zoom === 1}
        onClick={() => setZoom(1)}
      >
        <MoveHorizontalIcon />
      </Button>
      <a
        href={downloadUrl}
        className={buttonVariants({ variant: "outline", size: "sm" })}
        title={t.download}
      >
        <DownloadIcon />
        <span className="sr-only sm:not-sr-only">{t.download}</span>
      </a>
    </>
  );

  return (
    <>
      <PageHeader {...header} actions={controls} />
      <div
        ref={setContainer}
        // `touch-pan-*`: one finger scrolls, two fingers zoom the pages, not the page of the browser.
        className="flex-1 touch-pan-x touch-pan-y overflow-x-auto px-4 py-4 sm:px-6"
      >
        {state.status === "ready" && pageCount > 0 && (
          <p className="mb-3 text-center text-sm text-muted">{plural(t.pageCount, pageCount)}</p>
        )}
        {state.status === "loading" ? (
          <p className="text-sm text-muted" role="status">
            {t.loading}
          </p>
        ) : pageCount === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileWarningIcon />
              </EmptyMedia>
              <EmptyTitle>{t.noPages.title}</EmptyTitle>
              <EmptyDescription>{t.noPages.description}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          width > 0 && (
            <PdfPages doc={state.doc} sizes={state.sizes} width={Math.floor(width * zoom)} />
          )
        )}
      </div>
    </>
  );
}

/** Loads the PDF file of `url`. A new `attempt` loads it again. */
export function usePdfDocument(url: string, attempt: number): ViewerState {
  // The state of each load, so a new file or a new attempt shows "loading" at once.
  const load = `${attempt} ${url}`;
  const [result, setResult] = useState<{ load: string; state: ViewerState } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => Promise<void>) | null = null;

    loadPdfjs()
      .then((lib) => {
        if (cancelled) return null;
        const task = lib.getDocument({
          url,
          // The URL sends the browser to a signed URL of Supabase Storage. One request for the whole file.
          disableRange: true,
          ...PDFJS_DOCUMENT_OPTIONS,
        });
        destroy = () => task.destroy();
        return task.promise;
      })
      .then(async (doc) => {
        if (!doc || cancelled) return;
        // The size of each page, so that the pages that are not drawn yet take
        // their place. All requests to the worker at once, not one after the other.
        const sizes: PageSize[] = await Promise.all(
          Array.from({ length: doc.numPages }, async (_, index) => {
            const { width, height } = (await doc.getPage(index + 1)).getViewport({ scale: 1 });
            return { width, height };
          }),
        );
        if (!cancelled) setResult({ load, state: { status: "ready", doc, sizes } });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const password = error instanceof Error && error.name === "PasswordException";
        setResult({ load, state: { status: password ? "password" : "failed" } });
      });

    return () => {
      cancelled = true;
      void destroy?.();
    };
  }, [url, load]);

  return result?.load === load ? result.state : { status: "loading" };
}

/**
 * A PDF file in a preview, e.g. on the edit page of a song: its pages as wide
 * as the preview, without the zoom. When it cannot show, it says why.
 */
export function PdfPreview({ url, downloadUrl }: { url: string; downloadUrl: string }) {
  const { m } = useI18n();
  const t = m.songs.pdfView;
  const [attempt, setAttempt] = useState(0);
  const state = usePdfDocument(url, attempt);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const width = useWidth(container);

  if (state.status === "loading") {
    return (
      <p className="text-sm text-muted" role="status">
        {t.loading}
      </p>
    );
  }

  if (state.status !== "ready" || state.sizes.length === 0) {
    const text =
      state.status === "password"
        ? t.passwordProtected
        : state.status === "failed"
          ? t.loadFailed
          : t.noPages;
    return (
      <div className="flex flex-col items-center gap-3 rounded-card border border-dashed px-4 py-6 text-center">
        <div className="flex flex-col items-center gap-1">
          {state.status === "password" ? (
            <LockIcon aria-hidden className="mb-1 size-5 text-muted" />
          ) : (
            <FileWarningIcon aria-hidden className="mb-1 size-5 text-muted" />
          )}
          <p className="text-sm font-medium">{text.title}</p>
          <p className="text-sm text-muted">{text.description}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {state.status === "failed" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAttempt(attempt + 1)}
            >
              <RotateCwIcon />
              {t.tryAgain}
            </Button>
          )}
          <a href={downloadUrl} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <DownloadIcon />
            {t.download}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div ref={setContainer}>
      {width > 0 && <PdfPages doc={state.doc} sizes={state.sizes} width={width} />}
    </div>
  );
}

/** The pages, one under the other, `width` CSS pixels wide. */
function PdfPages({
  doc,
  sizes,
  width,
}: {
  doc: PDFDocumentProxy;
  sizes: PageSize[];
  width: number;
}) {
  const { m, format } = useI18n();
  const t = m.songs.pdfView;

  return (
    <ol data-zoom-content className="flex w-max min-w-full flex-col items-center gap-4">
      {sizes.map((size, index) => (
        <li key={index}>
          <PdfPage
            doc={doc}
            number={index + 1}
            size={size}
            width={width}
            label={format(t.page, { page: index + 1, count: sizes.length })}
            failedText={t.pageFailed}
          />
        </li>
      ))}
    </ol>
  );
}

/**
 * One page, `width` CSS pixels wide. It is drawn only near the screen. The
 * page finds out itself whether it is near, in a viewer that scrolls down;
 * the chord sheet, whose pages move sideways, tells it with `near`.
 * `view`: the zoom of the chord sheet and the part of the page that shows
 * (see `file-view.ts`). Only that part is drawn, so a large zoom stays sharp.
 */
export function PdfPage({
  doc,
  number,
  size,
  width,
  label,
  failedText,
  near: nearProp,
  view = FIT_VIEW,
}: {
  doc: PDFDocumentProxy;
  number: number;
  size: PageSize;
  width: number;
  label: string;
  failedText: string;
  near?: boolean;
  view?: FileView;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nearScreen, setNearScreen] = useState(false);
  const near = nearProp ?? nearScreen;
  const [failed, setFailed] = useState(false);
  const height = Math.floor((width * size.height) / size.width);
  const findsNear = nearProp === undefined;

  // The view to draw: during a pinch the view changes on every move, so the
  // page draws again only when it stops. Until then the drawn page moves with CSS.
  const [drawView, setDrawView] = useState(view);
  const changed = !sameView(view, drawView);
  useEffect(() => {
    if (!changed) return;
    const timer = setTimeout(() => setDrawView(view), ZOOM_DRAW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [changed, view]);
  // The view of the page on the canvas. Null: nothing is drawn.
  const drawnRef = useRef<FileView | null>(null);
  const latestRef = useRef({ view, width, height });
  useLayoutEffect(() => {
    latestRef.current = { view, width, height };
    const canvas = canvasRef.current;
    if (canvas && drawnRef.current)
      canvas.style.transform = viewTransform(view, width, height, drawnRef.current);
  });

  useEffect(() => {
    const box = boxRef.current;
    if (!box || !findsNear) return;
    // About two screens above and below.
    const observer = new IntersectionObserver(([entry]) => setNearScreen(entry!.isIntersecting), {
      rootMargin: "200% 0px",
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, [findsNear]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!near) {
      // Frees the memory of the page.
      canvas.width = 0;
      canvas.height = 0;
      drawnRef.current = null;
      return;
    }

    let cancelled = false;
    let task: RenderTask | null = null;
    // The page draws on another canvas first, so the old one shows until the new one is ready.
    const work = document.createElement("canvas");
    doc
      .getPage(number)
      .then((page) => {
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        // Canvas pixels for each CSS pixel of the box.
        const ratio = Math.min(
          window.devicePixelRatio || 1,
          Math.sqrt(MAX_CANVAS_PIXELS / (width * height)),
        );
        const scale = ((width * drawView.zoom) / base.width) * ratio;
        // Only the part of the page in the box: its top left corner is at the top left of the canvas.
        const viewport = page.getViewport({
          scale,
          offsetX: -(drawView.x * drawView.zoom - 0.5) * width * ratio,
          offsetY: -(drawView.y * drawView.zoom - 0.5) * height * ratio,
        });
        work.width = Math.floor(width * ratio);
        work.height = Math.floor(height * ratio);
        task = page.render({ canvas: work, viewport });
        return task.promise.then(() => {
          if (cancelled) return;
          canvas.width = work.width;
          canvas.height = work.height;
          canvas.getContext("2d")?.drawImage(work, 0, 0);
          drawnRef.current = drawView;
          const latest = latestRef.current;
          canvas.style.transform = viewTransform(
            latest.view,
            latest.width,
            latest.height,
            drawView,
          );
        });
      })
      .then(() => {
        if (!cancelled) setFailed(false);
      })
      .catch((error: unknown) => {
        if (cancelled || (error instanceof Error && error.name === "RenderingCancelledException"))
          return;
        setFailed(true);
      })
      .finally(() => {
        // Frees the memory of the other canvas.
        work.width = 0;
        work.height = 0;
      });

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, number, width, height, near, drawView]);

  return (
    <div
      ref={boxRef}
      role="img"
      aria-label={label}
      className="relative overflow-hidden bg-white shadow-sm ring-1 ring-black/10"
      style={{ width, height }}
    >
      <canvas ref={canvasRef} className="size-full origin-top-left" />
      {failed && (
        <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-muted">
          {failedText}
        </p>
      )}
    </div>
  );
}

/** The width of the content box of the element, in CSS pixels. 0 before the first measure. */
function useWidth(element: HTMLElement | null): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.floor(entry!.contentRect.width)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return width;
}
