"use client";

import { useEffect, useRef, useState } from "react";

/** A step of the arrow keys on the handle, in px. */
const KEY_STEP = 16;

/** In px. A smaller move of the pointer is a click: the saved width stays. */
const DRAG_THRESHOLD = 3;

type Size = { now: number; max: number };

/**
 * The handle on an edge of a panel, e.g. the setlist or the Bible panel: a
 * drag, the arrow keys, Home and End resize the panel, and a double click
 * gives the default width. The drag shows the width with `onPreview` and saves
 * it at the end, only after a move. All widths are in px.
 */
export function ResizeHandle({
  panelRef,
  edge,
  label,
  minWidth,
  maxWidth,
  onPreview,
  onChange,
  onReset,
}: {
  /** The panel: its real width, also when the window is too narrow for the saved one. */
  panelRef: React.RefObject<HTMLElement | null>;
  /** The edge of the panel with the handle. */
  edge: "left" | "right";
  label: string;
  minWidth: number;
  /** The widest panel now. A function outside the component: the handle measures again when the panel or its parent changes size. */
  maxWidth: (panel: HTMLElement) => number;
  /** The width during a drag, and null at its end. */
  onPreview: (width: number | null) => void;
  onChange: (width: number) => void;
  onReset: () => void;
}) {
  const drag = useRef<{ x: number; width: number; max: number; moved: boolean } | null>(null);
  // For the screen readers. Known after the first render.
  const [size, setSize] = useState<Size | null>(null);
  // A drag to the right makes the panel wider when the handle is on its right edge.
  const sign = edge === "right" ? 1 : -1;

  // The panel changes its width also without the handle, e.g. with the window.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const update = () => {
      const next = measure(panel, minWidth, maxWidth);
      setSize((size) => (size?.now === next.now && size.max === next.max ? size : next));
    };
    const observer = new ResizeObserver(update);
    observer.observe(panel);
    if (panel.parentElement) observer.observe(panel.parentElement);
    return () => observer.disconnect();
  }, [panelRef, minWidth, maxWidth]);

  const clamp = (width: number, max: number) =>
    Math.round(Math.min(Math.max(width, minWidth), max));

  function onKeyDown(event: React.KeyboardEvent) {
    const panel = panelRef.current;
    if (!panel) return;
    const { now, max } = measure(panel, minWidth, maxWidth);
    const next =
      event.key === "ArrowRight"
        ? now + sign * KEY_STEP
        : event.key === "ArrowLeft"
          ? now - sign * KEY_STEP
          : event.key === "Home"
            ? minWidth
            : event.key === "End"
              ? max
              : null;
    if (next === null) return;
    // Not a slide key for the controller.
    event.preventDefault();
    onChange(clamp(next, max));
  }

  function endDrag() {
    drag.current = null;
    onPreview(null);
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      title={label}
      aria-valuenow={size?.now}
      aria-valuemin={Math.round(minWidth)}
      aria-valuemax={size?.max}
      aria-keyshortcuts="ArrowLeft ArrowRight Home End"
      tabIndex={0}
      onPointerDown={(event) => {
        const panel = panelRef.current;
        if (event.button !== 0 || !panel) return;
        // No text selection while dragging.
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        const { now, max } = measure(panel, minWidth, maxWidth);
        drag.current = { x: event.clientX, width: now, max, moved: false };
      }}
      onPointerMove={(event) => {
        const start = drag.current;
        if (!start) return;
        const dx = event.clientX - start.x;
        if (!start.moved && Math.abs(dx) < DRAG_THRESHOLD) return;
        start.moved = true;
        onPreview(clamp(start.width + sign * dx, start.max));
      }}
      onPointerUp={(event) => {
        const start = drag.current;
        if (!start) return;
        if (start.moved) onChange(clamp(start.width + sign * (event.clientX - start.x), start.max));
        endDrag();
      }}
      onPointerCancel={endDrag}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
      className="absolute inset-y-0 -left-1.5 z-10 w-3 cursor-col-resize touch-none outline-none after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:transition-colors hover:after:bg-primary/60 focus-visible:after:bg-primary"
    />
  );
}

function measure(
  panel: HTMLElement,
  minWidth: number,
  maxWidth: (panel: HTMLElement) => number,
): Size {
  return { now: panel.offsetWidth, max: Math.round(Math.max(minWidth, maxWidth(panel))) };
}
