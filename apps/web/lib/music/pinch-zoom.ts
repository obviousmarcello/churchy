"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

// A pinch with two fingers in a viewer whose pages are one under the other,
// e.g. the pages of a PDF file: it changes the zoom of the viewer, not of the
// page of the browser (in the installed app the page does not zoom, see
// `page-zoom-lock.tsx`). During the pinch the pages scale with CSS; at its
// end the viewer gets the new zoom and shows the pages at their new size. The
// point of the page between the fingers stays between them.
//
// The viewer scrolls sideways, the document scrolls down. The list of the
// pages has `data-zoom-content`, each of its children is a page.

export type Fingers = { x: number; y: number; distance: number };

/** The point between the first two fingers, and their distance. */
export function twoFingers(touches: TouchList): Fingers {
  const [a, b] = [touches[0], touches[1]];
  return {
    x: (a!.clientX + b!.clientX) / 2,
    y: (a!.clientY + b!.clientY) / 2,
    distance: Math.hypot(a!.clientX - b!.clientX, a!.clientY - b!.clientY),
  };
}

/** The page nearest to a point of the screen, with its box. Pages without a size do not count. */
export function nearestPage(
  pages: Iterable<Element>,
  x: number,
  y: number,
): { index: number; rect: DOMRect } | null {
  let nearest: { index: number; rect: DOMRect } | null = null;
  let nearestDistance = Infinity;
  let index = 0;
  for (const page of pages) {
    const rect = page.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const distance = Math.hypot(
        Math.max(rect.left - x, 0, x - rect.right),
        Math.max(rect.top - y, 0, y - rect.bottom),
      );
      if (distance < nearestDistance) {
        nearest = { index, rect };
        nearestDistance = distance;
      }
    }
    index++;
  }
  return nearest;
}

/** What a pinch does, for `listenToPinch()`. */
export type PinchHandlers = {
  /** Two fingers touch. False if no pinch starts, e.g. no page under them. */
  start: (fingers: Fingers) => boolean;
  move: (fingers: Fingers) => void;
  /**
   * Other fingers during the pinch, e.g. a third finger, then one of the
   * first two lifts: the pinch goes on from what shows, so it does not jump.
   */
  changeFingers: (fingers: Fingers) => void;
  /** The fingers lift, or the browser cancels the touch. */
  end: () => void;
};

/**
 * The touch events of a pinch with two fingers in `box`, for the viewers of
 * the files: not the zoom of the browser. Returns the function that removes
 * the listeners.
 */
export function listenToPinch(box: HTMLElement, handlers: PinchHandlers): () => void {
  let active = false;

  function changeFingers(touches: TouchList) {
    const fingers = twoFingers(touches);
    if (fingers.distance !== 0) handlers.changeFingers(fingers);
  }

  function onTouchStart(event: TouchEvent) {
    if (active && event.touches.length > 2) return changeFingers(event.touches);
    if (event.touches.length !== 2) return;
    const fingers = twoFingers(event.touches);
    if (fingers.distance === 0) return;
    active = handlers.start(fingers);
    // Not the zoom of the browser. Without a pinch of the viewer, e.g. on a score, the browser zooms.
    if (active) event.preventDefault();
  }

  function onTouchMove(event: TouchEvent) {
    if (!active) return;
    event.preventDefault();
    if (event.touches.length >= 2) handlers.move(twoFingers(event.touches));
  }

  function onTouchEnd(event: TouchEvent) {
    if (!active) return;
    if (event.touches.length >= 2) return changeFingers(event.touches);
    active = false;
    handlers.end();
  }

  const options = { passive: false };
  box.addEventListener("touchstart", onTouchStart, options);
  box.addEventListener("touchmove", onTouchMove, options);
  box.addEventListener("touchend", onTouchEnd);
  box.addEventListener("touchcancel", onTouchEnd);
  return () => {
    box.removeEventListener("touchstart", onTouchStart);
    box.removeEventListener("touchmove", onTouchMove);
    box.removeEventListener("touchend", onTouchEnd);
    box.removeEventListener("touchcancel", onTouchEnd);
  };
}

