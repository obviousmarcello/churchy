"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { ListMusicIcon } from "lucide-react";

import { Button } from "@/components/music/ui/button";
import { useI18n } from "@/i18n/music/client";
import { cn } from "@/lib/music/utils";
import { usePrintRoom, usePrintWait } from "./print-sheet";
import type { PlayableTimeline } from "./score-player";
import type { ScoreRequest, ScoreResponse, ScoreTimeline } from "./score-worker";
import { useSheetRoom, type SheetRoom } from "./sheet-room";

// A MusicXML score on the sheet, instead of the chords. Verovio engraves it
// in a worker, in pages of the size of a sheet page, so the sheet turns its
// pages as for the chords. The score moves to the key of the sheet: a new key
// engraves it again.

/** The size of the score at 100 % text size, in percent of Verovio's own size. */
const SCORE_SCALE = 45;

/**
 * The score of a song on the sheet, in pages that fit the page of the sheet.
 * `transpose` is a Verovio interval (see `scoreTranspose`), or null to show it
 * as written. `onLayout` runs when the pages change, so the sheet can measure
 * them again. `onTimeline` gets the notes of the pages, for the playback; the
 * notes in `active` light up, and `onReveal` gets the first of them, so the
 * sheet can turn to its page.
 */
export function ScoreView({
  url,
  transpose,
  showChords,
  sizePercent,
  active,
  onLayout,
  onTimeline,
  onReveal,
  onNoteClick,
  onShowChords,
}: {
  url: string;
  transpose: string | null;
  /** False: without the chord names of the score. */
  showChords: boolean;
  /** The text size of the sheet, in percent. */
  sizePercent: number;
  /** The ids of the notes that sound now. */
  active: string[];
  onLayout: () => void;
  onTimeline: (timeline: PlayableTimeline) => void;
  onReveal: (element: Element) => void;
  /** Without it, a tap on a note does what a tap on the sheet does: it turns the page. */
  onNoteClick?: (noteId: string) => void;
  /** Shows the chords when the score cannot show. Without it, e.g. in a preview, there is no button. */
  onShowChords?: () => void;
}) {
  const { m } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  // The worker engraves only the newest request of this view (see `engraveScore`).
  const view = useId();
  // The room for each page: the width of a sheet page, and its height under the song's title.
  const [marker, setMarker] = useState<HTMLDivElement | null>(null);
  const room = useSheetRoom(marker);
  // Null while the first pages load. `pages` is null when the score cannot show.
  const [result, setResult] = useState<{
    pages: string[] | null;
    timeline: ScoreTimeline | null;
  } | null>(null);
  // The latest functions, so the pages do not need to depend on them.
  const callbacks = useRef({ onLayout, onTimeline, onReveal });
  useLayoutEffect(() => {
    callbacks.current = { onLayout, onTimeline, onReveal };
  });

  const scale = Math.round((SCORE_SCALE * sizePercent) / 100);

  useEffect(() => {
    if (!room) return;
    let current = true;
    loadScore(url)
      .then((data) => engraveScore(data, engraveOptions(scale, room, transpose), showChords, view))
      .then(
        // Null: a newer request of this view replaced it.
        (engraved) => current && engraved && setResult(engraved),
        (error: unknown) => {
          console.error("[score] Failed to show the score:", error);
          if (current) setResult({ pages: null, timeline: null });
        },
      );
    return () => {
      current = false;
    };
  }, [url, transpose, showChords, scale, room, view]);

  // The old pages stay until the new ones are ready, e.g. after a change of the key.
  const pages = result?.pages;
  const timeline = result?.timeline;
  useLayoutEffect(() => {
    callbacks.current.onLayout();
    // The voice of each note comes from its place in the pages: its staff, and its layer in the staff.
    const container = ref.current;
    if (!container || !timeline) return;
    callbacks.current.onTimeline({
      bars: timeline.bars,
      notes: timeline.notes.map((note) => ({
        ...note,
        voice: noteVoice(container.querySelector(`#${CSS.escape(note.id)}`)),
      })),
    });
  }, [pages, timeline]);

  // The notes that sound light up. The first one shows on the screen.
  const activeKey = active.join(" ");
  useEffect(() => {
    const container = ref.current;
    if (!container || !activeKey) return;
    const elements = activeKey
      .split(" ")
      .flatMap((id) => container.querySelector(`#${CSS.escape(id)}`) ?? []);
    for (const element of elements) element.classList.add("score-playing");
    if (elements[0]) callbacks.current.onReveal(elements[0]);
    return () => {
      for (const element of elements) element.classList.remove("score-playing");
    };
  }, [activeKey, pages]);

  return (
    <div
      ref={ref}
      data-score
      className={cn(
        "[&_.score-playing]:fill-primary [&_.score-playing]:text-primary",
        onNoteClick && "[&_.chord]:cursor-pointer [&_.note]:cursor-pointer",
      )}
      onClick={
        onNoteClick &&
        ((event) => {
          // A note, or the stem of a chord: its first note.
          const target = event.target instanceof Element ? event.target : null;
          const note =
            target?.closest(".note") ?? target?.closest(".chord")?.querySelector(".note");
          if (!note?.id) return;
          // Not a page turn.
          event.stopPropagation();
          onNoteClick(note.id);
        })
      }
    >
      <div ref={setMarker} aria-hidden />
      {result === null ? (
        <p className="text-(--sheet-muted) italic">{m.sheet.scores.loading}</p>
      ) : pages === null ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-(--sheet-muted) italic">{m.sheet.scores.failed}</p>
          {onShowChords && (
            <Button variant="outline" size="sm" onClick={onShowChords}>
              <ListMusicIcon />
              {m.sheet.scores.showChords}
            </Button>
          )}
        </div>
      ) : (
        pages?.map((svg, index) => <ScorePage key={index} svg={svg} />)
      )}
    </div>
  );
}

