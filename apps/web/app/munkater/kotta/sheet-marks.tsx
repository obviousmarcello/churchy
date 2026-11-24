"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Popover } from "@base-ui/react/popover";
import {
  CheckIcon,
  EraserIcon,
  HighlighterIcon,
  PenIcon,
  Redo2Icon,
  TypeIcon,
  Undo2Icon,
  XIcon,
} from "lucide-react";

import { Button } from "@/components/music/ui/button";
import { useI18n } from "@/i18n/music/client";
import {
  HIGHLIGHTER_COLORS,
  HIGHLIGHTER_WIDTH,
  MARK_POINTS_MAX,
  MARK_TEXT_MAX,
  PEN_COLORS,
  PEN_WIDTHS,
  TEXT_SIZES,
  addMarkEdits,
  distanceToStroke,
  mergeFreshMarks,
  newMarkId,
  roundEm,
  simplifyStroke,
  strokeBounds,
  strokePath,
  type MarkColor,
  type MarkEdits,
  type SheetMark,
  type StrokeMark,
  type TextMark,
} from "@/lib/music/sheet-marks";
import { cn } from "@/lib/music/utils";
import { Choice } from "./choice";
import { changeMarksAction, listMarksAction } from "./capo-actions";
import { updateSheetSettings, type MarkTool, type SheetSettings } from "./sheet-settings";

// The user's own marks on the sheet: the state with undo and redo, the marks
// in the lines of the sheet, and mark mode (a layer over the sheet that takes
// the pen, the finger or the mouse, and its toolbar). See
// `src/lib/sheet-marks.ts` for the anchors.
//
// `ChordSheet` gives each line that shows a `data-mark-anchor`, and the sheet
// viewer gives each song with an arrangement a `data-mark-arrangement`. Mark
// mode finds the line of a new mark with them.

function marksOf(
  songs: { arrangementId: string | null; marks: SheetMark[] }[],
): Record<string, SheetMark[]> {
  return Object.fromEntries(
    songs.flatMap((song) => (song.arrangementId ? [[song.arrangementId, song.marks]] : [])),
  );
}

/** One action of the user on the marks of an arrangement. Its undo swaps `remove` and `add`. */
type MarkChange = { arrangementId: string; remove: SheetMark[]; add: SheetMark[] };

const HISTORY_MAX = 100;
/** The half width of the eraser, in pixels. */
const ERASER_RADIUS = 12;
/** A text moves when the pointer moves this far, in pixels. Else the tap opens it. */
const DRAG_DISTANCE = 6;
/** The line height of a text mark, in its own `em`. */
const TEXT_LINE_HEIGHT = 1.25;

/**
 * The marks of the songs by arrangement, with undo and redo. Each change
 * shows at once, and the server saves the changes one after the other. When
 * a save fails, the marks of the arrangement are loaded again from the server.
 * After each save, `onSaved` gets the change, as an update of the marks.
 * `isFresh` is false while `songs` is the browser copy.
 */
