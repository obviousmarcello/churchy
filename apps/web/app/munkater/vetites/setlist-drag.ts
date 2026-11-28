"use client";

import { useEffect, useRef, useState } from "react";

// Reorder the setlist of the controller: drag an item by its handle, or focus
// the handle and use the arrow keys; Escape cancels a drag. The setlist is a
// row on narrow screens and a column on wide ones, so the drag follows the
// direction of the list. Near an end of the list it scrolls.

const SCROLL_EDGE_PX = 40;
const MAX_SCROLL_PX_PER_FRAME = 14;
/** After the last arrow key, the new order goes to `onDrop`: one save for a few moves. */
const KEY_MOVE_DELAY_MS = 800;

export function useSetlistDrag({
  listRef,
  keys,
  onMove,
  onDrop,
}: {
  /** The list: one child with `data-setlist-item` for each key, e.g. between the headers of the blocks. */
  listRef: React.RefObject<HTMLOListElement | null>;
  /** The keys of the items, in the order on the screen. */
  keys: string[];
  /** A new order while the drag runs. */
  onMove: (keys: string[]) => void;
  /** The order at the end of the drag, or null when the drag was cancelled. `key`: the item that moved. */
  onDrop: (keys: string[] | null, key: string) => void;
}) {
  const [dragKey, setDragKey] = useState<string | null>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const keyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // The listeners go on the window, not on the handle: reordering moves the
  // item in the DOM, and the handle would lose the pointer capture.
  useEffect(() => {
    const list = listRef.current;
    if (dragKey === null || !list) return;
    const key = dragKey;
    const axis = getComputedStyle(list).flexDirection.startsWith("row") ? "x" : "y";
    const scroller = scrollParent(list, axis);

    function reorder() {
      const index = keys.indexOf(key);
      if (index === -1 || !list) return;
      const at = axis === "x" ? pointer.current.x : pointer.current.y;
      // The new index is the number of other items with their middle before the pointer.
      let target = 0;
      Array.from(list.querySelectorAll(":scope > [data-setlist-item]")).forEach((child, i) => {
        if (i === index) return;
        const box = child.getBoundingClientRect();
        if (at > (axis === "x" ? box.left + box.width / 2 : box.top + box.height / 2)) target++;
      });
      if (target !== index) onMove(moved(keys, index, target));
    }

    // Near an end of the list, scroll it on each frame, also when the pointer
    // stays still. The items move under the pointer, so reorder again.
    let frame = requestAnimationFrame(function scroll() {
      if (scroller) {
        const box = scroller.getBoundingClientRect();
        const [at, start, end] =
          axis === "x"
            ? [pointer.current.x, box.left, box.right]
            : [pointer.current.y, box.top, box.bottom];
        const depth =
          at < start + SCROLL_EDGE_PX
            ? at - start - SCROLL_EDGE_PX
            : at > end - SCROLL_EDGE_PX
              ? at - end + SCROLL_EDGE_PX
              : 0;
        if (depth !== 0) {
          const speed = Math.ceil(
            Math.min(Math.abs(depth) / SCROLL_EDGE_PX, 1) * MAX_SCROLL_PX_PER_FRAME,
          );
          scroller.scrollBy(
            axis === "x" ? Math.sign(depth) * speed : 0,
            axis === "y" ? Math.sign(depth) * speed : 0,
          );
          reorder();
        }
      }
      frame = requestAnimationFrame(scroll);
    });

    function onPointerMove(event: PointerEvent) {
      pointer.current = { x: event.clientX, y: event.clientY };
      reorder();
    }
    function onPointerUp() {
      setDragKey(null);
      onDrop(keys, key);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setDragKey(null);
      onDrop(null, key);
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [dragKey, keys, listRef, onMove, onDrop]);

  useEffect(() => () => clearTimeout(keyTimer.current), []);

  return {
    /** The key of the item that the pointer drags, or null. */
    dragKey,
    start(key: string, event: React.PointerEvent) {
      clearTimeout(keyTimer.current);
      pointer.current = { x: event.clientX, y: event.clientY };
      setDragKey(key);
    },
    /** One place back (-1) or on (1), e.g. by an arrow key on the handle. */
    move(key: string, offset: -1 | 1) {
      const index = keys.indexOf(key);
      const target = index + offset;
      if (index === -1 || target < 0 || target >= keys.length) return;
      const next = moved(keys, index, target);
      onMove(next);
      // React moves the item in the DOM, and the handle loses the focus.
      requestAnimationFrame(() => focusDragHandle(listRef.current, key));
      clearTimeout(keyTimer.current);
      keyTimer.current = setTimeout(() => onDrop(next, key), KEY_MOVE_DELAY_MS);
    },
  };
}

/** Focuses the handle of the item of `key` in the list, e.g. after its key changed. */
export function focusDragHandle(list: HTMLElement | null, key: string) {
  list?.querySelector<HTMLElement>(`[data-drag-handle="${CSS.escape(key)}"]`)?.focus();
}

function moved(keys: string[], from: number, to: number): string[] {
  const next = [...keys];
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
}

/** The element that scrolls the list in the direction of `axis`: the list itself, or one around it. */
function scrollParent(element: HTMLElement, axis: "x" | "y"): HTMLElement | null {
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    const style = getComputedStyle(current);
    const overflow = axis === "x" ? style.overflowX : style.overflowY;
    const scrolls =
      axis === "x"
        ? current.scrollWidth > current.clientWidth
        : current.scrollHeight > current.clientHeight;
    if ((overflow === "auto" || overflow === "scroll") && scrolls) return current;
  }
  return null;
}
