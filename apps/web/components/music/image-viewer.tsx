"use client";

import { useEffect, useState } from "react";
import { ImageOffIcon, MoveHorizontalIcon, ZoomInIcon, ZoomOutIcon } from "lucide-react";

import { PageHeader } from "@/components/music/page-header";
import { PreviewEmpty } from "@/components/music/preview-layout";
import { Button } from "@/components/music/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/music/ui/empty";
import { useI18n } from "@/i18n/music/client";
import { usePinchZoom, zoomStep } from "@/lib/music/pinch-zoom";
import type { SongImagePageDTO } from "@/server/music/models/images";

// Shows the pages of an image one under the other, as wide as the viewer at
// the zoom of 100%. The browser loads only the pages near the screen.

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

/** The page of an image: the header with the zoom, then the pages. */
export function ImageViewer({
  pages,
  header,
}: {
  pages: SongImagePageDTO[];
  header: Omit<React.ComponentProps<typeof PageHeader>, "actions">;
}) {
  const { m, plural, format } = useI18n();
  const t = m.songs.imageView;
  const [zoom, setZoom] = useState(1);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const width = useWidth(container);
  usePinchZoom(container, {
    zoom,
    min: ZOOM_STEPS[0]!,
    max: ZOOM_STEPS[ZOOM_STEPS.length - 1]!,
    onZoom: setZoom,
  });

  if (pages.length === 0) {
    return (
      <>
        <PageHeader {...header} />
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ImageOffIcon />
            </EmptyMedia>
            <EmptyTitle>{t.noPages.title}</EmptyTitle>
            <EmptyDescription>{t.noPages.description}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </>
    );
  }

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
        {pages.length > 1 && (
          <p className="mb-3 text-center text-sm text-muted">{plural(t.pageCount, pages.length)}</p>
        )}
        {width > 0 && (
          <ol data-zoom-content className="flex w-max min-w-full flex-col items-center gap-4">
            {pages.map((page, index) => (
              <li key={page.id}>
                <ImagePage
                  page={page}
                  // Not wider than the stored image at 100%: a small scan stays sharp.
                  width={Math.floor(Math.min(width, page.width) * zoom)}
                  label={format(t.page, { page: index + 1, count: pages.length })}
                  failedText={t.pageFailed}
                />
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  );
}

/**
 * The pages of an image in a preview, e.g. on the edit page of a song: one
 * under the other, as wide as the preview, without the zoom.
 */
export function ImagePreview({ pages }: { pages: SongImagePageDTO[] }) {
  const { m, format } = useI18n();
  const t = m.songs.imageView;
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const width = useWidth(container);

  if (pages.length === 0) {
    return (
      <PreviewEmpty
        icon={<ImageOffIcon aria-hidden />}
        title={t.noPages.title}
        description={t.noPages.description}
      />
    );
  }

  return (
    <div ref={setContainer}>
      {width > 0 && (
        <ol className="flex flex-col items-center gap-4">
          {pages.map((page, index) => (
            <li key={page.id}>
              <ImagePage
                page={page}
                width={Math.min(width, page.width)}
                label={format(t.page, { page: index + 1, count: pages.length })}
                failedText={t.pageFailed}
              />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** One page, `width` CSS pixels wide. Its place has the right height before it loads. */
function ImagePage({
  page,
  width,
  label,
  failedText,
}: {
  page: SongImagePageDTO;
  width: number;
  label: string;
  failedText: string;
}) {
  const [failed, setFailed] = useState(false);
  const height = Math.floor((width * page.height) / page.width);

  return (
    <div className="relative bg-white shadow-sm ring-1 ring-black/10" style={{ width, height }}>
      {failed ? (
        <p
          role="img"
          aria-label={label}
          className="flex size-full items-center justify-center p-4 text-center text-sm text-muted"
        >
          {failedText}
        </p>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- a private file: the image optimizer cannot read it.
        <img
          src={page.url}
          alt={label}
          width={page.width}
          height={page.height}
          loading="lazy"
          decoding="async"
          className="size-full"
          onError={() => setFailed(true)}
        />
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
