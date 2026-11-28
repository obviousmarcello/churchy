"use client";

import { useLayoutEffect, useRef, useState } from "react";

import { useI18n } from "@/i18n/music/client";
import { viewTransform, type FileView } from "@/lib/music/file-view";
import { cn } from "@/lib/music/utils";
import type { SongImageDTO, SongImagePageDTO } from "@/server/music/models/images";
import { fitPage, useNearScreen, useSheetRoom, type SheetRoom } from "./sheet-room";
import { useFileZoom } from "./sheet-zoom";

// An image on the sheet, instead of the chords. Each page of the image fills
// a page of the sheet, so the sheet turns its pages as for the chords. Only
// the pages on the screen and next to it load. A pinch zooms all the pages
// of the image (see `sheet-zoom.ts`).

/**
 * The pages of the image. `onLayout` runs when the pages change, so the sheet
 * can measure them again. `view`: the user's zoom of the image;
 * `onViewChange` gets a new one at the end of a pinch.
 */
export function SheetImage({
  image,
  view,
  onViewChange,
  onLayout,
}: {
  image: SongImageDTO;
  view: FileView;
  onViewChange: (view: FileView) => void;
  onLayout: () => void;
}) {
  const { m } = useI18n();
  const [marker, setMarker] = useState<HTMLDivElement | null>(null);
  const room = useSheetRoom(marker);
  const [shownView, setZoomElement] = useFileZoom(view, onViewChange);

  const latestOnLayout = useRef(onLayout);
  useLayoutEffect(() => {
    latestOnLayout.current = onLayout;
  });
  const pageIds = image.pages.map((page) => page.id).join(" ");
  useLayoutEffect(() => {
    latestOnLayout.current();
  }, [pageIds, room]);

  return (
    // `touch-none`: the pinch zooms the image, not the page of the browser.
    <div ref={setZoomElement} className="touch-none">
      <div ref={setMarker} aria-hidden />
      {image.pages.length === 0 ? (
        <p className="text-(--sheet-muted) italic">{m.songs.imageView.noPages.title}</p>
      ) : (
        room &&
        image.pages.map((page, index) => (
          <SheetImagePage
            key={page.id}
            page={page}
            number={index + 1}
            count={image.pages.length}
            room={room}
            view={shownView}
          />
        ))
      )}
    </div>
  );
}

/** One page: as large as fits the page of the sheet, from the top of a new page. */
function SheetImagePage({
  page,
  number,
  count,
  room,
  view,
}: {
  page: SongImagePageDTO;
  number: number;
  count: number;
  room: SheetRoom;
  view: FileView;
}) {
  const { m, format } = useI18n();
  const t = m.songs.imageView;
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const near = useNearScreen(element);
  const [failed, setFailed] = useState(false);
  const { width, height } = fitPage(page, room);
  const label = format(t.page, { page: number, count });

  return (
    <div
      ref={setElement}
      data-file-page
      className={cn(
        "relative mx-auto break-inside-avoid overflow-hidden bg-white shadow-sm ring-1 ring-black/10",
        number > 1 && "break-before-column",
      )}
      style={{ width, height }}
    >
      {failed ? (
        <p
          role="img"
          aria-label={label}
          className="flex size-full items-center justify-center p-4 text-center text-sm text-muted"
        >
          {t.pageFailed}
        </p>
      ) : (
        near && (
          // eslint-disable-next-line @next/next/no-img-element -- a private file: the image optimizer cannot read it.
          <img
            src={page.url}
            alt={label}
            width={page.width}
            height={page.height}
            decoding="async"
            className="size-full origin-top-left"
            style={{ transform: viewTransform(view, width, height) || undefined }}
            onError={() => setFailed(true)}
          />
        )
      )}
    </div>
  );
}