function ScorePage({ svg, className }: { svg: string; className?: string }) {
  return (
    <div
      // Verovio draws the strokes in `currentColor` and leaves the fills black. Both take the color of
      // the sheet's text, so the score shows in the dark theme too.
      className={cn(
        "break-inside-avoid [&_svg]:h-auto [&_svg]:w-full [&_svg]:fill-current [&_svg]:text-(--sheet-fg)",
        className,
      )}
      // Verovio writes the SVG from the checked MusicXML, and `cleanSvg` removes any script from it.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/**
 * The score on paper: its pages fit the pages of paper (see `print-sheet.tsx`).
 * The same values as `ScoreView`, without the playback.
 */
export function PrintScore({
  url,
  transpose,
  showChords,
  sizePercent,
}: {
  url: string;
  transpose: string | null;
  showChords: boolean;
  sizePercent: number;
}) {
  const { m } = useI18n();
  const view = useId();
  const [room, marker] = usePrintRoom();
  // Null while the pages load, and when the score cannot show.
  const [pages, setPages] = useState<string[] | null | undefined>(undefined);
  usePrintWait(pages === undefined);
  const scale = Math.round((SCORE_SCALE * sizePercent) / 100);

  useEffect(() => {
    if (!room) return;
    let current = true;
    loadScore(url)
      .then((data) => engraveScore(data, engraveOptions(scale, room, transpose), showChords, view))
      .then(
        (engraved) => current && engraved && setPages(engraved.pages),
        (error: unknown) => {
          console.error("[score] Failed to print the score:", error);
          if (current) setPages(null);
        },
      );
    return () => {
      current = false;
    };
  }, [url, transpose, showChords, scale, room, view]);

  return (
    <div data-score>
      <div ref={marker} aria-hidden />
      {pages === undefined ? (
        <p className="text-(--sheet-muted) italic">{m.sheet.scores.loading}</p>
      ) : pages === null ? (
        <p className="text-(--sheet-muted) italic">{m.sheet.scores.failed}</p>
      ) : (
        pages.map((svg, index) => (
          <ScorePage key={index} svg={svg} className={cn(index > 0 && "break-before-page")} />
        ))
      )}
    </div>
  );
}

/** The options of Verovio for pages of the size of `room`, in CSS pixels. */
function engraveOptions(
  scale: number,
  room: SheetRoom,
  transpose: string | null,
): ScoreRequest["options"] {
  return {
    scale,
    pageWidth: clamp(Math.round((room.width * 100) / scale), 100, 100_000),
    pageHeight: clamp(Math.round((room.height * 100) / scale), 100, 60_000),
    adjustPageHeight: true,
    breaks: "auto",
    // The sheet shows the title of the song.
    header: "none",
    footer: "none",
    svgViewBox: true,
    pageMarginLeft: 0,
    pageMarginRight: 0,
    pageMarginTop: 0,
    pageMarginBottom: 0,
    transpose: transpose ?? "",
    // The numbers of the staff and the layer of each note, for its voice (see `noteVoice`).
    svgAdditionalAttribute: ["staff@n", "layer@n"],
  };
}

// The files, once for each page load. A failed load tries again the next time.
const files = new Map<string, Promise<string>>();

/** The MusicXML text that the server checked. The server unpacks a compressed file. */
function loadScore(url: string): Promise<string> {
  let file = files.get(url);
  if (!file) {
    file = fetch(url).then(async (response) => {
      if (!response.ok) throw new Error(`Failed to load the score: ${response.status}`);
      const text = await response.text();
      // Verovio reads other data (e.g. an archive from an old route) as an empty score, without an error.
      if (!/<score-partwise\b/.test(text)) throw new Error("The score file is not MusicXML text");
      return text;
    });
    file.catch(() => files.delete(url));
    files.set(url, file);
  }
  return file;
}

// One worker for the whole sheet. It starts with the first score.
let worker: Worker | null = null;
let nextRequest = 0;
type Engraved = { pages: string[]; timeline: ScoreTimeline };
const pending = new Map<
  number,
  { resolve: (engraved: Engraved) => void; reject: (error: Error) => void }
>();
// The views that the worker engraves for now, and the newest request of each view that waits for it.
const busyViews = new Set<string>();
const waiting = new Map<string, { start: () => void; skip: () => void }>();

/**
 * Engraves the score for the view `view`. While the worker engraves for the
 * view, only its newest request waits. An older one gives null and does not
 * engrave, e.g. each size on the way during a resize.
 */
function engraveScore(
  data: string,
  options: ScoreRequest["options"],
  chords: boolean,
  view: string,
): Promise<Engraved | null> {
  return new Promise((resolve, reject) => {
    function start() {
      busyViews.add(view);
      postToWorker(data, options, chords)
        .then(resolve, reject)
        .finally(() => {
          busyViews.delete(view);
          const next = waiting.get(view);
          waiting.delete(view);
          next?.start();
        });
    }
    if (!busyViews.has(view)) return start();
    waiting.get(view)?.skip();
    waiting.set(view, { start, skip: () => resolve(null) });
  });
}

function postToWorker(
  data: string,
  options: ScoreRequest["options"],
  chords: boolean,
): Promise<Engraved> {
  if (!worker) {
    worker = new Worker(new URL("./score-worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<ScoreResponse>) => {
      const response = event.data;
      const request = pending.get(response.id);
      pending.delete(response.id);
      if (!request) return;
      if ("error" in response) return request.reject(new Error(response.error));
      try {
        request.resolve({ pages: response.pages.map(cleanSvg), timeline: response.timeline });
      } catch (error) {
        request.reject(error instanceof Error ? error : new Error(String(error)));
      }
    };
    worker.onerror = (event) => {
      // The worker did not load. All waiting scores fail; the next one starts a new worker.
      for (const request of pending.values())
        request.reject(new Error(event.message || "The score worker failed"));
      pending.clear();
      worker?.terminate();
      worker = null;
    };
  }

  const id = ++nextRequest;
  const request: ScoreRequest = { id, data, options, chords };
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker!.postMessage(request);
  });
}

/**
 * A page of Verovio without scripts, event attributes or links to other
 * sites. The score is a file of a user, and the page goes into the sheet as
 * HTML: if Verovio copies a part of the file into the SVG, it must not run.
 */
function cleanSvg(svg: string): string {
  // Without a DOM (an old browser), DOMPurify does not clean, and returns the text as it is.
  if (!DOMPurify.isSupported) throw new Error("The score cannot show safely in this browser");
  // Verovio draws each glyph (clef, notehead, rest) as a `<use>` of a symbol in
  // the same SVG. The SVG profile removes `<use>`, so it comes back here, but
  // only for links in the page: a `<use>` of another file is removed.
  const page = DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true },
    ADD_TAGS: ["use"],
    FORBID_TAGS: ["a", "image", "foreignObject"],
    RETURN_DOM_FRAGMENT: true,
  });
  for (const use of page.querySelectorAll("use")) {
    const links = [use.getAttribute("href"), use.getAttribute("xlink:href")].filter(
      (link) => link !== null,
    );
    if (links.length === 0 || links.some((link) => !link.startsWith("#"))) use.remove();
  }
  const box = document.createElement("div");
  box.append(page);
  return box.innerHTML;
}

/**
 * "staff.layer" from 1, e.g. "2.1": the numbers of the note's staff and layer.
 * The number, not the place: a measure can leave out a layer, e.g. voice 1
 * when only voice 2 plays. Without numbers, the place in the measure.
 */
function noteVoice(element: Element | null): string {
  const staff = element?.closest(".staff");
  const layer = element?.closest(".layer");
  if (!staff || !layer) return "1.1";
  const staffNumber =
    numberOf(staff) ??
    Array.from(staff.parentElement?.children ?? [])
      .filter((child) => child.classList.contains("staff"))
      .indexOf(staff) + 1;
  const layerNumber =
    numberOf(layer) ??
    Array.from(staff.children)
      .filter((child) => child.classList.contains("layer"))
      .indexOf(layer) + 1;
  return `${staffNumber}.${layerNumber}`;
}

/** The `@n` of a staff or layer, from `svgAdditionalAttribute`. */
function numberOf(element: Element): number | null {
  const value = Number(element.getAttribute("data-n"));
  return Number.isInteger(value) && value > 0 ? value : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
