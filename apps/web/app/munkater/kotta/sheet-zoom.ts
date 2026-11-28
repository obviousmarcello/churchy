"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  clampView,
  isFitView,
  pinchView,
  sameView,
  type BoxPoint,
  type FileView,
} from "@/lib/music/file-view";
import { listenToPinch, nearestPage } from "@/lib/music/pinch-zoom";

// The zoom of a PDF file or an image on the sheet. A pinch with two fingers
// zooms the pages and moves them; a swipe with one finger still turns the
// page. With a trackpad or a mouse, the wheel with Ctrl zooms (a pinch on a
// trackpad sends it too), and the wheel alone moves the zoomed pages. Safari
// on a Mac sends its own gesture events for a pinch on the trackpad.

/** The wheel zooms or moves as one change until it stops for this time. */
const WHEEL_END_MS = 400;
/** The zoom of the wheel: a factor of e for 100 px of the wheel. */
const WHEEL_ZOOM_PER_PX = 0.01;
/** A step of a mouse wheel is about 100 px: at most half of it, so one step does not zoom too much. */
const WHEEL_MAX_PX = 50;

/** The pinch of Safari, on a trackpad. Not in the types of the DOM. */
type GestureEvent = Event & { scale: number; clientX: number; clientY: number };

/**
 * The zoom of the pages in an element: each page is an element with
 * `data-file-page`. `view` is the saved view; the view that shows changes
 * during a gesture, and `onChange` gets it at the end. Returns the view that
 * shows, and the ref callback of the element.
 */
export function useFileZoom(view: FileView, onChange: (view: FileView) => void) {
  const [shown, setShown] = useState(view);
  // A new saved view, e.g. from the zoom buttons, shows at once.
  const [saved, setSaved] = useState(view);
  if (!sameView(view, saved)) {
    setSaved(view);
    setShown(view);
  }
  const [element, setElement] = useState<HTMLElement | null>(null);
  // The latest values for the listeners. A gesture changes `shownRef` before the next render.
  const shownRef = useRef(shown);
  const latest = useRef({ view, onChange });
  useLayoutEffect(() => {
    shownRef.current = shown;
    latest.current = { view, onChange };
  });

  useEffect(() => {
    if (!element) return;
    const box = element;

    function show(next: FileView) {
      shownRef.current = next;
      setShown(next);
    }

    function commit() {
      const next = clampView(shownRef.current);
      show(next);
      if (!sameView(next, latest.current.view)) latest.current.onChange(next);
    }

    /** The box of the page nearest to a point of the screen. */
    function pageRect(x: number, y: number): DOMRect | null {
      return nearestPage(box.querySelectorAll("[data-file-page]"), x, y)?.rect ?? null;
    }

    const inBox = (rect: DOMRect, x: number, y: number): BoxPoint => ({
      x: (x - rect.left) / rect.width,
      y: (y - rect.top) / rect.height,
    });

    // A pinch: the view at its start, the box of the page and the point between the fingers in it.
    let pinch: { start: FileView; rect: DOMRect; from: BoxPoint; distance: number } | null = null;

    const stopPinch = listenToPinch(box, {
      start(fingers) {
        const rect = pageRect(fingers.x, fingers.y);
        if (!rect) return false;
        pinch = {
          start: shownRef.current,
          rect,
          from: inBox(rect, fingers.x, fingers.y),
          distance: fingers.distance,
        };
        return true;
      },
      move(fingers) {
        if (!pinch) return;
        const to = inBox(pinch.rect, fingers.x, fingers.y);
        show(pinchView(pinch.start, pinch.from, to, fingers.distance / pinch.distance));
      },
      // The pinch goes on from the view that shows.
      changeFingers(fingers) {
        if (!pinch) return;
        pinch = {
          ...pinch,
          start: shownRef.current,
          from: inBox(pinch.rect, fingers.x, fingers.y),
          distance: fingers.distance,
        };
      },
      end() {
        pinch = null;
        commit();
      },
    });

    let wheelTimer: ReturnType<typeof setTimeout> | undefined;

    function onWheel(event: WheelEvent) {
      // The wheel alone does not move the whole page.
      if (!event.ctrlKey && isFitView(shownRef.current)) return;
      const rect = pageRect(event.clientX, event.clientY);
      if (!rect) return;
      // Not the zoom of the browser.
      event.preventDefault();
      const unit =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? rect.height
            : 1;
      if (event.ctrlKey) {
        const point = inBox(rect, event.clientX, event.clientY);
        const delta = Math.min(Math.max(event.deltaY * unit, -WHEEL_MAX_PX), WHEEL_MAX_PX);
        show(pinchView(shownRef.current, point, point, Math.exp(-delta * WHEEL_ZOOM_PER_PX)));
      } else {
        // The view moves with the wheel, so the page moves the other way.
        const to = {
          x: 0.5 - (event.deltaX * unit) / rect.width,
          y: 0.5 - (event.deltaY * unit) / rect.height,
        };
        show(pinchView(shownRef.current, { x: 0.5, y: 0.5 }, to, 1));
      }
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => {
        wheelTimer = undefined;
        commit();
      }, WHEEL_END_MS);
    }

    let gesture: { start: FileView; point: BoxPoint } | null = null;

    function onGestureStart(event: Event) {
      event.preventDefault();
      // On an iPhone or an iPad, the touch events zoom.
      if (pinch) return;
      const { clientX, clientY } = event as GestureEvent;
      const rect = pageRect(clientX, clientY);
      if (rect) gesture = { start: shownRef.current, point: inBox(rect, clientX, clientY) };
    }

    function onGestureChange(event: Event) {
      event.preventDefault();
      if (!gesture || pinch) return;
      show(pinchView(gesture.start, gesture.point, gesture.point, (event as GestureEvent).scale));
    }

    function onGestureEnd(event: Event) {
      event.preventDefault();
      if (!gesture) return;
      gesture = null;
      commit();
    }

    const active = { passive: false };
    box.addEventListener("wheel", onWheel, active);
    box.addEventListener("gesturestart", onGestureStart, active);
    box.addEventListener("gesturechange", onGestureChange, active);
    box.addEventListener("gestureend", onGestureEnd, active);
    return () => {
      stopPinch();
      box.removeEventListener("wheel", onWheel);
      box.removeEventListener("gesturestart", onGestureStart);
      box.removeEventListener("gesturechange", onGestureChange);
      box.removeEventListener("gestureend", onGestureEnd);
      // A zoom that did not end yet is saved.
      clearTimeout(wheelTimer);
      if (pinch || gesture || wheelTimer !== undefined) commit();
    };
  }, [element]);

  return [shown, setElement] as const;
}
