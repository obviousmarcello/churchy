"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { DownloadIcon, RotateCwIcon } from "lucide-react";

import { PdfPage, usePdfDocument, type PageSize } from "@/components/music/pdf-viewer";
import { Button, buttonVariants } from "@/components/music/ui/button";
import { useI18n } from "@/i18n/music/client";
import type { FileView } from "@/lib/music/file-view";
import { MAX_CANVAS_PIXELS } from "@/lib/music/pdfjs";
import { cn } from "@/lib/music/utils";
import { PRINT_HEIGHT_PX, PRINT_WIDTH_PX, usePrintRoom, usePrintWait } from "./print-sheet";
import { fitPage, useNearScreen, useSheetRoom, type SheetRoom } from "./sheet-room";
import { useFileZoom } from "./sheet-zoom";

// A PDF file on the sheet, instead of the chords. Each page of the file fills
// a page of the sheet, so the sheet turns its pages as for the chords. Only
// the pages on the screen and next to it are drawn. A pinch zooms all the
// pages of the file (see `sheet-zoom.ts`).
//
// The file loads at once, also when it is far from the screen: the sheet needs
// the number and the sizes of its pages for its layout. A file that loads
// later adds pages, and the song on the screen moves. Also, the pages of the
// next songs draw without the network, e.g. in a church with a bad connection.

/**
 * The pages of the PDF file of `url`. `onLayout` runs when the pages change,
 * so the sheet can measure them again. `view`: the user's zoom of the file;
 * `onViewChange` gets a new one at the end of a pinch.
 */