/** The next step of `steps` (in order) below or above `zoom`, for the zoom buttons. Undefined at the end. */
export function zoomStep(
  steps: readonly number[],
  zoom: number,
  direction: -1 | 1,
): number | undefined {
  return direction < 0
    ? steps.findLast((step) => step < zoom - 0.005)
    : steps.find((step) => step > zoom + 0.005);
}

/**
 * The pinch zoom of a viewer between `min` and `max`. `element` scrolls
 * sideways. `onZoom` gets the new zoom at the end of a pinch.
 */
export function usePinchZoom(
  element: HTMLElement | null,
  {
    zoom,
    min,
    max,
    onZoom,
  }: {
    zoom: number;
    min: number;
    max: number;
    onZoom: (zoom: number) => void;
  },
) {
  // The latest values for the listeners.
  const latest = useRef({ zoom, min, max, onZoom });
  useLayoutEffect(() => {
    latest.current = { zoom, min, max, onZoom };
  });
  // After a pinch, until the new zoom shows: the list of the pages, the page
  // under the fingers, the point in it (0 to 1) and the point of the screen where it goes.
  const anchor = useRef<{
    content: HTMLElement;
    page: number;
    x: number;
    y: number;
    clientX: number;
    clientY: number;
  } | null>(null);

  // The new zoom shows: the pages lose the scale of the pinch, and the point stays under the fingers.
  useLayoutEffect(() => {
    const target = anchor.current;
    if (!element || !target) return;
    anchor.current = null;
    target.content.style.transform = "";
    const page = target.content.children[target.page];
    if (!page) return;
    const rect = page.getBoundingClientRect();
    element.scrollBy(rect.left + target.x * rect.width - target.clientX, 0);
    window.scrollBy(0, rect.top + target.y * rect.height - target.clientY);
  }, [element, zoom]);

  useEffect(() => {
    if (!element) return;
    const box = element;

    let pinch: {
      content: HTMLElement;
      start: Fingers;
      zoom: number;
      last: Fingers;
      factor: number;
    } | null = null;

    const stopPinch = listenToPinch(box, {
      start(fingers) {
        const content = box.querySelector<HTMLElement>("[data-zoom-content]");
        if (!content) return false;
        const rect = content.getBoundingClientRect();
        content.style.transformOrigin = `${fingers.x - rect.left}px ${fingers.y - rect.top}px`;
        pinch = { content, start: fingers, zoom: latest.current.zoom, last: fingers, factor: 1 };
        return true;
      },
      move(fingers) {
        if (!pinch) return;
        const { min, max } = latest.current;
        const zoom = Math.min(
          Math.max((pinch.zoom * fingers.distance) / pinch.start.distance, min),
          max,
        );
        pinch.factor = zoom / pinch.zoom;
        pinch.last = fingers;
        pinch.content.style.transform = `translate(${fingers.x - pinch.start.x}px, ${fingers.y - pinch.start.y}px) scale(${pinch.factor})`;
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
      end() {
        if (!pinch) return;
        const { content, last, zoom: startZoom, factor } = pinch;
        pinch = null;
        const zoom = Math.round(startZoom * factor * 100) / 100;
        if (zoom === latest.current.zoom) {
          content.style.transform = "";
          return;
        }
        // The page nearest to the fingers. The boxes include the scale of the pinch: they are what shows.
        const nearest = nearestPage(content.children, last.x, last.y);
        if (!nearest) {
          content.style.transform = "";
        } else {
          const { rect } = nearest;
          anchor.current = {
            content,
            page: nearest.index,
            x: (last.x - rect.left) / rect.width,
            y: (last.y - rect.top) / rect.height,
            clientX: last.x,
            clientY: last.y,
          };
        }
        latest.current.onZoom(zoom);
      },
    });

    // Safari on an iPhone or an iPad: not the zoom of the browser. The touch events zoom.
    function onGesture(event: Event) {
      event.preventDefault();
    }

    const active = { passive: false };
    box.addEventListener("gesturestart", onGesture, active);
    box.addEventListener("gesturechange", onGesture, active);
    return () => {
      stopPinch();
      box.removeEventListener("gesturestart", onGesture);
      box.removeEventListener("gesturechange", onGesture);
      if (pinch) pinch.content.style.transform = "";
    };
  }, [element]);
}