export function useSheetMarks(
  songs: { arrangementId: string | null; marks: SheetMark[] }[],
  {
    isFresh,
    onSaved,
  }: {
    isFresh: boolean;
    onSaved: (arrangementId: string, update: (marks: SheetMark[]) => SheetMark[]) => void;
  },
) {
  const { m } = useI18n();
  const [marks, setMarks] = useState(() => marksOf(songs));
  const [history, setHistory] = useState<{ undo: MarkChange[]; redo: MarkChange[] }>({
    undo: [],
    redo: [],
  });
  // The changes of the user on this page that the server does not have yet,
  // by arrangement. They go again onto new data from the server (e.g. fresh
  // data after the browser copy).
  const [edits, setEdits] = useState<Readonly<Record<string, MarkEdits>>>({});
  // The arrangements whose changes the server saved while the page showed the
  // browser copy. The request of the fresh data can be older than the saves,
  // so their edits go only after the fresh data.
  const [settled, setSettled] = useState<ReadonlySet<string>>(new Set());
  const [source, setSource] = useState(songs);
  if (songs !== source) {
    setSource(songs);
    setMarks(mergeFreshMarks(marksOf(songs), edits));
    if (isFresh && settled.size > 0) {
      setEdits((current) =>
        Object.fromEntries(Object.entries(current).filter(([id]) => !settled.has(id))),
      );
      setSettled(new Set());
    }
  }
  const [error, setError] = useState<string | null>(null);
  const queue = useRef(Promise.resolve());
  // The changes in the queue, by arrangement.
  const pending = useRef<Record<string, number>>({});
  const freshRef = useRef(isFresh);
  useEffect(() => {
    freshRef.current = isFresh;
  }, [isFresh]);

  const byAnchor = useMemo(() => {
    const result: Record<string, Map<string, SheetMark[]>> = {};
    for (const [arrangementId, list] of Object.entries(marks)) {
      const anchors = new Map<string, SheetMark[]>();
      for (const mark of list)
        anchors.set(mark.anchor, [...(anchors.get(mark.anchor) ?? []), mark]);
      result[arrangementId] = anchors;
    }
    return result;
  }, [marks]);

  function forgetEdits(arrangementId: string) {
    setEdits((current) => {
      const rest = { ...current };
      delete rest[arrangementId];
      return rest;
    });
  }

  function apply(change: MarkChange) {
    const { arrangementId } = change;
    pending.current[arrangementId] = (pending.current[arrangementId] ?? 0) + 1;
    setSettled((current) =>
      current.has(arrangementId)
        ? new Set([...current].filter((id) => id !== arrangementId))
        : current,
    );
    setEdits((current) => ({
      ...current,
      [arrangementId]: addMarkEdits(current[arrangementId], change),
    }));
    setMarks((current) => ({
      ...current,
      [change.arrangementId]: applyChange(current[change.arrangementId] ?? [], change),
    }));
    const kept = new Set(change.add.map((mark) => mark.id));
    const remove = change.remove.map((mark) => mark.id).filter((id) => !kept.has(id));
    queue.current = queue.current.then(async () => {
      let message: string | null;
      try {
        const result = await changeMarksAction(change.arrangementId, {
          upsert: change.add,
          remove,
        });
        message = result.status === "error" ? result.message : null;
      } catch {
        // For example, the device is offline.
        message = m.sheet.marks.saveFailed;
      }
      pending.current[arrangementId]! -= 1;
      if (message === null) {
        onSaved(arrangementId, (list) => applyChange(list, change));
        // The server has all the changes of the arrangement. Its data wins
        // again, e.g. when another device deletes a mark.
        if (pending.current[arrangementId] === 0) {
          if (freshRef.current) forgetEdits(arrangementId);
          else setSettled((current) => new Set([...current, arrangementId]));
        }
        return;
      }
      setError(message);
      // Show the marks that the server has. The undo steps of the arrangement do not fit them anymore.
      const saved = await listMarksAction(change.arrangementId).catch(() => null);
      if (saved) {
        setMarks((current) => ({ ...current, [change.arrangementId]: saved }));
        forgetEdits(change.arrangementId);
      }
      const other = (entry: MarkChange) => entry.arrangementId !== change.arrangementId;
      setHistory((current) => ({
        undo: current.undo.filter(other),
        redo: current.redo.filter(other),
      }));
    });
  }

  function commit(change: MarkChange) {
    if (change.remove.length === 0 && change.add.length === 0) return;
    setError(null);
    apply(change);
    setHistory((current) => ({ undo: [...current.undo, change].slice(-HISTORY_MAX), redo: [] }));
  }

  function undo() {
    const change = history.undo.at(-1);
    if (!change) return;
    setError(null);
    apply({ arrangementId: change.arrangementId, remove: change.add, add: change.remove });
    setHistory((current) => ({ undo: current.undo.slice(0, -1), redo: [...current.redo, change] }));
  }

  function redo() {
    const change = history.redo.at(-1);
    if (!change) return;
    setError(null);
    apply(change);
    setHistory((current) => ({ undo: [...current.undo, change], redo: current.redo.slice(0, -1) }));
  }

  return {
    marks,
    /** The marks of an arrangement, by anchor. */
    byAnchor,
    isEmpty: Object.values(marks).every((list) => list.length === 0),
    commit,
    undo,
    redo,
    canUndo: history.undo.length > 0,
    canRedo: history.redo.length > 0,
    error,
    dismissError: () => setError(null),
  };
}

/** A mark of `add` with the id of a mark in the list takes its place. The other marks of `add` go to the end. */
function applyChange(list: SheetMark[], change: MarkChange): SheetMark[] {
  const added = new Map(change.add.map((mark) => [mark.id, mark]));
  const removed = new Set(change.remove.map((mark) => mark.id));
  const result: SheetMark[] = [];
  for (const mark of list) {
    const replacement = added.get(mark.id);
    if (replacement) {
      result.push(replacement);
      added.delete(mark.id);
    } else if (!removed.has(mark.id)) {
      result.push(mark);
    }
  }
  return [...result, ...added.values()];
}

/**
 * The marks of one anchor. The parent is the anchor (`position: relative`),
 * and the marks are in `em` from its top left corner.
 */