export function SheetPdf({
  url,
  view,
  onViewChange,
  onLayout,
}: {
  url: string;
  view: FileView;
  onViewChange: (view: FileView) => void;
  onLayout: () => void;
}) {
  const { m } = useI18n();
  const t = m.songs.pdfView;
  const [attempt, setAttempt] = useState(0);
  const state = usePdfDocument(url, attempt);
  const [marker, setMarker] = useState<HTMLDivElement | null>(null);
  const room = useSheetRoom(marker);
  const [shownView, setZoomElement] = useFileZoom(view, onViewChange);

  const latestOnLayout = useRef(onLayout);
  useLayoutEffect(() => {
    latestOnLayout.current = onLayout;
  });
  const pageCount = state.status === "ready" ? state.sizes.length : -1;
  useLayoutEffect(() => {
    latestOnLayout.current();
  }, [state.status, pageCount, room]);

  let content: React.ReactNode;
  if (state.status === "loading") {
    content = <p className="text-(--sheet-muted) italic">{t.loading}</p>;
  } else if (state.status !== "ready" || state.sizes.length === 0) {
    const text =
      state.status === "password"
        ? t.passwordProtected
        : state.status === "failed"
          ? t.loadFailed
          : t.noPages;
    content = (
      <div className="flex flex-col items-start gap-2">
        <p className="font-medium">{text.title}</p>
        <p className="text-(--sheet-muted)">{text.description}</p>
        <div className="flex flex-wrap gap-2">
          {state.status === "failed" && (
            <Button variant="outline" size="sm" onClick={() => setAttempt(attempt + 1)}>
              <RotateCwIcon />
              {t.tryAgain}
            </Button>
          )}
          <a
            href={`${url}?download=1`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <DownloadIcon />
            {t.download}
          </a>
        </div>
      </div>
    );
  } else {
    content =
      room &&
      state.sizes.map((size, index) => (
        <SheetPdfPage
          key={index}
          doc={state.doc}
          number={index + 1}
          count={state.sizes.length}
          size={size}
          room={room}
          view={shownView}
        />
      ));
  }

  return (
    // `touch-none`: the pinch zooms the file, not the page of the browser.
    <div ref={setZoomElement} className="touch-none">
      <div ref={setMarker} aria-hidden />
      {content}
    </div>
  );
}

/** One page of the file: as large as fits the page of the sheet, from the top of a new page. */
function SheetPdfPage({
  doc,
  number,
  count,
  size,
  room,
  view,
}: {
  doc: PDFDocumentProxy;
  number: number;
  count: number;
  size: PageSize;
  room: SheetRoom;
  view: FileView;
}) {
  const { m, format } = useI18n();
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const near = useNearScreen(element);
  const { width } = fitPage(size, room);

  return (
    <div
      ref={setElement}
      data-file-page
      className={cn("mx-auto w-fit break-inside-avoid", number > 1 && "break-before-column")}
    >
      <PdfPage
        doc={doc}
        number={number}
        size={size}
        width={width}
        label={format(m.songs.pdfView.page, { page: number, count })}
        failedText={m.songs.pdfView.pageFailed}
        near={near}
        view={view}
      />
    </div>
  );
}

/** The pixels of the drawn page for each CSS pixel on paper: about 290 dpi. */
const PRINT_PIXEL_RATIO = 3;

/**
 * The pages of the PDF file of `url` on paper: the whole of each page, as
 * large as fits a page of paper. Without the buttons of the sheet.
 */
export function PrintPdf({ url }: { url: string }) {
  const { m } = useI18n();
  const t = m.songs.pdfView;
  const state = usePdfDocument(url, 0);
  usePrintWait(state.status === "loading");
  const [room, marker] = usePrintRoom();

  let content: React.ReactNode;
  if (state.status === "loading") {
    content = <p className="text-(--sheet-muted) italic">{t.loading}</p>;
  } else if (state.status !== "ready" || state.sizes.length === 0) {
    const text =
      state.status === "password"
        ? t.passwordProtected
        : state.status === "failed"
          ? t.loadFailed
          : t.noPages;
    content = <p className="font-medium">{text.title}</p>;
  } else {
    content =
      room &&
      state.sizes.map((size, index) => (
        <PrintPdfPage
          key={index}
          doc={state.doc}
          number={index + 1}
          size={size}
          room={index === 0 ? room : { width: PRINT_WIDTH_PX, height: PRINT_HEIGHT_PX }}
        />
      ));
  }

  return (
    <div>
      <div ref={marker} aria-hidden />
      {content}
    </div>
  );
}

/** One page on paper. The first one fits under the title, the next ones fill a page of paper. */
function PrintPdfPage({
  doc,
  number,
  size,
  room,
}: {
  doc: PDFDocumentProxy;
  number: number;
  size: PageSize;
  room: SheetRoom;
}) {
  const { m } = useI18n();
  const { width, height } = fitPage(size, room);
  // An image of the page: it uses less memory than a canvas of this size.
  const [image, setImage] = useState<{ url: string } | { failed: true } | null>(null);
  const [loaded, setLoaded] = useState(false);
  usePrintWait(!image || ("url" in image && !loaded));

  useEffect(() => {
    let cancelled = false;
    let task: RenderTask | null = null;
    let objectUrl: string | null = null;
    const canvas = document.createElement("canvas");
    doc
      .getPage(number)
      .then((page) => {
        if (cancelled) return;
        const ratio = Math.min(PRINT_PIXEL_RATIO, Math.sqrt(MAX_CANVAS_PIXELS / (width * height)));
        const viewport = page.getViewport({
          scale: (width * ratio) / page.getViewport({ scale: 1 }).width,
        });
        canvas.width = Math.floor(width * ratio);
        canvas.height = Math.floor(height * ratio);
        task = page.render({ canvas, viewport });
        return task.promise.then(
          () => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png")),
        );
      })
      .then((blob) => {
        if (cancelled) return;
        if (!blob) throw new Error("The page did not draw");
        objectUrl = URL.createObjectURL(blob);
        setImage({ url: objectUrl });
      })
      .catch((error: unknown) => {
        if (cancelled || (error instanceof Error && error.name === "RenderingCancelledException"))
          return;
        console.error("[print] Failed to draw a page of the PDF file:", error);
        setImage({ failed: true });
      })
      .finally(() => {
        // Frees the memory of the canvas.
        canvas.width = 0;
        canvas.height = 0;
      });

    return () => {
      cancelled = true;
      task?.cancel();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [doc, number, width, height]);

  return (
    <div
      className={cn("mx-auto break-inside-avoid", number > 1 && "break-before-page")}
      style={{ width, height }}
    >
      {image && "url" in image ? (
        // eslint-disable-next-line @next/next/no-img-element -- a drawn page in the browser's memory.
        <img
          src={image.url}
          alt=""
          className="size-full"
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
        />
      ) : (
        image && (
          <p className="flex size-full items-center justify-center p-4 text-center text-sm">
            {m.songs.pdfView.pageFailed}
          </p>
        )
      )}
    </div>
  );
}
