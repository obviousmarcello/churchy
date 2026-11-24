"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

import { listenToPinch, type Fingers } from "@/lib/music/pinch-zoom";
import { pinchSize, SHEET_SIZES } from "@/lib/music/sheet-view";

// The zoom of the text on the sheet. A pinch with two fingers changes the
// text size of the settings. With a trackpad or a mouse, the wheel with Ctrl
// zooms (a pinch on a trackpad sends it too); Safari on a Mac sends its own
// gesture events for a pinch on the trackpad. During the pinch the pages
// scale with CSS; at its end the text gets the nearest of `SHEET_SIZES`.
// A score, a PDF file and an image do not zoom the text: the PDF files and
// the images zoom themselves (`sheet-zoom.ts`).

/** The wheel zooms as one change until it stops for this time. */
const WHEEL_END_MS = 400;
/** The zoom of the wheel: a factor of e for 100 px of the wheel. */
const WHEEL_ZOOM_PER_PX = 0.01;
/** A step of a mouse wheel is about 100 px: at most half of it, so one step does not zoom too much. */
const WHEEL_MAX_PX = 50;

/** The pinch of Safari, on a trackpad. Not in the types of the DOM. */
type GestureEvent = Event & { scale: number; clientX: number; clientY: number };

/**
 * The pinch zoom of the text in `box`. `content` scales during the pinch; it
 * has no transform of its own. `songAt` gives the song under the fingers (-1
 * if no song zooms there), `sizes` the text size of each song. `onSize` gets
 * the song and its new size at the end of a pinch. Only while `enabled`.
 */
export function useTextZoom(
  box: HTMLElement | null,
  content: HTMLElement | null,
  {
    sizes,
    songAt,
    enabled,
    onSize,
  }: {
    sizes: number[];
    songAt: (target: Element) => number;
    enabled: boolean;
    onSize: (song: number, size: number) => void;
  },
) {
  // The latest values for the listeners.
  const latest = useRef({ sizes, songAt, onSize });
  useLayoutEffect(() => {
    latest.current = { sizes, songAt, onSize };
  });
  // After a pinch, until the new size shows: the pages keep the scale of the pinch.
  const pending = useRef(false);

  // The new size shows: the pages lose the scale of the pinch.
  const sizesKey = sizes.join(" ");
  useLayoutEffect(() => {
    if (!content || !pending.current) return;
    pending.current = false;
    reset(content);
  }, [content, sizesKey]);

  useEffect(() => {
    if (!box || !content || !enabled) return;
    const element = box;
    const pages = content;

    // A pinch: the song, its size at the start, the point where it starts and the scale that shows.
    let pinch: {
      song: number;
      size: number;
      start: Fingers;
      last: Fingers;
      factor: number;
    } | null = null;

    function start(x: number, y: number, distance: number): boolean {
      const target = document.elementFromPoint(x, y);
      // A score, a PDF file or an image under the fingers.
      if (!target || target.closest("[data-mark-none]")) return false;
      const song = latest.current.songAt(target);
      if (song < 0) return false;
      const rect = pages.getBoundingClientRect();
      pages.style.transformOrigin = `${x - rect.left}px ${y - rect.top}px`;
      // The pages before and after the screen do not show when the pages get smaller.
      pages.style.overflow = "clip";
      const fingers = { x, y, distance };
      pinch = { song, size: latest.current.sizes[song]!, start: fingers, last: fingers, factor: 1 };
      return true;
    }

    /** The scale of the pinch, between the smallest and the largest size. */
    function scale(factor: number, x: number, y: number) {
      if (!pinch) return;
      const min = SHEET_SIZES[0]! / pinch.size;
      const max = SHEET_SIZES[SHEET_SIZES.length - 1]! / pinch.size;
      pinch.factor = Math.min(Math.max(factor, min), max);
      pinch.last = { x, y, distance: pinch.last.distance };
      pages.style.transform = `translate(${x - pinch.start.x}px, ${y - pinch.start.y}px) scale(${pinch.factor})`;
    }

    function end() {
      if (!pinch) return;
      const { song } = pinch;
      const next = pinchSize(pinch.size, pinch.factor);
      pinch = null;
      if (next === latest.current.sizes[song]) return reset(pages);
      pending.current = true;
      latest.current.onSize(song, next);
    }

    const stopPinch = listenToPinch(element, {
      start: (fingers) => start(fingers.x, fingers.y, fingers.distance),
      move(fingers) {
        if (pinch) scale(fingers.distance / pinch.start.distance, fingers.x, fingers.y);
      },
      changeFingers(fingers) {
        if (!pinch) return;
        const { start, last, factor } = pinch;
        // The same move and scale for the new fingers.
        pinch.start = {
          x: fingers.x - (last.x - start.x),
          y: fingers.y - (last.y - start.y),
          distance: fingers.distance / factor,
        };
        pinch.last = fingers;
      },
      end,
    });

    let wheelTimer: ReturnType<typeof setTimeout> | undefined;
    let wheelPx = 0;

    function onWheel(event: WheelEvent) {
      // A PDF file or an image zooms itself.
      if (!event.ctrlKey || event.defaultPrevented) return;
      if (!pinch && !start(event.clientX, event.clientY, 0)) return;
      // Not the zoom of the browser.
      event.preventDefault();
      if (!pinch) return;
      const unit =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? 800
            : 1;
      wheelPx += Math.min(Math.max(event.deltaY * unit, -WHEEL_MAX_PX), WHEEL_MAX_PX);
      // The point of the wheel stays where it started.
      scale(Math.exp(-wheelPx * WHEEL_ZOOM_PER_PX), pinch.start.x, pinch.start.y);
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => {
        wheelTimer = undefined;
        wheelPx = 0;
        end();
      }, WHEEL_END_MS);
    }

    // On an iPhone or an iPad, the touch events zoom, and the gesture events only stop the zoom of the browser.
    // Without a pinch, e.g. on a score, the browser zooms.
    let gesture = false;

    function onGestureStart(event: Event) {
      if (!pinch) {
        const { clientX, clientY } = event as GestureEvent;
        gesture = start(clientX, clientY, 0);
      }
      if (pinch) event.preventDefault();
    }

    function onGestureChange(event: Event) {
      if (!pinch) return;
      event.preventDefault();
      if (gesture) scale((event as GestureEvent).scale, pinch.start.x, pinch.start.y);
    }

    function onGestureEnd(event: Event) {
      if (!gesture) return;
      event.preventDefault();
      gesture = false;
      end();
    }

    const active = { passive: false };
    element.addEventListener("wheel", onWheel, active);
    element.addEventListener("gesturestart", onGestureStart, active);
    element.addEventListener("gesturechange", onGestureChange, active);
    element.addEventListener("gestureend", onGestureEnd, active);
    return () => {
      stopPinch();
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("gesturestart", onGestureStart);
      element.removeEventListener("gesturechange", onGestureChange);
      element.removeEventListener("gestureend", onGestureEnd);
      clearTimeout(wheelTimer);
      if (pinch) {
        pinch = null;
        reset(pages);
      }
    };
  }, [box, content, enabled]);
}

/** The pages without the scale of a pinch. */
function reset(content: HTMLElement) {
  content.style.transform = "";
  content.style.transformOrigin = "";
  content.style.overflow = "";
}
