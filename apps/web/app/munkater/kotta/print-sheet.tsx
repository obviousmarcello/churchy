"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Menu } from "@base-ui/react/menu";
import { PrinterIcon } from "lucide-react";

import { Button } from "@/components/music/ui/button";
import { useI18n } from "@/i18n/music/client";
import { cn } from "@/lib/music/utils";
import type { SongImageDTO, SongImagePageDTO } from "@/server/music/models/images";
import { fitPage, type SheetRoom } from "./sheet-room";

// The print of the sheet: its songs on paper, without the buttons of the page.
// Each song shows as on the screen, with the settings of the sheet: the chords
// or no chords, the key and the capo, the section order, the repeats, the
// user's marks, or the score, the PDF file or the image in place of the chords.
// The browser saves the print as a PDF file too.
//
// The print sheet is a portal at the end of <body>. On the screen it is out of
// sight, but it has its layout: the scores, the PDF files and the images fit
// their pages to the paper. When all of them are ready, the browser's print
// dialog opens. On paper, the print sheet replaces the whole page.

/** The width of the text on paper, in CSS pixels: A4 (180 mm) and Letter (7.5 in) with margins of 15 mm. */
export const PRINT_WIDTH_PX = 680;
/** The height of a page on paper, in CSS pixels, for both A4 and Letter. */
export const PRINT_HEIGHT_PX = 940;
/** The text size on paper, in CSS pixels (about 11 pt). The text size of the screen is for the distance of a music stand. */
export const PRINT_FONT_PX = 15;
/** The print starts after this time also when a part did not load. */
const PRINT_TIMEOUT_MS = 30_000;

// The rules are in the print sheet, so they apply only while it is there.
const PRINT_CSS = `
[data-print-sheet] {
  position: fixed;
  top: 0;
  left: -100000px;
  width: ${PRINT_WIDTH_PX}px;
  visibility: hidden;
  pointer-events: none;
}
@media print {
  @page { margin: 15mm; }
  html, body { background: white !important; height: auto !important; overflow: visible !important; }
  body > :not([data-print-sheet]) { display: none !important; }
  [data-print-sheet] { position: static; max-width: ${PRINT_WIDTH_PX}px; width: auto; visibility: visible; }
  /* A {new_page} of the chart starts a new page of paper. */
  [data-print-sheet] .break-before-column { break-before: page; }
}`;

// The colors of white paper, in both themes.
const PAPER_COLORS = {
  "--sheet-bg": "white",
  "--sheet-fg": "black",
  "--sheet-muted": "oklch(0.4 0 0)",
  "--sheet-chord": "oklch(0.45 0.15 30)",
  "--sheet-rule": "oklch(0.7 0 0)",
} as React.CSSProperties;

type PrintWaits = { add: (id: string) => void; remove: (id: string) => void };
const PrintWaitContext = createContext<PrintWaits | null>(null);

/** While `waiting` is true, the print waits for this part, e.g. a score that is not engraved yet. */
export function usePrintWait(waiting: boolean) {
  const waits = useContext(PrintWaitContext);
  const id = useId();
  useLayoutEffect(() => {
    if (!waits || !waiting) return;
    waits.add(id);
    return () => waits.remove(id);
  }, [waits, waiting, id]);
}

/**
 * The room for each page of a score, a PDF file or an image on paper: the
 * width of the text, and the height under the song's title. When the title
 * fills most of the page, the full height: the pages then start on the next
 * page. Give the ref to an empty element at the top of the pages, in the
 * `<article>` of the song. The room is null until the measure.
 */
export function usePrintRoom(): [SheetRoom | null, (marker: HTMLElement | null) => void] {
  const [room, setRoom] = useState<SheetRoom | null>(null);
  const measure = useCallback((marker: HTMLElement | null) => {
    const article = marker?.closest("article");
    if (!marker || !article) return;
    const top = marker.getBoundingClientRect().top - article.getBoundingClientRect().top;
    const below = PRINT_HEIGHT_PX - top;
    // In steps of 8 px, as on the screen.
    const height = Math.floor((below >= PRINT_HEIGHT_PX / 3 ? below : PRINT_HEIGHT_PX) / 8) * 8;
    setRoom((current) =>
      current?.height === height ? current : { width: PRINT_WIDTH_PX, height },
    );
  }, []);
  return [room, measure];
}

/**
 * The print sheet with `children`, the songs: one `<article>` each. It opens
 * the print dialog when all the parts are ready, and calls `onDone` after the
 * print. `title` is the title of the document while it prints: the browser
 * names the PDF file with it. A new print needs a new `key`.
 */
