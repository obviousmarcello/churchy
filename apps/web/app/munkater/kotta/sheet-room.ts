"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useState } from "react";

// The pages of a score, a PDF file or an image on the sheet. Each one fits a
// page of the sheet, so the sheet turns its pages as for the chords.

/** The room for each page, in CSS pixels. */
export type SheetRoom = { width: number; height: number };

/**
 * The room for each page: the width of a sheet page, and its height under the
 * song's title. When the title and the details fill most of the sheet page,
 * the full height: the pages then start on the next sheet page. `marker` is an empty element at the top of the pages, in the
 * `<article>` of the song: in the first column, also when the pages fill
 * several. Null until the first measure.
 */
export function useSheetRoom(marker: HTMLElement | null): SheetRoom | null {
  const [room, setRoom] = useState<SheetRoom | null>(null);

  useLayoutEffect(() => {
    const group = marker?.closest("[data-sheet-group]");
    const article = marker?.closest("article");
    if (!marker || !group || !article) return;

    function measure() {
      if (!marker || !group || !article) return;
      const top = marker.getBoundingClientRect().top - article.getBoundingClientRect().top;
      // In steps of 8 px, so a small change does not draw the pages again.
      const width = Math.floor(article.clientWidth / 8) * 8;
      // E.g. a phone in landscape with a large text: the room under the title is too small for a page.
      const below = group.clientHeight - top;
      const height =
        Math.floor((below >= group.clientHeight / 3 ? below : group.clientHeight) / 8) * 8;
      setRoom((current) =>
        current?.width === width && current.height === height ? current : { width, height },
      );
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(group);
    // The title and the details above the pages: they grow with the text size, or when a line wraps.
    for (
      let above = marker.parentElement?.previousElementSibling;
      above;
      above = above.previousElementSibling
    ) {
      observer.observe(above);
    }
    return () => observer.disconnect();
  }, [marker]);

  return room;
}

/** The largest size of a page of this size that fits the room. */
export function fitPage(page: SheetRoom, room: SheetRoom): SheetRoom {
  const scale = Math.min(room.width / page.width, room.height / page.height);
  return {
    width: Math.max(1, Math.floor(page.width * scale)),
    height: Math.max(1, Math.floor(page.height * scale)),
  };
}

/** The part of the sheet that shows: its pages move sideways in it. */
export const SheetScreenContext = createContext<HTMLElement | null>(null);

/**
 * True when the element is on the screen of the sheet, or on the screen
 * before or after it. A PDF page or an image uses memory only then.
 */
export function useNearScreen(element: HTMLElement | null): boolean {
  const screen = useContext(SheetScreenContext);
  const [near, setNear] = useState(false);

  useEffect(() => {
    if (!element || !screen) return;
    // The screen clips the pages, so the margin is on the screen: one screen at each side.
    const observer = new IntersectionObserver(([entry]) => setNear(entry!.isIntersecting), {
      root: screen,
      rootMargin: "0px 100%",
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element, screen]);

  return near;
}