export function MarksLayer({ marks }: { marks: SheetMark[] | undefined }) {
  if (!marks || marks.length === 0) return null;
  const highlights = marks.filter((mark): mark is StrokeMark => mark.kind === "highlighter");
  const lines = marks.filter((mark): mark is StrokeMark => mark.kind === "pen");
  const texts = marks.filter((mark): mark is TextMark => mark.kind === "text");

  return (
    <>
      {highlights.length > 0 && (
        // On light paper the highlight multiplies with the text, so the text stays dark.
        <StrokeLayer
          marks={highlights}
          className="opacity-50 mix-blend-multiply dark:opacity-35 dark:mix-blend-normal"
        />
      )}
      {lines.length > 0 && <StrokeLayer marks={lines} />}
      {texts.map((mark) => (
        <div
          key={mark.id}
          data-mark-id={mark.id}
          aria-hidden
          className="pointer-events-none absolute"
          style={{ left: `${mark.x}em`, top: `${mark.y}em` }}
        >
          <span
            className="block w-max max-w-[24em] font-semibold whitespace-pre-wrap"
            style={{
              fontSize: `${mark.size}em`,
              lineHeight: TEXT_LINE_HEIGHT,
              color: markColor(mark.color),
            }}
          >
            {mark.text}
          </span>
        </div>
      ))}
    </>
  );
}