export function PrintSheet({
  title,
  onDone,
  children,
}: {
  title: string;
  onDone: () => void;
  children: React.ReactNode;
}) {
  const { m } = useI18n();
  // The parts that are not ready yet. A ref, so the check before the print sees the latest ones.
  const waiting = useRef(new Set<string>());
  const [version, setVersion] = useState(0);
  const waits = useMemo<PrintWaits>(
    () => ({
      add: (id) => {
        waiting.current.add(id);
        setVersion((value) => value + 1);
      },
      remove: (id) => {
        waiting.current.delete(id);
        setVersion((value) => value + 1);
      },
    }),
    [],
  );
  const [timedOut, setTimedOut] = useState(false);
  const [printed, setPrinted] = useState(false);
  const printedRef = useRef(false);
  const latestOnDone = useRef(onDone);
  useLayoutEffect(() => {
    latestOnDone.current = onDone;
  });

  // Gives the page its title back, e.g. when a new print replaces this one before the end of the print.
  const restoreTitle = useRef<(() => void) | null>(null);
  useEffect(() => () => restoreTitle.current?.(), []);

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), PRINT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (printedRef.current || (waiting.current.size > 0 && !timedOut)) return;
    let cancelled = false;
    // Two frames: the parts that became ready have their layout. Then the fonts.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        void document.fonts.ready.then(() => {
          if (cancelled || printedRef.current || (waiting.current.size > 0 && !timedOut)) return;
          printedRef.current = true;
          setPrinted(true);
          const pageTitle = document.title;
          document.title = title;
          const restore = () => {
            window.removeEventListener("afterprint", afterPrint);
            document.title = pageTitle;
          };
          const afterPrint = () => {
            restore();
            latestOnDone.current();
          };
          restoreTitle.current = restore;
          window.addEventListener("afterprint", afterPrint);
          window.print();
        });
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [version, timedOut, title]);

  return (
    <>
      {!printed && (
        <div
          role="status"
          className="fixed top-[max(0.5rem,env(safe-area-inset-top))] left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-surface/95 py-1 pr-1 pl-3 text-xs text-muted shadow-sm backdrop-blur-sm"
        >
          <PrinterIcon aria-hidden className="size-3.5" />
          {m.sheet.print.preparing}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 rounded-full px-2 text-xs"
            onClick={onDone}
          >
            {m.common.actions.cancel}
          </Button>
        </div>
      )}
      {createPortal(
        <div
          data-print-sheet
          aria-hidden
          className="bg-(--sheet-bg) text-(--sheet-fg)"
          style={{ ...PAPER_COLORS, fontSize: PRINT_FONT_PX }}
        >
          <style>{PRINT_CSS}</style>
          <PrintWaitContext value={waits}>{children}</PrintWaitContext>
        </div>,
        document.body,
      )}
    </>
  );
}

/**
 * The print button of the header. With several songs it opens a menu: the
 * song at the top of the screen, or all the songs.
 */
export function PrintButton({
  severalSongs,
  onPrint,
  className,
}: {
  severalSongs: boolean;
  onPrint: (scope: "song" | "all") => void;
  className?: string;
}) {
  const { m } = useI18n();
  const t = m.sheet.print;

  if (!severalSongs) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className={className}
        aria-label={t.button}
        title={t.button}
        onClick={() => onPrint("all")}
      >
        <PrinterIcon />
      </Button>
    );
  }

  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className={className}
            aria-label={t.button}
            title={t.button}
          />
        }
      >
        <PrinterIcon />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={8} align="end" collisionPadding={8} className="z-50">
          <Menu.Popup className="max-w-[calc(100vw-1rem)] min-w-48 origin-[var(--transform-origin)] rounded-lg border bg-surface-raised p-1 text-text shadow-lg outline-none transition-[scale,opacity] duration-100 ease-out data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            {(["song", "all"] as const).map((scope) => (
              <Menu.Item
                key={scope}
                onClick={() => onPrint(scope)}
                className="flex cursor-default items-center rounded-md px-2 py-2 text-sm outline-none select-none data-highlighted:bg-surface-sunken"
              >
                {scope === "song" ? t.thisSong : t.allSongs}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

/** The pages of an image on paper: the whole of each page, as large as fits a page of paper. */
export function PrintImage({ image }: { image: SongImageDTO }) {
  const { m } = useI18n();
  const [room, marker] = usePrintRoom();

  return (
    <div>
      <div ref={marker} aria-hidden />
      {image.pages.length === 0 ? (
        <p className="text-(--sheet-muted) italic">{m.songs.imageView.noPages.title}</p>
      ) : (
        room &&
        image.pages.map((page, index) => (
          <PrintImagePage
            key={page.id}
            page={page}
            number={index + 1}
            count={image.pages.length}
            room={room}
          />
        ))
      )}
    </div>
  );
}

function PrintImagePage({
  page,
  number,
  count,
  room,
}: {
  page: SongImagePageDTO;
  number: number;
  count: number;
  room: SheetRoom;
}) {
  const { m, format } = useI18n();
  const t = m.songs.imageView;
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  usePrintWait(state === "loading");
  // The first page fits under the title, the next ones fill a page of paper.
  const { width, height } = fitPage(
    page,
    number === 1 ? room : { width: PRINT_WIDTH_PX, height: PRINT_HEIGHT_PX },
  );
  const label = format(t.page, { page: number, count });

  return (
    <div
      className={cn("mx-auto break-inside-avoid", number > 1 && "break-before-page")}
      style={{ width, height }}
    >
      {state === "failed" ? (
        <p className="flex size-full items-center justify-center p-4 text-center text-sm">
          {t.pageFailed}
        </p>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- a private file: the image optimizer cannot read it.
        <img
          src={page.url}
          alt={label}
          width={page.width}
          height={page.height}
          className="size-full"
          onLoad={() => setState("ready")}
          onError={() => setState("failed")}
        />
      )}
    </div>
  );
}