/** One unit of the SVG is 1 `em` of the line. */
function StrokeLayer({ marks, className }: { marks: StrokeMark[]; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 1 1"
      className={cn(
        "pointer-events-none absolute top-0 left-0 size-[1em] overflow-visible",
        className,
      )}
    >
      {marks.map((mark) => (
        <path
          key={mark.id}
          data-mark-id={mark.id}
          d={strokePath(mark.points)}
          fill="none"
          stroke={markColor(mark.color)}
          strokeWidth={mark.width}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

function markColor(color: MarkColor) {
  return `var(--mark-${color})`;
}

/**
 * A line of the sheet: its arrangement and anchor, its top left corner on the
 * screen, and the size of its song's text in pixels (each song can have its own).
 */
type Anchor = { arrangementId: string; anchor: string; left: number; top: number; emPx: number };

/** The size of the text of the song of an element, in pixels. The marks are in `em` of it. */
function songEmPx(element: Element): number {
  const song = element.closest("[data-mark-arrangement], [data-mark-none]") ?? element;
  return parseFloat(getComputedStyle(song).fontSize);
}

/**
 * The size of the text of the song with the line nearest to a point on the
 * screen, in pixels: a mark there goes to that line (see `anchorAt()`), also
 * from the gap next to a song. `fallback` without a line.
 */
function emPxAt(root: Element, x: number, y: number, fallback: number): number {
  return anchorAt(root, x, y)?.emPx ?? fallback;
}

/**
 * The line nearest to a point on the screen, on the pages of the screen. The
 * anchors are as wide as their page, so this is the nearest line of the page.
 * With `arrangementId`, only the lines of that arrangement.
 */
function anchorAt(root: Element, x: number, y: number, arrangementId?: string): Anchor | null {
  // A song without lines for marks, e.g. a score: a mark there must not go to the nearest line of another song.
  if (onScore(root, x, y)) return null;
  const view = root.getBoundingClientRect();
  const songs = arrangementId
    ? `[data-mark-arrangement="${CSS.escape(arrangementId)}"]`
    : "[data-mark-arrangement]";
  let nearest: { element: HTMLElement; box: DOMRect } | null = null;
  let nearestDistance = Infinity;
  for (const element of root.querySelectorAll<HTMLElement>(`${songs} [data-mark-anchor]`)) {
    const box = element.getBoundingClientRect();
    // A page of another screen.
    if (box.right <= view.left || box.left >= view.right) continue;
    const dx = Math.max(box.left - x, 0, x - box.right);
    const dy = Math.max(box.top - y, 0, y - box.bottom);
    const distance = dx * dx + dy * dy;
    if (distance < nearestDistance) {
      nearest = { element, box };
      nearestDistance = distance;
    }
  }
  const songId =
    nearest?.element.closest<HTMLElement>("[data-mark-arrangement]")?.dataset.markArrangement;
  const anchor = nearest?.element.dataset.markAnchor;
  if (!nearest || !songId || !anchor) return null;
  return {
    arrangementId: songId,
    anchor,
    left: nearest.box.left,
    top: nearest.box.top,
    emPx: songEmPx(nearest.element),
  };
}

/** True when the point on the screen is on a song that takes no marks (`data-mark-none`), e.g. a score. */
function onScore(root: Element, x: number, y: number): boolean {
  for (const element of root.querySelectorAll("[data-mark-none]")) {
    const box = element.getBoundingClientRect();
    if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) return true;
  }
  return false;
}

/** A mark on the screen, with its elements (more than one when the sheet has the arrangement twice). */
type Hit = { arrangementId: string; mark: SheetMark; elements: (HTMLElement | SVGElement)[] };

/** The marks within `radius` pixels of a point on the screen. */
function marksAt(
  root: Element,
  marks: Record<string, SheetMark[]>,
  x: number,
  y: number,
  radius: number,
): Hit[] {
  const byId = new Map(Object.values(marks).flatMap((list) => list.map((mark) => [mark.id, mark])));
  const hits = new Map<string, Hit>();
  // The text size of each song, read once: this runs on each move of the eraser.
  const songSizes = new Map<HTMLElement, number>();
  for (const element of root.querySelectorAll<HTMLElement | SVGElement>("[data-mark-id]")) {
    const song = element.closest<HTMLElement>("[data-mark-arrangement]");
    const arrangementId = song?.dataset.markArrangement;
    const anchor = element.closest<HTMLElement>("[data-mark-anchor]");
    const mark = byId.get(element.dataset.markId ?? "");
    if (!song || !arrangementId || !anchor || !mark) continue;

    let hit: boolean;
    if (mark.kind === "text") {
      const box = element.getBoundingClientRect();
      hit =
        x >= box.left - radius &&
        x <= box.right + radius &&
        y >= box.top - radius &&
        y <= box.bottom + radius;
    } else {
      const box = anchor.getBoundingClientRect();
      const emPx = songSizes.get(song) ?? songEmPx(song);
      songSizes.set(song, emPx);
      const px = (x - box.left) / emPx;
      const py = (y - box.top) / emPx;
      const reach = (radius + (mark.width * emPx) / 2) / emPx;
      const [left, top, right, bottom] = strokeBounds(mark.points);
      hit =
        px >= left - reach &&
        px <= right + reach &&
        py >= top - reach &&
        py <= bottom + reach &&
        distanceToStroke(px, py, mark.points) <= reach;
    }
    if (!hit) continue;
    const entry = hits.get(mark.id) ?? { arrangementId, mark, elements: [] };
    entry.elements.push(element);
    hits.set(mark.id, entry);
  }
  return [...hits.values()];
}

/** A stroke in `em` from its anchor, with fewer points. */
function toStrokePoints(points: number[], anchor: Anchor) {
  const local = points.map(
    (value, index) => (value - (index % 2 === 0 ? anchor.left : anchor.top)) / anchor.emPx,
  );
  let tolerance = 0.02;
  let simple = simplifyStroke(local, tolerance);
  while (simple.length > MARK_POINTS_MAX * 2) {
    tolerance *= 2;
    simple = simplifyStroke(local, tolerance);
  }
  return simple.map((value) => clampEm(roundEm(value)));
}

/** The schema allows 100 em from the anchor. */
function clampEm(value: number) {
  return Math.max(-100, Math.min(100, value));
}

type Gesture =
  | { kind: "stroke"; pointerId: number; tool: "pen" | "highlighter"; points: number[] }
  | { kind: "erase"; pointerId: number; hits: Map<string, Hit> }
  | { kind: "text"; pointerId: number; x: number; y: number; hit: Hit | null; moved: boolean };

/** The text that is open for writing. `left` and `top` are on the screen, `layer` is the top left corner of the layer. */
type Editor = {
  left: number;
  top: number;
  layer: { left: number; top: number };
  color: MarkColor;
  /** In `em` of the song's text. */
  size: number;
  /** The size of the song's text, in pixels. */
  emPx: number;
  /** Null for a new text. */
  hit: Hit | null;
};

/**
 * Mark mode: a layer over the sheet that draws, writes and erases with the
 * tool of the settings. A tap of the text tool writes a new text, or opens a
 * text to change it; a drag moves a text. Once a pen touches the screen, the
 * layer ignores fingers, so the hand can rest on the screen.
 */
export function MarkingLayer({
  settings,
  emPx,
  marks,
  onCommit,
  onUndo,
  onRedo,
  onDone,
}: {
  settings: SheetSettings;
  /**
   * The size of the sheet text, in pixels, next to the songs. Each song can
   * have its own size: a mark on a song uses the size of the song.
   */
  emPx: number;
  marks: Record<string, SheetMark[]>;
  onCommit: (change: MarkChange) => void;
  onUndo: () => void;
  onRedo: () => void;
  onDone: () => void;
}) {
  const { m } = useI18n();
  const layerRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const penSeen = useRef(false);
  // The stroke that the user draws now, on the screen.
  const [stroke, setStroke] = useState<{
    tool: "pen" | "highlighter";
    points: number[];
    left: number;
    top: number;
    /** The size of the text of the song where the stroke starts. */
    emPx: number;
  } | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  // Counts the taps and strokes on a score. After each, a short note says that a score takes no marks.
  const [scoreHint, setScoreHint] = useState(0);
  useEffect(() => {
    if (!scoreHint) return;
    const timer = setTimeout(() => setScoreHint(0), 4000);
    return () => clearTimeout(timer);
  }, [scoreHint]);

  // The latest handler, so the listener does not need to change.
  const onKeyDown = useRef<(event: KeyboardEvent) => void>(null);
  useEffect(() => {
    onKeyDown.current = (event) => {
      if (event.defaultPrevented || editor) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, select, textarea, [role=dialog]")) return;
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === "z") {
        if (event.shiftKey) onRedo();
        else onUndo();
      } else if (event.ctrlKey && key === "y") {
        onRedo();
      } else if (event.key === "Escape") {
        onDone();
      } else {
        return;
      }
      event.preventDefault();
    };
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyDown.current?.(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  function root() {
    return layerRef.current?.parentElement ?? null;
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    // No mouse events follow, so they cannot move the focus away from a text that opens.
    event.preventDefault();
    if (editor) {
      // A tap next to the open text closes it, and its blur saves it.
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      return;
    }
    if (gesture.current) return;
    if (event.pointerType === "pen") penSeen.current = true;
    else if (event.pointerType === "touch" && penSeen.current) return;
    if (event.button !== 0) return;
    const sheet = root();
    if (!sheet) return;
    if (settings.markTool !== "eraser" && onScore(sheet, event.clientX, event.clientY)) {
      setScoreHint((count) => count + 1);
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    const { clientX: x, clientY: y, pointerId } = event;
    switch (settings.markTool) {
      case "pen":
      case "highlighter": {
        const box = event.currentTarget.getBoundingClientRect();
        gesture.current = { kind: "stroke", pointerId, tool: settings.markTool, points: [x, y] };
        setStroke({
          tool: settings.markTool,
          points: [x, y],
          left: box.left,
          top: box.top,
          emPx: emPxAt(sheet, x, y, emPx),
        });
        break;
      }
      case "eraser":
        gesture.current = { kind: "erase", pointerId, hits: new Map() };
        erase(sheet, x, y);
        break;
      case "text": {
        const hit =
          marksAt(sheet, marks, x, y, 4).findLast((entry) => entry.mark.kind === "text") ?? null;
        gesture.current = { kind: "text", pointerId, x, y, hit, moved: false };
        break;
      }
    }
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    const sheet = root();
    if (!current || current.pointerId !== event.pointerId || !sheet) return;
    const coalesced = event.nativeEvent.getCoalescedEvents?.() ?? [];
    const moves = coalesced.length > 0 ? coalesced : [event.nativeEvent];

    if (current.kind === "stroke") {
      for (const move of moves) current.points.push(move.clientX, move.clientY);
      const points = current.points.slice();
      setStroke((shown) => shown && { ...shown, points });
    } else if (current.kind === "erase") {
      for (const move of moves) erase(sheet, move.clientX, move.clientY);
    } else if (current.hit) {
      const dx = event.clientX - current.x;
      const dy = event.clientY - current.y;
      if (!current.moved && Math.hypot(dx, dy) < DRAG_DISTANCE) return;
      current.moved = true;
      for (const element of current.hit.elements) element.style.translate = `${dx}px ${dy}px`;
    }
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    const sheet = root();
    if (!current || current.pointerId !== event.pointerId) return;
    gesture.current = null;
    if (!sheet) return cancel(current);

    if (current.kind === "stroke") {
      setStroke(null);
      const [left, top, right, bottom] = strokeBounds(current.points);
      // The line nearest to the middle of the stroke, so a stroke over several lines moves with the middle one.
      const anchor = anchorAt(sheet, (left + right) / 2, (top + bottom) / 2);
      if (!anchor) {
        if (onScore(sheet, (left + right) / 2, (top + bottom) / 2))
          setScoreHint((count) => count + 1);
        return;
      }
      const mark: StrokeMark = {
        id: newMarkId(),
        kind: current.tool,
        anchor: anchor.anchor,
        color: current.tool === "pen" ? settings.penColor : settings.highlighterColor,
        width: current.tool === "pen" ? PEN_WIDTHS[settings.penWidth] : HIGHLIGHTER_WIDTH,
        points: toStrokePoints(current.points, anchor),
      };
      onCommit({ arrangementId: anchor.arrangementId, remove: [], add: [mark] });
      return;
    }
    if (current.kind === "erase") {
      const byArrangement = new Map<string, Hit[]>();
      for (const hit of current.hits.values()) {
        byArrangement.set(hit.arrangementId, [
          ...(byArrangement.get(hit.arrangementId) ?? []),
          hit,
        ]);
      }
      for (const [arrangementId, hits] of byArrangement) {
        onCommit({ arrangementId, remove: hits.map((hit) => hit.mark), add: [] });
      }
      // The marks go away with the change. These are the ones that stay, e.g. after a failed save.
      for (const hit of current.hits.values())
        hit.elements.forEach((element) => (element.style.opacity = ""));
      return;
    }

    const layer = event.currentTarget.getBoundingClientRect();
    if (current.hit && current.moved && current.hit.mark.kind === "text") {
      const { mark, elements, arrangementId } = current.hit;
      const box = elements[0]!.getBoundingClientRect();
      elements.forEach((element) => (element.style.translate = ""));
      const left = box.left;
      const top = box.top;
      // A text stays in its song: the marks belong to the arrangement.
      const anchor = anchorAt(
        sheet,
        left,
        top + (mark.size * songEmPx(elements[0]!) * TEXT_LINE_HEIGHT) / 2,
        arrangementId,
      );
      if (!anchor) return;
      const moved: TextMark = {
        ...mark,
        anchor: anchor.anchor,
        x: clampEm(roundEm((left - anchor.left) / anchor.emPx)),
        y: clampEm(roundEm((top - anchor.top) / anchor.emPx)),
      };
      onCommit({ arrangementId, remove: [mark], add: [moved] });
    } else if (current.hit && current.hit.mark.kind === "text") {
      const { mark, elements } = current.hit;
      const box = elements[0]!.getBoundingClientRect();
      elements.forEach((element) => (element.style.visibility = "hidden"));
      setEditor({
        left: box.left,
        top: box.top,
        layer,
        color: mark.color,
        size: mark.size,
        emPx: songEmPx(elements[0]!),
        hit: current.hit,
      });
    } else {
      const size = TEXT_SIZES[settings.textSize];
      const songEm = emPxAt(sheet, current.x, current.y, emPx);
      // The tap is at the middle of the first line.
      setEditor({
        left: current.x,
        top: current.y - (size * songEm * TEXT_LINE_HEIGHT) / 2,
        layer,
        color: settings.textColor,
        size,
        emPx: songEm,
        hit: null,
      });
    }
  }

  function onPointerCancel(event: React.PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    gesture.current = null;
    cancel(current);
  }

  function cancel(current: Gesture) {
    setStroke(null);
    if (current.kind === "erase") {
      for (const hit of current.hits.values())
        hit.elements.forEach((element) => (element.style.opacity = ""));
    } else if (current.kind === "text") {
      current.hit?.elements.forEach((element) => (element.style.translate = ""));
    }
  }

  function erase(sheet: Element, x: number, y: number) {
    const current = gesture.current;
    if (current?.kind !== "erase") return;
    for (const hit of marksAt(sheet, marks, x, y, ERASER_RADIUS)) {
      if (current.hits.has(hit.mark.id)) continue;
      current.hits.set(hit.mark.id, hit);
      // Shows what the gesture erases. The change comes when the pointer goes up.
      hit.elements.forEach((element) => (element.style.opacity = "0.2"));
    }
  }

  function closeEditor(text: string | null) {
    const open = editor;
    if (!open) return;
    setEditor(null);
    open.hit?.elements.forEach((element) => (element.style.visibility = ""));
    if (text === null) return;
    const value = text.trim().slice(0, MARK_TEXT_MAX);

    if (open.hit?.mark.kind === "text") {
      const { mark, arrangementId } = open.hit;
      if (!value) onCommit({ arrangementId, remove: [mark], add: [] });
      else if (value !== mark.text)
        onCommit({ arrangementId, remove: [mark], add: [{ ...mark, text: value }] });
      return;
    }
    const sheet = root();
    if (!value || !sheet) return;
    const anchor = anchorAt(
      sheet,
      open.left,
      open.top + (open.size * open.emPx * TEXT_LINE_HEIGHT) / 2,
    );
    if (!anchor) return;
    const mark: TextMark = {
      id: newMarkId(),
      kind: "text",
      anchor: anchor.anchor,
      color: open.color,
      x: clampEm(roundEm((open.left - anchor.left) / anchor.emPx)),
      y: clampEm(roundEm((open.top - anchor.top) / anchor.emPx)),
      size: open.size,
      text: value,
    };
    onCommit({ arrangementId: anchor.arrangementId, remove: [], add: [mark] });
  }

  return (
    <div
      ref={layerRef}
      className={cn(
        "absolute inset-0 z-10 touch-none select-none [-webkit-touch-callout:none]",
        settings.markTool === "text"
          ? "cursor-text"
          : settings.markTool === "eraser"
            ? "cursor-cell"
            : "cursor-crosshair",
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {stroke && (
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full overflow-visible"
        >
          <path
            transform={`translate(${-stroke.left} ${-stroke.top})`}
            d={strokePath(stroke.points)}
            fill="none"
            stroke={markColor(
              stroke.tool === "pen" ? settings.penColor : settings.highlighterColor,
            )}
            strokeWidth={
              (stroke.tool === "pen" ? PEN_WIDTHS[settings.penWidth] : HIGHLIGHTER_WIDTH) *
              stroke.emPx
            }
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cn(stroke.tool === "highlighter" && "opacity-50 dark:opacity-35")}
          />
        </svg>
      )}
      {scoreHint > 0 && (
        <div
          role="status"
          className="pointer-events-none absolute inset-x-0 top-3 flex justify-center px-2"
        >
          <p className="max-w-md rounded-lg bg-surface/90 px-3 py-1.5 text-center text-xs text-muted shadow">
            {m.sheet.marks.noScoreMarks}
          </p>
        </div>
      )}
      {editor && (
        <TextEditor
          // A new text for each open.
          key={`${editor.left}:${editor.top}`}
          label={m.sheet.marks.textLabel}
          placeholder={m.sheet.marks.textPlaceholder}
          initial={editor.hit?.mark.kind === "text" ? editor.hit.mark.text : ""}
          style={{
            left: editor.left - editor.layer.left,
            top: editor.top - editor.layer.top,
            ...editorFontSize(editor.size * editor.emPx),
            lineHeight: TEXT_LINE_HEIGHT,
            color: markColor(editor.color),
          }}
          onClose={closeEditor}
        />
      )}
    </div>
  );
}

/** iOS zooms in on a text field with a font smaller than this. */
const MIN_INPUT_FONT_PX = 16;

/** A small text gets the minimum font and a scale down: it looks the same, and iOS does not zoom. */
function editorFontSize(px: number): React.CSSProperties {
  if (px >= MIN_INPUT_FONT_PX) return { fontSize: px };
  return {
    fontSize: MIN_INPUT_FONT_PX,
    transform: `scale(${px / MIN_INPUT_FONT_PX})`,
    transformOrigin: "top left",
  };
}

/** Enter saves the text (Shift+Enter starts a new line), Escape closes it without a change, and so does a tap outside it. */
function TextEditor({
  label,
  placeholder,
  initial,
  style,
  onClose,
}: {
  label: string;
  placeholder: string;
  initial: string;
  style: React.CSSProperties;
  /** Null: no change. */
  onClose: (text: string | null) => void;
}) {
  const [text, setText] = useState(initial);
  const closed = useRef(false);

  function close(value: string | null) {
    if (closed.current) return;
    closed.current = true;
    onClose(value);
  }

  return (
    <textarea
      autoFocus
      aria-label={label}
      placeholder={placeholder}
      value={text}
      maxLength={MARK_TEXT_MAX}
      rows={1}
      // The pointer events of the text do not go to the layer.
      onPointerDown={(event) => event.stopPropagation()}
      onChange={(event) => setText(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
          event.preventDefault();
          close(text);
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close(null);
        }
      }}
      onBlur={() => close(text)}
      className="absolute field-sizing-content max-w-[24em] min-w-[6em] resize-none overflow-hidden bg-transparent p-0 font-semibold outline-2 outline-offset-2 outline-focus outline-dashed placeholder:text-(--sheet-muted)"
      style={style}
    />
  );
}

/** The tools of mark mode, at the bottom of the sheet. */
export function MarkToolbar({
  settings,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onDone,
}: {
  settings: SheetSettings;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onDone: () => void;
}) {
  const { m } = useI18n();
  const tools: { tool: MarkTool; label: string; icon: React.ReactNode }[] = [
    { tool: "pen", label: m.sheet.marks.pen, icon: <PenIcon /> },
    { tool: "highlighter", label: m.sheet.marks.highlighter, icon: <HighlighterIcon /> },
    { tool: "text", label: m.sheet.marks.text, icon: <TypeIcon /> },
    { tool: "eraser", label: m.sheet.marks.eraser, icon: <EraserIcon /> },
  ];

  return (
    <div
      role="toolbar"
      aria-label={m.sheet.marks.toolbar}
      // On a narrow phone with large touch buttons the tools take two rows.
      className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-0.5 rounded-xl border bg-surface p-1 text-text shadow-lg"
    >
      {tools.map(({ tool, label, icon }) => (
        <Button
          key={tool}
          variant={settings.markTool === tool ? "secondary" : "ghost"}
          size="icon"
          aria-label={label}
          title={label}
          aria-pressed={settings.markTool === tool}
          onClick={() => updateSheetSettings({ markTool: tool })}
        >
          {icon}
        </Button>
      ))}
      {settings.markTool !== "eraser" && (
        <MarkOptions settings={settings} tool={settings.markTool} />
      )}
      <div aria-hidden className="mx-0.5 h-6 w-px bg-border" />
      <Button
        variant="ghost"
        size="icon"
        aria-label={m.sheet.marks.undo}
        title={m.sheet.marks.undo}
        disabled={!canUndo}
        onClick={onUndo}
      >
        <Undo2Icon />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={m.sheet.marks.redo}
        title={m.sheet.marks.redo}
        disabled={!canRedo}
        onClick={onRedo}
      >
        <Redo2Icon />
      </Button>
      <Button
        size="icon"
        className="sm:w-auto sm:px-2.5"
        aria-label={m.sheet.marks.done}
        title={m.sheet.marks.stopShortcut}
        onClick={onDone}
      >
        <CheckIcon />
        <span className="hidden sm:inline">{m.sheet.marks.done}</span>
      </Button>
    </div>
  );
}

/** The color, and the line width or the text size, of the current tool. */
function MarkOptions({
  settings,
  tool,
}: {
  settings: SheetSettings;
  tool: Exclude<MarkTool, "eraser">;
}) {
  const { m } = useI18n();
  const color =
    tool === "pen"
      ? settings.penColor
      : tool === "highlighter"
        ? settings.highlighterColor
        : settings.textColor;
  const colors = tool === "highlighter" ? HIGHLIGHTER_COLORS : PEN_COLORS;
  const setColor = (value: MarkColor) =>
    updateSheetSettings(
      tool === "pen"
        ? { penColor: value as (typeof PEN_COLORS)[number] }
        : tool === "highlighter"
          ? { highlighterColor: value as (typeof HIGHLIGHTER_COLORS)[number] }
          : { textColor: value as (typeof PEN_COLORS)[number] },
    );

  return (
    <Popover.Root>
      <Popover.Trigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={m.sheet.marks.options}
            title={m.sheet.marks.options}
          />
        }
      >
        <span
          aria-hidden
          className="size-4 rounded-full border border-text/20"
          style={{ background: markColor(color) }}
        />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="top" sideOffset={8} collisionPadding={8} className="z-50">
          <Popover.Popup className="flex max-h-[var(--available-height)] w-64 max-w-[calc(100vw-1rem)] origin-[var(--transform-origin)] flex-col gap-4 overflow-y-auto rounded-lg border bg-surface-raised p-4 text-text shadow-lg outline-none transition-[scale,opacity] duration-100 ease-out data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            <Popover.Title className="text-sm font-semibold">{m.sheet.marks.options}</Popover.Title>
            <ColorChoice colors={colors} value={color} onChange={setColor} />
            {tool === "pen" && (
              <Choice
                label={m.sheet.marks.width}
                value={settings.penWidth}
                options={[
                  { value: "thin", label: m.sheet.marks.widthThin },
                  { value: "thick", label: m.sheet.marks.widthThick },
                ]}
                onChange={(penWidth) => updateSheetSettings({ penWidth })}
              />
            )}
            {tool === "text" && (
              <Choice
                label={m.sheet.marks.size}
                value={settings.textSize}
                options={[
                  { value: "small", label: m.sheet.marks.sizeSmall },
                  { value: "medium", label: m.sheet.marks.sizeMedium },
                  { value: "large", label: m.sheet.marks.sizeLarge },
                ]}
                onChange={(textSize) => updateSheetSettings({ textSize })}
              />
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function ColorChoice({
  colors,
  value,
  onChange,
}: {
  colors: readonly MarkColor[];
  value: MarkColor;
  onChange: (color: MarkColor) => void;
}) {
  const { m } = useI18n();
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-xs font-medium text-muted">{m.sheet.marks.color}</legend>
      <div className="flex flex-wrap gap-2">
        {colors.map((color) => (
          <label
            key={color}
            title={m.sheet.marks.colors[color]}
            className="flex size-8 cursor-pointer items-center justify-center rounded-full ring-offset-2 ring-offset-popover has-checked:ring-2 has-checked:ring-focus has-focus-visible:ring-3 has-focus-visible:ring-focus/50"
          >
            <input
              type="radio"
              name="mark-color"
              className="sr-only"
              aria-label={m.sheet.marks.colors[color]}
              checked={color === value}
              onChange={() => onChange(color)}
            />
            <span
              aria-hidden
              className="size-6 rounded-full border border-text/20"
              style={{ background: markColor(color) }}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** A failed save of the marks, over the bottom of the sheet. */
export function MarkError({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const { m } = useI18n();
  return (
    <div
      role="alert"
      className="pointer-events-auto flex max-w-md items-center gap-2 rounded-lg border border-danger/30 bg-surface py-1 pr-1 pl-3 text-sm text-danger shadow-lg"
    >
      <p className="flex-1">{message}</p>
      <Button variant="ghost" size="icon-sm" aria-label={m.sheet.marks.dismiss} onClick={onDismiss}>
        <XIcon />
      </Button>
    </div>
  );
}
